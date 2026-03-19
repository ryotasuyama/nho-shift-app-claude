import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ===== ここを変更してください =====
const ADMIN_EMAIL = "admin@nho-shift.local";
const ADMIN_PASSWORD = "admin1234";

const STAFF_USERS = [
  { email: "staff01@nho-shift.local", password: "staff1234", name: "看護師01", staff_code: "S001", team: "A" as const, experience_years: 5, night_shift_available: true },
  { email: "staff02@nho-shift.local", password: "staff1234", name: "看護師02", staff_code: "S002", team: "A" as const, experience_years: 3, night_shift_available: true },
  { email: "staff03@nho-shift.local", password: "staff1234", name: "看護師03", staff_code: "S003", team: "B" as const, experience_years: 7, night_shift_available: true },
  { email: "staff04@nho-shift.local", password: "staff1234", name: "看護師04", staff_code: "S004", team: "B" as const, experience_years: 2, night_shift_available: false },
  { email: "staff05@nho-shift.local", password: "staff1234", name: "看護師05", staff_code: "S005", team: "A" as const, experience_years: 10, night_shift_available: true },
];
// ==================================

async function createAuthUser(email: string, password: string, role: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (error) {
    if (error.message.includes("already been registered")) {
      console.log(`  [skip] ${email} は既に登録済み`);
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find((u) => u.email === email);
      return existing?.id ?? null;
    }
    throw error;
  }
  return data.user.id;
}

async function main() {
  console.log("=== 管理者ユーザー作成 ===");
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
  if (adminId) {
    await prisma.user.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        email: ADMIN_EMAIL,
        role: "admin",
        must_change_password: false,
      },
    });
    console.log(`  admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  }

  console.log("\n=== スタッフユーザー作成 ===");
  for (const s of STAFF_USERS) {
    const userId = await createAuthUser(s.email, s.password, "staff");
    if (!userId) continue;

    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: s.email,
        role: "staff",
        must_change_password: false,
      },
    });

    await prisma.staff.upsert({
      where: { user_id: userId },
      update: {},
      create: {
        user_id: userId,
        staff_code: s.staff_code,
        name: s.name,
        team: s.team,
        experience_years: s.experience_years,
        night_shift_available: s.night_shift_available,
      },
    });

    console.log(`  ${s.staff_code} ${s.name}: ${s.email} / ${s.password}`);
  }

  console.log("\n=== 完了 ===");
  console.log(`管理者ログイン: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`スタッフログイン: staff01@nho-shift.local / staff1234 (他も同様)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
