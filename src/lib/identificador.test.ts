import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailOpcionalSchema, emailSchema, normalizarEmail, normalizarIdentificador } from "./identificador";

describe("normalizarEmail", () => {
  it("passa a minúsculas, para o login ignorar maiúsculas", () => {
    assert.equal(normalizarEmail("Maria.Silva@ISPC.ao"), "maria.silva@ispc.ao");
  });

  it("tira espaços à volta — colar um email arrasta-os quase sempre", () => {
    assert.equal(normalizarEmail("  admin@ispc.ao  "), "admin@ispc.ao");
  });

  it("deixa em paz um email já normalizado", () => {
    assert.equal(normalizarEmail("admin@ispc.ao"), "admin@ispc.ao");
  });

  it("não toca no que está antes do @ para lá da caixa das letras", () => {
    assert.equal(normalizarEmail("ana.paula+bolsa@ispc.ao"), "ana.paula+bolsa@ispc.ao");
  });
});

describe("normalizarIdentificador", () => {
  it("aceita o número de estudante escrito em minúsculas", () => {
    assert.equal(normalizarIdentificador("ispc2026-0001"), "ispc2026-0001");
    assert.equal(normalizarIdentificador("ISPC2026-0001"), "ispc2026-0001");
  });

  it("tira espaços à volta", () => {
    assert.equal(normalizarIdentificador(" ISPC2026-0001 "), "ispc2026-0001");
  });
});

describe("emailSchema", () => {
  it("normaliza ao validar, para o valor guardado já sair normalizado", () => {
    assert.equal(emailSchema.parse("DAAC@Ispc.AO"), "daac@ispc.ao");
  });

  it("continua a recusar um email inválido", () => {
    assert.equal(emailSchema.safeParse("nao-e-um-email").success, false);
  });

  it("recusa vazio — é obrigatório", () => {
    assert.equal(emailSchema.safeParse("").success, false);
  });
});

describe("emailOpcionalSchema", () => {
  it("trata o campo vazio como não preenchido, e não como erro", () => {
    const r = emailOpcionalSchema.safeParse("");
    assert.equal(r.success, true);
    assert.equal(r.success && r.data, undefined);
  });

  it("trata só-espaços como não preenchido", () => {
    const r = emailOpcionalSchema.safeParse("   ");
    assert.equal(r.success, true);
    assert.equal(r.success && r.data, undefined);
  });

  it("normaliza quando vem preenchido", () => {
    assert.equal(emailOpcionalSchema.parse("Marta.Kiala@Aluno.ISPC.ao"), "marta.kiala@aluno.ispc.ao");
  });

  it("recusa um email inválido mesmo sendo opcional", () => {
    assert.equal(emailOpcionalSchema.safeParse("arroba-nenhum").success, false);
  });
});
