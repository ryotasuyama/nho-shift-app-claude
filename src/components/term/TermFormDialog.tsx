"use client";

import { useState, type FormEvent } from "react";

type TermFormDialogProps = {
  onClose: (saved?: boolean) => void;
};

export default function TermFormDialog({ onClose }: TermFormDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!startDate) {
      setError("開始日を入力してください");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: startDate }),
      });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "登録に失敗しました");
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
        <h2 className="mb-4 text-lg font-bold text-gray-900">ターム個別登録</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">開始日</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">終了日は開始日+27日で自動計算されます</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => onClose()} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">キャンセル</button>
            <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400">{loading ? "処理中..." : "登録"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
