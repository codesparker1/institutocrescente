"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

async function requireDocente() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA", "PROFESSOR"].includes(session.user.role)) {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

const ToggleFrequenciaSchema = z.object({
  frequenciaId: z.string().min(1),
});

export async function toggleFrequenciaAction(formData: FormData) {
  const session = await requireDocente();
  const { frequenciaId } = ToggleFrequenciaSchema.parse({
    frequenciaId: formData.get("frequenciaId"),
  });

  const frequencia = await prisma.frequencia.findUnique({
    where: { id: frequenciaId },
    include: {
      matricula: { include: { aluno: true } },
      aula: { include: { turmaDisciplina: true } },
    },
  });
  if (!frequencia) throw new Error("Registo de frequência não encontrado.");

  if (session.user.role === "PROFESSOR" && frequencia.aula.turmaDisciplina.professorId !== session.user.professorId) {
    throw new Error("Só pode marcar presença nas suas próprias disciplinas.");
  }

  const novoEstado = !frequencia.presente;
  await prisma.frequencia.update({
    where: { id: frequenciaId },
    data: { presente: novoEstado, justificada: novoEstado ? null : frequencia.justificada },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: novoEstado
      ? `Marcou ${frequencia.matricula.aluno.nome} como presente (de não presente para presente)`
      : `Marcou ${frequencia.matricula.aluno.nome} como não presente (de presente para não presente)`,
    entityType: "Frequencia",
    entityId: frequencia.id,
  });

  revalidatePath("/notas");
  revalidatePath("/professor");
}

const CreateAulaSchema = z.object({
  turmaDisciplinaId: z.string().min(1),
  data: z.string().min(1),
  tema: z.string().optional(),
});

export async function createAulaAction(formData: FormData) {
  const session = await requireDocente();
  const parsed = CreateAulaSchema.parse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    data: formData.get("data"),
    tema: formData.get("tema") || undefined,
  });

  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: parsed.turmaDisciplinaId },
    include: { disciplina: true, turma: { include: { matriculas: true } }, horarioSlots: true },
  });
  if (!turmaDisciplina) throw new Error("Disciplina não encontrada.");
  if (session.user.role === "PROFESSOR" && turmaDisciplina.professorId !== session.user.professorId) {
    throw new Error("Só pode criar aulas nas suas próprias disciplinas.");
  }

  const JS_DAY_TO_DIA_SEMANA = ["DOMINGO", "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"];
  const diaEscolhido = JS_DAY_TO_DIA_SEMANA[new Date(`${parsed.data}T00:00:00`).getDay()];
  const diasLetivos = new Set<string>(turmaDisciplina.horarioSlots.map((s) => s.diaSemana));
  if (!diasLetivos.has(diaEscolhido)) {
    throw new Error("A data escolhida não corresponde a um dia letivo desta disciplina.");
  }

  const aula = await prisma.aula.create({
    data: {
      turmaDisciplinaId: parsed.turmaDisciplinaId,
      data: new Date(parsed.data),
      tema: parsed.tema ?? null,
    },
  });

  await prisma.frequencia.createMany({
    data: turmaDisciplina.turma.matriculas.map((matricula) => ({
      aulaId: aula.id,
      matriculaId: matricula.id,
      presente: false,
    })),
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Criou uma aula de ${turmaDisciplina.disciplina.nome} em ${parsed.data}`,
    entityType: "Aula",
    entityId: aula.id,
  });

  revalidatePath("/notas");
  revalidatePath("/professor");
}
