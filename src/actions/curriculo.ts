"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { requireGerirCurriculo } from "@/lib/permissions";
import { backfillFrequenciasParaInscricoes } from "@/lib/curriculo";
import { recalcularAgravamentoPendentes } from "@/lib/financeiro";
import { getAgora } from "@/lib/tempo";

const CriarTentativaRepeticaoSchema = z.object({
  alunoId: z.string().min(1),
  cadeiraCurricularId: z.string().min(1),
  turmaDisciplinaId: z.string().min(1),
});

export interface CriarTentativaRepeticaoState {
  error?: string;
}

/**
 * Inscreve um aluno numa nova tentativa de uma cadeira que já cursou (repetição, §4.2). Não há
 * deteção automática de reprovação nesta fase (isso é da Fase 6, motor de notas) — a decisão é
 * sempre manual, tomada pela secretaria/DAAC. A tentativa anterior fica intacta e desativada;
 * as notas/frequências antigas não são apagadas.
 */
export async function criarTentativaRepeticaoAction(
  _prevState: CriarTentativaRepeticaoState,
  formData: FormData,
): Promise<CriarTentativaRepeticaoState> {
  const session = await requireGerirCurriculo();
  const parsed = CriarTentativaRepeticaoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    cadeiraCurricularId: formData.get("cadeiraCurricularId"),
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const [aluno, turmaDisciplina, tentativasAnteriores] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: parsed.data.alunoId } }),
    prisma.turmaDisciplina.findUnique({
      where: { id: parsed.data.turmaDisciplinaId },
      include: { disciplina: true, cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true, eMonografia: true, semestre: true } } },
    }),
    prisma.inscricaoCadeira.findMany({
      where: { alunoId: parsed.data.alunoId, cadeiraCurricularId: parsed.data.cadeiraCurricularId },
      orderBy: { tentativa: "desc" },
    }),
  ]);

  if (!aluno) return { error: "Aluno não encontrado." };
  if (aluno.status !== "ATIVO") {
    return { error: "Aluno não está ativo — reative-o pela rematrícula antes de inscrever numa nova tentativa." };
  }
  if (!turmaDisciplina) return { error: "Turma-disciplina não encontrada." };
  if (turmaDisciplina.cadeiraCurricularId !== parsed.data.cadeiraCurricularId) {
    return { error: "Essa turma não lecciona a cadeira selecionada." };
  }
  // A monografia tem um caminho próprio (§pedido do cliente 2026-09-05) — depende da confirmação do
  // pagamento, que este ecrã não faz. Inscrever por aqui contornaria essa condição em silêncio.
  if (turmaDisciplina.cadeiraCurricular.eMonografia) {
    return {
      error: "A monografia não se inscreve por aqui — é atribuída em Finalistas, depois de confirmado o pagamento.",
    };
  }

  const tentativaAtiva = tentativasAnteriores.find((t) => t.ativa);
  const proximaTentativa = (tentativasAnteriores[0]?.tentativa ?? 0) + 1;

  // Esta cadeira já contava para o agravamento por repetição, ou é nova a entrar na conta agora?
  // Se já havia uma tentativa ATIVA com tentativa > 1, já era uma repetição antes desta ação — só
  // se está a corrigir a turma de destino, não a acrescentar mais uma cadeira à lista. Só conta
  // como nova quando a tentativa ativa anterior era a 1ª (a cadeira estava a ser cursada pela
  // primeira vez) ou não havia nenhuma (§reportado 2026-09-09: "quero que atualize para o aluno já
  // existe" — inscrever por aqui nunca tinha mexido em Aluno.cadeirasReprovadasAnoAnterior, por
  // isso a mensalidade de quem repetia só por este formulário nunca via o agravamento).
  const cadeiraJaContava = tentativaAtiva !== undefined && tentativaAtiva.tentativa > 1;
  const eSemestre2 = turmaDisciplina.cadeiraCurricular.semestre === 2;

  const novaInscricao = await prisma.$transaction(async (tx) => {
    if (tentativaAtiva) {
      await tx.inscricaoCadeira.update({ where: { id: tentativaAtiva.id }, data: { ativa: false } });
    }
    const inscricao = await tx.inscricaoCadeira.create({
      data: {
        alunoId: parsed.data.alunoId,
        cadeiraCurricularId: parsed.data.cadeiraCurricularId,
        turmaDisciplinaId: parsed.data.turmaDisciplinaId,
        tentativa: proximaTentativa,
        ativa: true,
        // Congelamento de regras (§4.1.1) — a regra de dispensa desta nova tentativa é a atual da
        // cadeira; a tentativa anterior mantém a regra que tinha quando foi criada.
        permiteDispensaAplicada: turmaDisciplina.cadeiraCurricular.permiteDispensa,
        eMonografiaAplicada: turmaDisciplina.cadeiraCurricular.eMonografia,
        notaMinimaDispensaAplicada: turmaDisciplina.cadeiraCurricular.notaMinimaDispensa,
      },
    });
    if (!cadeiraJaContava) {
      await tx.aluno.update({
        where: { id: parsed.data.alunoId },
        data: {
          cadeirasReprovadasAnoAnterior: { increment: 1 },
          ...(eSemestre2 ? { cadeirasReprovadasSemestre2AnoAnterior: { increment: 1 } } : {}),
        },
      });
    }
    return inscricao;
  });

  // O aluno entra a meio do ano na disciplina de destino — sem isto fica invisível na marcação de
  // presença das aulas já dadas, apesar de já aparecer na pauta (roster por InscricaoCadeira).
  await backfillFrequenciasParaInscricoes([{ id: novaInscricao.id, turmaDisciplinaId: novaInscricao.turmaDisciplinaId }]);

  // Reflete já na mensalidade ainda por vencer — mesmo princípio de atualizarPercentagemAgravamentoAction
  // (§pedido do cliente 2026-09-09: ver a mudança sem esperar pela rematrícula seguinte).
  const mensalidadesAtualizadas = cadeiraJaContava ? 0 : await recalcularAgravamentoPendentes(await getAgora());

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action:
      `Inscreveu ${aluno.nome} na ${proximaTentativa}ª tentativa de ${turmaDisciplina.disciplina.nome} (repetição)` +
      (mensalidadesAtualizadas > 0 ? ` — ${mensalidadesAtualizadas} mensalidade(s) por vencer recalculada(s)` : ""),
    entityType: "InscricaoCadeira",
    entityId: parsed.data.alunoId,
  });

  revalidatePath(`/alunos/${parsed.data.alunoId}`);
  revalidatePath("/notas");
  revalidatePath("/minhas-notas");
  revalidatePath("/horario");
  return {};
}
