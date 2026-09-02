"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { isForeignKeyViolation } from "@/lib/prisma-errors";
import { requireGerirCurriculo, type SessionComUser } from "@/lib/permissions";
import { EPOCA_LABEL, motivoAgendamentoInvalido, provaJaPassou } from "@/lib/avaliacao";
import { HORA_REGEX, encontrarConflito, type SlotExistente } from "@/lib/horario";
import { formatAnoLetivo, formatDate, fromIsoDate } from "@/lib/utils";
import { anoLetivoCorrente, dentroDoAnoLetivo } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";

async function audit(session: SessionComUser, action: string, entityType: string, entityId?: string) {
  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action,
    entityType,
    entityId,
  });
}

const HorarioSlotSchema = z
  .object({
    turmaDisciplinaId: z.string().min(1, "Disciplina é obrigatória"),
    diaSemana: z.enum(["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"], { message: "Dia inválido" }),
    horaInicio: z.string().regex(HORA_REGEX, "Hora de início inválida (use HH:MM)"),
    horaFim: z.string().regex(HORA_REGEX, "Hora de fim inválida (use HH:MM)"),
    sala: z.string().min(1, "Sala é obrigatória"),
  })
  .refine((v) => v.horaFim > v.horaInicio, {
    message: "A hora de fim tem de ser depois da hora de início",
    path: ["horaFim"],
  });

const CAMPOS_HORARIO_SLOT = ["turmaDisciplinaId", "diaSemana", "horaInicio", "horaFim", "sala"] as const;
export type CreateHorarioSlotState = FormState<Record<(typeof CAMPOS_HORARIO_SLOT)[number], string>>;

const CONFLITO_LABEL: Record<"professor" | "sala" | "turma", string> = {
  professor: "O professor já tem outra aula marcada neste horário",
  sala: "Esta sala já está ocupada neste horário",
  turma: "Esta turma já tem outra disciplina marcada neste horário",
};

