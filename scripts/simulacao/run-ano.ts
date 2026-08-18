/**
 * Simulação caótica de um ano letivo inteiro (Fase 2 do cost-meter) — comprime o ano em marcos-
 * chave (scripts/simulacao/ano/marcos.ts), avançando o relógio simulado entre eles. Em cada
 * marco corre uma mistura de agentes calmos (carga de fundo normal, scripts/simulacao/agentes/)
 * e agentes caóticos (erros humanos e ações contraditórias deliberadas,
 * scripts/simulacao/agentes/caotico/) — o objetivo não é só "não crashou", é "recusou
 * graciosamente o que devia recusar". Marcos de pico também disparam uma rajada `autocannon`
 * via scripts/stress/run.mjs (reaproveitado tal e qual) para simular volume de tráfego real sem
 * precisar de centenas de browsers.
 *
 * Usage: npx tsx scripts/simulacao/run-ano.ts [--url http://localhost:3000]
 *   [--alunos 8] [--professores 3] [--seed 123456]
 *
 * O seed da amostragem de professores/alunos é sempre impresso e gravado em resultado-ano.json
 * — sem `--seed`, um é gerado e registado; com `--seed`, uma corrida vermelha reproduz-se
 * exatamente (mesmos professores/alunos amostrados) em vez de se tornar um alvo móvel.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { garantirNaoENeon } from "../lib/guardarNeon";
import { gerarSeed } from "../lib/rng";
import { avancarRelogio } from "./relogio";
import { escreverRelatorioAnomalias } from "./anomalias";
import { construirMarcos, type Marco } from "./ano/marcos";
import { estimarCusto, type AmostraPedido } from "./custo";
import { visitarComoAluno } from "./agentes/aluno";
import { agirComoProfessor } from "./agentes/professor";
import { visitarComoSecretaria } from "./agentes/secretaria";
import { visitarComoAdmin } from "./agentes/admin";
import { agirComoSecretariaCaotica } from "./agentes/caotico/secretaria";
import { agirComoProfessorCaotico } from "./agentes/caotico/professor";
import { agirComoDaacCaotico } from "./agentes/caotico/daac";
import { agirComoAdminCaotico } from "./agentes/caotico/admin";
import { agirComoAlunoCaotico } from "./agentes/caotico/aluno";
import type { ResultadoAgenteCaotico } from "./agentes/caotico/comum";
import { getContextoSimulacao, disconnect, type CredencialAgente } from "./db-helpers";
import { diagnosticarTodos, type AlunoParaDiagnostico, type Violacao } from "../../src/lib/diagnostico";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });
garantirNaoENeon();

interface Args {
  url: string;
  alunos: number;
  professores: number;
  seed?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { url: "http://localhost:3000", alunos: 8, professores: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[i + 1];
    else if (argv[i] === "--alunos") args.alunos = Number(argv[i + 1]);
    else if (argv[i] === "--professores") args.professores = Number(argv[i + 1]);
    else if (argv[i] === "--seed" && argv[i + 1]) args.seed = Number(argv[i + 1]);
  }
  return args;
}

interface ResultadoMarco {
  marco: string;
  label: string;
  data: string;
  agentesOk: number;
  agentesFalharam: number;
  errosAgentesCalmos: string[];
  acoesCaoticas: (ResultadoAgenteCaotico["acoes"][number] & { agente: string })[];
  violacoes: Violacao[];
  autocannon: { path: string; p50: number; p99: number; reqsPorSegundo: number; erros: number } | null;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function lerConfigAcademica() {
  const config = await prisma.configuracaoAcademica.findUniqueOrThrow({ where: { id: "config" } });
  return {
    anoLetivoInicio: config.anoLetivoInicio ?? new Date(),
    anoLetivoFim: config.anoLetivoFim ?? new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
    matriculaInicio: config.matriculaInicio ?? new Date(),
    matriculaFim: config.matriculaFim ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  };
}

async function resolverAlvos() {
  const [devedor, qualquerAtivo, turmaComDisciplinas] = await Promise.all([
    prisma.cobranca
      .groupBy({ by: ["alunoId"], where: { status: "PENDENTE" }, _count: { _all: true }, having: { alunoId: { _count: { gt: 1 } } } })
      .then((rows) => rows[0]?.alunoId),
    prisma.aluno.findFirst({ where: { status: "ATIVO" }, select: { id: true } }).then((a) => a?.id),
    prisma.turma
      .findFirst({ where: { turmaDisciplinas: { some: {} } }, select: { cursoId: true, anoCurricular: true, periodo: true } })
      .then((t) => (t ? { cursoId: t.cursoId, anoCurricular: t.anoCurricular, periodo: t.periodo as string } : undefined)),
  ]);
  return { alunoDevedorId: devedor, alunoForaDaJanelaId: qualquerAtivo, turmaComDisciplinas };
}

async function correrDiagnostico(): Promise<Violacao[]> {
  const alunos = await prisma.aluno.findMany({
    select: {
      id: true,
      nome: true,
      status: true,
      matriculas: { select: { id: true, status: true, turma: { select: { anoLetivo: true } } } },
      inscricoes: {
        select: {
          id: true,
          ativa: true,
          cadeiraCurricularId: true,
          cadeiraCurricular: { select: { disciplina: { select: { nome: true } } } },
          turmaDisciplina: { select: { turma: { select: { anoLetivo: true } }, horarioSlots: { select: { id: true }, take: 1 } } },
        },
      },
    },
  });
  const paraDiagnostico: AlunoParaDiagnostico[] = alunos.map((a) => ({
    id: a.id,
    nome: a.nome,
    status: a.status,
    matriculas: a.matriculas.map((m) => ({ id: m.id, status: m.status, anoLetivo: m.turma.anoLetivo })),
    inscricoes: a.inscricoes.map((i) => ({
      id: i.id,
      ativa: i.ativa,
      cadeiraCurricularId: i.cadeiraCurricularId,
      cadeiraNome: i.cadeiraCurricular.disciplina.nome,
      turmaAnoLetivo: i.turmaDisciplina.turma.anoLetivo,
      temHorarioSlot: i.turmaDisciplina.horarioSlots.length > 0,
    })),
  }));
  return diagnosticarTodos(paraDiagnostico);
}

/** Reaproveita scripts/stress/run.mjs sem alterações — só chamado nos marcos de pico. */
/**
 * scripts/stress/run.mjs escreve o resultado real (latency.average/p99, errors, timeouts) num
 * JSON em stress-logs/, não no stdout — o que autocannon imprime é uma tabela ASCII formatada
 * para leitura humana, sem nenhuma das strings que um regex conseguiria apanhar de forma
 * fiável. Um regex a caçar padrões nesse texto formatado (a versão anterior desta função) tinha
 * sempre p50=0/p99=0 como fallback silencioso — "0ms" em todas as corridas nunca foi "sem
 * latência", foi o canal de desempenho inteiro nunca ter medido nada. Ler o ficheiro que o
 * próprio script já escreve é o caminho fiável.
 */
