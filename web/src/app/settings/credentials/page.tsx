"use client";
import { useEffect, useState } from "react";
import {
  activateCredential, addCredential, Credential, deleteCredential, fetchCredentials,
} from "@/lib/api";

export default function CredentialsPage() {
  const [list, setList] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", customerId: "", apiKey: "", secretKey: "" });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setLoading(true); setErr(null);
    try { setList(await fetchCredentials()); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true); setMsg(null);
    try {
      await addCredential(form);
      setForm({ label: "", customerId: "", apiKey: "", secretKey: "" });
      setMsg("등록되었습니다.");
      await refresh();
    } catch (e) {
      setMsg(`오류: ${String(e instanceof Error ? e.message : e)}`);
    } finally { setAdding(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("삭제할까요? 복구할 수 없습니다.")) return;
    try { await deleteCredential(id); await refresh(); }
    catch (e) { alert(String(e)); }
  }

  async function handleActivate(id: number) {
    try { await activateCredential(id); await refresh(); }
    catch (e) { alert(String(e)); }
  }

  return (
    <div className="p-8">
      <div className="max-w-[900px] mx-auto">
        <header className="mb-6">
          <div className="text-caption" style={{ color: "var(--color-text-subtle)" }}>계정</div>
          <h1 className="text-display mt-1">계정 관리</h1>
          <p className="text-caption mt-2" style={{ color: "var(--color-text-muted)" }}>
            담당하는 네이버 광고 계정의 API 키를 등록하고, 활성 계정을 전환합니다.
            새로 추가한 계정은 자동으로 활성화됩니다. 등록된 키는 서버에서 암호화되어 저장되며 다시 조회할 수 없습니다.
          </p>
        </header>

        <section className="mb-8">
          <div className="text-tile mb-3">등록된 계정</div>
          {loading && <div className="text-caption" style={{ color: "var(--color-text-subtle)" }}>불러오는 중...</div>}
          {err && <div className="text-caption" style={{ color: "var(--color-danger)" }}>{err}</div>}
          {!loading && !err && list.length === 0 && (
            <div className="card-elevated p-5 text-caption" style={{ color: "var(--color-text-muted)" }}>
              등록된 계정이 없습니다. 아래에서 추가해주세요.
            </div>
          )}
          {list.map((c) => (
            <div key={c.id} className="card-elevated p-4 mb-3 flex items-center gap-4" style={{ border: "1px solid var(--color-border)" }}>
              <div className="flex-1">
                <div className="text-body-em">{c.label}</div>
                <div className="text-caption" style={{ color: "var(--color-text-muted)" }}>
                  CUSTOMER {c.customerId} · API KEY {c.apiKeyMasked}
                </div>
              </div>
              {c.isActive ? (
                <span className="btn btn-pill" style={{ background: "var(--color-accent)", color: "#fff", cursor: "default" }}>활성</span>
              ) : (
                <button onClick={() => handleActivate(c.id)} className="btn btn-secondary btn-pill">활성화</button>
              )}
              <button onClick={() => handleDelete(c.id)} className="btn btn-danger btn-pill">삭제</button>
            </div>
          ))}
        </section>

        <section>
          <div className="text-tile mb-3">새 계정 추가</div>
          <form onSubmit={handleAdd} className="card-elevated p-5" style={{ border: "1px solid var(--color-border)" }}>
            <div className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4 mb-4">
              <Label>라벨</Label>
              <input className="input" placeholder="예: 스노우투 메인" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} required />
              <Label>Customer ID</Label>
              <input className="input" placeholder="네이버 광고 고객 ID" value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })} required />
              <Label>API Key</Label>
              <input className="input" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required />
              <Label>Secret Key</Label>
              <input className="input" type="password" value={form.secretKey}
                onChange={(e) => setForm({ ...form, secretKey: e.target.value })} required />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={adding} className="btn btn-primary">
                {adding ? "등록 중..." : "추가"}
              </button>
              {msg && <span className="text-caption" style={{ color: msg.startsWith("오류") ? "var(--color-danger)" : "var(--color-success)" }}>{msg}</span>}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-caption flex items-center" style={{ color: "var(--color-text-muted)" }}>{children}</div>;
}
