"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";

type HolidayItem = {
  id: string;
  date: string;
  name: string;
  year: number;
  is_custom: boolean;
};

export default function HolidaysManagementPage() {
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (yearFilter) params.set("year", yearFilter);

    try {
      const res = await fetch(`/api/holidays?${params.toString()}`);
      const json: unknown = await res.json();
      const body = json as { data?: HolidayItem[] };
      if (res.ok && body.data) setHolidays(body.data);
    } catch {
      console.error("Failed to fetch holidays");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDate || !newName.trim()) {
      setFormError("日付と祝日名を入力してください");
      return;
    }
    setFormError("");
    setFormLoading(true);

    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, name: newName.trim() }),
      });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        setFormError(body.error?.message ?? "登録に失敗しました");
        return;
      }
      setNewDate("");
      setNewName("");
      setShowAddForm(false);
      fetchHolidays();
    } catch {
      setFormError("通信エラーが発生しました");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (holiday: HolidayItem) => {
    if (!confirm(`「${holiday.name}」(${holiday.date}) を削除しますか？`)) return;

    try {
      const res = await fetch(`/api/holidays/${holiday.id}`, { method: "DELETE" });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        alert(body.error?.message ?? "削除に失敗しました");
        return;
      }
      fetchHolidays();
    } catch {
      alert("通信エラーが発生しました");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">祝日マスタ</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showAddForm ? "閉じる" : "祝日追加"}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">病院独自の祝日を追加</h3>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">日付</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">祝日名</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: 開院記念日"
                className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={formLoading}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {formLoading ? "処理中..." : "追加"}
            </button>
          </form>
          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
        </div>
      )}

      <div className="mb-4">
        <input
          type="number"
          placeholder="年で絞り込み (例: 2026)"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : holidays.length === 0 ? (
        <p className="py-8 text-center text-gray-500">祝日データがありません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">日付</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">祝日名</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">種別</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {holidays.map((holiday) => (
                <tr key={holiday.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {holiday.date}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {holiday.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        holiday.is_custom
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {holiday.is_custom ? "カスタム" : "システム"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {holiday.is_custom && (
                      <button
                        onClick={() => handleDelete(holiday)}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
