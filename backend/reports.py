"""AD_CONVERSION StatReport 기반 구매완료 전환 집계.

/stats의 convAmt는 장바구니 매출이 포함돼서, 구매완료만 분리하려면
일자별 AD_CONVERSION 리포트를 받아 goalTp=purchase 행만 합산해야 함.
"""
import base64
import hashlib
import hmac
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from urllib.parse import urlparse

import requests

from .naver_api import NaverAdsClient

REPORT_TP = "AD_CONVERSION"
POLL_INTERVAL = 2.0
POLL_MAX = 30
TTL_PAST = 60 * 60 * 24   # 확정일: 24시간
TTL_TODAY = 60 * 5        # 오늘: 5분

# (customer_id, date_iso) -> (fetched_ts, rows)
# rows: list of dicts with keys: campaignId, adgroupId, keywordId, adId, goalTp, cnt, amt
_date_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}


def _ttl_for(d: date) -> int:
    return TTL_TODAY if d >= date.today() else TTL_PAST


def _cache_get(customer_id: str, d: date) -> list[dict] | None:
    hit = _date_cache.get((customer_id, d.isoformat()))
    if not hit:
        return None
    ts, rows = hit
    if time.time() - ts > _ttl_for(d):
        return None
    return rows


def _cache_set(customer_id: str, d: date, rows: list[dict]) -> None:
    _date_cache[(customer_id, d.isoformat())] = (time.time(), rows)


def _download_report(client: NaverAdsClient, download_url: str) -> str:
    parsed = urlparse(download_url)
    uri = parsed.path  # path만, 쿼리 제외
    ts = str(int(time.time() * 1000))
    msg = f"{ts}.GET.{uri}"
    sig = base64.b64encode(
        hmac.new(client.secret_key.encode(), msg.encode(), hashlib.sha256).digest()
    ).decode()
    headers = {
        "X-Timestamp": ts,
        "X-API-KEY": client.api_key,
        "X-Customer": client.customer_id,
        "X-Signature": sig,
    }
    r = requests.get(download_url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text


def _fetch_one_date(client: NaverAdsClient, d: date) -> list[dict]:
    stat_dt = f"{d.isoformat()}T00:00:00.000Z"
    job = client.post("/stat-reports", {"reportTp": REPORT_TP, "statDt": stat_dt})
    job_id = job.get("reportJobId") or job.get("id")
    status = job.get("status")

    # 폴링
    info = job
    for _ in range(POLL_MAX):
        if status in ("BUILT", "DONE", "NONE"):
            break
        if status in ("FAILED", "REGIST_ERROR"):
            raise RuntimeError(f"report failed for {d}: {info}")
        time.sleep(POLL_INTERVAL)
        info = client.get(f"/stat-reports/{job_id}")
        status = info.get("status")

    if status == "NONE":
        return []
    if status not in ("BUILT", "DONE"):
        raise RuntimeError(f"report timeout for {d}: status={status}")

    download_url = info.get("downloadUrl")
    if not download_url:
        return []
    text = _download_report(client, download_url)

    rows = []
    for ln in text.strip().split("\n"):
        if not ln:
            continue
        cols = ln.split("\t")
        if len(cols) < 13:
            continue
        try:
            amt = float(cols[-1]) if cols[-1] else 0.0
            cnt = float(cols[-2]) if cols[-2] else 0.0
        except ValueError:
            continue
        rows.append({
            "campaignId": cols[2],
            "adgroupId": cols[3],
            "keywordId": cols[4],  # "-" 가능
            "adId": cols[5],
            "goalTp": cols[-3],
            "cnt": cnt,
            "amt": amt,
        })
    return rows


def get_purchase_rows(client: NaverAdsClient, since: date, until: date) -> list[dict]:
    """since ~ until (inclusive) 기간의 구매완료 전환 행만 반환.

    customer_id로 캐시 분리 + 일자별 병렬 fetch.
    """
    cid = client.customer_id
    dates: list[date] = []
    d = since
    while d <= until:
        dates.append(d)
        d += timedelta(days=1)

    misses = [d for d in dates if _cache_get(cid, d) is None]
    if misses:
        with ThreadPoolExecutor(max_workers=min(8, len(misses))) as ex:
            futs = {ex.submit(_fetch_one_date, client, d): d for d in misses}
            for fut in as_completed(futs):
                d = futs[fut]
                try:
                    rows = fut.result()
                except Exception as e:
                    print(f"  [report fetch fail] {d}: {e}", flush=True)
                    rows = []
                _cache_set(cid, d, rows)

    result: list[dict] = []
    for d in dates:
        rows = _cache_get(cid, d) or []
        for r in rows:
            if r["goalTp"] == "purchase":
                result.append(r)
    return result


def aggregate(rows: list[dict], level: str) -> dict[str, dict]:
    """level: 'campaign' | 'adgroup' | 'keyword' — id -> {cnt, amt}.

    keyword 레벨에서는 keywordId가 '-'(확장검색/소재 기반)인 행은 제외.
    """
    key_field = {"campaign": "campaignId", "adgroup": "adgroupId", "keyword": "keywordId"}[level]
    out: dict[str, dict] = defaultdict(lambda: {"cnt": 0.0, "amt": 0.0})
    for r in rows:
        k = r[key_field]
        if level == "keyword" and (not k or k == "-"):
            continue
        out[k]["cnt"] += r["cnt"]
        out[k]["amt"] += r["amt"]
    return dict(out)
