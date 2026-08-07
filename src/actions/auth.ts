"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");

  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email ou senha inválidos." };
    }
    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
