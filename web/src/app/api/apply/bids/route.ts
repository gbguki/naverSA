import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";

type Item = { nccAdgroupId: string; bidAmt: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items: Item[] = Array.isArray(body.items) ? body.items : [];
    const dryRun = body.dryRun !== false;
    const { creds } = await requireActiveCreds();

    const results: unknown[] = [];
    for (const item of items) {
      if (item.bidAmt < 70) { results.push({ nccAdgroupId: item.nccAdgroupId, ok: false, error: "bid < 70" }); continue; }
      if (item.bidAmt % 10 !== 0) { results.push({ nccAdgroupId: item.nccAdgroupId, ok: false, error: "bid must be multiple of 10" }); continue; }
      if (dryRun) { results.push({ nccAdgroupId: item.nccAdgroupId, ok: true, bidAmt: item.bidAmt, dryRun: true }); continue; }
      try {
        const uri = `/ncc/adgroups/${item.nccAdgroupId}`;
        const current = await naver.get<Record<string, unknown>>(creds, uri);
        await naver.put(creds, uri, { ...current, bidAmt: item.bidAmt }, { fields: "bidAmt" });
        results.push({ nccAdgroupId: item.nccAdgroupId, ok: true, bidAmt: item.bidAmt });
      } catch (e) {
        results.push({ nccAdgroupId: item.nccAdgroupId, ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
    }
    return Response.json({ results });
  } catch (e) { return errorResponse(e); }
}
