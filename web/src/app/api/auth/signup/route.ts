import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

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

  // admin으로 생성 (이메일 확인 생략, 조직 내부 도구이므로)
  const admin = supabaseAdmin();
  const created = await admin.auth.admin.createUser({
    email: normalized, password, email_confirm: true,
  });
  if (created.error) {
    return Response.json({ error: created.error.message }, { status: 409 });
  }

  // 바로 로그인시켜 쿠키 세팅
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: normalized, password });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, email: normalized });
}
