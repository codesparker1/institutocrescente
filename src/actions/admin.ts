"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { SENHA_INICIAL_PADRAO } from "@/lib/credentials";
import { telefoneAngolaSchema } from "@/lib/phone";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { isForeignKeyViolation } from "@/lib/prisma-errors";
import { requireGerirCurriculo, requireGerirContas, type SessionComUser } from "@/lib/permissions";
import { sincronizarInscricoesTurma, sincronizarTurmasComPlanoCurricular } from "@/lib/curriculo";
import { getAgora } from "@/lib/tempo";
import { nomeProfessor, SALA_A_CONFIRMAR } from "@/lib/utils";

async function audit(
  session: SessionComUser,
  action: string,
  entityType: string,
  entityId?: string,
  valores?: { valorAnterior?: string; valorNovo?: string },
) {
  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action,
    entityType,
    entityId,
    valorAnterior: valores?.valorAnterior,
    valorNovo: valores?.valorNovo,
  });
}

const CursoSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  codigo: z.string().min(2, "Código é obrigatório"),
  duracaoAnos: z.coerce.number("Indique a duração").int().min(1, "Mínimo 1 ano").max(8, "Máximo 8 anos"),
});

const CAMPOS_CURSO = ["nome", "codigo", "duracaoAnos"] as const;
export type CreateCursoState = FormState<Record<(typeof CAMPOS_CURSO)[number], string>>;

