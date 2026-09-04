import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularNotaFinal, epocasVisiveis, motivoAgendamentoInvalido, motivoLancamentoFechado, motivoLancamentoFechadoOuAusente, provaJaPassou, proximaEpocaPendente, rotuloEpoca, rotuloEstado, toneEstado, EPOCA_PARA_CHAVE_NOTAS, type NotasCadeira, type RegrasCadeira } from "./avaliacao";

const REGRAS_PADRAO: RegrasCadeira = { permiteDispensa: true, notaMinimaDispensa: 14, eMonografia: false };
const SEM_NOTAS: NotasCadeira = { p1: null, p2: null, exame: null, recurso: null, exameEspecial: null };

test("sem P1 ou P2 fica EM_CURSO", () => {
  const r1 = calcularNotaFinal({ ...SEM_NOTAS, p1: 15 }, REGRAS_PADRAO);
  assert.equal(r1.estado, "EM_CURSO");
  assert.equal(r1.aprovado, null);

  const r2 = calcularNotaFinal(SEM_NOTAS, REGRAS_PADRAO);
  assert.equal(r2.estado, "EM_CURSO");
});

test("média >= 14 dispensa (aprovado direto, sem exame)", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 14, p2: 14 }, REGRAS_PADRAO);
  assert.equal(r.estado, "DISPENSADO");
  assert.equal(r.notaFrequencia, 14);
  assert.equal(r.notaFinal, 14);
  assert.equal(r.aprovado, true);
});

test("média 12 é positiva mas NÃO dispensa — precisa de exame (o erro mais caro do spec)", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 12, p2: 12 }, REGRAS_PADRAO);
  assert.equal(r.estado, "ADMITIDO_A_EXAME");
  assert.equal(r.notaFrequencia, 12);
  assert.equal(r.notaFinal, null, "não deve ter nota final sem exame lançado");
});

test("9+9 (média 9) precisa de exatamente 11 no exame para passar", () => {
  const comExame10 = calcularNotaFinal({ ...SEM_NOTAS, p1: 9, p2: 9, exame: 10 }, REGRAS_PADRAO);
  assert.equal(comExame10.estado, "EM_RECURSO", "(9+10)/2 = 9.5, ainda reprovado");

  const comExame11 = calcularNotaFinal({ ...SEM_NOTAS, p1: 9, p2: 9, exame: 11 }, REGRAS_PADRAO);
  assert.equal(comExame11.estado, "APROVADO");
  assert.equal(comExame11.notaFinal, 10, "(média 9 + exame 11)/2 = 10");
});

test("13+13 (média 13) precisa de exatamente 7 no exame para passar", () => {
  const comExame6 = calcularNotaFinal({ ...SEM_NOTAS, p1: 13, p2: 13, exame: 6 }, REGRAS_PADRAO);
  assert.equal(comExame6.estado, "EM_RECURSO", "(13+6)/2 = 9.5, ainda reprovado");

  const comExame7 = calcularNotaFinal({ ...SEM_NOTAS, p1: 13, p2: 13, exame: 7 }, REGRAS_PADRAO);
  assert.equal(comExame7.estado, "APROVADO");
  assert.equal(comExame7.notaFinal, 10, "(média 13 + exame 7)/2 = 10");
});

test("recurso conta isolado, não combinado com P1/P2/Exame", () => {
  // Frequência e exame péssimos, mas recurso >= 10 passa sozinho.
  const r = calcularNotaFinal({ p1: 0, p2: 0, exame: 0, recurso: 15, exameEspecial: null }, REGRAS_PADRAO);
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.notaFinal, 15, "nota final deve ser a do recurso isolado, não uma média");
});

