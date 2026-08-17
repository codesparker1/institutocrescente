/**
 * Relatório da simulação caótica de ano letivo (scripts/simulacao/run-ano.ts) — ao contrário de
 * relatorio.ts (uma corrida, um veredito), este é uma TABELA POR MARCO: o que aconteceu em cada
 * momento do ano, não um blob único. Motivos de reprovação por marco em vez de uma lista plana —
 * é mais fácil ler "a rematrícula fora da janela é que teve o problema" do que vasculhar tudo.
 *
 * Usage: npx tsx scripts/seed-grande/relatorio-ano.ts
 *   Lê a corrida mais recente em scripts/simulacao/output/ano-*/resultado-ano.json.
 *   Escreve scripts/seed-grande/output/relatorio-ano.md e imprime no stdout; acrescenta a
 *   $GITHUB_STEP_SUMMARY quando definida.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import path from "node:path";

interface AcaoCaotica {
  agente: string;
  label: string;
  esperadoRejeitado: boolean;
  foiRejeitadoGraciosamente: boolean | null;
  detalhe?: string;
}

interface ResultadoMarco {
  marco: string;
  label: string;
  data: string;
  agentesOk: number;
  agentesFalharam: number;
  acoesCaoticas: AcaoCaotica[];
  violacoes: { alunoNome: string; severidade: "ERROR" | "WARNING"; detalhe: string }[];
  autocannon: { path: string; p50: number; p99: number; erros: number } | null;
}

interface ResultadoAno {
  timestamp: string;
  url: string;
  duracaoTotalMs: number;
  marcos: ResultadoMarco[];
  estimativaCusto: { neonUSD: number; vercelUSD: number; totalUSD: number; totalAOA: number };
}

function encontrarCorridaMaisRecente(): string | null {
  const baseDir = path.join(process.cwd(), "scripts", "simulacao", "output");
  if (!existsSync(baseDir)) return null;
  const candidatos = readdirSync(baseDir)
    .filter((nome) => nome.startsWith("ano-"))
    .map((nome) => path.join(baseDir, nome))
    .filter((caminho) => existsSync(path.join(caminho, "resultado-ano.json")));
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidatos[0];
}

function classificarAcao(acao: AcaoCaotica): "OK" | "SUSPEITO" {
  if (acao.foiRejeitadoGraciosamente === null) return "OK"; // não observável nesta corrida — não é falha
  if (acao.esperadoRejeitado) return acao.foiRejeitadoGraciosamente ? "OK" : "SUSPEITO";
  return acao.foiRejeitadoGraciosamente ? "OK" : "SUSPEITO";
}

function main(): void {
  const corridaDir = encontrarCorridaMaisRecente();
  if (!corridaDir) {
    console.error("Nenhuma corrida de scripts/simulacao/run-ano.ts encontrada.");
    process.exitCode = 1;
    return;
  }

  const resultado: ResultadoAno = JSON.parse(readFileSync(path.join(corridaDir, "resultado-ano.json"), "utf-8"));

  const motivos: string[] = [];
  let nivel: "PRONTO" | "PRONTO COM RESSALVAS" | "NÃO PRONTO" = "PRONTO";
  function rebaixar(novoNivel: "PRONTO COM RESSALVAS" | "NÃO PRONTO", motivo: string): void {
    motivos.push(motivo);
    if (novoNivel === "NÃO PRONTO" || nivel === "PRONTO") nivel = novoNivel;
  }

  const linhasTabela: string[] = [
    "| Marco | Agentes OK/Falhas | Ações caóticas suspeitas | Violações ERROR/WARNING | p99 (pico) |",
    "|---|---|---|---|---|",
  ];

  for (const marco of resultado.marcos) {
    const suspeitas = marco.acoesCaoticas.filter((a) => classificarAcao(a) === "SUSPEITO");
    const erros = marco.violacoes.filter((v) => v.severidade === "ERROR");
    const avisos = marco.violacoes.filter((v) => v.severidade === "WARNING");

    if (marco.agentesFalharam > 0) rebaixar("NÃO PRONTO", `${marco.label}: ${marco.agentesFalharam} agente(s) falharam a corrida completa.`);
    if (suspeitas.length > 0) {
      for (const s of suspeitas) rebaixar("NÃO PRONTO", `${marco.label}: "${s.label}" (${s.agente}) — esperava-se rejeição graciosa e não aconteceu (${s.detalhe ?? "sem detalhe"}).`);
    }
    if (erros.length > 0) rebaixar("NÃO PRONTO", `${marco.label}: ${erros.length} violação(ões) ERROR de integridade de dados.`);
    if (avisos.length > 0) rebaixar("PRONTO COM RESSALVAS", `${marco.label}: ${avisos.length} violação(ões) WARNING.`);
    if (marco.autocannon && marco.autocannon.erros > 0) rebaixar("NÃO PRONTO", `${marco.label}: erros HTTP na rajada de pico em ${marco.autocannon.path}.`);

    linhasTabela.push(
      `| ${marco.label} | ${marco.agentesOk}/${marco.agentesFalharam} | ${suspeitas.length}/${marco.acoesCaoticas.length} | ${erros.length}/${avisos.length} | ${marco.autocannon ? `${marco.autocannon.p99}ms` : "—"} |`,
    );
  }

  if (motivos.length === 0) motivos.push("Nenhum problema encontrado em nenhum marco do ano simulado.");

  const linhas = [
    "# Relatório — simulação caótica de ano letivo",
    "",
    `**Veredito: ${nivel}**`,
    "",
    `Gerado em: ${new Date().toISOString()}`,
    `Corrida: \`${path.relative(process.cwd(), corridaDir)}\``,
    `Duração total: ${(resultado.duracaoTotalMs / 1000 / 60).toFixed(1)} min`,
    "",
    "## Motivos",
    ...motivos.map((m) => `- ${m}`),
    "",
    "## Por marco",
    ...linhasTabela,
    "",
    "## Estimativa de custo Neon/Vercel desta corrida (aproximada, não é fatura real)",
    `- Neon (compute): ~$${resultado.estimativaCusto.neonUSD.toFixed(4)}`,
    `- Vercel (function): ~$${resultado.estimativaCusto.vercelUSD.toFixed(4)}`,
    `- Total: ~$${resultado.estimativaCusto.totalUSD.toFixed(4)} (~${resultado.estimativaCusto.totalAOA.toFixed(0)} Kz)`,
    "- Ajusta scripts/simulacao/custo.ts (PRECOS) ao teu plano real antes de confiar nestes números.",
  ];

  const texto = linhas.join("\n") + "\n";
  const outputDir = path.join(process.cwd(), "scripts", "seed-grande", "output");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "relatorio-ano.md"), texto);
  console.log(texto);

  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) appendFileSync(stepSummaryPath, texto);

  if ((nivel as string) === "NÃO PRONTO") process.exitCode = 1;
}

main();
