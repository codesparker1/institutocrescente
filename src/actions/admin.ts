"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

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
  revalidatePath("/admin");
}

export async function deleteCursoAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const curso = await prisma.curso.delete({ where: { id } });
  await audit(session, `Removeu o curso ${curso.nome}`, "Curso", id);
  revalidatePath("/admin");
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
  revalidatePath("/admin");
}

export async function deleteDisciplinaAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const disciplina = await prisma.disciplina.delete({ where: { id } });
  await audit(session, `Removeu a disciplina ${disciplina.nome}`, "Disciplina", id);
  revalidatePath("/admin");
}

const ProfessorSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  telefone: z.string().min(6),
  especialidade: z.string().min(2),
});

export async function createProfessorAction(formData: FormData) {
  const session = await requireAdmin();
  const data = ProfessorSchema.parse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    especialidade: formData.get("especialidade"),
  });
  const professor = await prisma.professor.create({ data });
  await audit(session, `Criou o professor ${professor.nome}`, "Professor", professor.id);
  revalidatePath("/admin");
}

export async function deleteProfessorAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const professor = await prisma.professor.delete({ where: { id } });
  await audit(session, `Removeu o professor ${professor.nome}`, "Professor", id);
  revalidatePath("/admin");
}

const TurmaSchema = z.object({
  nome: z.string().min(2),
  disciplinaId: z.string().min(1),
  professorId: z.string().min(1),
  anoLetivo: z.coerce.number().int().min(2000).max(2100),
  semestre: z.coerce.number().int().min(1).max(2),
  anoCurricular: z.coerce.number().int().min(1).max(8),
  periodo: z.enum(["MATUTINO", "VESPERTINO", "NOTURNO"]),
  sala: z.string().min(1),
  horario: z.string().min(3),
});

export async function createTurmaAction(formData: FormData) {
  const session = await requireAdmin();
  const data = TurmaSchema.parse({
    nome: formData.get("nome"),
    disciplinaId: formData.get("disciplinaId"),
    professorId: formData.get("professorId"),
    anoLetivo: formData.get("anoLetivo"),
    semestre: formData.get("semestre"),
    anoCurricular: formData.get("anoCurricular"),
    periodo: formData.get("periodo"),
    sala: formData.get("sala"),
    horario: formData.get("horario"),
  });
  const turma = await prisma.turma.create({ data });
  await audit(session, `Criou a turma ${turma.nome}`, "Turma", turma.id);
  revalidatePath("/admin");
}

export async function deleteTurmaAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const turma = await prisma.turma.delete({ where: { id } });
  await audit(session, `Removeu a turma ${turma.nome}`, "Turma", id);
  revalidatePath("/admin");
}
