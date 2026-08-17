import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularNotaFinal, epocasVisiveis, proximaEpocaPendente, type NotasCadeira, type RegrasCadeira } from "./avaliacao";

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

test("9+9 (média 9) precisa de exatamente 11 no exame para passar", () => {
  const comExame10 = calcularNotaFinal({ ...SEM_NOTAS, p1: 9, p2: 9, exame: 10 }, REGRAS_PADRAO);
  assert.equal(comExame10.estado, "EM_RECURSO", "(9+10)/2 = 9.5, ainda reprovado");

  const comExame11 = calcularNotaFinal({ ...SEM_NOTAS, p1: 9, p2: 9, exame: 11 }, REGRAS_PADRAO);
  assert.equal(comExame11.estado, "APROVADO");
  assert.equal(comExame11.notaFinal, 10, "(média 9 + exame 11)/2 = 10");
});

test("13+13 (média 13) precisa de exatamente 7 no exame para passar", () => {
  const comExame6 = calcularNotaFinal({ ...SEM_NOTAS, p1: 13, p2: 13, exame: 6 }, REGRAS_PADRAO);
  assert.equal(comExame6.estado, "EM_RECURSO", "(13+6)/2 = 9.5, ainda reprovado");

  const comExame7 = calcularNotaFinal({ ...SEM_NOTAS, p1: 13, p2: 13, exame: 7 }, REGRAS_PADRAO);
  assert.equal(comExame7.estado, "APROVADO");
  assert.equal(comExame7.notaFinal, 10, "(média 13 + exame 7)/2 = 10");
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

test("epocasVisiveis: EM_CURSO mostra P1 e P2 como por vir, nada além", () => {
  assert.deepEqual(epocasVisiveis(SEM_NOTAS, "EM_CURSO"), ["P1", "P2"]);
});

test("epocasVisiveis: DISPENSADO só mostra P1/P2 — nunca Exame/Recurso/Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 15, p2: 15 };
  assert.deepEqual(epocasVisiveis(notas, "DISPENSADO"), ["P1", "P2"]);
});

test("epocasVisiveis: ADMITIDO_A_EXAME mostra P1/P2/Exame, não Recurso nem Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9 };
  assert.deepEqual(epocasVisiveis(notas, "ADMITIDO_A_EXAME"), ["P1", "P2", "EXAME"]);
});

test("epocasVisiveis: aprovado por Exame não mostra Recurso nem Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9, exame: 12 };
  assert.deepEqual(epocasVisiveis(notas, "APROVADO"), ["P1", "P2", "EXAME"]);
});

test("epocasVisiveis: aprovado por Recurso mostra até ao Recurso (Exame reprovado é facto histórico), não mostra Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9, exame: 5, recurso: 12 };
  assert.deepEqual(epocasVisiveis(notas, "APROVADO"), ["P1", "P2", "EXAME", "RECURSO"]);
});

test("epocasVisiveis: reprovado no Exame Especial mostra as 5 épocas (todas já lançadas)", () => {
  const notas: NotasCadeira = { p1: 9, p2: 9, exame: 5, recurso: 5, exameEspecial: 5 };
  assert.deepEqual(epocasVisiveis(notas, "REPROVADO"), ["P1", "P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"]);
});

test("proximaEpocaPendente: EM_CURSO sem P1 aponta para P1, não P2 (diferente de epocasVisiveis)", () => {
  assert.equal(proximaEpocaPendente(SEM_NOTAS, "EM_CURSO"), "P1");
});

test("proximaEpocaPendente: EM_CURSO com P1 lançado e sem P2 aponta para P2", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9 };
  assert.equal(proximaEpocaPendente(notas, "EM_CURSO"), "P2");
});

test("proximaEpocaPendente: ADMITIDO_A_EXAME aponta para EXAME", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9 };
  assert.equal(proximaEpocaPendente(notas, "ADMITIDO_A_EXAME"), "EXAME");
});

test("proximaEpocaPendente: EM_RECURSO aponta para RECURSO, EM_EXAME_ESPECIAL para EXAME_ESPECIAL", () => {
  const notas: NotasCadeira = { p1: 5, p2: 5, exame: 5, recurso: null, exameEspecial: null };
  assert.equal(proximaEpocaPendente(notas, "EM_RECURSO"), "RECURSO");
  assert.equal(proximaEpocaPendente({ ...notas, recurso: 9 }, "EM_EXAME_ESPECIAL"), "EXAME_ESPECIAL");
});

test("proximaEpocaPendente: estados terminais (DISPENSADO/APROVADO/REPROVADO) não têm pendência", () => {
  const notas: NotasCadeira = { p1: 15, p2: 15, exame: null, recurso: null, exameEspecial: null };
  assert.equal(proximaEpocaPendente(notas, "DISPENSADO"), null);
  assert.equal(proximaEpocaPendente(notas, "APROVADO"), null);
  assert.equal(proximaEpocaPendente(notas, "REPROVADO"), null);
});

test("epocasOrfas: corrigir o Exame para cima até aprovar torna um Recurso já lançado órfão", () => {
  // Exame estava a 5 (reprovava, precisava de recurso), professor corrige para 13 (aprova sozinho).
  const notas: NotasCadeira = { p1: 9, p2: 9, exame: 13, recurso: 15, exameEspecial: null };
  const r = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.notaFinal, 11, "(média 9 + exame 13)/2 = 11, ignora o recurso");
  assert.deepEqual(r.epocasOrfas, ["RECURSO"]);
});

test("epocasOrfas: corrigir P1/P2 para cima até dispensar torna Exame E Recurso já lançados órfãos", () => {
  const notas: NotasCadeira = { p1: 18, p2: 16, exame: 5, recurso: 5, exameEspecial: null };
  const r = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(r.estado, "DISPENSADO");
  assert.deepEqual(r.epocasOrfas, ["EXAME", "RECURSO"]);
});

test("epocasOrfas: aprovar por Recurso torna um Exame Especial já lançado órfão", () => {
  const notas: NotasCadeira = { p1: 5, p2: 5, exame: 5, recurso: 12, exameEspecial: 8 };
  const r = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.notaFinal, 12, "recurso isolado, ignora o exame especial");
  assert.deepEqual(r.epocasOrfas, ["EXAME_ESPECIAL"]);
});

test("epocasOrfas: vazio quando a cascata usa realmente todas as notas presentes", () => {
  const emCurso = calcularNotaFinal({ ...SEM_NOTAS, p1: 9 }, REGRAS_PADRAO);
  assert.deepEqual(emCurso.epocasOrfas, []);

  const emRecurso = calcularNotaFinal({ p1: 9, p2: 9, exame: 5, recurso: null, exameEspecial: null }, REGRAS_PADRAO);
  assert.deepEqual(emRecurso.epocasOrfas, []);

  const reprovado = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 5, exameEspecial: 5 }, REGRAS_PADRAO);
  assert.deepEqual(reprovado.epocasOrfas, []);
});
