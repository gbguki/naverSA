import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";
import { recommendBid, type BidParams } from "@/lib/rules";
import { resolveRuleForCampaign } from "@/lib/rulesStore";
import { statsForDays } from "@/lib/stats";

type Group = { nccAdgroupId: string; name: string; bidAmt?: number | null };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id");
    if (!campaignId) return Response.json({ error: "campaign_id required" }, { status: 400 });

    const { creds } = await requireActiveCreds();
    const params = (await resolveRuleForCampaign(creds, "bid", campaignId)) as BidParams;

    const groups = await naver.get<Group[]>(creds, "/ncc/adgroups", { nccCampaignId: campaignId });
    if (!groups.length) return Response.json([]);
    const ids = groups.map((g) => g.nccAdgroupId);

    const [s7, s30] = await Promise.all([statsForDays(creds, ids, 7), statsForDays(creds, ids, 30)]);
    const out = groups.map((g) => {
      const gid = g.nccAdgroupId;
      const a = s7[gid] ?? {};
      const b = s30[gid] ?? {};
      const clk = Math.floor(a.clkCnt ?? 0);
      const sales = Math.floor(a.salesAmt ?? 0);
      const conv = Math.floor(a.convAmt ?? 0);
      const roas = sales ? (conv / sales) * 100 : 0;
      const cur = Math.floor(g.bidAmt ?? 0);
      const { bid, reason } = recommendBid({ currentBid: cur, roas7: roas, clicks7: clk, params });
      return {
        nccAdgroupId: gid, name: g.name, currentBid: cur, recommendedBid: bid, reason,
        roas7: Math.round(roas * 10) / 10, clicks7: clk, sales7: sales, convAmt7: conv,
        sales30: Math.floor(b.salesAmt ?? 0),
        convAmt30: Math.floor(b.convAmt ?? 0),
        clicks30: Math.floor(b.clkCnt ?? 0),
      };
    });
    return Response.json(out);
  } catch (e) { return errorResponse(e); }
}
