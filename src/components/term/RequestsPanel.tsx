"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import type { TermListItem } from "@/types/term";

type RequestItem = {
  id: string;
  staff_id: string;
  staff_name: string;
  requested_date: string;
  created_at: string;
};

type StaffItem = {
  id: string;
  staff_code: string;
  name: string;
};

type RequestsPanelProps = {
  termId: string;
  term: TermListItem;
  onClose: () => void;
};

export default function RequestsPanel({ termId, term, onClose }: RequestsPanelProps) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/terms/${termId}/requests`);
      const json: unknown = await res.json();
      const body = json as { data?: RequestItem[] };
      if (res.ok && body.data) setRequests(body.data);
    } catch {
      console.error("Failed to fetch requests");
    } finally {
      setLoading(false);
    }
  }, [termId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Fetch staff list for proxy input
  useEffect(() => {
    const fetchStaffs = async () => {
      try {
        const res = await fetch("/api/staffs?is_active=true");
        const json: unknown = await res.json();
        const body = json as { data?: StaffItem[] };
        if (res.ok && body.data) setStaffList(body.data);
      } catch {
        console.error("Failed to fetch staffs");
      }
    };
    fetchStaffs();
  }, []);

  const handleProxySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !selectedDate) {
      setFormError("スタッフと日付を選択してください");
      return;
    }
    setFormError("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/terms/${termId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: selectedStaffId, requested_date: selectedDate }),
      });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        setFormError(body.error?.message ?? "登録に失敗しました");
        return;
      }
      setSelectedDate("");
      fetchRequests();
    } catch {
      setFormError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm("この希望休を取り消しますか？")) return;
    try {
      const res = await fetch(`/api/terms/${termId}/requests/${requestId}`, {
        method: "DELETE",
      });
      const json: unknown = await res.json();
      const body = json as { error?: { message?: string } };
      if (!res.ok) {
        alert(body.error?.message ?? "取消に失敗しました");
        return;
      }
      fetchRequests();
    } catch {
      alert("通信エラーが発生しました");
    }
  };

  // Group requests by staff
  const groupedRequests = requests.reduce<Record<string, RequestItem[]>>((acc, r) => {
    if (!acc[r.staff_id]) acc[r.staff_id] = [];
    acc[r.staff_id].push(r);
    return acc;
  }, {});

  return (
    <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">
          希望休一覧 ({term.start_date} 〜 {term.end_date})
        </h3>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-200"
        >
          閉じる
        </button>
      </div>

      {/* Proxy input form */}
      <div className="mb-4 rounded-md border border-gray-200 bg-white p-3">
        <h4 className="mb-2 text-sm font-medium text-gray-700">代理入力</h4>
        <form onSubmit={handleProxySubmit} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">スタッフ</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="">選択してください</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staff_code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">日付</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={term.start_date}
              max={term.end_date}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-gray-400"
          >
            {submitting ? "処理中..." : "登録"}
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      </div>

      {/* Requests list */}
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500">希望休の申請はありません</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedRequests).map(([staffId, staffRequests]) => (
            <div key={staffId} className="rounded-md border border-gray-200 bg-white p-3">
              <h4 className="mb-2 text-sm font-medium text-gray-900">
                {staffRequests[0].staff_name}（{staffRequests.length}/3）
              </h4>
              <div className="flex flex-wrap gap-2">
                {staffRequests.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {r.requested_date}
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="ml-0.5 text-blue-500 hover:text-red-600"
                      title="取消"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
