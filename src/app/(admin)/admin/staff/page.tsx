"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import StaffTable from "@/components/staff/StaffTable";
import StaffFormDialog from "@/components/staff/StaffFormDialog";
import type { StaffListItem } from "@/types/staff";
import { apiFetch } from "@/lib/api/client";

export default function StaffManagementPage() {
  const [staffs, setStaffs] = useState<StaffListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState<"" | "A" | "B">("");
  const [activeFilter, setActiveFilter] = useState<"true" | "false">("true");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffListItem | null>(null);
  const [error, setError] = useState("");

  const fetchStaffs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (teamFilter) params.set("team", teamFilter);
    params.set("is_active", activeFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);

    try {
      const { data } = await apiFetch<StaffListItem[]>(`/api/staffs?${params.toString()}`);
      if (data) setStaffs(data);
    } catch {
      console.error("Failed to fetch staffs");
    } finally {
      setLoading(false);
    }
  }, [teamFilter, activeFilter, debouncedSearch]);

  useEffect(() => {
    fetchStaffs();
  }, [fetchStaffs]);

  const handleCreate = () => {
    setEditingStaff(null);
    setDialogOpen(true);
  };

  const handleEdit = (staff: StaffListItem) => {
    setEditingStaff(staff);
    setDialogOpen(true);
  };

  const handleDeactivate = async (staff: StaffListItem) => {
    if (!confirm(`${staff.name} を無効化しますか？\n未確定タームのシフトからも除外されます。`)) {
      return;
    }
    setError("");
    try {
      const { error: errMsg } = await apiFetch(`/api/staffs/${staff.id}`, { method: "DELETE" });
      if (errMsg) {
        setError(errMsg);
        return;
      }
      fetchStaffs();
    } catch {
      setError("通信エラーが発生しました");
    }
  };

  const handleRestore = async (staff: StaffListItem) => {
    setError("");
    try {
      const { error: errMsg } = await apiFetch(`/api/staffs/${staff.id}/restore`, { method: "PUT" });
      if (errMsg) {
        setError(errMsg);
        return;
      }
      fetchStaffs();
    } catch {
      setError("通信エラーが発生しました");
    }
  };

  const handleDialogClose = (saved?: boolean) => {
    setDialogOpen(false);
    setEditingStaff(null);
    if (saved) fetchStaffs();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">スタッフ管理</h1>
        <button
          onClick={handleCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新規登録
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="氏名 or コードで検索"
          value={searchInput}
          onChange={(e) => {
            const val = e.target.value;
            setSearchInput(val);
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
        />
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value as "" | "A" | "B")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
        >
          <option value="">全チーム</option>
          <option value="A">チームA</option>
          <option value="B">チームB</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "true" | "false")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
        >
          <option value="true">有効</option>
          <option value="false">無効化済み</option>
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : (
        <StaffTable
          staffs={staffs}
          isActive={activeFilter === "true"}
          onEdit={handleEdit}
          onDeactivate={handleDeactivate}
          onRestore={handleRestore}
        />
      )}

      {dialogOpen && (
        <StaffFormDialog
          staff={editingStaff}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
}
