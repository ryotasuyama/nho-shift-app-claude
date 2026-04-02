/**
 * Playwright スクリプト: 全スタッフの希望休一括登録
 *
 * 前提条件:
 *   - npm run db:seed 済み
 *   - npm run dev でサーバー起動済み
 *
 * 実行:
 *   npx tsx scripts/submit-all-requests.ts
 *   HEADLESS=true npx tsx scripts/submit-all-requests.ts
 */

import { chromium, type Browser, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const HEADLESS = process.env.HEADLESS === "true";
const SLOW_MO = HEADLESS ? 0 : 50;
const PASSWORD = "password1234";
const ADMIN_EMAIL = "admin@nho-example.jp";
const STAFF_COUNT = 20;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function login(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for navigation after login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
}

function staffEmail(n: number): string {
  return `n${String(n).padStart(3, "0")}@nho-example.jp`;
}

/** Pick `count` unique random indices from [0, max) */
function pickRandom(max: number, count: number): number[] {
  const indices = Array.from({ length: max }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

// ──────────────────────────────────────────────
// Phase 1: Admin sets term to "collecting"
// ──────────────────────────────────────────────

async function phase1(browser: Browser) {
  console.log("\n=== Phase 1: タームを「受付中」に変更 ===\n");

  const context = await browser.newContext();
  const page = await context.newPage();

  // Admin login
  await login(page, ADMIN_EMAIL);
  console.log("  管理者ログイン完了");

  // Navigate to terms management
  await page.goto(`${BASE_URL}/admin/terms`);
  await page.waitForSelector("table", { timeout: 10000 });
  console.log("  ターム管理ページ表示");

  // Click "編集" button on the first draft term row
  const editButton = page.locator("button", { hasText: "編集" }).first();
  await editButton.click();

  // Wait for edit dialog to appear
  await page.waitForSelector("text=ターム設定編集", { timeout: 5000 });
  console.log("  編集ダイアログ表示");

  // Set request_deadline to 30 days from now
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 30);
  const deadlineStr = deadline.toISOString().slice(0, 10);

  const dateInput = page.locator('input[type="date"]');
  await dateInput.fill(deadlineStr);
  console.log(`  希望休締切日を ${deadlineStr} に設定`);

  // Save
  await page.click("button:has-text('保存')");
  await page.waitForSelector("text=ターム設定編集", { state: "hidden", timeout: 5000 });
  console.log("  設定保存完了");

  // Register dialog handler BEFORE clicking (confirm() is synchronous)
  page.on("dialog", (dialog) => dialog.accept());

  // Wait for table to re-render after fetchTerms
  await page.waitForSelector("table", { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Debug: show all buttons in the actions column
  const allButtons = await page.locator("table button").allTextContents();
  console.log("  テーブル内のボタン:", allButtons);

  // Check current status badges
  const badges = await page.locator("table span").allTextContents();
  console.log("  ステータスバッジ:", badges);

  // If already "受付中", skip status change
  if (allButtons.some((t) => t.includes("受付開始"))) {
    const startButton = page.locator("button", { hasText: "受付開始" }).first();
    await startButton.click();
    await page.waitForSelector("text=希望休", { timeout: 10000 });
    console.log("  ステータスを「受付中」に変更完了");
  } else if (allButtons.some((t) => t.includes("希望休"))) {
    console.log("  既に「受付中」のため、ステータス変更スキップ");
  } else {
    throw new Error("「受付開始」ボタンも「希望休」ボタンも見つかりません");
  }
  console.log("  ステータスを「受付中」に変更完了");

  await context.close();
}

// ──────────────────────────────────────────────
// Phase 2: All staff submit requests
// ──────────────────────────────────────────────

async function phase2(browser: Browser) {
  console.log("\n=== Phase 2: 全スタッフの希望休提出 ===\n");

  const results: { email: string; dates: string[]; success: boolean }[] = [];

  for (let i = 1; i <= STAFF_COUNT; i++) {
    const email = staffEmail(i);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Login
      await login(page, email);

      // Navigate to requests page
      await page.goto(`${BASE_URL}/requests`);

      // Wait for calendar to load (check for the heading)
      await page.waitForSelector("text=希望休入力", { timeout: 10000 });

      // Check if there's a "no collecting terms" message
      const noTerms = await page.locator("text=現在受付中のタームはありません").count();
      if (noTerms > 0) {
        console.log(`  [${email}] 受付中のタームがありません - スキップ`);
        results.push({ email, dates: [], success: false });
        await context.close();
        continue;
      }

      // Wait for calendar buttons AND for session to load (buttons become enabled)
      // staffId is fetched from /api/auth/session — until then, buttons are disabled
      const enabledButton = page.locator(".grid.grid-cols-7 button:not([disabled])").first();
      await enabledButton.waitFor({ state: "visible", timeout: 15000 });

      // Get all clickable date buttons
      const dateButtons = page.locator(".grid.grid-cols-7 button:not([disabled])");
      const buttonCount = await dateButtons.count();

      // Pick 3 random dates
      const picks = pickRandom(buttonCount, Math.min(3, buttonCount));
      const selectedDates: string[] = [];

      for (const idx of picks) {
        const btn = dateButtons.nth(idx);
        const dayText = await btn.textContent();
        await btn.click();
        // Wait for the API call to complete and UI to update
        // Check that the clicked button gets the selected style (bg-blue-600)
        await page.waitForTimeout(800);
        selectedDates.push(dayText?.trim() ?? "?");
      }

      // Verify requests in the "申請済みの希望休" section
      const requestCount = await page.locator("ul li").count();

      console.log(
        `  [${email}] ${selectedDates.join(", ")}日を選択 → ${requestCount}件登録`
      );
      results.push({ email, dates: selectedDates, success: requestCount === 3 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [${email}] エラー: ${message}`);
      results.push({ email, dates: [], success: false });
    } finally {
      await context.close();
    }
  }

  // Summary
  const successCount = results.filter((r) => r.success).length;
  console.log(`\n  結果: ${successCount}/${STAFF_COUNT} 人が希望休を登録完了`);

  return results;
}

// ──────────────────────────────────────────────
// Phase 3: Admin verifies requests
// ──────────────────────────────────────────────

async function phase3(browser: Browser) {
  console.log("\n=== Phase 3: 管理者が希望休を確認 ===\n");

  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, ADMIN_EMAIL);
  await page.goto(`${BASE_URL}/admin/terms`);
  await page.waitForSelector("table", { timeout: 10000 });

  // Click "希望休" button to show requests panel
  const requestsButton = page.locator("button", { hasText: "希望休" }).first();
  await requestsButton.click();

  // Wait for the requests panel to appear
  await page.waitForSelector("text=希望休一覧", { timeout: 5000 });
  console.log("  希望休一覧パネル表示");

  // Wait a moment for data to load
  await page.waitForTimeout(1000);

  // Take a screenshot for reference
  await page.screenshot({ path: "scripts/requests-result.png", fullPage: true });
  console.log("  スクリーンショット保存: scripts/requests-result.png");

  await context.close();
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log(`\nPlaywright: 全スタッフ希望休一括登録`);
  console.log(`  URL: ${BASE_URL}`);
  console.log(`  Headless: ${HEADLESS}`);
  console.log(`  Staff: ${STAFF_COUNT}人\n`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: SLOW_MO,
  });

  try {
    await phase1(browser);
    await phase2(browser);
    await phase3(browser);
    console.log("\n✓ 完了\n");
  } catch (err) {
    console.error("\n✗ エラーが発生しました:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
