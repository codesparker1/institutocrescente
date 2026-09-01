import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirRematricula, cadeirasARepetir, anoLetivoCorrente, dentroDoAnoLetivo, datasDoAnoLetivoSeguinte, semestreFechado } from "./academico";

test("reprovações dentro do limite avança de ano", () => {
  const r = decidirRematricula({ reprovacoes: 2, limiteReprovacoes: 2, anoCurricular: 1 });
  assert.equal(r.resultado, "AVANCA");
  assert.equal(r.novoAnoCurricular, 2);
});

test("um a mais que o limite fica retido, sem avançar de ano", () => {
  const r = decidirRematricula({ reprovacoes: 3, limiteReprovacoes: 2, anoCurricular: 1 });
  assert.equal(r.resultado, "RETIDO");
  assert.equal(r.novoAnoCurricular, 1);
});

test("sem reprovações avança normalmente", () => {
  const r = decidirRematricula({ reprovacoes: 0, limiteReprovacoes: 0, anoCurricular: 2 });
  assert.equal(r.resultado, "AVANCA");
  assert.equal(r.novoAnoCurricular, 3);
});

test("regraRetencao SO_REPROVADAS: só as reprovadas repetem", () => {
  const reprovadas = ["Bases de Dados"];
  const aprovadas = ["Programação I", "Redes"];
  assert.deepEqual(cadeirasARepetir(reprovadas, aprovadas, "SO_REPROVADAS"), reprovadas);
});

test("regraRetencao ANO_INTEIRO: reprovadas e aprovadas repetem todas", () => {
  const reprovadas = ["Bases de Dados"];
  const aprovadas = ["Programação I", "Redes"];
  assert.deepEqual(cadeirasARepetir(reprovadas, aprovadas, "ANO_INTEIRO"), [...reprovadas, ...aprovadas]);
});

// --- Ano letivo como ambito de tudo (Ano letivo > Semestre > Horario/Provas) ---

// Ano letivo 2026/2027: de Setembro de 2026 a Julho de 2027.
const ANO_LETIVO = { anoLetivoInicio: new Date(2026, 8, 1), anoLetivoFim: new Date(2027, 6, 31) };

test("anoLetivoCorrente: devolve o ano de INICIO, nao o ano civil", () => {
  // O ponto todo: em Fevereiro de 2027 o ano civil ja e 2027, mas o ano letivo ainda e 2026/2027.
  assert.equal(anoLetivoCorrente(new Date(2027, 1, 15), ANO_LETIVO), 2026);
  assert.equal(anoLetivoCorrente(new Date(2026, 9, 10), ANO_LETIVO), 2026);
});

test("anoLetivoCorrente: null fora do intervalo — nao adivinha", () => {
  // Ferias entre anos letivos: melhor recusar a operacao do que cair no ano do calendario e deixar
  // marcar provas na turma errada.
  assert.equal(anoLetivoCorrente(new Date(2027, 7, 15), ANO_LETIVO), null, "depois do fim");
  assert.equal(anoLetivoCorrente(new Date(2026, 7, 15), ANO_LETIVO), null, "antes do inicio");
});

test("anoLetivoCorrente: null com a configuracao por preencher", () => {
  assert.equal(anoLetivoCorrente(new Date(2026, 9, 10), null), null);
  assert.equal(anoLetivoCorrente(new Date(2026, 9, 10), { anoLetivoInicio: new Date(2026, 8, 1), anoLetivoFim: null }), null);
});

test("dentroDoAnoLetivo: recusa datas fora, aceita as fronteiras", () => {
  assert.equal(dentroDoAnoLetivo(new Date(2026, 8, 1), ANO_LETIVO), true, "primeiro dia");
  assert.equal(dentroDoAnoLetivo(new Date(2027, 6, 31), ANO_LETIVO), true, "ultimo dia");
  assert.equal(dentroDoAnoLetivo(new Date(2027, 8, 1), ANO_LETIVO), false, "ano letivo seguinte");
  assert.equal(dentroDoAnoLetivo(new Date(2026, 5, 1), ANO_LETIVO), false, "ano letivo anterior");
});

