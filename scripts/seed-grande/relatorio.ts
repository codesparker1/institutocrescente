/**
 * Junta as 3 fontes da corrida grande num veredito único de prontidão para deploy — o objetivo
 * explícito desta task não é "correu sem exceção", é "aguenta-se à escala real?":
 *
 * 1. Correção funcional sob concorrência — scripts/simulacao/output/grande-.../resultado-simulacao.json
 *    (agentes que falharam + violações de diagnosticarTodos) e anomalias.md (erros de consola,
 *    respostas 5xx, exceções não apanhadas, capturados por scripts/simulacao/anomalias.ts).
 * 2. Desempenho sob carga — stress-logs/ (ficheiros .json, scripts/stress/run.mjs, já existente).
 * 3. Veredito: PRONTO | PRONTO COM RESSALVAS | NÃO PRONTO, com a lista concreta de motivos.
 *
 * Usage: npx tsx scripts/seed-grande/relatorio.ts
 *   Lê a corrida grande mais recente em scripts/simulacao/output/ e todos os logs em stress-logs/.
 *   Escreve scripts/seed-grande/output/relatorio.md e imprime no stdout; se $GITHUB_STEP_SUMMARY
 *   estiver definida (corrida em GitHub Actions), acrescenta lá também.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import path from "node:path";

const LIMIAR_P99_ACEITAVEL_MS = 1000;
const LIMIAR_P99_CRITICO_MS = 2000;

interface ResultadoAgente {
  papel: string;
  ok: boolean;
  duracaoMs: number;
  erro: string | null;
}

interface ResultadoSimulacao {
  timestamp: string;
  url: string;
  totalAgentes: number;
  duracaoTotalMs: number;
  agentes: ResultadoAgente[];
  violacoes: { alunoNome: string; regra: string; severidade: "ERROR" | "WARNING"; detalhe: string }[];
}

interface StressLog {
  args: { path: string; role: string; connections: number; duration: number; label: string | null };
  result: { requests: { average: number }; latency: { average: number; p99: number }; errors: number; timeouts: number; non2xx: number };
}

function encontrarCorridaGrandeMaisRecente(): string | null {
  const baseDir = path.join(process.cwd(), "scripts", "simulacao", "output");
  if (!existsSync(baseDir)) return null;
  const candidatos = readdirSync(baseDir)
    .filter((nome) => nome.startsWith("grande-"))
    .map((nome) => path.join(baseDir, nome))
    .filter((caminho) => existsSync(path.join(caminho, "resultado-simulacao.json")));
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidatos[0];
}

function contarAnomalias(outputDir: string): number {
  const caminho = path.join(outputDir, "anomalias.md");
  if (!existsSync(caminho)) return 0;
  const conteudo = readFileSync(caminho, "utf-8");
  const cabecalho = conteudo.match(/^# Anomalias — (\d+) registo/m);
  return cabecalho ? Number(cabecalho[1]) : 0;
}

function lerStressLogs(): StressLog[] {
  const logsDir = path.join(process.cwd(), "stress-logs");
  if (!existsSync(logsDir)) return [];
  return readdirSync(logsDir)
    .filter((nome) => nome.endsWith(".json"))
    .map((nome) => JSON.parse(readFileSync(path.join(logsDir, nome), "utf-8")) as StressLog);
}

function main(): void {
  const motivos: string[] = [];
  let nivel: "PRONTO" | "PRONTO COM RESSALVAS" | "NÃO PRONTO" = "PRONTO";

  function rebaixarPara(novoNivel: "PRONTO COM RESSALVAS" | "NÃO PRONTO", motivo: string): void {
    motivos.push(motivo);
    if (novoNivel === "NÃO PRONTO" || nivel === "PRONTO") nivel = novoNivel;
  }

  const corridaDir = encontrarCorridaGrandeMaisRecente();
  let simulacao: ResultadoSimulacao | null = null;
  if (!corridaDir) {
    rebaixarPara("NÃO PRONTO", "Nenhuma corrida de scripts/simulacao/run-grande.ts encontrada — corre-a antes deste relatório.");
  } else {
    simulacao = JSON.parse(readFileSync(path.join(corridaDir, "resultado-simulacao.json"), "utf-8"));
    const falhas = simulacao!.agentes.filter((a) => !a.ok);
    if (falhas.length > 0) {
      rebaixarPara("NÃO PRONTO", `${falhas.length} de ${simulacao!.totalAgentes} agente(s) falharam a corrida completa (${falhas.map((f) => f.papel).join(", ")}).`);
    }

    const errosDiagnostico = simulacao!.violacoes.filter((v) => v.severidade === "ERROR");
    const avisosDiagnostico = simulacao!.violacoes.filter((v) => v.severidade === "WARNING");
    if (errosDiagnostico.length > 0) {
      rebaixarPara("NÃO PRONTO", `${errosDiagnostico.length} violação(ões) ERROR de integridade de dados (diagnosticarTodos) à escala de ${simulacao!.totalAgentes} agentes.`);
    }
    if (avisosDiagnostico.length > 0) {
      rebaixarPara("PRONTO COM RESSALVAS", `${avisosDiagnostico.length} violação(ões) WARNING de integridade de dados.`);
    }

    const anomalias = contarAnomalias(corridaDir);
    if (anomalias > 0) {
      rebaixarPara("PRONTO COM RESSALVAS", `${anomalias} anomalia(s) capturada(s) durante a simulação (erros de consola/HTTP 5xx/exceções — ver anomalias.md).`);
    }
  }

  const stressLogs = lerStressLogs();
  if (stressLogs.length === 0) {
    rebaixarPara("PRONTO COM RESSALVAS", "Nenhum log de scripts/stress/run.mjs encontrado — desempenho sob carga não foi avaliado nesta corrida.");
  } else {
    for (const log of stressLogs) {
      const rota = log.args.label ?? log.args.path;
      if (log.result.errors > 0 || log.result.timeouts > 0) {
        rebaixarPara("NÃO PRONTO", `${rota}: ${log.result.errors} erro(s) e ${log.result.timeouts} timeout(s) sob carga (${log.args.connections} conexões, ${log.args.duration}s).`);
      } else if (log.result.non2xx > 0) {
        rebaixarPara("PRONTO COM RESSALVAS", `${rota}: ${log.result.non2xx} resposta(s) não-2xx sob carga.`);
      }
      if (log.result.latency.p99 >= LIMIAR_P99_CRITICO_MS) {
        rebaixarPara("NÃO PRONTO", `${rota}: p99 de latência ${log.result.latency.p99}ms (limiar crítico: ${LIMIAR_P99_CRITICO_MS}ms) com ${log.args.connections} conexões concorrentes.`);
      } else if (log.result.latency.p99 >= LIMIAR_P99_ACEITAVEL_MS) {
        rebaixarPara("PRONTO COM RESSALVAS", `${rota}: p99 de latência ${log.result.latency.p99}ms (acima do limiar confortável de ${LIMIAR_P99_ACEITAVEL_MS}ms).`);
      }
    }
  }

  if (motivos.length === 0) motivos.push("Nenhum problema encontrado nas 3 fontes avaliadas (correção funcional, integridade de dados, desempenho sob carga).");

  const linhas = [
    "# Relatório de prontidão para deploy",
    "",
    `**Veredito: ${nivel}**`,
    "",
    `Gerado em: ${new Date().toISOString()}`,
    corridaDir ? `Corrida de simulação: \`${path.relative(process.cwd(), corridaDir)}\`` : "Corrida de simulação: nenhuma",
    `Logs de carga avaliados: ${stressLogs.length}`,
    "",
    "## Motivos",
    ...motivos.map((m) => `- ${m}`),
  ];
  if (simulacao) {
    linhas.push("", "## Agentes concorrentes", `- Total: ${simulacao.totalAgentes}`, `- Duração: ${(simulacao.duracaoTotalMs / 1000).toFixed(1)}s`);
  }
  if (stressLogs.length > 0) {
    linhas.push("", "## Carga (stress-logs)");
    for (const log of stressLogs) {
      const rota = log.args.label ?? log.args.path;
      linhas.push(`- ${rota}: p50=${log.result.latency.average}ms p99=${log.result.latency.p99}ms reqs/s=${log.result.requests.average} erros=${log.result.errors} timeouts=${log.result.timeouts}`);
    }
  }
  const texto = linhas.join("\n") + "\n";

  const outputDir = path.join(process.cwd(), "scripts", "seed-grande", "output");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "relatorio.md"), texto);

  console.log(texto);

  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) appendFileSync(stepSummaryPath, texto);

  if ((nivel as string) === "NÃO PRONTO") process.exitCode = 1;
}

main();
