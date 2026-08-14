"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { isForeignKeyViolation } from "@/lib/prisma-errors";
import { requireGerirCurriculo, type SessionComUser } from "@/lib/permissions";

async function audit(session: SessionComUser, action: string, entityType: string, entityId?: string) {
  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action,
    entityType,
    entityId,
  });
}

const HorarioSlotSchema = z.object({
  turmaDisciplinaId: z.string().min(1, "Disciplina é obrigatória"),
  diaSemana: z.enum(["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"], { message: "Dia inválido" }),
  horaInicio: z.string().min(4, "Hora de início é obrigatória"),
  horaFim: z.string().min(4, "Hora de fim é obrigatória"),
  sala: z.string().min(1, "Sala é obrigatória"),
});

const CAMPOS_HORARIO_SLOT = ["turmaDisciplinaId", "diaSemana", "horaInicio", "horaFim", "sala"] as const;
export type CreateHorarioSlotState = FormState<Record<(typeof CAMPOS_HORARIO_SLOT)[number], string>>;

export async function createHorarioSlotAction(
  _prevState: CreateHorarioSlotState,
  formData: FormData,
): Promise<CreateHorarioSlotState> {
  const session = await requireGerirCurriculo();
  const parsed = HorarioSlotSchema.safeParse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    diaSemana: formData.get("diaSemana"),
    horaInicio: formData.get("horaInicio"),
    horaFim: formData.get("horaFim"),
    sala: formData.get("sala"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_HORARIO_SLOT);

  try {
    const slot = await prisma.horarioSlot.create({
      data: parsed.data,
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(
      session,
      `Adicionou horário de aula para ${slot.turmaDisciplina.disciplina.nome}`,
      "HorarioSlot",
      slot.id,
    );
  } catch {
    return {
      error: "Não foi possível adicionar o horário.",
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

  revalidatePath("/horario");
  return {};
}

export async function deleteHorarioSlotAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  const slot = await prisma.horarioSlot.delete({
    where: { id },
    include: { turmaDisciplina: { include: { disciplina: true } } },
  });
  await audit(session, `Removeu horário de aula de ${slot.turmaDisciplina.disciplina.nome}`, "HorarioSlot", id);
  revalidatePath("/horario");
}

const ProvaSchema = z.object({
  turmaDisciplinaId: z.string().min(1, "Disciplina é obrigatória"),
  nome: z.string().min(2, "Nome é obrigatório"),
  tipo: z.enum(["TESTE", "TRABALHO", "EXAME_FINAL"], { message: "Tipo inválido" }),
  data: z.string().min(1, "Data é obrigatória"),
  sala: z.string().min(1, "Sala é obrigatória"),
  peso: z.coerce.number("Indique o peso").min(0, "Peso entre 0 e 1").max(1, "Peso entre 0 e 1"),
});

const CAMPOS_PROVA = ["turmaDisciplinaId", "nome", "tipo", "data", "sala", "peso"] as const;
export type CreateProvaState = FormState<Record<(typeof CAMPOS_PROVA)[number], string>>;

export async function createProvaAction(
  _prevState: CreateProvaState,
  formData: FormData,
): Promise<CreateProvaState> {
  const session = await requireGerirCurriculo();
  const parsed = ProvaSchema.safeParse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    nome: formData.get("nome"),
    tipo: formData.get("tipo"),
    data: formData.get("data"),
    sala: formData.get("sala"),
    peso: formData.get("peso"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_PROVA);

  const dataProva = new Date(parsed.data.data);
  if (Number.isNaN(dataProva.getTime())) {
    return {
      fieldErrors: { data: "Data inválida" },
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }

  try {
    const prova = await prisma.avaliacao.create({
      data: { ...parsed.data, data: dataProva },
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(session, `Agendou "${prova.nome}" para ${prova.turmaDisciplina.disciplina.nome}`, "Avaliacao", prova.id);
  } catch {
    return {
      error: "Não foi possível agendar a prova.",
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }

  revalidatePath("/horario");
  return {};
}

export async function deleteProvaAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  try {
    const prova = await prisma.avaliacao.delete({
      where: { id },
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(session, `Removeu "${prova.nome}" de ${prova.turmaDisciplina.disciplina.nome}`, "Avaliacao", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: já existem notas lançadas para esta avaliação.");
    }
    throw error;
  }
  revalidatePath("/horario");
}
