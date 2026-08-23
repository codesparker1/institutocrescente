import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Elenco mínimo e persistente para o teste de 5 anos com relógio simulado (Admin > Relógio
 * Simulado, só ativo com SIMULATION_MODE=true e operado pelo papel DEV — ver
 * src/lib/permissions.ts, podeGerirRelogioSimulado): 1 dev, 1 admin, 1 secretaria, 1 DAAC,
 * 2 professores, 5 alunos. Ao contrário de prisma/seed.ts (elenco grande de demonstração com
 * cenários pré-fabricados), aqui não se semeiam notas/aulas/cobranças — a ideia é ver o próprio
 * sistema gerá-las sozinho (garantirCobrancasGeradas, garantirNotasAutomaticasPorFalta,
 * garantirSuspensaoAutomatica) à medida que o relógio avança, ano após ano.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SENHA_TESTE = "Ispc@2026";

const ANO_LETIVO_INICIAL = new Date().getFullYear();

const ALUNOS = [
  { primeiro: "Marta", ultimo: "Kiala" },
  { primeiro: "João", ultimo: "Manuel" },
  { primeiro: "Beatriz", ultimo: "Sacatucua" },
  { primeiro: "Domingos", ultimo: "Cavaco" },
  { primeiro: "Isabel", ultimo: "Neto" },
];

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function telefoneAngola(seed: number): string {
  const numero = `9${String(10000000 + seed).padStart(8, "0")}`;
  return `+244 ${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6, 9)}`;
}

