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

  if (loading) return <div className="px-4 py-3 text-xs text-gray-500">키워드 추천 불러오는 중...</div>;
  if (rows.length === 0) return <div className="px-4 py-3 text-xs text-gray-500">활성 키워드 없음</div>;

  return (
    <div className="bg-gray-50 px-4 py-3">
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-1 w-6"></th>
            <th className="py-1">키워드</th>
            <th className="py-1 text-right">현재</th>
            <th className="py-1 text-right">추천</th>
            <th className="py-1 text-right">적용값</th>
            <th className="py-1 text-right">노출</th>
            <th className="py-1 text-right">클릭</th>
            <th className="py-1 text-right">CTR</th>
            <th className="py-1 text-right">순위</th>
            <th className="py-1 text-right">ROAS</th>
            <th className="py-1">근거</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const noChange = r.recommendedBid === null;
            return (
              <tr key={r.nccKeywordId} className={`border-t border-gray-200 ${noChange ? "text-gray-400" : ""}`}>
                <td className="py-1">
                  <input
                    type="checkbox"
                    disabled={noChange}
                    checked={r.selected}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, selected: v } : x)));
                    }}
                  />
                </td>
                <td className="py-1">{r.keyword}</td>
                <td className="py-1 text-right">{r.currentBid.toLocaleString()}</td>
                <td className="py-1 text-right">{r.recommendedBid?.toLocaleString() ?? "—"}</td>
                <td className="py-1 text-right">
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
                    className="w-20 rounded border px-1 py-0.5 text-right disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 text-right">{r.imp30.toLocaleString()}</td>
                <td className="py-1 text-right">{r.clk30}</td>
                <td className="py-1 text-right">{r.ctr30.toFixed(1)}%</td>
                <td className="py-1 text-right">{r.avgRnk30 ? r.avgRnk30.toFixed(1) : "—"}</td>
                <td className="py-1 text-right">{r.sales30 ? `${r.roas30.toFixed(0)}%` : "—"}</td>
                <td className="py-1 text-gray-600">{r.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-600">{result ?? `선택 ${selected.length}건`}</span>
        <button
          onClick={handleApply}
          disabled={applying || selected.length === 0}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {applying ? "적용 중..." : `키워드 ${selected.length}건 적용`}
        </button>
      </div>
    </div>
  );
}
