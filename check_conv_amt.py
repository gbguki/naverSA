"""어제 날짜로 /stats API의 convAmt가 UI의 어느 지표와 일치하는지 확인."""
import json
from datetime import date, timedelta

from backend.naver_api import NaverAdsClient

client = NaverAdsClient()

yesterday = date.today() - timedelta(days=1)
time_range = json.dumps({"since": str(yesterday), "until": str(yesterday)})

campaigns = client.get("/ncc/campaigns")
ids = [c["nccCampaignId"] for c in campaigns]
print(f"총 캠페인: {len(ids)}개, 날짜: {yesterday}")

fields = '["impCnt","clkCnt","salesAmt","convAmt","ccnt","crto"]'

total_sales = 0
total_conv_amt = 0
total_conv_cnt = 0
rows = []
for cid in ids:
    try:
        r = client.get("/stats", params={"ids": cid, "fields": fields, "timeRange": time_range})
        d = r["data"][0] if r.get("data") else {}
    except Exception as e:
        d = {"err": str(e)}
    name = next((c["name"] for c in campaigns if c["nccCampaignId"] == cid), cid)
    sales = d.get("salesAmt", 0) or 0
    conv = d.get("convAmt", 0) or 0
    cnt = d.get("ccnt", 0) or 0
    if sales or conv or cnt:
        rows.append((name, sales, conv, cnt, d))
    total_sales += sales
    total_conv_amt += conv
    total_conv_cnt += cnt

print("\n=== 캠페인별 (값 있는 것만) ===")
for name, sales, conv, cnt, d in rows:
    print(f"  {name[:30]:30s} | salesAmt={sales:>8} | convAmt={conv:>8} | ccnt={cnt}")

print("\n=== 합계 ===")
print(f"  salesAmt(비용): {total_sales:,}원")
print(f"  convAmt(전환매출): {total_conv_amt:,}원")
print(f"  ccnt(전환수): {total_conv_cnt}")
print("\n=== UI 대조 ===")
print(f"  UI 총비용: 17,035원       / API salesAmt: {total_sales:,}원")
print(f"  UI 총 전환매출액: 129,200원 / API convAmt: {total_conv_amt:,}원")
print(f"  UI 구매완료 매출(역산): ~18,399원")
print(f"  UI 총 전환수: 6           / API ccnt: {total_conv_cnt}")