test("recurso < 10 vai para exame especial; exame especial conta isolado", () => {
  const pendente = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 9, exameEspecial: null }, REGRAS_PADRAO);
  assert.equal(pendente.estado, "EM_EXAME_ESPECIAL");

  const aprovado = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 9, exameEspecial: 10 }, REGRAS_PADRAO);
  assert.equal(aprovado.estado, "APROVADO");
  assert.equal(aprovado.notaFinal, 10);

  const reprovado = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 9, exameEspecial: 9 }, REGRAS_PADRAO);
  assert.equal(reprovado.estado, "REPROVADO");
  assert.equal(reprovado.aprovado, false);
  assert.equal(reprovado.notaFinal, 9);
});

test("permiteDispensa=false força sempre exame, mesmo com média alta", () => {
  const regras: RegrasCadeira = { permiteDispensa: false, notaMinimaDispensa: 14, eMonografia: false };
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 20, p2: 20 }, regras);
  assert.equal(r.estado, "ADMITIDO_A_EXAME", "média 20 não dispensa se a cadeira não permite dispensa");
});

// --- Monografia (§pedido do cliente 2026-09-04) ---------------------------------------------
// A nota da defesa vive na epoca EXAME (ver o schema); o que estes testes garantem e que a
// monografia NAO passa pela cascata: a nota entra e sai tal e qual, sem media nenhuma.

const REGRAS_MONOGRAFIA: RegrasCadeira = { permiteDispensa: false, notaMinimaDispensa: 14, eMonografia: true };

test("monografia: a nota da defesa e a nota final, sem media — 15 da 15", () => {
  // A pergunta do cliente: "como e que o backend sabe que a nota vai ser 15, se o sistema faz
  // calculo geral das notas?". A resposta e este teste.
  const r = calcularNotaFinal({ ...SEM_NOTAS, exame: 15 }, REGRAS_MONOGRAFIA);
  assert.equal(r.notaFinal, 15, "sem (P1+P2)/2 nem (frequencia+exame)/2 pelo meio");
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.aprovado, true);
});

test("monografia: sem nota de frequencia — nao ha P1/P2 de onde a tirar", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, exame: 15 }, REGRAS_MONOGRAFIA);
  assert.equal(r.notaFrequencia, null, "mostrar uma media aqui seria inventar");
});

test("monografia: negativa fecha REPROVADO — uma so chance, sem recurso", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, exame: 9 }, REGRAS_MONOGRAFIA);
  assert.equal(r.estado, "REPROVADO", "nao vai a EM_RECURSO como uma cadeira normal iria");
  assert.equal(r.notaFinal, 9);
  assert.equal(r.aprovado, false);
});

test("monografia: 10 aprova (fronteira)", () => {
  assert.equal(calcularNotaFinal({ ...SEM_NOTAS, exame: 10 }, REGRAS_MONOGRAFIA).estado, "APROVADO");
  assert.equal(calcularNotaFinal({ ...SEM_NOTAS, exame: 9.9 }, REGRAS_MONOGRAFIA).estado, "REPROVADO");
});

test("monografia: sem nota lancada fica EM_DEFESA, nao EM_CURSO", () => {
  // EM_CURSO significaria "faltam-lhe provas" e o fecho de semestre tentaria dar-lhe 0 no P2.
  const r = calcularNotaFinal(SEM_NOTAS, REGRAS_MONOGRAFIA);
  assert.equal(r.estado, "EM_DEFESA");
  assert.equal(r.notaFinal, null);
  assert.equal(r.aprovado, null);
});

test("monografia: P1/P2 lancados por engano sao orfas, nao entram na conta", () => {
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 20, p2: 20, exame: 12 }, REGRAS_MONOGRAFIA);
  assert.equal(r.notaFinal, 12, "os 20 nao sobem a nota da defesa");
  assert.deepEqual(r.epocasOrfas.sort(), ["P1", "P2"], "sao lixo a apagar, como em qualquer cadeira");
});

test("monografia: so a epoca da defesa e visivel", () => {
  assert.deepEqual(epocasVisiveis(SEM_NOTAS, "EM_DEFESA", true), ["EXAME"]);
  assert.deepEqual(epocasVisiveis({ ...SEM_NOTAS, exame: 15 }, "APROVADO", true), ["EXAME"]);
});

