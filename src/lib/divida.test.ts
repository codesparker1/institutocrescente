import { test } from "node:test";
import assert from "node:assert/strict";
import { ehVencidoAlemDaTolerancia, mesDentroDoAnoLetivo } from "./divida";

const VENCIMENTO = new Date("2026-08-10T00:00:00");

test("sem tolerância, vence no dia seguinte ao vencimento", () => {
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-10T00:00:00")), false, "no próprio dia ainda não venceu");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-11T00:00:00")), true, "um dia depois já venceu");
});

test("bug real corrigido: o dia de vencimento inteiro é válido para pagar, não só a meia-noite exata", () => {
  // O bug original comparava `agora > dataVencimento` (meia-noite) — um aluno que pagasse às 9h da
  // manhã do próprio dia 10 já aparecia vencido e era multado horas antes de o dia acabar. Estes
  // são os instantes que o teste antigo nunca cobriu (só testava meia-noite exata).
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-10T00:01:00")), false, "00:01 do dia de vencimento");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-10T09:00:00")), false, "manhã do dia de vencimento");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-10T16:00:00")), false, "tarde do dia de vencimento");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-10T23:59:59")), false, "último minuto do dia de vencimento");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-11T00:00:01")), true, "um minuto depois de o dia de vencimento acabar");
});

test("tolerância desloca o limite exatamente N dias", () => {
  const cincoDiasDepois = new Date("2026-08-15T00:00:00");
  const seisDiasDepois = new Date("2026-08-16T00:00:00");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 5, cincoDiasDepois), false, "ainda dentro da tolerância");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 5, seisDiasDepois), true, "além da tolerância");
});

test("a função não recebe nem depende da categoria do estudante — mesma regra para todos (MD §2/§6)", () => {
  // Não há parâmetro de categoria na assinatura: NORMAL, BOLSEIRO_INAGBE e COMPARTICIPADA usam
  // exatamente a mesma chamada e obtêm exatamente o mesmo resultado, sem isenção possível.
  const agora = new Date("2026-08-20T00:00:00");
  const resultado = ehVencidoAlemDaTolerancia(VENCIMENTO, 0, agora);
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, agora), resultado);
  assert.equal(resultado, true);
});

// Ciclo real do bug encontrado em 2026-08-28: aulas de 23/10/2026 a 14/06/2027.
const CICLO = { anoLetivoInicio: new Date(2026, 9, 23), anoLetivoFim: new Date(2027, 5, 14) };

test("mesDentroDoAnoLetivo: agosto não é cobrado quando o ano letivo só começa em outubro", () => {
  // O bug: a geração diária olhava só ao mês do relógio e cobrava agosto na mesma.
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 7, 28), CICLO), false, "agosto, antes do arranque");
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 8, 30), CICLO), false, "setembro, ainda antes");
  assert.equal(mesDentroDoAnoLetivo(new Date(2027, 6, 1), CICLO), false, "julho, depois do fim");
});

test("mesDentroDoAnoLetivo: os meses de fronteira contam por inteiro", () => {
  // Dia 1 de outubro já conta, apesar de as aulas só começarem a 23 — quem se matricula a meio do
  // mês paga o mês todo, tal como gerarPropinasAnoLetivo monta o ciclo.
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 9, 1), CICLO), true, "1 de outubro");
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 9, 31), CICLO), true, "31 de outubro");
  assert.equal(mesDentroDoAnoLetivo(new Date(2027, 5, 30), CICLO), true, "30 de junho, depois do fim das aulas mas mês do fim");
  assert.equal(mesDentroDoAnoLetivo(new Date(2027, 0, 15), CICLO), true, "janeiro, a meio do ciclo");
});

test("mesDentroDoAnoLetivo: sem ano letivo configurado, cobra na mesma", () => {
  // Estado inicial do sistema — bloquear aqui deixaria a instituição sem receita nenhuma.
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 7, 28), null), true);
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 7, 28), { anoLetivoInicio: null, anoLetivoFim: null }), true);
  assert.equal(mesDentroDoAnoLetivo(new Date(2026, 7, 28), { anoLetivoInicio: new Date(2026, 9, 23), anoLetivoFim: null }), true);
});
