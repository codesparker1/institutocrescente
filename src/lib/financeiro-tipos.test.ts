import { test } from "node:test";
import assert from "node:assert/strict";
import { TIPOS_QUE_BLOQUEIAM, TIPOS_QUE_CONTAM_COMO_DIVIDA } from "./financeiro-tipos";
// §regras confirmadas 2026-08 (diretor, via utilizador):
// 1. Só a PROPINA bloqueia o aluno — MULTA nunca bloqueia sozinha.
// 2. A lista de devedores/histórico conta PROPINA + MULTA (multa órfã é dívida real).

test("só a PROPINA bloqueia", () => {
  assert.deepEqual([...TIPOS_QUE_BLOQUEIAM], ["PROPINA"], "TIPOS_QUE_BLOQUEIAM deve conter apenas PROPINA");
});

test("multa não está no conjunto que bloqueia, mas conta como dívida real", () => {
  assert.equal((TIPOS_QUE_BLOQUEIAM as readonly string[]).includes("MULTA"), false, "MULTA não pode bloquear");
  assert.deepEqual(
    [...TIPOS_QUE_CONTAM_COMO_DIVIDA].sort(),
    ["MULTA", "PROPINA"],
    "devedores/histórico contam PROPINA + MULTA",
  );
});
