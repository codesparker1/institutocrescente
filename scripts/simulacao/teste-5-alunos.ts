/**
 * Simulação E2E dos 5 alunos seedados por scripts/seed-teste-5-anos.ts (Marta Kiala, João Manuel,
 * Beatriz Sacatucua, Domingos Cavaco, Isabel Neto), percorrendo o percurso académico completo —
 * até 4 anos curriculares — com o relógio simulado, para apanhar bugs antes da corrida final com
 * utilizadores reais. Ver o plano completo em C:\Users\hp\.claude\plans\floofy-rolling-falcon.md.
 *
 * Reaproveita os padrões de scripts/simulacao/run-ano.ts (loop de marcos, escrita incremental do
 * relatório) e scripts/simulacao/relogio.ts (avancarRelogio). Três mecânicas críticas que este
 * script tem de respeitar (ver o plano para o raciocínio completo):
 *
 *   1. avancarRelogio() não dispara nada sozinho — as 3 jobs preguiçosas (garantirSuspensaoAutomatica
 *      → garantirCobrancasGeradas → garantirNotasAutomaticasPorFalta, src/app/(dashboard)/layout.tsx)
 *      só correm no próximo carregamento de um /dashboard. Por isso todo salto de relógio é seguido
 *      de uma visita a /dashboard antes de qualquer ação depender do efeito desse salto.
 *   2. Nada no sistema avança ConfiguracaoAcademica de um ano letivo para o seguinte — o próprio
 *      script desloca os 4 campos de data (+1 ano civil, mantendo mês/dia) entre ciclos, via Prisma
 *      direto (não há UI dedicada além de Admin > Configuração Académica).
 *   3. processarRematriculaAction exige que a Turma do ano letivo alvo já exista — só nasce via
 *      rolloverTurmas (dentro de garantirSuspensaoAutomatica, só depois de anoLetivoFim passar).
 *      Sequência por ano: avançar relógio para depois de anoLetivoFim → visitar /dashboard (rollover)
 *      → só depois processar rematrículas para o ano seguinte.
 *
 * Uso: npx tsx scripts/simulacao/teste-5-alunos.ts [--url http://localhost:3000]
 */
import "dotenv/config";
import dotenv from "dotenv";
import { chromium, type Browser } from "playwright";
import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { garantirNaoENeon } from "../lib/guardarNeon";
import { avancarRelogio } from "./relogio";
import { escreverRelatorioAnomalias } from "./anomalias";
import { construirMarcos, type ConfigAcademicaParaMarcos } from "./ano/marcos";
import { login } from "./agentes/comum";
import { diagnosticarTodos, type AlunoParaDiagnostico, type Violacao } from "../../src/lib/diagnostico";
import { decidirRematricula } from "../../src/lib/academico";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { garantirCurriculoAnos2a4, garantirTurmaAnoCurricular } from "./cenarios-5-alunos/curriculo-setup";
import type { Alunos, Staff, CenarioCtx } from "./cenarios-5-alunos/tipos";
import * as marta from "./cenarios-5-alunos/marta";
import * as joao from "./cenarios-5-alunos/joao";
import * as beatriz from "./cenarios-5-alunos/beatriz";
import * as domingos from "./cenarios-5-alunos/domingos";
import * as isabel from "./cenarios-5-alunos/isabel";

dotenv.config({ path: ".env.local", override: true });
garantirNaoENeon();

interface Args {
  url: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { url: "http://localhost:3000" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[i + 1];
  }
  return args;
}

/**
 * Hard cap deliberado — nenhum dos 5 alunos deste elenco fica retido de ano inteiro (só o Domingos
 * repete UMA cadeira no 2º ano, sem retenção de ano — ver decidirRematricula: 1 reprovação <=
 * limiteReprovacoes=2 avança), por isso 4 iterações chegam para levar todos até à tentativa de
 * rematrícula do 4º→5º ano (fim de curso).
 *
 * Nota sobre alinhamento de anos (Beatriz/Domingos): o trancamento do 1º ano NÃO lhes custa um ano
 * civil extra. garantirTurmaAnoCurricular (chamado no início de cada iteração deste script) já
 * pré-cria a Turma do ano curricular seguinte no ano letivo seguinte ANTES da janela de rematrícula
 * normal dessa mesma iteração — é essa mesma Turma que a rematrícula tardia da ADMIN usa no marco
 * extra pós-rollover, mais tarde na mesma iteração. Confirmado traçando processarRematriculaAction:
 * anoLetivoAlvo = matriculaAtual.turma.anoLetivo + 1, o mesmo valor quer a rematrícula aconteça
 * dentro da janela ou tardiamente. Por isso os 5 alunos chegam ao 4º ano curricular na MESMA
 * iteração (a 4ª), e a tentativa de rematrícula para o "5º ano" é verificada para todos no fim dela
 * — não haveria sentido nenhuma variante "Beatriz/Domingos ficam presos numa iteração a menos"
 * dado como estava implementado o resto do sistema.
 */
