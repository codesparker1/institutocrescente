import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSituacaoDivida, fromIsoDate, fromIsoDateTime, toIsoDate, toIsoDateTime } from "./utils";

test("fromIsoDate lê 'aaaa-mm-dd' como meia-noite LOCAL, não UTC", () => {
  const data = fromIsoDate("2026-09-01");
  assert.ok(data, "data válida não devia ser null");
  // Os getters locais têm de devolver exatamente o que foi escrito — é isto que new Date("2026-09-01")
  // falhava a oeste de Greenwich, onde a meia-noite UTC cai no dia anterior em hora local.
  assert.equal(data.getFullYear(), 2026);
  assert.equal(data.getMonth(), 8, "setembro é o mês 8 (0-indexado)");
  assert.equal(data.getDate(), 1);
  assert.equal(data.getHours(), 0, "meia-noite local");
});

test("fromIsoDate e toIsoDate são inversos exatos — o par grava/lê nunca perde um dia", () => {
  for (const iso of ["2026-01-01", "2026-09-01", "2026-12-31", "2024-02-29"]) {
    assert.equal(toIsoDate(fromIsoDate(iso)!), iso, `ida e volta de ${iso}`);
  }
});

test("fromIsoDate rejeita entrada malformada em vez de devolver Invalid Date", () => {
  assert.equal(fromIsoDate(""), null);
  assert.equal(fromIsoDate("aaaa"), null);
  assert.equal(fromIsoDate("2026-9-1"), null, "exige zeros à esquerda, mesmo formato do <input type=date>");
  assert.equal(fromIsoDate("2026/09/01"), null, "só aceita separador '-'");
  assert.equal(fromIsoDate("2026-09-01T10:00:00"), null, "só-data, sem componente de hora");
});

test("fromIsoDate rejeita datas que não existem, em vez de as deixar transbordar", () => {
  // new Date(2026, 1, 31) daria 3 de março em silêncio — o DAAC nunca saberia que a data mudou.
  assert.equal(fromIsoDate("2026-02-31"), null, "31 de fevereiro não existe");
  assert.equal(fromIsoDate("2026-13-01"), null, "mês 13 não existe");
  assert.equal(fromIsoDate("2025-02-29"), null, "2025 não é bissexto");
  assert.ok(fromIsoDate("2024-02-29"), "2024 é bissexto — esta existe");
});

test("formatSituacaoDivida conta propina e multa em separado — 1 mês vencido não vira '2 meses'", () => {
  // O caso que motivou a correção: a multa automática gerada pelo atraso da propina era somada
  // à contagem de meses, e 1 mês de atraso aparecia na lista como 2.
  assert.equal(formatSituacaoDivida(1, 1), "1 mês de propina + 1 multa");
});

test("formatSituacaoDivida mostra só a multa quando não há propina em atraso", () => {
  assert.equal(formatSituacaoDivida(0, 1), "1 multa");
  assert.equal(formatSituacaoDivida(0, 3), "3 multas");
});

test("formatSituacaoDivida mostra só a propina quando não há multa", () => {
  assert.equal(formatSituacaoDivida(1, 0), "1 mês de propina");
  assert.equal(formatSituacaoDivida(4, 0), "4 meses de propina");
});

test("formatSituacaoDivida devolve travessão quando não há nada em atraso", () => {
  assert.equal(formatSituacaoDivida(0, 0), "—");
});

test("toIsoDateTime e fromIsoDateTime são inversos exatos, hora incluída", () => {
  // A defesa marca-se com hora (a pauta impressa convoca um júri para uma hora concreta), e o par
  // grava/lê tem de sobreviver a um servidor a oeste de Greenwich — mesma razão de fromIsoDate.
  const original = new Date(2027, 5, 12, 14, 30);
  const lido = fromIsoDateTime(toIsoDateTime(original));
  assert.ok(lido, "data válida não devia ser null");
  assert.equal(lido.getTime(), original.getTime());
});

test("toIsoDateTime preenche horas e minutos com zero à esquerda", () => {
  assert.equal(toIsoDateTime(new Date(2027, 0, 5, 9, 5)), "2027-01-05T09:05");
});

test("fromIsoDateTime recusa entrada malformada em vez de devolver Invalid Date", () => {
  assert.equal(fromIsoDateTime("2027-06-12"), null);
  assert.equal(fromIsoDateTime(""), null);
  assert.equal(fromIsoDateTime("ontem às 3"), null);
});

test("fromIsoDateTime recusa uma data que transborda o mês", () => {
  // 31 de fevereiro viraria 3 de março em silêncio — a defesa ficava marcada noutro dia.
  assert.equal(fromIsoDateTime("2027-02-31T10:00"), null);
});
