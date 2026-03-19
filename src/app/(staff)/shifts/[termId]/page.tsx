"use client";

import { useEffect, useState, use } from "react";

type ShiftTypeValue = "day" | "evening" | "night" | "off" | "holiday_off" | "requested_off";

const SHIFT_LABELS: Record<ShiftTypeValue, string> = {
  day: "日",
  evening: "準",
  night: "深",
  off: "休",
  holiday_off: "代",
  requested_off: "希",
};

const SHIFT_COLORS: Record<ShiftTypeValue, string> = {
  day: "text-gray-900",
  evening: "text-orange-700",
  night: "text-blue-700",
  off: "text-gray-400",
  holiday_off: "text-purple-600",
  requested_off: "text-pink-600",
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type StaffData = {
  id: string;
  name: string;
  staff_code: string;
  team: string;
};

type EntryData = {
  staff_id: string;
  date: string;
  shift_type: ShiftTypeValue;
  is_manual_edit: boolean;
};

type TermData = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
};

type ShiftResponse = {
  data: {
    term: TermData;
    staffs: StaffData[];
    entries: EntryData[];
    holidays: string[];
  };
};

export default function ShiftViewPage({
  params,
}: {
  params: Promise<{ termId: string }>;
}) {
  const { termId } = use(params);
  const [term, setTerm] = useState<TermData | null>(null);
  const [staffs, setStaffs] = useState<StaffData[]>([]);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "card">("grid");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current user's staff_id
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const sessionJson = (await sessionRes.json()) as { data?: { staff_id?: string } };
          setCurrentStaffId(sessionJson.data?.staff_id ?? null);
        }

        const res = await fetch(`/api/terms/${termId}/shifts`);
        if (!res.ok) {
          const json = (await res.json()) as { error?: { message?: string } };
          setError(json.error?.message ?? "シフトデータの取得に失敗しました");
          return;
        }
        const json = (await res.json()) as ShiftResponse;
        const d = json.data;

        setTerm(d.term);
        setStaffs(d.staffs);
        setEntries(d.entries);
        setHolidays(new Set(d.holidays));

        // Generate dates
        const dateArr: string[] = [];
        const start = new Date(d.term.start_date + "T00:00:00Z");
        const end = new Date(d.term.end_date + "T00:00:00Z");
        for (let dt = new Date(start); dt <= end; dt.setUTCDate(dt.getUTCDate() + 1)) {
          const y = dt.getUTCFullYear();
          const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
          const day = String(dt.getUTCDate()).padStart(2, "0");
          dateArr.push(`${y}-${m}-${day}`);
        }
        setDates(dateArr);
      } catch {
        setError("通信エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [termId]);

  if (loading) {
    return <p className="text-gray-500">読み込み中...</p>;
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  if (!term) return null;

  const getDow = (dateStr: string) => new Date(dateStr + "T00:00:00Z").getUTCDay();

  const getDateBg = (dateStr: string): string => {
    if (holidays.has(dateStr)) return "bg-pink-50";
    const dow = getDow(dateStr);
    if (dow === 0) return "bg-red-50";
    if (dow === 6) return "bg-blue-50";
    return "";
  };

  const getEntry = (staffId: string, date: string) =>
    entries.find((e) => e.staff_id === staffId && e.date === date);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          シフト表 {term.start_date} 〜 {term.end_date}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`rounded-md px-3 py-1 text-sm ${viewMode === "grid" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"}`}
          >
            一覧
          </button>
          <button
            onClick={() => setViewMode("card")}
            className={`rounded-md px-3 py-1 text-sm ${viewMode === "card" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"}`}
          >
            カード
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 min-w-[100px] border border-gray-300 bg-gray-100 px-1 py-1 text-left">
                  スタッフ
                </th>
                {dates.map((date) => {
                  const dow = getDow(date);
                  const dayNum = date.slice(8);
                  return (
                    <th
                      key={date}
                      className={`min-w-[32px] border border-gray-300 px-0.5 py-1 text-center ${getDateBg(date)} ${
                        dow === 0 ? "text-red-600" : dow === 6 ? "text-blue-600" : "text-gray-700"
                      }`}
                    >
                      <div>{dayNum}</div>
                      <div className="text-[10px]">{WEEKDAY_LABELS[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staffs.map((staff) => {
                const isMe = staff.id === currentStaffId;
                return (
                  <tr key={staff.id} className={isMe ? "bg-yellow-50" : ""}>
                    <td className={`sticky left-0 z-10 border border-gray-300 px-1 py-0.5 text-left font-medium ${isMe ? "bg-yellow-50" : "bg-white"}`}>
                      <span className="text-gray-400">{staff.staff_code}</span>{" "}
                      <span className="text-gray-900">{staff.name}</span>
                      {isMe && <span className="ml-1 text-[10px] text-yellow-600">自分</span>}
                    </td>
                    {dates.map((date) => {
                      const entry = getEntry(staff.id, date);
                      const shiftType = entry?.shift_type;
                      return (
                        <td
                          key={date}
                          className={`border border-gray-200 px-0.5 py-0.5 text-center ${getDateBg(date)}`}
                        >
                          {shiftType && (
                            <span className={`font-bold ${SHIFT_COLORS[shiftType]}`}>
                              {SHIFT_LABELS[shiftType]}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card view for mobile */
        <div className="space-y-4">
          {staffs.map((staff) => {
            const isMe = staff.id === currentStaffId;
            const staffEntries = entries.filter((e) => e.staff_id === staff.id);
            return (
              <div
                key={staff.id}
                className={`rounded-lg border p-3 ${isMe ? "border-yellow-400 bg-yellow-50" : "border-gray-200 bg-white"}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-bold text-gray-900">{staff.name}</span>
                  <span className="text-xs text-gray-400">{staff.staff_code}</span>
                  <span className="text-xs text-gray-400">チーム{staff.team}</span>
                  {isMe && <span className="rounded bg-yellow-200 px-1.5 py-0.5 text-[10px] font-bold text-yellow-800">自分</span>}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {dates.map((date) => {
                    const entry = staffEntries.find((e) => e.date === date);
                    const shiftType = entry?.shift_type;
                    const dow = getDow(date);
                    const dayNum = date.slice(8);
                    return (
                      <div
                        key={date}
                        className={`rounded p-1 text-center ${getDateBg(date)} border border-gray-100`}
                      >
                        <div className={`text-[10px] ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-400"}`}>
                          {dayNum} {WEEKDAY_LABELS[dow]}
                        </div>
                        {shiftType && (
                          <div className={`text-sm font-bold ${SHIFT_COLORS[shiftType]}`}>
                            {SHIFT_LABELS[shiftType]}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
