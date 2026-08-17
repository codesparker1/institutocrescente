import type { Page } from "playwright";
import { DEMO_PASSWORD, type CredencialAgente } from "../db-helpers";

/** Mesmos seletores/fluxo de scripts/e2e-workflow/run.ts — id="identificador"/"password" (LoginForm.tsx). */
export async function login(page: Page, baseUrl: string, credencial: CredencialAgente): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#identificador", credencial.email);
  await page.fill("#password", DEMO_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(dashboard|professor)/),
    page.click('button[type="submit"]'),
  ]);
}
