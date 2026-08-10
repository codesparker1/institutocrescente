import "server-only";
import { prisma } from "@/lib/prisma";

export { mesReferenciaLabel } from "@/lib/utils";

async function getConfiguracaoFinanceira() {
  const config = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  return config ?? { bloqueioAtivo: false, toleranciaDias: 5 };
}

function ehVencidoAlemDaTolerancia(dataVencimento: Date, toleranciaDias: number, agora: Date): boolean {
  const limite = new Date(dataVencimento);
  limite.setDate(limite.getDate() + toleranciaDias);
  return agora > limite;
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
  const [config, propinasPendentes] = await Promise.all([
    getConfiguracaoFinanceira(),
    prisma.propina.findMany({
      where: { alunoId, status: "PENDENTE" },
      orderBy: { mesReferencia: "asc" },
    }),
  ]);

  const agora = new Date();
  const mesesPendentes: MesPendente[] = propinasPendentes.map((p) => ({
    propinaId: p.id,
    mesReferencia: p.mesReferencia,
    valorDevido: Number(p.valorDevido),
    valorPago: Number(p.valorPago),
    dataVencimento: p.dataVencimento,
  }));

  const saldoEmDivida = mesesPendentes.reduce((soma, m) => soma + (m.valorDevido - m.valorPago), 0);

  const temMesVencido = propinasPendentes.some((p) =>
    ehVencidoAlemDaTolerancia(p.dataVencimento, config.toleranciaDias, agora),
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
  valorEmDivida: number;
  mesesEmAtraso: number;
  antiguidadeDias: number;
}

/** Lista de devedores (requisito 3.3) — só considera dívidas além da tolerância configurada. */
export async function getListaDevedores(sort: "antiguidade" | "valor" = "antiguidade"): Promise<DevedorListItem[]> {
  const config = await getConfiguracaoFinanceira();
  const agora = new Date();

  const propinasPendentes = await prisma.propina.findMany({
    where: { status: "PENDENTE" },
    include: { aluno: true },
    orderBy: { mesReferencia: "asc" },
  });

  const vencidas = propinasPendentes.filter((p) =>
    ehVencidoAlemDaTolerancia(p.dataVencimento, config.toleranciaDias, agora),
  );

  const porAluno = new Map<string, DevedorListItem>();
  for (const p of vencidas) {
    const existente = porAluno.get(p.alunoId);
    const valor = Number(p.valorDevido) - Number(p.valorPago);
    const antiguidadeDias = Math.floor((agora.getTime() - p.dataVencimento.getTime()) / (1000 * 60 * 60 * 24));

    if (existente) {
      existente.valorEmDivida += valor;
      existente.mesesEmAtraso += 1;
      existente.antiguidadeDias = Math.max(existente.antiguidadeDias, antiguidadeDias);
    } else {
      porAluno.set(p.alunoId, {
        alunoId: p.alunoId,
        numeroEstudante: p.aluno.numeroEstudante,
        nome: p.aluno.nome,
        curso: p.aluno.curso,
        anoCurricular: p.aluno.anoCurricular,
        valorEmDivida: valor,
        mesesEmAtraso: 1,
        antiguidadeDias,
      });
    }
  }

  const lista = [...porAluno.values()];
  lista.sort((a, b) => (sort === "valor" ? b.valorEmDivida - a.valorEmDivida : b.antiguidadeDias - a.antiguidadeDias));
  return lista;
}

/** Mesma regra de dívida, aplicada a um conjunto de alunos — usada pelo filtro da lista de presença em PDF. */
export async function getConjuntoAlunosEmDivida(alunoIds: string[]): Promise<Set<string>> {
  if (alunoIds.length === 0) return new Set();

  const config = await getConfiguracaoFinanceira();
  if (!config.bloqueioAtivo) return new Set();

  const agora = new Date();
  const propinasPendentes = await prisma.propina.findMany({
    where: { alunoId: { in: alunoIds }, status: "PENDENTE" },
  });

  const emDivida = new Set<string>();
  for (const p of propinasPendentes) {
    if (ehVencidoAlemDaTolerancia(p.dataVencimento, config.toleranciaDias, agora)) {
      emDivida.add(p.alunoId);
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

export interface EstadoFinanceiroAluno {
  totalDevido: number;
  totalPago: number;
  saldoEmDivida: number;
  meses: PropinaMes[];
}

/** Histórico financeiro completo de um aluno — usado pela ficha do aluno e pela sua própria página financeira. */
export async function getEstadoFinanceiroAluno(alunoId: string): Promise<EstadoFinanceiroAluno> {
  const propinas = await prisma.propina.findMany({
    where: { alunoId },
    include: { registadoPor: true },
    orderBy: { mesReferencia: "asc" },
  });

  const meses: PropinaMes[] = propinas.map((p) => ({
    id: p.id,
    mesReferencia: p.mesReferencia,
    valorDevido: Number(p.valorDevido),
    valorPago: Number(p.valorPago),
    status: p.status,
    dataPagamento: p.dataPagamento,
    registadoPorNome: p.registadoPor?.name ?? null,
  }));

  const totalDevido = meses.reduce((soma, m) => soma + m.valorDevido, 0);
  const totalPago = meses.reduce((soma, m) => soma + m.valorPago, 0);

  return { totalDevido, totalPago, saldoEmDivida: totalDevido - totalPago, meses };
}
