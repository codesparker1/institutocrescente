import dotenv from "dotenv";
// §2026-08-25: `import "dotenv/config"` NÃO tem precedence sobre um DATABASE_URL já definido
// (ex. pelo .env → Neon de PRODUÇÃO). Este seed é da BD de TESTE — apontar sempre ao
// .env.local com override, igual aos scripts de simulação.
dotenv.config({ path: ".env.local", override: true });
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CURRICULO, ALUNOS_FACULDADE } from "./curriculo-faculdade";

/**
 * Elenco "faculdade de verdade" (§pedido do cliente 2026-08-25) para o teste multi-anos com
 * relógio simulado (Admin > Relógio Simulado, só ativo com SIMULATION_MODE=true e operado pelo
 * papel DEV): curso Engenharia Informática de 4 anos, cada ano com as SUAS 2 disciplinas
 * (nenhuma repetida entre anos), cada disciplina com o seu professor (8 professores no total),
 * 12 alunos com perfis reais — caminho feliz, multas, trancamento, reprovação+repetição,
 * auto-zero por prazo, transferido com créditos, bolseira INAGBE, desistente (nova feature),
 * recurso/exame especial, dispensa+emolumentos, mudança de categoria. Ao contrário do seed de
 * demonstração (prisma/seed.ts), aqui não se semeiam notas/aulas/cobranças — a ideia é ver o
 * próprio sistema gerá-las sozinho à medida que o relógio avança.
 *
 * O currículo vive em curriculo-faculdade.ts, partilhado com a simulação — este seed só o
 * materializa na BD.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SENHA_TESTE = "Ispc@2026";

const ANO_LETIVO_INICIAL = new Date().getFullYear();

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

  console.log("A criar curso e preços de propina...");
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

  // ---- Professores: 8, um por disciplina, criados a partir do currículo canónico ----
  console.log(`A criar os ${CURRICULO.flatMap((a) => a.disciplinas).length} professores (um por cadeira)...`);
  const professorPorEmail = new Map<string, { id: string; email: string; nome: string }>();
  let seedTelefone = 1;
  for (const ano of CURRICULO) {
    for (const disc of ano.disciplinas) {
      const professor = await prisma.professor.create({
        data: {
          nome: disc.professorNome,
          email: disc.professorEmail,
          telefone: telefoneAngola(seedTelefone++),
          especialidade: disc.professorEspecialidade,
        },
      });
      professorPorEmail.set(disc.professorEmail, { id: professor.id, email: professor.email, nome: professor.nome });
    }
  }

  // ---- Turma do 1º ano + currículo completo (CadeiraCurricular para os 4 anos) ----
  console.log(`A criar a turma do 1º ano (ano letivo ${ANO_LETIVO_INICIAL})...`);
  const turma1 = await prisma.turma.create({
    data: { cursoId: curso.id, anoCurricular: 1, periodo: "MATUTINO", anoLetivo: ANO_LETIVO_INICIAL },
  });

  const cadeiraPorChave = new Map<string, { cadeiraId: string; disciplinaId: string }>();
  for (const ano of CURRICULO) {
    for (const disc of ano.disciplinas) {
      const cadeira = await prisma.cadeiraCurricular.create({
        data: { cursoId: curso.id, disciplinaId: (await prisma.disciplina.create({
          data: { nome: disc.nome, codigo: disc.codigo, cargaHoraria: disc.cargaHoraria, cursoId: curso.id },
        })).id, anoCurricular: ano.anoCurricular, semestre: disc.semestre },
      });
      cadeiraPorChave.set(`${ano.anoCurricular}:${disc.nome}`, { cadeiraId: cadeira.id, disciplinaId: cadeira.disciplinaId });
    }
  }

  // TurmaDisciplina + horário SÓ para a turma do 1º ano (os anos seguintes nascem por
  // rolloverTurmas/garantirTurmaAnoCurricular quando o relógio avança).
  const tdPorDisciplinaNome = new Map<string, string>();
  for (const disc of CURRICULO[0].disciplinas) {
    const chave = `1:${disc.nome}`;
    const { cadeiraId, disciplinaId } = cadeiraPorChave.get(chave)!;
    const professorId = professorPorEmail.get(disc.professorEmail)!.id;
    const td = await prisma.turmaDisciplina.create({
      data: { turmaId: turma1.id, disciplinaId, cadeiraCurricularId: cadeiraId, professorId, semestre: disc.semestre, sala: disc.sala },
    });
    tdPorDisciplinaNome.set(disc.nome, td.id);

    // Horário: SEG/QUA para as do 1º semestre, TER/QUI para as do 2º.
    const dias = disc.semestre === 1 ? ["SEGUNDA", "QUARTA"] : ["TERCA", "QUINTA"];
    await prisma.horarioSlot.createMany({
      data: dias.map((diaSemana) => ({ turmaDisciplinaId: td.id, diaSemana: diaSemana as "SEGUNDA" | "QUARTA" | "TERCA" | "QUINTA", horaInicio: "08:00", horaFim: "10:00", sala: disc.sala })),
    });
  }

  // ---- Alunos: 12, matriculados no 1º ano (o transferido Carlos entra no 2º via simulação) ----
  console.log(`A criar os ${ALUNOS_FACULDADE.length} alunos e matriculá-los...`);
  const passwordHash = await bcrypt.hash(SENHA_TESTE, 10);
  const alunosCriados: { id: string; nome: string; email: string; numeroEstudante: string }[] = [];

  for (const [index, def] of ALUNOS_FACULDADE.entries()) {
    const numero = String(index + 1).padStart(4, "0");
    const aluno = await prisma.aluno.create({
      data: {
        numeroEstudante: `ISPC${ANO_LETIVO_INICIAL}-${numero}`,
        nome: `${def.primeiro} ${def.ultimo}`,
        email: `${slug(def.primeiro)}.${slug(def.ultimo)}@aluno.ispc.ao`,
        telefone: telefoneAngola(10 + index),
        dataNascimento: new Date(2005, index % 12, 10 + (index % 18)),
        genero: def.genero,
        curso: curso.nome,
        anoIngresso: ANO_LETIVO_INICIAL,
        anoCurricular: 1,
        status: "ATIVO",
        categoria: def.categoria ?? "NORMAL",
      },
    });
    alunosCriados.push({ id: aluno.id, nome: aluno.nome, email: aluno.email, numeroEstudante: aluno.numeroEstudante });

    await prisma.user.create({ data: { name: aluno.nome, email: aluno.email, passwordHash, role: "ALUNO", alunoId: aluno.id } });
  }

  // Matrícula + inscrições do 1º ano para TODOS (inclui Carlos — a simulação processa a
  // transferência dele no arranque: credita as 2 cadeiras do 1º ano e rematrículao para o 2º).
  const cadeiraProgI = cadeiraPorChave.get("1:Programação I")!;
  const cadeiraBasesDados = cadeiraPorChave.get("1:Bases de Dados")!;
  const tdProgI = tdPorDisciplinaNome.get("Programação I")!;
  const tdBasesDados = tdPorDisciplinaNome.get("Bases de Dados")!;

  for (const aluno of alunosCriados) {
    await prisma.matricula.create({ data: { alunoId: aluno.id, turmaId: turma1.id, status: "ATIVA" } });
    await prisma.inscricaoCadeira.createMany({
      data: [
        { alunoId: aluno.id, cadeiraCurricularId: cadeiraProgI.cadeiraId, turmaDisciplinaId: tdProgI, tentativa: 1, ativa: true, permiteDispensaAplicada: true, notaMinimaDispensaAplicada: 14 },
        { alunoId: aluno.id, cadeiraCurricularId: cadeiraBasesDados.cadeiraId, turmaDisciplinaId: tdBasesDados, tentativa: 1, ativa: true, permiteDispensaAplicada: true, notaMinimaDispensaAplicada: 14 },
      ],
    });
  }

  console.log("A configurar o ano letivo, janela de matrícula e financeiro...");
  const inicioAnoLetivo = new Date(ANO_LETIVO_INICIAL, 1, 1);
  const fimAnoLetivo = new Date(ANO_LETIVO_INICIAL, 11, 15);
  await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: {
      limiteReprovacoes: 2,
      regraRetencao: "SO_REPROVADAS",
      semestreAtual: 1,
      ultimaSuspensaoEm: null,
      anoLetivoInicio: inicioAnoLetivo,
      anoLetivoFim: fimAnoLetivo,
      matriculaInicio: new Date(ANO_LETIVO_INICIAL, 11, 1),
      matriculaFim: new Date(ANO_LETIVO_INICIAL + 1, 0, 31),
    },
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

  // §faculdade-de-verdade: agravamento por cadeira em repetição LIGADO (era sempre 0) — quem
  // repete cadeira paga propina agravada; multa tardia ligada para o cenário do Domingos/Beatriz.
  await prisma.configuracaoFinanceira.create({
    data: {
      id: "config",
      bloqueioAtivo: true,
      toleranciaDias: 5,
      diaVencimento: 10,
      valorMulta: 5000,
      percentagemAgravamentoPorCadeira: 10,
      valorMultaRematriculaTardia: 15000,
    },
  });

  await prisma.emolumento.createMany({
    data: [
      { nome: "Declaração de matrícula", descricao: "Comprova a matrícula no ano letivo corrente", valor: 3000 },
      { nome: "Certidão de notas", descricao: "Histórico de notas até à data do pedido", valor: 5000 },
    ],
  });

  console.log("A criar as contas de staff...");
  await prisma.user.create({ data: { name: "Responsável Técnico ISPC", email: "dev@ispc.ao", passwordHash, role: "DEV" } });
  await prisma.user.create({ data: { name: "Administrador ISPC", email: "admin@ispc.ao", passwordHash, role: "ADMIN" } });
  await prisma.user.create({ data: { name: "Secretaria ISPC", email: "secretaria@ispc.ao", passwordHash, role: "SECRETARIA" } });
  await prisma.user.create({ data: { name: "DAAC ISPC", email: "daac@ispc.ao", passwordHash, role: "DAAC" } });

  for (const professor of professorPorEmail.values()) {
    await prisma.user.create({ data: { name: professor.nome, email: professor.email, passwordHash, role: "PROFESSOR", professorId: professor.id } });
  }

  console.log("A iniciar o relógio simulado na hora real...");
  await prisma.relogioSimulado.create({ data: { id: "config", agora: new Date() } });

  console.log("\nSeed 'faculdade de verdade' concluído.");
  console.log(`Todas as contas usam a senha: ${SENHA_TESTE}`);
  console.log("  dev@ispc.ao (DEV — relógio simulado) | admin@ | secretaria@ | daac@ispc.ao");
  console.log("  Professores:");
  for (const p of professorPorEmail.values()) console.log(`    ${p.email} (${p.nome})`);
  console.log("  Alunos:");
  for (const a of alunosCriados) console.log(`    ${a.email} (${a.numeroEstudante})`);
  console.log("\nLembrete: SIMULATION_MODE=true tem de estar definido no ambiente (ver src/lib/tempo.ts).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
