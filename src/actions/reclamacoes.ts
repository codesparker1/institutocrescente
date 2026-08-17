"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, type FormState } from "@/lib/forms";
import { requireGerirContas } from "@/lib/permissions";

const CATEGORIAS = ["SUGESTAO", "RECLAMACAO", "PROBLEMA_TECNICO", "OUTRO"] as const;

const ReclamacaoSchema = z.object({
  categoria: z.enum(CATEGORIAS, { message: "Categoria inválida" }),
  assunto: z.string().min(3, "Escreva um assunto curto").max(120, "Assunto demasiado longo"),
  mensagem: z.string().min(10, "Descreva com um pouco mais de detalhe (mínimo 10 caracteres)").max(4000, "Mensagem demasiado longa"),
});

const CAMPOS_RECLAMACAO = ["categoria", "assunto", "mensagem"] as const;
export type CriarReclamacaoState = FormState<Record<(typeof CAMPOS_RECLAMACAO)[number], string>> & { success?: boolean };

/**
 * Canal de aluno, professor ou secretaria para reportar problemas ou sugerir melhorias — não é
 * um pedido académico/financeiro. SECRETARIA não tem Aluno/Professor próprio, por isso usa
 * userId (ver Reclamacao.userId no schema).
 */
export async function criarReclamacaoAction(_prevState: CriarReclamacaoState, formData: FormData): Promise<CriarReclamacaoState> {
  const session = await auth();
  const alunoId = session?.user.role === "ALUNO" ? session.user.alunoId : undefined;
  const professorId = session?.user.role === "PROFESSOR" ? session.user.professorId : undefined;
  const userId = session?.user.role === "SECRETARIA" ? session.user.id : undefined;
  if (!session?.user || (!alunoId && !professorId && !userId)) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = ReclamacaoSchema.safeParse({
    categoria: formData.get("categoria"),
    assunto: formData.get("assunto"),
    mensagem: formData.get("mensagem"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_RECLAMACAO);

  const reclamacao = await prisma.reclamacao.create({
    data: {
      alunoId,
      professorId,
      userId,
      categoria: parsed.data.categoria,
      assunto: parsed.data.assunto,
      mensagem: parsed.data.mensagem,
    },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? "Utilizador",
    userRole: session.user.role,
    action: `Enviou uma reclamação/sugestão: "${parsed.data.assunto}"`,
    entityType: "Reclamacao",
    entityId: reclamacao.id,
  });

  revalidatePath("/reclamacoes");
  return { success: true };
}

const ESTADOS = ["PENDENTE", "EM_ANALISE", "RESOLVIDO"] as const;

const AtualizarReclamacaoSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ESTADOS, { message: "Estado inválido" }),
  resposta: z.string().max(4000, "Resposta demasiado longa").optional(),
});

export interface AtualizarReclamacaoState {
  error?: string;
}

const STATUS_LABEL: Record<(typeof ESTADOS)[number], string> = {
  PENDENTE: "Pendente",
  EM_ANALISE: "Em análise",
  RESOLVIDO: "Resolvido",
};

/** Domínio do ADMIN (gestão geral) — muda o estado e opcionalmente deixa uma resposta curta. */
export async function atualizarReclamacaoAction(_prevState: AtualizarReclamacaoState, formData: FormData): Promise<AtualizarReclamacaoState> {
  const session = await requireGerirContas();

  const parsed = AtualizarReclamacaoSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    resposta: formData.get("resposta") || undefined,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const anterior = await prisma.reclamacao.findUnique({ where: { id: parsed.data.id } });
  if (!anterior) return { error: "Reclamação não encontrada." };

  await prisma.reclamacao.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, resposta: parsed.data.resposta ?? anterior.resposta },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Atualizou a reclamação "${anterior.assunto}"`,
    entityType: "Reclamacao",
    entityId: anterior.id,
    valorAnterior: STATUS_LABEL[anterior.status],
    valorNovo: STATUS_LABEL[parsed.data.status],
  });

  revalidatePath("/admin/reclamacoes");
  return {};
}
