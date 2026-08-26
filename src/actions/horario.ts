"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { isForeignKeyViolation } from "@/lib/prisma-errors";
import { requireGerirCurriculo, type SessionComUser } from "@/lib/permissions";
import { EPOCA_LABEL, diasPrazoParaEpoca } from "@/lib/avaliacao";
import { HORA_REGEX, encontrarConflito, type SlotExistente } from "@/lib/horario";
import { fromIsoDate } from "@/lib/utils";

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

const HorarioSlotSchema = z
  .object({
    turmaDisciplinaId: z.string().min(1, "Disciplina é obrigatória"),
    diaSemana: z.enum(["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"], { message: "Dia inválido" }),
    horaInicio: z.string().regex(HORA_REGEX, "Hora de início inválida (use HH:MM)"),
    horaFim: z.string().regex(HORA_REGEX, "Hora de fim inválida (use HH:MM)"),
    sala: z.string().min(1, "Sala é obrigatória"),
  })
  .refine((v) => v.horaFim > v.horaInicio, {
    message: "A hora de fim tem de ser depois da hora de início",
    path: ["horaFim"],
  });

const CAMPOS_HORARIO_SLOT = ["turmaDisciplinaId", "diaSemana", "horaInicio", "horaFim", "sala"] as const;
export type CreateHorarioSlotState = FormState<Record<(typeof CAMPOS_HORARIO_SLOT)[number], string>>;

const CONFLITO_LABEL: Record<"professor" | "sala" | "turma", string> = {
  professor: "O professor já tem outra aula marcada neste horário",
  sala: "Esta sala já está ocupada neste horário",
  turma: "Esta turma já tem outra disciplina marcada neste horário",
};

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

  const alvo = await prisma.turmaDisciplina.findUnique({
    where: { id: parsed.data.turmaDisciplinaId },
    select: { professorId: true, turmaId: true },
  });
  if (!alvo) {
    return {
      fieldErrors: { turmaDisciplinaId: "Disciplina inválida." },
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

  // Nada impedia até aqui um professor, sala ou turma ficarem com dois horários sobrepostos no
  // mesmo dia — comb da simulação encontrou isto antes de a simulação sequer correr. Só compara
  // slots do mesmo dia (o resto não pode conflituar por definição).
  const candidatos = await prisma.horarioSlot.findMany({
    where: { diaSemana: parsed.data.diaSemana },
    include: { turmaDisciplina: { include: { disciplina: true } } },
  });
  const existentes: SlotExistente[] = candidatos.map((s) => ({
    id: s.id,
    diaSemana: s.diaSemana,
    horaInicio: s.horaInicio,
    horaFim: s.horaFim,
    sala: s.sala,
    professorId: s.turmaDisciplina.professorId,
    turmaId: s.turmaDisciplina.turmaId,
    disciplinaNome: s.turmaDisciplina.disciplina.nome,
  }));
  const conflito = encontrarConflito(
    {
      diaSemana: parsed.data.diaSemana,
      horaInicio: parsed.data.horaInicio,
      horaFim: parsed.data.horaFim,
      sala: parsed.data.sala,
      professorId: alvo.professorId,
      turmaId: alvo.turmaId,
    },
    existentes,
  );
  if (conflito) {
    return {
      error: `${CONFLITO_LABEL[conflito.tipo]} (${conflito.slot.disciplinaNome}, ${conflito.slot.horaInicio}–${conflito.slot.horaFim}).`,
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

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
  epoca: z.enum(["P1", "P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"], { message: "Época inválida" }),
  data: z.string().min(1, "Data é obrigatória"),
  sala: z.string().min(1, "Sala é obrigatória"),
});

const CAMPOS_PROVA = ["turmaDisciplinaId", "epoca", "data", "sala"] as const;
export type CreateProvaState = FormState<Record<(typeof CAMPOS_PROVA)[number], string>>;

export async function createProvaAction(
  _prevState: CreateProvaState,
  formData: FormData,
): Promise<CreateProvaState> {
  const session = await requireGerirCurriculo();
  const parsed = ProvaSchema.safeParse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    epoca: formData.get("epoca"),
    data: formData.get("data"),
    sala: formData.get("sala"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_PROVA);

  // fromIsoDate, não new Date(): ver nota em lib/utils — a forma só-data é meia-noite UTC, mas
  // toIsoDate/getDate leem em hora local, e o par perdia um dia a oeste de Greenwich.
  const dataProva = fromIsoDate(parsed.data.data);
  if (!dataProva) {
    return {
      fieldErrors: { data: "Data inválida" },
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }

  const config = await prisma.configuracaoAcademica.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  const dias = diasPrazoParaEpoca(config, parsed.data.epoca);
  const prazoLancamento = new Date(dataProva.getFullYear(), dataProva.getMonth(), dataProva.getDate() + dias);

  try {
    const prova = await prisma.avaliacao.create({
      data: {
        turmaDisciplinaId: parsed.data.turmaDisciplinaId,
        epoca: parsed.data.epoca,
        sala: parsed.data.sala,
        data: dataProva,
        prazoLancamento,
      },
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(
      session,
      `Agendou "${EPOCA_LABEL[prova.epoca]}" para ${prova.turmaDisciplina.disciplina.nome}`,
      "Avaliacao",
      prova.id,
    );
  } catch {
    return {
      error: "Não foi possível agendar a prova (pode já existir uma avaliação desta época para esta disciplina).",
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
    await audit(session, `Removeu "${EPOCA_LABEL[prova.epoca]}" de ${prova.turmaDisciplina.disciplina.nome}`, "Avaliacao", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: já existem notas lançadas para esta avaliação.");
    }
    throw error;
  }
  revalidatePath("/horario");
}
