/**
 * O elenco do manual (§pedido do cliente 2026-09-13: "vamos semear a base de dados" para se poder
 * fotografar o sistema a funcionar e escrever o manual da faculdade).
 *
 * Tudo aqui é DETERMINÍSTICO — nenhum Math.random. Ao contrário de prisma/seed.ts, que sorteia
 * notas e dívidas, este conjunto tem de poder ser re-semeado e produzir exatamente as mesmas
 * imagens: uma captura tirada hoje e outra tirada na semana que vem têm de mostrar os mesmos
 * números, senão o texto do manual deixa de bater certo com a figura ao lado.
 *
 * O critério de escolha do elenco foi um só: NENHUM ECRÃ DO MANUAL PODE APARECER VAZIO. Por isso
 * há um finalista por defender e outro já defendido, um repetente, uma trancada, uma devedora
 * crónica, uma bolseira e reclamações nos três estados — cada um existe porque há uma página que
 * sem ele não teria nada para mostrar.
 *
 * Escrito por scripts/manual/seed-manual.ts. Apagado no fim por scripts/preparar-arranque-real.ts.
 */

/** Senha única de todas as contas semeadas — a mesma constante do sistema (SENHA_INICIAL_PADRAO). */
export const SENHA_DEMO = "Ispc@2026";

// ---------------------------------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------------------------------

/**
 * As datas foram escolhidas para que TODOS os ecrãs estejam vivos no dia em que as capturas são
 * tiradas (2026-09-13), porque `anoLetivoCorrente` devolve null fora do intervalo e isso esvazia
 * meia aplicação de uma vez (ver src/lib/academico.ts:57).
 *
 *   - hoje cai dentro de [início, fim]  → o ano letivo corrente é 2026 e as turmas aparecem
 *   - semestreAtual = 1                 → a pauta do professor fica EDITÁVEL (com 2 seria só
 *                                         leitura, ver semestreFechado) — é o ecrã mais
 *                                         importante do capítulo do Professor
 *   - a janela de matrícula está aberta → a Secretaria pode demonstrar "Processar Rematrícula"
 *
 * O ano letivo Março→Dezembro não é um capricho: é o calendário angolano comum, e dá sete meses de
 * história atrás de nós onde assentar aulas e notas já lançadas. Um ano Setembro→Julho deixaria só
 * duas semanas de passado, e as listas de aulas e de notas apareciam quase vazias.
 */
export const ANO_LETIVO = 2026;
export const ANO_LETIVO_SEGUINTE = 2027;
export const ANO_LETIVO_INICIO = new Date("2026-03-02T07:00:00.000Z");
export const ANO_LETIVO_FIM = new Date("2026-12-18T17:00:00.000Z");
export const MATRICULA_INICIO = new Date("2026-09-01T07:00:00.000Z");
export const MATRICULA_FIM = new Date("2026-10-31T17:00:00.000Z");
export const SEMESTRE_ATUAL = 1;

/** Datas das provas. P1 e P2 já passaram (há notas para mostrar); o resto está agendado à frente. */
export const DATA_P1 = new Date("2026-07-15T08:00:00.000Z");
export const DATA_P2 = new Date("2026-08-28T08:00:00.000Z");
export const DATA_EXAME = new Date("2026-09-25T08:00:00.000Z");
export const DATA_RECURSO = new Date("2026-10-12T08:00:00.000Z");
export const DATA_EXAME_ESPECIAL = new Date("2026-10-26T08:00:00.000Z");

/** Primeira das 10 aulas semanais já dadas — a última cai a 2026-09-07, seis dias antes de hoje. */
export const PRIMEIRA_AULA = new Date("2026-07-06T08:00:00.000Z");
export const TOTAL_AULAS = 10;

// ---------------------------------------------------------------------------------------------
// Cursos, disciplinas e plano curricular
// ---------------------------------------------------------------------------------------------

export interface CursoDef {
  nome: string;
  codigo: string;
  duracaoAnos: number;
}

export const CURSOS: CursoDef[] = [
  { nome: "Engenharia Informática", codigo: "ENG-INF", duracaoAnos: 4 },
  { nome: "Gestão de Empresas", codigo: "GESTAO", duracaoAnos: 3 },
];

