// AD_CONVERSION StatReport 기반 구매완료 전환 집계. backend/reports.py 포팅.
// /stats의 convAmt는 장바구니 포함이라, 구매완료만 분리하려면 일자별 리포트 필요.
import { createHmac } from "node:crypto";
import { naver, type NaverCreds } from "./naver";

const REPORT_TP = "AD_CONVERSION";
const POLL_INTERVAL_MS = 2000;
const POLL_MAX = 30;
const TTL_PAST_MS = 60 * 60 * 24 * 1000;
const TTL_TODAY_MS = 60 * 5 * 1000;

export type PurchaseRow = {
  campaignId: string; adgroupId: string; keywordId: string; adId: string;
  goalTp: string; cnt: number; amt: number;
};

type CacheEntry = { ts: number; rows: PurchaseRow[] };
// key: `${customerId}:${YYYY-MM-DD}`. 프로세스 로컬 캐시 — Vercel 서버리스에선 동일 instance 유지 동안만 유효.
const dateCache = new Map<string, CacheEntry>();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ttlFor(dateIso: string): number {
  return dateIso >= todayIso() ? TTL_TODAY_MS : TTL_PAST_MS;
}

function cacheGet(customerId: string, dateIso: string): PurchaseRow[] | null {
  const hit = dateCache.get(`${customerId}:${dateIso}`);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlFor(dateIso)) return null;
  return hit.rows;
}

function cacheSet(customerId: string, dateIso: string, rows: PurchaseRow[]) {
  dateCache.set(`${customerId}:${dateIso}`, { ts: Date.now(), rows });
}

type ReportJob = { reportJobId?: string | number; id?: string | number; status?: string; downloadUrl?: string };

async function downloadReport(creds: NaverCreds, downloadUrl: string): Promise<string> {
  const u = new URL(downloadUrl);
  const uri = u.pathname;
  const ts = String(Date.now());
  const msg = `${ts}.GET.${uri}`;
  const sig = createHmac("sha256", creds.secretKey).update(msg).digest("base64");
  const r = await fetch(downloadUrl, {
    headers: {
      "X-Timestamp": ts,
      "X-API-KEY": creds.apiKey,
      "X-Customer": creds.customerId,
      "X-Signature": sig,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`report download ${r.status}`);
  return r.text();
}

function parseReport(text: string): PurchaseRow[] {
  const rows: PurchaseRow[] = [];
  for (const ln of text.trim().split("\n")) {
    if (!ln) continue;
    const cols = ln.split("\t");
    if (cols.length < 13) continue;
    const amt = parseFloat(cols[cols.length - 1]) || 0;
    const cnt = parseFloat(cols[cols.length - 2]) || 0;
    rows.push({
      campaignId: cols[2],
      adgroupId: cols[3],
      keywordId: cols[4],
      adId: cols[5],
      goalTp: cols[cols.length - 3],
      cnt,
      amt,
    });
  }
  return rows;
}

async function fetchOneDate(creds: NaverCreds, dateIso: string): Promise<PurchaseRow[]> {
  const statDt = `${dateIso}T00:00:00.000Z`;
  let info = await naver.post<ReportJob>(creds, "/stat-reports", { reportTp: REPORT_TP, statDt });
  const jobId = info.reportJobId ?? info.id;
  let status = info.status;

  for (let i = 0; i < POLL_MAX; i++) {
    if (status === "BUILT" || status === "DONE" || status === "NONE") break;
    if (status === "FAILED" || status === "REGIST_ERROR") {
      throw new Error(`report failed ${dateIso}: ${status}`);
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
    info = await naver.get<ReportJob>(creds, `/stat-reports/${jobId}`);
    status = info.status;
  }

  if (status === "NONE") return [];
  if (status !== "BUILT" && status !== "DONE") {
    throw new Error(`report timeout ${dateIso}: ${status}`);
  }
  if (!info.downloadUrl) return [];
  return parseReport(await downloadReport(creds, info.downloadUrl));
}

function eachDate(since: string, until: string): string[] {
  const out: string[] = [];
  const s = new Date(since + "T00:00:00Z");
  const u = new Date(until + "T00:00:00Z");
  for (let d = s; d <= u; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function getPurchaseRows(
  creds: NaverCreds, since: string, until: string,
): Promise<PurchaseRow[]> {
  const dates = eachDate(since, until);
  const misses = dates.filter((d) => cacheGet(creds.customerId, d) === null);

  if (misses.length) {
    // 일자별 병렬. Vercel 타임아웃 감안해 동시성 제한 없이 Promise.all.
    const results = await Promise.allSettled(misses.map((d) => fetchOneDate(creds, d)));
    results.forEach((res, i) => {
      const d = misses[i];
      cacheSet(creds.customerId, d, res.status === "fulfilled" ? res.value : []);
    });
  }

  const out: PurchaseRow[] = [];
  for (const d of dates) {
    for (const r of cacheGet(creds.customerId, d) ?? []) {
      if (r.goalTp === "purchase") out.push(r);
    }
  }
  return out;
}

export type AggLevel = "campaign" | "adgroup" | "keyword";
export function aggregate(rows: PurchaseRow[], level: AggLevel): Record<string, { cnt: number; amt: number }> {
  const keyField: keyof PurchaseRow = level === "campaign" ? "campaignId" : level === "adgroup" ? "adgroupId" : "keywordId";
  const out: Record<string, { cnt: number; amt: number }> = {};
  for (const r of rows) {
    const k = r[keyField] as string;
    if (level === "keyword" && (!k || k === "-")) continue;
    if (!out[k]) out[k] = { cnt: 0, amt: 0 };
    out[k].cnt += r.cnt;
    out[k].amt += r.amt;
  }
  return out;
}
