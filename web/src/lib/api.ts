const BASE = "/api";

export class AuthError extends Error {
  constructor(msg = "auth required") { super(msg); this.name = "AuthError"; }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
  if (r.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/signup")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new AuthError();
  }
  return r;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await apiFetch(path, init);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

async function jsonBody<T>(path: string, method: string, body: unknown): Promise<T> {
  return json<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------- Auth ----------
export type Me = { email: string; activeCredentialId: number | null };
export const login = (email: string, password: string) => jsonBody<{ ok: true; email: string }>("/auth/login", "POST", { email, password });
export const signup = (email: string, password: string) => jsonBody<{ ok: true; email: string }>("/auth/signup", "POST", { email, password });
export const logout = () => jsonBody<{ ok: true }>("/auth/logout", "POST", {});
export const fetchMe = () => json<Me>("/auth/me");

// ---------- Credentials ----------
export type Credential = {
  id: number; label: string; customerId: string; apiKeyMasked: string;
  createdAt: string; isActive: boolean;
};
export const fetchCredentials = () => json<Credential[]>("/credentials");
export const addCredential = (c: { label: string; customerId: string; apiKey: string; secretKey: string }) =>
  jsonBody<{ ok: true; id: number }>("/credentials", "POST", c);
export const deleteCredential = (id: number) =>
  json<{ ok: true }>(`/credentials/${id}`, { method: "DELETE" });
export const activateCredential = (id: number) =>
  jsonBody<{ ok: true }>(`/credentials/${id}/activate`, "POST", {});

// ---------- Campaigns ----------
export type Campaign = {
  id: string; name: string; campaignTp: string;
  dailyBudget: number | null; userLock: boolean; status: string;
};
export const fetchCampaigns = () => json<Campaign[]>("/campaigns");

// ---------- Recommendations ----------
export type BidRec = {
  nccAdgroupId: string; name: string; currentBid: number; recommendedBid: number | null; reason: string;
  roas7: number; clicks7: number; sales7: number; convAmt7: number;
  sales30: number; convAmt30: number; clicks30: number;
};
export type KwRec = {
  nccKeywordId: string; keyword: string; currentBid: number; recommendedBid: number | null; reason: string;
  imp30: number; clk30: number; ctr30: number; sales30: number; convAmt30: number; roas30: number; avgRnk30: number;
};
export type RecSummary = { adgroupTotal: number; adgroupChanges: number; keywordTotal: number; keywordChanges: number };

export const fetchRecSummary = (id: string) =>
  json<RecSummary>(`/campaigns/${encodeURIComponent(id)}/recommendation-summary`);
export const fetchBidRecs = (id: string) =>
  json<BidRec[]>(`/recommendations/bids?campaign_id=${encodeURIComponent(id)}`);
export const applyBids = (items: { nccAdgroupId: string; bidAmt: number }[], dryRun: boolean) =>
  jsonBody<{ results: { ok: boolean }[] }>("/apply/bids", "POST", { items, dryRun });
export const fetchKeywordRecs = (id: string) =>
  json<KwRec[]>(`/recommendations/keywords?adgroup_id=${encodeURIComponent(id)}`);
export const applyKeywordBids = (items: { nccKeywordId: string; bidAmt: number }[], dryRun: boolean) =>
  jsonBody<{ results: { ok: boolean }[] }>("/apply/keywords", "POST", { items, dryRun });

// ---------- Dashboard ----------
export type DashRow = {
  id: string; name: string;
  impCnt: number; clkCnt: number; ctr: number; cost: number; cpc: number;
  purchaseCnt: number; purchaseCvr: number; purchaseAmt: number; purchaseRoas: number;
  totalConvCnt: number; totalConvAmt: number; totalRoas: number;
};
export const fetchDashCampaigns = (since: string, until: string) =>
  json<DashRow[]>(`/dashboard/campaigns?since=${since}&until=${until}`);
export const fetchDashAdgroups = (campaignId: string, since: string, until: string) =>
  json<DashRow[]>(`/dashboard/adgroups?campaign_id=${encodeURIComponent(campaignId)}&since=${since}&until=${until}`);
export const fetchDashKeywords = (adgroupId: string, since: string, until: string) =>
  json<DashRow[]>(`/dashboard/keywords?adgroup_id=${encodeURIComponent(adgroupId)}&since=${since}&until=${until}`);

// ---------- Rules ----------
export type RuleScope =
  | { type: "global" }
  | { type: "media"; campaignTps: string[] }
  | { type: "campaign"; campaignIds: string[] };
export type Tier = { roasMin: number; roasMax: number | null; changePct: number; label: string };
export type BidRuleParams = {
  targetRoas: number; minClicks: number; maxChangePct: number; bidFloor: number; tiers: Tier[];
};
export type KeywordRuleParams = BidRuleParams & {
  minImpressions: number; lowImpBoost: number;
  lowRankCtrThreshold: number; lowRankThreshold: number; lowRankBoost: number;
};
export type Rule<P> = { id: string; name: string; enabled: boolean; scope: RuleScope; params: P };
export type RulesStore = { bid: Rule<BidRuleParams>[]; keyword: Rule<KeywordRuleParams>[] };
export const fetchRules = () => json<RulesStore>("/rules");
export const saveRules = (s: RulesStore) => jsonBody<{ ok: true }>("/rules", "PUT", s);
