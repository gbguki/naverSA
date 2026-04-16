"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { login } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await login(email, password);
      router.push(next);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="card-elevated p-8" style={{ width: 380 }}>
      <h1 className="text-section mb-1">로그인</h1>
      <p className="text-caption mb-6" style={{ color: "var(--color-text-muted)" }}>
        @growthb.co.kr 계정으로 접속하세요.
      </p>
      <label className="text-caption block mb-1" style={{ color: "var(--color-text-muted)" }}>이메일</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        className="input w-full mb-3" autoFocus required />
      <label className="text-caption block mb-1" style={{ color: "var(--color-text-muted)" }}>비밀번호</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        className="input w-full mb-4" required />
      {err && <div className="text-caption mb-3" style={{ color: "var(--color-danger)" }}>{err}</div>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? "확인 중..." : "로그인"}
      </button>
      <p className="text-caption mt-4 text-center" style={{ color: "var(--color-text-muted)" }}>
        처음이신가요? <Link href="/signup">가입</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
