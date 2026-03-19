"use client";

import { useEffect, useCallback, use } from "react";
import { useShiftStore } from "@/stores/shift-store";
import ShiftGrid from "@/components/shift/ShiftGrid";
import ShiftToolbar from "@/components/shift/ShiftToolbar";
import ViolationPanel from "@/components/shift/ViolationPanel";
import type { ShiftEntryInput, ConstraintViolation } from "@/lib/constraints/types";
import type { TermStatistics } from "@/lib/statistics/types";

type TermData = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  lock_version: number;
  min_day_staff: number;
};

type StaffData = {
  id: string;
  name: string;
  staff_code: string;
  team: string;
  experience_years: number;
  night_shift_available: boolean;
};

type EntryData = ShiftEntryInput & { id: string; staff_name: string; staff_code: string };

type ShiftResponse = {
  data: {
    term: TermData;
    staffs: StaffData[];
    entries: EntryData[];
    holidays: string[];
    violations: ConstraintViolation[];
    statistics: TermStatistics;
  };
};

export default function ShiftEditPage({
  params,
}: {
  params: Promise<{ termId: string }>;
}) {
  const { termId } = use(params);
  const { loadData, term, isDirty, isGenerating, statistics } = useShiftStore();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/terms/${termId}/shifts`);
      if (!res.ok) return;
      const json = (await res.json()) as ShiftResponse;
      const d = json.data;

      // Generate dates array from term period
      const dates: string[] = [];
      const start = new Date(d.term.start_date + "T00:00:00Z");
      const end = new Date(d.term.end_date + "T00:00:00Z");
      for (let dt = new Date(start); dt <= end; dt.setUTCDate(dt.getUTCDate() + 1)) {
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const day = String(dt.getUTCDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${day}`);
      }

      loadData({
        term: d.term,
        staffs: d.staffs,
        entries: d.entries.map((e) => ({
          staff_id: e.staff_id,
          date: e.date,
          shift_type: e.shift_type,
          is_manual_edit: e.is_manual_edit,
        })),
        dates,
        holidays: d.holidays,
        violations: d.violations,
        statistics: d.statistics,
      });
    } catch {
      console.error("Failed to fetch shift data");
    }
  }, [termId, loadData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Beforeunload prevention
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  if (!term) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">シフト表</h1>
        <p className="mt-4 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          シフト表 {term.start_date} 〜 {term.end_date}
        </h1>
        <span className="text-sm text-gray-500">v{term.lock_version}</span>
      </div>

      <ShiftToolbar termId={termId} onDataReload={fetchData} />

      {/* Generating overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-lg bg-white p-8 text-center shadow-xl">
            <div className="mb-4 text-lg font-bold text-indigo-700">シフト生成中...</div>
            <div className="text-4xl font-bold text-indigo-600">
              {useShiftStore.getState().generatingElapsed}秒
            </div>
            <p className="mt-2 text-sm text-gray-500">完了まで最大60秒かかります</p>
          </div>
        </div>
      )}

      <ShiftGrid />

      {/* Statistics summary */}
      {statistics && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">統計情報</h3>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="px-2 py-1 text-left">スタッフ</th>
                  <th className="px-2 py-1 text-right">勤務時間</th>
                  <th className="px-2 py-1 text-right">基準</th>
                  <th className="px-2 py-1 text-right">差分</th>
                  <th className="px-2 py-1 text-right">日勤</th>
                  <th className="px-2 py-1 text-right">準夜</th>
                  <th className="px-2 py-1 text-right">深夜</th>
                  <th className="px-2 py-1 text-right">週休</th>
                  <th className="px-2 py-1 text-right">代休</th>
                </tr>
              </thead>
              <tbody>
                {statistics.staff_stats.map((s) => {
                  const staff = useShiftStore.getState().staffs.find((st) => st.id === s.staff_id);
                  return (
                    <tr key={s.staff_id} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-900">{staff?.name ?? s.staff_id}</td>
                      <td className="px-2 py-1 text-right">{s.total_working_hours.toFixed(1)}</td>
                      <td className="px-2 py-1 text-right text-gray-500">{s.standard_working_hours.toFixed(1)}</td>
                      <td className={`px-2 py-1 text-right ${s.hours_diff > 0 ? "text-red-600" : s.hours_diff < 0 ? "text-blue-600" : "text-gray-500"}`}>
                        {s.hours_diff > 0 ? "+" : ""}{s.hours_diff.toFixed(1)}
                      </td>
                      <td className="px-2 py-1 text-right">{s.day_count}</td>
                      <td className="px-2 py-1 text-right">{s.evening_count}</td>
                      <td className="px-2 py-1 text-right">{s.night_count}</td>
                      <td className="px-2 py-1 text-right">{s.weekly_off_total}</td>
                      <td className="px-2 py-1 text-right">{s.holiday_off_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ViolationPanel />
    </div>
  );
}
