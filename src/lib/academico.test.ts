import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirRematricula, cadeirasARepetir, anoLetivoCorrente, dentroDoAnoLetivo, datasDoAnoLetivoSeguinte, trabalhoDeFimDeAno, motivoRematriculaIndisponivel, semestreFechado } from "./academico";

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

test("dentroDoAnoLetivo: ferias entre anos letivos ficam FORA", () => {
  // §2026-09-03, o bug do semestre preso no 2o: entre o fim de um ano letivo e o inicio do
  // seguinte, `anoLetivoCorrente` e null e nenhuma mudanca de semestre faz sentido — nem avancar
  // para o 2o (alterarSemestreAction recusa), nem deixar la um 2o de um ano ja acabado
  // (garantirSuspensaoAutomatica repoe a 1). Esta e a fronteira que as duas regras usam.
  const config = { anoLetivoInicio: new Date(2027, 9, 23), anoLetivoFim: new Date(2028, 5, 14) };
  assert.equal(dentroDoAnoLetivo(new Date(2027, 8, 4), config), false, "Setembro, antes do inicio");
  assert.equal(dentroDoAnoLetivo(new Date(2028, 7, 1), config), false, "Agosto, depois do fim");
  assert.equal(dentroDoAnoLetivo(new Date(2027, 10, 5), config), true, "Novembro, a decorrer");
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

test("datasDoAnoLetivoSeguinte: a janela de matricula avanca com o ano letivo", () => {
  // §2026-09-03: so o ano letivo avancava, e a janela de matricula ficava no ano que acabou — a
  // Secretaria nao conseguia rematricular ninguem, exatamente na altura de o fazer.
  const seguinte = datasDoAnoLetivoSeguinte({
    anoLetivoInicio: new Date(2026, 8, 1),
    anoLetivoFim: new Date(2027, 6, 31),
    matriculaInicio: new Date(2026, 7, 1),
    matriculaFim: new Date(2026, 8, 30),
  });
  assert.equal(seguinte.matriculaInicio?.getFullYear(), 2027);
  assert.equal(seguinte.matriculaInicio?.getMonth(), 7, "continua Agosto");
  assert.equal(seguinte.matriculaFim?.getFullYear(), 2027);
  assert.equal(seguinte.matriculaFim?.getDate(), 30, "continua dia 30");
});

test("datasDoAnoLetivoSeguinte: a janela de matricula nova cobre o inicio do ano letivo novo", () => {
  // A propriedade que interessa de verdade: depois do rollover, a Secretaria consegue rematricular.
  // E a mesma verificacao que processarRematriculaAction faz (agora >= inicio && agora <= fim).
  const seguinte = datasDoAnoLetivoSeguinte({
    anoLetivoInicio: new Date(2026, 8, 1),
    anoLetivoFim: new Date(2027, 6, 31),
    matriculaInicio: new Date(2026, 7, 1),
    matriculaFim: new Date(2026, 8, 30),
  });
  const durante = new Date(2027, 7, 15); // Agosto de 2027, quando as rematriculas se fazem
  assert.ok(
    seguinte.matriculaInicio! <= durante && durante <= seguinte.matriculaFim!,
    "Agosto de 2027 cai dentro da janela nova",
  );
});

test("datasDoAnoLetivoSeguinte: matricula por preencher fica por preencher", () => {
  // Avancar um null inventaria uma janela que o DAAC nunca definiu — as datas de matricula sao
  // opcionais no schema, ao contrario das do ano letivo.
  const seguinte = datasDoAnoLetivoSeguinte({
    anoLetivoInicio: new Date(2026, 8, 1),
    anoLetivoFim: new Date(2027, 6, 31),
    matriculaInicio: null,
    matriculaFim: null,
  });
  assert.equal(seguinte.matriculaInicio, null);
  assert.equal(seguinte.matriculaFim, null);
});

test("datasDoAnoLetivoSeguinte: o intervalo novo e reconhecido por anoLetivoCorrente", () => {
  // A propriedade que interessa: depois do rollover o sistema volta a ter um ano letivo a decorrer.
  const antigo = { anoLetivoInicio: new Date(2026, 8, 1), anoLetivoFim: new Date(2027, 6, 31) };
  const novo = datasDoAnoLetivoSeguinte(antigo);
  assert.equal(anoLetivoCorrente(new Date(2027, 9, 15), novo), 2027, "Outubro de 2027 cai no ano novo");
  assert.equal(anoLetivoCorrente(new Date(2027, 9, 15), antigo), null, "e nao no antigo");
});

const REMATRICULA_OK = {
  status: "ATIVO" as const,
  temMatriculaAnterior: true,
  saldoPropinasDevendo: 0,
  dentroDaJanela: true,
  podeForaDaJanela: false,
};

test("motivoRematriculaIndisponivel: aluno ATIVO na janela e sem divida pode rematricular", () => {
  assert.equal(motivoRematriculaIndisponivel(REMATRICULA_OK), null);
});

test("motivoRematriculaIndisponivel: TRANCADO pode — e precisamente quem a rematricula reativa", () => {
  assert.equal(motivoRematriculaIndisponivel({ ...REMATRICULA_OK, status: "TRANCADO" }), null);
});

test("motivoRematriculaIndisponivel: FORMADO e DESISTENTE nao podem", () => {
  assert.equal(motivoRematriculaIndisponivel({ ...REMATRICULA_OK, status: "FORMADO" }), "FORMADO");
  assert.equal(motivoRematriculaIndisponivel({ ...REMATRICULA_OK, status: "DESISTENTE" }), "DESISTENTE");
});

test("motivoRematriculaIndisponivel: propina em divida bloqueia, e e dita antes da janela", () => {
  // A ordem importa para a UI: quem deve dinheiro E esta fora da janela deve ler "pague primeiro",
  // que e o que consegue resolver, e nao "fora do periodo", que so o manda esperar.
  const comDivida = { ...REMATRICULA_OK, saldoPropinasDevendo: 85000, dentroDaJanela: false };
  assert.equal(motivoRematriculaIndisponivel(comDivida), "COM_DIVIDA");
});

test("motivoRematriculaIndisponivel: fora da janela bloqueia a Secretaria mas nao a ADMIN", () => {
  const fora = { ...REMATRICULA_OK, dentroDaJanela: false };
  assert.equal(motivoRematriculaIndisponivel(fora), "FORA_DA_JANELA");
  assert.equal(motivoRematriculaIndisponivel({ ...fora, podeForaDaJanela: true }), null, "ADMIN passa (§3.5)");
});

test("motivoRematriculaIndisponivel: sem matricula anterior e Nova Matricula, nao rematricula", () => {
  assert.equal(motivoRematriculaIndisponivel({ ...REMATRICULA_OK, temMatriculaAnterior: false }), "SEM_MATRICULA");
});

test("trabalhoDeFimDeAno: entre o fim do ano letivo e o fim das matriculas, NAO suspende", () => {
  // §2026-09-03, o bug que trancou 12 alunos: a configuracao real tinha o ano letivo a acabar a
  // 24/Jun e as matriculas a abrir a 30/Ago. Com a suspensao presa ao fim do ano letivo, todos
  // eram trancados a 25/Jun — dois meses antes de existir maneira de renovar.
  const config = { anoLetivoFim: new Date(2027, 5, 24), matriculaFim: new Date(2027, 8, 30) };
  const doisDiasDepoisDoAnoLetivo = trabalhoDeFimDeAno(new Date(2027, 5, 26), config);
  assert.equal(doisDiasDepoisDoAnoLetivo.rollover, true, "o rollover corre — as turmas novas fazem falta");
  assert.equal(doisDiasDepoisDoAnoLetivo.suspender, false, "mas ninguem e trancado: a janela nem abriu");
});

test("trabalhoDeFimDeAno: com a janela de matricula ABERTA, ainda nao suspende", () => {
  const config = { anoLetivoFim: new Date(2027, 5, 24), matriculaFim: new Date(2027, 8, 30) };
  assert.equal(trabalhoDeFimDeAno(new Date(2027, 8, 15), config).suspender, false, "quem nao renovou esta a tempo");
});

test("trabalhoDeFimDeAno: depois de a janela fechar, suspende", () => {
  const config = { anoLetivoFim: new Date(2027, 5, 24), matriculaFim: new Date(2027, 8, 30) };
  assert.equal(trabalhoDeFimDeAno(new Date(2027, 9, 1), config).suspender, true, "agora sim faltou mesmo");
});

test("trabalhoDeFimDeAno: sem janela de matricula configurada, nunca suspende", () => {
  // Trancar por omissao tira o acesso a quem nao fez nada de errado — sem fronteira nao ha como
  // distinguir quem faltou de quem ainda vai a tempo.
  const config = { anoLetivoFim: new Date(2027, 5, 24), matriculaFim: null };
  const t = trabalhoDeFimDeAno(new Date(2030, 0, 1), config);
  assert.equal(t.suspender, false);
  assert.equal(t.rollover, true, "o rollover nao depende da janela");
});

test("trabalhoDeFimDeAno: durante o ano letivo nao ha nada a fazer", () => {
  const config = { anoLetivoFim: new Date(2027, 5, 24), matriculaFim: new Date(2026, 8, 30) };
  const t = trabalhoDeFimDeAno(new Date(2027, 0, 15), config);
  assert.equal(t.rollover, false);
  // matriculaFim ja passou (Set/2026), por isso `suspender` e true — mas isso sozinho nao tranca
  // ninguem a meio do ano letivo: quem se matriculou tem matricula do ano corrente, e
  // suspenderNaoRematriculados so mexe em quem ficou num ano ANTERIOR (anoLetivo < anoLetivoNovo).
  assert.equal(t.suspender, true, "a janela deste ano ja fechou — e a funcao diz so isso");
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
