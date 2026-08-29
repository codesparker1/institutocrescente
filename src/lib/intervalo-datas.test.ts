import { test } from "node:test";
import assert from "node:assert/strict";
import { diasDisponiveis, diasDoMes, mesesDisponiveis } from "./intervalo-datas";

// Janela tipica: de hoje (3/11/2026) ate ao fim do ano letivo 2026/2027 (31/7/2027).
const HOJE = "2026-11-03";
const FIM_ANO_LETIVO = "2027-07-31";

test("mesesDisponiveis: atravessa dois anos civis em ordem cronologica", () => {
  const meses = mesesDisponiveis(HOJE, FIM_ANO_LETIVO);
  assert.deepEqual(meses[0], { ano: 2026, mes: 11 }, "comeca em Novembro de 2026");
  assert.deepEqual(meses.at(-1), { ano: 2027, mes: 7 }, "acaba em Julho de 2027");
  assert.equal(meses.length, 9, "Nov+Dez de 2026 e Jan..Jul de 2027");
  // Janeiro de 2027 vem DEPOIS de Dezembro de 2026 — se a lista fosse so por numero de mes,
  // Janeiro aparecia primeiro e o utilizador escolhia o ano errado sem dar por ela.
  assert.ok(meses.findIndex((m) => m.mes === 1) > meses.findIndex((m) => m.mes === 12));
});

test("mesesDisponiveis: nao oferece meses ja passados", () => {
  const meses = mesesDisponiveis(HOJE, FIM_ANO_LETIVO);
  assert.equal(meses.some((m) => m.ano === 2026 && m.mes < 11), false, "nada antes de Novembro de 2026");
});

test("mesesDisponiveis: intervalo dentro do mesmo mes da um so mes", () => {
  assert.deepEqual(mesesDisponiveis("2026-11-03", "2026-11-20"), [{ ano: 2026, mes: 11 }]);
});

test("diasDisponiveis: no mes do limite inferior comeca no dia minimo", () => {
  const dias = diasDisponiveis(HOJE, FIM_ANO_LETIVO, 2026, 11);
  assert.equal(dias[0], 3, "nao se agenda para 1 ou 2 de Novembro — ja passaram");
  assert.equal(dias.at(-1), 30, "Novembro tem 30 dias");
});

test("diasDisponiveis: no mes do limite superior acaba no dia maximo", () => {
  const dias = diasDisponiveis(HOJE, FIM_ANO_LETIVO, 2027, 7);
  assert.equal(dias.at(-1), 31, "o ano letivo acaba a 31 de Julho");
});

test("diasDisponiveis: meses do meio vao do 1 ao ultimo dia real", () => {
  assert.equal(diasDisponiveis(HOJE, FIM_ANO_LETIVO, 2027, 2)[0], 1);
  // O bug que o DateSelect generico tinha: 31 dias em TODOS os meses, incluindo Fevereiro.
  assert.equal(diasDisponiveis(HOJE, FIM_ANO_LETIVO, 2027, 2).at(-1), 28, "Fevereiro de 2027 nao e bissexto");
  assert.equal(diasDisponiveis(HOJE, FIM_ANO_LETIVO, 2027, 4).at(-1), 30, "Abril tem 30");
});

test("diasDisponiveis: um mes que e limite inferior E superior corta dos dois lados", () => {
  assert.deepEqual(diasDisponiveis("2026-11-03", "2026-11-06", 2026, 11), [3, 4, 5, 6]);
});

test("diasDoMes: Fevereiro bissexto tem 29", () => {
  assert.equal(diasDoMes(2028, 2), 29, "2028 e bissexto");
  assert.equal(diasDoMes(2027, 2), 28);
  assert.equal(diasDoMes(2026, 12), 31);
});
