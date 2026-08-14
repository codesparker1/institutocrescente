import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirRematricula, cadeirasARepetir } from "./academico";

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
