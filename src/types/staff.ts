export type StaffListItem = {
  id: string;
  user_id: string;
  staff_code: string;
  name: string;
  experience_years: number;
  team: "A" | "B";
  night_shift_available: boolean;
  is_active: boolean;
};
