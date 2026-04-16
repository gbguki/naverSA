import { encrypt, mask } from "@/lib/crypto";
import { errorResponse, requireUser } from "@/lib/creds";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const [{ data: rows }, { data: state }] = await Promise.all([
      sb.from("credentials").select("id, label, customer_id, api_key_masked, created_at").order("id"),
      sb.from("user_state").select("active_credential_id").eq("user_id", user.id).maybeSingle(),
    ]);
    const activeId = state?.active_credential_id ?? null;
    return Response.json((rows ?? []).map((r) => ({
      id: r.id, label: r.label, customerId: r.customer_id,
      apiKeyMasked: r.api_key_masked, createdAt: r.created_at,
      isActive: r.id === activeId,
    })));
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? "").trim();
    const customerId = String(body.customerId ?? "").trim();
    const apiKey = String(body.apiKey ?? "").trim();
    const secretKey = String(body.secretKey ?? "").trim();
    if (!label || !customerId || !apiKey || !secretKey) {
      return Response.json({ error: "all fields required" }, { status: 400 });
    }

    const { sb, user } = await requireUser();
    const { data, error } = await sb.from("credentials").insert({
      user_id: user.id, label, customer_id: customerId,
      api_key_masked: mask(apiKey),
      api_key_enc: encrypt(apiKey),
      secret_key_enc: encrypt(secretKey),
    }).select("id").single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await sb.from("user_state").upsert({ user_id: user.id, active_credential_id: data.id });
    return Response.json({ ok: true, id: data.id });
  } catch (e) { return errorResponse(e); }
}
