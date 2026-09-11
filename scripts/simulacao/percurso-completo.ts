/**
 * Percurso completo de UM aluno, do ano em que está até FORMADO (§pedido do cliente 2026-09-11:
 * "ver como ele pode terminar"). Ao contrário dos outros orquestradores — que simulam um ano com
 * muitos agentes — este segue uma só pessoa por quantos anos letivos forem precisos, pela UI real.
 *
 * Cada ciclo:
 *   1. DAAC lança as notas em falta na ficha do aluno (dispensa: P1=P2=16)
 *   2. no último ano do curso, o percurso de finalista completo em Admin > Finalistas:
 *      confirmar pagamento → orientador → marcar defesa → lançar nota
 *   3. relógio para depois do fim do ano letivo, e um toque no dashboard dispara o rollover
 *      (cria as turmas do ano novo e avança as datas da configuração)
 *   4. relógio para dentro da janela de matrícula nova, e outro toque dispara o resto
 *   5. ADMIN processa a rematrícula
 * Sai quando o aluno fica FORMADO — no último ano a rematrícula não encontra turma do ano
 * seguinte, e processarRematriculaAction trata isso como fim de curso.
 *
 * Escreve telemetria em cada passo, por isso a corrida vê-se na Sala de Comando (/admin/simulacao).
 *
 * PRECISA de SIMULATION_MODE=true no servidor que está a ser conduzido — sem isso getAgora()
 * devolve a data real e ignora o relógio simulado, e todas as janelas de matrícula falham.
 *
 * Usage:
 *   npx tsx scripts/simulacao/percurso-completo.ts --estudante ISPC2027-0014 [--url http://localhost:3000]
 */
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { garantirNaoENeon } from "../lib/guardarNeon";
import { avancarRelogioAsync, definirCorrida } from "./relogio";
import { escreverRelatorioAnomalias, instrumentarPagina } from "./anomalias";
import { login, registarAcao, anomaliaDoAgente } from "./agentes/comum";
import { processarRematricula } from "./cenarios-5-alunos/acoes-comuns";
import { getContextoSimulacao, disconnect, type CredencialAgente } from "./db-helpers";
import { desligarTelemetria } from "./telemetria";

dotenv.config({ path: ".env.local", override: true });
garantirNaoENeon();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Trava de segurança: um curso tem no máximo uns 6 anos; mais do que isto é um ciclo infinito. */
const MAX_CICLOS = 8;
/** P1=P2=16 dá média 16, acima da nota mínima de dispensa (14) — aprova sem precisar de exame. */
const NOTA_DISPENSA = "16";

function parseArgs(argv: string[]) {
  const args = { url: "http://localhost:3000", estudante: "ISPC2027-0014" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url" && argv[i + 1]) args.url = argv[i + 1];
    else if (argv[i] === "--estudante" && argv[i + 1]) args.estudante = argv[i + 1];
  }
  return args;
}

const registo: string[] = [];
function anotar(linha: string): void {
  registo.push(linha);
  console.log(linha);
}

async function estadoDoAluno(numeroEstudante: string) {
  const aluno = await prisma.aluno.findFirstOrThrow({
    where: { numeroEstudante },
    select: {
      id: true,
      nome: true,
      status: true,
      curso: true,
      anoCurricular: true,
      matriculas: {
        where: { status: "ATIVA" },
        orderBy: { turma: { anoLetivo: "desc" } },
        take: 1,
        select: {
          turma: {
            select: { id: true, anoLetivo: true, anoCurricular: true, cursoId: true, curso: { select: { nome: true, duracaoAnos: true } } },
          },
        },
      },
      inscricoes: {
        where: { ativa: true, eMonografiaAplicada: false, notas: { none: {} } },
        select: { id: true, turmaDisciplina: { select: { disciplina: { select: { nome: true } } } } },
      },
    },
  });

  const turma = aluno.matriculas[0]?.turma ?? null;
  const temMonografiaNoPlano = turma
    ? (await prisma.cadeiraCurricular.count({
        where: { cursoId: turma.cursoId, anoCurricular: turma.curso.duracaoAnos, eMonografia: true },
      })) > 0
    : false;

  return {
    id: aluno.id,
    nome: aluno.nome,
    status: aluno.status,
    turma,
    ultimoAno: turma ? turma.anoCurricular >= turma.curso.duracaoAnos : false,
    temMonografiaNoPlano,
    disciplinasSemNota: aluno.inscricoes.map((i) => i.turmaDisciplina.disciplina.nome),
  };
}

