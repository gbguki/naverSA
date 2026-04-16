import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "email, password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  const allowed = process.env.ALLOWED_SIGNUP_DOMAIN || "growthb.co.kr";
  const normalized = email.toLowerCase();
  if (!normalized.endsWith(`@${allowed}`)) {
    return Response.json({ error: `email must be a @${allowed} address` }, { status: 400 });
  }

  // Supabase에 "Confirm email" ON이면 확인 메일이 발송되고, 링크 클릭 전까지 로그인 불가.
  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({ email: normalized, password });
  if (error) return Response.json({ error: error.message }, { status: 409 });

  return Response.json({ ok: true, email: normalized, needsConfirmation: true });
}
