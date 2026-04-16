import { errorResponse, requireUser } from "@/lib/creds";
import { loadRules, saveRules } from "@/lib/rulesStore";
import type { RulesStore } from "@/lib/rules";

export async function GET() {
  try {
    await requireUser();
    return Response.json(await loadRules());
  } catch (e) { return errorResponse(e); }
}

export async function PUT(req: Request) {
  try {
    await requireUser();
    const body = await req.json().catch(() => null) as RulesStore | null;
    if (!body || !Array.isArray(body.bid) || !Array.isArray(body.keyword)) {
      return Response.json({ error: "invalid rules shape" }, { status: 400 });
    }
    await saveRules(body);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
