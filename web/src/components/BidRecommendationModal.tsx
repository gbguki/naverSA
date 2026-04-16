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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">입찰가 추천 — {campaignName}</h2>
            <p className="text-sm text-gray-500">최근 7일 데이터 기반 (목표 ROAS 250%)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="text-gray-500">불러오는 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-gray-500">
                <tr>
                  <th className="py-2 w-8"></th>
                  <th className="py-2">광고그룹</th>
                  <th className="py-2 text-right">현재</th>
                  <th className="py-2 text-right">추천</th>
                  <th className="py-2 text-right">적용값</th>
                  <th className="py-2 text-right">7일 ROAS</th>
                  <th className="py-2 text-right">7일 클릭</th>
                  <th className="py-2">근거</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const noChange = r.recommendedBid === null;
                  const isExpanded = expanded.has(r.nccAdgroupId);
                  return (
                    <Fragment key={r.nccAdgroupId}>
                    <tr className={`border-b ${noChange ? "text-gray-400" : ""}`}>
                      <td className="py-2">
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
                      <td className="py-2">
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
                            className="mr-2 text-gray-500 hover:text-gray-800"
                          >
                            {isExpanded ? "▼" : "▶"}
                          </button>
                        )}
                        {r.name}
                      </td>
                      <td className="py-2 text-right">{r.currentBid.toLocaleString()}</td>
                      <td className="py-2 text-right">{r.recommendedBid?.toLocaleString() ?? "—"}</td>
                      <td className="py-2 text-right">
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
                          className="w-24 rounded border px-2 py-1 text-right disabled:bg-gray-50"
                        />
                      </td>
                      <td className="py-2 text-right">{r.roas7.toFixed(0)}%</td>
                      <td className="py-2 text-right">{r.clicks7}</td>
                      <td className="py-2 text-gray-600">{r.reason}</td>
                    </tr>
                    {showKeywords && isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-0">
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

        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="text-sm text-gray-600">
            {result ?? `선택: ${selectedItems.length}건`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: r.recommendedBid !== null })))}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              전체 선택
            </button>
            <button
              onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: false })))}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              전체 해제
            </button>
            <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
              닫기
            </button>
            <button
              onClick={handleApply}
              disabled={applying || selectedItems.length === 0}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              {applying ? "적용 중..." : `선택 ${selectedItems.length}건 적용`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
