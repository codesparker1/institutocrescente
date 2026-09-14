/**
 * Semeia a base com o elenco de scripts/manual/dados.ts, para se poder fotografar o sistema a
 * funcionar e escrever o manual da faculdade (§pedido do cliente 2026-09-13).
 *
 * ESCREVE NA NEON DO .env.local — a mesma base que está por trás do site publicado. É deliberado:
 * as capturas do manual saem do site real, e não de um servidor local, para mostrarem exatamente o
 * que a faculdade vai ver. Enquanto estes dados lá estiverem, o site mostra o elenco de
 * demonstração; scripts/preparar-arranque-real.ts volta a limpar tudo no fim.
 *
 * `import "dotenv/config"` sozinho carregaria o .env, que aponta para OUTRA Neon (ep-polished-dew,
 * com desvio de migrações). O override abaixo não é cosmético: sem ele este script semeia a base
 * errada em silêncio.
 *
 * Usage:
 *   npx tsx scripts/manual/seed-manual.ts            # só conta o que está lá e o que vai escrever
 *   npx tsx scripts/manual/seed-manual.ts --apply    # apaga o que existe e semeia
 *   npx tsx scripts/manual/seed-manual.ts --apply --force   # idem, mesmo com dados por cima
 */
import "dotenv/config";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ALUNOS,
  ANO_LETIVO,
  ANO_LETIVO_FIM,
  ANO_LETIVO_INICIO,
  ANO_LETIVO_SEGUINTE,
  CONFIG_FINANCEIRA,
  CURSOS,
  DATA_EXAME,
  DATA_EXAME_ESPECIAL,
  DATA_P1,
  DATA_P2,
  DATA_RECURSO,
  DISCIPLINAS,
  DOCUMENTOS,
  EMOLUMENTOS,
  FINALISTAS,
  MATRICULA_FIM,
  MATRICULA_INICIO,
  NOTAS_GUIADAS,
  PRECOS,
  PRIMEIRA_AULA,
  PROFESSORES,
  RECLAMACOES,
  SEMESTRE_ATUAL,
  SENHA_DEMO,
  STAFF,
  TOTAL_AULAS,
  type Epoca,
} from "./dados";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--apply");
const FORCAR = process.argv.includes("--force");

/** Data de referência de tudo o que é "hoje" — fixa, para o seed ser reproduzível. */
const HOJE = new Date("2026-09-13T12:00:00.000Z");

/**
 * Os acentos combinatórios que sobram depois de `normalize("NFD")` separar a letra do acento.
 * Construído a partir de uma string só-ASCII de propósito: escrito como literal `/[...]/`, o
 * intervalo seria feito de caracteres invisíveis, impossíveis de rever e frágeis a qualquer
 * mudança de codificação do ficheiro.
 */
const ACENTOS_COMBINATORIOS = new RegExp("[\\u0300-\\u036f]", "g");

function diasAntes(dias: number): Date {
  return new Date(HOJE.getTime() - dias * 24 * 60 * 60 * 1000);
}

/** Chave do plano curricular: curso × disciplina × ano × semestre. */
function chaveCadeira(cursoCodigo: string, disciplinaCodigo: string): string {
  return `${cursoCodigo}:${disciplinaCodigo}`;
}

// ---------------------------------------------------------------------------------------------

async function contarExistente() {
  const [alunos, cursos, users, turmas] = await Promise.all([
    prisma.aluno.count(),
    prisma.curso.count(),
    prisma.user.count(),
    prisma.turma.count(),
  ]);
  return { alunos, cursos, users, turmas };
}

/**
 * Apaga tudo antes de semear. Mesma ordem (filhos primeiro) de preparar-arranque-real.ts, pelo
 * mesmo motivo: as chaves estrangeiras não têm cascade em toda a parte, e apagar um pai antes do
 * filho falha a meio. A telemetria sai fora da transação por ser volumosa — a transação interativa
 * do Prisma expira aos 5s por omissão e essa tabela sozinha já estourou o limite uma vez.
 */