test("dentroDoAnoLetivo: sem configuracao nao bloqueia nada", () => {
  // Config por preencher nao pode impedir o DAAC de trabalhar — a fronteira e opcional no schema.
  assert.equal(dentroDoAnoLetivo(new Date(2030, 0, 1), null), true);
});

test("datasDoAnoLetivoSeguinte: as mesmas datas, um ano a frente", () => {
  // Sem isto, quando o ano letivo acabava a configuracao continuava a apontar para o ano velho:
  // anoLetivoCorrente devolvia null e o Horario bloqueava, exatamente quando as matriculas abrem.
  const seguinte = datasDoAnoLetivoSeguinte({
    anoLetivoInicio: new Date(2026, 8, 1),
    anoLetivoFim: new Date(2027, 6, 31),
  });
  assert.equal(seguinte.anoLetivoInicio.getFullYear(), 2027);
  assert.equal(seguinte.anoLetivoInicio.getMonth(), 8, "continua Setembro");
  assert.equal(seguinte.anoLetivoInicio.getDate(), 1, "continua dia 1");
  assert.equal(seguinte.anoLetivoFim.getFullYear(), 2028);
  assert.equal(seguinte.anoLetivoFim.getMonth(), 6, "continua Julho");
  assert.equal(seguinte.anoLetivoFim.getDate(), 31, "continua dia 31");
});

test("datasDoAnoLetivoSeguinte: o intervalo novo e reconhecido por anoLetivoCorrente", () => {
  // A propriedade que interessa: depois do rollover o sistema volta a ter um ano letivo a decorrer.
  const antigo = { anoLetivoInicio: new Date(2026, 8, 1), anoLetivoFim: new Date(2027, 6, 31) };
  const novo = datasDoAnoLetivoSeguinte(antigo);
  assert.equal(anoLetivoCorrente(new Date(2027, 9, 15), novo), 2027, "Outubro de 2027 cai no ano novo");
  assert.equal(anoLetivoCorrente(new Date(2027, 9, 15), antigo), null, "e nao no antigo");
});

test("semestreFechado: o semestre a decorrer não está fechado", () => {
  const corrente = { anoLetivo: 2026, semestreAtual: 2 };
  assert.equal(semestreFechado({ anoLetivo: 2026, semestre: 2 }, corrente), false);
});

test("semestreFechado: o 1º fecha quando o sistema avança para o 2º", () => {
  assert.equal(semestreFechado({ anoLetivo: 2026, semestre: 1 }, { anoLetivo: 2026, semestreAtual: 2 }), true);
  // Enquanto o 1º corre, ainda não fechou.
  assert.equal(semestreFechado({ anoLetivo: 2026, semestre: 1 }, { anoLetivo: 2026, semestreAtual: 1 }), false);
});

test("semestreFechado: anos letivos anteriores estão fechados por inteiro", () => {
  const corrente = { anoLetivo: 2026, semestreAtual: 1 };
  assert.equal(semestreFechado({ anoLetivo: 2025, semestre: 1 }, corrente), true);
  assert.equal(semestreFechado({ anoLetivo: 2025, semestre: 2 }, corrente), true);
});

test("semestreFechado: um ano letivo futuro nunca está fechado", () => {
  assert.equal(semestreFechado({ anoLetivo: 2027, semestre: 1 }, { anoLetivo: 2026, semestreAtual: 2 }), false);
});

test("semestreFechado: sem ano letivo configurado nada fecha — não se inventa uma fronteira", () => {
  assert.equal(semestreFechado({ anoLetivo: 2025, semestre: 1 }, { anoLetivo: null, semestreAtual: 1 }), false);
});
