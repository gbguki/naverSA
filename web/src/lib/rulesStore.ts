// Supabase rules 테이블 접근. 기존 rules_store.json 대체.
import { DEFAULT_RULES, type RulesStore, resolveRule, type Rule, type BidParams, type KeywordParams } from "./rules";
import { supabaseServer } from "./supabase/server";
import { naver, type NaverCreds } from "./naver";

export async function loadRules(): Promise<RulesStore> {
  const sb = await supabaseServer();
  const { data } = await sb.from("rules").select("data").eq("id", 1).maybeSingle();
  if (!data) {
    await sb.from("rules").upsert({ id: 1, data: DEFAULT_RULES });
    return DEFAULT_RULES;
  }
  return data.data as RulesStore;
}

export async function saveRules(store: RulesStore): Promise<void> {
  const sb = await supabaseServer();
  await sb.from("rules").upsert({ id: 1, data: store, updated_at: new Date().toISOString() });
}

type CampInfo = { nccCampaignId?: string; campaignTp?: string };
type GroupInfo = { nccCampaignId?: string };

export async function resolveRuleForAdgroup(
  creds: NaverCreds, kind: "bid" | "keyword", adgroupId: string,
): Promise<BidParams | KeywordParams> {
  let campaignId = "";
  let tp = "";
  try {
    const ag = await naver.get<GroupInfo>(creds, `/ncc/adgroups/${adgroupId}`);
    campaignId = ag.nccCampaignId ?? "";
    if (campaignId) {
      const camp = await naver.get<CampInfo>(creds, `/ncc/campaigns/${campaignId}`);
      tp = camp.campaignTp ?? "";
    }
  } catch { /* ignore */ }
  const store = await loadRules();
  const rules = kind === "bid" ? store.bid : store.keyword;
  const rule = resolveRule<BidParams | KeywordParams>(rules as Rule<BidParams | KeywordParams>[], campaignId, tp);
  return rule?.params ?? {};
}

export async function resolveRuleForCampaign(
  creds: NaverCreds, kind: "bid" | "keyword", campaignId: string,
): Promise<BidParams | KeywordParams> {
  let tp = "";
  try {
    const camp = await naver.get<CampInfo>(creds, `/ncc/campaigns/${campaignId}`);
    tp = camp.campaignTp ?? "";
  } catch { /* ignore */ }
  const store = await loadRules();
  const rules = kind === "bid" ? store.bid : store.keyword;
  const rule = resolveRule<BidParams | KeywordParams>(rules as Rule<BidParams | KeywordParams>[], campaignId, tp);
  return rule?.params ?? {};
}
