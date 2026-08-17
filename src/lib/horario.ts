/**
 * Deteção de conflitos de horário — puro, sem acesso a BD, para poder ser testado isoladamente
 * (mesmo padrão de avaliacao.ts/divida.ts). `createHorarioSlotAction` (src/actions/horario.ts) não
 * tinha nenhuma deteção de conflitos: nada impedia um professor, sala ou turma ficarem com dois
 * horários sobrepostos no mesmo dia.
 */

export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Dois intervalos [aInicio,aFim) e [bInicio,bFim) sobrepõem-se — assume horaFim > horaInicio em ambos. */
export function intervalosSobrepoem(aInicio: string, aFim: string, bInicio: string, bFim: string): boolean {
  return horaParaMinutos(aInicio) < horaParaMinutos(bFim) && horaParaMinutos(bInicio) < horaParaMinutos(aFim);
}

export interface SlotExistente {
  id: string;
  diaSemana: string;
  horaInicio: string;
  horaFim: string;
  sala: string;
  professorId: string;
  turmaId: string;
  disciplinaNome: string;
}

export interface NovoSlot {
  diaSemana: string;
  horaInicio: string;
  horaFim: string;
  sala: string;
  professorId: string;
  turmaId: string;
}

export interface ConflitoHorario {
  tipo: "professor" | "sala" | "turma";
  slot: SlotExistente;
}

/**
 * Três eixos independentes de conflito, no mesmo dia da semana: o mesmo professor não pode estar
 * em dois sítios, a mesma sala não pode ter duas aulas, e a mesma turma (coorte) não pode ter duas
 * disciplinas em simultâneo — os alunos não conseguem estar nas duas. Devolve o primeiro conflito
 * encontrado (por ordem professor → sala → turma), não todos — um já chega para bloquear e explicar.
 */
export function encontrarConflito(novo: NovoSlot, existentes: SlotExistente[]): ConflitoHorario | null {
  const noMesmoDia = existentes.filter((s) => s.diaSemana === novo.diaSemana);
  const sobrepostos = noMesmoDia.filter((s) => intervalosSobrepoem(novo.horaInicio, novo.horaFim, s.horaInicio, s.horaFim));

  const conflitoProfessor = sobrepostos.find((s) => s.professorId === novo.professorId);
  if (conflitoProfessor) return { tipo: "professor", slot: conflitoProfessor };

  const conflitoSala = sobrepostos.find((s) => s.sala.trim().toLowerCase() === novo.sala.trim().toLowerCase());
  if (conflitoSala) return { tipo: "sala", slot: conflitoSala };

  const conflitoTurma = sobrepostos.find((s) => s.turmaId === novo.turmaId);
  if (conflitoTurma) return { tipo: "turma", slot: conflitoTurma };

  return null;
}
