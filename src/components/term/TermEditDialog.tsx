"use client";

import { useState, type FormEvent } from "react";
import type { TermListItem } from "@/types/term";

type TermEditDialogProps = {
  term: TermListItem;
  onClose: (saved?: boolean) => void;
};

export default function TermEditDialog({ term, onClose }: TermEditDialogProps) {
  const [requestDeadline, setRequestDeadline] = useState(term.request_deadline ?? "");
  const [minDayStaff, setMinDayStaff] = useState(String(term.min_day_staff));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const minStaffNum = Number(minDayStaff);
    if (!Number.isInteger(minStaffNum) || minStaffNum < 1 || minStaffNum > 20) {
      setError("日勤最低人数は1〜20の範囲で設定してください");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/terms/${term.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_deadline: requestDeadline || null,
          min_day_staff: minStaffNum,
        }),
      });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "更新に失敗しました");
        return;
      }
      onClose(true);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-bold text-gray-900">ターム設定編集</h2>
        <p className="mb-4 text-sm text-gray-500">
          {term.start_date} 〜 {term.end_date}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">希望休締切日</label>
            <input
              type="date"
              value={requestDeadline}
              onChange={(e) => setRequestDeadline(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">空欄で未設定にできます</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">日勤最低人数</label>
            <input
              type="number"
              min={1}
              max={20}
              value={minDayStaff}
              onChange={(e) => setMinDayStaff(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "処理中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