test("monografia: EM_DEFESA num semestre fechado le-se 'Por concluir'", () => {
  assert.equal(rotuloEstado("EM_DEFESA", false), "Por defender");
  assert.equal(rotuloEstado("EM_DEFESA", true), "Por concluir");
  assert.equal(toneEstado("EM_DEFESA", true), "danger");
});

test("monografia: a cascata normal nao regride — eMonografia:false continua igual", () => {
  // A rede de seguranca da mudanca: uma cadeira normal com nota no exame continua a fazer a media.
  const r = calcularNotaFinal({ ...SEM_NOTAS, p1: 10, p2: 10, exame: 14 }, REGRAS_PADRAO);
  assert.equal(r.notaFrequencia, 10);
  assert.equal(r.notaFinal, 12, "(10+14)/2 — a media continua a ser feita");
  assert.equal(r.estado, "APROVADO");
});

test("rotuloEpoca: 'Defesa' so numa monografia; nas outras cadeiras continua 'Exame'", () => {
  assert.equal(rotuloEpoca("EXAME", true), "Defesa");
  assert.equal(rotuloEpoca("EXAME", false), "Exame");
  assert.equal(rotuloEpoca("P1", true), "1ª Prova (P1)", "so a epoca da defesa muda de nome");
});

test("congelamento: o resultado usa as regras passadas, não relê nada — mudar a cadeira depois não altera um cálculo já feito", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 15, p2: 15 };
  const regrasNoMomentoDaInscricao: RegrasCadeira = { permiteDispensa: true, notaMinimaDispensa: 14, eMonografia: false };
  const resultadoOriginal = calcularNotaFinal(notas, regrasNoMomentoDaInscricao);
  assert.equal(resultadoOriginal.estado, "DISPENSADO");

  // Regra da cadeira "muda" no ano seguinte (ex. DAAC sobe o limiar para 16) — mas o resultado já
  // apurado com as regras congeladas da inscrição continua a ser recalculado com os MESMOS valores.
  const resultadoRecalculadoComRegrasAntigas = calcularNotaFinal(notas, regrasNoMomentoDaInscricao);
  assert.deepEqual(resultadoRecalculadoComRegrasAntigas, resultadoOriginal);
});

test("epocasVisiveis: EM_CURSO mostra P1 e P2 como por vir, nada além", () => {
  assert.deepEqual(epocasVisiveis(SEM_NOTAS, "EM_CURSO"), ["P1", "P2"]);
});

test("epocasVisiveis: DISPENSADO só mostra P1/P2 — nunca Exame/Recurso/Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 15, p2: 15 };
  assert.deepEqual(epocasVisiveis(notas, "DISPENSADO"), ["P1", "P2"]);
});

test("epocasVisiveis: ADMITIDO_A_EXAME mostra P1/P2/Exame, não Recurso nem Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9 };
  assert.deepEqual(epocasVisiveis(notas, "ADMITIDO_A_EXAME"), ["P1", "P2", "EXAME"]);
});

test("epocasVisiveis: aprovado por Exame não mostra Recurso nem Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9, exame: 12 };
  assert.deepEqual(epocasVisiveis(notas, "APROVADO"), ["P1", "P2", "EXAME"]);
});

test("epocasVisiveis: aprovado por Recurso mostra até ao Recurso (Exame reprovado é facto histórico), não mostra Especial", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9, exame: 5, recurso: 12 };
  assert.deepEqual(epocasVisiveis(notas, "APROVADO"), ["P1", "P2", "EXAME", "RECURSO"]);
});

test("epocasVisiveis: reprovado no Exame Especial mostra as 5 épocas (todas já lançadas)", () => {
  const notas: NotasCadeira = { p1: 9, p2: 9, exame: 5, recurso: 5, exameEspecial: 5 };
  assert.deepEqual(epocasVisiveis(notas, "REPROVADO"), ["P1", "P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"]);
});

test("proximaEpocaPendente: EM_CURSO sem P1 aponta para P1, não P2 (diferente de epocasVisiveis)", () => {
  assert.equal(proximaEpocaPendente(SEM_NOTAS, "EM_CURSO"), "P1");
});

