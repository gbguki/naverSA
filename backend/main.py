import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from . import rules_store
from .auth import current_user, router as auth_router
from .credentials import get_active_client, router as credentials_router
from .db import init_db
from .naver_api import NaverAdsClient
from .reports import aggregate, get_purchase_rows
from .rules import recommend_bid, recommend_keyword_bid

app = FastAPI(title="GB_NAVER_SA")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth_router)
app.include_router(credentials_router)


def active_client(user=Depends(current_user)) -> NaverAdsClient:
    return get_active_client(user)


# ---------- 캐시 (user+customer scoped) ----------

CACHE_TTL = 300  # 5분
_cache: dict[str, tuple[float, object]] = {}


def _ck(client: NaverAdsClient, suffix: str) -> str:
    return f"{client.customer_id}:{suffix}"


def cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    return None


def cache_set(key: str, val):
    _cache[key] = (time.time(), val)


def cache_invalidate_customer(customer_id: str, suffix_prefix: str = ""):
    prefix = f"{customer_id}:{suffix_prefix}"
    for k in list(_cache.keys()):
        if k.startswith(prefix):
            del _cache[k]


@app.get("/health")
def health():
    return {"ok": True}


# ---------- Campaigns / Adgroups ----------

@app.get("/campaigns")
def campaigns(client: NaverAdsClient = Depends(active_client)):
    data = client.get("/ncc/campaigns")
    return [
        {
            "id": c["nccCampaignId"],
            "name": c["name"],
            "campaignTp": c.get("campaignTp"),
            "dailyBudget": c.get("dailyBudget"),
            "userLock": c.get("userLock"),
            "status": c.get("status"),
        }
        for c in data
    ]


@app.get("/campaigns/{campaign_id}/adgroups")
def adgroups(campaign_id: str, client: NaverAdsClient = Depends(active_client)):
    data = client.get("/ncc/adgroups", params={"nccCampaignId": campaign_id})
    return [
        {
            "id": g["nccAdgroupId"],
            "name": g["name"],
            "bidAmt": g.get("bidAmt"),
            "userLock": g.get("userLock"),
        }
        for g in data
    ]


# ---------- Stats helpers ----------

def _fetch_stat(client: NaverAdsClient, gid: str, fields: str, time_range: str) -> dict:
    try:
        r = client.get("/stats", params={"ids": gid, "fields": fields, "timeRange": time_range})
        return r["data"][0] if r.get("data") else {}
    except Exception:
        return {}


def _stats_parallel(client: NaverAdsClient, ids: list[str], fields: str, time_range: str) -> dict:
    if not ids:
        return {}
    with ThreadPoolExecutor(max_workers=min(8, len(ids))) as ex:
        results = list(ex.map(lambda gid: (gid, _fetch_stat(client, gid, fields, time_range)), ids))
    return dict(results)


def _stats_for(client: NaverAdsClient, ids: list[str], days: int, with_rank: bool = False) -> dict:
    end = date.today()
    start = end - timedelta(days=days)
    fields = '["impCnt","clkCnt","salesAmt","convAmt","ccnt"]' if not with_rank \
        else '["impCnt","clkCnt","salesAmt","convAmt","ccnt","avgRnk"]'
    tr = json.dumps({"since": str(start), "until": str(end)})
    return _stats_parallel(client, ids, fields, tr)


def _stats_range(client: NaverAdsClient, ids: list[str], since: date, until: date) -> dict:
    fields = '["impCnt","clkCnt","salesAmt","convAmt","ccnt"]'
    tr = json.dumps({"since": str(since), "until": str(until)})
    return _stats_parallel(client, ids, fields, tr)


# ---------- Rule resolution ----------

def _resolve_rule_for_adgroup(client: NaverAdsClient, kind: str, adgroup_id: str) -> dict:
    try:
        ag = client.get(f"/ncc/adgroups/{adgroup_id}")
        campaign_id = ag.get("nccCampaignId", "")
        camp = client.get(f"/ncc/campaigns/{campaign_id}") if campaign_id else {}
        tp = camp.get("campaignTp", "")
    except Exception:
        campaign_id, tp = "", ""
    rule = rules_store.resolve(kind, campaign_id=campaign_id, campaign_tp=tp)
    return rule.get("params", {}) if rule else {}


def _resolve_rule_for_campaign(client: NaverAdsClient, kind: str, campaign_id: str) -> dict:
    try:
        camp = client.get(f"/ncc/campaigns/{campaign_id}")
        tp = camp.get("campaignTp", "")
    except Exception:
        tp = ""
    rule = rules_store.resolve(kind, campaign_id=campaign_id, campaign_tp=tp)
    return rule.get("params", {}) if rule else {}


