import { create } from "zustand";
import type { ShiftEntryInput, StaffInput, ConstraintViolation, ShiftTypeValue } from "@/lib/constraints/types";
import type { TermStatistics } from "@/lib/statistics/types";
import { checkAllHardConstraints } from "@/lib/constraints/hard-constraints";
import { checkAllSoftConstraints } from "@/lib/constraints/soft-constraints";
import { calculateTermStatistics } from "@/lib/statistics/shift-statistics";

const MAX_UNDO = 20;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedRecompute(recompute: () => void) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => recompute(), 150);
}

type TermInfo = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  lock_version: number;
  min_day_staff: number;
};

type StaffInfo = {
  id: string;
  name: string;
  staff_code: string;
  team: string;
  experience_years: number;
  night_shift_available: boolean;
};

type UndoEntry = {
  staffId: string;
  date: string;
  oldType: ShiftTypeValue;
  newType: ShiftTypeValue;
  wasManual: boolean;
};

type ShiftStore = {
  // Data
  term: TermInfo | null;
  staffs: StaffInfo[];
  entries: ShiftEntryInput[];
  dates: string[];
  holidays: string[];

  // State
  isDirty: boolean;
  isGenerating: boolean;
  generatingElapsed: number;
  violations: ConstraintViolation[];
  statistics: TermStatistics | null;

  // Undo/Redo
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Actions
  loadData: (data: {
    term: TermInfo;
    staffs: StaffInfo[];
    entries: ShiftEntryInput[];
    dates: string[];
    holidays: string[];
    violations: ConstraintViolation[];
    statistics: TermStatistics;
  }) => void;
  editCell: (staffId: string, date: string, newType: ShiftTypeValue) => void;
  undo: () => void;
  redo: () => void;
  setGenerating: (generating: boolean) => void;
  setGeneratingElapsed: (elapsed: number) => void;
  markSaved: (newLockVersion: number) => void;
  updateTermStatus: (status: string) => void;
  recomputeConstraints: () => void;
};

function buildStaffInput(staffs: StaffInfo[]): StaffInput[] {
  return staffs.map((s) => ({
    id: s.id,
    experience_years: s.experience_years,
    team: s.team as "A" | "B",
    night_shift_available: s.night_shift_available,
    is_active: true,
  }));
}

export const useShiftStore = create<ShiftStore>((set, get) => ({
  term: null,
  staffs: [],
  entries: [],
  dates: [],
  holidays: [],
  isDirty: false,
  isGenerating: false,
  generatingElapsed: 0,
  violations: [],
  statistics: null,
  undoStack: [],
  redoStack: [],

  loadData: (data) => {
    set({
      term: data.term,
      staffs: data.staffs,
      entries: data.entries,
      dates: data.dates,
      holidays: data.holidays,
      violations: data.violations,
      statistics: data.statistics,
      isDirty: false,
      undoStack: [],
      redoStack: [],
      isGenerating: false,
      generatingElapsed: 0,
    });
  },

  editCell: (staffId, date, newType) => {
    const { entries, undoStack } = get();
    const idx = entries.findIndex((e) => e.staff_id === staffId && e.date === date);
    if (idx < 0) return;

    const oldEntry = entries[idx];
    if (oldEntry.shift_type === newType) return;

    const undoEntry: UndoEntry = {
      staffId,
      date,
      oldType: oldEntry.shift_type,
      newType,
      wasManual: oldEntry.is_manual_edit,
    };

    const newEntries = [...entries];
    newEntries[idx] = { ...oldEntry, shift_type: newType, is_manual_edit: true };

    const newUndoStack = [...undoStack, undoEntry].slice(-MAX_UNDO);

    set({ entries: newEntries, undoStack: newUndoStack, redoStack: [], isDirty: true });
    debouncedRecompute(() => get().recomputeConstraints());
  },

  undo: () => {
    const { entries, undoStack, redoStack } = get();
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    const idx = entries.findIndex((e) => e.staff_id === action.staffId && e.date === action.date);
    if (idx < 0) return;

    const newEntries = [...entries];
    newEntries[idx] = { ...newEntries[idx], shift_type: action.oldType, is_manual_edit: action.wasManual };

    set({
      entries: newEntries,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, action].slice(-MAX_UNDO),
      isDirty: true,
    });
    debouncedRecompute(() => get().recomputeConstraints());
  },

  redo: () => {
    const { entries, undoStack, redoStack } = get();
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    const idx = entries.findIndex((e) => e.staff_id === action.staffId && e.date === action.date);
    if (idx < 0) return;

    const newEntries = [...entries];
    newEntries[idx] = { ...newEntries[idx], shift_type: action.newType, is_manual_edit: true };

    set({
      entries: newEntries,
      undoStack: [...undoStack, action].slice(-MAX_UNDO),
      redoStack: redoStack.slice(0, -1),
      isDirty: true,
    });
    debouncedRecompute(() => get().recomputeConstraints());
  },

  setGenerating: (generating) => set({ isGenerating: generating, generatingElapsed: 0 }),
  setGeneratingElapsed: (elapsed) => set({ generatingElapsed: elapsed }),

  markSaved: (newLockVersion) => {
    const { term } = get();
    if (term) {
      set({
        term: { ...term, lock_version: newLockVersion },
        isDirty: false,
        undoStack: [],
        redoStack: [],
      });
    }
  },

  updateTermStatus: (status) => {
    const { term } = get();
    if (term) set({ term: { ...term, status } });
  },

  recomputeConstraints: () => {
    const { entries, staffs, dates, holidays, term } = get();
    if (!term || entries.length === 0) return;

    const staffInput = buildStaffInput(staffs);
    const holidaySet = new Set(holidays);
    const hardViolations = checkAllHardConstraints(entries, staffInput, dates, term.min_day_staff);
    const softViolations = checkAllSoftConstraints(entries, staffInput, dates, holidaySet);
    const statistics = calculateTermStatistics(entries, staffInput, dates);

    set({ violations: [...hardViolations, ...softViolations], statistics });
  },
}));