test("proximaEpocaPendente: EM_CURSO com P1 lançado e sem P2 aponta para P2", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9 };
  assert.equal(proximaEpocaPendente(notas, "EM_CURSO"), "P2");
});

test("proximaEpocaPendente: ADMITIDO_A_EXAME aponta para EXAME", () => {
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 9, p2: 9 };
  assert.equal(proximaEpocaPendente(notas, "ADMITIDO_A_EXAME"), "EXAME");
});

test("proximaEpocaPendente: EM_RECURSO aponta para RECURSO, EM_EXAME_ESPECIAL para EXAME_ESPECIAL", () => {
  const notas: NotasCadeira = { p1: 5, p2: 5, exame: 5, recurso: null, exameEspecial: null };
  assert.equal(proximaEpocaPendente(notas, "EM_RECURSO"), "RECURSO");
  assert.equal(proximaEpocaPendente({ ...notas, recurso: 9 }, "EM_EXAME_ESPECIAL"), "EXAME_ESPECIAL");
});

test("proximaEpocaPendente: estados terminais (DISPENSADO/APROVADO/REPROVADO) não têm pendência", () => {
  const notas: NotasCadeira = { p1: 15, p2: 15, exame: null, recurso: null, exameEspecial: null };
  assert.equal(proximaEpocaPendente(notas, "DISPENSADO"), null);
  assert.equal(proximaEpocaPendente(notas, "APROVADO"), null);
  assert.equal(proximaEpocaPendente(notas, "REPROVADO"), null);
});

test("epocasOrfas: corrigir o Exame para cima até aprovar torna um Recurso já lançado órfão", () => {
  // Exame estava a 5 (reprovava, precisava de recurso), professor corrige para 13 (aprova sozinho).
  const notas: NotasCadeira = { p1: 9, p2: 9, exame: 13, recurso: 15, exameEspecial: null };
  const r = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.notaFinal, 11, "(média 9 + exame 13)/2 = 11, ignora o recurso");
  assert.deepEqual(r.epocasOrfas, ["RECURSO"]);
});

test("epocasOrfas: corrigir P1/P2 para cima até dispensar torna Exame E Recurso já lançados órfãos", () => {
  const notas: NotasCadeira = { p1: 18, p2: 16, exame: 5, recurso: 5, exameEspecial: null };
  const r = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(r.estado, "DISPENSADO");
  assert.deepEqual(r.epocasOrfas, ["EXAME", "RECURSO"]);
});

test("epocasOrfas: aprovar por Recurso torna um Exame Especial já lançado órfão", () => {
  const notas: NotasCadeira = { p1: 5, p2: 5, exame: 5, recurso: 12, exameEspecial: 8 };
  const r = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(r.estado, "APROVADO");
  assert.equal(r.notaFinal, 12, "recurso isolado, ignora o exame especial");
  assert.deepEqual(r.epocasOrfas, ["EXAME_ESPECIAL"]);
});

test("epocasOrfas: vazio quando a cascata usa realmente todas as notas presentes", () => {
  const emCurso = calcularNotaFinal({ ...SEM_NOTAS, p1: 9 }, REGRAS_PADRAO);
  assert.deepEqual(emCurso.epocasOrfas, []);

  const emRecurso = calcularNotaFinal({ p1: 9, p2: 9, exame: 5, recurso: null, exameEspecial: null }, REGRAS_PADRAO);
  assert.deepEqual(emRecurso.epocasOrfas, []);

  const reprovado = calcularNotaFinal({ p1: 5, p2: 5, exame: 5, recurso: 5, exameEspecial: 5 }, REGRAS_PADRAO);
  assert.deepEqual(reprovado.epocasOrfas, []);
});

// --- Janela de lancamento: interruptor manual do DAAC + prova ja realizada ---
// §decisao do cliente 2026-09-02: o prazo automatico por epoca desapareceu; quem abre e fecha e o
// DAAC, com um unico interruptor global. Prova a 15/11/2026 as 14h.
const PROVA = { data: new Date(2026, 10, 15, 14, 0) };

