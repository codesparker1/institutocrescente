/**
 * Backfill do fecho de semestre para alunos que já existiam antes de o fecho automático existir
 * (§pedido do cliente 2026-09-01).
 *
 * O fecho automático (alterarSemestreAction → fecharSemestre) só corre na troca 1º → 2º daqui para
 * a frente. Quem já tinha cadeiras penduradas de semestres passados continuava eternamente
 * "Em curso": a cascata em calcularNotaFinal só avança quando há nota, e nesses semestres já não
 * entra nota nenhuma.
 *
 * Fecha "tudo o que já passou" (§decisão do cliente):
 *   • todos os semestres de anos letivos ANTERIORES ao corrente;
 *   • o 1º semestre do ano corrente, se o sistema já estiver no 2º.
 *   • NUNCA o semestre que está mesmo a decorrer.
 *
 * A lógica de cascata abaixo é uma CÓPIA FIEL de src/lib/fecho-semestre.ts — não pode ser
 * importada porque esse ficheiro começa com `import "server-only"`, que um `tsx` puro fora do
 * Next não resolve (mesmo motivo documentado em backfill-inscricoes-e-propinas.ts). Se a regra
 * mudar lá, atualizar aqui também.
 *
 * Idempotente: createMany(skipDuplicates) nunca duplica uma Nota já existente, e uma cadeira já
 * decidida não tem época pendente, por isso não é tocada. Nunca apaga nada.
 *
 * Usage:
 *   npx tsx scripts/fechar-semestres-passados.ts            # relatório, NÃO grava nada
 *   npx tsx scripts/fechar-semestres-passados.ts --aplicar  # grava
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient, type Epoca } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  calcularNotaFinal,
  extrairNotasPorEpoca,
  proximaEpocaPendente,
  EPOCA_PARA_CHAVE_NOTAS,
  type NotasCadeira,
} from "../src/lib/avaliacao";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");

interface AlvoFecho {
  anoLetivo: number;
  semestre: number;
}

/** Réplica de fecharSemestre + contarFechoSemestre numa só passagem, para poder relatar antes de gravar. */
async function analisarSemestre(anoLetivo: number, semestre: number) {
  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { semestre, turma: { anoLetivo } },
    select: {
      avaliacoes: { select: { id: true, epoca: true } },
      disciplina: { select: { nome: true } },
      inscricoes: {
        where: { ativa: true },
        select: {
          id: true,
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: true,
          aluno: { select: { nome: true, numeroEstudante: true } },
          notas: { select: { valor: true, avaliacao: { select: { epoca: true } } } },
        },
      },
    },
  });

  const novasNotas: { avaliacaoId: string; inscricaoCadeiraId: string; valor: number; automatica: boolean }[] = [];
  const porFechar: { aluno: string; disciplina: string; zeros: Epoca[] }[] = [];
  const semAvaliacao: { aluno: string; disciplina: string; epocaEmFalta: Epoca }[] = [];

  for (const turmaDisciplina of turmaDisciplinas) {
    const avaliacaoPorEpoca = new Map(turmaDisciplina.avaliacoes.map((a) => [a.epoca, a]));

    for (const inscricao of turmaDisciplina.inscricoes) {
      let notasCadeira: NotasCadeira = extrairNotasPorEpoca(
        inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })),
      );
      const zeros: Epoca[] = [];

      for (let seguranca = 0; seguranca < 5; seguranca += 1) {
        const resultado = calcularNotaFinal(notasCadeira, {
          permiteDispensa: inscricao.permiteDispensaAplicada,
          notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
        });
        const proxima: Epoca | null = proximaEpocaPendente(notasCadeira, resultado.estado);
        if (!proxima) break;

        const avaliacao = avaliacaoPorEpoca.get(proxima);
        if (!avaliacao) {
          // Sem Avaliacao não há onde gravar a Nota — a cadeira fica por fechar, e é reportada
          // para alguém agendar a prova em falta em vez de o problema passar despercebido.
          if (zeros.length === 0) {
            semAvaliacao.push({
              aluno: `${inscricao.aluno.nome} (${inscricao.aluno.numeroEstudante})`,
              disciplina: turmaDisciplina.disciplina.nome,
              epocaEmFalta: proxima,
            });
          }
          break;
        }

        novasNotas.push({ avaliacaoId: avaliacao.id, inscricaoCadeiraId: inscricao.id, valor: 0, automatica: true });
        zeros.push(proxima);
        notasCadeira = { ...notasCadeira, [EPOCA_PARA_CHAVE_NOTAS[proxima]]: 0 };
      }

      if (zeros.length > 0) {
        porFechar.push({
          aluno: `${inscricao.aluno.nome} (${inscricao.aluno.numeroEstudante})`,
          disciplina: turmaDisciplina.disciplina.nome,
          zeros,
        });
      }
    }
  }

  return { novasNotas, porFechar, semAvaliacao };
}

