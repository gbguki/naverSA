import { errorResponse, requireUser } from "@/lib/creds";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const credId = Number(id);
    const { sb, user } = await requireUser();

    const { data: existing } = await sb.from("credentials").select("id").eq("id", credId).maybeSingle();
    if (!existing) return Response.json({ error: "not found" }, { status: 404 });

    await sb.from("credentials").delete().eq("id", credId);

    // 활성이었으면 다른 것으로 전환
    const { data: state } = await sb.from("user_state").select("active_credential_id").eq("user_id", user.id).maybeSingle();
    if (state?.active_credential_id === credId) {
      const { data: next } = await sb.from("credentials").select("id").order("id").limit(1).maybeSingle();
      await sb.from("user_state").upsert({ user_id: user.id, active_credential_id: next?.id ?? null });
    }
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