export async function createCursoAction(
  _prevState: CreateCursoState,
  formData: FormData,
): Promise<CreateCursoState> {
  const session = await requireGerirCurriculo();
  const parsed = CursoSchema.safeParse({
    nome: formData.get("nome"),
    codigo: formData.get("codigo"),
    duracaoAnos: formData.get("duracaoAnos"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_CURSO);

  try {
    const curso = await prisma.curso.create({ data: parsed.data });
    await audit(session, `Criou o curso ${curso.nome}`, "Curso", curso.id);
  } catch {
    return {
      error: "Não foi possível criar o curso (código já existe?).",
      values: extrairValores(formData, CAMPOS_CURSO),
    };
  }

  revalidatePath("/admin/cursos");
  return {};
}

const PrecoPropinaSchema = z.object({
  categoria: z.enum(["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"]),
  anoCurricular: z.coerce.number("Indique o ano").int().min(1, "Mínimo 1º ano").max(8, "Máximo 8º ano"),
  valor: z.coerce.number("Indique o valor da propina").min(0, "O valor não pode ser negativo"),
});

/**
 * Preço da propina por categoria × ano curricular, igual em todos os cursos (§pedido do cliente
 * 2026-08-18 — substitui Curso.valorPropina). Upsert: a combinação categoria+anoCurricular é
 * única, editar uma célula já existente atualiza-a em vez de duplicar.
 */
export async function atualizarPrecoPropinaAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireGerirCurriculo();
  const parsed = PrecoPropinaSchema.safeParse({
    categoria: formData.get("categoria"),
    anoCurricular: formData.get("anoCurricular"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) return { error: "Valor inválido." };

  const anterior = await prisma.precoPropina.findUnique({
    where: { categoria_anoCurricular: { categoria: parsed.data.categoria, anoCurricular: parsed.data.anoCurricular } },
  });
  await prisma.precoPropina.upsert({
    where: { categoria_anoCurricular: { categoria: parsed.data.categoria, anoCurricular: parsed.data.anoCurricular } },
    create: parsed.data,
    update: { valor: parsed.data.valor },
  });
  await audit(
    session,
    `Atualizou o preço da propina de ${parsed.data.categoria} · ${parsed.data.anoCurricular}º Ano para ${parsed.data.valor} Kz`,
    "PrecoPropina",
    undefined,
    anterior ? { valorAnterior: `${Number(anterior.valor)} Kz`, valorNovo: `${parsed.data.valor} Kz` } : undefined,
  );

  revalidatePath("/admin/precos");
  return {};
}

const PercentagemAgravamentoSchema = z.object({
  percentagem: z.coerce.number("Indique a percentagem").min(0, "A percentagem não pode ser negativa").max(1000, "Percentagem inválida"),
});

/**
 * % agravada sobre a mensalidade por cada cadeira em repetição (Aluno.cadeirasReprovadasAnoAnterior,
 * atualizado a cada rematrícula) — §pedido do cliente 2026-08-18. Guardada em ConfiguracaoFinanceira
 * (garantirCobrancasGeradas já carrega essa linha), mas editada aqui em Admin > Preços, ao lado do
 * resto do preçário da propina.
 */
export async function atualizarPercentagemAgravamentoAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireGerirCurriculo();
  const parsed = PercentagemAgravamentoSchema.safeParse({ percentagem: formData.get("percentagem") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Percentagem inválida." };

  const anterior = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  await prisma.configuracaoFinanceira.upsert({
    where: { id: "config" },
    create: { id: "config", percentagemAgravamentoPorCadeira: parsed.data.percentagem, updatedPorId: session.user.id },
    update: { percentagemAgravamentoPorCadeira: parsed.data.percentagem, updatedPorId: session.user.id },
  });
  await audit(
    session,
    `Atualizou o agravamento por cadeira em repetição para ${parsed.data.percentagem}%`,
    "ConfiguracaoFinanceira",
    "config",
    anterior ? { valorAnterior: `${Number(anterior.percentagemAgravamentoPorCadeira)}%`, valorNovo: `${parsed.data.percentagem}%` } : undefined,
  );

  revalidatePath("/admin/precos");
  return {};
}

export async function deleteCursoAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  try {
    const curso = await prisma.curso.delete({ where: { id } });
    await audit(session, `Removeu o curso ${curso.nome}`, "Curso", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: este curso ainda tem disciplinas ou turmas associadas.");
    }
    throw error;
  }
  revalidatePath("/admin/cursos");
}

const DisciplinaSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  codigo: z.string().min(2, "Código é obrigatório"),
  cargaHoraria: z.coerce.number("Indique a carga horária").int().min(1, "Carga horária inválida"),
  cursoId: z.string().min(1, "Curso é obrigatório"),
});

const CAMPOS_DISCIPLINA = ["nome", "codigo", "cargaHoraria", "cursoId"] as const;
export type CreateDisciplinaState = FormState<Record<(typeof CAMPOS_DISCIPLINA)[number], string>>;

export async function createDisciplinaAction(
  _prevState: CreateDisciplinaState,
  formData: FormData,
): Promise<CreateDisciplinaState> {
  const session = await requireGerirCurriculo();
  const parsed = DisciplinaSchema.safeParse({
    nome: formData.get("nome"),
    codigo: formData.get("codigo"),
    cargaHoraria: formData.get("cargaHoraria"),
    cursoId: formData.get("cursoId"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_DISCIPLINA);

  try {
    const disciplina = await prisma.disciplina.create({ data: parsed.data });
    await audit(session, `Criou a disciplina ${disciplina.nome}`, "Disciplina", disciplina.id);
  } catch {
    return {
      error: "Não foi possível criar a disciplina (código já existe?).",
      values: extrairValores(formData, CAMPOS_DISCIPLINA),
    };
  }

  revalidatePath("/admin/disciplinas");
  return {};
}

export async function deleteDisciplinaAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));

  // Uma disciplina pode estar no plano de vários cursos (§pedido do cliente 2026-09-02), por isso
  // a chave estrangeira sozinha diria só "ainda está em uso" — e quem apaga a partir de Engenharia
  // não adivinharia que o problema está no plano de Gestão. Nomeamos os cursos antes de tentar.
  const noPlanoDe = await prisma.cadeiraCurricular.findMany({
    where: { disciplinaId: id },
    select: { curso: { select: { nome: true } } },
    distinct: ["cursoId"],
    orderBy: { curso: { nome: "asc" } },
  });
  if (noPlanoDe.length > 0) {
    const cursos = noPlanoDe.map((c) => c.curso.nome).join(", ");
    throw new Error(
      `Não é possível remover: esta disciplina está no plano curricular de ${cursos}. ` +
        "Retire-a desses planos primeiro, em Plano Curricular.",
    );
  }

  try {
    const disciplina = await prisma.disciplina.delete({ where: { id } });
    await audit(session, `Removeu a disciplina ${disciplina.nome}`, "Disciplina", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: esta disciplina ainda está atribuída a turmas.");
    }
    throw error;
  }
  revalidatePath("/admin/disciplinas");
}

const CadeiraCurricularSchema = z.object({
  cursoId: z.string().min(1, "Curso é obrigatório"),
  disciplinaId: z.string().min(1, "Disciplina é obrigatória"),
  anoCurricular: z.coerce.number("Indique o ano").int().min(1, "Mínimo 1º ano").max(8, "Máximo 8º ano"),
  semestre: z.coerce.number("Indique o semestre").int().min(1, "Semestre inválido").max(2, "Semestre inválido"),
  // Select e não checkbox: mesma armadilha do z.coerce.boolean() documentada em RegrasDispensaSchema
  // — a string "false" também é truthy.
  eMonografia: z.enum(["true", "false"]).transform((v) => v === "true"),
});

