"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { auth, signIn, signOut, buscarUserPorIdentificador } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { mapearErros, type FieldErrors } from "@/lib/forms";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const identificador = String(formData.get("identificador") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");

  // Só é possível registar a tentativa se o identificador corresponder a uma conta existente:
  // userName/userRole são obrigatórios no AuditLog, e não há dados de utilizador para um identificador desconhecido.
  const user = await buscarUserPorIdentificador(identificador);

  try {
    await signIn("credentials", { identificador, password, redirectTo: callbackUrl });
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
      return { error: "Credenciais inválidas." };
    }
    throw error;
  }
}

const TrocarSenhaSchema = z
  .object({
    novaSenha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
    confirmarSenha: z.string(),
  })
  .refine((data) => data.novaSenha === data.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });

export interface TrocarSenhaState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export async function trocarSenhaAction(
  _prevState: TrocarSenhaState,
  formData: FormData,
): Promise<TrocarSenhaState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Sessão expirada. Inicie sessão novamente." };
  }

  const parsed = TrocarSenhaSchema.safeParse({
    novaSenha: formData.get("novaSenha"),
    confirmarSenha: formData.get("confirmarSenha"),
  });
  if (!parsed.success) {
    return { fieldErrors: mapearErros(parsed.error) };
  }

  const passwordHash = await bcrypt.hash(parsed.data.novaSenha, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, deveTrocarSenha: false },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? "",
    userRole: session.user.role,
    action: "Trocou a senha temporária",
    entityType: "User",
    entityId: session.user.id,
  });

  // Força novo login para o token JWT refletir deveTrocarSenha=false.
  await signOut({ redirectTo: "/login?senhaTrocada=1" });
  return {};
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
