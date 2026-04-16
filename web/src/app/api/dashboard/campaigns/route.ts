import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";
import { statsForRange } from "@/lib/stats";
import { getPurchaseRows, aggregate } from "@/lib/reports";
import { mergeRow, parsePeriod } from "@/lib/dashboard";

type Camp = { nccCampaignId: string; name: string; userLock?: boolean };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const p = parsePeriod(searchParams.get("since"), searchParams.get("until"));
    if ("error" in p) return Response.json({ error: p.error }, { status: 400 });

    const { creds } = await requireActiveCreds();
    const all = await naver.get<Camp[]>(creds, "/ncc/campaigns");
    const active = all.filter((c) => !c.userLock);
    if (!active.length) return Response.json([]);
    const ids = active.map((c) => c.nccCampaignId);
    const [stats, purchaseRows] = await Promise.all([
      statsForRange(creds, ids, p.since, p.until),
      getPurchaseRows(creds, p.since, p.until),
    ]);
    const agg = aggregate(purchaseRows, "campaign");
    return Response.json(active.map((c) =>
      mergeRow(c.name, c.nccCampaignId, stats[c.nccCampaignId] ?? {}, agg[c.nccCampaignId] ?? { cnt: 0, amt: 0 }),
    ));
  } catch (e) { return errorResponse(e); }
}
