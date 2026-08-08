"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

const LancarNotaSchema = z.object({
  avaliacaoId: z.string().min(1),
  matriculaId: z.string().min(1),
  valor: z.coerce.number().min(0).max(20),
  turmaDisciplinaId: z.string().min(1),
});

export interface LancarNotaState {
  error?: string;
}

export async function lancarNotaAction(_prevState: LancarNotaState, formData: FormData): Promise<LancarNotaState> {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA", "PROFESSOR"].includes(session.user.role)) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = LancarNotaSchema.safeParse({
    avaliacaoId: formData.get("avaliacaoId"),
    matriculaId: formData.get("matriculaId"),
    valor: formData.get("valor"),
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
  });

  if (!parsed.success) {
    return { error: "Valor de nota inválido (use 0 a 20)." };
  }

  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: parsed.data.turmaDisciplinaId },
  });
  if (!turmaDisciplina) {
    return { error: "Disciplina não encontrada." };
  }
  if (session.user.role === "PROFESSOR" && turmaDisciplina.professorId !== session.user.professorId) {
    return { error: "Só pode lançar notas nas suas próprias disciplinas." };
  }

  const notaExistente = await prisma.nota.findUnique({
    where: {
      avaliacaoId_matriculaId: {
        avaliacaoId: parsed.data.avaliacaoId,
        matriculaId: parsed.data.matriculaId,
      },
    },
  });

  const nota = await prisma.nota.upsert({
    where: {
      avaliacaoId_matriculaId: {
        avaliacaoId: parsed.data.avaliacaoId,
        matriculaId: parsed.data.matriculaId,
      },
    },
    create: {
      avaliacaoId: parsed.data.avaliacaoId,
      matriculaId: parsed.data.matriculaId,
      valor: parsed.data.valor,
    },
    update: { valor: parsed.data.valor },
    include: { matricula: { include: { aluno: true } }, avaliacao: true },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: notaExistente
      ? `Atualizou a nota de ${nota.matricula.aluno.nome} em "${nota.avaliacao.nome}" para ${parsed.data.valor}`
      : `Lançou a nota de ${nota.matricula.aluno.nome} em "${nota.avaliacao.nome}": ${parsed.data.valor}`,
    entityType: "Nota",
    entityId: nota.id,
  });

  revalidatePath(`/notas`);
  revalidatePath(`/professor`);
  return {};
}