test("motivoLancamentoFechado: janela fechada bloqueia mesmo com a prova ja dada", () => {
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 10, 20), false), "LANCAMENTO_FECHADO");
});

test("motivoLancamentoFechado: janela fechada tem prioridade sobre a prova por realizar", () => {
  // Com a janela fechada nao interessa quando e a prova — dizer "espere pelo dia da prova"
  // mandaria o professor esperar por uma data que nao ia resolver nada.
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 10, 1), false), "LANCAMENTO_FECHADO");
});

test("motivoLancamentoFechado: janela aberta nao deixa lancar antes do dia da prova", () => {
  // PROVA_POR_REALIZAR sobreviveu a mudanca: o cliente nao pediu para o tirar.
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 10, 14, 23, 59), true), "PROVA_POR_REALIZAR", "vespera");
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 9, 1), true), "PROVA_POR_REALIZAR", "mes e meio antes");
});

test("motivoLancamentoFechado: janela aberta abre no DIA da prova, nao a hora", () => {
  // De manha, antes das 14h da prova, ja abre — o professor corrige e lanca no proprio dia sem
  // depender de a hora estar bem preenchida.
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 10, 15, 8, 0), true), null, "manha do dia da prova");
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 10, 15, 18, 0), true), null, "depois da prova");
});

test("motivoLancamentoFechado: janela aberta NAO fecha sozinha com o passar do tempo", () => {
  // A garantia central da mudanca de 2026-09-02: um mes depois da prova continua aberto. Sem este
  // teste, uma regressao que reintroduzisse um limite temporal passava despercebida.
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2026, 11, 20), true), null, "um mes depois");
  assert.equal(motivoLancamentoFechado(PROVA, new Date(2027, 5, 1), true), null, "meio ano depois");
});

test("motivoLancamentoFechadoOuAusente: epoca ainda sem prova agendada segue a janela global", () => {
  // Recurso/Exame Especial que o DAAC ainda nao marcou: sem Avaliacao nao ha data a validar, mas a
  // janela continua a mandar. Antes de 2026-09-02 uma epoca sem Avaliacao nunca estava fechada.
  assert.equal(motivoLancamentoFechadoOuAusente(null, new Date(2026, 10, 20), true), null, "aberta");
  assert.equal(motivoLancamentoFechadoOuAusente(null, new Date(2026, 10, 20), false), "LANCAMENTO_FECHADO", "fechada");
  // Com Avaliacao, delega em motivoLancamentoFechado.
  assert.equal(motivoLancamentoFechadoOuAusente(PROVA, new Date(2026, 10, 1), true), "PROVA_POR_REALIZAR");
});

// --- Ordem de agendamento das provas (P1 -> P2 -> Exame -> Recurso -> Especial) ---

const P1_MARCADA = [{ epoca: "P1" as const, data: new Date(2026, 10, 10) }];
const P1_P2_MARCADAS = [
  { epoca: "P1" as const, data: new Date(2026, 10, 10) },
  { epoca: "P2" as const, data: new Date(2026, 11, 10) },
];

test("motivoAgendamentoInvalido: P1 pode sempre ser a primeira", () => {
  assert.equal(motivoAgendamentoInvalido("P1", new Date(2026, 10, 10), []), null);
});

test("motivoAgendamentoInvalido: nao deixa marcar P2 sem P1", () => {
  // O bug relatado pelo cliente: dava para marcar P2 sem P1 existir.
  const r = motivoAgendamentoInvalido("P2", new Date(2026, 11, 10), []);
  assert.deepEqual(r, { tipo: "FALTA_ANTERIOR", anterior: "P1" });
});

test("motivoAgendamentoInvalido: nao deixa saltar do P1 para o Exame", () => {
  const r = motivoAgendamentoInvalido("EXAME", new Date(2026, 11, 20), P1_MARCADA);
  assert.deepEqual(r, { tipo: "FALTA_ANTERIOR", anterior: "P2" });
});

