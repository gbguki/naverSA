"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signup } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) { setErr("비밀번호가 일치하지 않습니다."); return; }
    if (password.length < 8) { setErr("비밀번호는 8자 이상이어야 합니다."); return; }
    if (!email.toLowerCase().endsWith("@growthb.co.kr")) { setErr("@growthb.co.kr 이메일만 가입할 수 있습니다."); return; }
    setBusy(true);
    try {
      await signup(email, password);
      router.push("/settings/credentials");
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
      <form onSubmit={handleSubmit} className="card-elevated p-8" style={{ width: 380 }}>
        <h1 className="text-section mb-1">가입</h1>
        <p className="text-caption mb-6" style={{ color: "var(--color-text-muted)" }}>
          @growthb.co.kr 도메인만 허용됩니다.
        </p>
        <label className="text-caption block mb-1" style={{ color: "var(--color-text-muted)" }}>이메일</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="input w-full mb-3" autoFocus required placeholder="name@growthb.co.kr" />
        <label className="text-caption block mb-1" style={{ color: "var(--color-text-muted)" }}>비밀번호</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="input w-full mb-3" required minLength={8} />
        <label className="text-caption block mb-1" style={{ color: "var(--color-text-muted)" }}>비밀번호 확인</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="input w-full mb-4" required />
        {err && <div className="text-caption mb-3" style={{ color: "var(--color-danger)" }}>{err}</div>}
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "가입 중..." : "가입"}
        </button>
        <p className="text-caption mt-4 text-center" style={{ color: "var(--color-text-muted)" }}>
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      </form>
    </div>
  );
}