async function main() {
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!config) {
    console.error("Sem ConfiguracaoAcademica — nada a fazer.");
    return;
  }

  const semestreAtual = config.semestreAtual === 2 ? 2 : 1;
  // O ano letivo corrente sai da configuração, não do ano civil (ver anoLetivoCorrente em
  // src/lib/academico.ts): em fevereiro ainda se está no ano letivo que começou em outubro.
  const anoLetivoCorrente = config.anoLetivoInicio ? config.anoLetivoInicio.getFullYear() : null;

  const anosComTurmas = await prisma.turma.findMany({
    distinct: ["anoLetivo"],
    select: { anoLetivo: true },
    orderBy: { anoLetivo: "asc" },
  });

  // "Tudo o que já passou": anos anteriores por inteiro, e no ano corrente só o 1º semestre — e
  // apenas se o sistema já tiver avançado para o 2º. O semestre a decorrer nunca é tocado.
  const alvos: AlvoFecho[] = [];
  for (const { anoLetivo } of anosComTurmas) {
    if (anoLetivoCorrente === null || anoLetivo < anoLetivoCorrente) {
      alvos.push({ anoLetivo, semestre: 1 }, { anoLetivo, semestre: 2 });
    } else if (anoLetivo === anoLetivoCorrente && semestreAtual === 2) {
      alvos.push({ anoLetivo, semestre: 1 });
    }
  }

  console.log(`Ano letivo corrente: ${anoLetivoCorrente ?? "(por configurar)"} · semestre ${semestreAtual}`);
  console.log(`Modo: ${APLICAR ? "APLICAR (vai gravar)" : "RELATÓRIO (não grava nada)"}`);
  console.log(`Semestres a fechar: ${alvos.map((a) => `${a.anoLetivo}/S${a.semestre}`).join(", ") || "(nenhum)"}\n`);

  let totalNotas = 0;
  let totalCadeiras = 0;
  let totalSemAvaliacao = 0;

  for (const alvo of alvos) {
    const { novasNotas, porFechar, semAvaliacao } = await analisarSemestre(alvo.anoLetivo, alvo.semestre);
    if (porFechar.length === 0 && semAvaliacao.length === 0) continue;

    console.log(`── ${alvo.anoLetivo}/${alvo.anoLetivo + 1} · ${alvo.semestre}º semestre ──`);
    for (const linha of porFechar) {
      console.log(`   ${linha.aluno} · ${linha.disciplina} → 0 em ${linha.zeros.join(", ")}`);
    }
    for (const linha of semAvaliacao) {
      console.log(`   [POR FECHAR] ${linha.aluno} · ${linha.disciplina} — ${linha.epocaEmFalta} nunca foi agendada`);
    }
    console.log("");

    totalCadeiras += porFechar.length;
    totalSemAvaliacao += semAvaliacao.length;

    if (APLICAR && novasNotas.length > 0) {
      const gravadas = await prisma.nota.createMany({ data: novasNotas, skipDuplicates: true });
      totalNotas += gravadas.count;
    } else {
      totalNotas += novasNotas.length;
    }
  }

  console.log("─".repeat(60));
  console.log(`Cadeiras fechadas:  ${totalCadeiras}`);
  console.log(`Notas 0 atribuídas: ${totalNotas}`);
  if (totalSemAvaliacao > 0) {
    console.log(`ATENÇÃO — por fechar: ${totalSemAvaliacao} (época em falta nunca agendada; agende a prova primeiro)`);
  }
  if (!APLICAR) {
    console.log("\nNada foi gravado. Para aplicar: npx tsx scripts/fechar-semestres-passados.ts --aplicar");
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