async function limpar(): Promise<void> {
  await prisma.simEvento.deleteMany({});
  await prisma.$transaction(
    [
      prisma.frequencia.deleteMany({}),
      prisma.nota.deleteMany({}),
      prisma.aula.deleteMany({}),
      prisma.avaliacao.deleteMany({}),
      prisma.horarioSlot.deleteMany({}),
      prisma.documentoAluno.deleteMany({}),
      prisma.reclamacao.deleteMany({}),
      prisma.cobranca.deleteMany({}),
      prisma.inscricaoCadeira.deleteMany({}),
      prisma.matricula.deleteMany({}),
      prisma.auditLog.deleteMany({}),
      prisma.configuracaoAcademica.deleteMany({}),
      prisma.configuracaoFinanceira.deleteMany({}),
      prisma.relogioSimulado.deleteMany({}),
      prisma.turmaDisciplina.deleteMany({}),
      prisma.turma.deleteMany({}),
      prisma.cadeiraCurricular.deleteMany({}),
      prisma.precoPropina.deleteMany({}),
      prisma.emolumento.deleteMany({}),
      prisma.user.deleteMany({}),
      prisma.professor.deleteMany({}),
      prisma.aluno.deleteMany({}),
      prisma.disciplina.deleteMany({}),
      prisma.curso.deleteMany({}),
    ],
    { timeout: 60_000, maxWait: 15_000 },
  );
}

