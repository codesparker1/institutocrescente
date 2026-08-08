"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

const AlunoSchema = z.object({
  nome: z.string().min(3, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  telefone: z.string().min(6, "Telefone é obrigatório"),
  dataNascimento: z.string().min(1, "Data de nascimento é obrigatória"),
  genero: z.enum(["Feminino", "Masculino"]),
  curso: z.string().min(1, "Curso é obrigatório"),
  anoIngresso: z.coerce.number().int().min(2000).max(2100),
  anoCurricular: z.coerce.number().int().min(1).max(8),
});

export interface CreateAlunoState {
  error?: string;
  fieldErrors?: Record<string, string>;
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
    curso: formData.get("curso"),
    anoIngresso: formData.get("anoIngresso"),
    anoCurricular: formData.get("anoCurricular"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const totalAlunos = await prisma.aluno.count();
  const numeroEstudante = `ISPC${new Date().getFullYear()}-${String(totalAlunos + 1).padStart(4, "0")}`;

  let alunoId: string;
  try {
    const aluno = await prisma.aluno.create({
      data: {
        numeroEstudante,
        nome: parsed.data.nome,
        email: parsed.data.email,
        telefone: parsed.data.telefone,
        dataNascimento: new Date(parsed.data.dataNascimento),
        genero: parsed.data.genero,
        curso: parsed.data.curso,
        anoIngresso: parsed.data.anoIngresso,
        anoCurricular: parsed.data.anoCurricular,
      },
    });
    alunoId = aluno.id;
  } catch {
    return { error: "Não foi possível criar o aluno (email já registado?)." };
  }

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Registou o aluno ${parsed.data.nome}`,
    entityType: "Aluno",
    entityId: alunoId,
  });

  revalidatePath("/alunos");
  redirect(`/alunos/${alunoId}`);
}