# ---------- Recommendations ----------

@app.get("/recommendations/keywords")
def recommendations_keywords(adgroup_id: str, client: NaverAdsClient = Depends(active_client)):
    key = _ck(client, f"kws:{adgroup_id}")
    cached = cache_get(key)
    if cached is not None:
        return cached
    params = _resolve_rule_for_adgroup(client, "keyword", adgroup_id)
    kws = client.get("/ncc/keywords", params={"nccAdgroupId": adgroup_id})
    active = [k for k in kws if not k.get("userLock")]
    if not active:
        return []
    ids = [k["nccKeywordId"] for k in active]
    stats30 = _stats_for(client, ids, 30, with_rank=True)
    out = []
    for k in active:
        kid = k["nccKeywordId"]
        s = stats30.get(kid, {})
        imp = int(s.get("impCnt", 0))
        clk = int(s.get("clkCnt", 0))
        sales = int(s.get("salesAmt", 0))
        conv = int(s.get("convAmt", 0))
        rnk = float(s.get("avgRnk", 0) or 0)
        cur = int(k.get("bidAmt") or 0)
        rec, reason = recommend_keyword_bid(
            current_bid=cur, imp30=imp, clk30=clk,
            sales30=sales, conv30=conv, avgRnk30=rnk, params=params,
        )
        out.append({
            "nccKeywordId": kid,
            "keyword": k["keyword"],
            "currentBid": cur,
            "recommendedBid": rec,
            "reason": reason,
            "imp30": imp,
            "clk30": clk,
            "ctr30": round((clk / imp * 100) if imp else 0.0, 2),
            "sales30": sales,
            "convAmt30": conv,
            "roas30": round((conv / sales * 100) if sales else 0.0, 1),
            "avgRnk30": rnk,
        })
    cache_set(key, out)
    return out


class KwApply(BaseModel):
    nccKeywordId: str
    bidAmt: int


class ApplyKeywordsRequest(BaseModel):
    items: list[KwApply]
    dryRun: bool = True


@app.post("/apply/keywords")
def apply_keywords(req: ApplyKeywordsRequest, client: NaverAdsClient = Depends(active_client)):
    if not req.dryRun:
        cache_invalidate_customer(client.customer_id, "kws:")
    results = []
    for item in req.items:
        if item.bidAmt < 70 or item.bidAmt % 10 != 0:
            results.append({"nccKeywordId": item.nccKeywordId, "ok": False,
                            "error": "bid must be ≥70 and multiple of 10"})
            continue
        if req.dryRun:
            results.append({"nccKeywordId": item.nccKeywordId, "ok": True,
                            "bidAmt": item.bidAmt, "dryRun": True})
            continue
        try:
            uri = f"/ncc/keywords/{item.nccKeywordId}"
            current = client.get(uri)
            body = {**current, "bidAmt": item.bidAmt, "useGroupBidAmt": False}
            client.put(uri, body, params={"fields": "bidAmt"})
            results.append({"nccKeywordId": item.nccKeywordId, "ok": True,
                            "bidAmt": item.bidAmt})
        except Exception as e:
            results.append({"nccKeywordId": item.nccKeywordId, "ok": False,
                            "error": str(e)[:200]})
    return {"results": results}


@app.get("/recommendations/bids")
def recommendations_bids(campaign_id: str, client: NaverAdsClient = Depends(active_client)):
    key = _ck(client, f"bids:{campaign_id}")
    cached = cache_get(key)
    if cached is not None:
        return cached
    params = _resolve_rule_for_campaign(client, "bid", campaign_id)
    groups = client.get("/ncc/adgroups", params={"nccCampaignId": campaign_id})
    if not groups:
        return []
    ids = [g["nccAdgroupId"] for g in groups]
    stats7 = _stats_for(client, ids, 7)
    stats30 = _stats_for(client, ids, 30)

    out = []
    for g in groups:
        gid = g["nccAdgroupId"]
        s7 = stats7.get(gid, {})
        s30 = stats30.get(gid, {})
        clk = int(s7.get("clkCnt", 0))
        sales = int(s7.get("salesAmt", 0))
        conv = int(s7.get("convAmt", 0))
        roas = (conv / sales * 100) if sales else 0.0
        cur = int(g.get("bidAmt") or 0)
        rec, reason = recommend_bid(current_bid=cur, roas7=roas, clicks7=clk, params=params)
        out.append({
            "nccAdgroupId": gid,
            "name": g["name"],
            "currentBid": cur,
            "recommendedBid": rec,
            "reason": reason,
            "roas7": round(roas, 1),
            "clicks7": clk,
            "sales7": sales,
            "convAmt7": conv,
            "sales30": int(s30.get("salesAmt", 0)),
            "convAmt30": int(s30.get("convAmt", 0)),
            "clicks30": int(s30.get("clkCnt", 0)),
        })
    cache_set(key, out)
    return out


