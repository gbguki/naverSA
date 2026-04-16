import { requireUser } from "@/lib/creds";
import { errorResponse } from "@/lib/creds";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const { data: state } = await sb.from("user_state").select("active_credential_id").eq("user_id", user.id).maybeSingle();
    return Response.json({ email: user.email, activeCredentialId: state?.active_credential_id ?? null });
  } catch (e) { return errorResponse(e); }
}
