import "server-only";
import { prisma } from "@/lib/prisma";
import {
  calcularNotaFinal,
  extrairNotasPorEpoca,
  proximaEpocaPendente,
  EPOCA_PARA_CHAVE_NOTAS,
  type NotasCadeira,
} from "@/lib/avaliacao";
import type { Epoca } from "@/generated/prisma/client";

/**
 * Fecha as cadeiras de um semestre que ficaram por concluir, atribuindo 0 às épocas em falta
 * (§decisão do cliente 2026-08-31).
 *
 * Porquê: enquanto o semestre corre, uma cadeira com P1 lançado e P2 por lançar está legitimamente
 * "Em curso". Quando o semestre acaba, esse "Em curso" passa a ser mentira — já não vai entrar mais
 * nota nenhuma, e a cadeira ficaria nesse estado para sempre. calcularNotaFinal só faz a cascata
 * avançar quando há nota, por isso sem um 0 real gravado o aluno nunca chega a REPROVADO.
 *
 * É o mesmo mecanismo de garantirNotasAutomaticasPorFalta (notas-automaticas.ts), mas disparado
 * pelo fim do semestre em vez do prazo de lançamento: aquele exige que a época esteja agendada e o
 * prazo tenha passado, e uma época que nunca chegou a ser agendada nunca lá cairia.
 *
 * O 0 fica com `automatica: true`, como os outros — é o que permite distingui-lo, na pauta e no
 * histórico, de um 0 que o professor lançou de propósito.
 *
 * Devolve quantas notas foram atribuídas.
 */
export async function fecharSemestre(anoLetivo: number, semestre: number): Promise<number> {
  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { semestre, turma: { anoLetivo } },
    select: {
      id: true,
      avaliacoes: { select: { id: true, epoca: true } },
      inscricoes: {
        where: { ativa: true },
        select: {
          id: true,
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: true,
          notas: { select: { valor: true, avaliacao: { select: { epoca: true } } } },
        },
      },
    },
  });

  const novasNotas: { avaliacaoId: string; inscricaoCadeiraId: string; valor: number; automatica: boolean }[] = [];

  for (const turmaDisciplina of turmaDisciplinas) {
    const avaliacaoPorEpoca = new Map(turmaDisciplina.avaliacoes.map((a) => [a.epoca, a]));

    for (const inscricao of turmaDisciplina.inscricoes) {
      let notasCadeira: NotasCadeira = extrairNotasPorEpoca(
        inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })),
      );

      // Cascata até a cadeira ficar decidida: cada 0 pode desbloquear a época seguinte (um 0 no P2
      // fecha a frequência, o que abre o Exame, e por aí). O limite de 5 é o número de épocas.
      for (let seguranca = 0; seguranca < 5; seguranca += 1) {
        const resultado = calcularNotaFinal(notasCadeira, {
          permiteDispensa: inscricao.permiteDispensaAplicada,
          notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
        });
        const proxima: Epoca | null = proximaEpocaPendente(notasCadeira, resultado.estado);
        if (!proxima) break;

        // Só se pode gravar uma Nota contra uma Avaliacao que exista. Uma época que a turma nunca
        // agendou não tem onde pendurar o 0 — a cadeira fica por fechar e aparece no relatório de
        // quem ficou de fora, em vez de falhar em silêncio.
        const avaliacao = avaliacaoPorEpoca.get(proxima);
        if (!avaliacao) break;

        novasNotas.push({ avaliacaoId: avaliacao.id, inscricaoCadeiraId: inscricao.id, valor: 0, automatica: true });
        notasCadeira = { ...notasCadeira, [EPOCA_PARA_CHAVE_NOTAS[proxima]]: 0 };
      }
    }
  }

  if (novasNotas.length === 0) return 0;
  const gravadas = await prisma.nota.createMany({ data: novasNotas, skipDuplicates: true });
  return gravadas.count;
}

/**
 * Quantas cadeiras o fecho vai tocar — contado ANTES de fechar, para o aviso de confirmação poder
 * dizer números em vez de o DAAC só descobrir depois de a mudança já ser irreversível. Mesma
 * travessia de fecharSemestre, sem gravar nada.
 *
 * `porFechar`: têm uma época pendente e vão levar 0.
 * `semAvaliacaoAgendada`: dessas, as que ficam na mesma por fechar — a época em falta nunca chegou
 * a ser agendada, e sem Avaliacao não há onde gravar a Nota.
 */
export async function contarFechoSemestre(
  anoLetivo: number,
  semestre: number,
): Promise<{ porFechar: number; semAvaliacaoAgendada: number }> {
  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { semestre, turma: { anoLetivo } },
    select: {
      avaliacoes: { select: { epoca: true } },
      inscricoes: {
        where: { ativa: true },
        select: {
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: true,
          notas: { select: { valor: true, avaliacao: { select: { epoca: true } } } },
        },
      },
    },
  });

  let porFechar = 0;
  let semAvaliacaoAgendada = 0;
  for (const turmaDisciplina of turmaDisciplinas) {
    const epocasAgendadas = new Set(turmaDisciplina.avaliacoes.map((a) => a.epoca));
    for (const inscricao of turmaDisciplina.inscricoes) {
      const notasCadeira = extrairNotasPorEpoca(
        inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })),
      );
      const resultado = calcularNotaFinal(notasCadeira, {
        permiteDispensa: inscricao.permiteDispensaAplicada,
        notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
      });
      const proxima = proximaEpocaPendente(notasCadeira, resultado.estado);
      if (!proxima) continue;
      porFechar += 1;
      if (!epocasAgendadas.has(proxima)) semAvaliacaoAgendada += 1;
    }
  }
  return { porFechar, semAvaliacaoAgendada };
}
