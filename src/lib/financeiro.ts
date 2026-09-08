import "server-only";
import { prisma } from "@/lib/prisma";
import type { CategoriaEstudante, Periodo } from "@/generated/prisma/client";
import { ehVencidoAlemDaTolerancia, mesDentroDoAnoLetivo } from "@/lib/divida";
import { anoLetivoCorrente } from "@/lib/academico";
import { estadoCobrancaVisual, type EstadoCobrancaVisual } from "@/lib/estado-cobranca";
import { getAgora } from "@/lib/tempo";
import { TIPOS_QUE_BLOQUEIAM, TIPOS_QUE_CONTAM_COMO_DIVIDA } from "@/lib/financeiro-tipos";

export { mesReferenciaLabel } from "@/lib/utils";

async function getConfiguracaoFinanceira() {
  const config = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  return (
    config ?? {
      bloqueioAtivo: false,
      toleranciaDias: 0,
      diaVencimento: 10,
      valorMulta: 5000,
      percentagemAgravamentoPorCadeira: 0,
      agravamentoSoNoSemestreDaCadeira: false,
      ultimaGeracaoEm: null,
    }
  );
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export interface ValorPropinaCalculado {
  valorDevido: number;
  descricao: string | null;
}

/**
 * Preço de uma mensalidade: base (PrecoPropina, por categoria×ano curricular) + agravamento
 * linear por cadeira ainda em repetição do ano anterior (§pedido do cliente 2026-08-18). Função
 * pura partilhada entre a geração diária (gerarCobrancasDoDia) e a pré-geração do ano letivo
 * inteiro na rematrícula (processarRematriculaAction) — as duas têm de calcular exatamente o
 * mesmo valor para a mesma combinação categoria/ano/cadeiras-em-repetição.
 */
export function calcularValorPropina(valorBase: number, cadeirasReprovadas: number, percentagemAgravamentoPorCadeira: number): ValorPropinaCalculado {
  if (cadeirasReprovadas <= 0) return { valorDevido: valorBase, descricao: null };
  const valorDevido = valorBase * (1 + (percentagemAgravamentoPorCadeira / 100) * cadeirasReprovadas);
  const descricao = `Inclui agravamento por ${cadeirasReprovadas} cadeira(s) em repetição (+${(percentagemAgravamentoPorCadeira * cadeirasReprovadas).toFixed(2)}%)`;
  return { valorDevido, descricao };
}

/**
 * Quantas cadeiras em repetição contam de facto para o agravamento deste mês (§pedido do cliente
 * 2026-09-08: "um aluno reprovou numa disciplina de 2º semestre, deve pagar desde já?").
 *
 * Com `agravamentoSoNoSemestreDaCadeira` desligado (defeito, comportamento de sempre): o
 * agravamento é visto como o custo administrativo de estar a repetir, não o custo de uma cadeira
 * concreta — conta o total desde o 1º mês.
 *
 * Ligado: uma cadeira de 2º semestre ainda não tem aulas nenhumas enquanto o 1º semestre decorre
 * — não faz sentido cobrar por ela já. `cadeirasReprovadasAnoAnterior` guarda sempre o TOTAL (não
 * muda com a opção), e `cadeirasReprovadasSemestre2AnoAnterior` o subconjunto de 2º semestre; a
 * diferença dá as de 1º semestre, que contam desde sempre. As de 2º só se juntam quando o sistema
 * já está no 2º semestre — nesse momento recalcularAgravamentoPendentes atualiza de uma vez as
 * mensalidades por vencer, e esta função só continua a manter a mesma conta nos meses seguintes.
 */
export function calcularCadeirasReprovadasEfetivas(
  totalReprovadas: number,
  reprovadasSemestre2: number,
  agravamentoSoNoSemestreDaCadeira: boolean,
  semestreAtual: number,
): number {
  if (!agravamentoSoNoSemestreDaCadeira || semestreAtual >= 2) return totalReprovadas;
  return totalReprovadas - reprovadasSemestre2;
}

export interface GerarPropinasAnoLetivoParams {
  alunoId: string;
  matriculaId: string;
  categoria: CategoriaEstudante;
  anoCurricular: number;
  cadeirasReprovadas: number;
  anoLetivoAlvo: number;
  configAcademica: { anoLetivoInicio: Date | null; anoLetivoFim: Date | null };
  /** A partir de que mês começar a gerar (ex.: mês de ingresso de um aluno novo a meio do ciclo) —
   * omitido usa o início do ciclo inteiro (caso da rematrícula, que começa sempre no 1º mês). */
  aPartirDoMes?: Date;
}

/**
 * Pré-gera todas as mensalidades do ano letivo alvo assim que o aluno entra numa turma — seja por
 * rematrícula (processarRematriculaAction) ou por matrícula nova (createAlunoAction) — em vez de
 * esperar que garantirCobrancasGeradas as vá criando uma a uma, mês a mês, à medida que o tempo
 * passa (§pedido do cliente 2026-08-18: "capacidade de pagar meses em avanço"). A multa continua
 * exatamente como estava: só nasce quando um mês já gerado passa a sua própria data de vencimento
 * (gerarCobrancasDoDia, geração diária) — esta função nunca cria multa, só propinas.
 * Sem `anoLetivoInicio`/`anoLetivoFim` configurados, ou sem PrecoPropina para a combinação, não
 * bloqueia a matrícula/rematrícula — cai de volta na geração diária normal, mês a mês.
 */
export async function gerarPropinasAnoLetivo(params: GerarPropinasAnoLetivoParams): Promise<void> {
  const { alunoId, matriculaId, categoria, anoCurricular, cadeirasReprovadas, anoLetivoAlvo, configAcademica, aPartirDoMes } = params;
  if (!configAcademica.anoLetivoInicio || !configAcademica.anoLetivoFim) return;

  const [configFinanceira, precoPropina] = await Promise.all([
    prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } }),
    prisma.precoPropina.findUnique({ where: { categoria_anoCurricular: { categoria, anoCurricular } } }),
  ]);
  if (!precoPropina) return;

  const diaVencimento = configFinanceira?.diaVencimento ?? 10;
  const percentagemAgravamentoPorCadeira = Number(configFinanceira?.percentagemAgravamentoPorCadeira ?? 0);
  const { valorDevido, descricao } = calcularValorPropina(Number(precoPropina.valor), cadeirasReprovadas, percentagemAgravamentoPorCadeira);

  // Âncora a forma do ciclo (ex.: Setembro a Julho) configurada em anoLetivoInicio/Fim ao ano
  // letivo alvo real — Turma.anoLetivo é sempre o ano civil em que o ciclo começa.
  const mesInicio = configAcademica.anoLetivoInicio.getMonth();
  const mesFim = configAcademica.anoLetivoFim.getMonth();
  const inicioCicloCompleto = new Date(anoLetivoAlvo, mesInicio, 1);
  const anoCivilFim = mesFim < mesInicio ? anoLetivoAlvo + 1 : anoLetivoAlvo;
  const fimCiclo = new Date(anoCivilFim, mesFim, 1);
  // Um aluno novo a meio do ciclo só paga a partir do mês em que entra, nunca meses anteriores à
  // sua própria matrícula — a rematrícula (sem aPartirDoMes) começa sempre no 1º mês do ciclo.
  const inicioReal =
    aPartirDoMes && aPartirDoMes > inicioCicloCompleto ? new Date(aPartirDoMes.getFullYear(), aPartirDoMes.getMonth(), 1) : inicioCicloCompleto;

  const meses: Date[] = [];
  for (const cursor = new Date(inicioReal); cursor <= fimCiclo; cursor.setMonth(cursor.getMonth() + 1)) {
    meses.push(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  }

  await prisma.cobranca.createMany({
    data: meses.map((mesReferencia) => ({
      matriculaId,
      alunoId,
      tipo: "PROPINA" as const,
      mesReferencia,
      descricao,
      valorDevido,
      dataVencimento: new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), diaVencimento),
    })),
    skipDuplicates: true,
  });
}

