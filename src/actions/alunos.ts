"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { gerarSenhaTemporaria } from "@/lib/credentials";
import { telefoneAngolaSchema } from "@/lib/phone";

const AlunoSchema = z.object({
  nome: z.string().min(3, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  telefone: telefoneAngolaSchema,
  dataNascimento: z.string().min(1, "Data de nascimento é obrigatória"),
  genero: z.enum(["Feminino", "Masculino"]),
  turmaId: z.string().min(1, "Turma é obrigatória"),
});

export interface CreateAlunoState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: {
    alunoId: string;
    numeroEstudante: string;
    nome: string;
    email: string;
    senhaTemporaria: string;
  };
}

export async function createAlunoAction(
  _prevState: CreateAlunoState,
  formData: FormData,
): Promise<CreateAlunoState> {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA"].includes(session.user.role)) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = AlunoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    dataNascimento: formData.get("dataNascimento"),
    genero: formData.get("genero"),
    turmaId: formData.get("turmaId"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const turma = await prisma.turma.findUnique({
    where: { id: parsed.data.turmaId },
    include: { curso: true },
  });
  if (!turma) {
    return { fieldErrors: { turmaId: "Turma inválida. Crie a turma primeiro em Admin > Turmas." } };
  }

  const totalAlunos = await prisma.aluno.count();
  const numeroEstudante = `ISPC${new Date().getFullYear()}-${String(totalAlunos + 1).padStart(4, "0")}`;
  const senhaTemporaria = gerarSenhaTemporaria();
  const passwordHash = await bcrypt.hash(senhaTemporaria, 10);

  let alunoId: string;
  try {
    const aluno = await prisma.$transaction(async (tx) => {
      const novoAluno = await tx.aluno.create({
        data: {
          numeroEstudante,
          nome: parsed.data.nome,
          email: parsed.data.email,
          telefone: parsed.data.telefone,
          dataNascimento: new Date(parsed.data.dataNascimento),
          genero: parsed.data.genero,
          curso: turma.curso.nome,
          anoIngresso: turma.anoLetivo,
          anoCurricular: turma.anoCurricular,
        },
      });

      await tx.user.create({
        data: {
          name: parsed.data.nome,
          email: parsed.data.email,
          passwordHash,
          role: "ALUNO",
          alunoId: novoAluno.id,
        },
      });

      await tx.matricula.create({
        data: { alunoId: novoAluno.id, turmaId: turma.id, status: "ATIVA" },
      });

      return novoAluno;
    });
    alunoId = aluno.id;
  } catch {
    return { error: "Não foi possível criar o aluno (email já registado?)." };
  }

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Registou e matriculou o aluno ${parsed.data.nome} em ${turma.curso.nome} · ${turma.anoCurricular}º Ano`,
    entityType: "Aluno",
    entityId: alunoId,
  });

  revalidatePath("/alunos");
  revalidatePath("/admin/turmas");

  return {
    success: {
      alunoId,
      numeroEstudante,
      nome: parsed.data.nome,
      email: parsed.data.email,
      senhaTemporaria,
    },
  };
}