@app.get("/campaigns/{campaign_id}/recommendation-summary")
def recommendation_summary(campaign_id: str, client: NaverAdsClient = Depends(active_client)):
    bid_recs = recommendations_bids(campaign_id, client=client)
    bid_change = sum(
        1 for r in bid_recs
        if r["recommendedBid"] is not None and r["recommendedBid"] != r["currentBid"]
    )
    kw_change = 0
    kw_total = 0
    for g in bid_recs:
        try:
            recs = recommendations_keywords(g["nccAdgroupId"], client=client)
        except Exception:
            continue
        kw_total += len(recs)
        kw_change += sum(
            1 for k in recs
            if k["recommendedBid"] is not None and k["recommendedBid"] != k["currentBid"]
        )
    return {
        "adgroupTotal": len(bid_recs),
        "adgroupChanges": bid_change,
        "keywordTotal": kw_total,
        "keywordChanges": kw_change,
    }


# ---------- Dashboard ----------

# (customer_id, endpoint, param_key) -> (fetched_ts, payload)
_dash_cache: dict[tuple[str, str, str], tuple[float, list]] = {}
DASH_TTL_TODAY = 60
DASH_TTL_PAST = 60 * 30


def _dash_ttl(until_date: date) -> int:
    return DASH_TTL_TODAY if until_date >= date.today() else DASH_TTL_PAST


def _dash_cache_get(customer_id: str, endpoint: str, param_key: str, until_date: date) -> list | None:
    hit = _dash_cache.get((customer_id, endpoint, param_key))
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > _dash_ttl(until_date):
        return None
    return payload


def _dash_cache_set(customer_id: str, endpoint: str, param_key: str, payload: list) -> None:
    _dash_cache[(customer_id, endpoint, param_key)] = (time.time(), payload)


def _parse_period(since: str, until: str) -> tuple[date, date]:
    try:
        s = date.fromisoformat(since)
        u = date.fromisoformat(until)
    except ValueError:
        raise HTTPException(400, "since/until must be YYYY-MM-DD")
    if s > u:
        raise HTTPException(400, "since > until")
    if (u - s).days > 92:
        raise HTTPException(400, "period too long (max 93 days)")
    return s, u


def _merge_row(name: str, id_: str, s: dict, purchase: dict) -> dict:
    imp = int(s.get("impCnt", 0))
    clk = int(s.get("clkCnt", 0))
    cost = int(s.get("salesAmt", 0))
    total_conv_cnt = int(s.get("ccnt", 0))
    total_conv_amt = int(s.get("convAmt", 0))
    p_cnt = int(purchase.get("cnt", 0))
    p_amt = int(purchase.get("amt", 0))
    return {
        "id": id_, "name": name,
        "impCnt": imp, "clkCnt": clk,
        "ctr": round((clk / imp * 100) if imp else 0.0, 2),
        "cost": cost,
        "cpc": round((cost / clk) if clk else 0.0, 0),
        "purchaseCnt": p_cnt,
        "purchaseCvr": round((p_cnt / clk * 100) if clk else 0.0, 2),
        "purchaseAmt": p_amt,
        "purchaseRoas": round((p_amt / cost * 100) if cost else 0.0, 2),
        "totalConvCnt": total_conv_cnt,
        "totalConvAmt": total_conv_amt,
        "totalRoas": round((total_conv_amt / cost * 100) if cost else 0.0, 2),
    }


@app.get("/dashboard/campaigns")
def dashboard_campaigns(since: str, until: str, client: NaverAdsClient = Depends(active_client)):
    s, u = _parse_period(since, until)
    pk = f"{since}:{until}"
    cached = _dash_cache_get(client.customer_id, "campaigns", pk, u)
    if cached is not None:
        return cached

    campaigns_data = client.get("/ncc/campaigns")
    active = [c for c in campaigns_data if not c.get("userLock")]
    ids = [c["nccCampaignId"] for c in active]
    if not ids:
        _dash_cache_set(client.customer_id, "campaigns", pk, [])
        return []
    stats = _stats_range(client, ids, s, u)
    purchase_rows = get_purchase_rows(client, s, u)
    p_agg = aggregate(purchase_rows, "campaign")
    out = [
        _merge_row(c["name"], c["nccCampaignId"], stats.get(c["nccCampaignId"], {}),
                   p_agg.get(c["nccCampaignId"], {"cnt": 0, "amt": 0}))
        for c in active
    ]
    _dash_cache_set(client.customer_id, "campaigns", pk, out)
    return out


