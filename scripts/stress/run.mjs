/**
 * Local load-testing runner for the SGE ISPC Crescente app.
 *
 * IMPORTANT: only ever point this at the local stress database (see .env.local),
 * never at the Neon production/dev database — this is meant to avoid burning
 * Neon's free-tier quota, not to hammer it.
 *
 * Usage:
 *   node scripts/stress/run.mjs --path /dashboard --role secretaria --connections 20 --duration 30
 *
 * Flags:
 *   --url          Base URL of the running app (default: http://localhost:3000)
 *   --path         Path to hammer (default: /dashboard)
 *   --role         Demo account to log in as: admin | secretaria | professor | aluno (default: admin)
 *   --connections  Concurrent connections (default: 10)
 *   --duration     Test duration in seconds (default: 30)
 *   --pipelining   Requests pipelined per connection (default: 1)
 *   --label        Label used in the log filename (default: derived from --path)
 */

import autocannon from "autocannon";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { loginAndGetCookie } from "./login.mjs";

const DEMO_PASSWORD = "Ispc@2026";
const DEMO_EMAILS = {
  admin: "admin@ispc.ao",
  secretaria: "secretaria@ispc.ao",
  professor: "professor@ispc.ao",
  aluno: "aluno@ispc.ao",
};

function parseArgs(argv) {
  const args = {
    url: "http://localhost:3000",
    path: "/dashboard",
    role: "admin",
    connections: 10,
    duration: 30,
    pipelining: 1,
    label: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    switch (key) {
      case "--url":
        args.url = value;
        break;
      case "--path":
        args.path = value;
        break;
      case "--role":
        args.role = value;
        break;
      case "--connections":
        args.connections = Number(value);
        break;
      case "--duration":
        args.duration = Number(value);
        break;
      case "--pipelining":
        args.pipelining = Number(value);
        break;
      case "--label":
        args.label = value;
        break;
      default:
        break;
    }
    i += 1;
  }
  return args;
}

function warnIfLooksLikeNeon(url) {
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    console.warn(
      `\n⚠️  O URL alvo ("${url}") não parece ser localhost. Confirma que NÃO estás a apontar o stress test para produção/Neon.\n`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = DEMO_EMAILS[args.role];
  if (!email) {
    console.error(`Role desconhecido: "${args.role}". Usa um de: ${Object.keys(DEMO_EMAILS).join(", ")}`);
    process.exit(1);
  }

  warnIfLooksLikeNeon(args.url);

  console.log(`A autenticar como ${args.role} (${email})...`);
  const cookie = await loginAndGetCookie(args.url, email, DEMO_PASSWORD);

  console.log(`A aquecer a rota ${args.path} (compilação inicial do Next.js em modo dev)...`);
  const warmupStart = Date.now();
  const warmupRes = await fetch(`${args.url}${args.path}`, { headers: { Cookie: cookie } });
  console.log(`Aquecimento: status ${warmupRes.status} em ${Date.now() - warmupStart}ms.`);
  console.log("A iniciar o teste de carga...\n");

  const targetUrl = `${args.url}${args.path}`;
  const result = await autocannon({
    url: targetUrl,
    connections: args.connections,
    duration: args.duration,
    pipelining: args.pipelining,
    headers: { Cookie: cookie },
  });

  autocannon.printResult(result, { renderResultsTable: true, renderLatencyTable: true });

  const logsDir = path.join(process.cwd(), "stress-logs");
  await mkdir(logsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = args.label ?? (args.path.replace(/\//g, "_").replace(/^_/, "") || "root");
  const jsonPath = path.join(logsDir, `${timestamp}_${label}.json`);
  await writeFile(jsonPath, JSON.stringify({ args, result }, null, 2), "utf-8");

  const summaryLine = [
    new Date().toISOString(),
    `path=${args.path}`,
    `role=${args.role}`,
    `connections=${args.connections}`,
    `duration=${args.duration}s`,
    `reqs/s(avg)=${result.requests.average}`,
    `latency(avg ms)=${result.latency.average}`,
    `latency(p99 ms)=${result.latency.p99}`,
    `2xx=${result[Object.keys(result).find((k) => k === "2xx")] ?? "n/a"}`,
    `non2xx=${result.non2xx}`,
    `errors=${result.errors}`,
    `timeouts=${result.timeouts}`,
    `logfile=${path.basename(jsonPath)}`,
  ].join(" | ");

  await appendFile(path.join(logsDir, "summary.log"), `${summaryLine}\n`, "utf-8");

  console.log(`\nResultado detalhado guardado em: ${jsonPath}`);
  console.log(`Resumo acrescentado a: ${path.join(logsDir, "summary.log")}`);
}

main().catch((error) => {
  console.error("Teste de carga falhou:", error.message);
  process.exit(1);
});
