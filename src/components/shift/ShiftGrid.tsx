"use client";

import { useState, useCallback, useMemo } from "react";
import { useShiftStore } from "@/stores/shift-store";
import type { ShiftTypeValue, ConstraintViolation } from "@/lib/constraints/types";
import { WEEKDAY_LABELS } from "@/lib/constants/shift";
import { ShiftRow } from "./ShiftRow";

export default function ShiftGrid() {
  const staffs = useShiftStore((s) => s.staffs);
  const entries = useShiftStore((s) => s.entries);
  const dates = useShiftStore((s) => s.dates);
  const holidays = useShiftStore((s) => s.holidays);
  const violations = useShiftStore((s) => s.violations);
  const term = useShiftStore((s) => s.term);
  const editCell = useShiftStore((s) => s.editCell);
  const isGenerating = useShiftStore((s) => s.isGenerating);

  const [popover, setPopover] = useState<{ staffId: string; date: string } | null>(null);

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  const entryMap = useMemo(() => {
    const map = new Map<string, (typeof entries)[number]>();
    for (const e of entries) {
      map.set(`${e.staff_id}_${e.date}`, e);
    }
    return map;
  }, [entries]);

  const violationMap = useMemo(() => {
    const map = new Map<string, ConstraintViolation[]>();
    for (const v of violations) {
      // Violations with both staff_id and date → specific cell
      if (v.staff_id && v.date) {
        const key = `${v.staff_id}_${v.date}`;
        let arr = map.get(key);
        if (!arr) { arr = []; map.set(key, arr); }
        arr.push(v);
      } else if (v.staff_id && !v.date) {
        // Staff-level violation → apply to all dates for this staff
        for (const date of dates) {
          const key = `${v.staff_id}_${date}`;
          let arr = map.get(key);
          if (!arr) { arr = []; map.set(key, arr); }
          arr.push(v);
        }
      } else if (!v.staff_id && v.date) {
        // Date-level violation → apply to all staffs for this date
        for (const staff of staffs) {
          const key = `${staff.id}_${v.date}`;
          let arr = map.get(key);
          if (!arr) { arr = []; map.set(key, arr); }
          arr.push(v);
        }
      }
    }
    return map;
  }, [violations, dates, staffs]);

  const getDow = (dateStr: string) => new Date(dateStr + "T00:00:00Z").getUTCDay();

  const getDateBg = useCallback((dateStr: string): string => {
    if (holidaySet.has(dateStr)) return "bg-pink-50";
    const dow = getDow(dateStr);
    if (dow === 0) return "bg-red-50";
    if (dow === 6) return "bg-blue-50";
    return "";
  }, [holidaySet]);

  const canEdit = term?.status === "adjusting" || term?.status === "collecting";

  const handleCellClick = useCallback((staffId: string, date: string) => {
    setPopover((prev) =>
      prev?.staffId === staffId && prev?.date === date ? null : { staffId, date }
    );
  }, []);

  const handleSelectType = useCallback((type: ShiftTypeValue) => {
    if (!popover) return;
    editCell(popover.staffId, popover.date, type);
    setPopover(null);
  }, [popover, editCell]);

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
          {staffs.map((staff) => (
            <ShiftRow
              key={staff.id}
              staff={staff}
              dates={dates}
              entryMap={entryMap}
              violationMap={violationMap}
              popover={popover}
              isGenerating={isGenerating}
              canEdit={canEdit ?? false}
              getDateBg={getDateBg}
              onCellClick={handleCellClick}
              onSelectType={handleSelectType}
            />
          ))}
          {/* Daily summary row */}
          <tr className="bg-gray-100 font-medium">
            <td className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-1 py-0.5">日別合計</td>
            {dates.map((date) => {
              let dayCount = 0;
              let eveningCount = 0;
              let nightCountSum = 0;
              for (const staff of staffs) {
                const e = entryMap.get(`${staff.id}_${date}`);
                if (!e) continue;
                if (e.shift_type === "day") dayCount++;
                else if (e.shift_type === "evening") eveningCount++;
                else if (e.shift_type === "night") nightCountSum++;
              }
              return (
                <td key={date} className={`border border-gray-300 px-0.5 py-0.5 text-center ${getDateBg(date)}`}>
                  <div className="text-[9px] leading-tight text-gray-600">
                    {dayCount}/{eveningCount}/{nightCountSum}
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
