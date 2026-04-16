// 대시보드 공용: 기간 파싱, 행 병합.
import type { StatRow } from "./stats";

export function parsePeriod(since: string | null, until: string | null): { since: string; until: string } | { error: string } {
  if (!since || !until) return { error: "since/until required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return { error: "since/until must be YYYY-MM-DD" };
  }
  if (since > until) return { error: "since > until" };
  const diff = (new Date(until + "T00:00:00Z").getTime() - new Date(since + "T00:00:00Z").getTime()) / 86400000;
  if (diff > 92) return { error: "period too long (max 93 days)" };
  return { since, until };
}

export function mergeRow(name: string, id: string, s: StatRow, purchase: { cnt: number; amt: number }) {
  const imp = Math.floor(s.impCnt ?? 0);
  const clk = Math.floor(s.clkCnt ?? 0);
  const cost = Math.floor(s.salesAmt ?? 0);
  const totalConvCnt = Math.floor(s.ccnt ?? 0);
  const totalConvAmt = Math.floor(s.convAmt ?? 0);
  const pCnt = Math.floor(purchase.cnt);
  const pAmt = Math.floor(purchase.amt);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    id, name,
    impCnt: imp, clkCnt: clk,
    ctr: r2(imp ? (clk / imp) * 100 : 0),
    cost,
    cpc: Math.round(clk ? cost / clk : 0),
    purchaseCnt: pCnt,
    purchaseCvr: r2(clk ? (pCnt / clk) * 100 : 0),
    purchaseAmt: pAmt,
    purchaseRoas: r2(cost ? (pAmt / cost) * 100 : 0),
    totalConvCnt, totalConvAmt,
    totalRoas: r2(cost ? (totalConvAmt / cost) * 100 : 0),
  };
}
