// 네이버 검색광고 API 클라이언트. backend/naver_api.py 포팅.
import { createHmac } from "node:crypto";

const BASE_URL = "https://api.searchad.naver.com";

export type NaverCreds = { apiKey: string; secretKey: string; customerId: string };

function signHeaders(creds: NaverCreds, method: string, uri: string): Record<string, string> {
  const ts = String(Date.now());
  const msg = `${ts}.${method}.${uri}`;
  const sig = createHmac("sha256", creds.secretKey).update(msg).digest("base64");
  return {
    "Content-Type": "application/json",
    "X-Timestamp": ts,
    "X-API-KEY": creds.apiKey,
    "X-Customer": creds.customerId,
    "X-Signature": sig,
  };
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request(
  creds: NaverCreds, method: "GET" | "PUT" | "POST", uri: string,
  opts: { params?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<unknown> {
  const url = BASE_URL + uri + qs(opts.params);
  const r = await fetch(url, {
    method,
    headers: signHeaders(creds, method, uri),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`naver ${method} ${uri} ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

export const naver = {
  get: <T = unknown>(c: NaverCreds, uri: string, params?: Record<string, string | number | undefined>) =>
    request(c, "GET", uri, { params }) as Promise<T>,
  put: <T = unknown>(c: NaverCreds, uri: string, body: unknown, params?: Record<string, string | number | undefined>) =>
    request(c, "PUT", uri, { body, params }) as Promise<T>,
  post: <T = unknown>(c: NaverCreds, uri: string, body: unknown) =>
    request(c, "POST", uri, { body }) as Promise<T>,
  signHeaders,
  BASE_URL,
};