test("motivoAgendamentoInvalido: nao deixa marcar para antes da epoca anterior", () => {
  const r = motivoAgendamentoInvalido("EXAME", new Date(2026, 10, 1), P1_P2_MARCADAS);
  assert.equal(r?.tipo, "ANTES_DA_ANTERIOR");
});

test("motivoAgendamentoInvalido: aceita a proxima epoca em data posterior", () => {
  assert.equal(motivoAgendamentoInvalido("P2", new Date(2026, 11, 10), P1_MARCADA), null);
  assert.equal(motivoAgendamentoInvalido("EXAME", new Date(2027, 0, 15), P1_P2_MARCADAS), null);
});

test("motivoAgendamentoInvalido: recusa duplicar uma epoca ja agendada", () => {
  const r = motivoAgendamentoInvalido("P1", new Date(2026, 10, 12), P1_MARCADA);
  assert.deepEqual(r, { tipo: "JA_AGENDADA" });
});

test("motivoAgendamentoInvalido: mesmo dia da anterior e aceite", () => {
  // So recusa datas ANTERIORES — duas epocas no mesmo dia sao improvaveis mas nao incoerentes.
  assert.equal(motivoAgendamentoInvalido("P2", new Date(2026, 10, 10), P1_MARCADA), null);
});

test("provaJaPassou: no DIA da prova ainda não passou — o professor tem de poder imprimir a lista", () => {
  // O bug (§2026-08-31): avaliacao.data é meia-noite do dia da prova, por isso `data < agora`
  // dizia "já passou" a partir das 00:00 desse mesmo dia, e o professor perdia a lista de presença
  // logo de manhã — justamente no dia em que precisava dela para a sala.
  const prova = new Date(2026, 8, 15);
  assert.equal(provaJaPassou(prova, new Date(2026, 8, 15, 0, 0)), false, "meia-noite do dia da prova");
  assert.equal(provaJaPassou(prova, new Date(2026, 8, 15, 8, 30)), false, "manhã do dia da prova");
  assert.equal(provaJaPassou(prova, new Date(2026, 8, 15, 23, 59)), false, "fim do dia da prova");
});

test("provaJaPassou: a partir do dia seguinte a prova conta como dada", () => {
  const prova = new Date(2026, 8, 15);
  assert.equal(provaJaPassou(prova, new Date(2026, 8, 16, 0, 0)), true);
  assert.equal(provaJaPassou(prova, new Date(2026, 9, 1)), true);
});

test("provaJaPassou: antes do dia da prova é falso", () => {
  const prova = new Date(2026, 8, 15);
  assert.equal(provaJaPassou(prova, new Date(2026, 8, 14, 23, 59)), false);
});

test("provaJaPassou atravessa fronteiras de mês e ano sem se enganar", () => {
  assert.equal(provaJaPassou(new Date(2026, 11, 31), new Date(2026, 11, 31, 20, 0)), false, "31 dez, no próprio dia");
  assert.equal(provaJaPassou(new Date(2026, 11, 31), new Date(2027, 0, 1)), true, "1 jan do ano seguinte");
  assert.equal(provaJaPassou(new Date(2026, 7, 31), new Date(2026, 8, 1)), true, "vira o mês");
});

test("remarcar: a própria prova excluída da lista deixa de bloquear como JA_AGENDADA", () => {
  // Ao editar, a prova a remarcar tem de sair da lista de existentes — senão a sua própria época
  // conta como "já agendada" e nenhuma remarcação passaria (§editarProvaAction, 2026-08-31).
  const outras = [{ epoca: "P1" as const, data: new Date(2026, 8, 10) }];
  // P2 remarcado para depois do P1: válido, porque o P2 antigo não está na lista.
  assert.equal(motivoAgendamentoInvalido("P2", new Date(2026, 8, 20), outras), null);
});