/**
 * Recalcula do zero o agravamento das mensalidades AINDA POR VENCER, com as regras atuais —
 * chamada sempre que algo que decide o valor do agravamento muda: a percentagem
 * (atualizarPercentagemAgravamentoAction), a opção agravamentoSoNoSemestreDaCadeira
 * (atualizarAgravamentoSoNoSemestreAction), ou a abertura do 2º semestre (alterarSemestreAction).
 *
 * §pedido do cliente 2026-09-09: "vou testar em tempo real... quando guarda, o sistema atualiza" —
 * antes só a rematrícula seguinte via a mudança; para testar as duas formas (desde o início vs. só
 * no semestre da cadeira) sem esperar por isso, guardar tinha de já mexer no que está por pagar.
 *
 * Só toca em PROPINA PENDENTE com `mesReferencia` a partir do mês corrente (inclusive) — meses já
 * vencidos ou pagos são facto histórico, a mesma regra de "uma nota já lançada não se reabre"
 * aplicada à cobrança. Recalcula sempre do zero (nunca soma ao valor antigo), por isso é seguro
 * chamar mais que uma vez — repetir com a mesma configuração não muda nada.
 *
 * Devolve quantas mensalidades foram corrigidas, para a auditoria poder dizer se fez alguma coisa.
 */
