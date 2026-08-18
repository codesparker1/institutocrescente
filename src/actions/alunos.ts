"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { gerarSenhaTemporaria } from "@/lib/credentials";
import { telefoneAngolaSchema } from "@/lib/phone";
import { erroDeValidacao, extrairValores } from "@/lib/forms";
import { podeRegistarPagamento } from "@/lib/permissions";
import { sincronizarInscricoesTurma } from "@/lib/curriculo";
import { getAgora } from "@/lib/tempo";

const CAMPOS_ALUNO = ["nome", "email", "telefone", "dataNascimento", "genero", "turmaId", "categoria"] as const;
type CampoAluno = (typeof CAMPOS_ALUNO)[number];

// Email e telefone são opcionais na matrícula (MD §7) — o número de estudante é a
// credencial principal do aluno. Campo vazio no formulário conta como "não preenchido".
const semStringVazia = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const emailOpcionalSchema = z.preprocess(semStringVazia, z.string().email("Email inválido").optional());
const telefoneOpcionalSchema = z.preprocess(semStringVazia, telefoneAngolaSchema.optional());

const AlunoSchema = z.object({
  nome: z.string().min(3, "Nome é obrigatório"),
  email: emailOpcionalSchema,
  telefone: telefoneOpcionalSchema,
  dataNascimento: z.string().min(1, "Data de nascimento é obrigatória"),
  genero: z.enum(["Feminino", "Masculino"]),
  turmaId: z.string().min(1, "Turma é obrigatória"),
  categoria: z.enum(["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"]).default("NORMAL"),
});

export interface CreateAlunoState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<CampoAluno, string>;
  success?: {
    alunoId: string;
    numeroEstudante: string;
    nome: string;
    email: string | null;
    senhaTemporaria: string;
  };
}

export async function createAlunoAction(
  _prevState: CreateAlunoState,
  formData: FormData,
): Promise<CreateAlunoState> {
  const session = await auth();
  if (!session?.user || !podeRegistarPagamento(session.user)) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = AlunoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    dataNascimento: formData.get("dataNascimento"),
    genero: formData.get("genero"),
    turmaId: formData.get("turmaId"),
    categoria: formData.get("categoria") || undefined,
  });

  if (!parsed.success) {
    return erroDeValidacao(parsed.error, formData, CAMPOS_ALUNO);
  }

  // Mesma janela de matrícula que processarRematriculaAction já respeitava (§pedido do cliente
  // 2026-08-18) — só faltava aqui, na primeira matrícula de um aluno novo.
  const configAcademica = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!configAcademica?.matriculaInicio || !configAcademica.matriculaFim) {
    return { error: "Defina o período de matrícula em Admin > Configuração Académica antes de matricular alunos." };
  }
  const agora = getAgora();
  if (agora < configAcademica.matriculaInicio || agora > configAcademica.matriculaFim) {
    return { error: "Fora do período de matrícula — novas matrículas só podem ser criadas dentro da janela configurada." };
  }

  const turma = await prisma.turma.findUnique({
    where: { id: parsed.data.turmaId },
    include: { curso: true },
  });
  if (!turma) {
    return {
      fieldErrors: { turmaId: "Turma inválida. Crie a turma primeiro em Admin > Turmas." },
      values: extrairValores(formData, CAMPOS_ALUNO),
    };
  }

  const totalAlunos = await prisma.aluno.count();
  const numeroEstudante = `ISPC${getAgora().getFullYear()}-${String(totalAlunos + 1).padStart(4, "0")}`;
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
          categoria: parsed.data.categoria,
        },
      });

      await tx.user.create({
        data: {
          name: parsed.data.nome,
          email: parsed.data.email,
          numeroEstudante,
          passwordHash,
          deveTrocarSenha: true,
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
    return {
      error: "Não foi possível criar o aluno (email já registado?).",
      values: extrairValores(formData, CAMPOS_ALUNO),
    };
  }

  // Inscreve o aluno em todas as cadeiras curriculares já oferecidas pela turma (§4.2).
  await sincronizarInscricoesTurma(turma.id);

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
      email: parsed.data.email ?? null,
      senhaTemporaria,
    },
  };
}

const CATEGORIAS_ESTUDANTE = ["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"] as const;

const CATEGORIA_LABEL: Record<(typeof CATEGORIAS_ESTUDANTE)[number], string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

const AtualizarCategoriaSchema = z.object({
  alunoId: z.string().min(1),
  categoria: z.enum(CATEGORIAS_ESTUDANTE),
});

export interface AtualizarCategoriaState {
  error?: string;
}

export async function atualizarCategoriaEstudanteAction(
  _prevState: AtualizarCategoriaState,
  formData: FormData,
): Promise<AtualizarCategoriaState> {
  const session = await auth();
  if (!session?.user || !podeRegistarPagamento(session.user)) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = AtualizarCategoriaSchema.safeParse({
    alunoId: formData.get("alunoId"),
    categoria: formData.get("categoria"),
  });
  if (!parsed.success) {
    return { error: "Categoria inválida." };
  }

  const aluno = await prisma.aluno.findUnique({ where: { id: parsed.data.alunoId } });
  if (!aluno) {
    return { error: "Aluno não encontrado." };
  }

  if (aluno.categoria === parsed.data.categoria) {
    return {};
  }

  await prisma.aluno.update({
    where: { id: parsed.data.alunoId },
    data: { categoria: parsed.data.categoria },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Alterou a categoria de ${aluno.nome} de ${CATEGORIA_LABEL[aluno.categoria]} para ${CATEGORIA_LABEL[parsed.data.categoria]}`,
    entityType: "Aluno",
    entityId: aluno.id,
    valorAnterior: CATEGORIA_LABEL[aluno.categoria],
    valorNovo: CATEGORIA_LABEL[parsed.data.categoria],
  });

  revalidatePath(`/alunos/${aluno.id}`);
  revalidatePath("/alunos");

  return {};
}
