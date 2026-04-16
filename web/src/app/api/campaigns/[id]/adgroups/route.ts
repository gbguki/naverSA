import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";

type RawGroup = { nccAdgroupId: string; name: string; bidAmt?: number | null; userLock?: boolean };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { creds } = await requireActiveCreds();
    const data = await naver.get<RawGroup[]>(creds, "/ncc/adgroups", { nccCampaignId: id });
    return Response.json(data.map((g) => ({
      id: g.nccAdgroupId, name: g.name, bidAmt: g.bidAmt, userLock: g.userLock,
    })));
  } catch (e) { return errorResponse(e); }
}