export type DiaSemana = "SEGUNDA" | "TERCA" | "QUARTA" | "QUINTA" | "SEXTA";

export interface SlotDef {
  diaSemana: DiaSemana;
  horaInicio: string;
  horaFim: string;
}

export interface DisciplinaDef {
  nome: string;
  codigo: string;
  cargaHoraria: number;
  cursoCodigo: string;
  /** Onde a disciplina vive no plano curricular: ano e semestre do curso. */
  anoCurricular: number;
  semestre: 1 | 2;
  /** Email do professor que a lecciona — null deixa a cadeira sem professor, de propósito. */
  professorEmail: string | null;
  sala: string;
  slots: SlotDef[];
  /** Monografia do último ano: nota única na defesa, lançada só pelo DAAC (§2026-09-04). */
  eMonografia?: boolean;
  permiteDispensa?: boolean;
}

/**
 * Uma disciplina do 2º ano fica DE PROPÓSITO sem professor (Sistemas Operativos). O manual precisa
 * de mostrar o ecrã "Turmas" com uma linha por atribuir, que é o estado real de qualquer turma
 * acabada de criar — as disciplinas nascem do plano curricular e o professor vem depois.
 */
export const DISCIPLINAS: DisciplinaDef[] = [
  // --- Engenharia Informática -----------------------------------------------------------------
  {
    nome: "Programação I",
    codigo: "ENG-101",
    cargaHoraria: 60,
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    semestre: 1,
    professorEmail: "antonio.sousa@ispc.ao",
    sala: "Lab 1",
    slots: [
      { diaSemana: "SEGUNDA", horaInicio: "08:00", horaFim: "10:00" },
      { diaSemana: "QUARTA", horaInicio: "08:00", horaFim: "10:00" },
    ],
  },
  {
    nome: "Matemática Discreta",
    codigo: "ENG-102",
    cargaHoraria: 45,
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    semestre: 1,
    professorEmail: "domingas.kuzola@ispc.ao",
    sala: "Sala A1",
    slots: [{ diaSemana: "TERCA", horaInicio: "08:00", horaFim: "10:00" }],
  },
  {
    nome: "Bases de Dados",
    codigo: "ENG-103",
    cargaHoraria: 45,
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    semestre: 2,
    professorEmail: "rui.ferreira@ispc.ao",
    sala: "Lab 2",
    slots: [{ diaSemana: "QUINTA", horaInicio: "08:00", horaFim: "10:00" }],
  },
  {
    nome: "Programação II",
    codigo: "ENG-201",
    cargaHoraria: 60,
    cursoCodigo: "ENG-INF",
    anoCurricular: 2,
    semestre: 1,
    professorEmail: "antonio.sousa@ispc.ao",
    sala: "Lab 1",
    slots: [
      { diaSemana: "TERCA", horaInicio: "10:00", horaFim: "12:00" },
      { diaSemana: "QUINTA", horaInicio: "10:00", horaFim: "12:00" },
    ],
  },
  {
    // Sem professor — ver a nota acima deste array.
    nome: "Sistemas Operativos",
    codigo: "ENG-202",
    cargaHoraria: 60,
    cursoCodigo: "ENG-INF",
    anoCurricular: 2,
    semestre: 1,
    professorEmail: null,
    sala: "Lab 3",
    slots: [{ diaSemana: "SEGUNDA", horaInicio: "10:00", horaFim: "12:00" }],
  },
  {
    nome: "Redes de Computadores",
    codigo: "ENG-203",
    cargaHoraria: 45,
    cursoCodigo: "ENG-INF",
    anoCurricular: 2,
    semestre: 2,
    professorEmail: "joaquim.bandeira@ispc.ao",
    sala: "Lab Redes",
    slots: [{ diaSemana: "SEXTA", horaInicio: "10:00", horaFim: "12:00" }],
  },
  {
    nome: "Engenharia de Software",
    codigo: "ENG-301",
    cargaHoraria: 60,
    cursoCodigo: "ENG-INF",
    anoCurricular: 3,
    semestre: 1,
    professorEmail: "jacinto.neto@ispc.ao",
    sala: "Sala B1",
    slots: [{ diaSemana: "SEXTA", horaInicio: "18:00", horaFim: "21:00" }],
  },
  {
    nome: "Inteligência Artificial",
    codigo: "ENG-302",
    cargaHoraria: 45,
    cursoCodigo: "ENG-INF",
    anoCurricular: 3,
    semestre: 2,
    professorEmail: "domingas.kuzola@ispc.ao",
    sala: "Sala B2",
    slots: [{ diaSemana: "QUARTA", horaInicio: "18:00", horaFim: "21:00" }],
  },
  {
    nome: "Monografia",
    codigo: "ENG-MONO",
    cargaHoraria: 120,
    cursoCodigo: "ENG-INF",
    anoCurricular: 4,
    // Arbitrário numa monografia — dura o ano inteiro e as listagens ignoram este valor
    // (createCadeiraCurricularAction força-o a 1).
    semestre: 1,
    professorEmail: "manuel.nzaji@ispc.ao",
    sala: "Sala C1",
    slots: [],
    eMonografia: true,
    // Não há P1/P2 de onde sair uma média que dispense.
    permiteDispensa: false,
  },

  // --- Gestão de Empresas ---------------------------------------------------------------------
  {
    nome: "Contabilidade Geral",
    codigo: "GES-101",
    cargaHoraria: 45,
    cursoCodigo: "GESTAO",
    anoCurricular: 1,
    semestre: 1,
    professorEmail: "fernanda.mucavele@ispc.ao",
    sala: "Sala 5",
    slots: [
      { diaSemana: "SEGUNDA", horaInicio: "10:00", horaFim: "12:00" },
      { diaSemana: "QUARTA", horaInicio: "10:00", horaFim: "12:00" },
    ],
  },
  {
    nome: "Introdução à Gestão",
    codigo: "GES-102",
    cargaHoraria: 45,
    cursoCodigo: "GESTAO",
    anoCurricular: 1,
    semestre: 1,
    professorEmail: "isabel.chissano@ispc.ao",
    sala: "Sala 5",
    slots: [{ diaSemana: "SEXTA", horaInicio: "08:00", horaFim: "10:00" }],
  },
  {
    nome: "Marketing",
    codigo: "GES-201",
    cargaHoraria: 45,
    cursoCodigo: "GESTAO",
    anoCurricular: 2,
    semestre: 1,
    professorEmail: "isabel.chissano@ispc.ao",
    sala: "Sala 6",
    slots: [
      { diaSemana: "TERCA", horaInicio: "18:00", horaFim: "20:00" },
      { diaSemana: "QUINTA", horaInicio: "18:00", horaFim: "20:00" },
    ],
  },
  {
    nome: "Gestão Financeira",
    codigo: "GES-202",
    cargaHoraria: 45,
    cursoCodigo: "GESTAO",
    anoCurricular: 2,
    semestre: 2,
    professorEmail: "fernanda.mucavele@ispc.ao",
    sala: "Sala 6",
    slots: [{ diaSemana: "QUARTA", horaInicio: "18:00", horaFim: "20:00" }],
  },
];

