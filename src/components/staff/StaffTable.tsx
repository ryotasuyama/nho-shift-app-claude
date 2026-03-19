import type { StaffListItem } from "@/types/staff";

type StaffTableProps = {
  staffs: StaffListItem[];
  isActive: boolean;
  onEdit: (staff: StaffListItem) => void;
  onDeactivate: (staff: StaffListItem) => void;
  onRestore: (staff: StaffListItem) => void;
};

export default function StaffTable({
  staffs,
  isActive,
  onEdit,
  onDeactivate,
  onRestore,
}: StaffTableProps) {
  if (staffs.length === 0) {
    return (
      <p className="py-8 text-center text-gray-500">
        {isActive ? "スタッフが登録されていません" : "無効化済みのスタッフはいません"}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              コード
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              氏名
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              チーム
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              経験年数
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              夜勤
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {staffs.map((staff) => (
            <tr key={staff.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                {staff.staff_code}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                {staff.name}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {staff.team}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {staff.experience_years}年
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                {staff.night_shift_available ? (
                  <span className="text-green-600">可</span>
                ) : (
                  <span className="text-red-500">不可</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                <div className="flex gap-2">
                  {isActive ? (
                    <>
                      <button
                        onClick={() => onEdit(staff)}
                        className="rounded px-2 py-1 text-blue-600 hover:bg-blue-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => onDeactivate(staff)}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        無効化
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onRestore(staff)}
                      className="rounded px-2 py-1 text-green-600 hover:bg-green-50"
                    >
                      復元
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
