/**
 * teste-5-alunos-v2 — a simulação de 4 anos do v1 (teste-5-alunos.ts) MAIS:
 *
 *   1. Evidência visual humana-wise: screenshot JPEG em cada marco, por papel, para o utilizador
 *      VER o sistema a ser usado (v1 só capturava anomalias);
 *   2. Frequências: professor cria a aula de hoje e marca presença (ledger: frequência=0);
 *   3. toggleMulta via MultaChip como ADMIN no João (ledger: nunca testada; poder exclusivo ADMIN);
 *   4. Reclamações L5: aluno submete em /reclamacoes, ADMIN resolve com resposta em
 *      /admin/reclamacoes (rotas nunca abertas na simulação).
 *
 * Reutiliza TUDO do v1: mesmos cenários por aluno (cenarios-5-alunos/*), mesmos marcos
 * (ano/marcos.ts), mesma mecânica crítica de saltos de relógio + visita /dashboard, mesmo
 * diagnóstico src/lib/diagnostico e verificação final por aluno. As diferenças são aditivas —
 * nada do percurso académico dos 5 alunos muda.
 *
 * Uso: npx tsx scripts/simulacao/teste-5-alunos-v2.ts [--url http://localhost:3000]
 */
import "dotenv/config";
import dotenv from "dotenv";
import { chromium, type Browser } from "playwright";
import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { garantirNaoENeon } from "../lib/guardarNeon";
import { avancarRelogio } from "./relogio";
import { escreverRelatorioAnomalias, instrumentarPagina } from "./anomalias";
import { construirMarcos, type ConfigAcademicaParaMarcos } from "./ano/marcos";
import { login } from "./agentes/comum";
import { diagnosticarTodos, type AlunoParaDiagnostico, type Violacao } from "../../src/lib/diagnostico";
import { decidirRematricula } from "../../src/lib/academico";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { garantirCurriculoAnos2a4, garantirTurmaAnoCurricular } from "./cenarios-5-alunos/curriculo-setup";
import { CURRICULO } from "../curriculo-faculdade";
import type { Alunos, Staff, CenarioCtx } from "./cenarios-5-alunos/tipos";
import { shot } from "./cenarios-5-alunos/extras-v2";
import {
  registarAulaEFrequencia,
  alternarMultaComoAdmin,
  submeterReclamacao,
  resolverReclamacaoComoAdmin,
} from "./cenarios-5-alunos/extras-v2";
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
  const args = { url: "http://localhost:3000" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[i + 1];
  }
  return args;
}

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
 * Igual ao v1 (ver justificação lá): nenhum aluno fica retido de ano inteiro, 4 iterações levam
 * todos à tentativa de rematrícula do 4º→"5º ano" (fim de curso).
 */
const MAX_ITERACOES = 4;

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

