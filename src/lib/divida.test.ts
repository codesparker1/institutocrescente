import { test } from "node:test";
import assert from "node:assert/strict";
import { ehVencidoAlemDaTolerancia } from "./divida";

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
