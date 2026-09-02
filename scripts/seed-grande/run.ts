/**
 * Seed em larga escala para testar prontidão de deploy: reset completo da BD local
 * (institutocrescente_stress, nunca Neon — ver scripts/lib/guardarNeon.ts) seguido de 5 cursos,
 * ~100 professores, ~1000 alunos distribuídos por curso/ano/período, com matrículas, inscrições,
 * avaliações/notas, aulas/frequência e cobranças em volume realista.
 *
 * Ao contrário de prisma/seed.ts (cenários determinísticos à mão para demonstração ao cliente —
 * não mexer nele), este script não tenta reproduzir nenhum cenário específico: o objetivo é
 * volume e distribuição realistas, gerados o mais rápido possível via createMany em lote (IDs
 * gerados aqui, não pelo Prisma, para poder referenciar relações sem round-trips extra).
 *
 * Usage: npx tsx scripts/seed-grande/run.ts
 *   Configurável via env: SEED_GRANDE_ALUNOS (default 1000), SEED_GRANDE_PROFESSORES (default 100)
 */
import "dotenv/config";
import dotenv from "dotenv";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { garantirNaoENeon } from "../lib/guardarNeon";
import { gerarNomes, especialidadeAleatoria, telefoneAngola, randomInt, pick } from "./nomes";

dotenv.config({ path: ".env.local", override: true });
garantirNaoENeon();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "Ispc@2026";
const N_ALUNOS = Number(process.env.SEED_GRANDE_ALUNOS ?? 1000);
const N_PROFESSORES = Number(process.env.SEED_GRANDE_PROFESSORES ?? 100);
const ANO_LETIVO = 2026;
const PERIODOS = ["MATUTINO", "NOTURNO"] as const;
const TAMANHO_LOTE = 2000;

