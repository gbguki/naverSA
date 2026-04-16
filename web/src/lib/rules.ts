// 광고 운영 룰 엔진. backend/rules.py 포팅 (순수 로직).
export type Tier = { roasMin: number; roasMax: number | null; changePct: number; label: string };
export type BidParams = {
  targetRoas?: number; minClicks?: number; maxChangePct?: number; bidFloor?: number;
  tiers?: Tier[];
};
export type KeywordParams = BidParams & {
  minImpressions?: number; lowImpBoost?: number;
  lowRankCtrThreshold?: number; lowRankThreshold?: number; lowRankBoost?: number;
};

function roundTo10(v: number, floor: number): number {
  return Math.max(floor, Math.floor(v / 10) * 10);
}

function capChange(current: number, recommended: number, maxChangePct: number): number {
  const up = Math.floor(current * (1 + maxChangePct / 100));
  const down = Math.floor(current * (1 - maxChangePct / 100));
  return Math.max(Math.min(recommended, up), down);
}

function matchTier(tiers: Tier[], roas: number): Tier | null {
  for (const t of tiers) {
    const lo = t.roasMin ?? 0;
    const hi = t.roasMax;
    if (roas >= lo && (hi === null || hi === undefined || roas < hi)) return t;
  }
  return null;
}

export function recommendBid(args: {
  currentBid: number; roas7: number; clicks7: number; params: BidParams;
}): { bid: number | null; reason: string } {
  const { currentBid, roas7, clicks7, params } = args;
  const minClicks = params.minClicks ?? 10;
  const maxChange = params.maxChangePct ?? 30;
  const floor = params.bidFloor ?? 70;
  const tiers = params.tiers ?? [];

  if (clicks7 < minClicks) return { bid: null, reason: `클릭 ${clicks7}회 < ${minClicks}회 (데이터 부족)` };

  const tier = matchTier(tiers, roas7);
  if (!tier) return { bid: null, reason: `ROAS ${roas7.toFixed(0)}% · 매칭 티어 없음` };

  const changePct = tier.changePct ?? 0;
  const label = tier.label ?? `${changePct >= 0 ? "+" : ""}${changePct}%`;
  if (changePct === 0) return { bid: null, reason: `ROAS ${roas7.toFixed(0)}% · ${label}` };

  const target = capChange(currentBid, Math.floor(currentBid * (1 + changePct / 100)), maxChange);
  return { bid: roundTo10(target, floor), reason: `ROAS ${roas7.toFixed(0)}% · ${label}` };
}

export function recommendKeywordBid(args: {
  currentBid: number; imp30: number; clk30: number; sales30: number;
  conv30: number; avgRnk30: number; params: KeywordParams;
}): { bid: number | null; reason: string } {
  const { currentBid, imp30, clk30, sales30, conv30, avgRnk30, params } = args;
  const minClicks = params.minClicks ?? 5;
  const minImp = params.minImpressions ?? 100;
  const maxChange = params.maxChangePct ?? 30;
  const floor = params.bidFloor ?? 70;
  const lowImpBoost = params.lowImpBoost ?? 20;
  const lowRankCtrThr = params.lowRankCtrThreshold ?? 1.0;
  const lowRankThr = params.lowRankThreshold ?? 10.0;
  const lowRankBoost = params.lowRankBoost ?? 20;
  const tiers = params.tiers ?? [];

  const ctr = imp30 ? (clk30 / imp30) * 100 : 0;
  const roas = sales30 ? (conv30 / sales30) * 100 : 0;

  if (imp30 === 0) return { bid: null, reason: "노출 0회 (신규/집행 직전)" };

  if (imp30 < minImp) {
    const target = capChange(currentBid, Math.floor(currentBid * (1 + lowImpBoost / 100)), maxChange);
    return { bid: roundTo10(target, floor), reason: `노출 ${imp30}회 < ${minImp} · +${lowImpBoost}% (테스트 확대)` };
  }

  if (avgRnk30 > lowRankThr && ctr < lowRankCtrThr) {
    const target = capChange(currentBid, Math.floor(currentBid * (1 + lowRankBoost / 100)), maxChange);
    return { bid: roundTo10(target, floor), reason: `평균순위 ${avgRnk30.toFixed(1)}위 · CTR ${ctr.toFixed(1)}% · +${lowRankBoost}% (순위 부족)` };
  }

  if (clk30 < minClicks) return { bid: null, reason: `클릭 ${clk30}회 < ${minClicks} (CTR ${ctr.toFixed(1)}%, 수집 중)` };

  const tier = matchTier(tiers, roas);
  if (!tier) return { bid: null, reason: `ROAS ${roas.toFixed(0)}% · 매칭 티어 없음` };
  const changePct = tier.changePct ?? 0;
  const label = tier.label ?? `${changePct >= 0 ? "+" : ""}${changePct}%`;
  if (changePct === 0) return { bid: null, reason: `ROAS ${roas.toFixed(0)}% · ${label}` };
  const target = capChange(currentBid, Math.floor(currentBid * (1 + changePct / 100)), maxChange);
  return { bid: roundTo10(target, floor), reason: `ROAS ${roas.toFixed(0)}% · ${label}` };
}