// ---------------------------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------------------------

export interface ProfessorDef {
  nome: string;
  email: string;
  telefone: string;
  especialidade: string;
}

export const PROFESSORES: ProfessorDef[] = [
  { nome: "Eng. António Sousa", email: "antonio.sousa@ispc.ao", telefone: "+244 923 111 222", especialidade: "Programação" },
  { nome: "Eng. Rui Manuel Ferreira", email: "rui.ferreira@ispc.ao", telefone: "+244 923 222 333", especialidade: "Bases de Dados" },
  { nome: "Prof. Joaquim Bandeira", email: "joaquim.bandeira@ispc.ao", telefone: "+244 923 333 444", especialidade: "Redes e Infraestrutura" },
  { nome: "Dra. Fernanda Mucavele", email: "fernanda.mucavele@ispc.ao", telefone: "+244 923 444 555", especialidade: "Gestão e Finanças" },
  { nome: "Dra. Isabel Chissano", email: "isabel.chissano@ispc.ao", telefone: "+244 923 555 666", especialidade: "Marketing e Economia" },
  { nome: "Dra. Domingas Kuzola", email: "domingas.kuzola@ispc.ao", telefone: "+244 923 666 777", especialidade: "Matemática e Inteligência Artificial" },
  { nome: "Dr. Jacinto Paulo Neto", email: "jacinto.neto@ispc.ao", telefone: "+244 923 777 888", especialidade: "Engenharia de Software" },
  { nome: "Prof. Manuel Nzaji", email: "manuel.nzaji@ispc.ao", telefone: "+244 923 888 999", especialidade: "Projeto e Orientação" },
];

