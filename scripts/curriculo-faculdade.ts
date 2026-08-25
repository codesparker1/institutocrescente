/**
 * Definição canónica do currículo "faculdade de verdade" (§pedido do cliente 2026-08-25):
 * cada ano curricular tem as SUAS disciplinas — nenhuma se repete entre anos — e cada
 * disciplina tem UM professor próprio. Importado pelo seed (scripts/seed-teste-5-anos.ts)
 * e pela simulação (scripts/simulacao/cenarios-5-alunos/curriculo-setup.ts) para que ambos
 * vejam exatamente a mesma estrutura — nunca duplicada nem dessincronizada.
 */

export interface DisciplinaDef {
  nome: string;
  codigo: string;
  cargaHoraria: number;
  semestre: 1 | 2;
  /** Professor dono da cadeira — criado pelo seed com este email. */
  professorNome: string;
  professorEmail: string;
  professorEspecialidade: string;
  sala: string;
}

export interface AnoDef {
  anoCurricular: number;
  disciplinas: DisciplinaDef[];
}

export const CURRICULO: AnoDef[] = [
  {
    anoCurricular: 1,
    disciplinas: [
      { nome: "Programação I", codigo: "ISPC-INF-101", cargaHoraria: 60, semestre: 1, professorNome: "Eng. António Sousa", professorEmail: "antonio.sousa@ispc.ao", professorEspecialidade: "Programação", sala: "Lab 1" },
      { nome: "Bases de Dados", codigo: "ISPC-INF-102", cargaHoraria: 45, semestre: 2, professorNome: "Eng. Rui Manuel Ferreira", professorEmail: "rui.ferreira@ispc.ao", professorEspecialidade: "Bases de Dados", sala: "Lab 2" },
    ],
  },
  {
    anoCurricular: 2,
    disciplinas: [
      { nome: "Sistemas Operativos", codigo: "ISPC-INF-201", cargaHoraria: 60, semestre: 1, professorNome: "Msc. Carlos Bengui", professorEmail: "carlos.bengui@ispc.ao", professorEspecialidade: "Sistemas Operativos", sala: "Lab 3" },
      { nome: "Redes de Computadores", codigo: "ISPC-INF-202", cargaHoraria: 45, semestre: 2, professorNome: "Msc. Helena Van-Dúnem", professorEmail: "helena.vandunem@ispc.ao", professorEspecialidade: "Redes de Computadores", sala: "Lab Redes" },
    ],
  },
  {
    anoCurricular: 3,
    disciplinas: [
      { nome: "Engenharia de Software", codigo: "ISPC-INF-301", cargaHoraria: 60, semestre: 1, professorNome: "Dr. Jacinto Paulo Neto", professorEmail: "jacinto.neto@ispc.ao", professorEspecialidade: "Engenharia de Software", sala: "Sala B1" },
      { nome: "Inteligência Artificial", codigo: "ISPC-INF-302", cargaHoraria: 45, semestre: 2, professorNome: "Dra. Domingas Kuzola", professorEmail: "domingas.kuzola@ispc.ao", professorEspecialidade: "Inteligência Artificial", sala: "Sala B2" },
    ],
  },
  {
    anoCurricular: 4,
    disciplinas: [
      { nome: "Projeto Final de Curso", codigo: "ISPC-INF-401", cargaHoraria: 90, semestre: 1, professorNome: "Prof. Manuel Nzaji", professorEmail: "manuel.nzaji@ispc.ao", professorEspecialidade: "Projeto e Gestão", sala: "Sala C1" },
      { nome: "Computação Gráfica", codigo: "ISPC-INF-402", cargaHoraria: 45, semestre: 2, professorNome: "Msc. Teresa Chivukuvuku", professorEmail: "teresa.chivukuvuku@ispc.ao", professorEspecialidade: "Computação Gráfica", sala: "Lab Multimédia" },
    ],
  },
];

/** Todas as disciplinas em lista plana (ordem por ano/semestre). */
export const TODAS_DISCIPLINAS: DisciplinaDef[] = CURRICULO.flatMap((a) => a.disciplinas);

/** Os 12 alunos do teste — perfis "faculdade de verdade" (§plano aprovado 2026-08-25). */
export interface AlunoDef {
  primeiro: string;
  ultimo: string;
  genero: "Feminino" | "Masculino";
  /** Categoria de estudante (PreçoPropina.categoria). Defeito NORMAL. */
  categoria?: "NORMAL" | "BOLSEIRO_INAGBE" | "COMPARTICIPADA";
  /** Ano curricular de entrada — só o transferido entra num ano > 1. */
  anoEntrada?: number;
  /** Nota descritiva do perfil (documentação viva do elenco). */
  perfil: string;
}

export const ALUNOS_FACULDADE: AlunoDef[] = [
  { primeiro: "Marta", ultimo: "Kiala", genero: "Feminino", perfil: "caminho feliz — paga sempre a tempo, rematrícula na janela" },
  { primeiro: "João", ultimo: "Manuel", genero: "Masculino", perfil: "paga tarde com multas mensais, sempre recuperadas" },
  { primeiro: "Beatriz", ultimo: "Sacatucua", genero: "Feminino", perfil: "trancamento no 1º ano → rematrícula tardia ADMIN → conclusão" },
  { primeiro: "Domingos", ultimo: "Cavaco", genero: "Masculino", perfil: "dívida atravessa o fim do ano → trancamento → rematrícula tardia; reprova uma cadeira do 2º ano e repete" },
  { primeiro: "Isabel", ultimo: "Neto", genero: "Feminino", perfil: "auto-zero P2 por prazo expirado → recupera no exame" },
  { primeiro: "Carlos", ultimo: "Muanza", genero: "Masculino", anoEntrada: 2, perfil: "transferido da Univ. Kimpa Vita — 2 cadeiras do 1º ano creditadas pela DAAC (creditarCadeiraAction)" },
  { primeiro: "Ana", ultimo: "Domingos", genero: "Feminino", categoria: "BOLSEIRO_INAGBE", perfil: "bolseira INAGBE — propina integral, categoria visível nos relatórios" },
  { primeiro: "Paulo", ultimo: "Chissola", genero: "Masculino", perfil: "desistente no 2º ano — marcarDesistenteAction com motivo; fica fora do sistema" },
  { primeiro: "Luísa", ultimo: "Fortunato", genero: "Feminino", perfil: "boa aluna com azar — reprova P2 → RECURSO → aprova" },
  { primeiro: "Eduardo", ultimo: "Muteka", genero: "Masculino", perfil: "vai a EXAME e depois EXAME_ESPECIAL para fechar uma cadeira" },
  { primeiro: "Sandra", ultimo: "Kambunda", genero: "Feminino", perfil: "dispensada de uma cadeira (média ≥14) + pede declaração de matrícula (emolumento)" },
  { primeiro: "Tomás", ultimo: "Kapata", genero: "Masculino", perfil: "entra NORMAL, muda a COMPARTICIPADA a meio (atualizarCategoriaEstudanteAction)" },
];

/** Professor de uma disciplina, resolvido pelo currículo — usado pelo setup da simulação. */
export function disciplinaPorNome(nome: string): DisciplinaDef | undefined {
  return TODAS_DISCIPLINAS.find((d) => d.nome === nome);
}
