"use client";

import { useState, useCallback } from "react";
import { useShiftStore } from "@/stores/shift-store";
import type { ShiftTypeValue, ConstraintViolation } from "@/lib/constraints/types";

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

const EDITABLE_TYPES: ShiftTypeValue[] = ["day", "evening", "night", "off", "holiday_off"];

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function ShiftGrid() {
  const { staffs, entries, dates, holidays, violations, term, editCell, isGenerating } = useShiftStore();
  const [popover, setPopover] = useState<{ staffId: string; date: string } | null>(null);

  const holidaySet = new Set(holidays);

  const getEntry = useCallback(
    (staffId: string, date: string) => entries.find((e) => e.staff_id === staffId && e.date === date),
    [entries]
  );

  const getViolationsForCell = useCallback(
    (staffId: string, date: string): ConstraintViolation[] =>
      violations.filter((v) => (v.staff_id === staffId || !v.staff_id) && (v.date === date || !v.date)),
    [violations]
  );

  const getDow = (dateStr: string) => new Date(dateStr + "T00:00:00Z").getUTCDay();

  const getDateBg = (dateStr: string): string => {
    if (holidaySet.has(dateStr)) return "bg-pink-50";
    const dow = getDow(dateStr);
    if (dow === 0) return "bg-red-50";
    if (dow === 6) return "bg-blue-50";
    return "";
  };

  const getCellBorder = (staffId: string, date: string): string => {
    const cellViols = getViolationsForCell(staffId, date);
    if (cellViols.some((v) => v.severity === "hard" && v.phase === 1)) return "ring-2 ring-red-500";
    if (cellViols.some((v) => v.severity === "hard" && v.phase === 2)) return "ring-2 ring-yellow-500";
    if (cellViols.some((v) => v.severity === "soft")) return "ring-1 ring-yellow-300";
    return "";
  };

  const handleCellClick = (staffId: string, date: string) => {
    if (isGenerating) return;
    if (term?.status !== "adjusting" && term?.status !== "collecting") return;
    setPopover(popover?.staffId === staffId && popover?.date === date ? null : { staffId, date });
  };

  const handleSelectType = (type: ShiftTypeValue) => {
    if (!popover) return;
    editCell(popover.staffId, popover.date, type);
    setPopover(null);
  };

  if (dates.length === 0 || staffs.length === 0) {
    return <p className="text-gray-500">シフトデータがありません</p>;
  }

  return (
    <div className="overflow-auto">
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
            <th className="min-w-[60px] border border-gray-300 bg-gray-100 px-1 py-1 text-center">
              夜勤
            </th>
            <th className="min-w-[60px] border border-gray-300 bg-gray-100 px-1 py-1 text-center">
              週休
            </th>
          </tr>
        </thead>
        <tbody>
          {staffs.map((staff) => {
            // Compute per-staff stats inline
            const staffEntries = entries.filter((e) => e.staff_id === staff.id);
            const nightCount = staffEntries.filter((e) => e.shift_type === "evening" || e.shift_type === "night").length;
            const offCount = staffEntries.filter((e) => e.shift_type === "off" || e.shift_type === "requested_off").length;

            return (
              <tr key={staff.id}>
                <td className="sticky left-0 z-10 border border-gray-300 bg-white px-1 py-0.5 text-left font-medium">
                  <span className="text-gray-400">{staff.staff_code}</span>{" "}
                  <span className="text-gray-900">{staff.name}</span>
                  <span className="ml-1 text-[10px] text-gray-400">{staff.team}</span>
                </td>
                {dates.map((date) => {
                  const entry = getEntry(staff.id, date);
                  const shiftType = entry?.shift_type;
                  const isManual = entry?.is_manual_edit;
                  const cellBorder = getCellBorder(staff.id, date);
                  const isPopoverTarget = popover?.staffId === staff.id && popover?.date === date;

                  return (
                    <td
                      key={date}
                      className={`relative cursor-pointer border border-gray-200 px-0.5 py-0.5 text-center select-none ${getDateBg(date)} ${cellBorder}`}
                      onClick={() => handleCellClick(staff.id, date)}
                    >
                      {shiftType && (
                        <span className={`font-bold ${SHIFT_COLORS[shiftType]}`}>
                          {SHIFT_LABELS[shiftType]}
                        </span>
                      )}
                      {isManual && (
                        <span className="absolute left-0.5 top-0 text-[6px] text-blue-500">●</span>
                      )}
                      {isPopoverTarget && (
                        <div className="absolute left-1/2 top-full z-30 -translate-x-1/2 rounded border border-gray-300 bg-white shadow-lg">
                          <div className="flex gap-0.5 p-1">
                            {EDITABLE_TYPES.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSelectType(t); }}
                                className={`rounded px-1.5 py-0.5 text-xs font-bold hover:bg-gray-100 ${SHIFT_COLORS[t]} ${
                                  shiftType === t ? "bg-gray-200" : ""
                                }`}
                              >
                                {SHIFT_LABELS[t]}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="border border-gray-300 bg-gray-50 px-1 py-0.5 text-center text-gray-700">
                  {nightCount}
                </td>
                <td className="border border-gray-300 bg-gray-50 px-1 py-0.5 text-center text-gray-700">
                  {offCount}
                </td>
              </tr>
            );
          })}
          {/* Daily summary row */}
          <tr className="bg-gray-100 font-medium">
            <td className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-1 py-0.5">日別合計</td>
            {dates.map((date) => {
              const dayEntries = entries.filter((e) => e.date === date);
              const dayCount = dayEntries.filter((e) => e.shift_type === "day").length;
              const eveningCount = dayEntries.filter((e) => e.shift_type === "evening").length;
              const nightCount = dayEntries.filter((e) => e.shift_type === "night").length;
              return (
                <td key={date} className={`border border-gray-300 px-0.5 py-0.5 text-center ${getDateBg(date)}`}>
                  <div className="text-[9px] leading-tight text-gray-600">
                    {dayCount}/{eveningCount}/{nightCount}
                  </div>
                </td>
              );
            })}
            <td className="border border-gray-300" />
            <td className="border border-gray-300" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