/** Contas de staff sem Professor nem Aluno por trás. */
export interface StaffDef {
  nome: string;
  email: string;
  role: "ADMIN" | "SECRETARIA" | "DAAC" | "DEV";
}

export const STAFF: StaffDef[] = [
  { nome: "Administrador ISPC", email: "admin@ispc.ao", role: "ADMIN" },
  { nome: "Secretaria ISPC", email: "secretaria@ispc.ao", role: "SECRETARIA" },
  { nome: "DAAC ISPC", email: "daac@ispc.ao", role: "DAAC" },
  { nome: "Responsável Técnico ISPC", email: "dev@ispc.ao", role: "DEV" },
];

export type Periodo = "MATUTINO" | "NOTURNO";
export type Categoria = "NORMAL" | "BOLSEIRO_INAGBE" | "COMPARTICIPADA";
export type AlunoStatus = "ATIVO" | "TRANCADO" | "DESISTENTE" | "FORMADO";

export interface AlunoDef {
  numero: string;
  nome: string;
  genero: "Feminino" | "Masculino";
  nascimento: string;
  cursoCodigo: string;
  anoCurricular: number;
  periodo: Periodo;
  anoIngresso: number;
  categoria?: Categoria;
  status?: AlunoStatus;
  /** Quantos dos últimos 6 meses de propina ficam por pagar (a contar do mês corrente para trás). */
  mesesEmDivida: number;
  /** Acrescenta uma MULTA pendente sobre a propina mais antiga em dívida. */
  multa?: boolean;
  /** Porque é que esta pessoa existe no elenco — qual é o ecrã que sem ela ficava vazio. */
  perfil: string;
}

/**
 * Dezasseis alunos, cada um a cobrir um estado que o manual tem de conseguir fotografar.
 * A ordem importa: o primeiro é o dono da conta de demonstração aluno@ispc.ao.
 */