export async function recalcularAgravamentoPendentes(agora: Date): Promise<number> {
  const [config, configAcademica] = await Promise.all([
    getConfiguracaoFinanceira(),
    prisma.configuracaoAcademica.findUnique({ where: { id: "config" }, select: { semestreAtual: true } }),
  ]);
  const semestreAtual = configAcademica?.semestreAtual ?? 1;

  const alunos = await prisma.aluno.findMany({
    where: { status: "ATIVO", cadeirasReprovadasAnoAnterior: { gt: 0 } },
    select: {
      id: true,
      categoria: true,
      cadeirasReprovadasAnoAnterior: true,
      cadeirasReprovadasSemestre2AnoAnterior: true,
      matriculas: {
        where: { status: "ATIVA" },
        select: { turma: { select: { anoCurricular: true } } },
        take: 1,
      },
    },
  });
  if (alunos.length === 0) return 0;

  const precos = await prisma.precoPropina.findMany();
  const precoPorChave = new Map(precos.map((p) => [`${p.categoria}:${p.anoCurricular}`, Number(p.valor)]));
  const percentagem = Number(config.percentagemAgravamentoPorCadeira);
  const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);

  let mensalidadesCorrigidas = 0;
  for (const aluno of alunos) {
    const anoCurricular = aluno.matriculas[0]?.turma.anoCurricular;
    if (anoCurricular === undefined) continue; // sem matrícula ativa — nada por vencer para corrigir
    const valorBase = precoPorChave.get(`${aluno.categoria}:${anoCurricular}`);
    if (valorBase === undefined) continue; // mesma regra de gerarCobrancasDoDia: sem preço, não inventa valor

    const cadeirasEfetivas = calcularCadeirasReprovadasEfetivas(
      aluno.cadeirasReprovadasAnoAnterior,
      aluno.cadeirasReprovadasSemestre2AnoAnterior,
      config.agravamentoSoNoSemestreDaCadeira,
      semestreAtual,
    );
    const { valorDevido, descricao } = calcularValorPropina(valorBase, cadeirasEfetivas, percentagem);
    const resultado = await prisma.cobranca.updateMany({
      where: { alunoId: aluno.id, tipo: "PROPINA", status: "PENDENTE", mesReferencia: { gte: inicioMesAtual } },
      data: { valorDevido, descricao },
    });
    mensalidadesCorrigidas += resultado.count;
  }
  return mensalidadesCorrigidas;
}

/**
 * Gera a propina do mês corrente (para matrículas ativas sem uma) e as multas devidas por
 * propinas vencidas além da tolerância (MD §2). Corre no máximo uma vez por dia civil: reclama
 * o "turno" com um updateMany condicional (0 linhas afetadas = outro request já tratou disto hoje).
 * Nunca cron horário — mataria o scale-to-zero do Neon.
 *
 * A geração pesada não corre aqui — é devolvida como um trabalho por fazer, para o layout do
 * dashboard a encadear DEPOIS de garantirSuspensaoAutomatica ter mesmo terminado, não só depois de
 * ter sido chamada (§reportado 2026-09-08, a mesma "propina fantasma" de 2026-08-28: um matriculado
 * de um ano letivo já fechado com uma PROPINA nova gerada em seu nome). Ver a nota grande em
 * garantirSuspensaoAutomatica (lib/curriculo.ts) sobre porque dois `after()` separados não bastam.
 * Só o claim (um updateMany rápido) é síncrono aqui — evita que o primeiro pedido a seguir a uma
 * virada de dia fique preso atrás de um findMany+createMany sobre todas as matrículas ativas, e
 * liberta a ligação à BD do pool mais depressa sob concorrência (achado na simulação de ano
 * caótico: p99 em picos de tráfego batia sempre nos marcos com viragem de dia, nunca nos outros, e
 * em rotas diferentes — sinal de um custo partilhado no layout, não de N+1 na rota).
 */
