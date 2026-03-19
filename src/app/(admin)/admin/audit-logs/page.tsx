"use client";

import { useEffect, useState, useCallback } from "react";

type AuditLog = {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

const ACTION_LABELS: Record<string, string> = {
  "staff.create": "スタッフ作成",
  "staff.update": "スタッフ更新",
  "staff.deactivate": "スタッフ無効化",
  "staff.restore": "スタッフ復元",
  "term.status_change": "ステータス変更",
  "shift.generate": "シフト生成",
  "shift.regenerate": "シフト再生成",
  "shift.save": "シフト保存",
  "shift.restore": "スナップショット復元",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?page=${p}&limit=50`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: { logs: AuditLog[]; pagination: Pagination };
      };
      setLogs(json.data.logs);
      setPagination(json.data.pagination);
    } catch {
      console.error("Failed to fetch audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">操作ログ</h1>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : (
        <>
          <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2">日時</th>
                  <th className="px-3 py-2">操作</th>
                  <th className="px-3 py-2">リソース</th>
                  <th className="px-3 py-2">ユーザーID</th>
                  <th className="px-3 py-2">詳細</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {log.resource_type}
                      {log.resource_id && (
                        <span className="ml-1 text-gray-400">{log.resource_id.slice(0, 8)}...</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {log.user_id.slice(0, 8)}...
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-gray-400">
                      {log.detail ? JSON.stringify(log.detail) : "-"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      操作ログはありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:text-gray-300"
              >
                前へ
              </button>
              <span className="text-sm text-gray-600">
                {page} / {pagination.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page === pagination.total_pages}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:text-gray-300"
              >
                次へ
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