function id(): string {
  return crypto.randomUUID();
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Prisma createMany não devolve as linhas criadas — por isso os IDs são gerados aqui, e os
 * lotes existem só para não estourar o limite de parâmetros de uma query numa tabela grande. */
async function createManyEmLotes<T>(
  delegate: { createMany: (args: { data: T[] }) => Promise<Prisma.BatchPayload> },
  data: T[],
  tamanhoLote = TAMANHO_LOTE,
): Promise<void> {
  for (let i = 0; i < data.length; i += tamanhoLote) {
    await delegate.createMany({ data: data.slice(i, i + tamanhoLote) });
  }
}

const CURSOS_DEF = [
  { nome: "Engenharia Informática", codigo: "ENG-INF", duracaoAnos: 4 },
  { nome: "Gestão de Empresas", codigo: "GESTAO", duracaoAnos: 3 },
  { nome: "Direito", codigo: "DIREITO", duracaoAnos: 5 },
  { nome: "Enfermagem", codigo: "ENFERM", duracaoAnos: 4 },
  { nome: "Arquitetura", codigo: "ARQ", duracaoAnos: 5 },
];

// Preço por categoria × ano curricular, igual em todos os cursos (§pedido do cliente
// 2026-08-18) — sobe ligeiramente por ano, e bolseiro/comparticipada pagam menos que normal.
const PRECO_BASE_POR_ANO = [15000, 16000, 17000, 18000, 19000];
const MULTIPLICADOR_CATEGORIA: Record<string, number> = { NORMAL: 1, BOLSEIRO_INAGBE: 0.3, COMPARTICIPADA: 0.6 };

const TEMAS_DISCIPLINA = [
  "Introdução a", "Fundamentos de", "Metodologia de", "Prática de",
  "Tópicos Avançados de", "Seminário de", "Laboratório de", "Projeto de",
];

async function resetCompleto(): Promise<void> {
  console.log("A limpar dados existentes (reset completo)...");
  await prisma.$transaction(
    [
      prisma.reclamacao.deleteMany(),
      prisma.cobranca.deleteMany(),
      prisma.emolumento.deleteMany(),
      prisma.configuracaoFinanceira.deleteMany(),
      prisma.configuracaoAcademica.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.frequencia.deleteMany(),
      prisma.aula.deleteMany(),
      prisma.nota.deleteMany(),
      prisma.avaliacao.deleteMany(),
      prisma.inscricaoCadeira.deleteMany(),
      prisma.horarioSlot.deleteMany(),
      prisma.matricula.deleteMany(),
      prisma.turmaDisciplina.deleteMany(),
      prisma.cadeiraCurricular.deleteMany(),
      prisma.turma.deleteMany(),
      prisma.disciplina.deleteMany(),
      prisma.curso.deleteMany(),
      prisma.user.deleteMany(),
      prisma.aluno.deleteMany(),
      prisma.professor.deleteMany(),
    ],
    { maxWait: 30000, timeout: 90000 },
  );
}

async function main(): Promise<void> {
  const inicio = Date.now();
  await resetCompleto();

  console.log("A criar cursos...");
  const cursos = CURSOS_DEF.map((c) => ({ id: id(), ...c }));
  await prisma.curso.createMany({ data: cursos });

  console.log("A criar disciplinas e plano curricular...");
  const disciplinas: { id: string; nome: string; codigo: string; cargaHoraria: number; cursoId: string }[] = [];
  const cadeiras: { id: string; cursoId: string; disciplinaId: string; anoCurricular: number; semestre: number }[] = [];
  let discSeq = 0;
  for (const curso of cursos) {
    for (let ano = 1; ano <= curso.duracaoAnos; ano += 1) {
      for (let semestre = 1; semestre <= 2; semestre += 1) {
        discSeq += 1;
        const disciplinaId = id();
        disciplinas.push({
          id: disciplinaId,
          nome: `${pick(TEMAS_DISCIPLINA)} ${curso.nome} ${ano}.${semestre}`,
          codigo: `${curso.codigo}-${ano}${semestre}${String(discSeq).padStart(3, "0")}`,
          cargaHoraria: pick([45, 60]),
          cursoId: curso.id,
        });
        cadeiras.push({ id: id(), cursoId: curso.id, disciplinaId, anoCurricular: ano, semestre });
      }
    }
  }
  await createManyEmLotes(prisma.disciplina, disciplinas);
  await createManyEmLotes(
    prisma.cadeiraCurricular,
    cadeiras.map((c) => ({ ...c, permiteDispensa: true, notaMinimaDispensa: 14 })),
  );

  console.log(`A criar ${N_PROFESSORES} professores...`);
  const nomesProfessores = gerarNomes(N_PROFESSORES);
  const professores = nomesProfessores.map((n, i) => ({
    id: id(),
    nome: `${pick(["Eng.", "Dr.", "Dra.", "Prof.", "Mestre"])} ${n.nomeCompleto}`,
    email: `${n.chaveUnica}${i}@ispc.ao`,
    telefone: telefoneAngola(),
    especialidade: especialidadeAleatoria(),
  }));
  await createManyEmLotes(prisma.professor, professores);

  console.log("A criar turmas...");
  const turmas: { id: string; cursoId: string; anoCurricular: number; periodo: (typeof PERIODOS)[number]; anoLetivo: number }[] = [];
  for (const curso of cursos) {
    for (let ano = 1; ano <= curso.duracaoAnos; ano += 1) {
      for (const periodo of PERIODOS) {
        turmas.push({ id: id(), cursoId: curso.id, anoCurricular: ano, periodo, anoLetivo: ANO_LETIVO });
      }
    }
  }
  await createManyEmLotes(prisma.turma, turmas);

  console.log("A atribuir disciplinas e professores às turmas...");
  const turmaDisciplinas: {
    id: string;
    turmaId: string;
    disciplinaId: string;
    cadeiraCurricularId: string;
    professorId: string;
    semestre: number;
    sala: string;
  }[] = [];

  // Reserva DELIBERADA, não acidente de aritmética: um round-robin sequencial (profIndex sem
  // dar wrap) deixava sempre os últimos ~16 professores sem nenhuma disciplina, sem ninguém ter
  // decidido isso — e corrigir isso "distribuindo melhor" apagaria a única cobertura que a
  // simulação tinha do estado real "professor sem atribuição este semestre" (entre projetos,
  // contratado mas sem horário fechado, licença — acontece sempre nalgum semestre real). Em vez
  // disso: calcula quantos slots de turma-disciplina existem, reserva exatamente os professores
  // a mais como este fixture documentado, e garante que TODOS os restantes ficam cobertos (não
  // só os primeiros 84 por acidente de array).
  const totalSlots = turmas.reduce(
    (soma, turma) => soma + cadeiras.filter((c) => c.cursoId === turma.cursoId && c.anoCurricular === turma.anoCurricular).length,
    0,
  );
  const nSemAtribuicao = Math.max(0, professores.length - totalSlots);
  const professoresAtivos = nSemAtribuicao > 0 ? professores.slice(0, professores.length - nSemAtribuicao) : professores;
  console.log(
    `  ${nSemAtribuicao} professor(es) deliberadamente sem disciplina atribuída este semestre (fixture do estado real "sem atribuição", não acidente).`,
  );

  let profIndex = 0;
  for (const turma of turmas) {
    const cadeirasDoAno = cadeiras.filter((c) => c.cursoId === turma.cursoId && c.anoCurricular === turma.anoCurricular);
    for (const cadeira of cadeirasDoAno) {
      const professor = professoresAtivos[profIndex % professoresAtivos.length];
      profIndex += 1;
      turmaDisciplinas.push({
        id: id(),
        turmaId: turma.id,
        disciplinaId: cadeira.disciplinaId,
        cadeiraCurricularId: cadeira.id,
        professorId: professor.id,
        semestre: cadeira.semestre,
        sala: `Sala ${randomInt(1, 20)}`,
      });
    }
  }
  await createManyEmLotes(prisma.turmaDisciplina, turmaDisciplinas);

  console.log("A criar horários semanais...");
  const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"] as const;
  const horarioSlots = turmaDisciplinas.map((td) => ({
    id: id(),
    turmaDisciplinaId: td.id,
    diaSemana: pick(DIAS),
    horaInicio: pick(["08:00", "10:00", "14:00", "18:00"]),
    horaFim: pick(["10:00", "12:00", "16:00", "20:00"]),
    sala: td.sala,
  }));
  await createManyEmLotes(prisma.horarioSlot, horarioSlots);

  console.log(`A criar ${N_ALUNOS} alunos...`);
  const nomesAlunos = gerarNomes(N_ALUNOS);
  const alunos = nomesAlunos.map((n, i) => {
    const curso = cursos[i % cursos.length];
    return {
      id: id(),
      numeroEstudante: `SIM2026-${String(i + 1).padStart(4, "0")}`,
      nome: n.nomeCompleto,
      email: `${n.chaveUnica}${i}@aluno.ispc.ao`,
      telefone: telefoneAngola(),
      dataNascimento: new Date(randomInt(1999, 2007), randomInt(0, 11), randomInt(1, 28)),
      genero: pick(["Feminino", "Masculino"]),
      curso: curso.nome,
      cursoId: curso.id,
      anoIngresso: pick([2023, 2024, 2025, 2026]),
      anoCurricular: randomInt(1, curso.duracaoAnos),
      status: "ATIVO" as const,
      periodo: pick(PERIODOS),
      // Distribuição realista: maioria normal, uma fração de bolseiros/comparticipados —
      // exercita a nova grelha de preços por categoria (§pedido do cliente 2026-08-18).
      categoria: pick(["NORMAL", "NORMAL", "NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"] as const),
    };
  });
  await createManyEmLotes(
    prisma.aluno,
    alunos.map(({ cursoId: _cursoId, periodo: _periodo, ...a }) => a),
  );

  console.log("A matricular alunos...");
  const turmaPorCursoAnoPeriodo = new Map(turmas.map((t) => [`${t.cursoId}:${t.anoCurricular}:${t.periodo}`, t.id]));
  const matriculas = alunos
    .map((aluno) => ({
      id: id(),
      alunoId: aluno.id,
      turmaId: turmaPorCursoAnoPeriodo.get(`${aluno.cursoId}:${aluno.anoCurricular}:${aluno.periodo}`),
      status: "ATIVA" as const,
    }))
    .filter((m): m is { id: string; alunoId: string; turmaId: string; status: "ATIVA" } => Boolean(m.turmaId));
  await createManyEmLotes(prisma.matricula, matriculas);

  console.log("A inscrever alunos nas cadeiras da turma...");
  const turmaDisciplinasPorTurma = new Map<string, typeof turmaDisciplinas>();
  for (const td of turmaDisciplinas) {
    const lista = turmaDisciplinasPorTurma.get(td.turmaId) ?? [];
    lista.push(td);
    turmaDisciplinasPorTurma.set(td.turmaId, lista);
  }
  const inscricoes: {
    id: string;
    alunoId: string;
    cadeiraCurricularId: string;
    turmaDisciplinaId: string;
    tentativa: number;
    ativa: boolean;
    permiteDispensaAplicada: boolean;
    notaMinimaDispensaAplicada: number;
  }[] = [];
  for (const matricula of matriculas) {
    for (const td of turmaDisciplinasPorTurma.get(matricula.turmaId) ?? []) {
      inscricoes.push({
        id: id(),
        alunoId: matricula.alunoId,
        cadeiraCurricularId: td.cadeiraCurricularId,
        turmaDisciplinaId: td.id,
        tentativa: 1,
        ativa: true,
        permiteDispensaAplicada: true,
        notaMinimaDispensaAplicada: 14,
      });
    }
  }
  await createManyEmLotes(prisma.inscricaoCadeira, inscricoes);

  console.log("A criar avaliações...");
  const avaliacoes = turmaDisciplinas.flatMap((td) =>
    (
      [
        { epoca: "P1" as const, data: daysAgo(45) },
        { epoca: "P2" as const, data: daysAgo(20) },
        { epoca: "EXAME" as const, data: daysAgo(-10) },
      ]
    ).map((a) => ({ id: id(), turmaDisciplinaId: td.id, sala: td.sala, ...a })),
  );
  await createManyEmLotes(prisma.avaliacao, avaliacoes);

  console.log("A lançar notas...");
  const avaliacoesPorTurmaDisciplina = new Map<string, typeof avaliacoes>();
  for (const av of avaliacoes) {
    const lista = avaliacoesPorTurmaDisciplina.get(av.turmaDisciplinaId) ?? [];
    lista.push(av);
    avaliacoesPorTurmaDisciplina.set(av.turmaDisciplinaId, lista);
  }
  const notas: { id: string; avaliacaoId: string; inscricaoCadeiraId: string; valor: number }[] = [];
  for (const inscricao of inscricoes) {
    for (const av of avaliacoesPorTurmaDisciplina.get(inscricao.turmaDisciplinaId) ?? []) {
      if (Math.random() < 0.8) {
        notas.push({ id: id(), avaliacaoId: av.id, inscricaoCadeiraId: inscricao.id, valor: randomInt(8, 19) });
      }
    }
  }
  await createManyEmLotes(prisma.nota, notas);

  console.log("A criar aulas e frequência...");
  const aulas = turmaDisciplinas.flatMap((td) =>
    [1, 2, 3, 4].map((semana) => ({ id: id(), turmaDisciplinaId: td.id, data: daysAgo(semana * 7) })),
  );
  await createManyEmLotes(prisma.aula, aulas);

  const aulasPorTurmaDisciplina = new Map<string, typeof aulas>();
  for (const aula of aulas) {
    const lista = aulasPorTurmaDisciplina.get(aula.turmaDisciplinaId) ?? [];
    lista.push(aula);
    aulasPorTurmaDisciplina.set(aula.turmaDisciplinaId, lista);
  }
  const frequencias: { id: string; aulaId: string; inscricaoCadeiraId: string; presente: boolean }[] = [];
  for (const inscricao of inscricoes) {
    for (const aula of aulasPorTurmaDisciplina.get(inscricao.turmaDisciplinaId) ?? []) {
      frequencias.push({ id: id(), aulaId: aula.id, inscricaoCadeiraId: inscricao.id, presente: Math.random() < 0.9 });
    }
  }
  await createManyEmLotes(prisma.frequencia, frequencias);

  console.log("A definir preços de propina por categoria × ano curricular...");
  const CATEGORIAS_PRECO = ["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"] as const;
  const maxAnoCurricular = Math.max(...CURSOS_DEF.map((c) => c.duracaoAnos));
  const precosPropina = Array.from({ length: maxAnoCurricular }, (_, i) => i + 1).flatMap((ano) =>
    CATEGORIAS_PRECO.map((categoria) => ({
      id: id(),
      categoria,
      anoCurricular: ano,
      valor: Math.round(PRECO_BASE_POR_ANO[Math.min(ano, PRECO_BASE_POR_ANO.length) - 1] * MULTIPLICADOR_CATEGORIA[categoria]),
    })),
  );
  await createManyEmLotes(prisma.precoPropina, precosPropina);
  const precoPorChave = new Map(precosPropina.map((p) => [`${p.categoria}:${p.anoCurricular}`, p.valor]));

  console.log("A gerar cobranças financeiras...");
  const matriculaPorAluno = new Map(matriculas.map((m) => [m.alunoId, m]));
  const cobrancas: {
    id: string;
    matriculaId: string;
    alunoId: string;
    tipo: "PROPINA";
    mesReferencia: Date;
    valorDevido: number;
    valorPago: number;
    status: "PAGO" | "PENDENTE";
    dataVencimento: Date;
    dataPagamento: Date | null;
  }[] = [];
  for (const aluno of alunos) {
    const matricula = matriculaPorAluno.get(aluno.id);
    if (!matricula) continue;
    const valorPropina = precoPorChave.get(`${aluno.categoria}:${aluno.anoCurricular}`);
    if (valorPropina === undefined) continue; // sem preço configurado para esta combinação — nada a gerar
    const mesesPendentes = Math.random() < 0.5 ? 0 : randomInt(1, 6);
    for (let i = 5; i >= 0; i -= 1) {
      const base = daysAgo(30 * i);
      const estaPendente = i < mesesPendentes;
      cobrancas.push({
        id: id(),
        matriculaId: matricula.id,
        alunoId: aluno.id,
        tipo: "PROPINA",
        mesReferencia: new Date(base.getFullYear(), base.getMonth(), 1),
        valorDevido: valorPropina,
        valorPago: estaPendente ? 0 : valorPropina,
        status: estaPendente ? "PENDENTE" : "PAGO",
        dataVencimento: new Date(base.getFullYear(), base.getMonth(), 8),
        dataPagamento: estaPendente ? null : base,
      });
    }
  }
  await createManyEmLotes(prisma.cobranca, cobrancas);

  await prisma.emolumento.createMany({
    data: [
      { id: id(), nome: "Declaração de matrícula", descricao: "Comprova a matrícula no ano letivo corrente", valor: 3000 },
      { id: id(), nome: "Certidão de notas", descricao: "Histórico de notas até à data do pedido", valor: 5000 },
      { id: id(), nome: "Cartão de estudante (2ª via)", descricao: "Reemissão por perda ou dano", valor: 4000 },
    ],
  });

  console.log("A criar utilizadores...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const primeiroAluno = alunos[0];
  const primeiroProfessor = professores[0];

  const staffUsers = [
    { id: id(), name: "Administrador Simulação", email: "admin@ispc.ao", passwordHash, role: "ADMIN" as const },
    { id: id(), name: "Secretaria Simulação", email: "secretaria@ispc.ao", passwordHash, role: "SECRETARIA" as const },
    { id: id(), name: "DAAC Simulação", email: "daac@ispc.ao", passwordHash, role: "DAAC" as const },
    {
      id: id(),
      name: primeiroProfessor.nome,
      email: "professor@ispc.ao",
      passwordHash,
      role: "PROFESSOR" as const,
      professorId: primeiroProfessor.id,
    },
    {
      id: id(),
      name: primeiroAluno.nome,
      email: "aluno@ispc.ao",
      passwordHash,
      role: "ALUNO" as const,
      alunoId: primeiroAluno.id,
    },
  ];
  await prisma.user.createMany({ data: staffUsers });

  const daacUser = staffUsers.find((u) => u.role === "DAAC")!;

  // Aproveitamento de cadeiras de outra instituição + documentos anexados (§pergunta do cliente
  // 2026-08-18) — mesmo espírito do fixture de professores sem atribuição acima: uma fração
  // pequena e DELIBERADA de "alunos transferidos", não um acidente de distribuição. Só alunos com
  // anoCurricular > 1 são elegíveis (senão não há nenhum ano anterior para creditar); a cadeira
  // creditada é sempre de um ano abaixo do ano atual do aluno, garantidamente ainda não coberta
  // pelas inscrições normais (essas só cobrem as cadeiras da turma do ano corrente). Mesma técnica
  // de creditarCadeiraAction (src/actions/notas.ts): grava a mesma nota em P1/P2/Exame para a
  // cascata de calcularNotaFinal resolver sozinha, sem precisar de um estado novo.
  const candidatosTransferencia = alunos.filter((a) => a.anoCurricular > 1);
  const nTransferidos = Math.min(candidatosTransferencia.length, Math.max(5, Math.round(alunos.length * 0.02)));
  const alunosTransferidos = candidatosTransferencia.slice(0, nTransferidos);
  console.log(`  ${nTransferidos} aluno(s) deliberadamente marcados como "transferidos" (fixture de aproveitamento/documentos, não acidente).`);

  const turmaDisciplinaPorCadeira = new Map(turmaDisciplinas.map((td) => [td.cadeiraCurricularId, td]));
  const INSTITUICOES_ORIGEM = ["Universidade Metodista de Angola", "Universidade Óscar Ribas", "Instituto Superior Técnico de Angola"];

  const inscricoesCreditadas: {
    id: string;
    alunoId: string;
    cadeiraCurricularId: string;
    turmaDisciplinaId: string;
    tentativa: number;
    ativa: boolean;
    permiteDispensaAplicada: boolean;
    notaMinimaDispensaAplicada: number;
    creditada: boolean;
    instituicaoOrigemCreditado: string;
  }[] = [];
  const notasCreditadas: typeof notas = [];
  const documentosAluno: { id: string; alunoId: string; nome: string; blobUrl: string; blobPathname: string; tamanhoBytes: number; tipoMime: string; carregadoPorId: string }[] = [];

  for (const aluno of alunosTransferidos) {
    const cadeiraAnterior = pick(cadeiras.filter((c) => c.cursoId === aluno.cursoId && c.anoCurricular < aluno.anoCurricular));
    const turmaDisciplina = turmaDisciplinaPorCadeira.get(cadeiraAnterior.id);
    if (!turmaDisciplina) continue;

    const inscricaoId = id();
    inscricoesCreditadas.push({
      id: inscricaoId,
      alunoId: aluno.id,
      cadeiraCurricularId: cadeiraAnterior.id,
      turmaDisciplinaId: turmaDisciplina.id,
      tentativa: 1,
      ativa: false,
      permiteDispensaAplicada: true,
      notaMinimaDispensaAplicada: 14,
      creditada: true,
      instituicaoOrigemCreditado: pick(INSTITUICOES_ORIGEM),
    });

    const notaCreditada = randomInt(14, 19);
    for (const av of avaliacoesPorTurmaDisciplina.get(turmaDisciplina.id) ?? []) {
      notasCreditadas.push({ id: id(), avaliacaoId: av.id, inscricaoCadeiraId: inscricaoId, valor: notaCreditada });
    }

    // blobUrl/blobPathname fictícios — este seed nunca chama o Vercel Blob (nem precisa de
    // BLOB_READ_WRITE_TOKEN). Servem só para exercitar a listagem/contagem de documentos em
    // escala; não abrir estes links a partir de um ambiente semeado, não há ficheiro real por trás.
    documentosAluno.push({
      id: id(),
      alunoId: aluno.id,
      nome: "Certificado de transferência",
      blobUrl: `https://seed-fixture.local/documentos/${aluno.id}.pdf`,
      blobPathname: `alunos/${aluno.id}/seed-certificado.pdf`,
      tamanhoBytes: randomInt(80_000, 900_000),
      tipoMime: "application/pdf",
      carregadoPorId: daacUser.id,
    });
  }
  await createManyEmLotes(prisma.inscricaoCadeira, inscricoesCreditadas);
  await createManyEmLotes(prisma.nota, notasCreditadas);
  await createManyEmLotes(prisma.documentoAluno, documentosAluno);

  const professorUsers = professores.filter((p) => p.id !== primeiroProfessor.id).map((p) => ({
    id: id(),
    name: p.nome,
    email: p.email,
    passwordHash,
    role: "PROFESSOR" as const,
    professorId: p.id,
  }));
  await createManyEmLotes(prisma.user, professorUsers);

  const alunoUsers = alunos.filter((a) => a.id !== primeiroAluno.id).map((a) => ({
    id: id(),
    name: a.nome,
    email: a.email,
    passwordHash,
    role: "ALUNO" as const,
    alunoId: a.id,
  }));
  await createManyEmLotes(prisma.user, alunoUsers);

  console.log("A criar configuração académica e financeira...");
  await prisma.configuracaoAcademica.create({
    data: {
      id: "config",
      limiteReprovacoes: 2,
      regraRetencao: "SO_REPROVADAS",
      matriculaInicio: daysAgo(15),
      matriculaFim: daysAgo(-45),
      anoLetivoInicio: new Date(ANO_LETIVO, 8, 1),
      anoLetivoFim: new Date(ANO_LETIVO + 1, 6, 15),
    },
  });
  await prisma.configuracaoFinanceira.create({
    data: { id: "config", bloqueioAtivo: true, toleranciaDias: 5, diaVencimento: 10, valorMulta: 5000 },
  });

  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\nSeed grande concluída em ${duracao}s.`);
  console.log(`  Cursos: ${cursos.length}`);
  console.log(`  Disciplinas: ${disciplinas.length} | Cadeiras curriculares: ${cadeiras.length}`);
  console.log(`  Turmas: ${turmas.length} | Turma-disciplinas: ${turmaDisciplinas.length}`);
  console.log(`  Professores: ${professores.length}`);
  console.log(`  Alunos: ${alunos.length} | Matrículas: ${matriculas.length} | Inscrições: ${inscricoes.length}`);
  console.log(`  Avaliações: ${avaliacoes.length} | Notas: ${notas.length}`);
  console.log(`  Aulas: ${aulas.length} | Frequências: ${frequencias.length}`);
  console.log(`  Cobranças: ${cobrancas.length}`);
  console.log(`  Alunos transferidos (aproveitamento): ${inscricoesCreditadas.length} | Documentos: ${documentosAluno.length}`);
  console.log(`  Utilizadores: ${staffUsers.length + professorUsers.length + alunoUsers.length}`);
  console.log(`\nTodas as contas usam a senha: ${DEMO_PASSWORD}`);
  console.log("Atalhos: admin@ispc.ao · secretaria@ispc.ao · daac@ispc.ao · professor@ispc.ao · aluno@ispc.ao");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