export async function garantirCobrancasGeradas(): Promise<(() => Promise<void>) | null> {
  const config = await getConfiguracaoFinanceira();
  const agora = await getAgora();

  if (config.ultimaGeracaoEm && inicioDoDia(config.ultimaGeracaoEm).getTime() === inicioDoDia(agora).getTime()) {
    return null;
  }

  const reclamado = await prisma.configuracaoFinanceira.updateMany({
    where: {
      id: "config",
      OR: [{ ultimaGeracaoEm: null }, { ultimaGeracaoEm: { lt: inicioDoDia(agora) } }],
    },
    data: { ultimaGeracaoEm: agora },
  });
  if (reclamado.count === 0) return null;

  // Fora do ano letivo não há propina a cobrar: o mês corrente pode ser anterior ao arranque das
  // aulas (agosto, com o ano a começar em outubro) ou posterior ao fim — e cobrava na mesma, por
  // esta geração só olhar ao mês do relógio (§bug encontrado 2026-08-28). As MULTAS continuam a
  // correr sempre: uma propina de junho vencida gera multa em agosto, ciclo fechado ou não.
  const configAcademica = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { anoLetivoInicio: true, anoLetivoFim: true, semestreAtual: true },
  });
  const gerarPropinas = mesDentroDoAnoLetivo(agora, configAcademica);

  return () =>
    gerarCobrancasDoDia(
      agora,
      config.diaVencimento,
      config.toleranciaDias,
      Number(config.valorMulta),
      Number(config.percentagemAgravamentoPorCadeira),
      gerarPropinas,
      anoLetivoCorrente(agora, configAcademica),
      config.agravamentoSoNoSemestreDaCadeira,
      configAcademica?.semestreAtual ?? 1,
    );
}


async function gerarCobrancasDoDia(
  agora: Date,
  diaVencimento: number,
  toleranciaDias: number,
  valorMulta: number,
  percentagemAgravamentoPorCadeira: number,
  /** false fora do ano letivo — só as multas correm (ver nota em garantirCobrancasGeradas). */
  gerarPropinas: boolean,
  /** null entre anos letivos, ou com a configuração por preencher — aí não se filtra por ano. */
  anoLetivoAtual: number | null,
  /** §pedido do cliente 2026-09-08 — ver a nota em calcularCadeirasReprovadasEfetivas abaixo. */
  agravamentoSoNoSemestreDaCadeira: boolean,
  semestreAtual: number,
): Promise<void> {
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const dataVencimentoMes = new Date(agora.getFullYear(), agora.getMonth(), diaVencimento);

  const [matriculasAtivas, precos] = await Promise.all([
    prisma.matricula.findMany({
      // isentaPropinas fica de fora (§pedido do cliente 2026-09-05): é o finalista que transitou à
      // espera de defesa sem voltar a pagar o ano. Precisa de matrícula ATIVA para poder defender,
      // mas cobrá-lo seria fazê-lo pagar a falta de júri.
      //
      // O filtro por ano letivo fecha a outra metade do mesmo caso (§2026-09-06): desde que a
      // suspensão automática passou a poupar quem tem monografia paga e por defender, esses alunos
      // ficam com a matrícula do ano ANTERIOR ainda ATIVA à espera da decisão do DAAC — e sem isto
      // apanhavam a propina de cada mês do ano novo, cobrada ao preço do ano em que já não estão.
      // Uma matrícula de um ano letivo fechado nunca deve gerar a mensalidade do mês corrente.
      where: {
        status: "ATIVA",
        isentaPropinas: false,
        ...(anoLetivoAtual !== null ? { turma: { anoLetivo: anoLetivoAtual } } : {}),
      },
      include: {
        turma: true,
        aluno: { select: { categoria: true, cadeirasReprovadasAnoAnterior: true, cadeirasReprovadasSemestre2AnoAnterior: true } },
      },
    }),
    prisma.precoPropina.findMany(),
  ]);
  const precoPorChave = new Map(precos.map((p) => [`${p.categoria}:${p.anoCurricular}`, p.valor]));

  const semPreco = new Set<string>();
  const propinasAGerar = !gerarPropinas ? [] : matriculasAtivas.flatMap((m) => {
    const valorBase = precoPorChave.get(`${m.aluno.categoria}:${m.turma.anoCurricular}`);
    if (valorBase === undefined) {
      semPreco.add(`${m.aluno.categoria} · ${m.turma.anoCurricular}º Ano`);
      return [];
    }
    // Enquanto o 1º semestre decorre e a opção está ligada, uma cadeira reprovada de 2º semestre
    // ainda não tem aulas nenhumas — não entra no agravamento deste mês. calcularCadeirasReprovadasEfetivas
    // documenta o porquê; recalcularAgravamentoPendentes acrescenta a diferença quando o 2º semestre abrir.
    const cadeirasReprovadas = calcularCadeirasReprovadasEfetivas(
      m.aluno.cadeirasReprovadasAnoAnterior,
      m.aluno.cadeirasReprovadasSemestre2AnoAnterior,
      agravamentoSoNoSemestreDaCadeira,
      semestreAtual,
    );
    const { valorDevido, descricao } = calcularValorPropina(Number(valorBase), cadeirasReprovadas, percentagemAgravamentoPorCadeira);
    return [
      {
        matriculaId: m.id,
        alunoId: m.alunoId,
        tipo: "PROPINA" as const,
        mesReferencia: inicioMes,
        descricao,
        valorDevido,
        dataVencimento: dataVencimentoMes,
      },
    ];
  });
  if (semPreco.size > 0) {
    // Não inventa um valor (0 Kz cobrava de graça sem ninguém notar) — fica por gerar até o DAAC
    // preencher a combinação em falta em Admin > Preços, mesmo que isso atrase a cobrança do mês.
    console.warn(`garantirCobrancasGeradas: sem PrecoPropina configurado para ${[...semPreco].join(", ")} — propina não gerada para essas combinações.`);
  }

  if (propinasAGerar.length > 0) {
    await prisma.cobranca.createMany({ data: propinasAGerar, skipDuplicates: true });
  }

  const propinasPendentes = await prisma.cobranca.findMany({
    where: { tipo: "PROPINA", status: "PENDENTE" },
  });
  const emAtraso = propinasPendentes.filter((p) =>
    ehVencidoAlemDaTolerancia(p.dataVencimento, toleranciaDias, agora),
  );

  if (emAtraso.length > 0) {
    await prisma.cobranca.createMany({
      data: emAtraso.map((p) => ({
        matriculaId: p.matriculaId,
        alunoId: p.alunoId,
        tipo: "MULTA" as const,
        mesReferencia: p.mesReferencia,
        valorDevido: valorMulta,
        dataVencimento: p.dataVencimento,
      })),
      skipDuplicates: true,
    });
  }
}

