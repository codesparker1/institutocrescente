"use server";

import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");

  // Só é possível registar a tentativa se o email corresponder a uma conta existente:
  // userName/userRole são obrigatórios no AuditLog, e não há dados de utilizador para um email desconhecido.
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true } });

  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
    if (user) {
      await registrarAuditoria({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "Login bem-sucedido",
        entityType: "User",
        entityId: user.id,
      });
    }
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      if (user) {
        await registrarAuditoria({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: "Tentativa de login falhada (senha incorreta)",
          entityType: "User",
          entityId: user.id,
        });
      }
      return { error: "Email ou senha inválidos." };
    }
    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  const session = await auth();
  if (session?.user) {
    await registrarAuditoria({
      userId: session.user.id,
      userName: session.user.name ?? "",
      userRole: session.user.role,
      action: "Logout",
      entityType: "User",
      entityId: session.user.id,
    });
  }
  await signOut({ redirectTo: "/login" });
}
