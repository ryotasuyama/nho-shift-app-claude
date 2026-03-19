import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PASSWORD = "password1234";

const staffData = [
  { code: "N001", name: "田中 美咲", years: 15, team: "A" as const, night: true },
  { code: "N002", name: "佐藤 由美", years: 12, team: "A" as const, night: true },
  { code: "N003", name: "鈴木 花子", years: 10, team: "A" as const, night: true },
  { code: "N004", name: "高橋 恵子", years: 8, team: "A" as const, night: true },
  { code: "N005", name: "伊藤 真理", years: 7, team: "A" as const, night: true },
  { code: "N006", name: "渡辺 さくら", years: 5, team: "A" as const, night: true },
  { code: "N007", name: "山本 優子", years: 4, team: "A" as const, night: false },
  { code: "N008", name: "中村 愛", years: 3, team: "A" as const, night: true },
  { code: "N009", name: "小林 千尋", years: 2, team: "A" as const, night: true },
  { code: "N010", name: "加藤 彩", years: 1, team: "A" as const, night: false },
  { code: "N011", name: "吉田 理恵", years: 14, team: "B" as const, night: true },
  { code: "N012", name: "山田 明美", years: 11, team: "B" as const, night: true },
  { code: "N013", name: "松本 香織", years: 9, team: "B" as const, night: true },
  { code: "N014", name: "井上 裕子", years: 6, team: "B" as const, night: true },
  { code: "N015", name: "木村 麻衣", years: 5, team: "B" as const, night: true },
  { code: "N016", name: "林 美穂", years: 4, team: "B" as const, night: true },
  { code: "N017", name: "清水 陽子", years: 3, team: "B" as const, night: false },
  { code: "N018", name: "山口 智子", years: 2, team: "B" as const, night: true },
  { code: "N019", name: "阿部 沙織", years: 1, team: "B" as const, night: true },
  { code: "N020", name: "池田 瞳", years: 1, team: "B" as const, night: false },
];

const main = async () => {
  // --- 既存 Supabase Auth ユーザー削除 ---
  console.log("Cleaning Supabase Auth users...");
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  if (authUsers?.users) {
    for (const u of authUsers.users) {
      await supabase.auth.admin.deleteUser(u.id);
    }
  }
  console.log(`Deleted ${authUsers?.users?.length ?? 0} auth users.`);

  // --- 既存データ削除（子→親の順） ---
  console.log("Cleaning existing data...");
  await prisma.shiftEntry.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.user.deleteMany();
  console.log("Cleaned.");

  // --- Term ---
  console.log("Seeding test term...");
  await prisma.term.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      start_date: new Date("2026-04-01T00:00:00Z"),
      end_date: new Date("2026-04-28T00:00:00Z"),
      fiscal_year: 2026,
      status: "draft",
      min_day_staff: 7,
      lock_version: 1,
    },
  });
  console.log("Seeded 1 test term.");

  // --- Admin ---
  console.log("Seeding admin...");
  const adminEmail = "admin@nho-example.jp";
  const { data: adminAuth, error: adminAuthError } =
    await supabase.auth.admin.createUser({
      email: adminEmail,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "admin", must_change_password: true },
    });
  if (adminAuthError || !adminAuth.user) {
    throw new Error(`Failed to create admin auth user: ${adminAuthError?.message}`);
  }
  await prisma.user.create({
    data: {
      id: adminAuth.user.id,
      email: adminEmail,
      role: "admin",
      must_change_password: true,
    },
  });
  console.log("Seeded 1 admin.");

  // --- Supabase Auth + User + Staff ---
  console.log("Seeding staff...");
  for (const s of staffData) {
    const email = `${s.code.toLowerCase()}@nho-example.jp`;

    // Supabase Auth ユーザー作成
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { role: "staff", must_change_password: true },
      });
    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user ${email}: ${authError?.message}`);
    }

    // Prisma User（Supabase Auth の ID を使用）
    const user = await prisma.user.create({
      data: {
        id: authData.user.id,
        email,
        role: "staff",
        must_change_password: true,
      },
    });

    await prisma.staff.create({
      data: {
        user_id: user.id,
        staff_code: s.code,
        name: s.name,
        experience_years: s.years,
        team: s.team,
        night_shift_available: s.night,
        is_active: true,
      },
    });
  }
  console.log(`Seeded ${staffData.length} staff members.`);
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
