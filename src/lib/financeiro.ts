import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CategoriaEstudante, Periodo } from "@/generated/prisma/client";
import { ehVencidoAlemDaTolerancia } from "@/lib/divida";
import { getAgora } from "@/lib/tempo";

export { mesReferenciaLabel } from "@/lib/utils";

const TIPOS_QUE_BLOQUEIAM = ["PROPINA", "MULTA"] as const;

async function getConfiguracaoFinanceira() {
  const config = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  return (
    config ?? {
      bloqueioAtivo: false,
      toleranciaDias: 0,
      diaVencimento: 10,
      valorMulta: 5000,
      ultimaGeracaoEm: null,
    }
  );
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Gera a propina do mês corrente (para matrículas ativas sem uma) e as multas devidas por
 * propinas vencidas além da tolerância (MD §2). Corre no máximo uma vez por dia civil: reclama
 * o "turno" com um updateMany condicional (0 linhas afetadas = outro request já tratou disto hoje).
 * Nunca cron horário — mataria o scale-to-zero do Neon.
 *
 * A geração pesada corre em `after()` (fora do request-response), não bloqueada no render do
 * dashboard. Só o claim (um updateMany rápido) é síncrono — evita que o primeiro pedido a seguir
 * a uma virada de dia fique preso atrás de um findMany+createMany sobre todas as matrículas
 * ativas, e liberta a ligação à BD do pool mais depressa sob concorrência (achado na simulação de
 * ano caótico: p99 em picos de tráfego batia sempre nos marcos com viragem de dia, nunca nos
 * outros, e em rotas diferentes — sinal de um custo partilhado no layout, não de N+1 na rota).
 */
export async function garantirCobrancasGeradas(): Promise<void> {
  const config = await getConfiguracaoFinanceira();
  const agora = getAgora();

  if (config.ultimaGeracaoEm && inicioDoDia(config.ultimaGeracaoEm).getTime() === inicioDoDia(agora).getTime()) {
    return;
  }

  const reclamado = await prisma.configuracaoFinanceira.updateMany({
    where: {
      id: "config",
      OR: [{ ultimaGeracaoEm: null }, { ultimaGeracaoEm: { lt: inicioDoDia(agora) } }],
    },
    data: { ultimaGeracaoEm: agora },
  });
  if (reclamado.count === 0) return;

  after(() => gerarCobrancasDoDia(agora, config.diaVencimento, config.toleranciaDias, Number(config.valorMulta)));
}

async function gerarCobrancasDoDia(agora: Date, diaVencimento: number, toleranciaDias: number, valorMulta: number): Promise<void> {
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const dataVencimentoMes = new Date(agora.getFullYear(), agora.getMonth(), diaVencimento);

  const matriculasAtivas = await prisma.matricula.findMany({
    where: { status: "ATIVA" },
    include: { turma: { include: { curso: true } } },
  });

  if (matriculasAtivas.length > 0) {
    await prisma.cobranca.createMany({
      data: matriculasAtivas.map((m) => ({
        matriculaId: m.id,
        alunoId: m.alunoId,
        tipo: "PROPINA" as const,
        mesReferencia: inicioMes,
        valorDevido: m.turma.curso.valorPropina,
        dataVencimento: dataVencimentoMes,
      })),
      skipDuplicates: true,
    });
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
  saldoEmDivida: number;
  mesesPendentes: MesPendente[];
}

/** Regra única de "em dívida" — usada pelo portão de bloqueio, pela lista de devedores e pelo filtro do PDF. */
export async function verificarBloqueioAluno(alunoId: string): Promise<EstadoBloqueioAluno> {
  const [config, cobrancasPendentes] = await Promise.all([
    getConfiguracaoFinanceira(),
    prisma.cobranca.findMany({
      where: { alunoId, status: "PENDENTE", tipo: { in: [...TIPOS_QUE_BLOQUEIAM] } },
      orderBy: { mesReferencia: "asc" },
    }),
  ]);

  const agora = getAgora();
  const mesesPendentes: MesPendente[] = cobrancasPendentes.map((c) => ({
    propinaId: c.id,
    mesReferencia: c.mesReferencia ?? c.dataVencimento,
    valorDevido: Number(c.valorDevido),
    valorPago: Number(c.valorPago),
    dataVencimento: c.dataVencimento,
  }));

  const saldoEmDivida = mesesPendentes.reduce((soma, m) => soma + (m.valorDevido - m.valorPago), 0);

  const temMesVencido = cobrancasPendentes.some((c) =>
    ehVencidoAlemDaTolerancia(c.dataVencimento, config.toleranciaDias, agora),
  );

  return {
    bloqueado: config.bloqueioAtivo && temMesVencido,
    saldoEmDivida,
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
  mesesEmAtraso: number;
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
  const agora = getAgora();

  // dataVencimento é sempre meia-noite do dia (garantirCobrancasGeradas), por isso a fronteira
  // exata de ehVencidoAlemDaTolerancia é expressável como uma data-limite fixa aqui, e o SQL
  // pode agregar por aluno diretamente (SUM/MIN/COUNT) em vez de trazer cada cobrança pendente
  // para agrupar em JS — achado pela corrida do cost-meter: sob 20 conexões concorrentes, cada
  // pedido segurava a ligação do pool tempo suficiente para o resto ficar em fila.
  const limite = new Date(agora.getTime() - (config.toleranciaDias + 1) * 24 * 60 * 60 * 1000);

  const whereBase = {
    status: "PENDENTE" as const,
    tipo: { in: [...TIPOS_QUE_BLOQUEIAM] },
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

  const grupos = await prisma.cobranca.groupBy({
    by: ["alunoId"],
    where: whereBase,
    _sum: { valorDevido: true, valorPago: true },
    _min: { dataVencimento: true },
    _count: { _all: true },
  });

  if (grupos.length === 0) return [];

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
      mesesEmAtraso: g._count._all,
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

  const agora = getAgora();
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
  valorDevido: number;
  valorPago: number;
  status: "PENDENTE" | "PAGO";
  dataPagamento: Date | null;
  registadoPorNome: string | null;
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
}

export interface EstadoFinanceiroAluno {
  totalDevido: number;
  totalPago: number;
  saldoEmDivida: number;
  meses: PropinaMes[];
  multas: CobrancaAvulsa[];
}

/** Histórico financeiro completo de um aluno — usado pela ficha do aluno e pela sua própria página financeira. */
export async function getEstadoFinanceiroAluno(alunoId: string): Promise<EstadoFinanceiroAluno> {
  const cobrancas = await prisma.cobranca.findMany({
    where: { alunoId, tipo: { in: [...TIPOS_QUE_BLOQUEIAM] } },
    include: { registadoPor: true },
    orderBy: { mesReferencia: "asc" },
  });

  const meses: PropinaMes[] = cobrancas
    .filter((c) => c.tipo === "PROPINA")
    .map((c) => ({
      id: c.id,
      mesReferencia: c.mesReferencia!,
      valorDevido: Number(c.valorDevido),
      valorPago: Number(c.valorPago),
      status: c.status,
      dataPagamento: c.dataPagamento,
      registadoPorNome: c.registadoPor?.name ?? null,
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
    }));

  const totalDevido = cobrancas.reduce((soma, c) => soma + Number(c.valorDevido), 0);
  const totalPago = cobrancas.reduce((soma, c) => soma + Number(c.valorPago), 0);

  return { totalDevido, totalPago, saldoEmDivida: totalDevido - totalPago, meses, multas };
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
