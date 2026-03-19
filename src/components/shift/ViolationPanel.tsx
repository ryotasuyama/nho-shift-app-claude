"use client";

import { useShiftStore } from "@/stores/shift-store";

export default function ViolationPanel() {
  const { violations, staffs } = useShiftStore();

  const hardPhase1 = violations.filter((v) => v.severity === "hard" && v.phase === 1);
  const hardPhase2 = violations.filter((v) => v.severity === "hard" && v.phase === 2);
  const soft = violations.filter((v) => v.severity === "soft");

  const staffMap = new Map(staffs.map((s) => [s.id, s]));
  const getStaffName = (id?: string) => (id ? staffMap.get(id)?.name ?? id : "");

  if (violations.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="text-sm text-green-700">制約違反はありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-700">
        必須: <span className="font-bold text-red-600">{hardPhase1.length}件</span>
        {" / "}
        警告: <span className="font-bold text-yellow-600">{hardPhase2.length + soft.length}件</span>
      </div>

      {hardPhase1.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h4 className="mb-2 text-sm font-bold text-red-700">フェーズ1 必須制約違反</h4>
          <ul className="space-y-1 text-xs text-red-700">
            {hardPhase1.map((v, i) => (
              <li key={i}>
                <span className="font-mono">[{v.constraint_id}]</span>{" "}
                {getStaffName(v.staff_id)}{v.staff_id && v.date ? " " : ""}
                {v.date && <span className="text-red-500">{v.date}</span>}{" "}
                {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hardPhase2.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <h4 className="mb-2 text-sm font-bold text-yellow-700">フェーズ2 制約違反</h4>
          <ul className="space-y-1 text-xs text-yellow-700">
            {hardPhase2.map((v, i) => (
              <li key={i}>
                <span className="font-mono">[{v.constraint_id}]</span>{" "}
                {getStaffName(v.staff_id)} {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {soft.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <h4 className="mb-2 text-sm font-bold text-gray-600">ソフト制約</h4>
          <ul className="space-y-1 text-xs text-gray-600">
            {soft.map((v, i) => (
              <li key={i}>
                <span className="font-mono">[{v.constraint_id}]</span>{" "}
                {getStaffName(v.staff_id)} {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
