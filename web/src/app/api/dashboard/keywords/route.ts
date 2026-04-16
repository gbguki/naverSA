import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";
import { statsForRange } from "@/lib/stats";
import { getPurchaseRows, aggregate } from "@/lib/reports";
import { mergeRow, parsePeriod } from "@/lib/dashboard";

type Kw = { nccKeywordId: string; keyword: string };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adgroupId = searchParams.get("adgroup_id");
    if (!adgroupId) return Response.json({ error: "adgroup_id required" }, { status: 400 });
    const p = parsePeriod(searchParams.get("since"), searchParams.get("until"));
    if ("error" in p) return Response.json({ error: p.error }, { status: 400 });

    const { creds } = await requireActiveCreds();
    const kws = await naver.get<Kw[]>(creds, "/ncc/keywords", { nccAdgroupId: adgroupId });
    if (!kws.length) return Response.json([]);
    const ids = kws.map((k) => k.nccKeywordId);
    const [stats, purchaseRows] = await Promise.all([
      statsForRange(creds, ids, p.since, p.until),
      getPurchaseRows(creds, p.since, p.until),
    ]);
    const filtered = purchaseRows.filter((r) => r.adgroupId === adgroupId);
    const agg = aggregate(filtered, "keyword");
    return Response.json(kws.map((k) =>
      mergeRow(k.keyword, k.nccKeywordId, stats[k.nccKeywordId] ?? {}, agg[k.nccKeywordId] ?? { cnt: 0, amt: 0 }),
    ));
  } catch (e) { return errorResponse(e); }
}
