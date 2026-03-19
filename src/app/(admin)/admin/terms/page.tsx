"use client";

import { useEffect, useState, useCallback } from "react";
import type { TermListItem } from "@/types/term";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/term";
import TermFormDialog from "@/components/term/TermFormDialog";
import BulkCreateDialog from "@/components/term/BulkCreateDialog";
import TermEditDialog from "@/components/term/TermEditDialog";
import RequestsPanel from "@/components/term/RequestsPanel";

export default function TermsManagementPage() {
  const [terms, setTerms] = useState<TermListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState("");
  const [dialogType, setDialogType] = useState<"create" | "bulk" | "edit" | null>(null);
  const [editingTerm, setEditingTerm] = useState<TermListItem | null>(null);
  const [requestsPanelTermId, setRequestsPanelTermId] = useState<string | null>(null);

  const fetchTerms = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (yearFilter) params.set("year", yearFilter);

    try {
      const res = await fetch(`/api/terms?${params.toString()}`);
      const json: unknown = await res.json();
      const body = json as { data?: TermListItem[] };
      if (res.ok && body.data) setTerms(body.data);
    } catch {
      console.error("Failed to fetch terms");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  const handleStatusChange = async (term: TermListItem, newStatus: string) => {
    const confirmMsg =
      newStatus === "collecting"
        ? "希望休の受付を開始しますか？"
        : newStatus === "confirmed"
          ? "シフト表を確定しますか？確定後スタッフに公開されます。"
          : newStatus === "adjusting"
            ? "シフト表を差し戻しますか？"
            : "ステータスを変更しますか？";

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/terms/${term.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        alert(body.error?.message ?? "ステータス変更に失敗しました");
        return;
      }
      fetchTerms();
    } catch {
      alert("通信エラーが発生しました");
    }
  };

  const handleDelete = async (term: TermListItem) => {
    if (!confirm(`ターム ${term.start_date}〜${term.end_date} を削除しますか？`)) return;

    try {
      const res = await fetch(`/api/terms/${term.id}`, { method: "DELETE" });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        alert(body.error?.message ?? "削除に失敗しました");
        return;
      }
      fetchTerms();
    } catch {
      alert("通信エラーが発生しました");
    }
  };

  const handleDialogClose = (saved?: boolean) => {
    setDialogType(null);
    setEditingTerm(null);
    if (saved) fetchTerms();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ターム設定</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setDialogType("bulk")}
            className="rounded-md border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            年度一括登録
          </button>
          <button
            onClick={() => setDialogType("create")}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            個別登録
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="number"
          placeholder="年度で絞り込み (例: 2026)"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : terms.length === 0 ? (
        <p className="py-8 text-center text-gray-500">タームが登録されていません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">期間</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">年度</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">ステータス</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">希望休締切</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">日勤最低</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {terms.map((term) => (
                <tr key={term.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {term.start_date} 〜 {term.end_date}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {term.fiscal_year}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[term.status]}`}>
                      {STATUS_LABELS[term.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {term.request_deadline ?? "未設定"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {term.min_day_staff}名
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {/* Edit settings */}
                      {(term.status === "draft" || term.status === "collecting") && (
                        <button
                          onClick={() => { setEditingTerm(term); setDialogType("edit"); }}
                          className="rounded px-2 py-1 text-blue-600 hover:bg-blue-50"
                        >
                          編集
                        </button>
                      )}
                      {/* Delete (draft only) */}
                      {term.status === "draft" && (
                        <button
                          onClick={() => handleDelete(term)}
                          className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                        >
                          削除
                        </button>
                      )}
                      {/* Status transitions */}
                      {term.status === "draft" && (
                        <button
                          onClick={() => handleStatusChange(term, "collecting")}
                          className="rounded px-2 py-1 text-blue-600 hover:bg-blue-50"
                        >
                          受付開始
                        </button>
                      )}
                      {term.status === "collecting" && (
                        <button
                          onClick={() => setRequestsPanelTermId(requestsPanelTermId === term.id ? null : term.id)}
                          className="rounded px-2 py-1 text-purple-600 hover:bg-purple-50"
                        >
                          希望休
                        </button>
                      )}
                      {(term.status === "collecting" || term.status === "adjusting") && (
                        <a
                          href={`/admin/shifts/${term.id}`}
                          className="rounded px-2 py-1 text-indigo-600 hover:bg-indigo-50"
                        >
                          シフト表
                        </a>
                      )}
                      {term.status === "adjusting" && (
                        <button
                          onClick={() => handleStatusChange(term, "confirmed")}
                          className="rounded px-2 py-1 text-green-600 hover:bg-green-50"
                        >
                          確定
                        </button>
                      )}
                      {term.status === "confirmed" && (
                        <button
                          onClick={() => handleStatusChange(term, "adjusting")}
                          className="rounded px-2 py-1 text-orange-600 hover:bg-orange-50"
                        >
                          差し戻し
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {requestsPanelTermId && (
        <RequestsPanel
          termId={requestsPanelTermId}
          term={terms.find((t) => t.id === requestsPanelTermId)!}
          onClose={() => setRequestsPanelTermId(null)}
        />
      )}

      {dialogType === "create" && <TermFormDialog onClose={handleDialogClose} />}
      {dialogType === "bulk" && <BulkCreateDialog onClose={handleDialogClose} />}
      {dialogType === "edit" && editingTerm && (
        <TermEditDialog term={editingTerm} onClose={handleDialogClose} />
      )}
    </div>
  );
}
