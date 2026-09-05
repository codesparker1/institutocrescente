import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { PERIODO_LABEL, formatAnoLetivo } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";

export default async function ProfessorDisciplinasPage() {
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  // Um professor pode lecionar a mesma disciplina/ano em turmas de anos letivos diferentes (ex.:
  // turmas pré-criadas para o ano seguinte na rematrícula, Fase 8b), e as disciplinas do 2º
  // semestre já existem na BD antes de o DAAC "abrir" o semestre. "Minhas Disciplinas" é só o
  // ano letivo e o semestre correntes — o resto (anos anteriores, semestre ainda não aberto)
  // torna-se histórico/futuro, consultável pelo DAAC/Admin/Secretaria, não trabalho do dia a dia
  // do professor.
  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  // Do intervalo configurado, não do ano civil: a meio do ano letivo o ano civil vira e a lista
  // ficava vazia, como se o professor não leccionasse nada.
  const anoLetivo = anoLetivoCorrente(agora, config);
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  // Default false quando não há config, como em TurmaGradebook: config ausente é anomalia, e o
  // modo de falha seguro é prometer menos, não mais.
  const lancamentoAberto = config?.lancamentoNotasAberto ?? false;
  // "Alunos" tem de contar o roster real da disciplina (InscricaoCadeira ativa, §4.2) — não
  // turma._count.matriculas, que só conta quem está matriculado NESTA turma/coorte. Um repetente
  // aparece na pauta desta disciplina através de InscricaoCadeira mesmo com a Matricula noutra
  // turma (ano diferente), e ficava de fora desta contagem.
  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where:
      anoLetivo === null
        ? { id: "" } // sem ano letivo a decorrer não há trabalho do dia a dia — explicado no ecrã
        : {
            professorId: session.user.professorId,
            turma: { anoLetivo },
            // A monografia dura o ano inteiro (§pedido do cliente 2026-09-05) — não fica escondida
            // quando o semestre corrente não coincide com o que ficou gravado na CadeiraCurricular
            // dela (sempre 1, arbitrário, ver createCadeiraCurricularAction).
            OR: [{ semestre: semestreAtual }, { cadeiraCurricular: { eMonografia: true } }],
          },
    include: { disciplina: true, turma: { include: { curso: true } }, _count: { select: { inscricoes: { where: { ativa: true } } } } },
    orderBy: [{ turma: { anoCurricular: "asc" } }, { disciplina: { nome: "asc" } }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Minhas Disciplinas</h1>
        {/* A frase prometia "lançar notas" mesmo com a janela de lançamento fechada — o professor
            abria uma pauta atrás da outra até perceber. Diz o que é possível agora. */}
        <p className="text-sm text-texto-suave">
          Selecione uma disciplina para {lancamentoAberto ? "lançar notas e frequência" : "marcar frequência"}.
        </p>
      </div>

      {!lancamentoAberto && turmaDisciplinas.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          O lançamento de notas está fechado neste momento — é o DAAC que o abre e fecha. Pode consultar as pautas e
          marcar presenças; para lançar ou corrigir uma nota, peça ao DAAC.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Disciplinas atribuídas"
          subtitle={
            anoLetivo !== null
              ? `${turmaDisciplinas.length} disciplina(s) · Ano letivo ${formatAnoLetivo(anoLetivo)} · ${semestreAtual}º Semestre`
              : "Sem ano letivo a decorrer"
          }
        />
        {turmaDisciplinas.length === 0 ? (
          <EmptyState
            message={
              anoLetivo === null
                ? "Não há nenhum ano letivo a decorrer. Isto é normal entre anos letivos — se achar que é engano, fale com o DAAC."
                : `Ainda não tem disciplinas atribuídas no ${semestreAtual}º semestre. É o DAAC que faz a atribuição — fale com o DAAC se está à espera de leccionar.`
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Disciplina</Th>
                <Th>Curso</Th>
                <Th>Ano</Th>
                <Th>Período</Th>
                <Th>Alunos</Th>
              </tr>
            </Thead>
            <Tbody>
              {turmaDisciplinas.map((td) => (
                <Tr key={td.id}>
                  <Td>
                    <Link href={`/professor/${td.id}`} className="font-medium text-texto hover:text-navy-600">
                      {td.disciplina.nome}
                    </Link>
                  </Td>
                  <Td>{td.turma.curso.nome}</Td>
                  <Td>
                    <Badge tone="neutral">{td.turma.anoCurricular}º Ano</Badge>
                  </Td>
                  <Td>{PERIODO_LABEL[td.turma.periodo]}</Td>
                  <Td>{td._count.inscricoes}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