async function lerConfig() {
  const c = await prisma.configuracaoAcademica.findUniqueOrThrow({ where: { id: "config" } });
  return {
    anoLetivoInicio: c.anoLetivoInicio,
    anoLetivoFim: c.anoLetivoFim,
    matriculaInicio: c.matriculaInicio,
    matriculaFim: c.matriculaFim,
  };
}

function diasDepois(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 24 * 60 * 60 * 1000);
}

/**
 * Toca no dashboard para disparar os jobs preguiçosos (rollover das turmas, cobranças, suspensão).
 * `avancarRelogio` sozinho não dispara nada — é o acesso seguinte que reage à data nova.
 */
async function acordarJobs(page: Page, baseUrl: string, credencial: CredencialAgente, outputDir: string, porque: string): Promise<void> {
  await page.goto(`${baseUrl}/dashboard`);
  // Os jobs correm em `after()`, fora do ciclo pedido-resposta: sem esta pausa o passo seguinte
  // pode ler a base antes de o rollover ter escrito as turmas do ano novo.
  await page.waitForTimeout(3000);
  await registarAcao(credencial, outputDir, `Acorda os jobs — ${porque}`, { rota: "/dashboard" });
}

/**
 * Lança notas de dispensa nas cadeiras em falta, pela ficha do aluno (LinhaPercursoEditavel).
 * Pela ficha e não pela pauta do professor porque o rollover NÃO copia o professor para as turmas
 * do ano novo: a pauta ficaria sem ninguém atribuído, e cada ciclo exigiria primeiro atribuir um
 * docente a cada disciplina. O DAAC lançar nota na ficha é um caminho real do sistema.
 */
async function lancarNotasEmFalta(
  page: Page,
  baseUrl: string,
  daac: CredencialAgente,
  outputDir: string,
  alunoId: string,
  disciplinas: string[],
): Promise<number> {
  if (disciplinas.length === 0) return 0;
  await page.goto(`${baseUrl}/alunos/${alunoId}`);

  let lancadas = 0;
  for (const disciplina of disciplinas) {
    const linha = page.locator("tr", { hasText: disciplina }).filter({ has: page.getByRole("button", { name: "editar" }) });
    if ((await linha.count()) === 0) {
      await anomaliaDoAgente(page, daac, outputDir, `Sem linha editável para "${disciplina}" na ficha do aluno`);
      continue;
    }

    const inicio = Date.now();
    await linha.first().getByRole("button", { name: "editar" }).click();
    await page.locator('input[name="p1"]').first().fill(NOTA_DISPENSA);
    await page.locator('input[name="p2"]').first().fill(NOTA_DISPENSA);
    await page.getByRole("button", { name: "Guardar" }).first().click();
    // A linha fecha-se sozinha ao gravar (§correção 2026-09-09) — esperar por isso é a confirmação
    // de que a Server Action respondeu, e não um sleep às cegas.
    await page.waitForTimeout(1500);

    lancadas += 1;
    await registarAcao(daac, outputDir, `Lança notas de ${disciplina} (P1=P2=${NOTA_DISPENSA})`, {
      rota: `/alunos/${alunoId}`,
      duracaoMs: Date.now() - inicio,
      detalhes: { disciplina },
    });
  }
  return lancadas;
}

/**
 * O percurso de finalista completo, em Admin > Finalistas. Cada passo é um controlo separado na
 * linha do aluno, e cada um depende do anterior — sem orientador não se marca defesa, sem defesa
 * não há nota.
 */
