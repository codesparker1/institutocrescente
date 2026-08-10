"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { gerarSenhaTemporaria } from "@/lib/credentials";
import { telefoneAngolaSchema } from "@/lib/phone";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

async function audit(
  session: Awaited<ReturnType<typeof requireAdmin>>,
  action: string,
  entityType: string,
  entityId?: string,
) {
  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action,
    entityType,
    entityId,
  });
}

const CursoSchema = z.object({
  nome: z.string().min(2),
  codigo: z.string().min(2),
  duracaoAnos: z.coerce.number().int().min(1).max(8),
});

export async function createCursoAction(formData: FormData) {
  const session = await requireAdmin();
  const data = CursoSchema.parse({
    nome: formData.get("nome"),
    codigo: formData.get("codigo"),
    duracaoAnos: formData.get("duracaoAnos"),
  });
  const curso = await prisma.curso.create({ data });
  await audit(session, `Criou o curso ${curso.nome}`, "Curso", curso.id);
  revalidatePath("/admin/cursos");
}

export async function deleteCursoAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const curso = await prisma.curso.delete({ where: { id } });
  await audit(session, `Removeu o curso ${curso.nome}`, "Curso", id);
  revalidatePath("/admin/cursos");
}

const DisciplinaSchema = z.object({
  nome: z.string().min(2),
  codigo: z.string().min(2),
  cargaHoraria: z.coerce.number().int().min(1),
  cursoId: z.string().min(1),
});

export async function createDisciplinaAction(formData: FormData) {
  const session = await requireAdmin();
  const data = DisciplinaSchema.parse({
    nome: formData.get("nome"),
    codigo: formData.get("codigo"),
    cargaHoraria: formData.get("cargaHoraria"),
    cursoId: formData.get("cursoId"),
  });
  const disciplina = await prisma.disciplina.create({ data });
  await audit(session, `Criou a disciplina ${disciplina.nome}`, "Disciplina", disciplina.id);
  revalidatePath("/admin/disciplinas");
}

export async function deleteDisciplinaAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const disciplina = await prisma.disciplina.delete({ where: { id } });
  await audit(session, `Removeu a disciplina ${disciplina.nome}`, "Disciplina", id);
  revalidatePath("/admin/disciplinas");
}

const ProfessorSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  telefone: telefoneAngolaSchema,
  especialidade: z.string().min(2, "Especialidade é obrigatória"),
});

export interface CreateProfessorState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: {
    professorId: string;
    nome: string;
    email: string;
    senhaTemporaria: string;
  };
}

export async function createProfessorAction(
  _prevState: CreateProfessorState,
  formData: FormData,
): Promise<CreateProfessorState> {
  const session = await requireAdmin();

  const parsed = ProfessorSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    especialidade: formData.get("especialidade"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  const passwordHash = await bcrypt.hash(senhaTemporaria, 10);

  let professorId: string;
  try {
    const professor = await prisma.$transaction(async (tx) => {
      const novoProfessor = await tx.professor.create({ data: parsed.data });
      await tx.user.create({
        data: {
          name: parsed.data.nome,
          email: parsed.data.email,
          passwordHash,
          role: "PROFESSOR",
          professorId: novoProfessor.id,
        },
      });
      return novoProfessor;
    });
    professorId = professor.id;
  } catch {
    return { error: "Não foi possível criar o professor (email já registado?)." };
  }

  await audit(session, `Criou o professor ${parsed.data.nome}`, "Professor", professorId);
  revalidatePath("/admin/professores");

  return {
    success: {
      professorId,
      nome: parsed.data.nome,
      email: parsed.data.email,
      senhaTemporaria,
    },
  };
}

export async function deleteProfessorAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const professor = await prisma.professor.delete({ where: { id } });
  await audit(session, `Removeu o professor ${professor.nome}`, "Professor", id);
  revalidatePath("/admin/professores");
}

const TurmaSchema = z.object({
  cursoId: z.string().min(1),
  anoCurricular: z.coerce.number().int().min(1).max(8),
  periodo: z.enum(["MATUTINO", "VESPERTINO", "NOTURNO"]),
  anoLetivo: z.coerce.number().int().min(2000).max(2100),
});

export async function createTurmaAction(formData: FormData) {
  const session = await requireAdmin();
  const data = TurmaSchema.parse({
    cursoId: formData.get("cursoId"),
    anoCurricular: formData.get("anoCurricular"),
    periodo: formData.get("periodo"),
    anoLetivo: formData.get("anoLetivo"),
  });
  const turma = await prisma.turma.create({ data, include: { curso: true } });
  await audit(
    session,
    `Criou a turma ${turma.curso.nome} - ${turma.anoCurricular}º Ano`,
    "Turma",
    turma.id,
  );
  revalidatePath("/admin/turmas");
}

export async function deleteTurmaAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const turma = await prisma.turma.delete({ where: { id }, include: { curso: true } });
  await audit(session, `Removeu a turma ${turma.curso.nome} - ${turma.anoCurricular}º Ano`, "Turma", id);
  revalidatePath("/admin/turmas");
}

const TurmaDisciplinaSchema = z.object({
  turmaId: z.string().min(1),
  disciplinaId: z.string().min(1),
  professorId: z.string().min(1),
  semestre: z.coerce.number().int().min(1).max(2),
  sala: z.string().min(1),
});

export async function createTurmaDisciplinaAction(formData: FormData) {
  const session = await requireAdmin();
  const data = TurmaDisciplinaSchema.parse({
    turmaId: formData.get("turmaId"),
    disciplinaId: formData.get("disciplinaId"),
    professorId: formData.get("professorId"),
    semestre: formData.get("semestre"),
    sala: formData.get("sala"),
  });
  const turmaDisciplina = await prisma.turmaDisciplina.create({
    data,
    include: { disciplina: true },
  });
  await audit(session, `Atribuiu ${turmaDisciplina.disciplina.nome} à turma`, "TurmaDisciplina", turmaDisciplina.id);
  revalidatePath(`/admin/turmas/${data.turmaId}`);
}

export async function deleteTurmaDisciplinaAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const turmaDisciplina = await prisma.turmaDisciplina.delete({
    where: { id },
    include: { disciplina: true },
  });
  await audit(session, `Removeu ${turmaDisciplina.disciplina.nome} da turma`, "TurmaDisciplina", id);
  revalidatePath(`/admin/turmas/${turmaDisciplina.turmaId}`);
}
