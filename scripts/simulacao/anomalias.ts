/**
 * Deteção de anomalias para a simulação de ano letivo (memória `feedback_playwright_screenshot_anomalias`):
 * screenshot automático em qualquer coisa "esquisita", não só em falhas de assert. Duas fontes:
 *
 * 1. Passiva — `instrumentarPagina` liga listeners a cada Page (erro de consola, exceção não
 *    apanhada, resposta HTTP >=500) e captura sozinha, sem o agente ter de pedir.
 * 2. Ativa — `registarAnomalia` é chamada pelos próprios agentes quando notam algo estranho que
 *    não é um erro técnico (ex. "esperava ver a badge Aprovado mas o texto era outro").
 *
 * Respostas 4xx não disparam captura automática — várias são esperadas de propósito no ano
 * simulado (ex. um ALUNO a tentar `/admin`, redirecionado pelo middleware). Só >=500 é
 * inequivocamente anómalo.
 */
import type { Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Anomalia {
  timestamp: string;
  papel: string;
  motivo: string;
  screenshot: string | null;
}

const anomaliasRegistadas: Anomalia[] = [];

function nomeScreenshot(papel: string): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}_${papel.replace(/\s+/g, "-")}.png`;
}

async function capturar(page: Page, outputDir: string, papel: string, motivo: string): Promise<void> {
  const anomaliasDir = path.join(outputDir, "anomalias");
  mkdirSync(anomaliasDir, { recursive: true });
  const ficheiro = nomeScreenshot(papel);
  const caminho = path.join(anomaliasDir, ficheiro);

  let screenshot: string | null = null;
  try {
    await page.screenshot({ path: caminho, fullPage: true });
    screenshot = path.relative(outputDir, caminho);
  } catch {
    // A própria página pode já ter fechado ou estar num estado que impede o screenshot — regista
    // a anomalia à mesma, sem imagem, em vez de perder o registo.
  }

  anomaliasRegistadas.push({ timestamp: new Date().toISOString(), papel, motivo, screenshot });
  console.warn(`[anomalia] ${papel}: ${motivo}${screenshot ? ` (${screenshot})` : ""}`);
}

/** Liga a deteção passiva a uma Page — chamar uma vez por página/contexto, logo após a criar. */
export function instrumentarPagina(page: Page, outputDir: string, papel: string): void {
  // 90s: o primeiro hit a uma rota nova compila no Turbopack em `next dev` (visto 49s numa corrida
  // real) — bem acima do timeout de 30s por omissão do Playwright. Contra `next build`/`next start`
  // isto não é preciso (sem compilação preguiçosa), mas manter alto não custa nada lá.
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      void capturar(page, outputDir, papel, `consola (${msg.type()}): ${msg.text().slice(0, 300)}`);
    }
  });

  page.on("pageerror", (erro) => {
    void capturar(page, outputDir, papel, `exceção não apanhada no browser: ${erro.message.slice(0, 300)}`);
  });

  page.on("response", (response) => {
    if (response.status() >= 500) {
      void capturar(page, outputDir, papel, `resposta HTTP ${response.status()} em ${response.url()}`);
    }
  });
}

/** Captura manual — os próprios agentes chamam isto quando notam algo estranho, não fatal. */
export async function registarAnomalia(page: Page, outputDir: string, papel: string, motivo: string): Promise<void> {
  await capturar(page, outputDir, papel, motivo);
}

export function escreverRelatorioAnomalias(outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  const caminho = path.join(outputDir, "anomalias.md");

  if (anomaliasRegistadas.length === 0) {
    writeFileSync(caminho, "# Anomalias\n\nNenhuma anomalia detetada.\n");
    return;
  }

  const linhas = [`# Anomalias — ${anomaliasRegistadas.length} registo(s)`, ""];
  for (const a of anomaliasRegistadas) {
    linhas.push(`## ${a.timestamp} — ${a.papel}`);
    linhas.push(`- ${a.motivo}`);
    if (a.screenshot) linhas.push(`- screenshot: \`${a.screenshot}\``);
    linhas.push("");
  }
  writeFileSync(caminho, linhas.join("\n"));
}
