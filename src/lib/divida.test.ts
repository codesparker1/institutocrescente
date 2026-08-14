import { test } from "node:test";
import assert from "node:assert/strict";
import { ehVencidoAlemDaTolerancia } from "./divida";

const VENCIMENTO = new Date("2026-08-10T00:00:00");

test("sem tolerância, vence no dia seguinte ao vencimento", () => {
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-10T00:00:00")), false, "no próprio dia ainda não venceu");
  assert.equal(ehVencidoAlemDaTolerancia(VENCIMENTO, 0, new Date("2026-08-11T00:00:00")), true, "um dia depois já venceu");
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
