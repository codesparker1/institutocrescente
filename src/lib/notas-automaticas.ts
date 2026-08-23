import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgora } from "@/lib/tempo";
import { calcularNotaFinal, extrairNotasPorEpoca, proximaEpocaPendente, EPOCA_PARA_CHAVE_NOTAS, type NotasCadeira } from "@/lib/avaliacao";
import type { Epoca } from "@/generated/prisma/client";

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Atribui 0 automático a quem devia ter feito uma época e o prazo de lançamento passou sem nota
 * (§4.3). Sem isto, um aluno que some depois do P1 fica parado para sempre em ADMITIDO_A_EXAME/
 * EM_RECURSO/EM_EXAME_ESPECIAL — nunca chega a REPROVADO, porque a cascata em calcularNotaFinal só
 * avança quando uma nota é lançada. É um 0 real, gravado na tabela Nota (`automatica: true` para
 * se distinguir de um 0 que o professor lançou de propósito) — não um valor fingido só no cálculo.
 *
 * Mesmo padrão preguiçoso de garantirCobrancasGeradas/garantirSuspensaoAutomatica: corre no máximo
 * uma vez por dia civil, reclamando o "turno" com um updateMany condicional. Sem cron.
 *
 * Cada aluno é avançado em cascata dentro da mesma corrida — se já passaram os prazos de Exame E
 * Recurso desde a última vez que este job correu, os dois 0s são atribuídos na mesma passagem, não
 * um por dia.
 */
export async function garantirNotasAutomaticasPorFalta(): Promise<void> {
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!config) return;

  const agora = await getAgora();
  if (config.ultimaVerificacaoNotasEm && inicioDoDia(config.ultimaVerificacaoNotasEm).getTime() === inicioDoDia(agora).getTime()) {
    return;
  }

  const reclamado = await prisma.configuracaoAcademica.updateMany({
    where: {
      id: "config",
      OR: [{ ultimaVerificacaoNotasEm: null }, { ultimaVerificacaoNotasEm: { lt: inicioDoDia(agora) } }],
    },
    data: { ultimaVerificacaoNotasEm: agora },
  });
  if (reclamado.count === 0) return;

  after(() => atribuirNotasAutomaticas(agora));
}

/**
 * Corre em `after()`, fora do request-response — ver o mesmo raciocínio em
 * garantirCobrancasGeradas (src/lib/financeiro.ts).
 */
async function atribuirNotasAutomaticas(agora: Date): Promise<void> {
  const avaliacoesVencidas = await prisma.avaliacao.findMany({
    where: { prazoLancamento: { lt: agora } },
    select: { turmaDisciplinaId: true },
    distinct: ["turmaDisciplinaId"],
  });
  if (avaliacoesVencidas.length === 0) return;

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { id: { in: avaliacoesVencidas.map((a) => a.turmaDisciplinaId) } },
    select: {
      avaliacoes: { select: { id: true, epoca: true, prazoLancamento: true } },
      inscricoes: {
        where: { ativa: true },
        select: {
          id: true,
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: true,
          notas: { select: { avaliacaoId: true, valor: true, avaliacao: { select: { epoca: true } } } },
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

      // Cascata dentro da mesma corrida: cada 0 atribuído pode desbloquear a época seguinte, que
      // por sua vez também pode já ter passado do prazo.
      for (let seguranca = 0; seguranca < 5; seguranca += 1) {
        const resultado = calcularNotaFinal(notasCadeira, {
          permiteDispensa: inscricao.permiteDispensaAplicada,
          notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
        });
        const proxima: Epoca | null = proximaEpocaPendente(notasCadeira, resultado.estado);
        if (!proxima) break;

        const avaliacaoProxima = avaliacaoPorEpoca.get(proxima);
        if (!avaliacaoProxima || avaliacaoProxima.prazoLancamento >= agora) break;

        novasNotas.push({ avaliacaoId: avaliacaoProxima.id, inscricaoCadeiraId: inscricao.id, valor: 0, automatica: true });
        notasCadeira = { ...notasCadeira, [EPOCA_PARA_CHAVE_NOTAS[proxima]]: 0 };
      }
    }
  }

  if (novasNotas.length > 0) {
    await prisma.nota.createMany({ data: novasNotas, skipDuplicates: true });
  }
}