export interface MesPendente {
  propinaId: string;
  mesReferencia: Date;
  valorDevido: number;
  valorPago: number;
  dataVencimento: Date;
}

export interface EstadoBloqueioAluno {
  bloqueado: boolean;
  /** Só PROPINA — é o que bloqueia, e o que o aluno tem de pagar para desbloquear. */
  saldoEmDivida: number;
  /**
   * Só MULTA. Separado de propósito: a multa nunca bloqueia (§financeiro-tipos), mas é dívida real
   * e o aluno tem de a pagar. Antes não aparecia em lado nenhum no aviso, e quem devia 85.000 de
   * propina + 25.000 de multa lia "85.000" e ia à secretaria com a conta errada.
   */
  saldoMultas: number;
  /** Propinas + multas — o que o aluno paga de facto ao balcão. */
  saldoTotal: number;
  mesesPendentes: MesPendente[];
}

/** Regra única de "em dívida" — usada pelo portão de bloqueio, pela lista de devedores e pelo filtro do PDF. */
export async function verificarBloqueioAluno(alunoId: string): Promise<EstadoBloqueioAluno> {
  const [config, cobrancasPendentes, multasPendentes] = await Promise.all([
    getConfiguracaoFinanceira(),
    prisma.cobranca.findMany({
      where: { alunoId, status: "PENDENTE", tipo: { in: [...TIPOS_QUE_BLOQUEIAM] } },
      orderBy: { mesReferencia: "asc" },
    }),
    // Consulta à parte, e não um `in: TIPOS_QUE_CONTAM_COMO_DIVIDA` filtrado depois: o bloqueio
    // continua a decidir-se só com propinas (mesesPendentes alimenta `temMesVencido`), e misturar
    // os dois tipos no mesmo conjunto seria o caminho fácil para uma multa passar a bloquear.
    prisma.cobranca.findMany({
      where: { alunoId, status: "PENDENTE", tipo: "MULTA" },
      select: { valorDevido: true, valorPago: true },
    }),
  ]);

  const agora = await getAgora();

  // Só as VENCIDAS além da tolerância entram na conta (§reportado 2026-09-08: "está a juntar de
  // novo todas as mensalidades, mesmo as que ainda não venceram"). gerarPropinasAnoLetivo pré-gera
  // o ano letivo inteiro assim que o aluno entra numa turma (§pedido do cliente 2026-08-18,
  // "capacidade de pagar meses em avanço") — a maioria das cobranças PENDENTE nunca chegou a
  // vencer, e cobrancasPendentes (a query acima) inclui-as todas. Sem este filtro, "propinas em
  // atraso" e "dívida" cresciam com meses futuros que ninguém deixou de pagar.
  //
  // Mesma regra usada em toda a parte (estadoCobrancaVisual, e o gate de rematrícula em
  // academico.ts, que já a documentava): DEVENDO é vencido além da tolerância, não qualquer
  // PENDENTE.
  const cobrancasVencidas = cobrancasPendentes.filter((c) =>
    ehVencidoAlemDaTolerancia(c.dataVencimento, config.toleranciaDias, agora),
  );
  const mesesPendentes: MesPendente[] = cobrancasVencidas.map((c) => ({
    propinaId: c.id,
    mesReferencia: c.mesReferencia ?? c.dataVencimento,
    valorDevido: Number(c.valorDevido),
    valorPago: Number(c.valorPago),
    dataVencimento: c.dataVencimento,
  }));

  const saldoEmDivida = mesesPendentes.reduce((soma, m) => soma + (m.valorDevido - m.valorPago), 0);
  const saldoMultas = multasPendentes.reduce((soma, m) => soma + (Number(m.valorDevido) - Number(m.valorPago)), 0);

  const temMesVencido = cobrancasVencidas.length > 0;

  return {
    // Só a propina bloqueia — `multasPendentes` não entra aqui de propósito (§financeiro-tipos).
    bloqueado: config.bloqueioAtivo && temMesVencido,
    saldoEmDivida,
    saldoMultas,
    saldoTotal: saldoEmDivida + saldoMultas,
    mesesPendentes,
  };
}

