import { errorResponse, requireUser } from "@/lib/creds";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const credId = Number(id);
    const { sb, user } = await requireUser();
    const { data: existing } = await sb.from("credentials").select("id").eq("id", credId).maybeSingle();
    if (!existing) return Response.json({ error: "not found" }, { status: 404 });
    await sb.from("user_state").upsert({ user_id: user.id, active_credential_id: credId });
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
