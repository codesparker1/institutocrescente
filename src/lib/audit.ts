import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAgora, SIMULATION_MODE } from "@/lib/tempo";
import type { Role } from "@/generated/prisma/client";

interface RegistrarAuditoriaInput {
  userId?: string | null;
  userName: string;
  userRole: Role;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Valor estruturado antes/depois (§7) — só onde faz sentido: notas, pagamentos, preços, categoria. */
  valorAnterior?: string | null;
  valorNovo?: string | null;
}

async function getClientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headerList.get("x-real-ip");
}

export async function registrarAuditoria(input: RegistrarAuditoriaInput): Promise<void> {
  try {
    const ipAddress = await getClientIp();
    // Em simulação, a auditoria segue o relógio simulado (dataEvento) — a hora real fica em
    // createdAt. Fora de simulação os dois coincidem.
    const dataEvento = SIMULATION_MODE ? await getAgora() : new Date();

    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userName: input.userName,
        userRole: input.userRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        valorAnterior: input.valorAnterior ?? null,
        valorNovo: input.valorNovo ?? null,
        ipAddress,
        dataEvento,
      },
    });
  } catch (error) {
    // A falha ao registar a auditoria não pode derrubar a ação que já foi aplicada com sucesso.
    console.error("Falha ao registar auditoria:", error);
  }
}
