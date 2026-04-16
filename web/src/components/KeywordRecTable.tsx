"use client";
import { useEffect, useState } from "react";
import { applyKeywordBids, fetchKeywordRecs, KwRec } from "@/lib/api";

type Row = KwRec & { selected: boolean; editedBid: number };

export default function KeywordRecTable({ adgroupId }: { adgroupId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetchKeywordRecs(adgroupId).then((recs) => {
      setRows(
        recs.map((r) => ({
          ...r,
          selected: r.recommendedBid !== null && r.recommendedBid !== r.currentBid,
          editedBid: r.recommendedBid ?? r.currentBid,
        }))
      );
      setLoading(false);
    });
  }, [adgroupId]);

  const selected = rows.filter((r) => r.selected);

  async function handleApply() {
    if (selected.length === 0) return;
    if (!confirm(`키워드 ${selected.length}개 입찰가를 변경합니다. 진행할까요?`)) return;
    setApplying(true);
    const res = await applyKeywordBids(
      selected.map((r) => ({ nccKeywordId: r.nccKeywordId, bidAmt: r.editedBid })),
      false,
    );
    setApplying(false);
    const ok = res.results.filter((r: { ok: boolean }) => r.ok).length;
    setResult(`키워드 ${ok}/${res.results.length}건 적용`);
  }

  if (loading) {
    return (
      <div className="text-micro" style={{ padding: "12px 16px", color: "var(--color-text-subtle)" }}>
        키워드 추천 불러오는 중...
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-micro" style={{ padding: "12px 16px", color: "var(--color-text-subtle)" }}>
        활성 키워드 없음
      </div>
    );
  }

  return (
    <div style={{ background: "var(--color-surface-alt)", padding: "12px 16px" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 28, textAlign: "center" }}></th>
            <th style={{ textAlign: "left" }}>키워드</th>
            <th>현재</th>
            <th>추천</th>
            <th>적용값</th>
            <th>노출</th>
            <th>클릭</th>
            <th>CTR</th>
            <th>순위</th>
            <th>ROAS</th>
            <th style={{ textAlign: "left", paddingLeft: 16 }}>근거</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const noChange = r.recommendedBid === null;
            return (
              <tr key={r.nccKeywordId} style={noChange ? { color: "var(--color-text-subtle)" } : undefined}>
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
                <td style={{ textAlign: "left", fontWeight: 500 }}>{r.keyword}</td>
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
                    style={{ width: 76, textAlign: "right", padding: "3px 6px" }}
                  />
                </td>
                <td>{r.imp30.toLocaleString()}</td>
                <td>{r.clk30.toLocaleString()}</td>
                <td>{r.ctr30.toFixed(1)}%</td>
                <td>{r.avgRnk30 ? r.avgRnk30.toFixed(1) : "—"}</td>
                <td>{r.sales30 ? `${r.roas30.toFixed(0)}%` : "—"}</td>
                <td style={{ textAlign: "left", paddingLeft: 16, color: "var(--color-text-muted)", maxWidth: 280 }}>
                  {r.reason}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
        <span className="text-micro" style={{ color: "var(--color-text-muted)" }}>
          {result ?? `선택 ${selected.length}건`}
        </span>
        <button
          onClick={handleApply}
          disabled={applying || selected.length === 0}
          className="btn btn-primary btn-pill"
          style={{ fontSize: 12, padding: "5px 12px" }}
        >
          {applying ? "적용 중..." : `키워드 ${selected.length}건 적용`}
        </button>
      </div>
    </div>
  );
}
