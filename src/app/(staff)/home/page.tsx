"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TermInfo = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  request_deadline: string | null;
};

type RequestInfo = {
  id: string;
  term_id: string;
  requested_date: string;
};

type HomeData = {
  collecting_terms: TermInfo[];
  confirmed_terms: TermInfo[];
  my_requests: RequestInfo[];
};

export default function StaffHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHome = async () => {
      try {
        const res = await fetch("/api/staff-home");
        if (res.ok) {
          const json = (await res.json()) as { data: HomeData };
          setData(json.data);
        }
      } catch {
        console.error("Failed to fetch home data");
      } finally {
        setLoading(false);
      }
    };
    fetchHome();
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ホーム</h1>
        <p className="mt-4 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ホーム</h1>
        <p className="mt-4 text-red-600">データの取得に失敗しました</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ホーム</h1>

      {/* Collecting terms - request prompt */}
      {data.collecting_terms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-700">希望休受付中</h2>
          {data.collecting_terms.map((t) => {
            const myReqs = data.my_requests.filter((r) => r.term_id === t.id);
            return (
              <div key={t.id} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900">
                      {t.start_date} 〜 {t.end_date}
                    </div>
                    {t.request_deadline && (
                      <div className="mt-1 text-sm text-gray-600">
                        締切: {t.request_deadline}
                      </div>
                    )}
                    <div className="mt-1 text-sm text-gray-500">
                      申請済み: {myReqs.length}/3
                    </div>
                  </div>
                  <Link
                    href="/requests"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    希望休を申請
                  </Link>
                </div>
                {myReqs.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {myReqs.map((r) => (
                      <span key={r.id} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {r.requested_date}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmed terms - view shift */}
      {data.confirmed_terms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-700">確定シフト</h2>
          {data.confirmed_terms.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
              <div>
                <div className="font-bold text-gray-900">
                  {t.start_date} 〜 {t.end_date}
                </div>
                <div className="mt-1 text-sm text-green-700">確定済み</div>
              </div>
              <Link
                href={`/shifts/${t.id}`}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                シフト表を見る
              </Link>
            </div>
          ))}
        </div>
      )}

      {data.collecting_terms.length === 0 && data.confirmed_terms.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          現在表示できるタームはありません
        </div>
      )}
    </div>
  );
}
