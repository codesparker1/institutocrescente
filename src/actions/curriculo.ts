"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { requireGerirCurriculo } from "@/lib/permissions";

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
      include: { disciplina: true, cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } } },
    }),
    prisma.inscricaoCadeira.findMany({
      where: { alunoId: parsed.data.alunoId, cadeiraCurricularId: parsed.data.cadeiraCurricularId },
      orderBy: { tentativa: "desc" },
    }),
  ]);

  if (!aluno) return { error: "Aluno não encontrado." };
  if (!turmaDisciplina) return { error: "Turma-disciplina não encontrada." };
  if (turmaDisciplina.cadeiraCurricularId !== parsed.data.cadeiraCurricularId) {
    return { error: "Essa turma não lecciona a cadeira selecionada." };
  }

  const tentativaAtiva = tentativasAnteriores.find((t) => t.ativa);
  const proximaTentativa = (tentativasAnteriores[0]?.tentativa ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    if (tentativaAtiva) {
      await tx.inscricaoCadeira.update({ where: { id: tentativaAtiva.id }, data: { ativa: false } });
    }
    await tx.inscricaoCadeira.create({
      data: {
        alunoId: parsed.data.alunoId,
        cadeiraCurricularId: parsed.data.cadeiraCurricularId,
        turmaDisciplinaId: parsed.data.turmaDisciplinaId,
        tentativa: proximaTentativa,
        ativa: true,
        // Congelamento de regras (§4.1.1) — a regra de dispensa desta nova tentativa é a atual da
        // cadeira; a tentativa anterior mantém a regra que tinha quando foi criada.
        permiteDispensaAplicada: turmaDisciplina.cadeiraCurricular.permiteDispensa,
        notaMinimaDispensaAplicada: turmaDisciplina.cadeiraCurricular.notaMinimaDispensa,
      },
    });
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Inscreveu ${aluno.nome} na ${proximaTentativa}ª tentativa de ${turmaDisciplina.disciplina.nome} (repetição)`,
    entityType: "InscricaoCadeira",
    entityId: parsed.data.alunoId,
  });

  revalidatePath(`/alunos/${parsed.data.alunoId}`);
  revalidatePath("/notas");
  revalidatePath("/minhas-notas");
  revalidatePath("/horario");
  return {};
}