/** Visita /dashboard com qualquer sessão (aqui: admin) para disparar as 3 jobs preguiçosas + shot. */
async function visitarDashboardParaDisparaJobs(browser: Browser, baseUrl: string, admin: { papel: string; email: string }, outputDir: string, etiquetaMarco: string): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  instrumentarPagina(page, outputDir, admin.papel);
  await login(page, baseUrl, admin);
  await page.goto(`${baseUrl}/dashboard`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, outputDir, `c${etiquetaMarco}-dashboard-admin-pos-salto`);
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

  const linhas = [`# Teste de 5 Alunos v2 — Simulação Multi-Ano (com screenshots, frequências, multas e reclamações)`, "", `Gerado em: ${new Date().toISOString()}`, `Estado: ${completo ? "COMPLETO" : "EM CURSO (parcial)"}`, ""];
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
  const outputDir = path.join(process.cwd(), "scripts", "simulacao", "output", `v2-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });
  console.log(`Output: ${outputDir}`);

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
  // §faculdade-de-verdade: professores resolvidos pelo EMAIL do currículo canónico — cada ano
  // tem o seu par de professores; os cenários usam o par do ANO DO CICLO (staff do ctx é
  // atualizado a cada iteração no loop principal).
  const professorPorEmailDef = (email: string) => {
    const encontrado = staffUsers.find((u) => u.role === "PROFESSOR" && u.professor?.email === email);
    if (!encontrado?.email) throw new Error(`Professor ${email} não encontrado — corre scripts/seed-teste-5-anos.ts primeiro.`);
    return { papel: `professor-${encontrado.professor!.especialidade.toLowerCase().replace(/\s+/g, "-")}`, email: encontrado.email };
  };
  const staffBase = {
    admin: credencialStaffRole("ADMIN"),
    secretaria: credencialStaffRole("SECRETARIA"),
    daac: credencialStaffRole("DAAC"),
  };
  // /admin/reclamacoes é DEV-only (session.user.role !== "DEV" → redirect) — quem resolve
  // reclamações no v2 é o dev@ispc.ao, não o ADMIN.
  const devUser = staffUsers.find((u) => u.role === "DEV") ?? (await prisma.user.findFirst({ where: { role: "DEV" }, select: { email: true, role: true } }));
  if (!devUser?.email) throw new Error("Utilizador DEV não encontrado — corre o seed primeiro.");
  const dev = { papel: "dev", email: devUser.email };

  console.log("A garantir currículo dos anos 2-4 (não semeado por seed-teste-5-anos.ts — só o 1º ano existe)...");
  await garantirCurriculoAnos2a4(prisma);

  // Igual ao v1: Domingos precisa de valorMultaRematriculaTardia > 0 para gerar a multa órfã.
  const configFinanceira = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  if (!configFinanceira || Number(configFinanceira.valorMultaRematriculaTardia) === 0) {
    await prisma.configuracaoFinanceira.update({ where: { id: "config" }, data: { valorMultaRematriculaTardia: 15000 } });
    console.log("  valorMultaRematriculaTardia estava 0 — definido para 15000 Kz para este teste.");
  }

  const browser = await chromium.launch();
  const anosRelatorio: EntradaRelatorioAno[] = [];

  const alunoIdPorChave: Record<keyof Alunos, string | null> = { marta: null, joao: null, beatriz: null, domingos: null, isabel: null };
  const concluiuCurso: Record<keyof Alunos, boolean> = { marta: false, joao: false, beatriz: false, domingos: false, isabel: false };
  /** Resultados das ações novas do v2, por ciclo — entram no relatório como eventos. */
  const extrasPorEtiqueta: string[] = [];
  let contadorShots = 0;
  const contarShot = () => {
    contadorShots += 1;
    return String(contadorShots).padStart(2, "0");
  };

  for (let iteracao = 1; iteracao <= MAX_ITERACOES; iteracao += 1) {
    console.log(`\n=== Ciclo ${iteracao}/${MAX_ITERACOES} (ano curricular ${iteracao}) ===`);
    const eventos: string[] = [];
    const violacoesDoAno: Violacao[] = [];
    const tag = `${iteracao}`;

    if (iteracao > 1) {
      await avancarConfigAcademicaUmAno();
      eventos.push("ConfiguracaoAcademica deslocada +1 ano civil (anoLetivoInicio/Fim, matriculaInicio/Fim).");
    }
    const configAcademica = await lerConfigAcademica();

    const anoLetivoCorrente = configAcademica.anoLetivoInicio.getFullYear();
    await garantirTurmaAnoCurricular(prisma, iteracao, anoLetivoCorrente);
    eventos.push(`Turma/TurmaDisciplina do ${iteracao}º Ano garantida para o ano letivo ${anoLetivoCorrente}.`);

    if (iteracao < MAX_ITERACOES) {
      await garantirTurmaAnoCurricular(prisma, iteracao + 1, anoLetivoCorrente + 1);
      eventos.push(`Turma/TurmaDisciplina do ${iteracao + 1}º Ano pré-garantida para o ano letivo ${anoLetivoCorrente + 1} (necessária para a janela de rematrícula deste ciclo).`);
    }

    const marcos = construirMarcos(configAcademica);
    // Professores do ANO DO CICLO — cada ano curricular tem o seu par (§faculdade-de-verdade).
    const parDoAno = CURRICULO.find((a) => a.anoCurricular === iteracao)!;
    const staff: Staff = {
      ...staffBase,
      professor1: professorPorEmailDef(parDoAno.disciplinas[0].professorEmail), // 1º semestre
      professor2: professorPorEmailDef(parDoAno.disciplinas[1].professorEmail), // 2º semestre
    };
    const ctxBase: Omit<CenarioCtx, "log"> = { browser, baseUrl: args.url, outputDir, prisma, alunos, staff, anoCurricularCiclo: iteracao, disciplinaSemestre2: parDoAno.disciplinas[1].nome };
    const log = (msg: string) => {
      console.log(`  ${msg}`);
      eventos.push(msg);
    };
    const ctx: CenarioCtx = { ...ctxBase, log };

    for (const marco of marcos) {
      console.log(`\n--- Marco: ${marco.label} (${marco.data.toISOString().slice(0, 10)}) ---`);
      const etiquetaMarco = `${tag}-${marco.id}`;

      avancarRelogio(marco.data);
      await visitarDashboardParaDisparaJobs(browser, args.url, staff.admin, outputDir, etiquetaMarco);

      if (marco.id === "abertura-matricula") {
        log("[v2] Abertura do ano letivo — estado inicial documentado com screenshots.");
        // Shot de cada aluno a entrar no dashboard no primeiro dia do ano.
        for (const chave of ["marta", "joao"] as const) {
          const ctxA = await browser.newContext();
          const pageA = await ctxA.newPage();
          instrumentarPagina(pageA, outputDir, alunos[chave].papel);
          try {
            await login(pageA, args.url, alunos[chave]);
            await pageA.goto(`${args.url}/dashboard`);
            await pageA.waitForTimeout(1000);
            await shot(pageA, outputDir, `shot-${etiquetaMarco}-${chave}-dashboard`);
          } finally {
            await ctxA.close();
          }
        }
      }

      if (marco.id === "vencimento-propinas") {
        if (!concluiuCurso.marta) await marta.martaVencimentoPropinas(ctx);
        if (!concluiuCurso.joao) await joao.joaoVencimentoPropinas(ctx);
        if (!concluiuCurso.beatriz) await beatriz.beatrizVencimentoPropinas(ctx);
        if (!concluiuCurso.domingos) {
          if (iteracao === 1) {
            await domingos.domingosVencimentoPropinas(ctx); // não paga de propósito
          } else {
            const { confirmarPropinaMaisAntiga } = await import("./cenarios-5-alunos/acoes-comuns");
            const ctxPag = await browser.newContext();
            const page = await ctxPag.newPage();
            await confirmarPropinaMaisAntiga(page, args.url, staff.secretaria, "Domingos Cavaco", outputDir);
            await ctxPag.close();
          }
        }
        if (!concluiuCurso.isabel) await isabel.isabelVencimentoPropinas(ctx);

        // [v2] Professor registra aula + frequência no dia do vencimento (dia útil típico).
        const rFreq = await registarAulaEFrequencia(browser, args.url, staff.professor1, outputDir, "Marta Kiala", `${tag}-freq`);
        log(`[v2] Frequência (${staff.professor1.papel}): ${rFreq.detalhe}.`);

        // [v2] Reclamação do aluno + resolução pelo DEV (L5 comunicação; /admin/reclamacoes é DEV-only).
        const assuntoRec = `Nota da P1 parece errada (ciclo ${tag})`;
        const rRec1 = await submeterReclamacao(browser, args.url, alunos.marta, prisma, outputDir, `${tag}-rec`, assuntoRec, "A minha nota de P1 em Programação I aparece diferente do que esperava, podem verificar por favor?");
        log(`[v2] Reclamação (aluno): ${rRec1.detalhe}.`);
        if (!rRec1.ok) extrasPorEtiqueta.push(`ciclo ${tag}: submissão de reclamação NOK — ${rRec1.detalhe}`);
        const rRec2 = await resolverReclamacaoComoAdmin(browser, args.url, dev, prisma, outputDir, `${tag}-rec`, assuntoRec, "Verificado com o professor — a nota lançada está correta. Obrigado pela comunicação.");
        log(`[v2] Resolução de reclamação (DEV): ${rRec2.detalhe}.`);
        if (!rRec2.ok) extrasPorEtiqueta.push(`ciclo ${tag}: resolução de reclamação NOK — ${rRec2.detalhe}`);
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
          await isabel.isabelCriarProvaP2EmFaltaBasesDados(ctx, marcos.find((m) => m.id === "avaliacoes-p1")!.data);
          await isabel.isabelAvaliacoesP2EExame(ctx);
        }
      } else if (marco.id === "janela-rematricula") {
        const { confirmarPropinaMaisAntiga: pagarSaldoPropinas } = await import("./cenarios-5-alunos/acoes-comuns");
        const fecharSaldo = async (nome: string) => {
          const ctxPag = await browser.newContext();
          const page = await ctxPag.newPage();
          const ok = await pagarSaldoPropinas(page, args.url, staff.secretaria, nome, outputDir);
          await ctxPag.close();
          log(`${nome}: sweep de propinas antes da rematrícula = ${ok}`);
          return ok;
        };
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
              const turmaAlvo = await ctx.prisma.turma.findFirstOrThrow({
                where: { anoCurricular: 3, anoLetivo: configAcademica.anoLetivoInicio.getFullYear() + 1 },
              });
              await import("./cenarios-5-alunos/curriculo-setup").then((m) => m.garantirOfertaRepeticao(ctx.prisma, "Redes de Computadores", 2, turmaAlvo.id));
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

    // Marco extra pós-janela-de-matrícula — §correção 2026-08-24: era anoLetivoFim+30d (meados de
    // Janeiro), que ainda está DENTRO da janela de matrícula (1 Dez–31 Jan) — a "tardia" da
    // Beatriz/Domingos não era tardia a sério e a multa órfã nunca nascia. Agora corre a
    // matriculaFim+7d: dispara igualmente rollover+suspensão (já passámos anoLetivoFim, 15 Dez)
    // e a rematrícula ADMIN é genuinamente fora-da-janela.
    const dataPosFimAno = new Date(configAcademica.matriculaFim.getTime() + 7 * 24 * 60 * 60 * 1000);
    console.log(`\n--- Marco extra: pós-fim-do-ano-letivo (${dataPosFimAno.toISOString().slice(0, 10)}) ---`);
    avancarRelogio(dataPosFimAno);
    await visitarDashboardParaDisparaJobs(browser, args.url, staff.admin, outputDir, `${tag}-pos-fim`);
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

      // [v2] ToggleMulta como ADMIN sobre a multa ÓRFÃ do Domingos — acaba de nascer na rematrícula
      // tardia dele (rematrícula tardia com dívida paga → multa órfã PENDENTE fica no aluno). A
      // secção "Multas por atraso" da ficha só lista órfãs; as multas mensais não têm chip.
      const rMulta = await alternarMultaComoAdmin(browser, args.url, staff.admin, prisma, alunos.domingos.email, "Domingos", outputDir, `${tag}-multa-orfa`);
      log(`[v2] ToggleMulta órfã (ADMIN): ${rMulta.detalhe}.`);
      if (!rMulta.ok) extrasPorEtiqueta.push(`ciclo ${tag}: toggleMulta órfã NOK — ${rMulta.detalhe}`);
    }

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
        // §Opção A: a action devolve FIM_DE_CURSO e marca o aluno FORMADO — é isso o esperado.
        const ehFimDeCurso = r.erro?.includes("FIM_DE_CURSO") ?? false;
        concluiuCurso[chave] = ehFimDeCurso;
        log(`${nomesPorChave[chave]}: tentativa de rematrícula para o 5º Ano → ${ehFimDeCurso ? "PASS (fim de curso — aluno FORMADO)" : `INESPERADO: ${r.erro ?? r.resultado}`}`);
      }
    }

    anosRelatorio.push({ anoCurricularCiclo: iteracao, eventos, violacoesDiagnostico: violacoesDoAno });
    escreverRelatorio(outputDir, anosRelatorio, null, false);
  }

  // Verificação final por aluno — IGUAL ao v1 (leituras diretas à BD).
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
    // §Opção A (2026-08-24): no fim de curso o aluno fica FORMADO (não TRANCADO).
    const passou = concluidas >= MAX_ITERACOES - 1 && aluno.status === "FORMADO";
    verificacaoFinal.push({
      aluno: "Marta Kiala",
      passou,
      detalhes: [
        `Matrículas CONCLUIDA: ${concluidas} (esperado >= ${MAX_ITERACOES - 1})`,
        `Aluno.status final: ${aluno.status} (esperado FORMADO — fim de curso, Opção A)`,
        `Multas (tipo MULTA): ${multas} (esperado 0)`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.joao.email);
    const concluidas = aluno.matriculas.filter((m) => m.status === "CONCLUIDA").length;
    const multasPagas = aluno.cobrancas.filter((c) => c.status === "PAGO").length;
    const passou = concluidas >= MAX_ITERACOES - 1 && multasPagas >= MAX_ITERACOES - 1 && aluno.status === "FORMADO";
    verificacaoFinal.push({
      aluno: "João Manuel",
      passou,
      detalhes: [
        `Matrículas CONCLUIDA: ${concluidas} (esperado >= ${MAX_ITERACOES - 1})`,
        `Multas PAGO: ${multasPagas} (esperado >= ${MAX_ITERACOES - 1} — uma por ano, sempre paga tarde mas sempre recuperada)`,
        `Aluno.status final: ${aluno.status} (esperado FORMADO — fim de curso, Opção A)`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.beatriz.email);
    const primeiraMatricula = aluno.matriculas[0];
    // §Opção A: Beatriz termina o curso → FORMADO (o TRANCADO do 1º ano foi revertido por cada
    // rematrícula — processarRematriculaAction repõe status ATIVO — e o fim de curso sela FORMADO).
    const passou = aluno.matriculas.length >= MAX_ITERACOES && primeiraMatricula?.status !== "ATIVA" && aluno.status === "FORMADO";
    verificacaoFinal.push({
      aluno: "Beatriz Sacatucua",
      passou,
      detalhes: [
        `Total de matrículas: ${aluno.matriculas.length} (esperado >= ${MAX_ITERACOES})`,
        `Estado da 1ª matrícula: ${primeiraMatricula?.status ?? "n/d"} (esperado TRANCADA ou CONCLUIDA — nunca ATIVA)`,
        `Aluno.status final: ${aluno.status} (esperado FORMADO — fim de curso, Opção A; nunca TRANCADO)`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.domingos.email);
    const multaOrfa = aluno.cobrancas.find((c) => c.mesReferencia === null);
    const repeticoes = aluno.inscricoes.filter((i) => i.tentativa > 1);
    const passou = Boolean(multaOrfa) && repeticoes.length >= 1 && aluno.status === "FORMADO";
    verificacaoFinal.push({
      aluno: "Domingos Cavaco",
      passou,
      detalhes: [
        `Multa órfã (mesReferencia null) encontrada: ${Boolean(multaOrfa)} (valor: ${multaOrfa ? Number(multaOrfa.valorDevido) : "n/d"} — esperada da rematrícula TARDIA fora da janela, marco extra agora a matriculaFim+7d)`,
        `InscricaoCadeira com tentativa > 1 (repetição da cadeira reprovada no 2º ano): ${repeticoes.length}`,
        `Aluno.status final: ${aluno.status} (esperado FORMADO — fim de curso, Opção A)`,
      ],
    });
  }

  {
    const aluno = await estadoAluno(alunos.isabel.email);
    const notasAutomaticas = await prisma.nota.count({ where: { automatica: true, inscricaoCadeira: { alunoId: aluno.id } } });
    const passou = notasAutomaticas >= 1 && aluno.status === "FORMADO";
    verificacaoFinal.push({
      aluno: "Isabel Neto",
      passou,
      detalhes: [
        `Notas automáticas (0 por falta de prazo) atribuídas ao longo do percurso: ${notasAutomaticas} (esperado >= 1 por ano em Bases de Dados)`,
        `Aluno.status final: ${aluno.status} (esperado FORMADO — fim de curso, Opção A)`,
      ],
    });
  }

  {
    const decisaoDomingos = decidirRematricula({ reprovacoes: 1, limiteReprovacoes: 2, anoCurricular: 2 });
    verificacaoFinal.push({
      aluno: "Domingos Cavaco (verificação cruzada com decidirRematricula)",
      passou: decisaoDomingos.resultado === "AVANCA" && decisaoDomingos.novoAnoCurricular === 3,
      detalhes: [`decidirRematricula({reprovacoes:1, limiteReprovacoes:2, anoCurricular:2}) = ${JSON.stringify(decisaoDomingos)} (esperado AVANCA, novoAnoCurricular=3)`],
    });
  }

  await browser.close();
  escreverRelatorioAnomalias(outputDir);
  escreverRelatorio(outputDir, anosRelatorio, verificacaoFinal, true);

  const totalViolacoesError = anosRelatorio.flatMap((a) => a.violacoesDiagnostico).filter((v) => v.severidade === "ERROR").length;
  const passaram = verificacaoFinal.filter((v) => v.passou).length;
  console.log(`\n=== RESUMO v2 ===`);
  console.log(`Verificação final: ${passaram}/${verificacaoFinal.length} PASS`);
  console.log(`Violações ERROR acumuladas: ${totalViolacoesError}`);
  console.log(`Extras v2 com problema: ${extrasPorEtiqueta.length === 0 ? "nenhum" : ""}`);
  for (const e of extrasPorEtiqueta) console.log(`  - ${e}`);
  console.log(`Screenshots: ${contadorShots}+ (em ${outputDir})`);
  process.exit(totalViolacoesError === 0 && passaram === verificacaoFinal.length ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