async function main() {
  const antes = await contarExistente();
  console.log("Base atual:");
  console.log(`  alunos ${antes.alunos} · cursos ${antes.cursos} · contas ${antes.users} · turmas ${antes.turmas}`);

  console.log("\nVai semear:");
  console.log(`  ${CURSOS.length} cursos · ${DISCIPLINAS.length} disciplinas · ${PROFESSORES.length} professores`);
  console.log(`  ${ALUNOS.length} alunos · ${STAFF.length} contas de equipa · ${FINALISTAS.length} finalistas`);
  console.log(`  ${RECLAMACOES.length} reclamações · ${EMOLUMENTOS.length} emolumentos · ${PRECOS.length} preços`);
  console.log(`  ano letivo ${ANO_LETIVO} (${ANO_LETIVO_INICIO.toISOString().slice(0, 10)} a ${ANO_LETIVO_FIM.toISOString().slice(0, 10)}), semestre ${SEMESTRE_ATUAL}`);

  if (!APLICAR) {
    console.log("\nModo relatório. Corra com --apply para apagar o que está lá e semear.");
    return;
  }

  // Um seed apaga tanto como a formatação, mas não se parece com isso — e esta é a mesma base que
  // um dia terá dados reais da faculdade. A guarda existe para o dia em que alguém correr este
  // comando por engano meses depois de o manual estar feito.
  if (antes.alunos > 0 && !FORCAR) {
    console.log(`\nABORTADO: já existem ${antes.alunos} aluno(s) na base. Se são dados de demonstração e quer substituí-los, repita com --force.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nA limpar...");
  await limpar();

  const passwordHash = await bcrypt.hash(SENHA_DEMO, 10);

  // --- Cursos, preços, disciplinas, plano curricular -----------------------------------------
  console.log("A criar cursos, preços e disciplinas...");
  const cursoPorCodigo = new Map<string, string>();
  for (const c of CURSOS) {
    const criado = await prisma.curso.create({ data: c });
    cursoPorCodigo.set(c.codigo, criado.id);
  }

  await prisma.precoPropina.createMany({ data: PRECOS });

  const disciplinaPorCodigo = new Map<string, string>();
  const cadeiraPorChave = new Map<string, string>();
  for (const d of DISCIPLINAS) {
    const cursoId = cursoPorCodigo.get(d.cursoCodigo)!;
    const disciplina = await prisma.disciplina.create({
      data: { nome: d.nome, codigo: d.codigo, cargaHoraria: d.cargaHoraria, cursoId },
    });
    disciplinaPorCodigo.set(d.codigo, disciplina.id);

    const cadeira = await prisma.cadeiraCurricular.create({
      data: {
        cursoId,
        disciplinaId: disciplina.id,
        anoCurricular: d.anoCurricular,
        semestre: d.semestre,
        eMonografia: d.eMonografia ?? false,
        permiteDispensa: d.permiteDispensa ?? true,
      },
    });
    cadeiraPorChave.set(chaveCadeira(d.cursoCodigo, d.codigo), cadeira.id);
  }

  // --- Professores e contas -------------------------------------------------------------------
  console.log("A criar professores e contas de equipa...");
  const professorPorEmail = new Map<string, string>();
  for (const p of PROFESSORES) {
    const criado = await prisma.professor.create({ data: p });
    professorPorEmail.set(p.email, criado.id);
    await prisma.user.create({
      data: { name: p.nome, email: p.email, passwordHash, role: "PROFESSOR", professorId: criado.id },
    });
  }

  const userPorEmail = new Map<string, string>();
  for (const s of STAFF) {
    const criado = await prisma.user.create({
      data: { name: s.nome, email: s.email, passwordHash, role: s.role },
    });
    userPorEmail.set(s.email, criado.id);
  }
  // Sem atalho "professor@ispc.ao". Professor.professorId é @unique, por isso uma segunda conta
  // para o mesmo professor teria de ficar SEM ligação — e /professor faz
  // `if (!session.user.professorId) redirect("/dashboard")`, ou seja, o atalho entrava e era
  // expulso do próprio ecrã que o manual precisa de mostrar. Cada professor usa o seu email real,
  // que também é como a faculdade vai trabalhar.

  // --- Turmas ---------------------------------------------------------------------------------
  console.log("A criar turmas e a atribuir disciplinas...");
  const coortes = new Map<string, { cursoCodigo: string; anoCurricular: number; periodo: "MATUTINO" | "NOTURNO" }>();
  for (const a of ALUNOS) {
    coortes.set(`${a.cursoCodigo}:${a.anoCurricular}:${a.periodo}`, {
      cursoCodigo: a.cursoCodigo,
      anoCurricular: a.anoCurricular,
      periodo: a.periodo,
    });
  }

  interface TurmaDisciplinaCriada {
    id: string;
    turmaId: string;
    cadeiraCurricularId: string;
    disciplinaCodigo: string;
    semestre: number;
    temProfessor: boolean;
    eMonografia: boolean;
    sala: string;
  }

  const turmaPorChave = new Map<string, string>();
  const tds: TurmaDisciplinaCriada[] = [];

  /** Cria a turma e, do plano curricular, as disciplinas desse ano do curso. */
  async function criarTurma(
    cursoCodigo: string,
    anoCurricular: number,
    periodo: "MATUTINO" | "NOTURNO",
    anoLetivo: number,
    registarTds: boolean,
  ): Promise<string> {
    const cursoId = cursoPorCodigo.get(cursoCodigo)!;
    const turma = await prisma.turma.create({
      data: { cursoId, anoCurricular, periodo, anoLetivo },
    });
    turmaPorChave.set(`${cursoCodigo}:${anoCurricular}:${periodo}:${anoLetivo}`, turma.id);

    for (const d of DISCIPLINAS.filter((x) => x.cursoCodigo === cursoCodigo && x.anoCurricular === anoCurricular)) {
      const td = await prisma.turmaDisciplina.create({
        data: {
          turmaId: turma.id,
          disciplinaId: disciplinaPorCodigo.get(d.codigo)!,
          cadeiraCurricularId: cadeiraPorChave.get(chaveCadeira(d.cursoCodigo, d.codigo))!,
          professorId: d.professorEmail ? professorPorEmail.get(d.professorEmail)! : null,
          semestre: d.semestre,
          sala: d.sala,
        },
      });
      // O horário só faz sentido no ano corrente — as turmas do ano seguinte existem para a
      // rematrícula ter destino, e o DAAC programa-lhes o horário quando o ano começar.
      if (registarTds) {
        for (const slot of d.slots) {
          await prisma.horarioSlot.create({
            data: { turmaDisciplinaId: td.id, ...slot, sala: d.sala },
          });
        }
        tds.push({
          id: td.id,
          turmaId: turma.id,
          cadeiraCurricularId: td.cadeiraCurricularId,
          disciplinaCodigo: d.codigo,
          semestre: d.semestre,
          temProfessor: Boolean(d.professorEmail),
          eMonografia: d.eMonografia ?? false,
          sala: d.sala,
        });
      }
    }
    return turma.id;
  }

  for (const c of coortes.values()) {
    await criarTurma(c.cursoCodigo, c.anoCurricular, c.periodo, ANO_LETIVO, true);
  }
  // Turmas do ano seguinte, vazias de propósito: é para elas que a Secretaria processa a
  // rematrícula. Cada coorte de 2026 precisa de DOIS destinos em 2027 — o mesmo ano (para quem
  // fica retido) e o ano seguinte no mesmo período (para quem avança). Sem o segundo, um aluno do
  // 2º ano matutino não teria para onde ir, porque o 3º ano só existe em noturno — e a
  // demonstração de "Processar Rematrícula" falhava no ecrã que o manual mais precisa de mostrar.
  const destinos2027 = new Map<string, { cursoCodigo: string; anoCurricular: number; periodo: "MATUTINO" | "NOTURNO" }>();
  for (const c of coortes.values()) {
    const duracao = CURSOS.find((x) => x.codigo === c.cursoCodigo)!.duracaoAnos;
    for (const ano of [c.anoCurricular, c.anoCurricular + 1]) {
      if (ano > duracao) continue;
      destinos2027.set(`${c.cursoCodigo}:${ano}:${c.periodo}`, {
        cursoCodigo: c.cursoCodigo,
        anoCurricular: ano,
        periodo: c.periodo,
      });
    }
  }
  for (const d of destinos2027.values()) {
    await criarTurma(d.cursoCodigo, d.anoCurricular, d.periodo, ANO_LETIVO_SEGUINTE, false);
  }

  // --- Alunos, matrículas e inscrições --------------------------------------------------------
  console.log("A criar alunos, matrículas e inscrições...");
  const alunoPorNumero = new Map<string, { id: string; anoCurricular: number; categoria: string }>();
  const matriculaPorAluno = new Map<string, string>();
  /** (numeroEstudante, disciplinaCodigo, tentativa) -> inscricaoCadeiraId */
  const inscricaoPorChave = new Map<string, string>();

  for (const [indice, a] of ALUNOS.entries()) {
    const status = a.status ?? "ATIVO";
    const categoria = a.categoria ?? "NORMAL";
    // "Cátia Baptista" -> "catia.baptista".
    const slug = a.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(ACENTOS_COMBINATORIOS, "")
      .replace(/\s+/g, ".");
    const sufixo = String(indice + 1).padStart(3, "0");
    const aluno = await prisma.aluno.create({
      data: {
        numeroEstudante: a.numero,
        nome: a.nome,
        email: `${slug}@aluno.ispc.ao`,
        telefone: `+244 923 ${sufixo} ${sufixo}`,
        dataNascimento: new Date(a.nascimento),
        genero: a.genero,
        curso: CURSOS.find((c) => c.codigo === a.cursoCodigo)!.nome,
        anoIngresso: a.anoIngresso,
        anoCurricular: a.anoCurricular,
        status,
        categoria,
      },
    });
    alunoPorNumero.set(a.numero, { id: aluno.id, anoCurricular: a.anoCurricular, categoria });

    await prisma.user.create({
      data: { name: a.nome, email: aluno.email!, passwordHash, role: "ALUNO", alunoId: aluno.id },
    });

    const turmaId = turmaPorChave.get(`${a.cursoCodigo}:${a.anoCurricular}:${a.periodo}:${ANO_LETIVO}`)!;
    const matricula = await prisma.matricula.create({
      data: {
        alunoId: aluno.id,
        turmaId,
        dataMatricula: diasAntes(190),
        status: status === "TRANCADO" ? "TRANCADA" : "ATIVA",
      },
    });
    matriculaPorAluno.set(a.numero, matricula.id);

    // Um aluno TRANCADO não pode ter inscrições ativas — contradiria o próprio estado desde o
    // primeiro instante (o mesmo invariante que garantirSuspensaoAutomatica impõe em runtime).
    const ativa = status !== "TRANCADO";
    for (const td of tds.filter((t) => t.turmaId === turmaId && !t.eMonografia)) {
      const inscricao = await prisma.inscricaoCadeira.create({
        data: {
          alunoId: aluno.id,
          cadeiraCurricularId: td.cadeiraCurricularId,
          turmaDisciplinaId: td.id,
          tentativa: 1,
          ativa,
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: 14,
        },
      });
      inscricaoPorChave.set(`${a.numero}:${td.disciplinaCodigo}:1`, inscricao.id);
    }
  }

  // --- Repetente ------------------------------------------------------------------------------
  // Domingos (3º ano) repete Programação II do 2º. A 2ª tentativa precisa de uma oferta própria na
  // turma DELE, ligada à CadeiraCurricular do 2º ano — é exatamente o que processarRematricula faz,
  // e a razão pela qual a inscrição vive na cadeira e não na matrícula.
  console.log("A criar o repetente...");
  const domingos = alunoPorNumero.get("ISPC2026-0009")!;
  const turmaDomingos = turmaPorChave.get(`ENG-INF:3:NOTURNO:${ANO_LETIVO}`)!;
  const cadeiraProgII = cadeiraPorChave.get(chaveCadeira("ENG-INF", "ENG-201"))!;
  const tdProgIIAno2 = tds.find((t) => t.disciplinaCodigo === "ENG-201")!;

  const inscricaoTentativa1 = await prisma.inscricaoCadeira.create({
    data: {
      alunoId: domingos.id,
      cadeiraCurricularId: cadeiraProgII,
      turmaDisciplinaId: tdProgIIAno2.id,
      tentativa: 1,
      ativa: false,
      permiteDispensaAplicada: true,
      notaMinimaDispensaAplicada: 14,
    },
  });
  inscricaoPorChave.set(`ISPC2026-0009:ENG-201:1`, inscricaoTentativa1.id);

  const tdRepeticao = await prisma.turmaDisciplina.create({
    data: {
      turmaId: turmaDomingos,
      disciplinaId: disciplinaPorCodigo.get("ENG-201")!,
      cadeiraCurricularId: cadeiraProgII,
      professorId: professorPorEmail.get("antonio.sousa@ispc.ao")!,
      semestre: 1,
      sala: "Lab 1",
    },
  });
  tds.push({
    id: tdRepeticao.id,
    turmaId: turmaDomingos,
    cadeiraCurricularId: cadeiraProgII,
    disciplinaCodigo: "ENG-201",
    semestre: 1,
    temProfessor: true,
    eMonografia: false,
    sala: "Lab 1",
  });
  const inscricaoTentativa2 = await prisma.inscricaoCadeira.create({
    data: {
      alunoId: domingos.id,
      cadeiraCurricularId: cadeiraProgII,
      turmaDisciplinaId: tdRepeticao.id,
      tentativa: 2,
      ativa: true,
      permiteDispensaAplicada: true,
      notaMinimaDispensaAplicada: 14,
    },
  });
  inscricaoPorChave.set(`ISPC2026-0009:ENG-201:2`, inscricaoTentativa2.id);
  await prisma.aluno.update({
    where: { id: domingos.id },
    data: { cadeirasReprovadasAnoAnterior: 1 },
  });

  // --- Finalistas -----------------------------------------------------------------------------
  console.log("A criar os finalistas e as monografias...");
  const tdMonografia = tds.find((t) => t.eMonografia)!;
  const cadeiraMonografia = tdMonografia.cadeiraCurricularId;
  const daacId = userPorEmail.get("daac@ispc.ao")!;

  for (const f of FINALISTAS) {
    const aluno = alunoPorNumero.get(f.alunoNumero)!;
    const inscricao = await prisma.inscricaoCadeira.create({
      data: {
        alunoId: aluno.id,
        cadeiraCurricularId: cadeiraMonografia,
        turmaDisciplinaId: tdMonografia.id,
        tentativa: 1,
        ativa: true,
        permiteDispensaAplicada: false,
        notaMinimaDispensaAplicada: 14,
        eMonografiaAplicada: true,
        orientadorId: f.orientadorEmail ? professorPorEmail.get(f.orientadorEmail)! : null,
        defesaData: f.defesaData,
        defesaSala: f.defesaSala,
        monografiaConfirmadaEm: f.confirmada ? diasAntes(120) : null,
        monografiaConfirmadaPorId: f.confirmada ? daacId : null,
      },
    });
    inscricaoPorChave.set(`${f.alunoNumero}:ENG-MONO:1`, inscricao.id);
  }

  // A nota da defesa grava-se na época EXAME — decisão deliberada do schema; nos ecrãs lê-se
  // sempre "Defesa". A Avaliacao existe só como veículo dessa nota na pauta.
  const avaliacaoDefesa = await prisma.avaliacao.create({
    data: { turmaDisciplinaId: tdMonografia.id, epoca: "EXAME", data: DATA_EXAME, sala: "Sala C1" },
  });
  for (const f of FINALISTAS.filter((x) => x.nota !== null)) {
    await prisma.nota.create({
      data: {
        avaliacaoId: avaliacaoDefesa.id,
        inscricaoCadeiraId: inscricaoPorChave.get(`${f.alunoNumero}:ENG-MONO:1`)!,
        valor: f.nota!,
        lancadoEm: f.defesaData ?? diasAntes(30),
      },
    });
  }

  // --- Avaliações e notas ---------------------------------------------------------------------
  // Só no 1º semestre: é o semestre corrente, e provas marcadas num semestre que ainda não abriu
  // seriam uma inconsistência visível no horário do aluno.
  console.log("A criar avaliações e notas...");
  const DATA_POR_EPOCA: Record<Epoca, Date> = {
    P1: DATA_P1,
    P2: DATA_P2,
    EXAME: DATA_EXAME,
    RECURSO: DATA_RECURSO,
    EXAME_ESPECIAL: DATA_EXAME_ESPECIAL,
  };
  /** (turmaDisciplinaId, época) -> avaliacaoId */
  const avaliacaoPorChave = new Map<string, string>();

  async function garantirAvaliacao(turmaDisciplinaId: string, epoca: Epoca, sala: string): Promise<string> {
    const chave = `${turmaDisciplinaId}:${epoca}`;
    const existente = avaliacaoPorChave.get(chave);
    if (existente) return existente;
    const criada = await prisma.avaliacao.create({
      data: { turmaDisciplinaId, epoca, data: DATA_POR_EPOCA[epoca], sala },
    });
    avaliacaoPorChave.set(chave, criada.id);
    return criada.id;
  }

  for (const td of tds.filter((t) => !t.eMonografia && t.semestre === 1)) {
    for (const epoca of ["P1", "P2", "EXAME"] as Epoca[]) {
      await garantirAvaliacao(td.id, epoca, td.sala);
    }
  }

  for (const n of NOTAS_GUIADAS) {
    const chaveInscricao = `${n.alunoNumero}:${n.disciplinaCodigo}:${n.tentativa ?? 1}`;
    const inscricaoId = inscricaoPorChave.get(chaveInscricao);
    if (!inscricaoId) {
      console.log(`  aviso: sem inscrição para ${chaveInscricao} — nota ignorada`);
      continue;
    }
    const inscricao = await prisma.inscricaoCadeira.findUniqueOrThrow({
      where: { id: inscricaoId },
      select: { turmaDisciplinaId: true },
    });
    const td = tds.find((t) => t.id === inscricao.turmaDisciplinaId)!;
    for (const [epoca, valor] of Object.entries(n.notas) as [Epoca, number][]) {
      const avaliacaoId = await garantirAvaliacao(td.id, epoca, td.sala);
      await prisma.nota.create({
        data: { avaliacaoId, inscricaoCadeiraId: inscricaoId, valor, lancadoEm: DATA_POR_EPOCA[epoca] },
      });
    }
  }

  // --- Aulas e frequência ---------------------------------------------------------------------
  console.log("A criar aulas e frequência...");
  let indiceGlobal = 0;
  for (const td of tds.filter((t) => !t.eMonografia && t.semestre === 1 && t.temProfessor)) {
    const inscricoes = await prisma.inscricaoCadeira.findMany({
      where: { turmaDisciplinaId: td.id, ativa: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (let semana = 0; semana < TOTAL_AULAS; semana += 1) {
      const aula = await prisma.aula.create({
        data: {
          turmaDisciplinaId: td.id,
          data: new Date(PRIMEIRA_AULA.getTime() + semana * 7 * 24 * 60 * 60 * 1000),
        },
      });
      if (inscricoes.length === 0) continue;
      await prisma.frequencia.createMany({
        data: inscricoes.map((insc, i) => {
          // Faltas determinísticas — ~11% das presenças, sempre nos mesmos sítios, para o número
          // de faltas do manual continuar igual se o seed for repetido.
          const falta = (semana + i + indiceGlobal) % 9 === 0;
          return {
            aulaId: aula.id,
            inscricaoCadeiraId: insc.id,
            presente: !falta,
            justificada: falta ? (semana + i) % 2 === 0 : null,
          };
        }),
      });
    }
    indiceGlobal += 1;
  }

  // --- Configurações --------------------------------------------------------------------------
  console.log("A criar as configurações...");
  await prisma.configuracaoAcademica.create({
    data: {
      id: "config",
      limiteReprovacoes: 2,
      regraRetencao: "SO_REPROVADAS",
      matriculaInicio: MATRICULA_INICIO,
      matriculaFim: MATRICULA_FIM,
      anoLetivoInicio: ANO_LETIVO_INICIO,
      anoLetivoFim: ANO_LETIVO_FIM,
      semestreAtual: SEMESTRE_ATUAL,
      limiteOrientandosPorProfessor: 5,
      lancamentoNotasAberto: true,
      lancamentoNotasAlteradoEm: diasAntes(60),
      // Marcadas como já corridas hoje: sem isto, a primeira visita ao dashboard dispara a
      // suspensão automática e a geração de propinas, que mexeriam nos números logo antes das
      // capturas — e o manual deixava de bater certo com a figura ao lado.
      ultimaSuspensaoEm: HOJE,
      ultimaSincronizacaoPlanoEm: HOJE,
    },
  });

  await prisma.configuracaoFinanceira.create({
    data: { id: "config", ...CONFIG_FINANCEIRA, ultimaGeracaoEm: HOJE },
  });

  await prisma.emolumento.createMany({ data: EMOLUMENTOS });

  // --- Cobranças ------------------------------------------------------------------------------
  console.log("A criar cobranças...");
  const secretariaId = userPorEmail.get("secretaria@ispc.ao")!;
  const precoDe = (categoria: string, anoCurricular: number): number =>
    PRECOS.find((p) => p.categoria === categoria && p.anoCurricular === anoCurricular)?.valor ?? 15000;

  for (const a of ALUNOS) {
    const aluno = alunoPorNumero.get(a.numero)!;
    const matriculaId = matriculaPorAluno.get(a.numero)!;
    const valorDevido = precoDe(aluno.categoria, a.anoCurricular);

    for (let i = 5; i >= 0; i -= 1) {
      const base = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 1);
      const mesReferencia = new Date(Date.UTC(base.getFullYear(), base.getMonth(), 1));
      const dataVencimento = new Date(Date.UTC(base.getFullYear(), base.getMonth(), CONFIG_FINANCEIRA.diaVencimento));
      const pendente = i < a.mesesEmDivida;

      await prisma.cobranca.create({
        data: {
          matriculaId,
          alunoId: aluno.id,
          tipo: "PROPINA",
          mesReferencia,
          valorDevido,
          valorPago: pendente ? 0 : valorDevido,
          status: pendente ? "PENDENTE" : "PAGO",
          dataVencimento,
          dataPagamento: pendente ? null : dataVencimento,
          registadoPorId: pendente ? null : secretariaId,
        },
      });

      // A multa assenta na propina mais antiga em dívida — é essa que já passou a tolerância.
      if (a.multa && pendente && i === a.mesesEmDivida - 1) {
        await prisma.cobranca.create({
          data: {
            matriculaId,
            alunoId: aluno.id,
            tipo: "MULTA",
            mesReferencia,
            descricao: "Multa por atraso no pagamento da propina",
            valorDevido: CONFIG_FINANCEIRA.valorMulta,
            status: "PENDENTE",
            dataVencimento,
          },
        });
      }
    }
  }

  // --- Reclamações ----------------------------------------------------------------------------
  console.log("A criar reclamações...");
  for (const r of RECLAMACOES) {
    const ligacao =
      r.autor.tipo === "aluno"
        ? { alunoId: alunoPorNumero.get(r.autor.numero)!.id }
        : r.autor.tipo === "professor"
          ? { professorId: professorPorEmail.get(r.autor.email)! }
          : { userId: userPorEmail.get(r.autor.email)! };

    await prisma.reclamacao.create({
      data: {
        ...ligacao,
        categoria: r.categoria,
        assunto: r.assunto,
        mensagem: r.mensagem,
        status: r.status,
        resposta: r.resposta ?? null,
        createdAt: diasAntes(r.diasAtras),
      },
    });
  }

  // --- Documentos -----------------------------------------------------------------------------
  console.log("A criar documentos...");
  for (const d of DOCUMENTOS) {
    const aluno = alunoPorNumero.get(d.alunoNumero)!;
    const pathname = `documentos/${aluno.id}/${d.nome.replace(/\s+/g, "-").toLowerCase()}`;
    await prisma.documentoAluno.create({
      data: {
        alunoId: aluno.id,
        nome: d.nome,
        blobUrl: `https://blob.vercel-storage.com/${pathname}`,
        blobPathname: pathname,
        tamanhoBytes: d.tamanhoBytes,
        tipoMime: d.tipoMime,
        carregadoPorId: daacId,
        createdAt: diasAntes(d.diasAtras),
      },
    });
  }

  // --- Auditoria ------------------------------------------------------------------------------
  console.log("A criar registos de auditoria...");
  await prisma.auditLog.createMany({
    data: [
      { userName: "DAAC ISPC", userRole: "DAAC", action: "Criou o curso Engenharia Informática", entityType: "Curso", ipAddress: "197.221.16.12", createdAt: diasAntes(200), dataEvento: diasAntes(200) },
      { userName: "DAAC ISPC", userRole: "DAAC", action: "Definiu o plano curricular do 1º ano", entityType: "CadeiraCurricular", ipAddress: "197.221.16.12", createdAt: diasAntes(198), dataEvento: diasAntes(198) },
      { userName: "Secretaria ISPC", userRole: "SECRETARIA", action: "Matriculou Marta Kiala no 1º ano de Engenharia Informática", entityType: "Matricula", ipAddress: "197.221.16.40", createdAt: diasAntes(190), dataEvento: diasAntes(190) },
      { userName: "Eng. António Sousa", userRole: "PROFESSOR", action: "Lançou nota de P1 em Programação I", entityType: "Nota", valorAnterior: null, valorNovo: "16", ipAddress: "197.221.30.88", createdAt: diasAntes(60), dataEvento: diasAntes(60) },
      { userName: "Secretaria ISPC", userRole: "SECRETARIA", action: "Registou pagamento de propina de Ricardo Domingos", entityType: "Cobranca", valorAnterior: "PENDENTE", valorNovo: "PAGO", ipAddress: "197.221.16.40", createdAt: diasAntes(12), dataEvento: diasAntes(12) },
      { userName: "DAAC ISPC", userRole: "DAAC", action: "Atribuiu Prof. Manuel Nzaji como orientador de Vanessa Capitango", entityType: "InscricaoCadeira", valorAnterior: null, valorNovo: "Prof. Manuel Nzaji", ipAddress: "197.221.16.12", createdAt: diasAntes(120), dataEvento: diasAntes(120) },
      { userName: "DAAC ISPC", userRole: "DAAC", action: "Lançou a nota da defesa de Vanessa Capitango", entityType: "Nota", valorAnterior: null, valorNovo: "16", ipAddress: "197.221.16.12", createdAt: diasAntes(30), dataEvento: diasAntes(30) },
      { userName: "Administrador ISPC", userRole: "ADMIN", action: "Iniciou sessão", entityType: "User", ipAddress: "197.221.16.12", createdAt: diasAntes(1), dataEvento: diasAntes(1) },
    ],
  });

  // --- Relatório final ------------------------------------------------------------------------
  const depois = await contarExistente();
  const [inscricoes, notas, cobrancas] = await Promise.all([
    prisma.inscricaoCadeira.count(),
    prisma.nota.count(),
    prisma.cobranca.count(),
  ]);

  console.log("\nSemeado.");
  console.log(`  alunos ${depois.alunos} · contas ${depois.users} · turmas ${depois.turmas}`);
  console.log(`  inscrições ${inscricoes} · notas ${notas} · cobranças ${cobrancas}`);
  console.log(`\nTodas as contas usam a senha: ${SENHA_DEMO}`);
  console.log("  admin@ispc.ao · secretaria@ispc.ao · daac@ispc.ao · dev@ispc.ao");
  console.log("  antonio.sousa@ispc.ao (professor com disciplinas)");
  console.log("  marta.kiala@aluno.ispc.ao (aluna do 1º ano, dispensada em Programação I)");
  console.log("  helder.zua@aluno.ispc.ao (finalista com defesa marcada)");
  console.log("\nQuando o manual estiver feito: npx tsx scripts/preparar-arranque-real.ts --apply");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
