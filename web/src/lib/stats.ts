// /stats 조회 헬퍼. 병렬 fetch.
import { naver, type NaverCreds } from "./naver";

export type StatRow = {
  impCnt?: number; clkCnt?: number; salesAmt?: number;
  convAmt?: number; ccnt?: number; avgRnk?: number;
};

async function fetchOne(creds: NaverCreds, id: string, fields: string, timeRange: string): Promise<[string, StatRow]> {
  try {
    const r = await naver.get<{ data?: StatRow[] }>(creds, "/stats", { ids: id, fields, timeRange });
    return [id, r.data?.[0] ?? {}];
  } catch { return [id, {}]; }
}

export async function statsParallel(
  creds: NaverCreds, ids: string[], fields: string, timeRange: string,
): Promise<Record<string, StatRow>> {
  if (!ids.length) return {};
  const entries = await Promise.all(ids.map((id) => fetchOne(creds, id, fields, timeRange)));
  return Object.fromEntries(entries);
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function statsForDays(
  creds: NaverCreds, ids: string[], days: number, withRank = false,
): Promise<Record<string, StatRow>> {
  const today = new Date().toISOString().slice(0, 10);
  const fields = withRank
    ? '["impCnt","clkCnt","salesAmt","convAmt","ccnt","avgRnk"]'
    : '["impCnt","clkCnt","salesAmt","convAmt","ccnt"]';
  const timeRange = JSON.stringify({ since: isoDaysAgo(days), until: today });
  return statsParallel(creds, ids, fields, timeRange);
}

export async function statsForRange(
  creds: NaverCreds, ids: string[], since: string, until: string,
): Promise<Record<string, StatRow>> {
  const fields = '["impCnt","clkCnt","salesAmt","convAmt","ccnt"]';
  const timeRange = JSON.stringify({ since, until });
  return statsParallel(creds, ids, fields, timeRange);
}