const MAX_ITERACOES = 4;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface EntradaRelatorioAno {
  anoCurricularCiclo: number;
  eventos: string[];
  violacoesDiagnostico: Violacao[];
}

interface EntradaVerificacaoFinal {
  aluno: string;
  passou: boolean;
  detalhes: string[];
}

/**
 * Desloca os 4 campos de data de ConfiguracaoAcademica em +1 ano civil (mesmo mês/dia) — a janela
 * do ciclo seguinte. Chamado no início de cada iteração exceto a primeira (que usa o que o seed já
 * escreveu). Direto via Prisma: não há UI dedicada além de Admin > Configuração Académica, e mover
 * 4 datas encadeadas por essa UI, aluno a aluno de novo, não testaria nada que este script já não
 * tenha testado na primeira vez que passou por lá.
 */
async function avancarConfigAcademicaUmAno(): Promise<ConfigAcademicaParaMarcos> {
  const atual = await prisma.configuracaoAcademica.findUniqueOrThrow({ where: { id: "config" } });
  function maisUmAno(data: Date | null): Date {
    if (!data) throw new Error("ConfiguracaoAcademica incompleta — corre o seed primeiro.");
    return new Date(data.getFullYear() + 1, data.getMonth(), data.getDate());
  }
  const nova = {
    anoLetivoInicio: maisUmAno(atual.anoLetivoInicio),
    anoLetivoFim: maisUmAno(atual.anoLetivoFim),
    matriculaInicio: maisUmAno(atual.matriculaInicio),
    matriculaFim: maisUmAno(atual.matriculaFim),
  };
  await prisma.configuracaoAcademica.update({ where: { id: "config" }, data: nova });
  return nova;
}

async function lerConfigAcademica(): Promise<ConfigAcademicaParaMarcos> {
  const config = await prisma.configuracaoAcademica.findUniqueOrThrow({ where: { id: "config" } });
  if (!config.anoLetivoInicio || !config.anoLetivoFim || !config.matriculaInicio || !config.matriculaFim) {
    throw new Error("ConfiguracaoAcademica incompleta — corre scripts/seed-teste-5-anos.ts primeiro.");
  }
  return {
    anoLetivoInicio: config.anoLetivoInicio,
    anoLetivoFim: config.anoLetivoFim,
    matriculaInicio: config.matriculaInicio,
    matriculaFim: config.matriculaFim,
  };
}

/** Visita /dashboard com qualquer sessão (aqui: admin) para disparar as 3 jobs preguiçosas. */
async function visitarDashboardParaDisparaJobs(browser: Browser, baseUrl: string, admin: { papel: string; email: string }): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, baseUrl, admin);
  await page.goto(`${baseUrl}/dashboard`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await ctx.close();
}