const RegrasDispensaSchema = z.object({
  cadeiraCurricularId: z.string().min(1),
  // Select (não checkbox) para evitar a armadilha do z.coerce.boolean() com strings: "false" também é truthy.
  permiteDispensa: z.enum(["true", "false"]).transform((v) => v === "true"),
  notaMinimaDispensa: z.coerce.number().min(0, "Nota entre 0 e 20").max(20, "Nota entre 0 e 20"),
});

const CAMPOS_CADEIRA_CURRICULAR = ["cursoId", "disciplinaId", "anoCurricular", "semestre", "eMonografia"] as const;
export type CreateCadeiraCurricularState = FormState<Record<(typeof CAMPOS_CADEIRA_CURRICULAR)[number], string>>;

export async function createCadeiraCurricularAction(
  _prevState: CreateCadeiraCurricularState,
  formData: FormData,
): Promise<CreateCadeiraCurricularState> {
  const session = await requireGerirCurriculo();
  const parsed = CadeiraCurricularSchema.safeParse({
    cursoId: formData.get("cursoId"),
    disciplinaId: formData.get("disciplinaId"),
    anoCurricular: formData.get("anoCurricular"),
    semestre: formData.get("semestre"),
    eMonografia: formData.get("eMonografia"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_CADEIRA_CURRICULAR);

  // O limite real é a duração do curso, não o 8 fixo do schema: um curso de 3 anos não pode ter
  // uma cadeira no 4º ano. Validado aqui, e não só no `max` do input, porque o formulário é apenas
  // a primeira barreira — a Server Action é a que conta.
  const curso = await prisma.curso.findUnique({
    where: { id: parsed.data.cursoId },
    select: { duracaoAnos: true },
  });
  if (!curso) {
    return {
      fieldErrors: { cursoId: "Curso não encontrado." },
      values: extrairValores(formData, CAMPOS_CADEIRA_CURRICULAR),
    };
  }
  if (parsed.data.anoCurricular > curso.duracaoAnos) {
    return {
      fieldErrors: {
        anoCurricular: `Este curso dura ${curso.duracaoAnos} ano(s) — não pode ter cadeiras no ${parsed.data.anoCurricular}º ano.`,
      },
      values: extrairValores(formData, CAMPOS_CADEIRA_CURRICULAR),
    };
  }

  try {
    const cadeira = await prisma.cadeiraCurricular.create({ data: parsed.data, include: { disciplina: true } });

    // A turma nasce com as disciplinas do plano, mas o plano também muda depois de a turma existir
    // — sem isto, uma disciplina acrescentada a meio do ano nunca chegava às turmas já criadas.
    // Mesma função da rede de segurança diária (garantirTurmasSincronizadasComPlano), aqui em
    // caminho imediato: o DAAC vê o efeito sem esperar pelo dia seguinte.
    const agoraCadeira = await getAgora();
    const ofertasCriadas = await sincronizarTurmasComPlanoCurricular(agoraCadeira.getFullYear());

    await audit(
      session,
      ofertasCriadas > 0
        ? `Adicionou ${cadeira.disciplina.nome} ao plano curricular (${cadeira.anoCurricular}º ano, ${cadeira.semestre}º semestre) — propagada a ${ofertasCriadas} turma(s)`
        : `Adicionou ${cadeira.disciplina.nome} ao plano curricular (${cadeira.anoCurricular}º ano, ${cadeira.semestre}º semestre)`,
      "CadeiraCurricular",
      cadeira.id,
    );
  } catch {
    return {
      error: "Não foi possível adicionar (esta disciplina já está neste ano/semestre do curso?).",
      values: extrairValores(formData, CAMPOS_CADEIRA_CURRICULAR),
    };
  }

  revalidatePath("/admin/curriculo");
  revalidatePath("/admin/turmas");
  return {};
}

export async function atualizarRegrasCadeiraCurricularAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireGerirCurriculo();
  const parsed = RegrasDispensaSchema.safeParse({
    cadeiraCurricularId: formData.get("cadeiraCurricularId"),
    permiteDispensa: formData.get("permiteDispensa"),
    notaMinimaDispensa: formData.get("notaMinimaDispensa"),
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const cadeira = await prisma.cadeiraCurricular.update({
    where: { id: parsed.data.cadeiraCurricularId },
    data: { permiteDispensa: parsed.data.permiteDispensa, notaMinimaDispensa: parsed.data.notaMinimaDispensa },
    include: { disciplina: true },
  });
  await audit(
    session,
    `Atualizou as regras de dispensa de ${cadeira.disciplina.nome} (${cadeira.anoCurricular}º ano): ${parsed.data.permiteDispensa ? `dispensa a partir de ${parsed.data.notaMinimaDispensa}` : "sem dispensa"}`,
    "CadeiraCurricular",
    cadeira.id,
  );

  revalidatePath("/admin/curriculo");
  return {};
}

export async function deleteCadeiraCurricularAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  try {
    const cadeira = await prisma.cadeiraCurricular.delete({ where: { id }, include: { disciplina: true } });
    await audit(session, `Removeu ${cadeira.disciplina.nome} do plano curricular`, "CadeiraCurricular", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: já existem turmas ou inscrições a usar esta cadeira do plano curricular.");
    }
    throw error;
  }
  revalidatePath("/admin/curriculo");
}

const ProfessorSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  telefone: telefoneAngolaSchema,
  especialidade: z.string().min(2, "Especialidade é obrigatória"),
});

