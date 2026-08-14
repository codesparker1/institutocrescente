"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { podeLancarNota } from "@/lib/permissions";

const LancarNotaSchema = z.object({
  avaliacaoId: z.string().min(1),
  inscricaoCadeiraId: z.string().min(1),
  valor: z.coerce.number().min(0).max(20),
});

export interface LancarNotaState {
  error?: string;
}

export async function lancarNotaAction(_prevState: LancarNotaState, formData: FormData): Promise<LancarNotaState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = LancarNotaSchema.safeParse({
    avaliacaoId: formData.get("avaliacaoId"),
    inscricaoCadeiraId: formData.get("inscricaoCadeiraId"),
    valor: formData.get("valor"),
  });

  if (!parsed.success) {
    return { error: "Valor de nota inválido (use 0 a 20)." };
  }

  // A turma-disciplina é derivada da avaliação lida na BD, nunca de campos enviados pelo cliente —
  // evita que um professor lance notas fora da sua turma submetendo um avaliacaoId de outra disciplina.
  const avaliacao = await prisma.avaliacao.findUnique({
    where: { id: parsed.data.avaliacaoId },
    include: { turmaDisciplina: true },
  });
  if (!avaliacao) {
    return { error: "Avaliação não encontrada." };
  }
  // DAAC lança qualquer nota, a qualquer momento; PROFESSOR só as suas próprias disciplinas.
  // ADMIN e SECRETARIA não lançam notas — decisão deliberada (MD §3), dá integridade ao sistema.
  if (!podeLancarNota(session.user, avaliacao.turmaDisciplina)) {
    return { error: "Sem permissão para lançar notas nesta disciplina." };
  }

  // A inscrição tem de estar ativa e pertencer a esta turma-disciplina — cobre repetentes,
  // cuja InscricaoCadeira pode apontar para uma TurmaDisciplina de uma Turma diferente (§4.2).
  const inscricao = await prisma.inscricaoCadeira.findFirst({
    where: { id: parsed.data.inscricaoCadeiraId, turmaDisciplinaId: avaliacao.turmaDisciplinaId, ativa: true },
  });
  if (!inscricao) {
    return { error: "Aluno não está inscrito nesta disciplina." };
  }

  const notaExistente = await prisma.nota.findUnique({
    where: {
      avaliacaoId_inscricaoCadeiraId: {
        avaliacaoId: parsed.data.avaliacaoId,
        inscricaoCadeiraId: parsed.data.inscricaoCadeiraId,
      },
    },
  });

  const nota = await prisma.nota.upsert({
    where: {
      avaliacaoId_inscricaoCadeiraId: {
        avaliacaoId: parsed.data.avaliacaoId,
        inscricaoCadeiraId: parsed.data.inscricaoCadeiraId,
      },
    },
    create: {
      avaliacaoId: parsed.data.avaliacaoId,
      inscricaoCadeiraId: parsed.data.inscricaoCadeiraId,
      valor: parsed.data.valor,
    },
    update: { valor: parsed.data.valor },
    include: { inscricaoCadeira: { include: { aluno: true } }, avaliacao: true },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: notaExistente
      ? `Atualizou a nota de ${nota.inscricaoCadeira.aluno.nome} em "${nota.avaliacao.nome}" para ${parsed.data.valor}`
      : `Lançou a nota de ${nota.inscricaoCadeira.aluno.nome} em "${nota.avaliacao.nome}": ${parsed.data.valor}`,
    entityType: "Nota",
    entityId: nota.id,
  });

  revalidatePath(`/notas`);
  revalidatePath(`/professor`);
  return {};
}
