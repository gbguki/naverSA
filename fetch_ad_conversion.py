"""AD_CONVERSION StatReport로 어제 전환유형별 매출 받아오기.

목적: convAmt(장바구니 포함) vs 구매완료만 분리한 매출 비교.
기대값: 구매완료 매출 합계 ≈ 18,399원 (UI 구매완료 ROAS 108.01% × 비용 17,035 역산)
"""
import io
import sys
import time
from datetime import date, timedelta

import requests

from backend.naver_api import NaverAdsClient, BASE_URL

client = NaverAdsClient()

yesterday = date.today() - timedelta(days=1)
stat_dt = f"{yesterday}T00:00:00.000Z"
print(f"요청 statDt = {stat_dt}")

job = client.post("/stat-reports", {"reportTp": "AD_CONVERSION", "statDt": stat_dt})
job_id = job.get("reportJobId") or job.get("id")
print(f"reportJobId = {job_id}, 초기 status = {job.get('status')}")
print(f"raw job = {job}")

for i in range(60):
    time.sleep(3)
    info = client.get(f"/stat-reports/{job_id}")
    st = info.get("status")
    print(f"  [{i:02d}] status = {st}")
    if st in ("BUILT", "DONE", "NONE"):
        break
    if st in ("FAILED", "REGIST_ERROR"):
        print("FAILED:", info)
        sys.exit(1)
else:
    print("timeout")
    sys.exit(1)

if st == "NONE":
    print("데이터 없음(NONE). 해당 일자 전환 없음 가능성.")
    print(info)
    sys.exit(0)

download_url = info.get("downloadUrl")
print(f"downloadUrl = {download_url}")

# X-Signature은 요청 URI에 대해 계산되므로 download 요청도 시그니처 재생성
import base64, hashlib, hmac
ts = str(int(time.time() * 1000))
# downloadUrl은 보통 full URL. URI 부분만 추출
from urllib.parse import urlparse
parsed = urlparse(download_url)
uri = parsed.path  # 시그니처는 path만, 쿼리스트링 제외
msg = f"{ts}.GET.{uri}"
sig = base64.b64encode(hmac.new(client.secret_key.encode(), msg.encode(), hashlib.sha256).digest()).decode()
headers = {
    "X-Timestamp": ts,
    "X-API-KEY": client.api_key,
    "X-Customer": client.customer_id,
    "X-Signature": sig,
}
r = requests.get(download_url, headers=headers)
print(f"download status = {r.status_code}, bytes = {len(r.content)}")
r.raise_for_status()

text = r.text
lines = text.strip().split("\n")
print(f"\n총 {len(lines)} 행")
print("첫 3행 원문:")
for ln in lines[:3]:
    print("  |", ln)

# 각 행의 컬럼 수 확인
if lines:
    print(f"\n첫 행 탭 분리 컬럼 수: {len(lines[0].split(chr(9)))}")
    print("첫 행 컬럼별:")
    for i, v in enumerate(lines[0].split("\t")):
        print(f"  [{i}] {v!r}")

# 전환유형별 집계 시도 (컬럼 위치는 실데이터 보고 조정)
# 공식 AD_CONVERSION 예상 순서: 일자 | 고객ID | 캠페인ID | 광고그룹ID | 키워드ID | 광고ID | 비즈채널ID | 매체 | 디바이스 | 전환유형코드 | 전환수 | 전환매출액
from collections import defaultdict
by_goal = defaultdict(lambda: {"cnt": 0.0, "amt": 0.0, "rows": 0})
by_campaign_goal = defaultdict(lambda: {"cnt": 0.0, "amt": 0.0})

for ln in lines:
    cols = ln.split("\t")
    if len(cols) < 12:
        continue
    campaign_id = cols[2]
    # 마지막 2개가 전환수/전환매출액이라고 가정, 그 앞이 goalTp
    try:
        amt = float(cols[-1]) if cols[-1] else 0.0
        cnt = float(cols[-2]) if cols[-2] else 0.0
    except ValueError:
        continue
    goal = cols[-3]  # 전환유형
    by_goal[goal]["cnt"] += cnt
    by_goal[goal]["amt"] += amt
    by_goal[goal]["rows"] += 1
    by_campaign_goal[(campaign_id, goal)]["cnt"] += cnt
    by_campaign_goal[(campaign_id, goal)]["amt"] += amt

print("\n=== 전환유형별 합계 ===")
for goal, v in sorted(by_goal.items()):
    print(f"  goal={goal!r:30s} | rows={v['rows']:4d} | cnt={v['cnt']:>6.0f} | amt={v['amt']:>12,.0f}")

print("\n=== 캠페인 × 전환유형 (매출>0) ===")
for (cid, goal), v in sorted(by_campaign_goal.items()):
    if v["amt"] > 0 or v["cnt"] > 0:
        print(f"  {cid} | {goal:20s} | cnt={v['cnt']:>4.0f} | amt={v['amt']:>10,.0f}")

total_amt = sum(v["amt"] for v in by_goal.values())
print(f"\n전체 전환매출 합: {total_amt:,.0f} (참고: /stats convAmt = 129,200)")