export const ALUNOS: AlunoDef[] = [
  {
    numero: "ISPC2026-0001",
    nome: "Marta Kiala",
    genero: "Feminino",
    nascimento: "2005-04-12",
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 0,
    perfil: "caminho feliz — dispensada em Programação I (16 e 15), propinas todas pagas. É a conta aluno@ispc.ao do manual.",
  },
  {
    numero: "ISPC2026-0002",
    nome: "João Manuel",
    genero: "Masculino",
    nascimento: "2004-11-03",
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 2,
    perfil: "admitido a exame e aprovado (8, 8, 15) — mostra a cascata a funcionar. Dois meses em dívida.",
  },
  {
    numero: "ISPC2026-0003",
    nome: "Adriana Muanza",
    genero: "Feminino",
    nascimento: "2005-01-27",
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 0,
    perfil: "reprovada no exame e aprovada no recurso (5, 5, 5, 14) — a época de recurso contada isolada.",
  },
  {
    numero: "ISPC2026-0004",
    nome: "Carla Tchissola",
    genero: "Feminino",
    nascimento: "2004-08-19",
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 0,
    perfil: "reprovada em todas as épocas até ao exame especial — o único estado REPROVADO do 1º ano, e o que a retém na rematrícula.",
  },
  {
    numero: "ISPC2026-0005",
    nome: "Sandra Vieira Dias",
    genero: "Feminino",
    nascimento: "2005-06-30",
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    status: "TRANCADO",
    mesesEmDivida: 3,
    perfil: "TRANCADA por não ter rematriculado — mostra o estado e o ecrã de reativação da Secretaria.",
  },
  {
    numero: "ISPC2026-0006",
    nome: "Ana Paula Gaspar",
    genero: "Feminino",
    nascimento: "2005-09-08",
    cursoCodigo: "ENG-INF",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 0,
    perfil: "aluna sem nada de especial — a turma precisa de ter gente comum para as pautas não parecerem só casos extremos.",
  },
  {
    numero: "ISPC2026-0007",
    nome: "Nelson Sapalo",
    genero: "Masculino",
    nascimento: "2003-02-14",
    cursoCodigo: "ENG-INF",
    anoCurricular: 2,
    periodo: "MATUTINO",
    anoIngresso: 2025,
    mesesEmDivida: 0,
    perfil: "2º ano regular — povoa a pauta de Programação II.",
  },
  {
    numero: "ISPC2026-0008",
    nome: "Emanuel Kiesse",
    genero: "Masculino",
    nascimento: "2003-07-21",
    cursoCodigo: "ENG-INF",
    anoCurricular: 2,
    periodo: "MATUTINO",
    anoIngresso: 2025,
    mesesEmDivida: 1,
    perfil: "2º ano regular.",
  },
  {
    numero: "ISPC2026-0009",
    nome: "Domingos Cavaco",
    genero: "Masculino",
    nascimento: "2002-12-05",
    cursoCodigo: "ENG-INF",
    anoCurricular: 3,
    periodo: "NOTURNO",
    anoIngresso: 2024,
    mesesEmDivida: 0,
    perfil: "REPETENTE — 3º ano a repetir Programação II do 2º (tentativa 2). É o caso que explica por que a inscrição vive na cadeira e não na matrícula.",
  },
  {
    numero: "ISPC2026-0010",
    nome: "Beatriz Sacatucua",
    genero: "Feminino",
    nascimento: "2003-03-17",
    cursoCodigo: "ENG-INF",
    anoCurricular: 3,
    periodo: "NOTURNO",
    anoIngresso: 2024,
    categoria: "BOLSEIRO_INAGBE",
    mesesEmDivida: 0,
    perfil: "bolseira INAGBE — a categoria muda o preço da propina e é visível nos relatórios financeiros.",
  },
  {
    numero: "ISPC2026-0011",
    nome: "Vanessa Capitango",
    genero: "Feminino",
    nascimento: "2002-05-09",
    cursoCodigo: "ENG-INF",
    anoCurricular: 4,
    periodo: "MATUTINO",
    anoIngresso: 2023,
    mesesEmDivida: 0,
    perfil: "FINALISTA JÁ DEFENDIDA — nota 16 na defesa. Mostra o estado pós-defesa, com data e orientador travados.",
  },
  {
    numero: "ISPC2026-0012",
    nome: "Hélder Zua",
    genero: "Masculino",
    nascimento: "2002-10-23",
    cursoCodigo: "ENG-INF",
    anoCurricular: 4,
    periodo: "MATUTINO",
    anoIngresso: 2023,
    mesesEmDivida: 0,
    perfil: "FINALISTA COM DEFESA MARCADA — orientador atribuído, defesa a 20/10, nota ainda por lançar. É o ecrã 'Por defender'.",
  },
  {
    numero: "ISPC2026-0013",
    nome: "Miguel Sumbo",
    genero: "Masculino",
    nascimento: "2002-08-02",
    cursoCodigo: "ENG-INF",
    anoCurricular: 4,
    periodo: "MATUTINO",
    anoIngresso: 2023,
    mesesEmDivida: 2,
    perfil: "FINALISTA SEM ORIENTADOR — deixa uma linha por resolver em Admin > Finalistas, que é o ecrã onde o DAAC atribui.",
  },
  {
    numero: "ISPC2026-0014",
    nome: "Ricardo Domingos",
    genero: "Masculino",
    nascimento: "2005-02-11",
    cursoCodigo: "GESTAO",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 0,
    perfil: "1º ano de Gestão — o segundo curso tem de ter alunos para o manual mostrar que o sistema não é de um curso só.",
  },
  {
    numero: "ISPC2026-0015",
    nome: "Paula Massano",
    genero: "Feminino",
    nascimento: "2004-06-28",
    cursoCodigo: "GESTAO",
    anoCurricular: 1,
    periodo: "MATUTINO",
    anoIngresso: 2026,
    mesesEmDivida: 5,
    multa: true,
    perfil: "DEVEDORA CRÓNICA — cinco meses em dívida e uma multa. É ela que povoa a Lista de Devedores e o bloqueio financeiro.",
  },
  {
    numero: "ISPC2026-0016",
    nome: "Cátia Baptista",
    genero: "Feminino",
    nascimento: "2003-11-15",
    cursoCodigo: "GESTAO",
    anoCurricular: 2,
    periodo: "NOTURNO",
    anoIngresso: 2025,
    categoria: "COMPARTICIPADA",
    mesesEmDivida: 1,
    perfil: "categoria COMPARTICIPADA — a terceira das três categorias de preço, para a tabela de Preços fazer sentido.",
  },
];

