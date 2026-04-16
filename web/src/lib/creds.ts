// 현재 로그인 유저의 활성 네이버 자격증명 해결.
import { decrypt } from "./crypto";
import type { NaverCreds } from "./naver";
import { supabaseServer } from "./supabase/server";

export class AuthRequiredError extends Error { constructor() { super("auth required"); } }
export class NoActiveCredentialError extends Error { constructor() { super("no active credential"); } }

export async function requireUser() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new AuthRequiredError();
  return { sb, user };
}

export async function requireActiveCreds(): Promise<{ creds: NaverCreds; userId: string }> {
  const { sb, user } = await requireUser();

  const { data: state } = await sb
    .from("user_state")
    .select("active_credential_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const credId = state?.active_credential_id;
  if (!credId) throw new NoActiveCredentialError();

  const { data: row } = await sb
    .from("credentials")
    .select("customer_id, api_key_enc, secret_key_enc")
    .eq("id", credId)
    .maybeSingle();

  if (!row) throw new NoActiveCredentialError();

  return {
    userId: user.id,
    creds: {
      apiKey: decrypt(row.api_key_enc),
      secretKey: decrypt(row.secret_key_enc),
      customerId: row.customer_id,
    },
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AuthRequiredError) return Response.json({ error: "auth required" }, { status: 401 });
  if (e instanceof NoActiveCredentialError) return Response.json({ error: "no active credential — register one in settings" }, { status: 400 });
  const msg = e instanceof Error ? e.message : String(e);
  return Response.json({ error: msg }, { status: 500 });
}