export interface DevedorListItem {
  alunoId: string;
  numeroEstudante: string;
  nome: string;
  curso: string;
  anoCurricular: number;
  categoria: CategoriaEstudante;
  valorEmDivida: number;
  /** Só propinas — uma multa não é "um mês", e contá-la junto inflava a contagem (§pedido do
   * cliente 2026-08-30: "isso esta adicionar o mes ainda nao vecido como 2 meses de atrasos"). */
  mesesPropinaEmAtraso: number;
  /** Quantas multas pendentes além da tolerância — contadas à parte das propinas, e mostradas
   * com o número (§pedido do cliente 2026-08-30) para a secretaria saber o tamanho da dívida. */
  multasEmAtraso: number;
  antiguidadeDias: number;
}

export interface FiltrosListaDevedores {
  sort?: "antiguidade" | "valor" | "nome";
  curso?: string;
  turmaId?: string;
  anoLetivo?: number;
  periodo?: Periodo;
  categoria?: CategoriaEstudante;
}

/** Lista de devedores (requisito 3.3) — só considera dívidas além da tolerância configurada. */
export async function getListaDevedores(filtros: FiltrosListaDevedores = {}): Promise<DevedorListItem[]> {
  const { sort = "antiguidade", curso, turmaId, anoLetivo, periodo, categoria } = filtros;
  const config = await getConfiguracaoFinanceira();
  const agora = await getAgora();

  // dataVencimento é sempre meia-noite do dia (garantirCobrancasGeradas), por isso a fronteira
  // exata de ehVencidoAlemDaTolerancia é expressável como uma data-limite fixa aqui, e o SQL
  // pode agregar por aluno diretamente (SUM/MIN/COUNT) em vez de trazer cada cobrança pendente
  // para agrupar em JS — achado pela corrida do cost-meter: sob 20 conexões concorrentes, cada
  // pedido segurava a ligação do pool tempo suficiente para o resto ficar em fila.
  const limite = new Date(agora.getTime() - (config.toleranciaDias + 1) * 24 * 60 * 60 * 1000);

  const whereBase = {
    status: "PENDENTE" as const,
    // Lista de devedores = dinheiro que o aluno deve à instituição, incluindo multas órfãs
    // (§pedido do cliente 2026-08) — diferente do portão de bloqueio, que é só PROPINA.
    tipo: { in: [...TIPOS_QUE_CONTAM_COMO_DIVIDA] },
    dataVencimento: { lte: limite },
    aluno: {
      ...(curso ? { curso } : {}),
      ...(categoria ? { categoria } : {}),
      ...(turmaId || anoLetivo || periodo
        ? {
            matriculas: {
              some: {
                status: "ATIVA" as const,
                ...(turmaId ? { turmaId } : {}),
                turma: {
                  ...(anoLetivo ? { anoLetivo } : {}),
                  ...(periodo ? { periodo } : {}),
                },
              },
            },
          }
        : {}),
    },
  };

  const [grupos, gruposPropina, gruposMulta] = await Promise.all([
    prisma.cobranca.groupBy({
      by: ["alunoId"],
      where: whereBase,
      _sum: { valorDevido: true, valorPago: true },
      _min: { dataVencimento: true },
    }),
    // Contagem de "meses em atraso" só sobre PROPINA — uma MULTA não é um mês de mensalidade
    // (§pedido do cliente 2026-08-30), por isso não pode entrar na mesma contagem.
    prisma.cobranca.groupBy({
      by: ["alunoId"],
      where: { ...whereBase, tipo: "PROPINA" },
      _count: { _all: true },
    }),
    prisma.cobranca.groupBy({
      by: ["alunoId"],
      where: { ...whereBase, tipo: "MULTA" },
      _count: { _all: true },
    }),
  ]);

  if (grupos.length === 0) return [];

  const mesesPropinaPorAluno = new Map(gruposPropina.map((g) => [g.alunoId, g._count._all]));
  const multasPorAluno = new Map(gruposMulta.map((g) => [g.alunoId, g._count._all]));

  const alunos = await prisma.aluno.findMany({
    where: { id: { in: grupos.map((g) => g.alunoId) } },
    select: { id: true, numeroEstudante: true, nome: true, curso: true, anoCurricular: true, categoria: true },
  });
  const alunoPorId = new Map(alunos.map((a) => [a.id, a]));

  const lista: DevedorListItem[] = grupos.map((g) => {
    const aluno = alunoPorId.get(g.alunoId)!;
    const antiguidadeDias = Math.floor((agora.getTime() - (g._min.dataVencimento ?? agora).getTime()) / (1000 * 60 * 60 * 24));
    return {
      alunoId: g.alunoId,
      numeroEstudante: aluno.numeroEstudante,
      nome: aluno.nome,
      curso: aluno.curso,
      anoCurricular: aluno.anoCurricular,
      categoria: aluno.categoria,
      valorEmDivida: Number(g._sum.valorDevido ?? 0) - Number(g._sum.valorPago ?? 0),
      mesesPropinaEmAtraso: mesesPropinaPorAluno.get(g.alunoId) ?? 0,
      multasEmAtraso: multasPorAluno.get(g.alunoId) ?? 0,
      antiguidadeDias,
    };
  });
  lista.sort((a, b) => {
    if (sort === "valor") return b.valorEmDivida - a.valorEmDivida;
    if (sort === "nome") return a.nome.localeCompare(b.nome, "pt");
    return b.antiguidadeDias - a.antiguidadeDias;
  });
  return lista;
}

