/**
 * Formata a base por completo para o arranque real do Instituto (§pedido do cliente 2026-09-13:
 * "formatar mesmo a base de dados por completo, para nós fazermos o manual para a faculdade").
 *
 * Apaga TUDO — cursos, disciplinas, plano curricular, preços, emolumentos, turmas, professores,
 * alunos, contas, movimento, auditoria e telemetria — com duas exceções deliberadas:
 *
 *   1. As contas ADMIN. Sem nenhuma, ninguém entra para construir o que quer que seja e o sistema
 *      fica inutilizável — a limpeza tornar-se-ia irreversível pela via errada, sem sequer haver
 *      como voltar a criar um administrador pela aplicação.
 *   2. As duas configurações singleton, que não são apagadas mas REPOSTAS aos valores de origem
 *      (id fixo "config", ver o schema). Ficam com os defeitos do schema em vez de desaparecerem:
 *      o código lê-as sempre por `findUnique` e tolera a ausência, mas um ecrã de configuração com
 *      campos vazios e outro com os defeitos reais são coisas diferentes para quem escreve o manual.
 *
 * O relógio simulado é apagado: sem linha, `getAgora()` cai na data real, que é o que um sistema em
 * operação verdadeira quer. (Desligar SIMULATION_MODE nas variáveis de ambiente do site continua a
 * ser preciso — isto só limpa a base.)
 *
 * IRREVERSÍVEL e sem cópia de segurança. Por omissão só conta; passar --apply para apagar a sério.
 *
 * Usage:
 *   npx tsx scripts/preparar-arranque-real.ts            # só conta
 *   npx tsx scripts/preparar-arranque-real.ts --apply    # apaga
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--apply");

async function contar() {
  const [
    alunos,
    professores,
    contasNaoAdmin,
    contasAdmin,
    cursos,
    disciplinas,
    cadeiras,
    precos,
    emolumentos,
    turmas,
    turmaDisciplinas,
    horarios,
    matriculas,
    inscricoes,
    notas,
    avaliacoes,
    aulas,
    frequencias,
    cobrancas,
    documentos,
    reclamacoes,
    auditoria,
    telemetria,
    relogio,
  ] = await Promise.all([
    prisma.aluno.count(),
    prisma.professor.count(),
    prisma.user.count({ where: { role: { not: "ADMIN" } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.curso.count(),
    prisma.disciplina.count(),
    prisma.cadeiraCurricular.count(),
    prisma.precoPropina.count(),
    prisma.emolumento.count(),
    prisma.turma.count(),
    prisma.turmaDisciplina.count(),
    prisma.horarioSlot.count(),
    prisma.matricula.count(),
    prisma.inscricaoCadeira.count(),
    prisma.nota.count(),
    prisma.avaliacao.count(),
    prisma.aula.count(),
    prisma.frequencia.count(),
    prisma.cobranca.count(),
    prisma.documentoAluno.count(),
    prisma.reclamacao.count(),
    prisma.auditLog.count(),
    prisma.simEvento.count(),
    prisma.relogioSimulado.count(),
  ]);

  return {
    apagar: {
      cursos,
      disciplinas,
      "cadeiras do plano": cadeiras,
      "preços de propina": precos,
      emolumentos,
      turmas,
      "turma-disciplinas": turmaDisciplinas,
      horários: horarios,
      professores,
      alunos,
      "contas (não-ADMIN)": contasNaoAdmin,
      matrículas: matriculas,
      inscrições: inscricoes,
      notas,
      avaliações: avaliacoes,
      aulas,
      frequências: frequencias,
      cobranças: cobrancas,
      documentos,
      reclamações: reclamacoes,
      auditoria,
      telemetria,
      "relógio simulado": relogio,
    },
    manter: { "contas ADMIN": contasAdmin },
  };
}

function imprimir(titulo: string, linhas: Record<string, number>) {
  console.log(`\n${titulo}`);
  for (const [nome, n] of Object.entries(linhas)) {
    console.log(`  ${nome.padEnd(24)} ${String(n).padStart(6)}`);
  }
}

async function main() {
  const antes = await contar();
  imprimir("A APAGAR:", antes.apagar);
  imprimir("A MANTER:", antes.manter);
  console.log("\n  (as duas configurações singleton são repostas aos valores de origem, não apagadas)");

  if (antes.manter["contas ADMIN"] === 0) {
    console.log("\nABORTADO: não há nenhuma conta ADMIN. Apagar tudo deixaria o sistema sem forma de entrar.");
    process.exitCode = 1;
    return;
  }

  const total = Object.values(antes.apagar).reduce((a, b) => a + b, 0);

  if (!APLICAR) {
    console.log(`\nModo relatório (dry-run). ${total} registo(s) seriam apagados.`);
    console.log("Corra com --apply para apagar a sério. É IRREVERSÍVEL e não há cópia de segurança.");
    return;
  }

  // Ordem: filhos primeiro. As chaves estrangeiras não têm cascade em toda a parte, e apagar um pai
  // antes do filho falha a meio — deixando a base num estado pior do que estava. Dentro de uma
  // transação: ou sai tudo, ou não sai nada.
  //
  // As configurações saem cedo porque apontam a User (atualizadaPor); as contas saem antes de
  // Professor/Aluno porque User.professorId/alunoId apontam para eles.
  // A telemetria sai PRIMEIRO e FORA da transação. São dezenas de milhares de linhas, e a
  // transação interativa do Prisma expira aos 5s por omissão — contra uma base remota, só esta
  // tabela estourava o limite e levava consigo o resto (§falhou assim à primeira, 2026-09-13).
  // Pode ficar de fora sem risco: SimEvento não tem chave estrangeira nenhuma, ninguém depende
  // dela, e é o registo mais descartável da base. Se falhar a meio, o pior caso é sobrarem
  // eventos órfãos — nada que impeça o arranque.
  console.log("\nA apagar a telemetria (fora da transação, por ser volumosa)...");
  const telemetriaApagada = await prisma.simEvento.deleteMany({});
  console.log(`  ${telemetriaApagada.count} evento(s) de telemetria apagados.`);

  console.log("\nA apagar o resto, numa transação...");
  await prisma.$transaction(
    [
    prisma.frequencia.deleteMany({}),
    prisma.nota.deleteMany({}),
    prisma.aula.deleteMany({}),
    prisma.avaliacao.deleteMany({}),
    prisma.horarioSlot.deleteMany({}),
    prisma.inscricaoCadeira.deleteMany({}),
    prisma.matricula.deleteMany({}),
    prisma.documentoAluno.deleteMany({}),
    prisma.cobranca.deleteMany({}),
    prisma.reclamacao.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.configuracaoAcademica.deleteMany({}),
    prisma.configuracaoFinanceira.deleteMany({}),
    prisma.relogioSimulado.deleteMany({}),
    prisma.turmaDisciplina.deleteMany({}),
    prisma.turma.deleteMany({}),
    prisma.cadeiraCurricular.deleteMany({}),
    prisma.precoPropina.deleteMany({}),
    prisma.emolumento.deleteMany({}),
    prisma.user.deleteMany({ where: { role: { not: "ADMIN" } } }),
    prisma.professor.deleteMany({}),
    prisma.aluno.deleteMany({}),
    prisma.disciplina.deleteMany({}),
    prisma.curso.deleteMany({}),
    // Repostas, não apagadas — só os campos com defeito no schema, sem datas nem utilizador.
    prisma.configuracaoAcademica.create({ data: { id: "config" } }),
    prisma.configuracaoFinanceira.create({ data: { id: "config" } }),
    ],
    // 5s (o defeito) não chega: são duas dezenas de comandos, cada um com a latência de ida e
    // volta até à base remota. O tempo aqui não é trabalho, é distância.
    { timeout: 60_000, maxWait: 15_000 },
  );

  const depois = await contar();
  imprimir("DEPOIS — o que devia estar a zero:", depois.apagar);
  imprimir("DEPOIS — mantido:", depois.manter);

  const restante = Object.values(depois.apagar).reduce((a, b) => a + b, 0);
  console.log(
    restante === 0
      ? "\nBase formatada. O sistema está vazio, com as contas ADMIN e as configurações de origem."
      : `\nAtenção: sobraram ${restante} registo(s) que deviam ter saído — ver a lista acima.`,
  );

  console.log("\nOrdem de montagem na aplicação, para o manual:");
  console.log("  1. Admin > Configuração Académica — datas do ano letivo e da janela de matrícula");
  console.log("  2. Admin > Cursos — criar os cursos (nome, código, duração)");
  console.log("  3. Admin > Disciplinas — criar as disciplinas");
  console.log("  4. Admin > Plano Curricular — pôr as disciplinas nos anos/semestres de cada curso");
  console.log("  5. Admin > Preços de Propina e Emolumentos");
  console.log("  6. Admin > Professores e Equipa — criar as contas");
  console.log("  7. Admin > Turmas — criar as turmas do ano e atribuir disciplinas/professores");
  console.log("  8. Gestão de Matrícula — matricular os primeiros alunos");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