const CAMPOS_PROFESSOR = ["nome", "email", "telefone", "especialidade"] as const;
type CampoProfessor = (typeof CAMPOS_PROFESSOR)[number];

export interface CreateProfessorState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<CampoProfessor, string>;
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
  const session = await requireGerirContas();

  const parsed = ProfessorSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    especialidade: formData.get("especialidade"),
  });

  if (!parsed.success) {
    return erroDeValidacao(parsed.error, formData, CAMPOS_PROFESSOR);
  }

  const senhaTemporaria = SENHA_INICIAL_PADRAO;
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
          deveTrocarSenha: true,
          role: "PROFESSOR",
          professorId: novoProfessor.id,
        },
      });
      return novoProfessor;
    });
    professorId = professor.id;
  } catch {
    return {
      error: "Não foi possível criar o professor (email já registado?).",
      values: extrairValores(formData, CAMPOS_PROFESSOR),
    };
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
  const session = await requireGerirContas();
  const id = String(formData.get("id"));
  try {
    const professor = await prisma.professor.delete({ where: { id } });
    await audit(session, `Removeu o professor ${professor.nome}`, "Professor", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: este professor ainda tem disciplinas atribuídas.");
    }
    throw error;
  }
  revalidatePath("/admin/professores");
}

const StaffSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  role: z.enum(["DAAC", "SECRETARIA", "DEV"], { message: "Papel inválido" }),
});

const CAMPOS_STAFF = ["nome", "email", "role"] as const;
type CampoStaff = (typeof CAMPOS_STAFF)[number];

export interface CreateStaffState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<CampoStaff, string>;
  success?: {
    nome: string;
    email: string;
    senhaTemporaria: string;
  };
}

/**
 * Cria uma conta DAAC, Secretaria ou DEV (§pedido do cliente 2026-08-18: "o admin é quem corre o
 * espetáculo" — antes só existiam via seed, sem nenhuma ação para o ADMIN criar uma de raiz).
 * ADMIN de propósito fora do enum aceite aqui: multiplicar contas ADMIN não foi pedido, e cada
 * uma tem acesso total — se vier a ser preciso, é um pedido à parte.
 */
export async function createStaffUserAction(_prevState: CreateStaffState, formData: FormData): Promise<CreateStaffState> {
  const session = await requireGerirContas();
  const parsed = StaffSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_STAFF);

  const senhaTemporaria = SENHA_INICIAL_PADRAO;
  const passwordHash = await bcrypt.hash(senhaTemporaria, 10);

  try {
    await prisma.user.create({
      data: { name: parsed.data.nome, email: parsed.data.email, passwordHash, deveTrocarSenha: true, role: parsed.data.role },
    });
  } catch {
    return {
      error: "Não foi possível criar a conta (email já registado?).",
      values: extrairValores(formData, CAMPOS_STAFF),
    };
  }

  await audit(session, `Criou a conta ${parsed.data.role} de ${parsed.data.nome}`, "User");
  revalidatePath("/admin/equipa");

  return { success: { nome: parsed.data.nome, email: parsed.data.email, senhaTemporaria } };
}

