import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "email, password required" }, { status: 400 });
  }
  const normalized = email.toLowerCase();
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: normalized, password });
  if (error) return Response.json({ error: "invalid email or password" }, { status: 401 });
  return Response.json({ ok: true, email: normalized });
}
