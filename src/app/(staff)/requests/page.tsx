"use client";

import { useEffect, useState, useCallback } from "react";
import type { TermListItem } from "@/types/term";
import { apiFetch } from "@/lib/api/client";
import { WEEKDAY_LABELS } from "@/lib/constants/shift";
import { parseDate, addDays, formatDate } from "@/lib/utils/date";

type RequestItem = {
  id: string;
  staff_id: string;
  staff_name: string;
  requested_date: string;
  created_at: string;
};

export default function RequestsPage() {
  const [terms, setTerms] = useState<TermListItem[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Fetch collecting terms
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const { data } = await apiFetch<TermListItem[]>("/api/terms?status=collecting");
        if (data) {
          setTerms(data);
          if (data.length > 0 && !selectedTermId) {
            setSelectedTermId(data[0].id);
          }
        }
      } catch {
        console.error("Failed to fetch terms");
      } finally {
        setLoading(false);
      }
    };
    fetchTerms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get staff_id from session (stored in cookie by login)
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data } = await apiFetch<{ staff_id?: string }>("/api/auth/session");
        if (data?.staff_id) {
          setStaffId(data.staff_id);
        }
      } catch {
        // session endpoint may not exist yet, try localStorage fallback
      }
    };
    fetchSession();
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!selectedTermId) return;
    try {
      const { data } = await apiFetch<RequestItem[]>(`/api/terms/${selectedTermId}/requests`);
      if (data) setRequests(data);
    } catch {
      console.error("Failed to fetch requests");
    }
  }, [selectedTermId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const isAfterDeadline = selectedTerm?.request_deadline
    ? new Date().toISOString().slice(0, 10) > selectedTerm.request_deadline
    : false;
  const remainingCount = 3 - requests.length;

  // Generate calendar dates for the selected term
  const calendarDates: string[] = [];
  if (selectedTerm) {
    const start = parseDate(selectedTerm.start_date);
    for (let i = 0; i < 28; i++) {
      calendarDates.push(formatDate(addDays(start, i)));
    }
  }

  const requestedDates = new Set(requests.map((r) => r.requested_date));

  const handleDateClick = async (date: string) => {
    if (isAfterDeadline || !staffId || !selectedTermId) return;

    if (requestedDates.has(date)) {
      // Cancel existing request
      const req = requests.find((r) => r.requested_date === date);
      if (!req) return;
      setSubmitting(true);
      setError("");
      try {
        const { error: errMsg } = await apiFetch(`/api/terms/${selectedTermId}/requests/${req.id}`, {
          method: "DELETE",
        });
        if (errMsg) {
          setError(errMsg);
          return;
        }
        fetchRequests();
      } catch {
        setError("通信エラーが発生しました");
      } finally {
        setSubmitting(false);
      }
    } else {
      // Create new request
      if (remainingCount <= 0) {
        setError("希望休は最大3日までです");
        return;
      }
      setSubmitting(true);
      setError("");
      try {
        const { error: errMsg } = await apiFetch(`/api/terms/${selectedTermId}/requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staff_id: staffId, requested_date: date }),
        });
        if (errMsg) {
          setError(errMsg);
          return;
        }
        fetchRequests();
      } catch {
        setError("通信エラーが発生しました");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const getDayOfWeek = (dateStr: string) => parseDate(dateStr).getUTCDay();

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">希望休入力</h1>
        <p className="mt-4 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (terms.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">希望休入力</h1>
        <p className="mt-4 text-gray-500">現在受付中のタームはありません</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900">希望休入力</h1>

      {/* Term selector */}
      {terms.length > 1 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">対象ターム</label>
          <select
            value={selectedTermId ?? ""}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.start_date} 〜 {t.end_date}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedTerm && (
        <>
          {/* Info */}
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <p>
              期間: {selectedTerm.start_date} 〜 {selectedTerm.end_date}
            </p>
            {selectedTerm.request_deadline && (
              <p>
                締切日: {selectedTerm.request_deadline} 23:59 (JST)
              </p>
            )}
          </div>

          {isAfterDeadline && (
            <div className="mt-3 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
              申請受付は終了しました（締切日: {selectedTerm.request_deadline}）
            </div>
          )}

          {/* Remaining count */}
          {!isAfterDeadline && (
            <div className="mt-3 text-sm text-gray-700">
              あと <span className="font-bold text-blue-600">{remainingCount}</span> 日選択できます
            </div>
          )}

          {/* Calendar */}
          <div className="mt-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`py-1 text-center text-xs font-medium ${
                    i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Offset for first week */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before start */}
              {calendarDates.length > 0 &&
                Array.from({ length: getDayOfWeek(calendarDates[0]) }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}

              {calendarDates.map((date) => {
                const dow = getDayOfWeek(date);
                const isRequested = requestedDates.has(date);
                const dayNum = date.slice(8);
                const canClick = !isAfterDeadline && !submitting && staffId !== null;

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => canClick && handleDateClick(date)}
                    disabled={!canClick}
                    className={`relative flex h-10 items-center justify-center rounded-md text-sm transition-colors ${
                      isRequested
                        ? "bg-blue-600 font-bold text-white"
                        : dow === 0
                          ? "bg-red-50 text-red-700 hover:bg-red-100"
                          : dow === 6
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : "bg-white text-gray-900 hover:bg-gray-100"
                    } ${!canClick ? "cursor-default opacity-60" : "cursor-pointer"} border border-gray-200`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error message */}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/* Selected dates list */}
          {requests.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700">申請済みの希望休</h3>
              <ul className="mt-2 space-y-1">
                {requests.map((r) => {
                  const dow = getDayOfWeek(r.requested_date);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-gray-900">
                        {r.requested_date} ({WEEKDAY_LABELS[dow]})
                      </span>
                      {!isAfterDeadline && (
                        <button
                          type="button"
                          onClick={() => handleDateClick(r.requested_date)}
                          disabled={submitting}
                          className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                        >
                          取消
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