// ---------------------------------------------------------------------------------------------
// Notas guiadas
// ---------------------------------------------------------------------------------------------

export type Epoca = "P1" | "P2" | "EXAME" | "RECURSO" | "EXAME_ESPECIAL";

export interface NotaGuiadaDef {
  alunoNumero: string;
  disciplinaCodigo: string;
  notas: Partial<Record<Epoca, number>>;
  /** Só para a repetição: a que tentativa da inscrição esta nota pertence. Defeito 1. */
  tentativa?: number;
}

/**
 * As notas que contam a história do motor de avaliação em Programação I — os quatro desfechos
 * possíveis, lado a lado na mesma pauta, para o capítulo do Professor poder explicar a cascata
 * com uma única captura de ecrã.
 *
 * Tudo o que não está aqui fica sem nota de propósito: uma pauta onde toda a gente já tem tudo
 * lançado não mostra o botão de lançar, que é precisamente o que o manual precisa de fotografar.
 */
export const NOTAS_GUIADAS: NotaGuiadaDef[] = [
  // Dispensada: média (16+15)/2 = 15,5 ≥ 14.
  { alunoNumero: "ISPC2026-0001", disciplinaCodigo: "ENG-101", notas: { P1: 16, P2: 15 } },
  // Admitido a exame e aprovado: (8+8+15)/3 = 10,33.
  { alunoNumero: "ISPC2026-0002", disciplinaCodigo: "ENG-101", notas: { P1: 8, P2: 8, EXAME: 15 } },
  // Reprovada no exame, aprovada no recurso — o recurso conta isolado, não faz média.
  { alunoNumero: "ISPC2026-0003", disciplinaCodigo: "ENG-101", notas: { P1: 5, P2: 5, EXAME: 5, RECURSO: 14 } },
  // Reprovada em tudo, incluindo exame especial — o estado que a retém na rematrícula.
  { alunoNumero: "ISPC2026-0004", disciplinaCodigo: "ENG-101", notas: { P1: 3, P2: 3, EXAME: 3, RECURSO: 4, EXAME_ESPECIAL: 5 } },
  // Ana Paula: só P1 lançada — deixa a coluna P2 por preencher na pauta, que é o que o professor vê.
  { alunoNumero: "ISPC2026-0006", disciplinaCodigo: "ENG-101", notas: { P1: 12 } },

  // Matemática Discreta — uma segunda pauta, mais simples, para o horário/pauta não ser só uma.
  { alunoNumero: "ISPC2026-0001", disciplinaCodigo: "ENG-102", notas: { P1: 14, P2: 13 } },
  { alunoNumero: "ISPC2026-0002", disciplinaCodigo: "ENG-102", notas: { P1: 11, P2: 12 } },
  { alunoNumero: "ISPC2026-0006", disciplinaCodigo: "ENG-102", notas: { P1: 10, P2: 11 } },

  // Programação II, 2º ano.
  { alunoNumero: "ISPC2026-0007", disciplinaCodigo: "ENG-201", notas: { P1: 13, P2: 14 } },
  { alunoNumero: "ISPC2026-0008", disciplinaCodigo: "ENG-201", notas: { P1: 9, P2: 10 } },
  // Domingos a repetir (tentativa 2) — a 1ª tentativa levou 6 e 7, a repetição vai em 12.
  { alunoNumero: "ISPC2026-0009", disciplinaCodigo: "ENG-201", notas: { P1: 6, P2: 7, EXAME: 8, RECURSO: 7 }, tentativa: 1 },
  { alunoNumero: "ISPC2026-0009", disciplinaCodigo: "ENG-201", notas: { P1: 12 }, tentativa: 2 },

  // Engenharia de Software, 3º ano.
  { alunoNumero: "ISPC2026-0009", disciplinaCodigo: "ENG-301", notas: { P1: 12, P2: 13 } },
  { alunoNumero: "ISPC2026-0010", disciplinaCodigo: "ENG-301", notas: { P1: 15, P2: 16 } },

  // Gestão.
  { alunoNumero: "ISPC2026-0014", disciplinaCodigo: "GES-101", notas: { P1: 13, P2: 12 } },
  { alunoNumero: "ISPC2026-0015", disciplinaCodigo: "GES-101", notas: { P1: 9, P2: 8 } },
  { alunoNumero: "ISPC2026-0016", disciplinaCodigo: "GES-201", notas: { P1: 14, P2: 15 } },
];

