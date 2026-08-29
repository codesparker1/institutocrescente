import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirRematricula, cadeirasARepetir, anoLetivoCorrente, dentroDoAnoLetivo } from "./academico";

test("reprovações dentro do limite avança de ano", () => {
  const r = decidirRematricula({ reprovacoes: 2, limiteReprovacoes: 2, anoCurricular: 1 });
  assert.equal(r.resultado, "AVANCA");
  assert.equal(r.novoAnoCurricular, 2);
});

test("um a mais que o limite fica retido, sem avançar de ano", () => {
  const r = decidirRematricula({ reprovacoes: 3, limiteReprovacoes: 2, anoCurricular: 1 });
  assert.equal(r.resultado, "RETIDO");
  assert.equal(r.novoAnoCurricular, 1);
});

test("sem reprovações avança normalmente", () => {
  const r = decidirRematricula({ reprovacoes: 0, limiteReprovacoes: 0, anoCurricular: 2 });
  assert.equal(r.resultado, "AVANCA");
  assert.equal(r.novoAnoCurricular, 3);
});

test("regraRetencao SO_REPROVADAS: só as reprovadas repetem", () => {
  const reprovadas = ["Bases de Dados"];
  const aprovadas = ["Programação I", "Redes"];
  assert.deepEqual(cadeirasARepetir(reprovadas, aprovadas, "SO_REPROVADAS"), reprovadas);
});

test("regraRetencao ANO_INTEIRO: reprovadas e aprovadas repetem todas", () => {
  const reprovadas = ["Bases de Dados"];
  const aprovadas = ["Programação I", "Redes"];
  assert.deepEqual(cadeirasARepetir(reprovadas, aprovadas, "ANO_INTEIRO"), [...reprovadas, ...aprovadas]);
});

// --- Ano letivo como ambito de tudo (Ano letivo > Semestre > Horario/Provas) ---

// Ano letivo 2026/2027: de Setembro de 2026 a Julho de 2027.
const ANO_LETIVO = { anoLetivoInicio: new Date(2026, 8, 1), anoLetivoFim: new Date(2027, 6, 31) };

test("anoLetivoCorrente: devolve o ano de INICIO, nao o ano civil", () => {
  // O ponto todo: em Fevereiro de 2027 o ano civil ja e 2027, mas o ano letivo ainda e 2026/2027.
  assert.equal(anoLetivoCorrente(new Date(2027, 1, 15), ANO_LETIVO), 2026);
  assert.equal(anoLetivoCorrente(new Date(2026, 9, 10), ANO_LETIVO), 2026);
});

test("anoLetivoCorrente: null fora do intervalo — nao adivinha", () => {
  // Ferias entre anos letivos: melhor recusar a operacao do que cair no ano do calendario e deixar
  // marcar provas na turma errada.
  assert.equal(anoLetivoCorrente(new Date(2027, 7, 15), ANO_LETIVO), null, "depois do fim");
  assert.equal(anoLetivoCorrente(new Date(2026, 7, 15), ANO_LETIVO), null, "antes do inicio");
});

test("anoLetivoCorrente: null com a configuracao por preencher", () => {
  assert.equal(anoLetivoCorrente(new Date(2026, 9, 10), null), null);
  assert.equal(anoLetivoCorrente(new Date(2026, 9, 10), { anoLetivoInicio: new Date(2026, 8, 1), anoLetivoFim: null }), null);
});

test("dentroDoAnoLetivo: recusa datas fora, aceita as fronteiras", () => {
  assert.equal(dentroDoAnoLetivo(new Date(2026, 8, 1), ANO_LETIVO), true, "primeiro dia");
  assert.equal(dentroDoAnoLetivo(new Date(2027, 6, 31), ANO_LETIVO), true, "ultimo dia");
  assert.equal(dentroDoAnoLetivo(new Date(2027, 8, 1), ANO_LETIVO), false, "ano letivo seguinte");
  assert.equal(dentroDoAnoLetivo(new Date(2026, 5, 1), ANO_LETIVO), false, "ano letivo anterior");
});

test("dentroDoAnoLetivo: sem configuracao nao bloqueia nada", () => {
  // Config por preencher nao pode impedir o DAAC de trabalhar — a fronteira e opcional no schema.
  assert.equal(dentroDoAnoLetivo(new Date(2030, 0, 1), null), true);
});
