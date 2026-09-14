/** Teste mínimo antes de investir no guião de capturas: o login funciona contra o site publicado? */
import { chromium } from "playwright";

const BASE = process.env.MANUAL_BASE_URL ?? "https://institutocrescente-code-spark1.vercel.app";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } } as never);

  page.on("console", (m) => console.log(`  [console:${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) console.log(`  [http ${r.status()}] ${r.url().slice(0, 140)}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identificador"]', "admin@ispc.ao");
  await page.fill('input[name="password"]', "Ispc@2026");
  await page.click('button[type="submit"]');

  // O login é uma Server Action seguida de redirect do lado do cliente — networkidle sozinho
  // resolve cedo demais. Esperamos por sair de /login, e se não sairmos queremos ver porquê.
  await page
    .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 })
    .catch(() => console.log("  (continuou em /login)"));
  await page.waitForTimeout(3000);

  console.log("url depois do login:", page.url());
  const titulo = await page.title();
  console.log("titulo:", titulo);
  const texto = (await page.locator("body").innerText()).slice(0, 600);
  console.log("--- corpo ---");
  console.log(texto);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