@app.get("/dashboard/adgroups")
def dashboard_adgroups(campaign_id: str, since: str, until: str, client: NaverAdsClient = Depends(active_client)):
    s, u = _parse_period(since, until)
    pk = f"{campaign_id}:{since}:{until}"
    cached = _dash_cache_get(client.customer_id, "adgroups", pk, u)
    if cached is not None:
        return cached

    groups = client.get("/ncc/adgroups", params={"nccCampaignId": campaign_id})
    ids = [g["nccAdgroupId"] for g in groups]
    if not ids:
        _dash_cache_set(client.customer_id, "adgroups", pk, [])
        return []
    stats = _stats_range(client, ids, s, u)
    purchase_rows = get_purchase_rows(client, s, u)
    filtered = [r for r in purchase_rows if r["campaignId"] == campaign_id]
    p_agg = aggregate(filtered, "adgroup")
    out = [
        _merge_row(g["name"], g["nccAdgroupId"], stats.get(g["nccAdgroupId"], {}),
                   p_agg.get(g["nccAdgroupId"], {"cnt": 0, "amt": 0}))
        for g in groups
    ]
    _dash_cache_set(client.customer_id, "adgroups", pk, out)
    return out


@app.get("/dashboard/keywords")
def dashboard_keywords(adgroup_id: str, since: str, until: str, client: NaverAdsClient = Depends(active_client)):
    s, u = _parse_period(since, until)
    pk = f"{adgroup_id}:{since}:{until}"
    cached = _dash_cache_get(client.customer_id, "keywords", pk, u)
    if cached is not None:
        return cached

    kws = client.get("/ncc/keywords", params={"nccAdgroupId": adgroup_id})
    ids = [k["nccKeywordId"] for k in kws]
    if not ids:
        _dash_cache_set(client.customer_id, "keywords", pk, [])
        return []
    stats = _stats_range(client, ids, s, u)
    purchase_rows = get_purchase_rows(client, s, u)
    filtered = [r for r in purchase_rows if r["adgroupId"] == adgroup_id]
    p_agg = aggregate(filtered, "keyword")
    out = [
        _merge_row(k["keyword"], k["nccKeywordId"], stats.get(k["nccKeywordId"], {}),
                   p_agg.get(k["nccKeywordId"], {"cnt": 0, "amt": 0}))
        for k in kws
    ]
    _dash_cache_set(client.customer_id, "keywords", pk, out)
    return out


# ---------- Apply bids ----------

class BidApply(BaseModel):
    nccAdgroupId: str
    bidAmt: int


class ApplyBidsRequest(BaseModel):
    items: list[BidApply]
    dryRun: bool = True


@app.post("/apply/bids")
def apply_bids(req: ApplyBidsRequest, client: NaverAdsClient = Depends(active_client)):
    if not req.dryRun:
        cache_invalidate_customer(client.customer_id, "bids:")
    results = []
    for item in req.items:
        if item.bidAmt < 70:
            results.append({"nccAdgroupId": item.nccAdgroupId, "ok": False, "error": "bid < 70"})
            continue
        if item.bidAmt % 10 != 0:
            results.append({"nccAdgroupId": item.nccAdgroupId, "ok": False, "error": "bid must be multiple of 10"})
            continue
        if req.dryRun:
            results.append({"nccAdgroupId": item.nccAdgroupId, "ok": True, "bidAmt": item.bidAmt, "dryRun": True})
            continue
        try:
            uri = f"/ncc/adgroups/{item.nccAdgroupId}"
            current = client.get(uri)
            body = {**current, "bidAmt": item.bidAmt}
            client.put(uri, body, params={"fields": "bidAmt"})
            results.append({"nccAdgroupId": item.nccAdgroupId, "ok": True, "bidAmt": item.bidAmt})
        except Exception as e:
            results.append({"nccAdgroupId": item.nccAdgroupId, "ok": False, "error": str(e)[:200]})
    return {"results": results}


# ---------- Rules (전역, 유저별 구분 없음. 조직 운영 규칙) ----------

@app.get("/rules")
def rules_list(user=Depends(current_user)):
    return rules_store.load()


class SaveRulesRequest(BaseModel):
    bid: list[dict]
    keyword: list[dict]


@app.put("/rules")
def rules_save(req: SaveRulesRequest, user=Depends(current_user)):
    store = {"bid": req.bid, "keyword": req.keyword}
    rules_store.save(store)
    _cache.clear()
    return {"ok": True}
