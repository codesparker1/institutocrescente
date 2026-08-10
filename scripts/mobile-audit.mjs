import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = process.argv[2] ?? "./screens-before";
const EMAIL = process.env.LOGIN_EMAIL ?? "admin@ispc.ao";
const PASSWORD = process.env.LOGIN_PASSWORD ?? "Ispc@2026";

const PAGES = ["/dashboard", "/horario", "/notas", "/alunos", "/financeiro/registo", "/auditoria"];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(OUT_DIR, "00-login.png"), fullPage: true });

await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 15000 }), page.click('button[type="submit"]')]);

for (const route of PAGES) {
  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const name = route.replace(/\//g, "_") || "_root";
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
    console.log(`${route} -> horizontal overflow: ${overflow}`);
  } catch (err) {
    console.log(`${route} -> ERROR: ${err.message}`);
  }
}

if (process.env.TEST_MENU === "1") {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, "menu-open.png"), fullPage: true });
  await page.getByRole("link", { name: /Horário/ }).first().click();
  await page.waitForURL(/\/horario/, { timeout: 5000 });
  const overflowAfterNav = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`menu closed after nav / overflow: ${overflowAfterNav}`);
}

await browser.close();
console.log(`Screenshots saved to ${OUT_DIR}`);