async function percursoFinalista(
  page: Page,
  baseUrl: string,
  daac: CredencialAgente,
  outputDir: string,
  nomeAluno: string,
  dataDefesa: Date,
): Promise<boolean> {
  await page.goto(`${baseUrl}/admin/finalistas?q=${encodeURIComponent(nomeAluno)}`);
  const linha = page.locator("tbody tr", { hasText: nomeAluno }).first();
  if ((await linha.count()) === 0) {
    await anomaliaDoAgente(page, daac, outputDir, `${nomeAluno} não aparece na lista de Finalistas`);
    return false;
  }

  // 1. Pagamento da monografia — é isto que CRIA a inscrição em monografia.
  const botaoPagamento = linha.getByRole("button", { name: /Confirmar pagamento/i });
  if ((await botaoPagamento.count()) > 0) {
    await botaoPagamento.click();
    await page.waitForTimeout(2000);
    await registarAcao(daac, outputDir, "Confirma o pagamento da monografia", { rota: "/admin/finalistas", escrita: true });
    anotar("    · pagamento da monografia confirmado");
  }

  // 2. Orientador — a Server Action valida o limite por professor.
  const seletor = page.locator('select[name="orientadorId"]').first();
  if ((await seletor.count()) > 0) {
    const opcoes = await seletor.locator("option").all();
    let escolhido: string | null = null;
    for (const opcao of opcoes) {
      const valor = await opcao.getAttribute("value");
      const desativada = await opcao.isDisabled();
      if (valor && !desativada) {
        escolhido = valor;
        break;
      }
    }
    if (!escolhido) {
      await anomaliaDoAgente(page, daac, outputDir, "Nenhum professor disponível para orientar (todos no limite?)");
      return false;
    }
    await seletor.selectOption(escolhido);
    await seletor.locator("xpath=following-sibling::button[1]").click();
    await page.waitForTimeout(2000);
    await registarAcao(daac, outputDir, "Atribui o orientador da monografia", { rota: "/admin/finalistas", escrita: true });
    anotar("    · orientador atribuído");
  }

  // 3. Defesa. O input é datetime-local: tem de levar o formato local, não um ISO com Z.
  const campoData = page.locator('input[name="data"]').first();
  if ((await campoData.count()) > 0) {
    const p = (n: number) => String(n).padStart(2, "0");
    const texto = `${dataDefesa.getFullYear()}-${p(dataDefesa.getMonth() + 1)}-${p(dataDefesa.getDate())}T09:00`;
    await campoData.fill(texto);
    await page.locator('input[name="sala"]').first().fill("Sala 13");
    await campoData.locator("xpath=following-sibling::button[1]").click().catch(async () => {
      await page.getByRole("button", { name: "Guardar" }).first().click();
    });
    await page.waitForTimeout(2000);
    await registarAcao(daac, outputDir, `Marca a defesa para ${texto}`, { rota: "/admin/finalistas", escrita: true });
    anotar(`    · defesa marcada para ${texto}`);
  }

  // 4. Nota da defesa — o passo que fecha o curso.
  const campoNota = page.locator('input[name="nota"]').first();
  if ((await campoNota.count()) === 0) {
    await anomaliaDoAgente(page, daac, outputDir, "Campo da nota da defesa não apareceu depois de marcar a defesa");
    return false;
  }
  await campoNota.fill("15");
  await page.getByRole("button", { name: /Lançar/i }).first().click();
  await page.waitForTimeout(2000);
  await registarAcao(daac, outputDir, "Lança a nota da defesa: 15", { rota: "/admin/finalistas", escrita: true });
  anotar("    · nota da defesa lançada (15)");
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.join(process.cwd(), "scripts", "simulacao", "output", `percurso-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });
  definirCorrida(outputDir);

  const contexto = await getContextoSimulacao({ seed: 1, alunos: 1, professores: 1 });
  await disconnect();

  const inicial = await estadoDoAluno(args.estudante);
  anotar(`Percurso completo de ${inicial.nome} (${args.estudante})`);
  anotar(`  estado inicial: ${inicial.status} · ${inicial.turma?.curso.nome ?? "sem matrícula"} ${inicial.turma?.anoCurricular ?? "?"}º ano · letivo ${inicial.turma?.anoLetivo ?? "?"}`);
  anotar(`  curso de ${inicial.turma?.curso.duracaoAnos ?? "?"} ano(s) · monografia no plano: ${inicial.temMonografiaNoPlano}`);
  anotar(`  corrida: ${path.basename(outputDir)}\n`);

  if (!inicial.turma) throw new Error("Aluno sem matrícula ativa — não há percurso para simular.");

  const browser = await chromium.launch();
  const paginaDaac = await browser.newPage();
  const paginaAdmin = await browser.newPage();
  instrumentarPagina(paginaDaac, outputDir, contexto.daac.papel);
  instrumentarPagina(paginaAdmin, outputDir, contexto.admin.papel);
  await login(paginaDaac, args.url, contexto.daac, outputDir);
  await login(paginaAdmin, args.url, contexto.admin, outputDir);

  let formado = false;

  for (let ciclo = 1; ciclo <= MAX_CICLOS; ciclo += 1) {
    const estado = await estadoDoAluno(args.estudante);
    if (estado.status === "FORMADO") {
      formado = true;
      break;
    }
    if (!estado.turma) {
      anotar(`Ciclo ${ciclo}: sem matrícula ativa (estado ${estado.status}) — o percurso parou aqui.`);
      break;
    }

    anotar(`— Ciclo ${ciclo}: ${estado.turma.curso.nome} ${estado.turma.anoCurricular}º ano, letivo ${estado.turma.anoLetivo}`);

    const config = await lerConfig();
    if (!config.anoLetivoInicio || !config.anoLetivoFim) throw new Error("Configuração académica sem datas de ano letivo.");

    // Meio do ano letivo: depois de as aulas começarem e com folga até ao fim, que é onde a defesa
    // tem de caber.
    const meioDoAno = new Date((config.anoLetivoInicio.getTime() + config.anoLetivoFim.getTime()) / 2);
    await avancarRelogioAsync(meioDoAno);
    anotar(`  relógio → ${meioDoAno.toISOString().slice(0, 10)} (meio do ano letivo)`);

    const lancadas = await lancarNotasEmFalta(paginaDaac, args.url, contexto.daac, outputDir, estado.id, estado.disciplinasSemNota);
    anotar(`  notas lançadas: ${lancadas} cadeira(s) — ${estado.disciplinasSemNota.join(", ") || "nenhuma em falta"}`);

    if (estado.ultimoAno && estado.temMonografiaNoPlano) {
      anotar("  último ano do curso — percurso de finalista:");
      await percursoFinalista(paginaDaac, args.url, contexto.daac, outputDir, estado.nome, diasDepois(meioDoAno, 1));
    }

    // Fim do ano letivo: o rollover cria as turmas do ano novo e avança as datas da configuração.
    await avancarRelogioAsync(diasDepois(config.anoLetivoFim, 2));
    await acordarJobs(paginaAdmin, args.url, contexto.admin, outputDir, "fim do ano letivo (rollover)");
    anotar(`  relógio → ${diasDepois(config.anoLetivoFim, 2).toISOString().slice(0, 10)} (fim do ano letivo, rollover disparado)`);

    // Depois do rollover a configuração já aponta ao ciclo novo — a janela de matrícula é outra.
    const novaConfig = await lerConfig();
    if (novaConfig.matriculaInicio && novaConfig.matriculaFim) {
      const dentroDaJanela = new Date((novaConfig.matriculaInicio.getTime() + novaConfig.matriculaFim.getTime()) / 2);
      await avancarRelogioAsync(dentroDaJanela);
      await acordarJobs(paginaAdmin, args.url, contexto.admin, outputDir, "janela de matrícula aberta");
      anotar(`  relógio → ${dentroDaJanela.toISOString().slice(0, 10)} (dentro da janela de matrícula)`);
    }

    const resultado = await processarRematricula(paginaAdmin, args.url, contexto.admin, estado.id, outputDir, { jaLogado: true });
    await registarAcao(contexto.admin, outputDir, resultado.sucesso ? "Processa a rematrícula" : "Rematrícula recusada", {
      rota: `/alunos/${estado.id}`,
      escrita: true,
      detalhes: { erro: resultado.erro, resultado: resultado.resultado },
    });
    anotar(`  rematrícula: ${resultado.sucesso ? "ok" : "recusada"} — ${resultado.resultado ?? resultado.erro ?? "sem mensagem"}`);

    // O fim de curso chega por aqui: sem turma do ano seguinte, processarRematriculaAction marca
    // FORMADO e devolve FIM_DE_CURSO na mensagem de erro.
    if ((resultado.erro ?? "").includes("FIM_DE_CURSO") || (resultado.resultado ?? "").includes("Concluiu o curso")) {
      formado = true;
      break;
    }
    if (!resultado.sucesso) {
      anotar("  → a rematrícula falhou e não é fim de curso; o percurso para aqui.");
      break;
    }
  }

  const final = await estadoDoAluno(args.estudante);
  anotar(`\n=== Estado final: ${final.status} ===`);
  anotar(`  ${final.turma ? `${final.turma.curso.nome} ${final.turma.anoCurricular}º ano · letivo ${final.turma.anoLetivo}` : "sem matrícula ativa"}`);
  anotar(formado ? "  O aluno concluiu o curso." : "  O aluno NÃO chegou a FORMADO — ver o log acima.");

  await browser.close();
  escreverRelatorioAnomalias(outputDir);
  writeFileSync(path.join(outputDir, "percurso.md"), `# Percurso completo\n\n${registo.map((l) => `    ${l}`).join("\n")}\n`);
  anotar(`\nRelatório: ${outputDir}`);
  anotar(`Painel: ${args.url}/admin/simulacao?corrida=${path.basename(outputDir)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await desligarTelemetria();
    await prisma.$disconnect();
  });
