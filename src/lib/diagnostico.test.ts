import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticarAluno, type AlunoParaDiagnostico } from "./diagnostico";

function alunoBase(overrides: Partial<AlunoParaDiagnostico> = {}): AlunoParaDiagnostico {
  return {
    id: "aluno-1",
    nome: "Aluno Teste",
    status: "ATIVO",
    matriculas: [{ id: "mat-1", status: "ATIVA", anoLetivo: 2027 }],
    inscricoes: [{ id: "insc-1", ativa: true, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação II", turmaAnoLetivo: 2027, temHorarioSlot: true }],
    ...overrides,
  };
}

test("matricula-ativa-unica: dispara com duas matrículas ATIVA", () => {
  const aluno = alunoBase({
    matriculas: [
      { id: "mat-1", status: "ATIVA", anoLetivo: 2026 },
      { id: "mat-2", status: "ATIVA", anoLetivo: 2027 },
    ],
  });
  const violacoes = diagnosticarAluno(aluno);
  assert.ok(violacoes.some((v) => v.regra === "matricula-ativa-unica" && v.severidade === "ERROR"));
});

test("matricula-ativa-unica: silenciosa com uma só ATIVA e outras CONCLUIDA", () => {
  const aluno = alunoBase({
    matriculas: [
      { id: "mat-1", status: "CONCLUIDA", anoLetivo: 2026 },
      { id: "mat-2", status: "ATIVA", anoLetivo: 2027 },
    ],
  });
  assert.equal(diagnosticarAluno(aluno).filter((v) => v.regra === "matricula-ativa-unica").length, 0);
});

test("inscricao-ativa-ano-anterior: dispara quando a inscrição ativa é de uma turma mais velha que a matrícula corrente", () => {
  const aluno = alunoBase({
    matriculas: [{ id: "mat-1", status: "ATIVA", anoLetivo: 2027 }],
    inscricoes: [{ id: "insc-1", ativa: true, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação I", turmaAnoLetivo: 2026, temHorarioSlot: true }],
  });
  const violacoes = diagnosticarAluno(aluno);
  assert.ok(violacoes.some((v) => v.regra === "inscricao-ativa-ano-anterior" && v.severidade === "ERROR"));
});

test("inscricao-ativa-ano-anterior: silenciosa quando a inscrição ativa já é do ano da matrícula corrente", () => {
  const aluno = alunoBase();
  assert.equal(diagnosticarAluno(aluno).filter((v) => v.regra === "inscricao-ativa-ano-anterior").length, 0);
});

test("sem-inscricao-ativa-se-inativo: dispara para aluno TRANCADO com inscrição ainda ativa", () => {
  const aluno = alunoBase({ status: "TRANCADO", matriculas: [{ id: "mat-1", status: "TRANCADA", anoLetivo: 2026 }] });
  const violacoes = diagnosticarAluno(aluno);
  assert.ok(violacoes.some((v) => v.regra === "sem-inscricao-ativa-se-inativo" && v.severidade === "ERROR"));
});

test("sem-inscricao-ativa-se-inativo: silenciosa para aluno ATIVO", () => {
  const aluno = alunoBase();
  assert.equal(diagnosticarAluno(aluno).filter((v) => v.regra === "sem-inscricao-ativa-se-inativo").length, 0);
});

test("uma-tentativa-ativa-por-cadeira: dispara com duas inscrições ativas na mesma cadeira curricular", () => {
  const aluno = alunoBase({
    inscricoes: [
      { id: "insc-1", ativa: true, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação II", turmaAnoLetivo: 2027, temHorarioSlot: true },
      { id: "insc-2", ativa: true, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação II", turmaAnoLetivo: 2027, temHorarioSlot: true },
    ],
  });
  const violacoes = diagnosticarAluno(aluno);
  assert.ok(violacoes.some((v) => v.regra === "uma-tentativa-ativa-por-cadeira" && v.severidade === "ERROR"));
});

test("uma-tentativa-ativa-por-cadeira: silenciosa quando a tentativa antiga já está inativa", () => {
  const aluno = alunoBase({
    inscricoes: [
      { id: "insc-1", ativa: false, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação II", turmaAnoLetivo: 2026, temHorarioSlot: true },
      { id: "insc-2", ativa: true, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação II", turmaAnoLetivo: 2027, temHorarioSlot: true },
    ],
  });
  assert.equal(diagnosticarAluno(aluno).filter((v) => v.regra === "uma-tentativa-ativa-por-cadeira").length, 0);
});

test("inscricao-ativa-tem-horario: dispara (WARNING) quando a turma-disciplina não tem horário", () => {
  const aluno = alunoBase({
    inscricoes: [{ id: "insc-1", ativa: true, cadeiraCurricularId: "cc-1", cadeiraNome: "Programação II", turmaAnoLetivo: 2027, temHorarioSlot: false }],
  });
  const violacoes = diagnosticarAluno(aluno);
  assert.ok(violacoes.some((v) => v.regra === "inscricao-ativa-tem-horario" && v.severidade === "WARNING"));
});

test("inscricao-ativa-tem-horario: silenciosa quando já tem horário", () => {
  const aluno = alunoBase();
  assert.equal(diagnosticarAluno(aluno).filter((v) => v.regra === "inscricao-ativa-tem-horario").length, 0);
});
