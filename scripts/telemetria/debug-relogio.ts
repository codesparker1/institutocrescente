/** Debug focado: porque é que DEV vê 404 em /admin/relogio no dev server? */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3001";

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on("response", (r) => {
    if (r.url().includes("relogio")) console.log(`  [resp] ${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill("dev@ispc.ao");
  await page.getByLabel(/senha/i).fill("Ispc@2026");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  console.log("após login:", page.url());

  const resp = await page.goto(`${BASE}/admin/relogio`, { waitUntil: "networkidle", timeout: 60000 });
  console.log("status:", resp?.status(), "| URL final:", page.url());
  const texto = await page.locator("body").innerText();
  console.log("--- corpo (primeiras 15 linhas) ---");
  console.log(texto.split("\n").slice(0, 15).join("\n"));
  await page.screenshot({ path: "scripts/telemetria/l1-evidencia/debug-relogio.png", fullPage: true });

  await browser.close();
};

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
