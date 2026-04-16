import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";
import { statsForRange } from "@/lib/stats";
import { getPurchaseRows, aggregate } from "@/lib/reports";
import { mergeRow, parsePeriod } from "@/lib/dashboard";

type Group = { nccAdgroupId: string; name: string };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id");
    if (!campaignId) return Response.json({ error: "campaign_id required" }, { status: 400 });
    const p = parsePeriod(searchParams.get("since"), searchParams.get("until"));
    if ("error" in p) return Response.json({ error: p.error }, { status: 400 });

    const { creds } = await requireActiveCreds();
    const groups = await naver.get<Group[]>(creds, "/ncc/adgroups", { nccCampaignId: campaignId });
    if (!groups.length) return Response.json([]);
    const ids = groups.map((g) => g.nccAdgroupId);
    const [stats, purchaseRows] = await Promise.all([
      statsForRange(creds, ids, p.since, p.until),
      getPurchaseRows(creds, p.since, p.until),
    ]);
    const filtered = purchaseRows.filter((r) => r.campaignId === campaignId);
    const agg = aggregate(filtered, "adgroup");
    return Response.json(groups.map((g) =>
      mergeRow(g.name, g.nccAdgroupId, stats[g.nccAdgroupId] ?? {}, agg[g.nccAdgroupId] ?? { cnt: 0, amt: 0 }),
    ));
  } catch (e) { return errorResponse(e); }
}