/** Mesma regra de dívida, aplicada a um conjunto de alunos — usada pelo filtro da lista de presença em PDF. */
export async function getConjuntoAlunosEmDivida(alunoIds: string[]): Promise<Set<string>> {
  if (alunoIds.length === 0) return new Set();

  const config = await getConfiguracaoFinanceira();
  if (!config.bloqueioAtivo) return new Set();

  const agora = await getAgora();
  const cobrancasPendentes = await prisma.cobranca.findMany({
    where: { alunoId: { in: alunoIds }, status: "PENDENTE", tipo: { in: [...TIPOS_QUE_BLOQUEIAM] } },
  });

  const emDivida = new Set<string>();
  for (const c of cobrancasPendentes) {
    if (ehVencidoAlemDaTolerancia(c.dataVencimento, config.toleranciaDias, agora)) {
      emDivida.add(c.alunoId);
    }
  }
  return emDivida;
}

export interface PropinaMes {
  id: string;
  mesReferencia: Date;
  /** Preenchido só quando a mensalidade inclui agravamento por cadeira(s) em repetição. */
  descricao: string | null;
  valorDevido: number;
  valorPago: number;
  status: "PENDENTE" | "PAGO";
  dataPagamento: Date | null;
  registadoPorNome: string | null;
  /// Estado visual derivado (Opção A) — "Devendo" só quando vencido além da tolerância,
  /// a MESMA condição que bloqueia notas. Ver src/lib/estado-cobranca.ts.
  estadoVisual: EstadoCobrancaVisual;
}

export interface CobrancaAvulsa {
  id: string;
  mesReferencia: Date | null;
  descricao: string | null;
  valorDevido: number;
  valorPago: number;
  status: "PENDENTE" | "PAGO";
  dataPagamento: Date | null;
  registadoPorNome: string | null;
  estadoVisual: EstadoCobrancaVisual;
}

export interface EstadoFinanceiroAluno {
  /** Total agendado para o ano letivo inteiro (§gerarPropinasAnoLetivo) — informativo, não é o que se deve agora. */
  totalDevido: number;
  totalPago: number;
  /** Só o que já venceu além da tolerância e continua por pagar — não o calendário do ano inteiro. */
  saldoEmDivida: number;
  meses: PropinaMes[];
  multas: CobrancaAvulsa[];
}

