"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Campaign,
  DashRow,
  fetchCampaigns,
  fetchDashAdgroups,
  fetchDashCampaigns,
  fetchDashKeywords,
  fetchMe,
} from "@/lib/api";
import BidRecommendationModal from "@/components/BidRecommendationModal";

type Preset = "today" | "yesterday" | "last3" | "last7" | "mtd" | "custom";
type Media = "all" | "powerlink" | "shopping";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolvePreset(p: Preset): { since: string; until: string } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  if (p === "today") return { since: ymd(today), until: ymd(today) };
  if (p === "yesterday") { const y = new Date(today.getTime() - dayMs); return { since: ymd(y), until: ymd(y) }; }
  if (p === "last3") { const u = new Date(today.getTime() - dayMs); const s = new Date(today.getTime() - 3 * dayMs); return { since: ymd(s), until: ymd(u) }; }
  if (p === "last7") { const u = new Date(today.getTime() - dayMs); const s = new Date(today.getTime() - 7 * dayMs); return { since: ymd(s), until: ymd(u) }; }
  if (p === "mtd") { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { since: ymd(s), until: ymd(today) }; }
  return null;
}

const MEDIA_TO_TP: Record<Media, string[] | null> = {
  all: null,
  powerlink: ["WEB_SITE"],
  shopping: ["SHOPPING"],
};