// ---------------------------------------------------------------------------------------------
// Finalistas
// ---------------------------------------------------------------------------------------------

export interface FinalistaDef {
  alunoNumero: string;
  /** null = por atribuir, que é o estado que o ecrã do DAAC existe para resolver. */
  orientadorEmail: string | null;
  defesaData: Date | null;
  defesaSala: string | null;
  /** Nota da defesa. null = ainda por defender. */
  nota: number | null;
  /** O DAAC já confirmou o pagamento da monografia. */
  confirmada: boolean;
}

export const FINALISTAS: FinalistaDef[] = [
  {
    alunoNumero: "ISPC2026-0011",
    orientadorEmail: "manuel.nzaji@ispc.ao",
    defesaData: new Date("2026-08-14T09:00:00.000Z"),
    defesaSala: "Sala C1",
    nota: 16,
    confirmada: true,
  },
  {
    alunoNumero: "ISPC2026-0012",
    orientadorEmail: "jacinto.neto@ispc.ao",
    defesaData: new Date("2026-10-20T09:00:00.000Z"),
    defesaSala: "Sala C1",
    nota: null,
    confirmada: true,
  },
  {
    alunoNumero: "ISPC2026-0013",
    orientadorEmail: null,
    defesaData: null,
    defesaSala: null,
    nota: null,
    confirmada: false,
  },
];

// ---------------------------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------------------------

/** Preço mensal da propina por categoria × ano curricular (§cliente 2026-08-18: igual em todos os cursos). */
export const PRECOS: { categoria: Categoria; anoCurricular: number; valor: number }[] = (
  ["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"] as Categoria[]
).flatMap((categoria) =>
  [1, 2, 3, 4].map((anoCurricular) => ({
    categoria,
    anoCurricular,
    // Sobe por ano; bolseiro e comparticipada pagam menos que normal.
    valor:
      categoria === "NORMAL"
        ? 15000 + (anoCurricular - 1) * 1000
        : categoria === "COMPARTICIPADA"
          ? 9000 + (anoCurricular - 1) * 600
          : 4500 + (anoCurricular - 1) * 300,
  })),
);

export const EMOLUMENTOS = [
  { nome: "Declaração de Matrícula", descricao: "Comprova a matrícula no ano letivo corrente", valor: 3000 },
  { nome: "Certidão de Notas", descricao: "Histórico de notas até à data do pedido", valor: 5000 },
  { nome: "Cartão de Estudante (2ª via)", descricao: "Reemissão por perda ou dano", valor: 4000 },
  { nome: "Taxa de Monografia", descricao: "Inscrição na monografia e marcação da defesa", valor: 45000 },
];

export const CONFIG_FINANCEIRA = {
  bloqueioAtivo: true,
  toleranciaDias: 5,
  diaVencimento: 10,
  valorMulta: 5000,
};