// ---------- rules_store 해결 로직 ----------
export type RuleScope =
  | { type: "global" }
  | { type: "media"; campaignTps: string[] }
  | { type: "campaign"; campaignIds: string[] };
export type Rule<P> = { id: string; name: string; enabled: boolean; scope: RuleScope; params: P };
export type RulesStore = { bid: Rule<BidParams>[]; keyword: Rule<KeywordParams>[] };

export function resolveRule<P>(
  rules: Rule<P>[], campaignId: string, campaignTp: string,
): Rule<P> | null {
  const active = rules.filter((r) => r.enabled);
  const camp: Rule<P>[] = [];
  const media: Rule<P>[] = [];
  const global: Rule<P>[] = [];
  for (const r of active) {
    const s = r.scope;
    if (s.type === "campaign" && s.campaignIds.includes(campaignId)) camp.push(r);
    else if (s.type === "media" && s.campaignTps.includes(campaignTp)) media.push(r);
    else if (s.type === "global") global.push(r);
  }
  return camp[0] ?? media[0] ?? global[0] ?? null;
}

export const DEFAULT_RULES: RulesStore = {
  bid: [{
    id: "default-bid", name: "기본 입찰가 규칙", enabled: true, scope: { type: "global" },
    params: {
      targetRoas: 250, minClicks: 10, maxChangePct: 30, bidFloor: 70,
      tiers: [
        { roasMin: 400, roasMax: null, changePct: 20, label: "ROAS 400% 이상: +20% 확대" },
        { roasMin: 250, roasMax: 400, changePct: 0, label: "목표 달성: 유지" },
        { roasMin: 100, roasMax: 250, changePct: -15, label: "목표 미달: -15%" },
        { roasMin: 0, roasMax: 100, changePct: -30, label: "적자: -30%" },
      ],
    },
  }],
  keyword: [{
    id: "default-keyword", name: "기본 키워드 규칙", enabled: true, scope: { type: "global" },
    params: {
      targetRoas: 250, minClicks: 5, minImpressions: 100, maxChangePct: 30, bidFloor: 70,
      lowImpBoost: 20, lowRankCtrThreshold: 1.0, lowRankThreshold: 10.0, lowRankBoost: 20,
      tiers: [
        { roasMin: 400, roasMax: null, changePct: 20, label: "ROAS 400% 이상: +20% 확대" },
        { roasMin: 250, roasMax: 400, changePct: 0, label: "목표 달성: 유지" },
        { roasMin: 100, roasMax: 250, changePct: -15, label: "목표 미달: -15%" },
        { roasMin: 0, roasMax: 100, changePct: -30, label: "적자: -30%" },
      ],
    },
  }],
};
