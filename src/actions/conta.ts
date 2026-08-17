"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { telefoneAngolaSchema } from "@/lib/phone";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { requireSessao } from "@/lib/permissions";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";

const semStringVazia = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const CAMPOS_CONTA = ["email", "telefone", "senhaAtual", "novaSenha", "confirmarNovaSenha"] as const;
type CampoConta = (typeof CAMPOS_CONTA)[number];

export type ContaState = FormState<Record<CampoConta, string>> & { success?: boolean };

/**
 * Auto-serviço (Fase 12): qualquer papel altera o seu próprio email/telefone/senha — e só isso,
 * nenhum outro campo. Um único portão por senha atual cobre as três alterações (email, telefone,
 * senha), em vez de fluxos de confirmação separados. `novaSenha` é opcional — só valida/atualiza a
 * senha se vier preenchida.
 */
export async function atualizarContaAction(_prevState: ContaState, formData: FormData): Promise<ContaState> {
  const session = await requireSessao();

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "A sua sessão está desatualizada — inicie sessão novamente." };

  // Email/telefone obrigatórios para todo o staff e para PROFESSOR (Professor.email/telefone são
  // NOT NULL); opcionais só para ALUNO (Aluno.email/telefone já são opcionais hoje).
  const emailSchema =
    user.role === "ALUNO"
      ? z.preprocess(semStringVazia, z.string().email("Email inválido").optional())
      : z.string().email("Email inválido");
  const telefoneSchema =
    user.role === "PROFESSOR"
      ? telefoneAngolaSchema
      : z.preprocess(semStringVazia, telefoneAngolaSchema.optional());

  const ContaSchema = z
    .object({
      email: emailSchema,
      telefone: telefoneSchema,
      senhaAtual: z.string().min(1, "Indique a sua senha atual"),
      novaSenha: z.preprocess(semStringVazia, z.string().min(8, "A senha deve ter pelo menos 8 caracteres").optional()),
      confirmarNovaSenha: z.preprocess(semStringVazia, z.string().optional()),
    })
    .refine((data) => !data.novaSenha || data.novaSenha === data.confirmarNovaSenha, {
      message: "As senhas não coincidem",
      path: ["confirmarNovaSenha"],
    });

  const parsed = ContaSchema.safeParse({
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
    confirmarNovaSenha: formData.get("confirmarNovaSenha"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_CONTA);

  const senhaCorreta = await bcrypt.compare(parsed.data.senhaAtual, user.passwordHash);
  if (!senhaCorreta) {
    return {
      fieldErrors: { senhaAtual: "Senha atual incorreta." },
      values: extrairValores(formData, CAMPOS_CONTA),
    };
  }

  const novoPasswordHash = parsed.data.novaSenha ? await bcrypt.hash(parsed.data.novaSenha, 10) : undefined;
  const email = parsed.data.email ?? null;
  const telefone = parsed.data.telefone ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { email, telefone, ...(novoPasswordHash ? { passwordHash: novoPasswordHash } : {}) },
      });
      if (user.alunoId) {
        await tx.aluno.update({ where: { id: user.alunoId }, data: { email, telefone } });
      }
      if (user.professorId) {
        // Professor.email/telefone são NOT NULL — garantido pelo telefoneSchema/emailSchema acima
        // para role === "PROFESSOR", por isso o "!" aqui é seguro.
        await tx.professor.update({ where: { id: user.professorId }, data: { email: email!, telefone: telefone! } });
      }
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return {
        fieldErrors: { email: "Este email já está registado por outra conta." },
        values: extrairValores(formData, CAMPOS_CONTA),
      };
    }
    throw error;
  }

  await registrarAuditoria({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: `Atualizou os dados da conta (email/telefone${novoPasswordHash ? "/senha" : ""})`,
    entityType: "User",
    entityId: user.id,
  });

  revalidatePath("/conta");
  return { success: true };
}
