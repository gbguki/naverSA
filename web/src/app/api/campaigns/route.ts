import { errorResponse, requireActiveCreds } from "@/lib/creds";
import { naver } from "@/lib/naver";

type RawCamp = {
  nccCampaignId: string; name: string;
  campaignTp?: string; dailyBudget?: number | null; userLock?: boolean; status?: string;
};

export async function GET() {
  try {
    const { creds } = await requireActiveCreds();
    const data = await naver.get<RawCamp[]>(creds, "/ncc/campaigns");
    return Response.json(data.map((c) => ({
      id: c.nccCampaignId, name: c.name, campaignTp: c.campaignTp,
      dailyBudget: c.dailyBudget, userLock: c.userLock, status: c.status,
    })));
  } catch (e) { return errorResponse(e); }
}
