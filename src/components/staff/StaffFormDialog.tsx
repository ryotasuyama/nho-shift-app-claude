"use client";

import { useState, type FormEvent } from "react";
import type { StaffListItem } from "@/types/staff";

type StaffFormDialogProps = {
  staff: StaffListItem | null;
  onClose: (saved?: boolean) => void;
};

export default function StaffFormDialog({
  staff,
  onClose,
}: StaffFormDialogProps) {
  const isEditing = staff !== null;

  const [staffCode, setStaffCode] = useState(staff?.staff_code ?? "");
  const [name, setName] = useState(staff?.name ?? "");
  const [email, setEmail] = useState("");
  const [experienceYears, setExperienceYears] = useState(
    staff?.experience_years?.toString() ?? ""
  );
  const [team, setTeam] = useState<"A" | "B">(staff?.team ?? "A");
  const [nightShiftAvailable, setNightShiftAvailable] = useState(
    staff?.night_shift_available ?? true
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isEditing) {
        const res = await fetch(`/api/staffs/${staff.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            experience_years: parseInt(experienceYears, 10),
            team,
            night_shift_available: nightShiftAvailable,
          }),
        });
        const json: unknown = await res.json();
        const body = json as { error?: { message?: string } };
        if (!res.ok) {
          setError(body.error?.message ?? "更新に失敗しました");
          return;
        }
        onClose(true);
      } else {
        const res = await fetch("/api/staffs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_code: staffCode,
            name,
            email,
            experience_years: parseInt(experienceYears, 10),
            team,
            night_shift_available: nightShiftAvailable,
          }),
        });
        const json: unknown = await res.json();
        const body = json as {
          data?: { temporary_password?: string };
          error?: { message?: string; details?: { field?: string; message: string }[] };
        };
        if (!res.ok) {
          const detail = body.error?.details?.[0]?.message;
          setError(detail ?? body.error?.message ?? "登録に失敗しました");
          return;
        }
        if (body.data?.temporary_password) {
          setTempPassword(body.data.temporary_password);
        }
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  // Show temporary password after creation
  if (tempPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            スタッフを登録しました
          </h2>
          <div className="mb-4 rounded-md bg-yellow-50 p-4">
            <p className="mb-2 text-sm font-medium text-yellow-800">
              仮パスワード（この画面を閉じると再表示できません）
            </p>
            <p className="font-mono text-lg font-bold text-yellow-900">
              {tempPassword}
            </p>
          </div>
          <button
            onClick={() => onClose(true)}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          {isEditing ? "スタッフ編集" : "スタッフ新規登録"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              スタッフコード
            </label>
            <input
              type="text"
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
              disabled={isEditing}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
              placeholder="N001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              氏名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>

          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              経験年数
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              所属チーム
            </label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value as "A" | "B")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              <option value="A">チームA</option>
              <option value="B">チームB</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="nightShift"
              checked={nightShiftAvailable}
              onChange={(e) => setNightShiftAvailable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="nightShift" className="text-sm text-gray-700">
              夜勤可能
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "処理中..." : isEditing ? "更新" : "登録"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