export async function deleteStaffUserAction(formData: FormData) {
  const session = await requireGerirContas();
  const id = String(formData.get("id"));
  const staff = await prisma.user.delete({ where: { id } });
  await audit(session, `Removeu a conta ${staff.role} de ${staff.name}`, "User", id);
  revalidatePath("/admin/equipa");
}

const TurmaSchema = z.object({
  cursoId: z.string().min(1, "Curso é obrigatório"),
  anoCurricular: z.coerce.number("Indique o ano").int().min(1, "Mínimo 1º ano").max(8, "Máximo 8º ano"),
  periodo: z.enum(["MATUTINO", "VESPERTINO", "NOTURNO"], { message: "Período inválido" }),
  anoLetivo: z.coerce.number("Indique o ano letivo").int().min(2000, "Ano letivo inválido").max(2100, "Ano letivo inválido"),
});

const CAMPOS_TURMA = ["cursoId", "anoCurricular", "periodo", "anoLetivo"] as const;
export type CreateTurmaState = FormState<Record<(typeof CAMPOS_TURMA)[number], string>>;

export async function createTurmaAction(
  _prevState: CreateTurmaState,
  formData: FormData,
): Promise<CreateTurmaState> {
  const session = await requireGerirCurriculo();
  const parsed = TurmaSchema.safeParse({
    cursoId: formData.get("cursoId"),
    anoCurricular: formData.get("anoCurricular"),
    periodo: formData.get("periodo"),
    anoLetivo: formData.get("anoLetivo"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_TURMA);

  // Não se cria uma turma para um ano letivo já passado: não haveria alunos a matricular nela, e o
  // histórico entra na BD pelo rollover automático (rolloverTurmas, que chama prisma.turma.create
  // diretamente e não passa por aqui), nunca por criação manual retroativa.
  const agora = await getAgora();
  const anoLetivoCorrente = agora.getFullYear();
  if (parsed.data.anoLetivo < anoLetivoCorrente) {
    return {
      fieldErrors: {
        anoLetivo: `O ano letivo ${parsed.data.anoLetivo} já passou — a turma mais antiga que pode criar é de ${anoLetivoCorrente}.`,
      },
      values: extrairValores(formData, CAMPOS_TURMA),
    };
  }

  // Mesmo limite do plano curricular: o ano da turma não pode passar a duração do curso. Sem isto,
  // uma turma de "5º ano" num curso de 3 anos passava, e anosAnterioresEmFalta (entrada direta)
  // passaria a exigir turmas de anos que nunca deviam existir.
  const cursoDaTurma = await prisma.curso.findUnique({
    where: { id: parsed.data.cursoId },
    select: { duracaoAnos: true },
  });
  if (!cursoDaTurma) {
    return {
      fieldErrors: { cursoId: "Curso não encontrado." },
      values: extrairValores(formData, CAMPOS_TURMA),
    };
  }
  if (parsed.data.anoCurricular > cursoDaTurma.duracaoAnos) {
    return {
      fieldErrors: {
        anoCurricular: `Este curso dura ${cursoDaTurma.duracaoAnos} ano(s) — não pode ter turmas no ${parsed.data.anoCurricular}º ano.`,
      },
      values: extrairValores(formData, CAMPOS_TURMA),
    };
  }

  // O plano curricular já diz que disciplinas se leccionam neste curso×ano — a turma nasce com
  // elas (§pedido do cliente 2026-08-27), em vez de alguém as adicionar uma a uma. Fica só o
  // professor por atribuir; a disciplina já é visível ao aluno e pode entrar no horário.
  const cadeirasDoPlano = await prisma.cadeiraCurricular.findMany({
    where: { cursoId: parsed.data.cursoId, anoCurricular: parsed.data.anoCurricular },
    select: { id: true, disciplinaId: true, semestre: true },
  });

  try {
    const turma = await prisma.turma.create({ data: parsed.data, include: { curso: true } });
    if (cadeirasDoPlano.length > 0) {
      await prisma.turmaDisciplina.createMany({
        data: cadeirasDoPlano.map((cadeira) => ({
          turmaId: turma.id,
          disciplinaId: cadeira.disciplinaId,
          cadeiraCurricularId: cadeira.id,
          professorId: null,
          semestre: cadeira.semestre,
          sala: SALA_A_CONFIRMAR,
        })),
        skipDuplicates: true,
      });
    }
    await audit(
      session,
      cadeirasDoPlano.length > 0
        ? `Criou a turma ${turma.curso.nome} - ${turma.anoCurricular}º Ano (${cadeirasDoPlano.length} disciplina(s) do plano curricular, professor por atribuir)`
        : `Criou a turma ${turma.curso.nome} - ${turma.anoCurricular}º Ano (plano curricular ainda sem disciplinas para este ano)`,
      "Turma",
      turma.id,
    );
  } catch {
    return {
      error: "Não foi possível criar a turma (já existe uma igual para este curso, ano e período?).",
      values: extrairValores(formData, CAMPOS_TURMA),
    };
  }

  revalidatePath("/admin/turmas");
  return {};
}

export async function deleteTurmaAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  try {
    const turma = await prisma.turma.delete({ where: { id }, include: { curso: true } });
    await audit(session, `Removeu a turma ${turma.curso.nome} - ${turma.anoCurricular}º Ano`, "Turma", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: esta turma ainda tem alunos matriculados ou disciplinas atribuídas.");
    }
    throw error;
  }
  revalidatePath("/admin/turmas");
}

const TurmaDisciplinaSchema = z.object({
  turmaId: z.string().min(1, "Turma é obrigatória"),
  cadeiraCurricularId: z.string().min(1, "Cadeira é obrigatória"),
  professorId: z.string().min(1, "Professor é obrigatório"),
  sala: z.string().min(1, "Sala é obrigatória"),
});

const CAMPOS_TURMA_DISCIPLINA = ["turmaId", "cadeiraCurricularId", "professorId", "sala"] as const;
export type CreateTurmaDisciplinaState = FormState<Record<(typeof CAMPOS_TURMA_DISCIPLINA)[number], string>>;

export async function createTurmaDisciplinaAction(
  _prevState: CreateTurmaDisciplinaState,
  formData: FormData,
): Promise<CreateTurmaDisciplinaState> {
  const session = await requireGerirCurriculo();
  const parsed = TurmaDisciplinaSchema.safeParse({
    turmaId: formData.get("turmaId"),
    cadeiraCurricularId: formData.get("cadeiraCurricularId"),
    professorId: formData.get("professorId"),
    sala: formData.get("sala"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_TURMA_DISCIPLINA);

  const [cadeiraCurricular, turma] = await Promise.all([
    prisma.cadeiraCurricular.findUnique({ where: { id: parsed.data.cadeiraCurricularId } }),
    prisma.turma.findUnique({ where: { id: parsed.data.turmaId } }),
  ]);
  if (!cadeiraCurricular) {
    return {
      fieldErrors: { cadeiraCurricularId: "Cadeira curricular inválida." },
      values: extrairValores(formData, CAMPOS_TURMA_DISCIPLINA),
    };
  }
  if (!turma) {
    return { fieldErrors: { turmaId: "Turma inválida." }, values: extrairValores(formData, CAMPOS_TURMA_DISCIPLINA) };
  }
  // A página só lista cadeiras do curso/ano da turma (turmas/[id]/page.tsx), mas isso é só o filtro
  // do <select> — sem esta verificação, um pedido direto (ou uma aba desatualizada) consegue
  // atribuir uma cadeira de 3º ano de Gestão a uma turma de 1º ano de Eng. Informática. Mesma
  // classe do IDOR já corrigido em lancarNotasEmLoteAction (Fase 0): nunca confiar só no filtro da UI.
  if (cadeiraCurricular.cursoId !== turma.cursoId || cadeiraCurricular.anoCurricular !== turma.anoCurricular) {
    return {
      fieldErrors: { cadeiraCurricularId: "Esta cadeira não pertence ao curso/ano desta turma." },
      values: extrairValores(formData, CAMPOS_TURMA_DISCIPLINA),
    };
  }

  try {
    const turmaDisciplina = await prisma.turmaDisciplina.create({
      data: {
        turmaId: parsed.data.turmaId,
        cadeiraCurricularId: parsed.data.cadeiraCurricularId,
        disciplinaId: cadeiraCurricular.disciplinaId,
        semestre: cadeiraCurricular.semestre,
        professorId: parsed.data.professorId,
        sala: parsed.data.sala,
      },
      include: { disciplina: true },
    });
    await audit(session, `Atribuiu ${turmaDisciplina.disciplina.nome} à turma`, "TurmaDisciplina", turmaDisciplina.id);
  } catch {
    return {
      error: "Não foi possível atribuir a disciplina (já está atribuída a esta turma?).",
      values: extrairValores(formData, CAMPOS_TURMA_DISCIPLINA),
    };
  }

  // Alunos já matriculados nesta turma que ainda não tinham esta cadeira ficam inscritos agora.
  await sincronizarInscricoesTurma(parsed.data.turmaId);

  revalidatePath(`/admin/turmas/${parsed.data.turmaId}`);
  return {};
}

const ProfessorTurmaDisciplinaSchema = z.object({
  id: z.string().min(1),
  // Vazio = "Por atribuir": a disciplina nasce do plano curricular sem professor, e o DAAC tem de
  // poder voltar a esse estado se atribuir o professor errado.
  professorId: z.string().transform((v) => (v.trim() === "" ? null : v.trim())),
});

/** Atribui, troca ou remove o professor de uma disciplina já numa turma, sem apagar a linha (e o histórico de horários/provas que ela arrasta). */
export async function atualizarProfessorTurmaDisciplinaAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireGerirCurriculo();
  const parsed = ProfessorTurmaDisciplinaSchema.safeParse({
    id: formData.get("id"),
    professorId: formData.get("professorId"),
  });
  if (!parsed.success) return { error: "Professor inválido." };

  const antes = await prisma.turmaDisciplina.findUnique({
    where: { id: parsed.data.id },
    include: { disciplina: true, professor: true },
  });
  if (!antes) return { error: "Disciplina-turma não encontrada." };

  const depois = await prisma.turmaDisciplina.update({
    where: { id: parsed.data.id },
    data: { professorId: parsed.data.professorId },
    include: { professor: true },
  });

  await audit(
    session,
    // A disciplina nasce do plano curricular sem professor, por isso "atribuiu" (primeira vez) é
    // agora tão comum como "trocou" — a auditoria tem de distinguir os dois casos.
    antes.professor
      ? `Trocou o professor de ${antes.disciplina.nome} na turma`
      : `Atribuiu o professor de ${antes.disciplina.nome} na turma`,
    "TurmaDisciplina",
    antes.id,
    { valorAnterior: nomeProfessor(antes.professor), valorNovo: nomeProfessor(depois.professor) },
  );

  revalidatePath(`/admin/turmas/${antes.turmaId}`);
  return {};
}

const OrientadorSchema = z.object({
  inscricaoId: z.string().min(1),
  // "" = retirar o orientador. Um seletor sem esta opção obrigaria a apagar e recriar a inscrição
  // para corrigir um engano.
  orientadorId: z.string(),
});

/**
 * Atribui (ou retira) o orientador de uma monografia — §pedido do cliente 2026-09-04.
 *
 * O limite por professor (ConfiguracaoAcademica.limiteOrientandosPorProfessor, 0 = sem limite) é
 * validado aqui e não por constraint: o DAAC precisa de saber QUEM está cheio e com quantos, não
 * de um erro de base de dados. Contam-se só as inscrições ATIVAS — uma monografia de um ano
 * anterior, já fechada, não ocupa lugar este ano.
 */
export async function atribuirOrientadorAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireGerirCurriculo();
  const parsed = OrientadorSchema.safeParse({
    inscricaoId: formData.get("inscricaoId"),
    orientadorId: formData.get("orientadorId"),
  });
  if (!parsed.success) return { error: "Dados inválidos." };
  const novoOrientadorId = parsed.data.orientadorId || null;

  const antes = await prisma.inscricaoCadeira.findUnique({
    where: { id: parsed.data.inscricaoId },
    include: { aluno: { select: { nome: true } }, orientador: { select: { nome: true } } },
  });
  if (!antes) return { error: "Inscrição não encontrada." };
  if (!antes.eMonografiaAplicada) return { error: "Esta cadeira não é uma monografia — não tem orientador." };
  if (antes.orientadorId === novoOrientadorId) return {};

  let nomeNovo: string | null = null;
  if (novoOrientadorId) {
    const [professor, config, jaOrienta] = await Promise.all([
      prisma.professor.findUnique({ where: { id: novoOrientadorId }, select: { nome: true } }),
      prisma.configuracaoAcademica.findUnique({
        where: { id: "config" },
        select: { limiteOrientandosPorProfessor: true },
      }),
      prisma.inscricaoCadeira.count({ where: { orientadorId: novoOrientadorId, ativa: true } }),
    ]);
    if (!professor) return { error: "Professor não encontrado." };
    nomeNovo = professor.nome;

    const limite = config?.limiteOrientandosPorProfessor ?? 5;
    if (limite > 0 && jaOrienta >= limite) {
      return {
        error: `${professor.nome} já orienta ${jaOrienta} monografia(s), o máximo configurado. Escolha outro professor, ou suba o limite em Configuração Académica.`,
      };
    }
  }

  await prisma.inscricaoCadeira.update({
    where: { id: parsed.data.inscricaoId },
    data: { orientadorId: novoOrientadorId },
  });

  await audit(
    session,
    novoOrientadorId
      ? `${antes.orientador ? "Trocou" : "Atribuiu"} o orientador da monografia de ${antes.aluno.nome}`
      : `Retirou o orientador da monografia de ${antes.aluno.nome}`,
    "InscricaoCadeira",
    antes.id,
    { valorAnterior: antes.orientador?.nome ?? "Sem orientador", valorNovo: nomeNovo ?? "Sem orientador" },
  );

  revalidatePath("/admin/finalistas");
  // O aluno e o professor veem a mudança nas suas próprias páginas — sem isto, só no próximo
  // pedido não-cache.
  revalidatePath("/meu-orientador");
  revalidatePath("/professor/orientandos");
  return {};
}

export async function deleteTurmaDisciplinaAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  let turmaId: string;
  try {
    const turmaDisciplina = await prisma.turmaDisciplina.delete({
      where: { id },
      include: { disciplina: true },
    });
    await audit(session, `Removeu ${turmaDisciplina.disciplina.nome} da turma`, "TurmaDisciplina", id);
    turmaId = turmaDisciplina.turmaId;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: esta disciplina ainda tem alunos inscritos, avaliações ou aulas registadas na turma.");
    }
    throw error;
  }
  revalidatePath(`/admin/turmas/${turmaId}`);
}

const EmolumentoSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  descricao: z.string().optional(),
  valor: z.coerce.number("Indique o valor").min(0, "O valor não pode ser negativo"),
});

const CAMPOS_EMOLUMENTO = ["nome", "descricao", "valor"] as const;
export type CreateEmolumentoState = FormState<Record<(typeof CAMPOS_EMOLUMENTO)[number], string>>;

export async function createEmolumentoAction(
  _prevState: CreateEmolumentoState,
  formData: FormData,
): Promise<CreateEmolumentoState> {
  const session = await requireGerirCurriculo();
  const parsed = EmolumentoSchema.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao") || undefined,
    valor: formData.get("valor"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_EMOLUMENTO);

  const emolumento = await prisma.emolumento.create({ data: parsed.data });
  await audit(session, `Criou o emolumento ${emolumento.nome}`, "Emolumento", emolumento.id);

  revalidatePath("/admin/emolumentos");
  return {};
}

const AtualizarEmolumentoSchema = z.object({
  emolumentoId: z.string().min(1),
  valor: z.coerce.number("Indique o valor").min(0, "O valor não pode ser negativo"),
});

export async function atualizarValorEmolumentoAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireGerirCurriculo();
  const parsed = AtualizarEmolumentoSchema.safeParse({
    emolumentoId: formData.get("emolumentoId"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) return { error: "Valor inválido." };

  const emolumentoAntes = await prisma.emolumento.findUnique({ where: { id: parsed.data.emolumentoId } });
  const emolumento = await prisma.emolumento.update({
    where: { id: parsed.data.emolumentoId },
    data: { valor: parsed.data.valor },
  });
  await audit(
    session,
    `Atualizou o valor de ${emolumento.nome} para ${parsed.data.valor} Kz`,
    "Emolumento",
    emolumento.id,
    emolumentoAntes ? { valorAnterior: `${Number(emolumentoAntes.valor)} Kz`, valorNovo: `${parsed.data.valor} Kz` } : undefined,
  );

  revalidatePath("/admin/emolumentos");
  revalidatePath("/emolumentos");
  return {};
}

export async function toggleEmolumentoAtivoAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  const emolumento = await prisma.emolumento.findUniqueOrThrow({ where: { id } });
  const atualizado = await prisma.emolumento.update({ where: { id }, data: { ativo: !emolumento.ativo } });
  await audit(
    session,
    `${atualizado.ativo ? "Reativou" : "Desativou"} o emolumento ${atualizado.nome}`,
    "Emolumento",
    id,
  );

  revalidatePath("/admin/emolumentos");
  revalidatePath("/emolumentos");
}

export async function deleteEmolumentoAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  const emolumento = await prisma.emolumento.delete({ where: { id } });
  await audit(session, `Removeu o emolumento ${emolumento.nome}`, "Emolumento", id);

  revalidatePath("/admin/emolumentos");
}
