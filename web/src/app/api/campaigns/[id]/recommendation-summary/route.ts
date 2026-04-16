// 캠페인 요약: 추천 입찰가/키워드 변경 건수 집계.
import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";
import { recommendBid, recommendKeywordBid, type BidParams, type KeywordParams } from "@/lib/rules";
import { resolveRuleForAdgroup, resolveRuleForCampaign } from "@/lib/rulesStore";
import { statsForDays } from "@/lib/stats";

type Group = { nccAdgroupId: string; bidAmt?: number | null };
type Kw = { nccKeywordId: string; bidAmt?: number | null; userLock?: boolean };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: campaignId } = await ctx.params;
    const { creds } = await requireActiveCreds();

    // 입찰가 추천
    const bidParams = (await resolveRuleForCampaign(creds, "bid", campaignId)) as BidParams;
    const groups = await naver.get<Group[]>(creds, "/ncc/adgroups", { nccCampaignId: campaignId });
    const gIds = groups.map((g) => g.nccAdgroupId);
    const s7 = gIds.length ? await statsForDays(creds, gIds, 7) : {};

    let adgroupChanges = 0;
    const bidRecs = groups.map((g) => {
      const s = s7[g.nccAdgroupId] ?? {};
      const clk = Math.floor(s.clkCnt ?? 0);
      const sales = Math.floor(s.salesAmt ?? 0);
      const conv = Math.floor(s.convAmt ?? 0);
      const roas = sales ? (conv / sales) * 100 : 0;
      const cur = Math.floor(g.bidAmt ?? 0);
      const { bid } = recommendBid({ currentBid: cur, roas7: roas, clicks7: clk, params: bidParams });
      if (bid !== null && bid !== cur) adgroupChanges++;
      return { adgroupId: g.nccAdgroupId };
    });

    // 키워드 추천 (각 adgroup 순차; 병렬로 돌리면 /stats 과다 호출 우려)
    let keywordTotal = 0;
    let keywordChanges = 0;
    for (const r of bidRecs) {
      try {
        const kwParams = (await resolveRuleForAdgroup(creds, "keyword", r.adgroupId)) as KeywordParams;
        const kws = await naver.get<Kw[]>(creds, "/ncc/keywords", { nccAdgroupId: r.adgroupId });
        const active = kws.filter((k) => !k.userLock);
        if (!active.length) continue;
        const ids = active.map((k) => k.nccKeywordId);
        const stats = await statsForDays(creds, ids, 30, true);
        keywordTotal += active.length;
        for (const k of active) {
          const s = stats[k.nccKeywordId] ?? {};
          const { bid } = recommendKeywordBid({
            currentBid: Math.floor(k.bidAmt ?? 0),
            imp30: Math.floor(s.impCnt ?? 0),
            clk30: Math.floor(s.clkCnt ?? 0),
            sales30: Math.floor(s.salesAmt ?? 0),
            conv30: Math.floor(s.convAmt ?? 0),
            avgRnk30: Number(s.avgRnk ?? 0) || 0,
            params: kwParams,
          });
          if (bid !== null && bid !== Math.floor(k.bidAmt ?? 0)) keywordChanges++;
        }
      } catch { /* skip */ }
    }

    return Response.json({
      adgroupTotal: groups.length,
      adgroupChanges,
      keywordTotal,
      keywordChanges,
    });
  } catch (e) { return errorResponse(e); }
}