export async function createHorarioSlotAction(
  _prevState: CreateHorarioSlotState,
  formData: FormData,
): Promise<CreateHorarioSlotState> {
  const session = await requireGerirCurriculo();
  const parsed = HorarioSlotSchema.safeParse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    diaSemana: formData.get("diaSemana"),
    horaInicio: formData.get("horaInicio"),
    horaFim: formData.get("horaFim"),
    sala: formData.get("sala"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_HORARIO_SLOT);

  const alvo = await prisma.turmaDisciplina.findUnique({
    where: { id: parsed.data.turmaDisciplinaId },
    select: { professorId: true, turmaId: true, semestre: true, turma: { select: { anoLetivo: true } } },
  });
  if (!alvo) {
    return {
      fieldErrors: { turmaDisciplinaId: "Disciplina inválida." },
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

  // Mesma regra das provas: o horário pertence a um semestre de um ano letivo. Um ano letivo
  // encerrado é histórico — não se lhe acrescentam aulas.
  const [agora, config] = await Promise.all([
    getAgora(),
    prisma.configuracaoAcademica.findUnique({
      where: { id: "config" },
      select: { anoLetivoInicio: true, anoLetivoFim: true, semestreAtual: true },
    }),
  ]);
  const anoLetivo = anoLetivoCorrente(agora, config);
  if (anoLetivo !== null && alvo.turma.anoLetivo !== anoLetivo) {
    return {
      error: `Esta turma é do ano letivo ${formatAnoLetivo(alvo.turma.anoLetivo)}. Só se marcam aulas no ano letivo a decorrer (${formatAnoLetivo(anoLetivo)}).`,
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }
  // O horário do semestre seguinte não se marca adiantado: o plano curricular ainda pode mudar, e
  // com ele as disciplinas atribuídas às turmas (§decisão do cliente 2026-08-29).
  if (config && alvo.semestre !== config.semestreAtual) {
    return {
      error: `Esta disciplina é do ${alvo.semestre}º semestre e corre o ${config.semestreAtual}º. Só se marca o horário do semestre a decorrer — o plano curricular do próximo ainda pode mudar.`,
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

  // Nada impedia até aqui um professor, sala ou turma ficarem com dois horários sobrepostos no
  // mesmo dia — comb da simulação encontrou isto antes de a simulação sequer correr. Só compara
  // slots do mesmo dia (o resto não pode conflituar por definição).
  const candidatos = await prisma.horarioSlot.findMany({
    where: { diaSemana: parsed.data.diaSemana },
    include: { turmaDisciplina: { include: { disciplina: true } } },
  });
  const existentes: SlotExistente[] = candidatos.map((s) => ({
    id: s.id,
    diaSemana: s.diaSemana,
    horaInicio: s.horaInicio,
    horaFim: s.horaFim,
    sala: s.sala,
    professorId: s.turmaDisciplina.professorId,
    turmaId: s.turmaDisciplina.turmaId,
    disciplinaNome: s.turmaDisciplina.disciplina.nome,
  }));
  const conflito = encontrarConflito(
    {
      diaSemana: parsed.data.diaSemana,
      horaInicio: parsed.data.horaInicio,
      horaFim: parsed.data.horaFim,
      sala: parsed.data.sala,
      professorId: alvo.professorId,
      turmaId: alvo.turmaId,
    },
    existentes,
  );
  if (conflito) {
    return {
      error: `${CONFLITO_LABEL[conflito.tipo]} (${conflito.slot.disciplinaNome}, ${conflito.slot.horaInicio}–${conflito.slot.horaFim}).`,
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

  try {
    const slot = await prisma.horarioSlot.create({
      data: parsed.data,
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(
      session,
      `Adicionou horário de aula para ${slot.turmaDisciplina.disciplina.nome}`,
      "HorarioSlot",
      slot.id,
    );
  } catch {
    return {
      error: "Não foi possível adicionar o horário.",
      values: extrairValores(formData, CAMPOS_HORARIO_SLOT),
    };
  }

  revalidatePath("/horario");
  return {};
}

export async function deleteHorarioSlotAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  const slot = await prisma.horarioSlot.delete({
    where: { id },
    include: { turmaDisciplina: { include: { disciplina: true } } },
  });
  await audit(session, `Removeu horário de aula de ${slot.turmaDisciplina.disciplina.nome}`, "HorarioSlot", id);
  revalidatePath("/horario");
}

const ProvaSchema = z.object({
  turmaDisciplinaId: z.string().min(1, "Disciplina é obrigatória"),
  epoca: z.enum(["P1", "P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"], { message: "Época inválida" }),
  data: z.string().min(1, "Data é obrigatória"),
  sala: z.string().min(1, "Sala é obrigatória"),
});

const CAMPOS_PROVA = ["turmaDisciplinaId", "epoca", "data", "sala"] as const;
export type CreateProvaState = FormState<Record<(typeof CAMPOS_PROVA)[number], string>>;

export async function createProvaAction(
  _prevState: CreateProvaState,
  formData: FormData,
): Promise<CreateProvaState> {
  const session = await requireGerirCurriculo();
  const parsed = ProvaSchema.safeParse({
    turmaDisciplinaId: formData.get("turmaDisciplinaId"),
    epoca: formData.get("epoca"),
    data: formData.get("data"),
    sala: formData.get("sala"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_PROVA);

  // fromIsoDate, não new Date(): ver nota em lib/utils — a forma só-data é meia-noite UTC, mas
  // toIsoDate/getDate leem em hora local, e o par perdia um dia a oeste de Greenwich.
  const dataProva = fromIsoDate(parsed.data.data);
  if (!dataProva) {
    return {
      fieldErrors: { data: "Data inválida" },
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }

  // Ano letivo → semestre → provas: a prova pertence ao semestre de um ano letivo, e não se marca
  // fora dele (§pedido do cliente 2026-08-28). Recusado aqui, não só na UI — a página já não
  // oferece turmas de outros anos, mas um POST direto ignorava-a.
  const alvo = await prisma.turmaDisciplina.findUnique({
    where: { id: parsed.data.turmaDisciplinaId },
    select: { semestre: true, turma: { select: { anoLetivo: true } } },
  });
  if (!alvo) {
    return { fieldErrors: { turmaDisciplinaId: "Disciplina inválida." }, values: extrairValores(formData, CAMPOS_PROVA) };
  }

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  const anoLetivo = anoLetivoCorrente(agora, config);
  if (anoLetivo !== null && alvo.turma.anoLetivo !== anoLetivo) {
    return {
      error: `Esta turma é do ano letivo ${formatAnoLetivo(alvo.turma.anoLetivo)}. Só se marcam provas no ano letivo a decorrer (${formatAnoLetivo(anoLetivo)}).`,
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }
  if (alvo.semestre !== config.semestreAtual) {
    return {
      error: `Esta disciplina é do ${alvo.semestre}º semestre e corre o ${config.semestreAtual}º. Só se marcam provas do semestre a decorrer — o plano curricular do próximo ainda pode mudar.`,
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }
  if (!dentroDoAnoLetivo(dataProva, config)) {
    return {
      fieldErrors: { data: "A data tem de cair dentro do ano letivo a decorrer." },
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }
  // Uma prova agenda-se para o futuro. Comparado ao DIA (não à hora): uma prova marcada para hoje
  // é legítima — é a de amanhã em diante que interessa não excluir, e a de ontem que não faz
  // sentido nenhum.
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (dataProva < hoje) {
    return {
      fieldErrors: { data: "Não é possível agendar uma prova para uma data que já passou." },
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }

  // A cascata P1 → P2 → Exame → Recurso → Especial tem de ser respeitada na marcação, não só no
  // cálculo: um Exame marcado para antes do P2 nunca chegaria a ter uma frequência para combinar.
  const jaAgendadas = await prisma.avaliacao.findMany({
    where: { turmaDisciplinaId: parsed.data.turmaDisciplinaId },
    select: { epoca: true, data: true },
  });
  const ordemInvalida = motivoAgendamentoInvalido(parsed.data.epoca, dataProva, jaAgendadas);
  if (ordemInvalida) {
    const mensagem =
      ordemInvalida.tipo === "JA_AGENDADA"
        ? `Já existe uma ${EPOCA_LABEL[parsed.data.epoca]} agendada para esta disciplina.`
        : ordemInvalida.tipo === "FALTA_ANTERIOR"
          ? `Agende primeiro a ${EPOCA_LABEL[ordemInvalida.anterior]} — as épocas seguem a ordem P1 → P2 → Exame → Recurso → Exame Especial.`
          : `A ${EPOCA_LABEL[parsed.data.epoca]} tem de ser depois da ${EPOCA_LABEL[ordemInvalida.anterior]} (${formatDate(ordemInvalida.dataAnterior)}).`;
    return { error: mensagem, values: extrairValores(formData, CAMPOS_PROVA) };
  }

  try {
    const prova = await prisma.avaliacao.create({
      data: {
        turmaDisciplinaId: parsed.data.turmaDisciplinaId,
        epoca: parsed.data.epoca,
        sala: parsed.data.sala,
        data: dataProva,
      },
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(
      session,
      `Agendou "${EPOCA_LABEL[prova.epoca]}" para ${prova.turmaDisciplina.disciplina.nome}`,
      "Avaliacao",
      prova.id,
    );
  } catch {
    return {
      error: "Não foi possível agendar a prova (pode já existir uma avaliação desta época para esta disciplina).",
      values: extrairValores(formData, CAMPOS_PROVA),
    };
  }

  revalidatePath("/horario");
  return {};
}

const EditarProvaSchema = z.object({
  id: z.string().min(1),
  data: z.string().min(1, "Data é obrigatória"),
  sala: z.string().min(1, "Sala é obrigatória"),
});

const CAMPOS_EDITAR_PROVA = ["id", "data", "sala"] as const;
export type EditarProvaState = FormState<Record<(typeof CAMPOS_EDITAR_PROVA)[number], string>>;

/**
 * Remarcar uma prova já agendada (§pedido do cliente 2026-08-31). Só o dia e a sala se mudam — a
 * época e a disciplina não, porque mudá-las seria outra prova, e a cascata de épocas deixaria de
 * fazer sentido; para isso apaga-se e agenda-se de novo.
 *
 * Só ENQUANTO a prova não passou: depois de dada, a data é registo do que aconteceu, e mexer-lhe
 * moveria o prazo de lançamento de notas de uma prova já corrigida. No próprio dia ainda se edita
 * (provaJaPassou compara por dia) — é normal remarcar de manhã uma prova da tarde.
 */
export async function editarProvaAction(
  _prevState: EditarProvaState,
  formData: FormData,
): Promise<EditarProvaState> {
  const session = await requireGerirCurriculo();
  const parsed = EditarProvaSchema.safeParse({
    id: formData.get("id"),
    data: formData.get("data"),
    sala: formData.get("sala"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_EDITAR_PROVA);

  const dataProva = fromIsoDate(parsed.data.data);
  if (!dataProva) {
    return { fieldErrors: { data: "Data inválida" }, values: extrairValores(formData, CAMPOS_EDITAR_PROVA) };
  }

  const existente = await prisma.avaliacao.findUnique({
    where: { id: parsed.data.id },
    select: {
      epoca: true,
      data: true,
      turmaDisciplinaId: true,
      turmaDisciplina: { select: { semestre: true, turma: { select: { anoLetivo: true } } } },
    },
  });
  if (!existente) {
    return { error: "Prova não encontrada.", values: extrairValores(formData, CAMPOS_EDITAR_PROVA) };
  }

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });

  // O portão que o cliente pediu: passado o dia da prova, deixa de se poder remarcar.
  if (provaJaPassou(existente.data, agora)) {
    return {
      error: `Esta prova já foi dada (${formatDate(existente.data)}) — já não pode ser remarcada.`,
      values: extrairValores(formData, CAMPOS_EDITAR_PROVA),
    };
  }

  // As mesmas regras da marcação: uma remarcação não pode pôr a prova onde a marcação não a
  // deixaria criar de raiz.
  const anoLetivo = anoLetivoCorrente(agora, config);
  if (anoLetivo !== null && existente.turmaDisciplina.turma.anoLetivo !== anoLetivo) {
    return {
      error: `Esta turma é do ano letivo ${formatAnoLetivo(existente.turmaDisciplina.turma.anoLetivo)}. Só se remarcam provas no ano letivo a decorrer (${formatAnoLetivo(anoLetivo)}).`,
      values: extrairValores(formData, CAMPOS_EDITAR_PROVA),
    };
  }
  if (existente.turmaDisciplina.semestre !== config.semestreAtual) {
    return {
      error: `Esta disciplina é do ${existente.turmaDisciplina.semestre}º semestre e corre o ${config.semestreAtual}º.`,
      values: extrairValores(formData, CAMPOS_EDITAR_PROVA),
    };
  }
  if (!dentroDoAnoLetivo(dataProva, config)) {
    return {
      fieldErrors: { data: "A data tem de cair dentro do ano letivo a decorrer." },
      values: extrairValores(formData, CAMPOS_EDITAR_PROVA),
    };
  }
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (dataProva < hoje) {
    return {
      fieldErrors: { data: "Não é possível remarcar uma prova para uma data que já passou." },
      values: extrairValores(formData, CAMPOS_EDITAR_PROVA),
    };
  }

  // A cascata continua a valer na nova data — excluindo esta prova da comparação, senão a sua
  // própria época contaria como "já agendada" e nenhuma edição passaria.
  const jaAgendadas = await prisma.avaliacao.findMany({
    where: { turmaDisciplinaId: existente.turmaDisciplinaId, id: { not: parsed.data.id } },
    select: { epoca: true, data: true },
  });
  const ordemInvalida = motivoAgendamentoInvalido(existente.epoca, dataProva, jaAgendadas);
  if (ordemInvalida) {
    const mensagem =
      ordemInvalida.tipo === "JA_AGENDADA"
        ? `Já existe uma ${EPOCA_LABEL[existente.epoca]} agendada para esta disciplina.`
        : ordemInvalida.tipo === "FALTA_ANTERIOR"
          ? `Agende primeiro a ${EPOCA_LABEL[ordemInvalida.anterior]} — as épocas seguem a ordem P1 → P2 → Exame → Recurso → Exame Especial.`
          : `A ${EPOCA_LABEL[existente.epoca]} tem de ser depois da ${EPOCA_LABEL[ordemInvalida.anterior]} (${formatDate(ordemInvalida.dataAnterior)}).`;
    return { error: mensagem, values: extrairValores(formData, CAMPOS_EDITAR_PROVA) };
  }

  const prova = await prisma.avaliacao.update({
    where: { id: parsed.data.id },
    data: { data: dataProva, sala: parsed.data.sala },
    include: { turmaDisciplina: { include: { disciplina: true } } },
  });
  await audit(
    session,
    `Remarcou "${EPOCA_LABEL[prova.epoca]}" de ${prova.turmaDisciplina.disciplina.nome} de ${formatDate(existente.data)} para ${formatDate(dataProva)}`,
    "Avaliacao",
    prova.id,
  );

  revalidatePath("/horario");
  return {};
}

export async function deleteProvaAction(formData: FormData) {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id"));
  try {
    const prova = await prisma.avaliacao.delete({
      where: { id },
      include: { turmaDisciplina: { include: { disciplina: true } } },
    });
    await audit(session, `Removeu "${EPOCA_LABEL[prova.epoca]}" de ${prova.turmaDisciplina.disciplina.nome}`, "Avaliacao", id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Não é possível remover: já existem notas lançadas para esta avaliação.");
    }
    throw error;
  }
  revalidatePath("/horario");
}