type Level = "campaign" | "adgroup" | "keyword";
type Crumb = { level: Level; parentId?: string; parentName?: string; parentTp?: string };
type SortKey = keyof DashRow;
type SortDir = "asc" | "desc";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mediaParam = (searchParams.get("media") as Media) || "all";

  const [preset, setPreset] = useState<Preset>("yesterday");
  const [customSince, setCustomSince] = useState(ymd(new Date()));
  const [customUntil, setCustomUntil] = useState(ymd(new Date()));
  const [stack, setStack] = useState<Crumb[]>([{ level: "campaign" }]);
  const [rows, setRows] = useState<DashRow[]>([]);
  const [campaignsMeta, setCampaignsMeta] = useState<Record<string, Campaign>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [recModal, setRecModal] = useState<{ id: string; name: string; tp: string } | null>(null);
  const [ready, setReady] = useState(false);

  // 인증 + 활성 자격증명 체크 후에만 대시보드 렌더. 둘 중 하나라도 없으면 해당 페이지로 이동.
  useEffect(() => {
    fetchMe()
      .then((me) => {
        if (!me.activeCredentialId) {
          router.replace("/settings/credentials");
          return;
        }
        setReady(true);
      })
      .catch(() => { /* fetchMe의 AuthError 핸들러가 /login으로 보냄 */ });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    fetchCampaigns().then((cs) => {
      setCampaignsMeta(Object.fromEntries(cs.map((c) => [c.id, c])));
    });
  }, [ready]);

  // 매체 변경 시 드릴다운 초기화
  useEffect(() => { setStack([{ level: "campaign" }]); }, [mediaParam]);

  const period = useMemo(() => {
    if (preset === "custom") return { since: customSince, until: customUntil };
    return resolvePreset(preset)!;
  }, [preset, customSince, customUntil]);

  const current = stack[stack.length - 1];

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { since, until } = period;
    const p =
      current.level === "campaign"
        ? fetchDashCampaigns(since, until)
        : current.level === "adgroup"
        ? fetchDashAdgroups(current.parentId!, since, until)
        : fetchDashKeywords(current.parentId!, since, until);
    p.then((data) => { if (!cancelled) setRows(data); })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [current, period, ready]);

  const filtered = useMemo(() => {
    if (current.level !== "campaign") return rows;
    const tps = MEDIA_TO_TP[mediaParam];
    if (!tps) return rows;
    return rows.filter((r) => {
      const meta = campaignsMeta[r.id];
      return meta && tps.includes(meta.campaignTp);
    });
  }, [rows, current, mediaParam, campaignsMeta]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { impCnt: 0, clkCnt: 0, cost: 0, purchaseCnt: 0, purchaseAmt: 0, totalConvCnt: 0, totalConvAmt: 0 };
    for (const r of filtered) {
      t.impCnt += r.impCnt; t.clkCnt += r.clkCnt; t.cost += r.cost;
      t.purchaseCnt += r.purchaseCnt; t.purchaseAmt += r.purchaseAmt;
      t.totalConvCnt += r.totalConvCnt; t.totalConvAmt += r.totalConvAmt;
    }
    return t;
  }, [filtered]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function drillDown(row: DashRow) {
    if (current.level === "keyword") return;
    const next: Level = current.level === "campaign" ? "adgroup" : "keyword";
    const parentTp = current.level === "campaign" ? campaignsMeta[row.id]?.campaignTp : current.parentTp;
    setStack([...stack, { level: next, parentId: row.id, parentName: row.name, parentTp }]);
  }

  function goTo(idx: number) { setStack(stack.slice(0, idx + 1)); }

  function openRec(row: DashRow) {
    const meta = campaignsMeta[row.id];
    if (!meta) return;
    setRecModal({ id: row.id, name: row.name, tp: meta.campaignTp });
  }

  const mediaLabel = mediaParam === "powerlink" ? "파워링크" : mediaParam === "shopping" ? "쇼핑검색" : "전체";

  if (!ready) {
    return (
      <div className="p-8 text-caption" style={{ color: "var(--color-text-subtle)" }}>
        확인 중...
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-[1480px] mx-auto">
        <header className="mb-6">
          <div className="text-caption" style={{ color: "var(--color-text-subtle)" }}>대시보드</div>
          <h1 className="text-display mt-1">{mediaLabel}</h1>
          <p className="text-caption mt-2" style={{ color: "var(--color-text-muted)" }}>
            구매완료 전환 기준 성과 · 장바구니 제외
          </p>
        </header>

        {/* 매체 탭 */}
        <div className="mb-4 flex gap-1">
          {(["all", "powerlink", "shopping"] as Media[]).map((m) => (
            <button
              key={m}
              onClick={() => router.push(`/?media=${m}`)}
              className={`btn ${mediaParam === m ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: "13px" }}
            >
              {m === "all" ? "전체" : m === "powerlink" ? "파워링크" : "쇼핑검색"}
            </button>
          ))}
        </div>

        {/* 기간 선택 */}
        <div className="surface mb-4 p-3 flex flex-wrap items-center gap-2" style={{ border: "1px solid var(--color-border)" }}>
          {([
            ["today", "오늘"], ["yesterday", "어제"], ["last3", "최근 3일"],
            ["last7", "최근 7일"], ["mtd", "이번 달"], ["custom", "직접 지정"],
          ] as [Preset, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`btn btn-pill ${preset === p ? "btn-primary" : "btn-secondary"}`}
            >
              {label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="ml-2 flex items-center gap-2">
              <input type="date" value={customSince} onChange={(e) => setCustomSince(e.target.value)} className="input" />
              <span className="text-caption" style={{ color: "var(--color-text-subtle)" }}>~</span>
              <input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} className="input" />
            </div>
          )}
          <div className="ml-auto text-caption" style={{ color: "var(--color-text-subtle)" }}>
            {period.since} ~ {period.until}
          </div>
        </div>

        {/* 브레드크럼 */}
        <div className="mb-3 flex items-center gap-2 text-caption">
          {stack.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span style={{ color: "var(--color-text-subtle)" }}>/</span>}
              <button
                onClick={() => goTo(i)}
                style={{ color: i === stack.length - 1 ? "var(--color-text)" : "var(--color-link)", fontWeight: i === stack.length - 1 ? 600 : 400 }}
                className="hover:underline"
              >
                {c.level === "campaign" ? "캠페인" : c.level === "adgroup" ? `광고그룹 · ${c.parentName}` : `키워드 · ${c.parentName}`}
              </button>
            </span>
          ))}
        </div>

        {current.level === "keyword" && (
          <p className="text-micro mb-2" style={{ color: "var(--color-text-subtle)" }}>
            키워드별 구매완료는 리포트 상 키워드ID가 있는 행만 집계됩니다 (확장검색/소재 단위 전환은 제외).
          </p>
        )}
        {preset === "today" && (
          <p className="text-micro mb-2" style={{ color: "var(--color-danger)" }}>
            오늘 데이터는 실시간 집계로 변동될 수 있습니다.
          </p>
        )}

        <div className="card-elevated overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir} align="left">
                  {current.level === "campaign" ? "캠페인" : current.level === "adgroup" ? "광고그룹" : "키워드"}
                </Th>
                <Th onClick={() => toggleSort("impCnt")} active={sortKey === "impCnt"} dir={sortDir}>노출</Th>
                <Th onClick={() => toggleSort("clkCnt")} active={sortKey === "clkCnt"} dir={sortDir}>클릭</Th>
                <Th onClick={() => toggleSort("ctr")} active={sortKey === "ctr"} dir={sortDir}>CTR</Th>
                <Th onClick={() => toggleSort("cost")} active={sortKey === "cost"} dir={sortDir}>비용</Th>
                <Th onClick={() => toggleSort("cpc")} active={sortKey === "cpc"} dir={sortDir}>CPC</Th>
                <Th onClick={() => toggleSort("purchaseCnt")} active={sortKey === "purchaseCnt"} dir={sortDir} emph>구매 전환</Th>
                <Th onClick={() => toggleSort("purchaseCvr")} active={sortKey === "purchaseCvr"} dir={sortDir} emph>구매 CVR</Th>
                <Th onClick={() => toggleSort("purchaseAmt")} active={sortKey === "purchaseAmt"} dir={sortDir} emph>구매 매출</Th>
                <Th onClick={() => toggleSort("purchaseRoas")} active={sortKey === "purchaseRoas"} dir={sortDir} emph>구매 ROAS</Th>
                <Th onClick={() => toggleSort("totalConvCnt")} active={sortKey === "totalConvCnt"} dir={sortDir} muted>총 전환</Th>
                <Th onClick={() => toggleSort("totalConvAmt")} active={sortKey === "totalConvAmt"} dir={sortDir} muted>총 매출</Th>
                <Th onClick={() => toggleSort("totalRoas")} active={sortKey === "totalRoas"} dir={sortDir} muted>총 ROAS</Th>
                {current.level === "campaign" && <th style={{ textAlign: "right" }}>액션</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={14} style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-text-subtle)" }}>불러오는 중...</td></tr>}
              {!loading && error && <tr><td colSpan={14} style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-danger)" }}>오류: {error}</td></tr>}
              {!loading && !error && sorted.length === 0 && <tr><td colSpan={14} style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-text-subtle)" }}>데이터 없음</td></tr>}
              {!loading && !error && sorted.map((r) => (
                <tr key={r.id}>
                  <td>
                    {current.level !== "keyword" ? (
                      <button onClick={() => drillDown(r)} style={{ color: "var(--color-link)", fontWeight: 500, background: "transparent", border: 0, padding: 0, cursor: "pointer" }} className="hover:underline">
                        {r.name}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                    )}
                  </td>
                  <td>{r.impCnt.toLocaleString()}</td>
                  <td>{r.clkCnt.toLocaleString()}</td>
                  <td>{r.ctr.toFixed(2)}%</td>
                  <td>{r.cost.toLocaleString()}원</td>
                  <td>{r.cpc.toLocaleString()}원</td>
                  <td className="col-emph">{r.purchaseCnt.toLocaleString()}</td>
                  <td className="col-emph">{r.purchaseCvr.toFixed(2)}%</td>
                  <td className="col-emph">{r.purchaseAmt.toLocaleString()}원</td>
                  <td className="col-emph" style={{ fontWeight: 600 }}>{r.purchaseRoas.toFixed(2)}%</td>
                  <td className="col-muted">{r.totalConvCnt.toLocaleString()}</td>
                  <td className="col-muted">{r.totalConvAmt.toLocaleString()}원</td>
                  <td className="col-muted">{r.totalRoas.toFixed(2)}%</td>
                  {current.level === "campaign" && (
                    <td>
                      <button onClick={() => openRec(r)} className="btn btn-secondary btn-pill" disabled={!campaignsMeta[r.id]}>
                        추천
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {!loading && !error && filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td>합계 ({filtered.length}행)</td>
                  <td>{totals.impCnt.toLocaleString()}</td>
                  <td>{totals.clkCnt.toLocaleString()}</td>
                  <td>{totals.impCnt ? (totals.clkCnt / totals.impCnt * 100).toFixed(2) : "0.00"}%</td>
                  <td>{totals.cost.toLocaleString()}원</td>
                  <td>{totals.clkCnt ? Math.round(totals.cost / totals.clkCnt).toLocaleString() : 0}원</td>
                  <td className="col-emph">{totals.purchaseCnt.toLocaleString()}</td>
                  <td className="col-emph">{totals.clkCnt ? (totals.purchaseCnt / totals.clkCnt * 100).toFixed(2) : "0.00"}%</td>
                  <td className="col-emph">{totals.purchaseAmt.toLocaleString()}원</td>
                  <td className="col-emph">{totals.cost ? (totals.purchaseAmt / totals.cost * 100).toFixed(2) : "0.00"}%</td>
                  <td className="col-muted">{totals.totalConvCnt.toLocaleString()}</td>
                  <td className="col-muted">{totals.totalConvAmt.toLocaleString()}원</td>
                  <td className="col-muted">{totals.cost ? (totals.totalConvAmt / totals.cost * 100).toFixed(2) : "0.00"}%</td>
                  {current.level === "campaign" && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {recModal && (
        <BidRecommendationModal
          campaignId={recModal.id}
          campaignName={recModal.name}
          campaignTp={recModal.tp}
          onClose={() => setRecModal(null)}
        />
      )}
    </div>
  );
}

function Th({ children, onClick, active, dir, align = "right", emph, muted }: {
  children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir;
  align?: "left" | "right"; emph?: boolean; muted?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      style={{ cursor: "pointer", userSelect: "none", textAlign: align }}
      className={`${emph ? "col-emph" : ""} ${muted ? "col-muted" : ""}`}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children}
        {active && <span style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}
