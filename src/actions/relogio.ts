"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, type FormState } from "@/lib/forms";
import { requireGerirRelogioSimulado } from "@/lib/permissions";
import { SIMULATION_MODE, getAgora } from "@/lib/tempo";
import { registarSimEvento } from "@/lib/telemetria";
import { formatDateTime } from "@/lib/utils";

const AvancarRelogioSchema = z.object({
  dias: z.coerce.number("Indique os dias").int("Tem de ser um número inteiro").refine((v) => v !== 0, "Indique um número de dias diferente de zero"),
});

export type AvancarRelogioState = FormState<{ dias: string }> & { success?: boolean };

export async function avancarRelogioAction(_prevState: AvancarRelogioState, formData: FormData): Promise<AvancarRelogioState> {
  if (!SIMULATION_MODE) return { error: "O relógio simulado só está disponível com SIMULATION_MODE=true." };

  const session = await requireGerirRelogioSimulado();
  const parsed = AvancarRelogioSchema.safeParse({ dias: formData.get("dias") });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, ["dias"]);

  const agora = await getAgora();
  const novaData = new Date(agora);
  novaData.setDate(novaData.getDate() + parsed.data.dias);

  await prisma.relogioSimulado.upsert({
    where: { id: "config" },
    update: { agora: novaData },
    create: { id: "config", agora: novaData },
  });

  await registarSimEvento({
    tipo: "SALTO_RELOGIO",
    dataSimulada: novaData,
    etiqueta: `avancarRelogio ${parsed.data.dias > 0 ? "+" : ""}${parsed.data.dias}d`,
    userId: session.user.id,
    userRole: session.user.role,
    detalhes: { dias: parsed.data.dias, de: agora.toISOString(), para: novaData.toISOString() },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Desconhecido",
    userRole: session.user.role,
    action: `Avançou o relógio simulado ${parsed.data.dias > 0 ? "+" : ""}${parsed.data.dias} dia(s), para ${formatDateTime(novaData)}`,
    entityType: "RelogioSimulado",
  });

  revalidatePath("/admin/relogio");
  return { success: true };
}

export async function reporRelogioAction(): Promise<{ error?: string }> {
  if (!SIMULATION_MODE) return { error: "O relógio simulado só está disponível com SIMULATION_MODE=true." };

  const session = await requireGerirRelogioSimulado();
  const agoraAntes = await getAgora();
  await prisma.relogioSimulado.deleteMany({ where: { id: "config" } });

  await registarSimEvento({
    tipo: "REPOR_RELOGIO",
    dataSimulada: new Date(),
    etiqueta: "reporRelogio",
    userId: session.user.id,
    userRole: session.user.role,
    detalhes: { dataSimuladaAnterior: agoraAntes.toISOString() },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Desconhecido",
    userRole: session.user.role,
    action: "Repôs o relógio simulado para a hora real",
    entityType: "RelogioSimulado",
  });

  revalidatePath("/admin/relogio");
  return {};
}