async function carregarAlunosParaDiagnostico(): Promise<AlunoParaDiagnostico[]> {
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
  return alunos.map((a) => ({
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
}

function escreverRelatorio(outputDir: string, anos: EntradaRelatorioAno[], verificacaoFinal: EntradaVerificacaoFinal[] | null, completo: boolean): void {
  const totalViolacoesError = anos.flatMap((a) => a.violacoesDiagnostico).filter((v) => v.severidade === "ERROR").length;

  writeFileSync(
    path.join(outputDir, "relatorio.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), completo, anos, verificacaoFinal, totalViolacoesError }, null, 2),
  );

  const linhas = [`# Teste de 5 Alunos — Simulação Multi-Ano`, "", `Gerado em: ${new Date().toISOString()}`, `Estado: ${completo ? "COMPLETO" : "EM CURSO (parcial)"}`, ""];
  for (const ano of anos) {
    linhas.push(`## Ciclo — ${ano.anoCurricularCiclo}º Ano curricular`, "");
    for (const evento of ano.eventos) linhas.push(`- ${evento}`);
    linhas.push("", `Violações de diagnóstico neste ciclo: ${ano.violacoesDiagnostico.length}`);
    for (const v of ano.violacoesDiagnostico) linhas.push(`  - [${v.severidade}] ${v.alunoNome}: ${v.regra} — ${v.detalhe}`);
    linhas.push("");
  }
  if (verificacaoFinal) {
    linhas.push("## Verificação final por aluno", "");
    for (const v of verificacaoFinal) {
      linhas.push(`### ${v.aluno} — ${v.passou ? "PASS" : "FAIL"}`);
      for (const d of v.detalhes) linhas.push(`- ${d}`);
      linhas.push("");
    }
  }
  linhas.push(`## Resultado`, "", `Violações ERROR acumuladas: ${totalViolacoesError}`);
  writeFileSync(path.join(outputDir, "relatorio.md"), linhas.join("\n"));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.join(process.cwd(), "scripts", "simulacao", "output", `teste-5-alunos-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });

  console.log("A ler contexto seedado (5 alunos, staff, configuração académica)...");
  const [alunosUser, staffUsers] = await Promise.all([
    prisma.user.findMany({ where: { role: "ALUNO" }, select: { email: true, aluno: { select: { nome: true } } } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SECRETARIA", "DAAC", "PROFESSOR"] } }, select: { email: true, role: true, professor: { select: { especialidade: true } } } }),
  ]);

  function credencialAluno(nomeParcial: string) {
    const encontrado = alunosUser.find((u) => u.aluno?.nome.includes(nomeParcial));
    if (!encontrado?.email) throw new Error(`Aluno "${nomeParcial}" não encontrado — corre scripts/seed-teste-5-anos.ts primeiro.`);
    return { papel: `aluno-${nomeParcial}`, email: encontrado.email };
  }
  const alunos: Alunos = {
    marta: credencialAluno("Marta"),
    joao: credencialAluno("João"),
    beatriz: credencialAluno("Beatriz"),
    domingos: credencialAluno("Domingos"),
    isabel: credencialAluno("Isabel"),
  };

  function credencialStaffRole(role: "ADMIN" | "SECRETARIA" | "DAAC") {
    const encontrado = staffUsers.find((u) => u.role === role);
    if (!encontrado?.email) throw new Error(`Utilizador ${role} não encontrado — corre o seed primeiro.`);
    return { papel: role.toLowerCase(), email: encontrado.email };
  }
  const professorEngSoftware = staffUsers.find((u) => u.role === "PROFESSOR" && u.professor?.especialidade === "Engenharia de Software");
  const professorBasesDados = staffUsers.find((u) => u.role === "PROFESSOR" && u.professor?.especialidade === "Bases de Dados");
  if (!professorEngSoftware?.email || !professorBasesDados?.email) {
    throw new Error("Professores seedados não encontrados — corre scripts/seed-teste-5-anos.ts primeiro.");
  }
  const staff: Staff = {
    admin: credencialStaffRole("ADMIN"),
    secretaria: credencialStaffRole("SECRETARIA"),
    daac: credencialStaffRole("DAAC"),
    professor1: { papel: "professor-eng-software", email: professorEngSoftware.email },
    professor2: { papel: "professor-bases-dados", email: professorBasesDados.email },
  };

  console.log("A garantir currículo dos anos 2-4 (não semeado por seed-teste-5-anos.ts — só o 1º ano existe)...");
  await garantirCurriculoAnos2a4(prisma);

  // valorMultaRematriculaTardia por omissão fica a 0 no seed (ConfiguracaoFinanceira não o define
  // explicitamente) — o cenário do Domingos precisa de um valor > 0 para gerar a multa órfã que o
  // plano pede como asserção. 15000 Kz é um valor de teste razoável, sem significado de negócio.
  const configFinanceira = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  if (!configFinanceira || Number(configFinanceira.valorMultaRematriculaTardia) === 0) {
    await prisma.configuracaoFinanceira.update({ where: { id: "config" }, data: { valorMultaRematriculaTardia: 15000 } });
    console.log("  valorMultaRematriculaTardia estava 0 — definido para 15000 Kz para este teste.");
  }

  const browser = await chromium.launch();
  const anosRelatorio: EntradaRelatorioAno[] = [];

  // Estado de progresso por aluno ao longo do ciclo — evita repetir ações para quem já concluiu o
  // curso (Marta/João/Isabel no 4º ano) ou já foi tratado como caso especial (Beatriz/Domingos).
  const alunoIdPorChave: Record<keyof Alunos, string | null> = { marta: null, joao: null, beatriz: null, domingos: null, isabel: null };
  const concluiuCurso: Record<keyof Alunos, boolean> = { marta: false, joao: false, beatriz: false, domingos: false, isabel: false };

  for (let iteracao = 1; iteracao <= MAX_ITERACOES; iteracao += 1) {
    console.log(`\n=== Ciclo ${iteracao}/${MAX_ITERACOES} (ano curricular ${iteracao}) ===`);
    const eventos: string[] = [];
    const violacoesDoAno: Violacao[] = [];

    if (iteracao > 1) {
      await avancarConfigAcademicaUmAno();
      eventos.push("ConfiguracaoAcademica deslocada +1 ano civil (anoLetivoInicio/Fim, matriculaInicio/Fim).");
    }
    const configAcademica = await lerConfigAcademica();

    // Garante Turma+TurmaDisciplina desta camada de anoCurricular, no ano letivo corrente do ciclo
    // — necessário porque rolloverTurmas só rola camadas que já existiam no ano anterior, nunca
    // inventa uma nova (ver curriculo-setup.ts).
    const anoLetivoCorrente = configAcademica.anoLetivoInicio.getFullYear();
    await garantirTurmaAnoCurricular(prisma, iteracao, anoLetivoCorrente);
    eventos.push(`Turma/TurmaDisciplina do ${iteracao}º Ano garantida para o ano letivo ${anoLetivoCorrente}.`);

    // CRÍTICO: também garante a camada do PRÓXIMO ano curricular, no PRÓXIMO ano letivo — é essa a
    // Turma-alvo que processarRematriculaAction procura no marco janela-rematricula, ainda dentro
    // desta mesma iteração (anoLetivoAlvo = matriculaAtual.turma.anoLetivo + 1). rolloverTurmas só
    // criaria essa camada depois de anoLetivoFim passar (marco extra, no fim da iteração) — tarde
    // demais para a janela normal. Só até ao 4º ano — a "5º Ano" é deliberadamente deixada em falta,
    // é o teste de fim de curso (ver nota "Fim de curso" mais abaixo).
    if (iteracao < MAX_ITERACOES) {
      await garantirTurmaAnoCurricular(prisma, iteracao + 1, anoLetivoCorrente + 1);
      eventos.push(`Turma/TurmaDisciplina do ${iteracao + 1}º Ano pré-garantida para o ano letivo ${anoLetivoCorrente + 1} (necessária para a janela de rematrícula deste ciclo).`);
    }

    const marcos = construirMarcos(configAcademica);
    const ctxBase: Omit<CenarioCtx, "log"> = { browser, baseUrl: args.url, outputDir, prisma, alunos, staff, anoCurricularCiclo: iteracao };
    const log = (msg: string) => {
      console.log(`  ${msg}`);
      eventos.push(msg);
    };
    const ctx: CenarioCtx = { ...ctxBase, log };

    for (const marco of marcos) {
      console.log(`\n--- Marco: ${marco.label} (${marco.data.toISOString().slice(0, 10)}) ---`);

      avancarRelogio(marco.data);
      await visitarDashboardParaDisparaJobs(browser, args.url, staff.admin);

      if (marco.id === "vencimento-propinas") {
        if (!concluiuCurso.marta) await marta.martaVencimentoPropinas(ctx);
        if (!concluiuCurso.joao) await joao.joaoVencimentoPropinas(ctx);
        if (!concluiuCurso.beatriz) await beatriz.beatrizVencimentoPropinas(ctx);
        if (!concluiuCurso.domingos) {
          if (iteracao === 1) {
            await domingos.domingosVencimentoPropinas(ctx); // não paga de propósito
          } else {
            // A partir do 2º ano, Domingos paga a tempo — mesma mecânica de Marta/Beatriz, sem
            // cenário financeiro próprio (o cenário dele nos anos seguintes é a reprovação de cadeira).
            const { confirmarPropinaMaisAntiga } = await import("./cenarios-5-alunos/acoes-comuns");
            const ctxPag = await browser.newContext();
            const page = await ctxPag.newPage();
            await confirmarPropinaMaisAntiga(page, args.url, staff.secretaria, "Domingos Cavaco", outputDir);
            await ctxPag.close();
          }
        }
        if (!concluiuCurso.isabel) await isabel.isabelVencimentoPropinas(ctx);
      } else if (marco.id === "avaliacoes-p1") {
        if (!concluiuCurso.marta) await marta.martaAvaliacoesP1(ctx);
        if (!concluiuCurso.joao) await joao.joaoAvaliacoesP1(ctx);
        if (!concluiuCurso.beatriz) await beatriz.beatrizAvaliacoesP1(ctx);
        if (!concluiuCurso.domingos) {
          if (iteracao === 2) await domingos.domingosAvaliacoesP1Ano2(ctx);
          else await domingos.domingosAvaliacoesP1Ano1(ctx);
        }
        if (!concluiuCurso.isabel) await isabel.isabelAvaliacoesP1(ctx);
      } else if (marco.id === "avaliacoes-p2-exame") {
        if (!concluiuCurso.marta) await marta.martaAvaliacoesP2(ctx);
        if (!concluiuCurso.joao) await joao.joaoAvaliacoesP2(ctx);
        if (!concluiuCurso.beatriz) await beatriz.beatrizAvaliacoesP2(ctx);
        if (!concluiuCurso.domingos) {
          if (iteracao === 2) await domingos.domingosAvaliacoesP2Ano2(ctx);
          else await domingos.domingosAvaliacoesP2Ano1(ctx);
        }
        if (!concluiuCurso.isabel) {
          // Cria a Avaliacao de P2 em falta de Bases de Dados SÓ AGORA — depois de Marta/João/
          // Beatriz/Domingos já terem lançado a sua própria nota real de P2 na MESMA Avaliacao
          // partilhada (uma TurmaDisciplina = uma prova por turma, não por aluno). Criá-la ANTES
          // do resto da turma escrever a nota bloqueava a coluna P2 de todos (prazo já expirado
          // = input disabled em TurmaGradebook), zerando silenciosamente o P2 de Bases de Dados
          // da turma inteira todos os anos — só o de Isabel devia ficar em falta.
          await isabel.isabelCriarProvaP2EmFaltaBasesDados(ctx, marcos.find((m) => m.id === "avaliacoes-p1")!.data);
          await isabel.isabelAvaliacoesP2EExame(ctx);
        }
      } else if (marco.id === "janela-rematricula") {
        // Sweep imediatamente antes de cada rematrícula, não num marco anterior — qualquer gap
        // temporal entre um pagamento antecipado e este marco deixa garantirCobrancasGeradas gerar
        // mais um mês PENDENTE (vencido) entretanto, e processarRematriculaAction bloqueia por
        // qualquer saldo DEVENDO. Zero gap = sweep aqui, mesmo passo, mesmo instante simulado.
        const { confirmarPropinaMaisAntiga: pagarSaldoPropinas } = await import("./cenarios-5-alunos/acoes-comuns");
        const fecharSaldo = async (nome: string) => {
          const ctxPag = await browser.newContext();
          const page = await ctxPag.newPage();
          const ok = await pagarSaldoPropinas(page, args.url, staff.secretaria, nome, outputDir);
          await ctxPag.close();
          log(`${nome}: sweep de propinas antes da rematrícula = ${ok}`);
          return ok;
        };
        // processarRematriculaAction chama gerarPropinasAnoLetivo PARA O ANO ALVO como parte da
        // própria rematrícula — esses 12 meses só passam a existir DEPOIS de rematricular, nunca
        // antes. Sem um 2º sweep aqui, ficam todos por confirmar até ao próximo ciclo, altura em
        // que a maioria já venceu (DEVENDO) e bloqueia a rematrícula seguinte (mesmo saldo residual
        // visto em corridas anteriores, sempre um múltiplo exato de 12 meses). Paga-os assim que
        // nascem, não um ano depois.
        if (!concluiuCurso.marta) {
          await fecharSaldo("Marta Kiala");
          const r = await marta.martaJanelaRematricula(ctx);
          alunoIdPorChave.marta = r.alunoId;
          if (r.sucesso) await fecharSaldo("Marta Kiala");
          if (!r.sucesso) log(`AVISO: rematrícula da Marta falhou dentro da janela: ${r.erro}`);
        }
        if (!concluiuCurso.joao) {
          await fecharSaldo("João Manuel");
          const r = await joao.joaoJanelaRematricula(ctx);
          alunoIdPorChave.joao = r.alunoId;
          if (r.sucesso) await fecharSaldo("João Manuel");
          if (!r.sucesso) log(`AVISO: rematrícula do João falhou dentro da janela: ${r.erro}`);
        }
        if (!concluiuCurso.beatriz) {
          if (iteracao === 1) {
            log("Beatriz: NÃO rematricula dentro da janela de propósito (cenário de trancamento).");
          } else {
            await fecharSaldo("Beatriz Sacatucua");
            const r = await beatriz.beatrizJanelaRematricula(ctx);
            alunoIdPorChave.beatriz = r.alunoId;
            if (r.sucesso) await fecharSaldo("Beatriz Sacatucua");
            if (!r.sucesso) log(`AVISO: rematrícula da Beatriz falhou dentro da janela: ${r.erro}`);
          }
        }
        if (!concluiuCurso.domingos) {
          if (iteracao === 1) {
            log("Domingos: NÃO rematricula dentro da janela de propósito (dívida + trancamento).");
          } else {
            await fecharSaldo("Domingos Cavaco");
            if (iteracao === 2) {
              // Reprovou Bases de Dados no 2º ano curricular — garante que a Turma do 3º ano
              // (alvo desta rematrícula) tem uma oferta que a repetição possa apanhar, senão cai
              // no ramo de aviso "sem oferta atual" em vez de testar a repetição a sério.
              const turmaAlvo = await ctx.prisma.turma.findFirstOrThrow({
                where: { anoCurricular: 3, anoLetivo: configAcademica.anoLetivoInicio.getFullYear() + 1 },
              });
              await import("./cenarios-5-alunos/curriculo-setup").then((m) => m.garantirOfertaRepeticaoBasesDados(ctx.prisma, 2, turmaAlvo.id));
            }
            const r = await domingos.domingosJanelaRematricula(ctx);
            alunoIdPorChave.domingos = r.alunoId;
            if (r.sucesso) await fecharSaldo("Domingos Cavaco");
            if (!r.sucesso) log(`AVISO: rematrícula do Domingos falhou dentro da janela: ${r.erro}`);
          }
        }
        if (!concluiuCurso.isabel) {
          await fecharSaldo("Isabel Neto");
          const r = await isabel.isabelJanelaRematricula(ctx);
          alunoIdPorChave.isabel = r.alunoId;
          if (r.sucesso) await fecharSaldo("Isabel Neto");
          if (!r.sucesso) log(`AVISO: rematrícula da Isabel falhou dentro da janela: ${r.erro}`);
        }
      }

      const violacoesMarco = diagnosticarTodos(await carregarAlunosParaDiagnostico());
      violacoesDoAno.push(...violacoesMarco);
      if (violacoesMarco.length > 0) log(`Diagnóstico: ${violacoesMarco.length} violação(ões) neste marco.`);

      escreverRelatorio(outputDir, [...anosRelatorio, { anoCurricularCiclo: iteracao, eventos, violacoesDiagnostico: violacoesDoAno }], null, false);
    }

    // Marco extra pós-fim-do-ano-letivo (só neste script — não faz parte de construirMarcos): dispara
    // rollover de turmas + suspensão automática, depois trata as rematrículas tardias pendentes.
    const dataPosFimAno = new Date(configAcademica.anoLetivoFim.getTime() + 30 * 24 * 60 * 60 * 1000);
    console.log(`\n--- Marco extra: pós-fim-do-ano-letivo (${dataPosFimAno.toISOString().slice(0, 10)}) ---`);
    avancarRelogio(dataPosFimAno);
    await visitarDashboardParaDisparaJobs(browser, args.url, staff.admin);
    log("Relógio avançado para além de anoLetivoFim — garantirSuspensaoAutomatica/rolloverTurmas disparados.");

    if (iteracao === 1 && !concluiuCurso.beatriz) {
      const { confirmarPropinaMaisAntiga: pagarSaldoBeatriz } = await import("./cenarios-5-alunos/acoes-comuns");
      const ctxPagBeatriz = await browser.newContext();
      const pageBeatriz = await ctxPagBeatriz.newPage();
      await pagarSaldoBeatriz(pageBeatriz, args.url, staff.secretaria, "Beatriz Sacatucua", outputDir);
      await ctxPagBeatriz.close();
      const r = await beatriz.beatrizRematriculaTardiaPosRollover(ctx);
      alunoIdPorChave.beatriz = r.alunoId;
      if (!r.sucesso) log(`FALHA: rematrícula tardia da Beatriz (pós-rollover) devia ter sucedido: ${r.erro}`);
    }
    if (iteracao === 1 && !concluiuCurso.domingos) {
      const r = await domingos.domingosPagarDividaERematriculaTardia(ctx);
      alunoIdPorChave.domingos = r.alunoId;
      if (!r.sucesso) log(`FALHA: rematrícula tardia do Domingos (pós-rollover, após pagar dívida) devia ter sucedido: ${r.erro}`);
    }

    // Fim de curso (4º ano → tentativa de "5º ano"): decidirRematricula nunca sabe que o curso
    // acabou (ver plano) — processarRematriculaAction falha com "Não existe turma de 5º Ano...",
    // e essa mensagem exata É o resultado esperado, não uma falha.
    //
    // Nota sobre alinhamento de anos (Beatriz/Domingos): apesar de ficarem TRANCADOS no 1º ano e
    // só serem rematriculados pela ADMIN no marco extra pós-rollover, o alvo dessa rematrícula
    // tardia é a MESMA Turma(anoCurricular=2, anoLetivoAlvo) que Marta/João/Isabel usam na janela
    // normal — pré-criada logo no início desta iteração (ver garantirTurmaAnoCurricular acima).
    // Não perdem nenhum ano civil: chegam ao anoCurricular=2 ainda dentro da iteração 1, tal como
    // os outros três. Por isso os 5 alunos, não só 3, chegam ao 4º ano formal na mesma iteração e
    // são todos verificados aqui, no fim da última iteração.
    if (iteracao === MAX_ITERACOES) {
      const nomesPorChave: Record<keyof Alunos, string> = {
        marta: "Marta Kiala",
        joao: "João Manuel",
        beatriz: "Beatriz Sacatucua",
        domingos: "Domingos Cavaco",
        isabel: "Isabel Neto",
      };
      for (const chave of ["marta", "joao", "beatriz", "domingos", "isabel"] as const) {
        if (concluiuCurso[chave] || !alunoIdPorChave[chave]) continue;
        const { processarRematricula } = await import("./cenarios-5-alunos/acoes-comuns");
        const ctxFim = await browser.newContext();
        const page = await ctxFim.newPage();
        const r = await processarRematricula(page, args.url, staff.secretaria, alunoIdPorChave[chave]!, outputDir);
        await ctxFim.close();
        const ehErroDeFimDeCurso = r.erro?.includes("Não existe turma de 5º Ano") ?? false;
        concluiuCurso[chave] = ehErroDeFimDeCurso;
        log(`${nomesPorChave[chave]}: tentativa de rematrícula para o 5º Ano → ${ehErroDeFimDeCurso ? "PASS (erro esperado de fim de curso)" : `INESPERADO: ${r.erro ?? r.resultado}`}`);
      }
    }

    anosRelatorio.push({ anoCurricularCiclo: iteracao, eventos, violacoesDiagnostico: violacoesDoAno });
    escreverRelatorio(outputDir, anosRelatorio, null, false);
  }

  // Verificação final por aluno (ver plano, "Verificação final por aluno") — leituras diretas à BD.
  console.log("\n=== Verificação final ===");
  const verificacaoFinal: EntradaVerificacaoFinal[] = [];

  async function estadoAluno(email: string) {
    return prisma.aluno.findFirstOrThrow({
      where: { user: { email } },
      include: {
        matriculas: { include: { turma: true }, orderBy: { turma: { anoLetivo: "asc" } } },
        cobrancas: { where: { tipo: "MULTA" } },
        inscricoes: true,
      },
    });
  }

  {
    const aluno = await estadoAluno(alunos.marta.email);
    const concluidas = aluno.matriculas.filter((m) => m.status === "CONCLUIDA").length;
    const multas = aluno.cobrancas.length;
    const passou = concluidas >= MAX_ITERACOES - 1 && concluiuCurso.marta;
    verificacaoFinal.push({
      aluno: "Marta Kiala",
      passou,
      detalhes: [
        `Matrículas CONCLUIDA: ${concluidas} (esperado >= ${MAX_ITERACOES - 1})`,
        `Multas (tipo MULTA): ${multas} (esperado 0)`,
        `Fim de curso detetado (erro "Não existe turma de 5º Ano"): ${concluiuCurso.marta}`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.joao.email);
    const concluidas = aluno.matriculas.filter((m) => m.status === "CONCLUIDA").length;
    const multasPagas = aluno.cobrancas.filter((c) => c.status === "PAGO").length;
    const passou = concluidas >= MAX_ITERACOES - 1 && multasPagas >= MAX_ITERACOES - 1 && concluiuCurso.joao;
    verificacaoFinal.push({
      aluno: "João Manuel",
      passou,
      detalhes: [
        `Matrículas CONCLUIDA: ${concluidas} (esperado >= ${MAX_ITERACOES - 1})`,
        `Multas PAGO: ${multasPagas} (esperado >= ${MAX_ITERACOES - 1} — uma por ano, sempre paga tarde mas sempre recuperada)`,
        `Fim de curso detetado: ${concluiuCurso.joao}`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.beatriz.email);
    const primeiraMatricula = aluno.matriculas[0];
    const passou = aluno.matriculas.length >= MAX_ITERACOES && primeiraMatricula?.status !== "ATIVA" && concluiuCurso.beatriz;
    verificacaoFinal.push({
      aluno: "Beatriz Sacatucua",
      passou,
      detalhes: [
        `Total de matrículas: ${aluno.matriculas.length} (esperado >= ${MAX_ITERACOES} — mesmo alinhamento de anos que Marta, ver nota no ficheiro)`,
        `Estado da 1ª matrícula: ${primeiraMatricula?.status ?? "n/d"} (esperado TRANCADA ou CONCLUIDA — nunca ATIVA, já foi fechada pelo trancamento/rematrícula tardia)`,
        `Aluno.status final: ${aluno.status} (esperado ATIVO — nunca TRANCADO)`,
        `Fim de curso detetado (erro "Não existe turma de 5º Ano"): ${concluiuCurso.beatriz}`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.domingos.email);
    const multaOrfa = aluno.cobrancas.find((c) => c.mesReferencia === null);
    const repeticoes = aluno.inscricoes.filter((i) => i.tentativa > 1);
    const passou = Boolean(multaOrfa) && repeticoes.length >= 1 && concluiuCurso.domingos;
    verificacaoFinal.push({
      aluno: "Domingos Cavaco",
      passou,
      detalhes: [
        `Multa órfã (mesReferencia null) encontrada: ${Boolean(multaOrfa)} (valor: ${multaOrfa ? Number(multaOrfa.valorDevido) : "n/d"})`,
        `InscricaoCadeira com tentativa > 1 (repetição da cadeira reprovada no 2º ano): ${repeticoes.length}`,
        `Aluno.status final: ${aluno.status}`,
        `Fim de curso detetado (erro "Não existe turma de 5º Ano"): ${concluiuCurso.domingos}`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.isabel.email);
    const notasAutomaticas = await prisma.nota.count({ where: { automatica: true, inscricaoCadeira: { alunoId: aluno.id } } });
    const passou = notasAutomaticas >= 1 && concluiuCurso.isabel;
    verificacaoFinal.push({
      aluno: "Isabel Neto",
      passou,
      detalhes: [
        `Notas automáticas (0 por falta de prazo) atribuídas ao longo do percurso: ${notasAutomaticas} (esperado >= 1 por ano em Bases de Dados)`,
        `Fim de curso detetado: ${concluiuCurso.isabel}`,
      ],
    });
  }

  // Também valida a decisão de rematrícula do Domingos no 2º ano contra a lógica pura de negócio —
  // 1 reprovação <= limiteReprovacoes(2) seedado deve AVANÇAR, repetindo só a cadeira reprovada.
  const decisaoDomingos = decidirRematricula({ reprovacoes: 1, limiteReprovacoes: 2, anoCurricular: 2 });
  verificacaoFinal.push({
    aluno: "Domingos Cavaco (verificação cruzada com decidirRematricula)",
    passou: decisaoDomingos.resultado === "AVANCA" && decisaoDomingos.novoAnoCurricular === 3,
    detalhes: [`decidirRematricula({reprovacoes:1, limiteReprovacoes:2, anoCurricular:2}) = ${JSON.stringify(decisaoDomingos)} (esperado AVANCA, novoAnoCurricular=3)`],
  });

  await browser.close();
  escreverRelatorioAnomalias(outputDir);

  const violacoesErrorTotais = anosRelatorio.flatMap((a) => a.violacoesDiagnostico).filter((v) => v.severidade === "ERROR").length;
  const todosPassaram = verificacaoFinal.every((v) => v.passou);
  escreverRelatorio(outputDir, anosRelatorio, verificacaoFinal, true);

  console.log(`\nSimulação concluída. Saída em: ${outputDir}`);
  console.log(`Violações ERROR de diagnóstico: ${violacoesErrorTotais}`);
  console.log(`Verificação final: ${todosPassaram ? "TODOS PASSARAM" : "HÁ FALHAS — ver relatorio.md"}`);

  process.exitCode = todosPassaram && violacoesErrorTotais === 0 ? 0 : 1;
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