// ---------------------------------------------------------------------------------------------
// Reclamações
// ---------------------------------------------------------------------------------------------

export type ReclamacaoCategoria = "SUGESTAO" | "RECLAMACAO" | "PROBLEMA_TECNICO" | "OUTRO";
export type ReclamacaoStatus = "PENDENTE" | "EM_ANALISE" | "RESOLVIDO";

export interface ReclamacaoDef {
  /** Quem enviou: número de estudante, email de professor, ou email de staff. */
  autor: { tipo: "aluno"; numero: string } | { tipo: "professor"; email: string } | { tipo: "staff"; email: string };
  categoria: ReclamacaoCategoria;
  assunto: string;
  mensagem: string;
  status: ReclamacaoStatus;
  resposta?: string;
  diasAtras: number;
}

/** Os três estados, para a caixa de entrada do DEV ter as três cores. */
export const RECLAMACOES: ReclamacaoDef[] = [
  {
    autor: { tipo: "aluno", numero: "ISPC2026-0002" },
    categoria: "PROBLEMA_TECNICO",
    assunto: "Não consigo ver a nota do exame",
    mensagem:
      "Bom dia. Fiz o exame de Programação I e o professor já disse na aula que lançou as notas, mas na minha página continua a aparecer que está por avaliar. Já tentei entrar pelo telemóvel e pelo computador.",
    status: "PENDENTE",
    diasAtras: 2,
  },
  {
    autor: { tipo: "professor", email: "rui.ferreira@ispc.ao" },
    categoria: "SUGESTAO",
    assunto: "Exportar a pauta para Excel",
    mensagem:
      "Seria muito útil poder descarregar a pauta em Excel além do PDF. Uso a folha de cálculo para preparar as médias antes de lançar no sistema.",
    status: "EM_ANALISE",
    diasAtras: 9,
  },
  {
    autor: { tipo: "staff", email: "secretaria@ispc.ao" },
    categoria: "RECLAMACAO",
    assunto: "Recibo sai sem o nome do encarregado",
    mensagem:
      "Quando imprimo o recibo de pagamento, sai só o nome do estudante. Os encarregados de educação pedem muitas vezes o recibo em nome deles.",
    status: "RESOLVIDO",
    resposta:
      "Corrigido na atualização de 5 de Setembro. O recibo passa a mostrar o nome do encarregado quando ele estiver preenchido na ficha do estudante.",
    diasAtras: 21,
  },
  {
    autor: { tipo: "aluno", numero: "ISPC2026-0010" },
    categoria: "OUTRO",
    assunto: "Pedido de segunda via do cartão",
    mensagem: "Perdi o cartão de estudante. Queria saber quanto custa a segunda via e onde faço o pedido.",
    status: "RESOLVIDO",
    resposta: "O pedido faz-se na Secretaria. O valor está no catálogo de emolumentos, em Minhas Finanças.",
    diasAtras: 30,
  },
];

// ---------------------------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------------------------

/**
 * O ficheiro em si vive no Vercel Blob e não é semeado — só a linha de metadados, que é o que a
 * listagem do DAAC mostra (nome, tamanho, data, quem carregou). O botão de descarregar não terá
 * ficheiro por trás; é o preço de não poder carregar ficheiros reais a partir de um script, e não
 * afeta nenhuma captura, porque a captura é da lista e não do download.
 */
export const DOCUMENTOS = [
  {
    alunoNumero: "ISPC2026-0010",
    nome: "Certificado de Habilitações.pdf",
    tamanhoBytes: 284_137,
    tipoMime: "application/pdf",
    diasAtras: 120,
  },
  {
    alunoNumero: "ISPC2026-0010",
    nome: "Bilhete de Identidade.pdf",
    tamanhoBytes: 96_402,
    tipoMime: "application/pdf",
    diasAtras: 120,
  },
  {
    alunoNumero: "ISPC2026-0011",
    nome: "Comprovativo de Pagamento da Monografia.pdf",
    tamanhoBytes: 142_880,
    tipoMime: "application/pdf",
    diasAtras: 45,
  },
];
