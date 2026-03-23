"use client";

import { memo } from "react";
import type { ShiftTypeValue, ConstraintViolation, ShiftEntryInput } from "@/lib/constraints/types";
import { SHIFT_LABELS, SHIFT_COLORS, EDITABLE_TYPES } from "@/lib/constants/shift";

type StaffInfo = {
  id: string;
  name: string;
  staff_code: string;
  team: string;
};

type Props = {
  staff: StaffInfo;
  dates: string[];
  entryMap: Map<string, ShiftEntryInput>;
  violationMap: Map<string, ConstraintViolation[]>;
  popover: { staffId: string; date: string } | null;
  isGenerating: boolean;
  canEdit: boolean;
  getDateBg: (dateStr: string) => string;
  onCellClick: (staffId: string, date: string) => void;
  onSelectType: (type: ShiftTypeValue) => void;
};

function ShiftRowInner({
  staff,
  dates,
  entryMap,
  violationMap,
  popover,
  isGenerating,
  canEdit,
  getDateBg,
  onCellClick,
  onSelectType,
}: Props) {
  let nightCount = 0;
  let offCount = 0;
  for (const date of dates) {
    const e = entryMap.get(`${staff.id}_${date}`);
    if (!e) continue;
    if (e.shift_type === "evening" || e.shift_type === "night") nightCount++;
    if (e.shift_type === "off" || e.shift_type === "requested_off") offCount++;
  }

  const getCellBorder = (staffId: string, date: string): string => {
    const cellViols = violationMap.get(`${staffId}_${date}`);
    if (!cellViols || cellViols.length === 0) return "";
    if (cellViols.some((v) => v.severity === "hard" && v.phase === 1)) return "ring-2 ring-red-500";
    if (cellViols.some((v) => v.severity === "hard" && v.phase === 2)) return "ring-2 ring-yellow-500";
    if (cellViols.some((v) => v.severity === "soft")) return "ring-1 ring-yellow-300";
    return "";
  };

  return (
    <tr>
      <td className="sticky left-0 z-10 border border-gray-300 bg-white px-1 py-0.5 text-left font-medium">
        <span className="text-gray-400">{staff.staff_code}</span>{" "}
        <span className="text-gray-900">{staff.name}</span>
        <span className="ml-1 text-[10px] text-gray-400">{staff.team}</span>
      </td>
      {dates.map((date) => {
        const entry = entryMap.get(`${staff.id}_${date}`);
        const shiftType = entry?.shift_type;
        const isManual = entry?.is_manual_edit;
        const cellBorder = getCellBorder(staff.id, date);
        const isPopoverTarget = popover?.staffId === staff.id && popover?.date === date;

        return (
          <td
            key={date}
            className={`relative cursor-pointer border border-gray-200 px-0.5 py-0.5 text-center select-none ${getDateBg(date)} ${cellBorder}`}
            onClick={() => {
              if (isGenerating || !canEdit) return;
              onCellClick(staff.id, date);
            }}
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
                      onClick={(e) => { e.stopPropagation(); onSelectType(t); }}
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
}

export const ShiftRow = memo(ShiftRowInner);
