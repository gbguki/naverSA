"use client";
import { Fragment, useEffect, useState } from "react";
import { Campaign, fetchCampaigns, Rule, RuleScope, Tier } from "@/lib/api";

const MEDIA_OPTS = [
  { value: "WEB_SITE", label: "파워링크" },
  { value: "SHOPPING", label: "쇼핑검색" },
];

type ExtraField = { key: string; label: string; suffix?: string; step?: number };

type Props<P extends Record<string, unknown>> = {
  rule: Rule<P>;
  onChange: (r: Rule<P>) => void;
  onDelete: () => void;
  extraParams: ExtraField[];
};

export default function RuleEditor<P extends Record<string, unknown>>({ rule, onChange, onDelete, extraParams }: Props<P>) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => { fetchCampaigns().then(setCampaigns).catch(() => {}); }, []);

  const params = rule.params as P & {
    targetRoas: number; minClicks: number; maxChangePct: number; bidFloor: number; tiers: Tier[];
  };

  function update<K extends keyof Rule<P>>(k: K, v: Rule<P>[K]) { onChange({ ...rule, [k]: v }); }
  function updateParam<K extends string>(k: K, v: number) {
    onChange({ ...rule, params: { ...rule.params, [k]: v } });
  }
  function updateScope(s: RuleScope) { onChange({ ...rule, scope: s }); }
  function updateTier(idx: number, patch: Partial<Tier>) {
    const tiers = [...params.tiers];
    tiers[idx] = { ...tiers[idx], ...patch };
    onChange({ ...rule, params: { ...rule.params, tiers } });
  }
  function addTier() {
    const tiers = [...params.tiers, { roasMin: 0, roasMax: 100, changePct: 0, label: "신규 티어" }];
    onChange({ ...rule, params: { ...rule.params, tiers } });
  }
  function removeTier(idx: number) {
    const tiers = params.tiers.filter((_, i) => i !== idx);
    onChange({ ...rule, params: { ...rule.params, tiers } });
  }

  return (
    <div className="card-elevated p-5 mb-4" style={{ border: "1px solid var(--color-border)" }}>
      <div className="flex items-start gap-3 mb-4">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => update("enabled", e.target.checked)}
          style={{ marginTop: 10, width: 16, height: 16, accentColor: "var(--color-accent)" }}
        />
        <div className="flex-1">
          <input
            className="input w-full"
            value={rule.name}
            onChange={(e) => update("name", e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
        <button onClick={onDelete} className="btn btn-danger btn-pill">삭제</button>
      </div>

      <div className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4 mb-4">
        <Label>적용 범위</Label>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(["global", "media", "campaign"] as const).map((t) => (
              <button
                key={t}
                onClick={() => updateScope(
                  t === "global" ? { type: "global" } :
                  t === "media" ? { type: "media", campaignTps: [] } :
                  { type: "campaign", campaignIds: [] }
                )}
                className={`btn btn-pill ${rule.scope.type === t ? "btn-primary" : "btn-secondary"}`}
              >
                {t === "global" ? "전체" : t === "media" ? "매체별" : "캠페인별"}
              </button>
            ))}
          </div>
          {rule.scope.type === "media" && (
            <div className="flex gap-2">
              {MEDIA_OPTS.map((m) => {
                const scope = rule.scope as { type: "media"; campaignTps: string[] };
                const on = scope.campaignTps.includes(m.value);
                return (
                  <button
                    key={m.value}
                    onClick={() => {
                      const next = on ? scope.campaignTps.filter((x) => x !== m.value) : [...scope.campaignTps, m.value];
                      updateScope({ type: "media", campaignTps: next });
                    }}
                    className={`btn btn-pill ${on ? "btn-primary" : "btn-secondary"}`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
          {rule.scope.type === "campaign" && (
            <div className="flex flex-wrap gap-2 p-2 rounded surface-alt" style={{ border: "1px solid var(--color-border)", maxHeight: 180, overflowY: "auto" }}>
              {campaigns.map((c) => {
                const scope = rule.scope as { type: "campaign"; campaignIds: string[] };
                const on = scope.campaignIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      const next = on ? scope.campaignIds.filter((x) => x !== c.id) : [...scope.campaignIds, c.id];
                      updateScope({ type: "campaign", campaignIds: next });
                    }}
                    className={`btn btn-pill ${on ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: 11 }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Label>최소 클릭</Label>
        <NumInput value={params.minClicks} onChange={(v) => updateParam("minClicks", v)} suffix="회" />

        <Label>최대 변경폭</Label>
        <NumInput value={params.maxChangePct} onChange={(v) => updateParam("maxChangePct", v)} suffix="%" />

        <Label>최저 입찰가</Label>
        <NumInput value={params.bidFloor} onChange={(v) => updateParam("bidFloor", v)} suffix="원" step={10} />

        {extraParams.map((f) => (
          <Fragment key={f.key}>
            <Label>{f.label}</Label>
            <NumInput
              value={Number(params[f.key as keyof typeof params] ?? 0)}
              onChange={(v) => updateParam(f.key, v)}
              suffix={f.suffix}
              step={f.step}
            />
          </Fragment>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div className="text-body-em">ROAS 티어별 입찰가 조정</div>
        <button onClick={addTier} className="btn btn-secondary btn-pill">티어 추가</button>
      </div>
      <div className="surface-alt p-3" style={{ border: "1px solid var(--color-border)" }}>
        <div className="grid grid-cols-[100px_100px_100px_1fr_70px] gap-2 text-caption mb-2" style={{ color: "var(--color-text-muted)" }}>
          <div>ROAS 최소</div><div>ROAS 최대</div><div>변경률</div><div>라벨</div><div></div>
        </div>
        {params.tiers.map((t, i) => (
          <div key={i} className="grid grid-cols-[100px_100px_100px_1fr_70px] gap-2 mb-2">
            <NumInput value={t.roasMin} onChange={(v) => updateTier(i, { roasMin: v })} suffix="%" />
            <NumInput
              value={t.roasMax ?? 0}
              onChange={(v) => updateTier(i, { roasMax: v === 0 ? null : v })}
              suffix="%"
              placeholder="∞"
            />
            <NumInput value={t.changePct} onChange={(v) => updateTier(i, { changePct: v })} suffix="%" allowNegative />
            <input className="input" value={t.label} onChange={(e) => updateTier(i, { label: e.target.value })} />
            <button onClick={() => removeTier(i)} className="btn btn-ghost btn-pill">제거</button>
          </div>
        ))}
        <p className="text-micro mt-2" style={{ color: "var(--color-text-subtle)" }}>
          위에서 아래로 평가 · 매칭되는 첫 티어 적용 · 변경률 0%이면 유지 · 최대값 0/빈칸이면 무제한
        </p>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-caption flex items-center" style={{ color: "var(--color-text-muted)" }}>{children}</div>;
}

function NumInput({ value, onChange, suffix, step = 1, allowNegative = false, placeholder }: {
  value: number; onChange: (v: number) => void; suffix?: string; step?: number; allowNegative?: boolean; placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={allowNegative ? undefined : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder={placeholder}
        className="input w-full"
        style={{ paddingRight: suffix ? 28 : 12 }}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-micro pointer-events-none" style={{ color: "var(--color-text-subtle)" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}
