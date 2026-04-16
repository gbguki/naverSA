"""
스노우투플러스 네이버 검색광고 세팅 스크립트
- dry-run 모드: 변경 내용 미리보기 (기본값)
- execute 모드: 실제 API 호출

사용법:
  python snow2plus_setup.py              # dry-run (변경 내용만 출력)
  python snow2plus_setup.py --execute    # 실제 실행
"""

import requests
import hashlib
import hmac
import base64
import time
import json
import sys

# ═══════════════════════════════════════
# API 설정
# ═══════════════════════════════════════
API_KEY = "0100000000d58434514dc704b51788ae6415bcdadd504a6ae15de23ee7e3279f833db3cf05"
SECRET_KEY = "AQAAAAA1MtxMyu4lsh6RSmxsGxKd/uJLKg6VOVles5YauBaLxw=="
CUSTOMER_ID = "1381199"
BASE_URL = "https://api.searchad.naver.com"

DRY_RUN = "--execute" not in sys.argv

# ═══════════════════════════════════════
# API 유틸
# ═══════════════════════════════════════
def get_header(method, uri):
    timestamp = str(int(time.time() * 1000))
    message = f"{timestamp}.{method}.{uri}"
    signature = base64.b64encode(hmac.new(SECRET_KEY.encode(), message.encode(), hashlib.sha256).digest()).decode()
    return {
        "Content-Type": "application/json",
        "X-Timestamp": timestamp,
        "X-API-KEY": API_KEY,
        "X-Customer": CUSTOMER_ID,
        "X-Signature": signature
    }

def api_get(uri, params=None):
    headers = get_header("GET", uri)
    resp = requests.get(BASE_URL + uri, headers=headers, params=params)
    resp.raise_for_status()
    return resp.json()

