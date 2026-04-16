"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { applyBids, BidRec, fetchBidRecs } from "@/lib/api";
import KeywordRecTable from "./KeywordRecTable";

type Props = {
  campaignId: string;
  campaignName: string;
  campaignTp: string;
  onClose: () => void;
};

type Row = BidRec & { selected: boolean; editedBid: number };

export default function BidRecommendationModal({ campaignId, campaignName, campaignTp, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const showKeywords = campaignTp === "WEB_SITE";

  useEffect(() => {
    fetchBidRecs(campaignId).then((recs) => {
      setRows(
        recs.map((r) => ({
          ...r,
          selected: r.recommendedBid !== null && r.recommendedBid !== r.currentBid,
          editedBid: r.recommendedBid ?? r.currentBid,
        }))
      );
      setLoading(false);
    });
  }, [campaignId]);

  const selectedItems = useMemo(
    () => rows.filter((r) => r.selected).map((r) => ({ nccAdgroupId: r.nccAdgroupId, bidAmt: r.editedBid })),
    [rows]
  );

  async function handleApply() {
    if (selectedItems.length === 0) return;
    if (!confirm(`${selectedItems.length}개 광고그룹의 입찰가를 실제로 변경합니다. 진행할까요?`)) return;
    setApplying(true);
    const res = await applyBids(selectedItems, false);
    setApplying(false);
    const okCount = res.results.filter((r: { ok: boolean }) => r.ok).length;
    const failCount = res.results.length - okCount;
    setResult(`적용 완료: 성공 ${okCount}건, 실패 ${failCount}건`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0, 0, 0, 0.6)" }}>
      <div className="card-elevated w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid var(--color-border)` }}>
          <div>
            <h2 className="text-tile">{campaignName}</h2>
            <p className="text-caption mt-1" style={{ color: "var(--color-text-subtle)" }}>
              7일 총 전환 ROAS 기반 입찰가 추천 (장바구니 포함)
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ fontSize: "18px", padding: "8px", borderRadius: "var(--radius-md)", color: "var(--color-text-subtle)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="text-caption" style={{ color: "var(--color-text-subtle)", padding: "32px 0", textAlign: "center" }}>
              불러오는 중...
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: "center" }}></th>
                  <th style={{ textAlign: "left" }}>광고그룹</th>
                  <th>현재</th>
                  <th>추천</th>
                  <th>적용값</th>
                  <th>7일 ROAS</th>
                  <th>7일 클릭</th>
                  <th style={{ textAlign: "left", paddingLeft: 20 }}>근거</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const noChange = r.recommendedBid === null;
                  const isExpanded = expanded.has(r.nccAdgroupId);
                  return (
                    <Fragment key={r.nccAdgroupId}>
                      <tr style={noChange ? { color: "var(--color-text-subtle)" } : undefined}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            disabled={noChange}
                            checked={r.selected}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, selected: v } : x)));
                            }}
                            style={{ accentColor: "var(--color-accent)" }}
                          />
                        </td>
                        <td style={{ textAlign: "left" }}>
                          {showKeywords && (
                            <button
                              onClick={() => {
                                setExpanded((s) => {
                                  const next = new Set(s);
                                  if (next.has(r.nccAdgroupId)) next.delete(r.nccAdgroupId);
                                  else next.add(r.nccAdgroupId);
                                  return next;
                                });
                              }}
                              style={{ marginRight: 8, color: "var(--color-text-subtle)", background: "transparent", border: 0, cursor: "pointer" }}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
                          <span style={{ fontWeight: 500 }}>{r.name}</span>
                        </td>
                        <td>{r.currentBid.toLocaleString()}</td>
                        <td>{r.recommendedBid?.toLocaleString() ?? "—"}</td>
                        <td>
                          <input
                            type="number"
                            step={10}
                            min={70}
                            disabled={noChange || !r.selected}
                            value={r.editedBid}
                            onChange={(e) => {
                              const v = parseInt(e.target.value || "0", 10);
                              setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, editedBid: v } : x)));
                            }}
                            className="input"
                            style={{ width: 90, textAlign: "right", padding: "4px 8px" }}
                          />
                        </td>
                        <td>{r.roas7.toFixed(0)}%</td>
                        <td>{r.clicks7.toLocaleString()}</td>
                        <td style={{ textAlign: "left", paddingLeft: 20, color: "var(--color-text-muted)", maxWidth: 320 }}>
                          {r.reason}
                        </td>
                      </tr>
                      {showKeywords && isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <KeywordRecTable adgroupId={r.nccAdgroupId} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: `1px solid var(--color-border)` }}>
          <div className="text-caption" style={{ color: "var(--color-text-muted)" }}>
            {result ?? `선택: ${selectedItems.length}건`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: r.recommendedBid !== null })))}
              className="btn btn-secondary btn-pill"
            >
              전체 선택
            </button>
            <button
              onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: false })))}
              className="btn btn-secondary btn-pill"
            >
              전체 해제
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-pill">
              닫기
            </button>
            <button
              onClick={handleApply}
              disabled={applying || selectedItems.length === 0}
              className="btn btn-primary btn-pill"
            >
              {applying ? "적용 중..." : `선택 ${selectedItems.length}건 적용`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
