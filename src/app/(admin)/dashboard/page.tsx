"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TermSummary = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  fiscal_year: number;
};

type StaffCount = {
  total: number;
  teamA: number;
  teamB: number;
};

type RequestSummary = {
  term_id: string;
  term_label: string;
  total_requests: number;
  staff_with_requests: number;
  total_staff: number;
};

type DashboardData = {
  terms: TermSummary[];
  staff_count: StaffCount;
  request_summaries: RequestSummary[];
};

const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  collecting: "受付中",
  generating: "生成中",
  adjusting: "調整中",
  confirmed: "確定",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  collecting: "bg-blue-100 text-blue-700",
  generating: "bg-yellow-100 text-yellow-700",
  adjusting: "bg-orange-100 text-orange-700",
  confirmed: "bg-green-100 text-green-700",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = (await res.json()) as { data: DashboardData };
          setData(json.data);
        }
      } catch {
        console.error("Failed to fetch dashboard");
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="mt-4 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="mt-4 text-red-600">データの取得に失敗しました</p>
      </div>
    );
  }

  const activeTerms = data.terms.filter((t) => t.status !== "draft");
  const currentTerm = activeTerms.find((t) => t.status === "collecting" || t.status === "generating" || t.status === "adjusting");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

      {/* Staff Count */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">有効スタッフ数</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{data.staff_count.total}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">チームA</div>
          <div className="mt-1 text-3xl font-bold text-blue-600">{data.staff_count.teamA}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">チームB</div>
          <div className="mt-1 text-3xl font-bold text-emerald-600">{data.staff_count.teamB}</div>
        </div>
      </div>

      {/* Current Term */}
      {currentTerm && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="text-sm font-bold text-indigo-800">現在のターム</h2>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900">
              {currentTerm.start_date} 〜 {currentTerm.end_date}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[currentTerm.status]}`}>
              {STATUS_LABELS[currentTerm.status]}
            </span>
          </div>
          <div className="mt-2">
            <Link
              href={`/admin/shifts/${currentTerm.id}`}
              className="text-sm text-indigo-600 hover:underline"
            >
              シフト表を開く →
            </Link>
          </div>
        </div>
      )}

      {/* Request Summaries */}
      {data.request_summaries.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">希望休申請状況</h2>
          <div className="space-y-2">
            {data.request_summaries.map((r) => (
              <div key={r.term_id} className="flex items-center justify-between rounded border border-gray-100 p-2">
                <span className="text-sm text-gray-700">{r.term_label}</span>
                <div className="text-sm">
                  <span className="font-medium text-gray-900">{r.staff_with_requests}</span>
                  <span className="text-gray-400"> / {r.total_staff}名申請済み</span>
                  <span className="ml-2 text-gray-500">({r.total_requests}件)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Term List */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">ターム一覧</h2>
          <Link href="/admin/terms" className="text-sm text-indigo-600 hover:underline">
            管理 →
          </Link>
        </div>
        <div className="space-y-1">
          {data.terms.slice(0, 10).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-gray-50">
              <span className="text-sm text-gray-700">
                {t.start_date} 〜 {t.end_date}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                {STATUS_LABELS[t.status]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link
          href="/admin/staff"
          className="rounded-lg border border-gray-200 bg-white p-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          スタッフ管理
        </Link>
        <Link
          href="/admin/terms"
          className="rounded-lg border border-gray-200 bg-white p-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ターム設定
        </Link>
        <Link
          href="/admin/holidays"
          className="rounded-lg border border-gray-200 bg-white p-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          祝日マスタ
        </Link>
        <Link
          href="/admin/audit-logs"
          className="rounded-lg border border-gray-200 bg-white p-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          操作ログ
        </Link>
      </div>
    </div>
  );
}
