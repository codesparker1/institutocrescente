import type { Page, BrowserContext } from "playwright";
import { login, textoDeErroVisivel, instrumentarECapturar, tentarAcao } from "./comum";
import type { CredencialAgente } from "../../db-helpers";
import type { AcaoCaotica, ResultadoAgenteCaotico } from "./comum";

/**
 * Admin que cria conflitos de propósito: duas abas a marcar o mesmo horário (mesma turma-
 * disciplina, dia e hora) em simultâneo — só uma deve vencer, encontrarConflito.ts já valida
 * isto sequencialmente, aqui testa-se sob concorrência real — e tenta apagar um curso que ainda
 * tem turmas (deve ser recusado com uma guarda de FK, não crashar).
 */
interface OpcoesAdminCaotico {
  /** Turma com pelo menos uma disciplina já atribuída — resolvida pelo orquestrador via Prisma, para o formulário de horário ter sempre opções válidas. */
  turmaComDisciplinas?: { cursoId: string; anoCurricular: number; periodo: string };
}

export async function agirComoAdminCaotico(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
  opts: OpcoesAdminCaotico = {},
): Promise<ResultadoAgenteCaotico> {
  const acoes: AcaoCaotica[] = [];

  acoes.push(
    await tentarAcao("duas abas a marcar o mesmo horário em simultâneo", false, () =>
      conflitoDeHorarioConcorrente(context, baseUrl, credencial, outputDir, opts.turmaComDisciplinas),
    ),
  );

  const page = await context.newPage();
  instrumentarECapturar(page, outputDir, credencial.papel);
  await login(page, baseUrl, credencial);
  acoes.push(await tentarAcao("apagar curso que ainda tem turmas", true, () => apagarCursoComTurmas(page, baseUrl)));
  await page.close();

  return { acoes };
}

async function conflitoDeHorarioConcorrente(
  context: BrowserContext,
  baseUrl: string,
  credencial: CredencialAgente,
  outputDir: string,
  turmaComDisciplinas?: { cursoId: string; anoCurricular: number; periodo: string },
): Promise<AcaoCaotica> {
  const paginaA = await context.newPage();
  const paginaB = await context.newPage();
  instrumentarECapturar(paginaA, outputDir, credencial.papel);
  instrumentarECapturar(paginaB, outputDir, credencial.papel);

  // Sem filtros explícitos, /horario usa o 1º curso por ordem alfabética + 1º ano + MATUTINO —
  // essa combinação pode calhar numa turma com zero disciplinas atribuídas (select vazio,
  // submissão bloqueada pela validação HTML "required", nunca chega ao servidor). Navegar já
  // com os filtros de uma turma que sabemos ter disciplinas evita esse falso "sucessoA=false
  // sucessoB=false" que não tem nada a ver com o conflito que este cenário quer testar.
  const query = turmaComDisciplinas
    ? `?cursoId=${turmaComDisciplinas.cursoId}&anoCurricular=${turmaComDisciplinas.anoCurricular}&periodo=${turmaComDisciplinas.periodo}`
    : "";

  await login(paginaA, baseUrl, credencial);
  await Promise.all([
    paginaA.goto(`${baseUrl}/horario${query}`),
    (async () => {
      await login(paginaB, baseUrl, credencial);
      await paginaB.goto(`${baseUrl}/horario${query}`);
    })(),
  ]);

  async function submeterSlot(page: Page): Promise<"sucesso" | "sem-formulario" | "erro-mostrado"> {
    const form = page.locator("form", { has: page.locator('input[name="sala"]') }).first();
    if ((await form.count()) === 0) return "sem-formulario";
    await form.locator('input[name="sala"]').fill("Sala Conflito");
    await form.getByRole("button", { name: /Adicionar/ }).click();
    await page.waitForTimeout(1000);
    return (await textoDeErroVisivel(page)) === null ? "sucesso" : "erro-mostrado";
  }

  const [resultadoA, resultadoB] = await Promise.all([submeterSlot(paginaA), submeterSlot(paginaB)]);
  await paginaA.close();
  await paginaB.close();

  // O invariante real é "nunca os dois ao mesmo tempo" — não "exatamente um". Se já havia um
  // horário seedado a colidir com o dia/hora fixos deste teste, os DOIS pedidos serem recusados
  // é o comportamento correto (a guarda apanhou ambos), não uma falha do teste.
  const ambosSucederam = resultadoA === "sucesso" && resultadoB === "sucesso";
  return {
    label: "duas abas a marcar o mesmo horário em simultâneo",
    esperadoRejeitado: false,
    foiRejeitadoGraciosamente: !ambosSucederam,
    detalhe: `A=${resultadoA} B=${resultadoB}`,
  };
}

async function apagarCursoComTurmas(page: Page, baseUrl: string): Promise<AcaoCaotica> {
  await page.goto(`${baseUrl}/admin/cursos`);
  const primeiroNome = await page.locator("table tbody tr").first().locator("td").first().textContent();
  const botaoRemover = page.getByRole("button", { name: "Remover" }).first();
  if ((await botaoRemover.count()) === 0) {
    return { label: "apagar curso com turmas dependentes", esperadoRejeitado: true, foiRejeitadoGraciosamente: null, detalhe: "sem curso na lista" };
  }
  await botaoRemover.click();
  await page.waitForTimeout(1000);
  await page.goto(`${baseUrl}/admin/cursos`);
  const aindaPresente = (await page.locator(`table tbody tr:has-text("${primeiroNome}")`).count()) > 0;
  return {
    label: "apagar curso que ainda tem turmas",
    esperadoRejeitado: true,
    foiRejeitadoGraciosamente: aindaPresente,
    detalhe: aindaPresente ? "curso continua na lista (rejeitado)" : "curso desapareceu — verificar se tinha mesmo dependentes",
  };
}
