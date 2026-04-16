import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";
import { recommendKeywordBid, type KeywordParams } from "@/lib/rules";
import { resolveRuleForAdgroup } from "@/lib/rulesStore";
import { statsForDays } from "@/lib/stats";

type Kw = { nccKeywordId: string; keyword: string; bidAmt?: number | null; userLock?: boolean };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adgroupId = searchParams.get("adgroup_id");
    if (!adgroupId) return Response.json({ error: "adgroup_id required" }, { status: 400 });

    const { creds } = await requireActiveCreds();
    const params = (await resolveRuleForAdgroup(creds, "keyword", adgroupId)) as KeywordParams;

    const kws = await naver.get<Kw[]>(creds, "/ncc/keywords", { nccAdgroupId: adgroupId });
    const active = kws.filter((k) => !k.userLock);
    if (!active.length) return Response.json([]);
    const ids = active.map((k) => k.nccKeywordId);
    const stats = await statsForDays(creds, ids, 30, true);

    const out = active.map((k) => {
      const s = stats[k.nccKeywordId] ?? {};
      const imp = Math.floor(s.impCnt ?? 0);
      const clk = Math.floor(s.clkCnt ?? 0);
      const sales = Math.floor(s.salesAmt ?? 0);
      const conv = Math.floor(s.convAmt ?? 0);
      const rnk = Number(s.avgRnk ?? 0) || 0;
      const cur = Math.floor(k.bidAmt ?? 0);
      const { bid, reason } = recommendKeywordBid({
        currentBid: cur, imp30: imp, clk30: clk, sales30: sales, conv30: conv, avgRnk30: rnk, params,
      });
      return {
        nccKeywordId: k.nccKeywordId, keyword: k.keyword,
        currentBid: cur, recommendedBid: bid, reason,
        imp30: imp, clk30: clk,
        ctr30: Math.round((imp ? (clk / imp) * 100 : 0) * 100) / 100,
        sales30: sales, convAmt30: conv,
        roas30: Math.round((sales ? (conv / sales) * 100 : 0) * 10) / 10,
        avgRnk30: rnk,
      };
    });
    return Response.json(out);
  } catch (e) { return errorResponse(e); }
}