/** Histórico financeiro completo de um aluno — usado pela ficha do aluno e pela sua própria página financeira. */
export async function getEstadoFinanceiroAluno(alunoId: string): Promise<EstadoFinanceiroAluno> {
  const [config, cobrancas] = await Promise.all([
    getConfiguracaoFinanceira(),
    prisma.cobranca.findMany({
      // Histórico completo mostra PROPINA+MULTA (a multa órfã tem de continuar visível na ficha,
      // §pedido do cliente 2026-08) — TIPOS_QUE_BLOQUEIAM é só para portões de bloqueio.
      where: { alunoId, tipo: { in: [...TIPOS_QUE_CONTAM_COMO_DIVIDA] } },
      include: { registadoPor: true },
      orderBy: { mesReferencia: "asc" },
    }),
  ]);
  const agora = await getAgora();

  const meses: PropinaMes[] = cobrancas
    .filter((c) => c.tipo === "PROPINA")
    .map((c) => ({
      id: c.id,
      mesReferencia: c.mesReferencia!,
      descricao: c.descricao,
      valorDevido: Number(c.valorDevido),
      valorPago: Number(c.valorPago),
      status: c.status,
      dataPagamento: c.dataPagamento,
      registadoPorNome: c.registadoPor?.name ?? null,
      estadoVisual: estadoCobrancaVisual(c.status, c.dataVencimento, config.toleranciaDias, agora),
    }));

  const multas: CobrancaAvulsa[] = cobrancas
    .filter((c) => c.tipo === "MULTA")
    .map((c) => ({
      id: c.id,
      mesReferencia: c.mesReferencia,
      descricao: c.descricao,
      valorDevido: Number(c.valorDevido),
      valorPago: Number(c.valorPago),
      status: c.status,
      dataPagamento: c.dataPagamento,
      registadoPorNome: c.registadoPor?.name ?? null,
      estadoVisual: estadoCobrancaVisual(c.status, c.dataVencimento, config.toleranciaDias, agora),
    }));

  const totalDevido = cobrancas.reduce((soma, c) => soma + Number(c.valorDevido), 0);
  const totalPago = cobrancas.reduce((soma, c) => soma + Number(c.valorPago), 0);

  // "Dívida" != totalDevido - totalPago: essa conta soma o ano letivo INTEIRO, incluindo os meses
  // que gerarPropinasAnoLetivo pré-gera e ainda nem venceram (§pedido do cliente 2026-08-18, pagar
  // meses em avanço). O aluno lia "158.000 em dívida" quando só um mês estava mesmo atrasado — o
  // resto era o calendário do ano todo (§reportado 2026-09-08). Mesma regra de
  // verificarBloqueioAluno: só conta o que já venceu além da tolerância.
  const saldoEmDivida = cobrancas
    .filter((c) => c.status === "PENDENTE" && ehVencidoAlemDaTolerancia(c.dataVencimento, config.toleranciaDias, agora))
    .reduce((soma, c) => soma + (Number(c.valorDevido) - Number(c.valorPago)), 0);

  return { totalDevido, totalPago, saldoEmDivida, meses, multas };
}

export interface EmolumentoCatalogo {
  id: string;
  nome: string;
  descricao: string | null;
  valor: number;
}

/** Catálogo de emolumentos — só consulta pelo aluno; o pedido e o pagamento são presenciais na secretaria. */
export async function getCatalogoEmolumentos(soAtivos = true): Promise<EmolumentoCatalogo[]> {
  const emolumentos = await prisma.emolumento.findMany({
    where: soAtivos ? { ativo: true } : undefined,
    orderBy: { nome: "asc" },
  });
  return emolumentos.map((e) => ({ id: e.id, nome: e.nome, descricao: e.descricao, valor: Number(e.valor) }));
}

export interface EmolumentoPago {
  id: string;
  nome: string;
  valor: number;
  dataPagamento: Date;
  registadoPorNome: string | null;
}

/** Histórico de emolumentos pagos por um aluno — todas as linhas já nascem PAGO (sem fluxo de pedido). */
export async function getEmolumentosPagos(alunoId: string): Promise<EmolumentoPago[]> {
  const cobrancas = await prisma.cobranca.findMany({
    where: { alunoId, tipo: "EMOLUMENTO" },
    include: { registadoPor: true },
    orderBy: { dataPagamento: "desc" },
  });
  return cobrancas.map((c) => ({
    id: c.id,
    nome: c.descricao ?? "Emolumento",
    valor: Number(c.valorPago),
    dataPagamento: c.dataPagamento ?? c.createdAt,
    registadoPorNome: c.registadoPor?.name ?? null,
  }));
}
