"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { requireGerirFrequencia } from "@/lib/permissions";
import { fromIsoDate } from "@/lib/utils";

const ToggleFrequenciaSchema = z.object({
  frequenciaId: z.string().min(1),
});

export async function toggleFrequenciaAction(formData: FormData) {
  const session = await requireGerirFrequencia();
  const { frequenciaId } = ToggleFrequenciaSchema.parse({
    frequenciaId: formData.get("frequenciaId"),
  });

  const frequencia = await prisma.frequencia.findUnique({
    where: { id: frequenciaId },
    include: {
      inscricaoCadeira: { include: { aluno: true } },
      aula: { include: { turmaDisciplina: true } },
    },
  });
  if (!frequencia) throw new Error("Registo de frequência não encontrado.");

  if (session.user.role === "PROFESSOR" && frequencia.aula.turmaDisciplina.professorId !== session.user.professorId) {
    throw new Error("Só pode marcar presença nas suas próprias disciplinas.");
  }

  const novoEstado = !frequencia.presente;
  await prisma.frequencia.update({
    where: { id: frequenciaId },
    data: { presente: novoEstado, justificada: novoEstado ? null : frequencia.justificada },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: novoEstado
      ? `Marcou ${frequencia.inscricaoCadeira.aluno.nome} como presente (de não presente para presente)`
      : `Marcou ${frequencia.inscricaoCadeira.aluno.nome} como não presente (de presente para não presente)`,
    entityType: "Frequencia",
    entityId: frequencia.id,
  });

  revalidatePath("/notas");
  revalidatePath("/professor");
}

const CreateAulaSchema = z.object({
  turmaDisciplinaId: z.string().min(1, "Disciplina é obrigatória"),
  data: z.string().min(1, "Data é obrigatória"),
  tema: z.string().optional(),
});

const CAMPOS_AULA = ["turmaDisciplinaId", "data", "tema"] as const;
export type CreateAulaState = FormState<Record<(typeof CAMPOS_AULA)[number], string>>;

export async function createAulaAction(
  _prevState: CreateAulaState,
  formData: FormData,
): Promise<CreateAulaState> {
  const session = await requireGerirFrequencia();
  const parsed = CreateAulaSchema.safeParse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    data: formData.get("data"),
    tema: formData.get("tema") || undefined,
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_AULA);

  const dados = parsed.data;
  const valores = extrairValores(formData, CAMPOS_AULA);

  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: dados.turmaDisciplinaId },
    include: { disciplina: true, horarioSlots: true, inscricoes: { where: { ativa: true } } },
  });
  if (!turmaDisciplina) {
    return { fieldErrors: { turmaDisciplinaId: "Disciplina não encontrada." }, values: valores };
  }
  if (session.user.role === "PROFESSOR" && turmaDisciplina.professorId !== session.user.professorId) {
    return { error: "Só pode criar aulas nas suas próprias disciplinas.", values: valores };
  }

  // A MESMA data serve para validar o dia da semana e para gravar — antes, a validação usava
  // "…T00:00:00" (hora local, certo) e a gravação `new Date(dados.data)` (meia-noite UTC), pelo
  // que a oeste de Greenwich a aula era validada contra um dia e guardada noutro.
  const dataAula = fromIsoDate(dados.data);
  if (!dataAula) {
    return { fieldErrors: { data: "Data inválida" }, values: valores };
  }

  const JS_DAY_TO_DIA_SEMANA = ["DOMINGO", "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"];
  const diaEscolhido = JS_DAY_TO_DIA_SEMANA[dataAula.getDay()];
  const diasLetivos = new Set<string>(turmaDisciplina.horarioSlots.map((s) => s.diaSemana));
  if (!diasLetivos.has(diaEscolhido)) {
    return {
      fieldErrors: { data: "A data escolhida não corresponde a um dia letivo desta disciplina." },
      values: valores,
    };
  }

  const aula = await prisma.aula.create({
    data: {
      turmaDisciplinaId: dados.turmaDisciplinaId,
      data: dataAula,
      tema: dados.tema ?? null,
    },
  });

  await prisma.frequencia.createMany({
    data: turmaDisciplina.inscricoes.map((inscricao) => ({
      aulaId: aula.id,
      inscricaoCadeiraId: inscricao.id,
      presente: false,
    })),
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Criou uma aula de ${turmaDisciplina.disciplina.nome} em ${dados.data}`,
    entityType: "Aula",
    entityId: aula.id,
  });

  revalidatePath("/notas");
  revalidatePath("/professor");
  return {};
}
