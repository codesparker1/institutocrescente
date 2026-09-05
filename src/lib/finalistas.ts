import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
// O estado vive em academico.ts, e nao aqui, para poder ser testado: este modulo e server-only, o
// que impede o corredor de testes (node:test/tsx) de o importar.
import { estadoDaMonografia, type EstadoFinalista } from "@/lib/academico";
import type { Periodo } from "@/generated/prisma/client";

export { ESTADO_FINALISTA_LABEL, type EstadoFinalista } from "@/lib/academico";

export interface FinalistaItem {
  alunoId: string;
  nome: string;
  numeroEstudante: string;
  curso: string;
  cursoNome: string;
  periodo: Periodo;
  anoCurricular: number;
  turmaId: string;
  estado: EstadoFinalista;
  /** null enquanto o pagamento não estiver confirmado — é a inscrição que não existe ainda. */
  inscricaoId: string | null;
  disciplinaNome: string | null;
  confirmadaEm: Date | null;
  confirmadaPorNome: string | null;
  orientadorId: string | null;
  orientadorNome: string | null;
  defesaData: Date | null;
  defesaSala: string | null;
  notaFinal: number | null;
}

export interface FiltrosFinalistas {
  curso?: string;
  periodo?: Periodo;
  estado?: EstadoFinalista;
  /** Nome ou nº de estudante, parcial e sem distinguir maiúsculas. */
  q?: string;
}

/**
 * Todos os alunos com matrícula ativa no ÚLTIMO ano do seu curso, no ano letivo dado, com o estado
 * da monografia de cada um.
 *
 * A origem é a matrícula e não a inscrição em monografia (como era até 2026-09-05): desde que a
 * monografia passou a depender da confirmação do pagamento, um finalista por pagar não tem
 * inscrição nenhuma — e desapareceria exatamente da lista onde o DAAC tem de o confirmar.
 */
export async function getFinalistas(anoLetivo: number, filtros: FiltrosFinalistas = {}): Promise<FinalistaItem[]> {
  const { curso, periodo, estado, q } = filtros;

  const cursos = await prisma.curso.findMany({ select: { id: true, nome: true, duracaoAnos: true } });
  if (cursos.length === 0) return [];

  // "Último ano" é por curso (duracaoAnos difere entre cursos), por isso não é um `anoCurricular:
  // N` fixo — é o par (curso, último ano) de cada um, em OR.
  const paresUltimoAno = cursos
    .filter((c) => (curso ? c.nome === curso : true))
    .map((c) => ({ cursoId: c.id, anoCurricular: c.duracaoAnos }));
  if (paresUltimoAno.length === 0) return [];

  const [matriculas, cadeirasMonografia] = await Promise.all([
    prisma.matricula.findMany({
      where: {
        status: "ATIVA",
        turma: { anoLetivo, OR: paresUltimoAno, ...(periodo ? { periodo } : {}) },
        ...(q
          ? {
              aluno: {
                OR: [
                  { nome: { contains: q, mode: "insensitive" as const } },
                  { numeroEstudante: { contains: q, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      include: {
        turma: { include: { curso: true } },
        aluno: {
          select: {
            id: true,
            nome: true,
            numeroEstudante: true,
            curso: true,
            inscricoes: {
              where: { ativa: true, eMonografiaAplicada: true },
              include: {
                orientador: { select: { id: true, nome: true } },
                monografiaConfirmadaPor: { select: { name: true } },
                notas: { include: { avaliacao: true } },
                turmaDisciplina: { select: { disciplina: { select: { nome: true } } } },
              },
            },
          },
        },
      },
      orderBy: { aluno: { nome: "asc" } },
    }),
    prisma.cadeiraCurricular.findMany({ where: { eMonografia: true }, select: { cursoId: true, anoCurricular: true } }),
  ]);

  // Nem todos os cursos exigem monografia. Sem esta cadeira no plano não há o que confirmar, e o
  // ecrã tem de dizer isso em vez de oferecer um botão que só devolveria erro.
  const cursosComMonografia = new Set(cadeirasMonografia.map((c) => `${c.cursoId}:${c.anoCurricular}`));

  const lista = matriculas.map((matricula): FinalistaItem => {
    const { aluno, turma } = matricula;
    const inscricao = aluno.inscricoes[0] ?? null;
    const temNoPlano = cursosComMonografia.has(`${turma.cursoId}:${turma.anoCurricular}`);

    const notaFinal = inscricao
      ? calcularNotaFinal(
          extrairNotasPorEpoca(inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }))),
          {
            permiteDispensa: inscricao.permiteDispensaAplicada,
            notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
            eMonografia: true,
          },
        ).notaFinal
      : null;

    return {
      alunoId: aluno.id,
      nome: aluno.nome,
      numeroEstudante: aluno.numeroEstudante,
      curso: aluno.curso,
      cursoNome: turma.curso.nome,
      periodo: turma.periodo,
      anoCurricular: turma.anoCurricular,
      turmaId: turma.id,
      estado: estadoDaMonografia(temNoPlano, inscricao, notaFinal),
      inscricaoId: inscricao?.id ?? null,
      disciplinaNome: inscricao?.turmaDisciplina.disciplina.nome ?? null,
      confirmadaEm: inscricao?.monografiaConfirmadaEm ?? null,
      confirmadaPorNome: inscricao?.monografiaConfirmadaPor?.name ?? null,
      orientadorId: inscricao?.orientadorId ?? null,
      orientadorNome: inscricao?.orientador?.nome ?? null,
      defesaData: inscricao?.defesaData ?? null,
      defesaSala: inscricao?.defesaSala ?? null,
      notaFinal,
    };
  });

  // Filtro por estado em memória, e não em SQL: o estado é derivado de quatro tabelas (inscrição,
  // orientador, defesa, nota) e exprimi-lo em `where` obrigaria a repetir a mesma regra num
  // segundo sítio, onde poderia divergir desta.
  return estado ? lista.filter((f) => f.estado === estado) : lista;
}