async function main() {
  console.log("A limpar dados existentes...");
  await prisma.$transaction([
    prisma.cobranca.deleteMany(),
    prisma.emolumento.deleteMany(),
    prisma.configuracaoFinanceira.deleteMany(),
    prisma.precoPropina.deleteMany(),
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
    prisma.reclamacao.deleteMany(),
    prisma.documentoAluno.deleteMany(),
    prisma.user.deleteMany(),
    prisma.aluno.deleteMany(),
    prisma.professor.deleteMany(),
    prisma.relogioSimulado.deleteMany(),
  ], { maxWait: 20000, timeout: 30000 });

  console.log("A criar curso, disciplinas e preços de propina...");
  const curso = await prisma.curso.create({
    data: { nome: "Engenharia Informática", codigo: "ENG-INF", duracaoAnos: 4 },
  });

  await prisma.precoPropina.createMany({
    data: (["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"] as const).flatMap((categoria) =>
      [1, 2, 3, 4].map((anoCurricular) => ({
        categoria,
        anoCurricular,
        valor: categoria === "NORMAL" ? 17000 : categoria === "COMPARTICIPADA" ? 10000 : 5000,
      })),
    ),
  });

  const progI = await prisma.disciplina.create({
    data: { nome: "Programação I", codigo: "ENG-101", cargaHoraria: 60, cursoId: curso.id },
  });
  const basesDados = await prisma.disciplina.create({
    data: { nome: "Bases de Dados", codigo: "ENG-201", cargaHoraria: 45, cursoId: curso.id },
  });

  console.log("A criar os 2 professores...");
  const professor1 = await prisma.professor.create({
    data: { nome: "Eng. António Sousa", email: "antonio.sousa@ispc.ao", telefone: telefoneAngola(1), especialidade: "Engenharia de Software" },
  });
  const professor2 = await prisma.professor.create({
    data: { nome: "Eng. Rui Manuel Ferreira", email: "rui.ferreira@ispc.ao", telefone: telefoneAngola(2), especialidade: "Bases de Dados" },
  });

  console.log(`A criar a turma do 1º ano (ano letivo ${ANO_LETIVO_INICIAL})...`);
  const turma = await prisma.turma.create({
    data: { cursoId: curso.id, anoCurricular: 1, periodo: "MATUTINO", anoLetivo: ANO_LETIVO_INICIAL },
  });

  const cadeiraProgI = await prisma.cadeiraCurricular.create({
    data: { cursoId: curso.id, disciplinaId: progI.id, anoCurricular: 1, semestre: 1 },
  });
  const cadeiraBasesDados = await prisma.cadeiraCurricular.create({
    data: { cursoId: curso.id, disciplinaId: basesDados.id, anoCurricular: 1, semestre: 2 },
  });

  const tdProgI = await prisma.turmaDisciplina.create({
    data: { turmaId: turma.id, disciplinaId: progI.id, cadeiraCurricularId: cadeiraProgI.id, professorId: professor1.id, semestre: 1, sala: "Lab 1" },
  });
  const tdBasesDados = await prisma.turmaDisciplina.create({
    data: { turmaId: turma.id, disciplinaId: basesDados.id, cadeiraCurricularId: cadeiraBasesDados.id, professorId: professor2.id, semestre: 2, sala: "Lab 2" },
  });

  await prisma.horarioSlot.createMany({
    data: [
      { turmaDisciplinaId: tdProgI.id, diaSemana: "SEGUNDA", horaInicio: "08:00", horaFim: "10:00", sala: "Lab 1" },
      { turmaDisciplinaId: tdProgI.id, diaSemana: "QUARTA", horaInicio: "08:00", horaFim: "10:00", sala: "Lab 1" },
      { turmaDisciplinaId: tdBasesDados.id, diaSemana: "TERCA", horaInicio: "10:00", horaFim: "12:00", sala: "Lab 2" },
      { turmaDisciplinaId: tdBasesDados.id, diaSemana: "QUINTA", horaInicio: "10:00", horaFim: "12:00", sala: "Lab 2" },
    ],
  });

  console.log("A criar os 5 alunos e a matriculá-los na turma...");
  const alunos = [];
  for (const [index, { primeiro, ultimo }] of ALUNOS.entries()) {
    const numero = String(index + 1).padStart(4, "0");
    const aluno = await prisma.aluno.create({
      data: {
        numeroEstudante: `ISPC${ANO_LETIVO_INICIAL}-${numero}`,
        nome: `${primeiro} ${ultimo}`,
        email: `${slug(primeiro)}.${slug(ultimo)}@aluno.ispc.ao`,
        telefone: telefoneAngola(10 + index),
        dataNascimento: new Date(2005, index, 10 + index),
        genero: index % 2 === 0 ? "Feminino" : "Masculino",
        curso: curso.nome,
        anoIngresso: ANO_LETIVO_INICIAL,
        anoCurricular: 1,
        status: "ATIVO",
      },
    });
    alunos.push(aluno);

    await prisma.matricula.create({
      data: { alunoId: aluno.id, turmaId: turma.id, status: "ATIVA" },
    });

    await prisma.inscricaoCadeira.createMany({
      data: [
        { alunoId: aluno.id, cadeiraCurricularId: cadeiraProgI.id, turmaDisciplinaId: tdProgI.id, tentativa: 1, ativa: true, permiteDispensaAplicada: true, notaMinimaDispensaAplicada: 14 },
        { alunoId: aluno.id, cadeiraCurricularId: cadeiraBasesDados.id, turmaDisciplinaId: tdBasesDados.id, tentativa: 1, ativa: true, permiteDispensaAplicada: true, notaMinimaDispensaAplicada: 14 },
      ],
    });
  }

  console.log("A configurar o ano letivo e a janela de matrícula...");
  const inicioAnoLetivo = new Date(ANO_LETIVO_INICIAL, 1, 1);
  const fimAnoLetivo = new Date(ANO_LETIVO_INICIAL, 11, 15);
  await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: {},
    create: {
      id: "config",
      limiteReprovacoes: 2,
      regraRetencao: "SO_REPROVADAS",
      anoLetivoInicio: inicioAnoLetivo,
      anoLetivoFim: fimAnoLetivo,
      matriculaInicio: new Date(ANO_LETIVO_INICIAL, 11, 1),
      matriculaFim: new Date(ANO_LETIVO_INICIAL + 1, 0, 31),
    },
  });

  await prisma.configuracaoFinanceira.create({
    data: { id: "config", bloqueioAtivo: true, toleranciaDias: 5, diaVencimento: 10, valorMulta: 5000 },
  });

  await prisma.emolumento.createMany({
    data: [
      { nome: "Declaração de matrícula", descricao: "Comprova a matrícula no ano letivo corrente", valor: 3000 },
      { nome: "Certidão de notas", descricao: "Histórico de notas até à data do pedido", valor: 5000 },
    ],
  });

  console.log("A criar as contas de login (dev, admin, secretaria, daac, 2 professores, 5 alunos)...");
  const passwordHash = await bcrypt.hash(SENHA_TESTE, 10);

  // DEV é quem opera o relógio simulado (Admin > Relógio Simulado, ver src/lib/permissions.ts,
  // podeGerirRelogioSimulado) — sem esta conta não há forma de avançar o tempo durante o teste.
  await prisma.user.create({ data: { name: "Responsável Técnico ISPC", email: "dev@ispc.ao", passwordHash, role: "DEV" } });
  await prisma.user.create({ data: { name: "Administrador ISPC", email: "admin@ispc.ao", passwordHash, role: "ADMIN" } });
  await prisma.user.create({ data: { name: "Secretaria ISPC", email: "secretaria@ispc.ao", passwordHash, role: "SECRETARIA" } });
  await prisma.user.create({ data: { name: "DAAC ISPC", email: "daac@ispc.ao", passwordHash, role: "DAAC" } });

  await prisma.user.create({ data: { name: professor1.nome, email: professor1.email, passwordHash, role: "PROFESSOR", professorId: professor1.id } });
  await prisma.user.create({ data: { name: professor2.nome, email: professor2.email, passwordHash, role: "PROFESSOR", professorId: professor2.id } });

  await Promise.all(
    alunos.map((aluno) =>
      prisma.user.create({ data: { name: aluno.nome, email: aluno.email, passwordHash, role: "ALUNO", alunoId: aluno.id } }),
    ),
  );

  console.log("A iniciar o relógio simulado na hora real...");
  await prisma.relogioSimulado.create({ data: { id: "config", agora: new Date() } });

  console.log("\nSeed do teste de 5 anos concluído.");
  console.log(`Todas as contas usam a senha: ${SENHA_TESTE}`);
  console.log("  dev@ispc.ao (DEV — avança o relógio simulado em Admin > Relógio Simulado)");
  console.log("  admin@ispc.ao (ADMIN)");
  console.log("  secretaria@ispc.ao (SECRETARIA)");
  console.log("  daac@ispc.ao (DAAC)");
  console.log(`  ${professor1.email} / ${professor2.email} (PROFESSOR)`);
  alunos.forEach((a) => console.log(`  ${a.email} (ALUNO, ${a.numeroEstudante})`));
  console.log("\nLembrete: para o relógio simulado ter efeito, SIMULATION_MODE=true tem de estar definido no ambiente (ver src/lib/tempo.ts).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
