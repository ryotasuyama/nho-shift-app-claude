"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useShiftStore } from "@/stores/shift-store";
import SnapshotPanel from "./SnapshotPanel";
import { apiFetch } from "@/lib/api/client";

type ShiftToolbarProps = {
  termId: string;
  onDataReload: () => void;
};

export default function ShiftToolbar({ termId, onDataReload }: ShiftToolbarProps) {
  const {
    term, isDirty, isGenerating, generatingElapsed, undoStack, redoStack, entries,
    undo, redo, setGenerating, setGeneratingElapsed, markSaved,
  } = useShiftStore();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generating timer
  useEffect(() => {
    if (isGenerating) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setGeneratingElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating, setGeneratingElapsed]);

  const handleGenerate = useCallback(async () => {
    if (!term) return;
    const isRegen = term.status === "adjusting";
    if (isRegen && !confirm("再生成すると現在のデータはスナップショットとして保存されます。続行しますか？")) return;

    setError("");
    setGenerating(true);

    try {
      const { error: errMsg } = await apiFetch(`/api/terms/${termId}/shifts/generate`, { method: "POST" });
      if (errMsg) {
        setError(errMsg);
        return;
      }
      onDataReload();
    } catch {
      setError("通信エラーが発生しました。画面を再読み込みしてください。");
    } finally {
      setGenerating(false);
    }
  }, [term, termId, setGenerating, onDataReload]);

  const handleSave = useCallback(async () => {
    if (!term || !isDirty) return;

    setSaving(true);
    setError("");

    try {
      const { res, data, error: errMsg } = await apiFetch<{ term?: { lock_version: number } }>(
        `/api/terms/${termId}/shifts/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lock_version: term.lock_version,
            entries: entries.map((e) => ({
              staff_id: e.staff_id,
              date: e.date,
              shift_type: e.shift_type,
              is_manual_edit: e.is_manual_edit,
            })),
          }),
        }
      );

      if (errMsg) {
        if (res.status === 409) {
          setError("他のユーザーがシフトを変更しました。画面を再読み込みしてください。");
          onDataReload();
        } else {
          setError(errMsg);
        }
        return;
      }

      const newVersion = data?.term?.lock_version;
      if (typeof newVersion === "number") {
        markSaved(newVersion);
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }, [term, isDirty, termId, entries, markSaved, onDataReload]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    const msg = newStatus === "confirmed"
      ? "シフト表を確定しますか？確定後スタッフに公開されます。"
      : "シフト表を差し戻しますか？";
    if (!confirm(msg)) return;

    setError("");
    try {
      const { error: errMsg } = await apiFetch(`/api/terms/${termId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (errMsg) {
        setError(errMsg);
        return;
      }
      onDataReload();
    } catch {
      setError("通信エラーが発生しました");
    }
  }, [termId, onDataReload]);

  if (!term) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
      {/* Generate / Regenerate */}
      {term.status === "collecting" && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-400"
        >
          自動生成
        </button>
      )}
      {term.status === "adjusting" && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-400"
        >
          再生成
        </button>
      )}

      {/* Save */}
      {term.status === "adjusting" && (
        <button
          onClick={handleSave}
          disabled={!isDirty || saving || isGenerating}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-400"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      )}

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={undoStack.length === 0 || isGenerating}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
      >
        元に戻す
      </button>
      <button
        onClick={redo}
        disabled={redoStack.length === 0 || isGenerating}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
      >
        やり直し
      </button>

      {/* Snapshot history */}
      {(term.status === "adjusting" || term.status === "confirmed") && (
        <SnapshotPanel termId={termId} onDataReload={onDataReload} />
      )}

      {/* Confirm / Revert */}
      {term.status === "adjusting" && (
        <button
          onClick={() => handleStatusChange("confirmed")}
          disabled={isGenerating || isDirty}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
        >
          確定
        </button>
      )}
      {term.status === "confirmed" && (
        <button
          onClick={() => handleStatusChange("adjusting")}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          差し戻し
        </button>
      )}

      {/* PDF */}
      {(term.status === "adjusting" || term.status === "confirmed") && (
        <a
          href={`/api/terms/${termId}/shifts/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          PDF
        </a>
      )}

      {/* Dirty indicator */}
      {isDirty && <span className="text-xs text-orange-600">未保存の変更があります</span>}

      {/* Error */}
      {error && <span className="text-xs text-red-600">{error}</span>}

      {/* Generating overlay info */}
      {isGenerating && (
        <span className="text-sm text-indigo-600">生成中... {generatingElapsed}秒</span>
      )}
    </div>
  );
}
