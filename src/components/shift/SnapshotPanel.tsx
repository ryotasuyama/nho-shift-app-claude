"use client";

import { useState, useCallback } from "react";
import { useShiftStore } from "@/stores/shift-store";

type Snapshot = {
  id: string;
  version: number;
  created_by: string;
  created_at: string;
  entry_count: number;
};

type SnapshotPanelProps = {
  termId: string;
  onDataReload: () => void;
};

export default function SnapshotPanel({ termId, onDataReload }: SnapshotPanelProps) {
  const { term } = useShiftStore();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/terms/${termId}/snapshots`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: Snapshot[] };
      setSnapshots(json.data);
    } catch {
      console.error("Failed to fetch snapshots");
    } finally {
      setLoading(false);
    }
  }, [termId]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    fetchSnapshots();
  }, [fetchSnapshots]);

  const handleRestore = useCallback(
    async (snapshotId: string, version: number) => {
      if (!term) return;
      if (!confirm(`バージョン ${version} に復元しますか？現在のデータは上書きされます。`)) return;

      setRestoring(snapshotId);
      try {
        const res = await fetch(`/api/terms/${termId}/snapshots/${snapshotId}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lock_version: term.lock_version }),
        });
        const json = (await res.json()) as {
          data?: { excluded_staffs?: { name: string; staff_code: string }[] };
          error?: { message?: string };
        };

        if (!res.ok) {
          if (res.status === 409) {
            alert("他のユーザーがシフトを変更しました。画面を再読み込みしてください。");
          } else {
            alert(json.error?.message ?? "復元に失敗しました");
          }
          return;
        }

        const excluded = json.data?.excluded_staffs ?? [];
        if (excluded.length > 0) {
          const names = excluded.map((s) => `${s.name} (${s.staff_code})`).join("\n");
          alert(`以下のスタッフは無効化されたため復元から除外されました:\n${names}`);
        }

        onDataReload();
        fetchSnapshots();
      } catch {
        alert("通信エラーが発生しました");
      } finally {
        setRestoring(null);
      }
    },
    [term, termId, onDataReload, fetchSnapshots]
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
      >
        履歴
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">スナップショット履歴</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-gray-500">スナップショットはありません</p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded border border-gray-200 p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        v{s.version}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(s.created_at)} / {s.entry_count}件
                      </div>
                      <div className="text-xs text-gray-400">{s.created_by}</div>
                    </div>
                    {term?.status === "adjusting" && (
                      <button
                        onClick={() => handleRestore(s.id, s.version)}
                        disabled={restoring !== null}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        {restoring === s.id ? "復元中..." : "復元"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
