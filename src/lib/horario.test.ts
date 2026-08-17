import { test } from "node:test";
import assert from "node:assert/strict";
import { intervalosSobrepoem, encontrarConflito, HORA_REGEX, type SlotExistente, type NovoSlot } from "./horario";

test("intervalosSobrepoem: deteta sobreposição parcial e total, não deteta intervalos adjacentes", () => {
  assert.equal(intervalosSobrepoem("08:00", "10:00", "09:00", "11:00"), true, "sobreposição parcial");
  assert.equal(intervalosSobrepoem("08:00", "10:00", "08:30", "09:30"), true, "contido dentro");
  assert.equal(intervalosSobrepoem("08:00", "10:00", "10:00", "12:00"), false, "adjacente, não sobrepõe");
  assert.equal(intervalosSobrepoem("08:00", "10:00", "06:00", "08:00"), false, "adjacente antes, não sobrepõe");
  assert.equal(intervalosSobrepoem("08:00", "10:00", "12:00", "14:00"), false, "sem relação");
});

test("HORA_REGEX aceita HH:MM válido, rejeita lixo", () => {
  assert.equal(HORA_REGEX.test("08:00"), true);
  assert.equal(HORA_REGEX.test("23:59"), true);
  assert.equal(HORA_REGEX.test("24:00"), false, "hora 24 não existe");
  assert.equal(HORA_REGEX.test("08:60"), false, "minuto 60 não existe");
  assert.equal(HORA_REGEX.test("aaaa"), false);
  assert.equal(HORA_REGEX.test("8:00"), false, "exige zero à esquerda, mesmo formato do resto do sistema");
});

function slot(overrides: Partial<SlotExistente> = {}): SlotExistente {
  return {
    id: "slot-1",
    diaSemana: "SEGUNDA",
    horaInicio: "08:00",
    horaFim: "10:00",
    sala: "Lab 1",
    professorId: "prof-1",
    turmaId: "turma-1",
    disciplinaNome: "Programação I",
    ...overrides,
  };
}

function novo(overrides: Partial<NovoSlot> = {}): NovoSlot {
  return {
    diaSemana: "SEGUNDA",
    horaInicio: "09:00",
    horaFim: "11:00",
    sala: "Lab 2",
    professorId: "prof-2",
    turmaId: "turma-2",
    ...overrides,
  };
}

test("encontrarConflito: mesmo professor em dois sítios ao mesmo tempo — bloqueia", () => {
  const conflito = encontrarConflito(novo({ professorId: "prof-1" }), [slot()]);
  assert.equal(conflito?.tipo, "professor");
});

test("encontrarConflito: mesma sala reservada duas vezes — bloqueia", () => {
  const conflito = encontrarConflito(novo({ sala: "lab 1" }), [slot()]); // capitalização diferente, mesma sala
  assert.equal(conflito?.tipo, "sala");
});

test("encontrarConflito: mesma turma com duas disciplinas em simultâneo — bloqueia", () => {
  const conflito = encontrarConflito(novo({ turmaId: "turma-1" }), [slot()]);
  assert.equal(conflito?.tipo, "turma");
});

test("encontrarConflito: sem sobreposição de horário — não bloqueia mesmo com professor/sala/turma repetidos", () => {
  const conflito = encontrarConflito(
    novo({ professorId: "prof-1", sala: "Lab 1", turmaId: "turma-1", horaInicio: "10:00", horaFim: "12:00" }),
    [slot()],
  );
  assert.equal(conflito, null);
});

test("encontrarConflito: dias diferentes nunca conflituam, mesmo com tudo igual", () => {
  const conflito = encontrarConflito(
    novo({ diaSemana: "TERCA", professorId: "prof-1", sala: "Lab 1", turmaId: "turma-1" }),
    [slot()],
  );
  assert.equal(conflito, null);
});

test("encontrarConflito: sem nenhuma relação — livre", () => {
  const conflito = encontrarConflito(novo(), [slot()]);
  assert.equal(conflito, null);
});
