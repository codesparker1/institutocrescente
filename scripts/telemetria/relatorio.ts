/**
 * Relatório de telemetria da simulação — analisa os SimEvento gravados sob tempo acelerado e
 * responde: o que aconteceu, quando (simulado vs real), quanto custou, e onde há anomalias.
 *
 * Usage: npx tsx scripts/telemetria/relatorio.ts [--csv caminho/saida.csv] [--tipo SALTO_RELOGIO]
 *
 * Lê a BD apontada por DATABASE_URL/DIRECT_URL (.env.local) — corre contra qualquer ambiente,
 * mas é tipicamente usado depois de uma corrida de simulação (run-ano / cost-meter).
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "node:fs";

dotenv.config({ path: ".env.local", override: true });

interface Args {
  csv?: string;
  tipo?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--csv") args.csv = argv[++i];
    if (argv[i] === "--tipo") args.tipo = argv[++i];
  }
  return args;
}

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main(): Promise<void> {
  const args = parseArgs();
  const where = args.tipo ? { tipo: args.tipo as never } : {};

  const eventos = await prisma.simEvento.findMany({
    where,
    orderBy: { dataReal: "asc" },
  });

  if (eventos.length === 0) {
    console.log("Sem SimEvento registados (corre uma simulação com SIMULATION_MODE=true primeiro).");
    return;
  }

  // ---- Linha temporal dos saltos do relógio ----
  const saltos = eventos.filter((e) => e.tipo === "SALTO_RELOGIO");
  console.log("=== SALTOS DO RELÓGIO ===");
  for (const s of saltos) {
    const d = s.detalhes as { dias?: number } | null;
    console.log(
      `  real ${s.dataReal.toISOString()}  →  simulada ${s.dataSimulada.toISOString()}  (${d?.dias ?? "?"} dias, offset ${Number(s.offsetMs) / 86400000}d)`,
    );
  }
  if (saltos.length === 0) console.log("  (nenhum)");

  // ---- Jobs preguiçosos: duração e frequência ----
  const jobs = eventos.filter((e) => e.tipo === "JOB_GARANTIR" && e.duracaoMs !== null);
  console.log("\n=== JOBS PREGUIÇOSOS (garantir*) ===");
  const porEtiqueta = new Map<string, number[]>();
  for (const j of jobs) {
    const lista = porEtiqueta.get(j.etiqueta) ?? [];
    lista.push(j.duracaoMs!);
    porEtiqueta.set(j.etiqueta, lista);
  }
  for (const [etiqueta, duracoes] of [...porEtiqueta.entries()].sort()) {
    const media = Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length);
    console.log(
      `  ${etiqueta}: ${duracoes.length} corridas | média ${media}ms | p50 ${pct(duracoes, 50)}ms | p95 ${pct(duracoes, 95)}ms | máx ${Math.max(...duracoes)}ms`,
    );
  }
  if (porEtiqueta.size === 0) console.log("  (nenhum)");

  // ---- Acessos ao dashboard: distribuição por papel e por rota ----
  const acessos = eventos.filter((e) => e.tipo === "ACESSO_DASHBOARD");
  console.log("\n=== ACESSOS AO DASHBOARD ===");
  const porRole = new Map<string, number>();
  for (const a of acessos) porRole.set(a.userRole ?? "?", (porRole.get(a.userRole ?? "?") ?? 0) + 1);
  console.log(`  total ${acessos.length}`);
  for (const [role, n] of [...porRole.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role}: ${n} (${((n / acessos.length) * 100).toFixed(1)}%)`);
  }
  const rotas = new Map<string, number>();
  for (const a of acessos) {
    const rota = a.etiqueta.split("?")[0];
    rotas.set(rota, (rotas.get(rota) ?? 0) + 1);
  }
  console.log("  top rotas:");
  for (const [rota, n] of [...rotas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${rota}: ${n}`);
  }

  // ---- Anomalias simples ----
  console.log("\n=== ANOMALIAS ===");
  let achou = false;
  // Saltos para trás no tempo simulado (só reporRelogio devia fazer isso).
  for (let i = 1; i < saltos.length; i++) {
    if (saltos[i].dataSimulada < saltos[i - 1].dataSimulada) {
      console.log(`  ⚠ salto recua o relógio simulado: ${saltos[i - 1].dataSimulada.toISOString()} → ${saltos[i].dataSimulada.toISOString()}`);
      achou = true;
    }
  }
  // Jobs lentos (>5s reais).
  const lentos = jobs.filter((j) => j.duracaoMs! > 5000);
  if (lentos.length > 0) {
    console.log(`  ⚠ ${lentos.length} corridas de job acima de 5s reais:`);
    for (const j of lentos.slice(0, 10)) console.log(`    ${j.etiqueta} ${j.duracaoMs}ms @ simulada ${j.dataSimulada.toISOString()}`);
    achou = true;
  }
  // Offset negativo (relógio simulado atrás do real sem repor — suspeito).
  const offsetsNegativos = eventos.filter((e) => Number(e.offsetMs) < -60000 && e.tipo !== "REPOR_RELOGIO");
  if (offsetsNegativos.length > 0) {
    console.log(`  ⚠ ${offsetsNegativos.length} eventos com relógio simulado >1min ATRÁS do real sem reposição`);
    achou = true;
  }
  if (!achou) console.log("  (nenhuma detetada)");

  // ---- Export CSV opcional ----
  if (args.csv) {
    const header = "id,tipo,dataSimulada,dataReal,offsetMs,userRole,userId,etiqueta,duracaoMs,detalhes";
    const linhas = eventos.map((e) =>
      [
        e.id,
        e.tipo,
        e.dataSimulada.toISOString(),
        e.dataReal.toISOString(),
        e.offsetMs.toString(),
        e.userRole ?? "",
        e.userId ?? "",
        `"${e.etiqueta.replaceAll('"', '""')}"`,
        e.duracaoMs ?? "",
        e.detalhes ? `"${JSON.stringify(e.detalhes).replaceAll('"', '""')}"` : "",
      ].join(","),
    );
    writeFileSync(args.csv, [header, ...linhas].join("\n"), "utf8");
    console.log(`\nCSV exportado: ${args.csv} (${eventos.length} linhas)`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
