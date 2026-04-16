"use client";
import { useEffect, useState } from "react";
import { BidRuleParams, fetchRules, Rule, RulesStore, saveRules } from "@/lib/api";
import RuleEditor from "@/components/RuleEditor";

function newBidRule(): Rule<BidRuleParams> {
  return {
    id: `bid-${Date.now()}`,
    name: "새 입찰가 규칙",
    enabled: true,
    scope: { type: "global" },
    params: {
      targetRoas: 250,
      minClicks: 10,
      maxChangePct: 30,
      bidFloor: 70,
      tiers: [
        { roasMin: 400, roasMax: null, changePct: 20, label: "ROAS 400% 이상: +20% 확대" },
        { roasMin: 250, roasMax: 400, changePct: 0, label: "목표 달성: 유지" },
        { roasMin: 100, roasMax: 250, changePct: -15, label: "목표 미달: -15%" },
        { roasMin: 0, roasMax: 100, changePct: -30, label: "적자: -30%" },
      ],
    },
  };
}

export default function BidRulesPage() {
  const [store, setStore] = useState<RulesStore | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { fetchRules().then(setStore).catch((e) => setMsg(String(e))); }, []);

  if (!store) return <div className="p-8"><div className="text-caption" style={{ color: "var(--color-text-subtle)" }}>불러오는 중...</div></div>;

  function update(idx: number, r: Rule<BidRuleParams>) {
    setStore((s) => s && { ...s, bid: s.bid.map((x, i) => i === idx ? r : x) });
  }
  function remove(idx: number) {
    if (!confirm("이 규칙을 삭제할까요?")) return;
    setStore((s) => s && { ...s, bid: s.bid.filter((_, i) => i !== idx) });
  }
  function add() { setStore((s) => s && { ...s, bid: [...s.bid, newBidRule()] }); }

  async function handleSave() {
    if (!store) return;
    setSaving(true); setMsg(null);
    try { await saveRules(store); setMsg("저장되었습니다."); }
    catch (e) { setMsg(`오류: ${String(e)}`); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-8">
      <div className="max-w-[980px] mx-auto">
        <header className="mb-6">
          <div className="text-caption" style={{ color: "var(--color-text-subtle)" }}>규칙 설정</div>
          <h1 className="text-display mt-1">입찰가 규칙</h1>
          <p className="text-caption mt-2" style={{ color: "var(--color-text-muted)" }}>
            광고그룹 입찰가 자동 추천의 기준 · 7일 구매완료 ROAS 기반
          </p>
        </header>

        {store.bid.map((r, i) => (
          <RuleEditor
            key={r.id}
            rule={r}
            onChange={(nr) => update(i, nr)}
            onDelete={() => remove(i)}
            extraParams={[]}
          />
        ))}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={add} className="btn btn-secondary">규칙 추가</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "저장 중..." : "저장"}
          </button>
          {msg && <span className="text-caption" style={{ color: msg.startsWith("오류") ? "var(--color-danger)" : "var(--color-success)" }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