test("remarcar: a cascata continua a valer na nova data", () => {
  const outras = [{ epoca: "P1" as const, data: new Date(2026, 8, 10) }];
  // Puxar o P2 para antes do P1 tem de continuar a ser recusado, mesmo a remarcar.
  const motivo = motivoAgendamentoInvalido("P2", new Date(2026, 8, 5), outras);
  assert.equal(motivo?.tipo, "ANTES_DA_ANTERIOR");
});

test("fecho de semestre: P1 lançado e P2 em falta apura reprovado, não fica 'Em curso'", () => {
  // O caso da imagem (§2026-08-31): P1 = 8, P2 nunca lançado. Enquanto o semestre corre é
  // legitimamente EM_CURSO; quando fecha, o 0 no P2 tem de fazer a cascata avançar.
  const antes: NotasCadeira = { ...SEM_NOTAS, p1: 8 };
  assert.equal(calcularNotaFinal(antes, REGRAS_PADRAO).estado, "EM_CURSO");

  // Simula o que fecharSemestre grava: 0 na próxima época pendente, em cascata.
  let notas = antes;
  const zeros: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const resultado = calcularNotaFinal(notas, REGRAS_PADRAO);
    const proxima = proximaEpocaPendente(notas, resultado.estado);
    if (!proxima) break;
    zeros.push(proxima);
    notas = { ...notas, [EPOCA_PARA_CHAVE_NOTAS[proxima]]: 0 };
  }

  // P2=0 dá média 4 (admitido a exame), Exame=0 dá 2 (recurso), Recurso=0 (especial), Especial=0.
  assert.deepEqual(zeros, ["P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"]);
  assert.equal(calcularNotaFinal(notas, REGRAS_PADRAO).estado, "REPROVADO");
});

test("fecho de semestre: cadeira já dispensada não recebe zeros nenhuns", () => {
  // Quem já fechou a cadeira não pode ser tocado pelo fecho — proximaEpocaPendente devolve null.
  const notas: NotasCadeira = { ...SEM_NOTAS, p1: 15, p2: 15 };
  const resultado = calcularNotaFinal(notas, REGRAS_PADRAO);
  assert.equal(resultado.estado, "DISPENSADO");
  assert.equal(proximaEpocaPendente(notas, resultado.estado), null);
});

test("fecho de semestre: cadeira sem nota nenhuma começa a cascata no P1", () => {
  const resultado = calcularNotaFinal(SEM_NOTAS, REGRAS_PADRAO);
  assert.equal(proximaEpocaPendente(SEM_NOTAS, resultado.estado), "P1");
});

test("rotuloEstado: num semestre fechado, um estado pendente lê-se 'Por concluir'", () => {
  // O fecho só grava 0 em épocas AGENDADAS (§decisão do cliente 2026-09-01). Uma cadeira cujo
  // Recurso nunca foi marcado fica parada em EM_RECURSO — e nesse semestre não vai haver recurso.
  assert.equal(rotuloEstado("EM_RECURSO", true), "Por concluir");
  assert.equal(rotuloEstado("EM_CURSO", true), "Por concluir");
  assert.equal(rotuloEstado("ADMITIDO_A_EXAME", true), "Por concluir");
  assert.equal(toneEstado("EM_RECURSO", true), "danger", "não é um aviso passageiro");
});

test("rotuloEstado: com o semestre a decorrer, o rótulo normal mantém-se", () => {
  assert.equal(rotuloEstado("EM_RECURSO", false), "Em recurso");
  assert.equal(rotuloEstado("EM_CURSO", false), "Em curso");
});

test("rotuloEstado: estados já decididos não mudam, semestre fechado ou não", () => {
  for (const fechado of [true, false]) {
    assert.equal(rotuloEstado("APROVADO", fechado), "Aprovado");
    assert.equal(rotuloEstado("DISPENSADO", fechado), "Dispensado");
    assert.equal(rotuloEstado("REPROVADO", fechado), "Reprovado");
  }
  assert.equal(toneEstado("DISPENSADO", true), "success", "quem dispensou não fica marcado a vermelho");
});
