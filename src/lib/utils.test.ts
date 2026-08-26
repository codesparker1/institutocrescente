import { test } from "node:test";
import assert from "node:assert/strict";
import { fromIsoDate, toIsoDate } from "./utils";

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
