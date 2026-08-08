"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

async function audit(
  session: Awaited<ReturnType<typeof requireAdmin>>,
  action: string,
  entityType: string,
  entityId?: string,
) {
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
  turmaId: z.string().min(1),
  diaSemana: z.enum(["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"]),
  horaInicio: z.string().min(4),
  horaFim: z.string().min(4),
  sala: z.string().min(1),
});

export async function createHorarioSlotAction(formData: FormData) {
  const session = await requireAdmin();
  const data = HorarioSlotSchema.parse({
    turmaId: formData.get("turmaId"),
    diaSemana: formData.get("diaSemana"),
    horaInicio: formData.get("horaInicio"),
    horaFim: formData.get("horaFim"),
    sala: formData.get("sala"),
  });
  const slot = await prisma.horarioSlot.create({ data, include: { turma: true } });
  await audit(session, `Adicionou horário de aula para ${slot.turma.nome}`, "HorarioSlot", slot.id);
  revalidatePath("/horario");
}

export async function deleteHorarioSlotAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const slot = await prisma.horarioSlot.delete({ where: { id }, include: { turma: true } });
  await audit(session, `Removeu horário de aula de ${slot.turma.nome}`, "HorarioSlot", id);
  revalidatePath("/horario");
}

const ProvaSchema = z.object({
  turmaId: z.string().min(1),
  nome: z.string().min(2),
  tipo: z.enum(["TESTE", "TRABALHO", "EXAME_FINAL"]),
  data: z.string().min(1),
  sala: z.string().min(1),
  peso: z.coerce.number().min(0).max(1),
});

export async function createProvaAction(formData: FormData) {
  const session = await requireAdmin();
  const data = ProvaSchema.parse({
    turmaId: formData.get("turmaId"),
    nome: formData.get("nome"),
    tipo: formData.get("tipo"),
    data: formData.get("data"),
    sala: formData.get("sala"),
    peso: formData.get("peso"),
  });
  const prova = await prisma.avaliacao.create({
    data: { ...data, data: new Date(data.data) },
    include: { turma: true },
  });
  await audit(session, `Agendou "${prova.nome}" para ${prova.turma.nome}`, "Avaliacao", prova.id);
  revalidatePath("/horario");
}

export async function deleteProvaAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const prova = await prisma.avaliacao.delete({ where: { id }, include: { turma: true } });
  await audit(session, `Removeu "${prova.nome}" de ${prova.turma.nome}`, "Avaliacao", id);
  revalidatePath("/horario");
}
