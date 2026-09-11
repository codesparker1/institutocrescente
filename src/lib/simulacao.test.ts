import { test } from "node:test";
import assert from "node:assert/strict";
import {
  raiaDoPapel,
  entidadeDaRota,
  derivarFluxos,
  entidadesMaisAtravessadas,
  type EventoParaFluxo,
} from "./simulacao";

// Ids realistas: cuid de 25 caracteres, como os desta base.
const ALUNO = "cmtq1xpr6000404jl6qx0twaa";
const TURMA = "cmtlxo98i000404l7cd8qauzb";
const TD = "cmtra7j22000004liphwhip49";

test("raiaDoPapel: DAAC e ADMIN partilham a mesma raia", () => {
  assert.equal(raiaDoPapel("DAAC"), "daac");
  assert.equal(raiaDoPapel("ADMIN"), "daac");
});

test("raiaDoPapel: cada papel de utilizador cai na sua raia", () => {
  assert.equal(raiaDoPapel("ALUNO"), "aluno");
  assert.equal(raiaDoPapel("SECRETARIA"), "secretaria");
  assert.equal(raiaDoPapel("PROFESSOR"), "professor");
});

test("raiaDoPapel: sem papel e o sistema, nao um papel em falta", () => {
  assert.equal(raiaDoPapel(null), "sistema", "jobs e saltos de relogio correm fora de sessao");
  assert.equal(raiaDoPapel(undefined), "sistema");
  assert.equal(raiaDoPapel("DEV"), "sistema");
});

test("entidadeDaRota: ficha do aluno", () => {
  assert.equal(entidadeDaRota(`/alunos/${ALUNO}`), `aluno:${ALUNO}`);
});

test("entidadeDaRota: subpagina da ficha mantem a mesma entidade", () => {
  assert.equal(
    entidadeDaRota(`/alunos/${ALUNO}/financeiro`),
    `aluno:${ALUNO}`,
    "a subpagina fala do mesmo aluno — senao o fluxo partia-se ao mudar de separador",
  );
});

test("entidadeDaRota: pauta vence a turma quando ha dois ids", () => {
  assert.equal(
    entidadeDaRota(`/notas/${TURMA}/${TD}`),
    `turmaDisciplina:${TD}`,
    "e a turma-disciplina que identifica a pauta onde a nota e lancada",
  );
});

test("entidadeDaRota: /professor/:id e a pauta, nao um professor", () => {
  assert.equal(
    entidadeDaRota(`/professor/${TD}`),
    `turmaDisciplina:${TD}`,
    "a rota chama-se professor mas o id e de uma turma-disciplina — pela regra generica daria professor:<id>",
  );
});

test("entidadeDaRota: /professor/orientandos nao tem entidade", () => {
  assert.equal(entidadeDaRota("/professor/orientandos"), null);
});

test("entidadeDaRota: lista de turmas de uma turma so da a turma", () => {
  assert.equal(entidadeDaRota(`/notas/${TURMA}`), `turma:${TURMA}`);
  assert.equal(entidadeDaRota(`/admin/turmas/${TURMA}`), `turma:${TURMA}`);
});

test("entidadeDaRota: rotas sem id nao inventam entidade", () => {
  assert.equal(entidadeDaRota("/minhas-notas"), null);
  assert.equal(entidadeDaRota("/financeiro"), null);
  assert.equal(entidadeDaRota("/admin/finalistas"), null);
  assert.equal(entidadeDaRota("/dashboard"), null);
});

test("entidadeDaRota: segmento fixo longo nao e confundido com um id", () => {
  assert.equal(
    entidadeDaRota("/admin/academico/configuracao"),
    null,
    "sem limiar de comprimento isto virava a entidade academico:configuracao",
  );
  assert.equal(entidadeDaRota("/financeiro/emolumentos"), null);
});

test("entidadeDaRota: query string nao entra na entidade", () => {
  assert.equal(entidadeDaRota(`/alunos/${ALUNO}?separador=notas`), `aluno:${ALUNO}`);
});