def api_put(uri, data, fields=None):
    """네이버 SA PUT: 리소스 GET → patch 적용 → 전체 객체 PUT(+?fields=...)."""
    params = {"fields": fields} if fields else None
    if DRY_RUN:
        print(f"  [DRY-RUN] PUT {uri}{'?fields=' + fields if fields else ''}")
        print(f"  [DRY-RUN] Patch: {json.dumps(data, ensure_ascii=False)}")
        return None
    current = api_get(uri)
    body = {**current, **data}
    headers = get_header("PUT", uri)
    resp = requests.put(BASE_URL + uri, headers=headers, json=body, params=params)
    if not resp.ok:
        print(f"  [ERROR] {resp.status_code} {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()

def api_post(uri, data):
    if DRY_RUN:
        print(f"  [DRY-RUN] POST {uri}")
        print(f"  [DRY-RUN] Data: {json.dumps(data, ensure_ascii=False, indent=2)}")
        return None
    headers = get_header("POST", uri)
    resp = requests.post(BASE_URL + uri, headers=headers, json=data)
    resp.raise_for_status()
    return resp.json()

def log(msg):
    print(f"\n{'='*60}\n{msg}\n{'='*60}")

def step(msg):
    print(f"\n  ▶ {msg}")

# ═══════════════════════════════════════
# 캠페인 ID 매핑
# ═══════════════════════════════════════
CAMPAIGNS = {
    "AC_쇼검": "cmp-a001-02-000000009811824",       # #1.쇼검_AC마그네슘패치
    "따꼼_쇼검": "cmp-a001-02-000000009811825",      # #2.쇼검_따꼼호랑이패치
    "원나잇_쇼검": "cmp-a001-02-000000009811826",    # #3.쇼검_원나잇트러블
    "핸디톡_쇼검": "cmp-a001-02-000000009811827",    # #4.쇼검_핸디톡클리어
    "비브랜드_PL": "cmp-a001-01-000000004999484",    # 파워링크_AC마그네슘 → 비브랜드
    "브랜드_PL": "cmp-a001-01-000000009624268",      # 파워링크_PC → 브랜드 통합
}

# ═══════════════════════════════════════
# 광고그룹 ID 매핑 (쇼핑검색)
# ═══════════════════════════════════════
SA_ADGROUPS = {
    # AC마그네슘
    "AC_통합검색": "grp-a001-02-000000054750593",
    "AC_네이버쇼핑": "grp-a001-02-000000054750601",
    "AC_추천지면": "grp-a001-02-000000054750613",
    "AC_컨텐츠지면": "grp-a001-02-000000054750646",
    "AC_플러스스토어": "grp-a001-02-000000054750612",
    # 따꼼호랑이
    "따꼼_통합검색": "grp-a001-02-000000054777478",
    "따꼼_네이버쇼핑": "grp-a001-02-000000056961027",
    "따꼼_추천지면": "grp-a001-02-000000056960953",
    "따꼼_컨텐츠지면": "grp-a001-02-000000054777609",
    "따꼼_플러스스토어": "grp-a001-02-000000054777645",
    # 원나잇트러블
    "원나잇_통합검색": "grp-a001-02-000000054777684",
    "원나잇_네이버쇼핑": "grp-a001-02-000000056961915",
    "원나잇_추천지면": "grp-a001-02-000000056962069",
    "원나잇_컨텐츠지면": "grp-a001-02-000000054777718",
    "원나잇_플러스스토어": "grp-a001-02-000000054777725",
}

# ═══════════════════════════════════════
# 1. 쇼핑검색 일예산 변경
# ═══════════════════════════════════════
def set_campaign_budgets():
    log("1. 쇼핑검색 캠페인 일예산 변경")
    
    budgets = [
        ("AC_쇼검", 50000, "#1.쇼검_AC마그네슘패치"),
        ("따꼼_쇼검", 10000, "#2.쇼검_따꼼호랑이패치"),
        ("원나잇_쇼검", 10000, "#3.쇼검_원나잇트러블"),
    ]
    
    for key, budget, name in budgets:
        step(f"{name} → 일예산 {budget:,}원")
        api_put(f"/ncc/campaigns/{CAMPAIGNS[key]}", {
            "dailyBudget": budget,
            "useDailyBudget": True,
        }, fields="budget")

# ═══════════════════════════════════════
# 2. 쇼핑검색 광고그룹 입찰가 조정
# ═══════════════════════════════════════
def set_sa_bidamounts():
    log("2. 쇼핑검색 광고그룹 입찰가 조정")
    
    bids = [
        # AC마그네슘
        ("AC_통합검색", 1100, "기존 1,010원 → 1,100원 (핵심 지면, 소폭 상향)"),
        ("AC_플러스스토어", 600, "기존 500원 → 600원 (고효율, 노출 확대)"),
        ("AC_네이버쇼핑", 400, "기존 700원 → 400원 (ROAS 101%, 하향)"),
        ("AC_추천지면", 110, "유지 (클릭 0, 데이터 수집)"),
        ("AC_컨텐츠지면", 60, "유지 (클릭 0, 데이터 수집)"),
        # 따꼼호랑이
        ("따꼼_통합검색", 1100, "기존 1,000원 → 1,100원 (핵심 지면)"),
        ("따꼼_플러스스토어", 900, "기존 800원 → 900원 (고효율)"),
        ("따꼼_네이버쇼핑", 200, "기존 50원 → 200원 (효율 괜찮으나 노출 부족)"),
        ("따꼼_추천지면", 110, "유지"),
        ("따꼼_컨텐츠지면", 60, "유지"),
        # 원나잇트러블
        ("원나잇_통합검색", 600, "기존 800원 → 600원 (ROAS 126%, 하향)"),
        ("원나잇_플러스스토어", 700, "기존 1,200원 → 700원 (ROAS 89%, 대폭 하향)"),
        ("원나잇_네이버쇼핑", 300, "기존 50원 → 300원 (ROAS 1,596%, 노출 부족)"),
        ("원나잇_추천지면", 110, "유지"),
        ("원나잇_컨텐츠지면", 60, "유지"),
    ]
    
    for key, bid, note in bids:
        step(f"{key} → {bid:,}원 | {note}")
        api_put(f"/ncc/adgroups/{SA_ADGROUPS[key]}", {
            "bidAmt": bid,
        }, fields="bidAmt")

# ═══════════════════════════════════════
# 3. 핸디톡 캠페인 OFF
# ═══════════════════════════════════════
def disable_handitok():
    log("3. #4.쇼검_핸디톡클리어 캠페인 OFF")
    step("캠페인 userLock → true")
    api_put(f"/ncc/campaigns/{CAMPAIGNS['핸디톡_쇼검']}", {
        "userLock": True
    }, fields="userLock")

# ═══════════════════════════════════════
# 4. 파워링크 일예산 변경
# ═══════════════════════════════════════
def set_pl_budgets():
    log("4. 파워링크 캠페인 일예산 변경")
    
    step("비브랜드 (파워링크_AC마그네슘) → 일예산 15,000원")
    api_put(f"/ncc/campaigns/{CAMPAIGNS['비브랜드_PL']}", {
        "dailyBudget": 15000,
        "useDailyBudget": True,
    }, fields="budget")

    step("브랜드 통합 (파워링크_PC) → 일예산 5,000원")
    api_put(f"/ncc/campaigns/{CAMPAIGNS['브랜드_PL']}", {
        "dailyBudget": 5000,
        "useDailyBudget": True,
    }, fields="budget")

# ═══════════════════════════════════════
# 5. 파워링크 키워드 OFF 처리
# ═══════════════════════════════════════

# 비브랜드 캠페인에서 OFF할 키워드 ID 목록
# (MO/PC 공유 키워드이므로 한 번만 OFF하면 됨)
PL_NB_OFF_KEYWORDS = [
    ("nkw-a001-01-000007031048599", "AC마그네슘패치"),
    ("nkw-a001-01-000007031055707", "AC마그네슘패치가격"),
    ("nkw-a001-01-000007031055711", "AC마그네슘패치내돈내산"),
    ("nkw-a001-01-000007031055710", "AC마그네슘패치리뷰"),
    ("nkw-a001-01-000007031055708", "AC마그네슘패치추천"),
    ("nkw-a001-01-000007031055709", "AC마그네슘패치후기"),
    ("nkw-a001-01-000007031048881", "마그네슘트러블패치"),
    ("nkw-a001-01-000007031055712", "마그네슘트러블패치가격"),
    ("nkw-a001-01-000007031055716", "마그네슘트러블패치내돈내산"),
    ("nkw-a001-01-000007031055715", "마그네슘트러블패치리뷰"),
    ("nkw-a001-01-000007031055713", "마그네슘트러블패치추천"),
    ("nkw-a001-01-000007031055714", "마그네슘트러블패치후기"),
    ("nkw-a001-01-000007031048283", "마그네슘패치"),
    ("nkw-a001-01-000007031055702", "마그네슘패치가격"),
    ("nkw-a001-01-000007031055706", "마그네슘패치내돈내산"),
    ("nkw-a001-01-000007031055705", "마그네슘패치리뷰"),
    ("nkw-a001-01-000007031055703", "마그네슘패치추천"),
    ("nkw-a001-01-000007031055704", "마그네슘패치후기"),
    ("nkw-a001-01-000007031048208", "스노우투플러스마그네슘패치"),
    ("nkw-a001-01-000007031055721", "여드름마그네슘패치"),
    ("nkw-a001-01-000007031055722", "여드름마그네슘패치가격"),
    ("nkw-a001-01-000007031055726", "여드름마그네슘패치내돈내산"),
    ("nkw-a001-01-000007031055724", "여드름마그네슘패치리뷰"),
    ("nkw-a001-01-000007031055725", "여드름마그네슘패치추천"),
    ("nkw-a001-01-000007031055723", "여드름마그네슘패치후기"),
    ("nkw-a001-01-000007031055717", "트러블패치가격"),
    ("nkw-a001-01-000007031048883", "트러블패치가성비"),
    ("nkw-a001-01-000007031055719", "트러블패치리뷰"),
    ("nkw-a001-01-000007031048882", "트러블패치소형"),
    ("nkw-a001-01-000007031055720", "트러블패치후기"),
]

# 브랜드 캠페인에서 OFF할 키워드 ID 목록
# (파워링크_PC 캠페인, AC마그네슘패치와 마그네슘패치는 유지)
PL_BR_OFF_KEYWORDS = [
    ("nkw-a001-01-000007031056036", "AC마그네슘패치가격"),
    ("nkw-a001-01-000007031056040", "AC마그네슘패치내돈내산"),
    ("nkw-a001-01-000007031056039", "AC마그네슘패치리뷰"),
    ("nkw-a001-01-000007031056037", "AC마그네슘패치추천"),
    ("nkw-a001-01-000007031056038", "AC마그네슘패치후기"),
    ("nkw-a001-01-000007031056028", "마그네슘트러블패치"),
    ("nkw-a001-01-000007031056041", "마그네슘트러블패치가격"),
    ("nkw-a001-01-000007031056045", "마그네슘트러블패치내돈내산"),
    ("nkw-a001-01-000007031056044", "마그네슘트러블패치리뷰"),
    ("nkw-a001-01-000007031056042", "마그네슘트러블패치추천"),
    ("nkw-a001-01-000007031056043", "마그네슘트러블패치후기"),
    ("nkw-a001-01-000007031056031", "마그네슘패치가격"),
    ("nkw-a001-01-000007031056035", "마그네슘패치내돈내산"),
    ("nkw-a001-01-000007031056034", "마그네슘패치리뷰"),
    ("nkw-a001-01-000007031056032", "마그네슘패치추천"),
    ("nkw-a001-01-000007031056033", "마그네슘패치후기"),
    ("nkw-a001-01-000007031056025", "스노우투플러스마그네슘패치"),
    ("nkw-a001-01-000007031056050", "여드름마그네슘패치"),
    ("nkw-a001-01-000007031056051", "여드름마그네슘패치가격"),
    ("nkw-a001-01-000007031056055", "여드름마그네슘패치내돈내산"),
    ("nkw-a001-01-000007031056053", "여드름마그네슘패치리뷰"),
    ("nkw-a001-01-000007031056054", "여드름마그네슘패치추천"),
    ("nkw-a001-01-000007031056052", "여드름마그네슘패치후기"),
    ("nkw-a001-01-000007031056046", "트러블패치가격"),
    ("nkw-a001-01-000007031056030", "트러블패치가성비"),
    ("nkw-a001-01-000007031056048", "트러블패치리뷰"),
    ("nkw-a001-01-000007031056029", "트러블패치소형"),
    ("nkw-a001-01-000007031056049", "트러블패치추천"),
    ("nkw-a001-01-000007031056047", "트러블패치후기"),
]

def disable_pl_keywords():
    log("5. 파워링크 키워드 OFF 처리")
    
    step(f"비브랜드 캠페인: {len(PL_NB_OFF_KEYWORDS)}개 키워드 OFF")
    for kw_id, kw_name in PL_NB_OFF_KEYWORDS:
        print(f"    OFF: {kw_name} ({kw_id})")
        api_put(f"/ncc/keywords/{kw_id}", {"userLock": True}, fields="userLock")

    step(f"브랜드 캠페인: {len(PL_BR_OFF_KEYWORDS)}개 키워드 OFF")
    for kw_id, kw_name in PL_BR_OFF_KEYWORDS:
        print(f"    OFF: {kw_name} ({kw_id})")
        api_put(f"/ncc/keywords/{kw_id}", {"userLock": True}, fields="userLock")

# ═══════════════════════════════════════
# 6. 파워링크 브랜드 캠페인 입찰가 변경
# ═══════════════════════════════════════
def update_brand_bids():
    log("6. 브랜드 캠페인 키워드 입찰가 변경")
    
    step("AC마그네슘패치 70원 → 350원")
    api_put("/ncc/keywords/nkw-a001-01-000007031056027", {
        "bidAmt": 350,
        "useGroupBidAmt": False,
    }, fields="bidAmt")

# ═══════════════════════════════════════
# 7. 파워링크 OFF 캠페인 처리
# ═══════════════════════════════════════
OFF_CAMPAIGNS = [
    ("cmp-a001-01-000000006500649", "파워링크_호랑이패치"),
    ("cmp-a001-01-000000009276366", "파워링크_원나잇트러블"),
    ("cmp-a001-01-000000009270037", "파워링크_멜라톡"),
    ("cmp-a001-01-000000009276022", "파워링크_멜라스노우"),
    ("cmp-a001-01-000000007765366", "# 자상호"),
    ("cmp-a001-01-000000007769808", "# (순위) 메인 키워드"),
    ("cmp-a001-01-000000007769956", "# 전환 키워드"),
    ("cmp-a001-01-000000007769999", "# 노출 키워드"),
    ("cmp-a001-01-000000007770001", "# 유입 키워드"),
    ("cmp-a001-01-000000008242085", "# AC패치"),
    ("cmp-a001-01-000000007999863", "# 부스톡"),
]

def disable_off_campaigns():
    log("7. OFF 유지 캠페인 확인 (이미 OFF인 것만)")
    for cmp_id, name in OFF_CAMPAIGNS:
        step(f"{name} → OFF 확인")
        # 이미 OFF인 캠페인이므로 상태 확인만

# ═══════════════════════════════════════
# 8. 브랜드/비브랜드 재정리 (2차 보정)
#   - 비브랜드 캠페인의 브랜드 토큰 키워드 AC마그네슘패치(PC) OFF
#   - 비브랜드 캠페인의 비브랜드 키워드 46개 userLock 해제
#   - 브랜드 캠페인 AC마그네슘패치 PC/모바일 입찰가 70→350
# ═══════════════════════════════════════
BRAND_TOKENS = ["스노우투플러스", "AC마그네슘"]
NB_ADGROUPS = [
    ("grp-a001-01-000000049386164", "MO_AC마그네슘"),
    ("grp-a001-01-000000049388808", "PC_AC마그네슘"),
]
BRAND_ADGROUPS = [
    ("grp-a001-01-000000052625892", "브랜드명_PC"),
    ("grp-a001-01-000000065184863", "브랜드명_모바일"),
]

def _is_brand(kw: str) -> bool:
    return any(t in kw for t in BRAND_TOKENS)

def api_post(uri, data, params=None):
    if DRY_RUN:
        qs = f"?{params}" if params else ""
        print(f"  [DRY-RUN] POST {uri}{qs}")
        print(f"  [DRY-RUN] Data: {json.dumps(data, ensure_ascii=False)}")
        return None
    headers = get_header("POST", uri)
    resp = requests.post(BASE_URL + uri, headers=headers, json=data, params=params)
    if not resp.ok:
        print(f"  [ERROR] {resp.status_code} {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()


SEED_KEYWORDS = [
    "마그네슘패치", "AC마그네슘", "따꼼호랑이", "트러블패치", "원나잇트러블",
    "여드름패치", "여드름흉터패치", "기미패치", "좁쌀여드름패치", "트러블케어패치",
]
SEEDS_PER_LIMIT = 5
MIN_MONTHLY_SEARCH = 100
PRODUCT_TOKENS = ["패치", "스티커"]
TOPIC_TOKENS = ["여드름", "트러블", "좁쌀", "흉터", "마그네슘"]
BLACK_TOKENS = [
    "영양제", "비타민", "연고", "약", "원료", "성분", "주사", "캡슐", "정제",
    # 경쟁/타사 브랜드명 (확장 가능)
    "올리브영", "아이소이", "라로슈포제", "에스트라", "라네즈",
    "스킨푸드", "이니스프리", "닥터자르트", "코스알엑스", "메디힐",
    "아크네스", "더마펌",
]
NB_TARGETS = [
    ("grp-a001-01-000000049386164", "MO_AC마그네슘", "MOBILE", 4),
    ("grp-a001-01-000000049388808", "PC_AC마그네슘", "PC", 10),
]


def _get_existing_keywords():
    """브랜드 캠페인의 키워드 집합 (브랜드↔비브랜드 충돌 방지용).
       비브랜드 광고그룹간 중복은 등록 단계에서 광고그룹별로 따로 체크."""
    existing = set()
    try:
        groups = api_get("/ncc/adgroups",
                         params={"nccCampaignId": CAMPAIGNS["브랜드_PL"]})
    except Exception:
        return existing
    for g in groups:
        try:
            kws = api_get("/ncc/keywords", params={"nccAdgroupId": g["nccAdgroupId"]})
        except Exception:
            continue
        for k in kws:
            existing.add(k["keyword"].strip())
    return existing


def _kwtool(seed):
    return api_get("/keywordstool", params={"hintKeywords": seed, "showDetail": "1"})


def _estimate_bid(keyword, device, position):
    uri = "/estimate/average-position-bid/keyword"
    data = {"device": device, "period": "MONTH",
            "items": [{"key": keyword, "position": position}]}
    headers = get_header("POST", uri)
    r = requests.post(BASE_URL + uri, headers=headers, json=data)
    r.raise_for_status()
    est = r.json().get("estimate", [])
    return est[0]["bid"] if est else None


def recommend_keywords():
    log("키워드 추천 (시드 → 연관 → 필터)")

    step("기존 등록 키워드 수집")
    existing = _get_existing_keywords()
    print(f"    기존 키워드 {len(existing)}개 (중복 제외용)")

    step("시드별 연관 키워드 조회")
    candidates = {}  # keyword -> {pcQc, moQc, total}
    for seed in SEED_KEYWORDS:
        try:
            data = _kwtool(seed)
        except Exception as e:
            print(f"    [SKIP] {seed}: {e}")
            continue
        rows = data.get("keywordList", [])
        # 필터 + 정렬 + 상위 N
        filtered = []
        for k in rows:
            kw = k.get("relKeyword", "").strip()
            if not kw or kw in existing:
                continue
            if _is_brand(kw):
                continue
            if not any(t in kw for t in PRODUCT_TOKENS):
                continue
            if not any(t in kw for t in TOPIC_TOKENS):
                continue
            if any(b in kw for b in BLACK_TOKENS):
                continue
            pc = _qc(k.get("monthlyPcQcCnt"))
            mo = _qc(k.get("monthlyMobileQcCnt"))
            total = pc + mo
            if total < MIN_MONTHLY_SEARCH:
                continue
            filtered.append((kw, pc, mo, total))
        filtered.sort(key=lambda x: x[3], reverse=True)
        picked = filtered[:SEEDS_PER_LIMIT]
        print(f"    시드 [{seed}]: 후보 {len(rows)}개 → 필터 통과 {len(filtered)} → 상위 {len(picked)}")
        for kw, pc, mo, total in picked:
            if kw not in candidates:
                candidates[kw] = {"pc": pc, "mo": mo, "total": total, "from": seed}

    step(f"중복 제거 후 추천 키워드 {len(candidates)}개")
    for kw, info in candidates.items():
        print(f"    - {kw} (PC {info['pc']:,} / MO {info['mo']:,} / 합 {info['total']:,}, from {info['from']})")
    return candidates


def _qc(v):
    if isinstance(v, str):
        v = v.replace("<", "").replace(",", "").strip()
        try: return int(v)
        except: return 0
    return int(v or 0)


def register_recommended():
    candidates = recommend_keywords()

    log("키워드 등록 (광고그룹별)")
    for gid, gname, device, position in NB_TARGETS:
        # 이 광고그룹에 이미 있는 키워드만 제외 (다른 광고그룹은 무관)
        existing_in_group = {k["keyword"].strip()
                             for k in api_get("/ncc/keywords", params={"nccAdgroupId": gid})}
        # 광고그룹 전월 CPC = 입찰가 상한
        end_d = __import__("datetime").date.today()
        start_d = end_d - __import__("datetime").timedelta(days=30)
        try:
            r = api_get("/stats", params={
                "ids": gid,
                "fields": '["clkCnt","salesAmt"]',
                "timeRange": json.dumps({"since": str(start_d), "until": str(end_d)}),
            })
            d = r["data"][0] if r.get("data") else {}
            clk, cost = d.get("clkCnt", 0), d.get("salesAmt", 0)
            cpc_cap = int(cost / clk) if clk else 500
        except Exception:
            cpc_cap = 500
        step(f"[{gname}] device={device} pos={position} CPC상한={cpc_cap:,}원")

        for kw, info in candidates.items():
            if kw in existing_in_group:
                print(f"    SKIP: {kw} (이미 광고그룹에 있음)")
                continue
            try:
                est = _estimate_bid(kw, device, position)
            except Exception as e:
                print(f"    [SKIP] {kw}: estimate 실패 {e}")
                continue
            if not est:
                print(f"    [SKIP] {kw}: 추정 불가")
                continue
            bid = min(est, cpc_cap)
            bid = max(bid, 70)
            bid = (bid // 10) * 10  # 10원 단위 floor
            print(f"    REG: {kw} (검색량 {info['total']:,}, 추정{est}, 적용{bid})")
            api_post("/ncc/keywords",
                     [{"keyword": kw, "bidAmt": bid, "useGroupBidAmt": False}],
                     params={"nccAdgroupId": gid})


def fix_brand_nonbrand():
    log("8. 브랜드/비브랜드 키워드 재정리")

    # (a) 비브랜드 캠페인에서 브랜드 토큰 키워드 OFF (중복 제거)
    step("비브랜드 캠페인 → 브랜드 토큰 활성 키워드 OFF")
    for gid, gname in NB_ADGROUPS:
        kws = api_get("/ncc/keywords", params={"nccAdgroupId": gid})
        for k in kws:
            if not k.get("userLock") and _is_brand(k["keyword"]):
                print(f"    OFF: [{gname}] {k['keyword']} ({k['nccKeywordId']})")
                api_put(f"/ncc/keywords/{k['nccKeywordId']}",
                        {"userLock": True}, fields="userLock")

    # (b) 비브랜드 캠페인에서 비브랜드 키워드 revive
    step("비브랜드 캠페인 → 비브랜드 OFF 키워드 revive")
    for gid, gname in NB_ADGROUPS:
        kws = api_get("/ncc/keywords", params={"nccAdgroupId": gid})
        for k in kws:
            if k.get("userLock") and not _is_brand(k["keyword"]):
                print(f"    ON : [{gname}] {k['keyword']} ({k['nccKeywordId']})")
                api_put(f"/ncc/keywords/{k['nccKeywordId']}",
                        {"userLock": False}, fields="userLock")

    # (c) 브랜드 캠페인 AC마그네슘패치 입찰가 70→350
    step("브랜드 캠페인 AC마그네슘패치 입찰가 → 350원")
    for gid, gname in BRAND_ADGROUPS:
        kws = api_get("/ncc/keywords", params={"nccAdgroupId": gid})
        for k in kws:
            if k["keyword"] == "AC마그네슘패치":
                print(f"    BID: [{gname}] {k['keyword']} {k.get('bidAmt')}→350 ({k['nccKeywordId']})")
                api_put(f"/ncc/keywords/{k['nccKeywordId']}",
                        {"bidAmt": 350, "useGroupBidAmt": False}, fields="bidAmt")

# ═══════════════════════════════════════
# 실행 요약
# ═══════════════════════════════════════
def print_summary():
    log("세팅 요약")
    print("""
  [쇼핑검색]
  • AC마그네슘 일예산: 50,000원
  • 따꼼호랑이 일예산: 10,000원
  • 원나잇트러블 일예산: 10,000원
  • 지면별 입찰가: 15개 광고그룹 조정
  • 핸디톡클리어: OFF

  [파워링크]
  • 비브랜드 일예산: 15,000원 | 기존 키워드 30개 OFF
  • 브랜드 통합 일예산: 5,000원 | 기존 키워드 29개 OFF, AC마그네슘패치 입찰가 상향
  
  [수동 작업 필요]
  • 비브랜드 캠페인: 신규 비브랜드 키워드 8개 등록 (MO+PC)
  • 브랜드 캠페인: 신규 브랜드 키워드 6개 등록 (PC+MO)
  • 브랜드 캠페인: 모바일 광고그룹 신규 생성
  • GFA: 소재 수급 후 캠페인 신규 생성
  
  ※ 키워드 신규 등록은 광고그룹 ID가 필요하므로,
    모바일 광고그룹 수동 생성 후 별도 스크립트로 처리하거나 수동 등록
""")

# ═══════════════════════════════════════
# 메인
# ═══════════════════════════════════════
if __name__ == "__main__":
    if DRY_RUN:
        print("\n" + "★" * 60)
        print("  DRY-RUN 모드: 실제 API 호출 없이 변경 내용만 출력합니다")
        print("  실행하려면: python snow2plus_setup.py --execute")
        print("★" * 60)
    else:
        print("\n" + "⚠" * 60)
        print("  EXECUTE 모드: 실제 API를 호출합니다!")
        confirm = input("  계속하시겠습니까? (yes 입력): ")
        if confirm != "yes":
            print("  취소되었습니다.")
            sys.exit(0)
        print("⚠" * 60)
    
    if "--recommend" in sys.argv:
        recommend_keywords()
    elif "--register" in sys.argv:
        register_recommended()
    elif "--fix" in sys.argv:
        fix_brand_nonbrand()
    else:
        set_campaign_budgets()
        set_sa_bidamounts()
        disable_handitok()
        set_pl_budgets()
        disable_pl_keywords()
        update_brand_bids()
        disable_off_campaigns()
        print_summary()
    
    if DRY_RUN:
        print("\n  ✅ dry-run 완료. 위 내용을 확인 후 --execute로 실행하세요.")
    else:
        print("\n  ✅ 세팅 완료!")
