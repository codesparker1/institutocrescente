import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularNotaFinal, type NotasCadeira, type RegrasCadeira } from "./avaliacao";

const REGRAS_PADRAO: RegrasCadeira = { permiteDispensa: true, notaMinimaDispensa: 14 };
const SEM_NOTAS: NotasCadeira = { p1: null, p2: null, exame: null, recurso: null, exameEspecial: null };

test("sem P1 ou P2 fica EM_CURSO", () => {
  const r1 = calcularNotaFinal({ ...SEM_NOTAS, p1: 15 }, REGRAS_PADRAO);
  assert.equal(r1.estado, "EM_CURSO");
  assert.equal(r1.aprovado, null);

  const r2 = calcularNotaFinal(SEM_NOTAS, REGRAS_PADRAO);
  assert.equal(r2.estado, "EM_CURSO");
});

test("média >= 14 dispensa (aprovado direto, sem exame)", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 14, p2: 14 }, REGRAS_PADRAO);
  assert.equal(r.estado, "DISPENSADO");
  assert.equal(r.notaFrequencia, 14);
  assert.equal(r.notaFinal, 14);
  assert.equal(r.aprovado, true);
});

test("média 12 é positiva mas NÃO dispensa — precisa de exame (o erro mais caro do spec)", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 12, p2: 12 }, REGRAS_PADRAO);
  assert.equal(r.estado, "ADMITIDO_A_EXAME");
  assert.equal(r.notaFrequencia, 12);
  assert.equal(r.notaFinal, null, "não deve ter nota final sem exame lançado");
});

test("9+9 precisa de exatamente 12 no exame para passar", () => {
  const comExame11 = calcularNotaFinal({ ...SEM_NOTAS, p1: 9, p2: 9, exame: 11 }, REGRAS_PADRAO);
  assert.equal(comExame11.estado, "EM_RECURSO", "(9+9+11)/3 = 9.67, ainda reprovado");

  const comExame12 = calcularNotaFinal({ ...SEM_NOTAS, p1: 9, p2: 9, exame: 12 }, REGRAS_PADRAO);
  assert.equal(comExame12.estado, "APROVADO");
  assert.equal(comExame12.notaFinal, 10, "(9+9+12)/3 = 10");
});

test("13+13 precisa de exatamente 4 no exame para passar", () => {
  const comExame3 = calcularNotaFinal({ ...SEM_NOTAS, p1: 13, p2: 13, exame: 3 }, REGRAS_PADRAO);
  assert.equal(comExame3.estado, "EM_RECURSO", "(13+13+3)/3 = 9.67, ainda reprovado");

  const comExame4 = calcularNotaFinal({ ...SEM_NOTAS, p1: 13, p2: 13, exame: 4 }, REGRAS_PADRAO);
  assert.equal(comExame4.estado, "APROVADO");
  assert.equal(comExame4.notaFinal, 10, "(13+13+4)/3 = 10");
});

test("recurso conta isolado, não combinado com P1/P2/Exame", () => {
  // Frequência e exame péssimos, mas recurso >= 10 passa sozinho.
  const r = calcularNotaFinal({ p1: 0, p2: 0, exame: 0, recurso: 15, exameEspecial: null }, REGRAS_PADRAO);
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.notaFinal, 15, "nota final deve ser a do recurso isolado, não uma média");
});

test("recurso < 10 vai para exame especial; exame especial conta isolado", () => {
  const pendente = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 9, exameEspecial: null }, REGRAS_PADRAO);
  assert.equal(pendente.estado, "EM_EXAME_ESPECIAL");

  const aprovado = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 9, exameEspecial: 10 }, REGRAS_PADRAO);
  assert.equal(aprovado.estado, "APROVADO");
  assert.equal(aprovado.notaFinal, 10);

  const reprovado = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 9, exameEspecial: 9 }, REGRAS_PADRAO);
  assert.equal(reprovado.estado, "REPROVADO");
  assert.equal(reprovado.aprovado, false);
  assert.equal(reprovado.notaFinal, 9);
});

test("permiteDispensa=false força sempre exame, mesmo com média alta", () => {
  const regras: RegrasCadeira = { permiteDispensa: false, notaMinimaDispensa: 14 };
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 20, p2: 20 }, regras);
  assert.equal(r.estado, "ADMITIDO_A_EXAME", "média 20 não dispensa se a cadeira não permite dispensa");
});

test("congelamento: o resultado usa as regras passadas, não relê nada — mudar a cadeira depois não altera um cálculo já feito", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 15, p2: 15 };
  const regrasNoMomentoDaInscricao: RegrasCadeira = { permiteDispensa: true, notaMinimaDispensa: 14 };
  const resultadoOriginal = calcularNotaFinal(notas, regrasNoMomentoDaInscricao);
  assert.equal(resultadoOriginal.estado, "DISPENSADO");

  // Regra da cadeira "muda" no ano seguinte (ex. DAAC sobe o limiar para 16) — mas o resultado já
  // apurado com as regras congeladas da inscrição continua a ser recalculado com os MESMOS valores.
  const resultadoRecalculadoComRegrasAntigas = calcularNotaFinal(notas, regrasNoMomentoDaInscricao);
  assert.deepEqual(resultadoRecalculadoComRegrasAntigas, resultadoOriginal);
});