test("derivarFluxos: duas raias na mesma entidade fazem uma seta", () => {
  const eventos: EventoParaFluxo[] = [
    { id: "e1", raia: "secretaria", entidade: "cobranca:c4f1" },
    { id: "e2", raia: "aluno", entidade: "cobranca:c4f1" },
  ];
  const fluxos = derivarFluxos(eventos);
  assert.equal(fluxos.length, 1);
  assert.deepEqual(
    { de: fluxos[0].deId, para: fluxos[0].paraId, raias: `${fluxos[0].deRaia}->${fluxos[0].paraRaia}` },
    { de: "e1", para: "e2", raias: "secretaria->aluno" },
  );
});

test("derivarFluxos: a mesma raia duas vezes nao faz seta", () => {
  const fluxos = derivarFluxos([
    { id: "e1", raia: "daac", entidade: "inscricao:mono-3f" },
    { id: "e2", raia: "daac", entidade: "inscricao:mono-3f" },
  ]);
  assert.equal(fluxos.length, 0, "o DAAC a mexer duas vezes no mesmo sitio nao e um fluxo entre papeis");
});

test("derivarFluxos: a seta parte do toque MAIS RECENTE da raia anterior", () => {
  const fluxos = derivarFluxos([
    { id: "e1", raia: "daac", entidade: "inscricao:mono-3f" },
    { id: "e2", raia: "daac", entidade: "inscricao:mono-3f" },
    { id: "e3", raia: "aluno", entidade: "inscricao:mono-3f" },
  ]);
  assert.equal(fluxos.length, 1);
  assert.equal(fluxos[0].deId, "e2", "partir de e1 apontaria para um toque ja desatualizado");
});

test("derivarFluxos: entidades diferentes nao se cruzam", () => {
  const fluxos = derivarFluxos([
    { id: "e1", raia: "secretaria", entidade: "cobranca:aaa" },
    { id: "e2", raia: "aluno", entidade: "cobranca:bbb" },
  ]);
  assert.equal(fluxos.length, 0);
});

test("derivarFluxos: eventos sem entidade sao ignorados", () => {
  const fluxos = derivarFluxos([
    { id: "e1", raia: "secretaria", entidade: null },
    { id: "e2", raia: "aluno", entidade: null },
  ]);
  assert.equal(fluxos.length, 0);
});

test("derivarFluxos: a raia sistema nao gera setas", () => {
  const fluxos = derivarFluxos([
    { id: "job", raia: "sistema", entidade: "cobranca:c4f1" },
    { id: "e2", raia: "aluno", entidade: "cobranca:c4f1" },
  ]);
  assert.equal(fluxos.length, 0, "os jobs sao marcos que atravessam a grelha, sem coluna de onde sair");
});

test("derivarFluxos: um percurso longo encadeia varias setas", () => {
  const fluxos = derivarFluxos([
    { id: "e1", raia: "daac", entidade: "inscricao:mono" },
    { id: "e2", raia: "aluno", entidade: "inscricao:mono" },
    { id: "e3", raia: "professor", entidade: "inscricao:mono" },
  ]);
  assert.deepEqual(
    fluxos.map((f) => `${f.deRaia}->${f.paraRaia}`),
    ["daac->aluno", "aluno->professor"],
  );
});

test("entidadesMaisAtravessadas: ordena por numero de raias distintas", () => {
  const eventos: EventoParaFluxo[] = [
    { id: "a1", raia: "secretaria", entidade: "aluno:x" },
    { id: "a2", raia: "aluno", entidade: "aluno:x" },
    { id: "a3", raia: "daac", entidade: "aluno:x" },
    { id: "b1", raia: "professor", entidade: "turma:y" },
    { id: "b2", raia: "professor", entidade: "turma:y" },
    { id: "b3", raia: "professor", entidade: "turma:y" },
    { id: "b4", raia: "professor", entidade: "turma:y" },
  ];
  const top = entidadesMaisAtravessadas(eventos, 2);
  assert.equal(top[0].entidade, "aluno:x", "3 raias vence 1 raia, mesmo com menos toques");
  assert.equal(top[0].raias, 3);
  assert.equal(top[1].entidade, "turma:y");
  assert.equal(top[1].toques, 4);
});

test("entidadesMaisAtravessadas: respeita o limite", () => {
  const eventos: EventoParaFluxo[] = [
    { id: "1", raia: "aluno", entidade: "a:1" },
    { id: "2", raia: "aluno", entidade: "a:2" },
    { id: "3", raia: "aluno", entidade: "a:3" },
  ];
  assert.equal(entidadesMaisAtravessadas(eventos, 2).length, 2);
});