async function correrAutocannon(
  url: string,
  rota: string,
  conexoes: number,
): Promise<{ p50: number; p99: number; reqsPorSegundo: number; erros: number } | null> {
  const label = `ano-${rota.replace(/\//g, "_")}`;
  const logsDir = path.join(process.cwd(), "stress-logs");
  const antes = new Set(existsSync(logsDir) ? readdirSync(logsDir) : []);

  const sucesso = await new Promise<boolean>((resolve) => {
    const proc = spawn(
      "node",
      ["scripts/stress/run.mjs", "--url", url, "--path", rota, "--role", "secretaria", "--connections", String(conexoes), "--duration", "20", "--label", label],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
  if (!sucesso) return null;

  const novoFicheiro = existsSync(logsDir)
    ? readdirSync(logsDir)
        .filter((f) => f.endsWith(`_${label}.json`) && !antes.has(f))
        .sort()
        .at(-1)
    : undefined;
  if (!novoFicheiro) return null;

  try {
    const conteudo = JSON.parse(readFileSync(path.join(logsDir, novoFicheiro), "utf-8"));
    const result = conteudo.result;
    return {
      p50: Math.round(result.latency.average),
      p99: Math.round(result.latency.p99),
      reqsPorSegundo: Math.round(result.requests.average),
      erros: (result.errors ?? 0) + (result.timeouts ?? 0),
    };
  } catch {
    return null;
  }
}

async function correrOndaCalma(
  browser: Browser,
  url: string,
  outputDir: string,
  papel: "aluno" | "professor" | "secretaria" | "admin",
  credenciais: CredencialAgente[],
): Promise<{ ok: number; falharam: number; erros: string[] }> {
  let ok = 0;
  let falharam = 0;
  const erros: string[] = [];
  await Promise.all(
    credenciais.map(async (credencial) => {
      const ctx = await browser.newContext();
      try {
        const page = await ctx.newPage();
        if (papel === "aluno") await visitarComoAluno(page, url, credencial, outputDir);
        else if (papel === "professor") await agirComoProfessor(page, url, credencial, outputDir, {});
        else if (papel === "secretaria") await visitarComoSecretaria(page, url, credencial, outputDir);
        else await visitarComoAdmin(page, url, credencial, outputDir);
        ok += 1;
      } catch (erro) {
        // console.error mostrou-se sistematicamente não fiável neste workflow (ver histórico do
        // cost-meter) — a mensagem real só é visível se acabar em resultado-ano.json.
        falharam += 1;
        erros.push(`${papel}/${credencial.papel}: ${erro instanceof Error ? erro.message.slice(0, 300) : String(erro)}`);
      } finally {
        await ctx.close();
      }
    }),
  );
  return { ok, falharam, erros };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const seed = args.seed ?? gerarSeed();
  const outputDir = path.join(process.cwd(), "scripts", "simulacao", "output", `ano-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });

  console.log(`Seed desta corrida: ${seed} (repete com --seed ${seed} para reproduzir exatamente a mesma amostra de professores/alunos)`);
  console.log("A ler configuração académica e contexto seedado...");
  const configAcademica = await lerConfigAcademica();
  const alvos = await resolverAlvos();
  const contexto = await getContextoSimulacao({ professores: args.professores, alunos: args.alunos, seed });
  await disconnect();

  const marcos = construirMarcos(configAcademica);
  const browser = await chromium.launch();
  const resultados: ResultadoMarco[] = [];
  const pedidosParaCusto: AmostraPedido[] = [];
  const inicioTotal = Date.now();

  for (const marco of marcos) {
    console.log(`\n=== Marco: ${marco.label} (${marco.data.toISOString().slice(0, 10)}) ===`);

    if (marco.id === "janela-rematricula" && marco.dataForaDaJanela && alvos.alunoForaDaJanelaId) {
      avancarRelogio(marco.dataForaDaJanela);
      // A secção de Rematrícula é gated por podeRegistarPagamento (ADMIN/SECRETARIA) — usar
      // secretaria aqui, não daac, para o teste ser conclusivo (ver src/lib/permissions.ts e o
      // achado documentado em scripts/simulacao/agentes/caotico/secretaria.ts).
      const ctx = await browser.newContext();
      const resultado = await agirComoSecretariaCaotica(ctx, args.url, contexto.secretaria, outputDir, {
        alunoForaDaJanelaId: alvos.alunoForaDaJanelaId,
      });
      await ctx.close();
      resultados.push({
        marco: `${marco.id}-fora-da-janela`,
        label: `${marco.label} (tentativa fora da janela)`,
        data: marco.dataForaDaJanela.toISOString(),
        agentesOk: 1,
        agentesFalharam: 0,
        errosAgentesCalmos: [],
        acoesCaoticas: resultado.acoes.map((a) => ({ ...a, agente: "secretaria-caotica" })),
        violacoes: [],
        autocannon: null,
      });
    }

    avancarRelogio(marco.data);
    const inicioMarco = Date.now();
    const acoesCaoticas: ResultadoMarco["acoesCaoticas"] = [];
    const errosAgentesCalmos: string[] = [];
    let agentesOk = 0;
    let agentesFalharam = 0;

    const tarefasCaoticas: Promise<void>[] = [];
    async function correr(agente: string, tarefa: Promise<ResultadoAgenteCaotico>): Promise<void> {
      try {
        const resultado = await tarefa;
        acoesCaoticas.push(...resultado.acoes.map((a) => ({ ...a, agente })));
        agentesOk += 1;
      } catch (erro) {
        agentesFalharam += 1;
        console.error(`  [FALHOU] ${agente}:`, erro instanceof Error ? erro.message : erro);
      }
    }

    if (marco.id === "abertura-matricula") {
      const ctxA = await browser.newContext();
      tarefasCaoticas.push(correr("secretaria-caotica", agirComoSecretariaCaotica(ctxA, args.url, contexto.secretaria, outputDir)));
      const onda = await correrOndaCalma(browser, args.url, outputDir, "aluno", contexto.alunos);
      agentesOk += onda.ok;
      agentesFalharam += onda.falharam;
      errosAgentesCalmos.push(...onda.erros);
      await Promise.all(tarefasCaoticas);
      await ctxA.close();
    } else if (marco.id === "semana-normal-aulas") {
      const ctxP = await browser.newContext();
      const ctxA = await browser.newContext();
      tarefasCaoticas.push(correr("professor-caotico", agirComoProfessorCaotico(ctxP, args.url, contexto.professores[0], outputDir)));
      tarefasCaoticas.push(correr("aluno-caotico", agirComoAlunoCaotico(ctxA, args.url, contexto.alunos[0], outputDir)));
      const onda = await correrOndaCalma(browser, args.url, outputDir, "professor", contexto.professores.slice(1));
      agentesOk += onda.ok;
      agentesFalharam += onda.falharam;
      errosAgentesCalmos.push(...onda.erros);
      await Promise.all(tarefasCaoticas);
      await Promise.all([ctxP.close(), ctxA.close()]);
    } else if (marco.id === "vencimento-propinas") {
      const ctxS = await browser.newContext();
      tarefasCaoticas.push(correr("secretaria-caotica", agirComoSecretariaCaotica(ctxS, args.url, contexto.secretaria, outputDir, { alunoDevedorId: alvos.alunoDevedorId })));
      await Promise.all(tarefasCaoticas);
      await ctxS.close();
    } else if (marco.id === "avaliacoes-p1" || marco.id === "avaliacoes-p2-exame") {
      const ctxP = await browser.newContext();
      tarefasCaoticas.push(correr("professor-caotico", agirComoProfessorCaotico(ctxP, args.url, contexto.professores[0], outputDir)));
      const onda = await correrOndaCalma(browser, args.url, outputDir, "professor", contexto.professores.slice(1));
      agentesOk += onda.ok;
      agentesFalharam += onda.falharam;
      errosAgentesCalmos.push(...onda.erros);
      await Promise.all(tarefasCaoticas);
      await ctxP.close();
    } else if (marco.id === "janela-rematricula") {
      const ctxAd = await browser.newContext();
      const ctxDaac = await browser.newContext();
      tarefasCaoticas.push(
        correr("admin-caotico", agirComoAdminCaotico(ctxAd, args.url, contexto.admin, outputDir, { turmaComDisciplinas: alvos.turmaComDisciplinas })),
      );
      tarefasCaoticas.push(correr("daac-caotico", agirComoDaacCaotico(ctxDaac, args.url, contexto.daac, outputDir)));
      const onda = await correrOndaCalma(browser, args.url, outputDir, "secretaria", [contexto.secretaria]);
      agentesOk += onda.ok;
      agentesFalharam += onda.falharam;
      errosAgentesCalmos.push(...onda.erros);
      await Promise.all(tarefasCaoticas);
      await Promise.all([ctxAd.close(), ctxDaac.close()]);
    } else if (marco.id === "novo-ano-letivo") {
      const onda1 = await correrOndaCalma(browser, args.url, outputDir, "admin", [contexto.admin]);
      const onda2 = await correrOndaCalma(browser, args.url, outputDir, "secretaria", [contexto.secretaria]);
      agentesOk += onda1.ok + onda2.ok;
      agentesFalharam += onda1.falharam + onda2.falharam;
      errosAgentesCalmos.push(...onda1.erros, ...onda2.erros);
    }

    pedidosParaCusto.push({ duracaoMs: Date.now() - inicioMarco });

    let autocannon: ResultadoMarco["autocannon"] = null;
    if (marco.pico && marco.rotaPico) {
      const resultadoAutocannon = await correrAutocannon(args.url, marco.rotaPico, marco.conexoesPico ?? 50);
      if (resultadoAutocannon) {
        autocannon = { path: marco.rotaPico, ...resultadoAutocannon };
        pedidosParaCusto.push({ duracaoMs: resultadoAutocannon.p50 * (marco.conexoesPico ?? 50) });
      }
    }

    const violacoes = await correrDiagnostico();

    resultados.push({
      marco: marco.id,
      label: marco.label,
      data: marco.data.toISOString(),
      agentesOk,
      agentesFalharam,
      errosAgentesCalmos,
      acoesCaoticas,
      violacoes,
      autocannon,
    });

    console.log(`  agentes ok=${agentesOk} falharam=${agentesFalharam} | ações caóticas=${acoesCaoticas.length} | violações=${violacoes.length}`);

    // Escrito a CADA marco, não só no fim — se o job for morto pelo timeout do workflow a meio
    // do ano simulado, ainda ficam os marcos já concluídos em vez de perder a corrida inteira.
    const duracaoParcialMs = Date.now() - inicioTotal;
    writeFileSync(
      path.join(outputDir, "resultado-ano.json"),
      JSON.stringify(
        { timestamp: new Date().toISOString(), url: args.url, seed, duracaoTotalMs: duracaoParcialMs, completo: false, marcos: resultados, estimativaCusto: estimarCusto({ duracaoTotalMs: duracaoParcialMs, pedidos: pedidosParaCusto }) },
        null,
        2,
      ),
    );
  }

  await browser.close();
  escreverRelatorioAnomalias(outputDir);

  const duracaoTotalMs = Date.now() - inicioTotal;
  const estimativaCusto = estimarCusto({ duracaoTotalMs, pedidos: pedidosParaCusto });

  writeFileSync(
    path.join(outputDir, "resultado-ano.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), url: args.url, seed, duracaoTotalMs, completo: true, marcos: resultados, estimativaCusto }, null, 2),
  );

  console.log(`\nSimulação do ano concluída em ${(duracaoTotalMs / 1000 / 60).toFixed(1)} min. Seed: ${seed}`);
  console.log(`Saída completa em: ${outputDir}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
