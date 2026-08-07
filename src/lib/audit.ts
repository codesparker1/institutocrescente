import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

interface RegistrarAuditoriaInput {
  userId?: string | null;
  userName: string;
  userRole: Role;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
}

async function getClientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headerList.get("x-real-ip");
}

export async function registrarAuditoria(input: RegistrarAuditoriaInput): Promise<void> {
  const ipAddress = await getClientIp();

  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      userName: input.userName,
      userRole: input.userRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: input.details ?? null,
      ipAddress,
    },
  });
}
