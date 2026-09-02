import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";
import { formatAnoLetivo } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";

interface ProfessorGradebookPageProps {
  params: Promise<{ turmaDisciplinaId: string }>;
}

export default async function ProfessorGradebookPage({ params }: ProfessorGradebookPageProps) {
  const { turmaDisciplinaId } = await params;
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const [turmaDisciplina, config] = await Promise.all([
    prisma.turmaDisciplina.findUnique({ where: { id: turmaDisciplinaId }, include: { turma: true } }),
    prisma.configuracaoAcademica.findUnique({ where: { id: "config" } }),
  ]);
  if (!turmaDisciplina || turmaDisciplina.professorId !== session.user.professorId) redirect("/professor");

  // Um ano letivo passado é registo histórico, e um semestre ainda não aberto pelo DAAC ainda não
  // começou — em ambos os casos só o DAAC (podeIgnorarJanela, via /notas) edita; o professor pode
  // continuar a consultar, mas não a editar.
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  const agora = await getAgora();
  // anoLetivoCorrente, não agora.getFullYear(): comparar com o ano civil tornava a pauta só de
  // leitura a meio do ano letivo (em Fevereiro de 2027, turma.anoLetivo 2026 !== 2027) — o
  // professor abria a pauta e encontrava os campos mortos, sem nada a dizer porquê.
  const anoLetivo = anoLetivoCorrente(agora, config);
  const doAnoCorrente = anoLetivo !== null && turmaDisciplina.turma.anoLetivo === anoLetivo;
  const doSemestreCorrente = turmaDisciplina.semestre === semestreAtual;
  const editable = doAnoCorrente && doSemestreCorrente;

  // A janela global do DAAC (§decisão do cliente 2026-09-02) é um motivo à parte, e NÃO entra em
  // `editable`: o que ela fecha são as células de nota (TurmaGradebook/motivoLancamentoFechado). A
  // marcação de presenças e o registo de aulas continuam — acontecem no dia da aula e nada têm a ver
  // com pautas (decisão explícita do cliente: "só as notas são bloqueadas").
  const lancamentoAberto = config?.lancamentoNotasAberto ?? false;

  // Uma pauta cinzenta sem explicação parece uma avaria. Dizer porquê e a quem falar transforma um
  // beco sem saída num passo seguinte.
  const motivoSoLeitura = !editable
    ? !doAnoCorrente
      ? `Esta turma é do ano letivo ${formatAnoLetivo(turmaDisciplina.turma.anoLetivo)}, que já não está a decorrer. A pauta fica em consulta — para corrigir uma nota, peça ao DAAC.`
      : `Esta disciplina é do ${turmaDisciplina.semestre}º semestre e está a decorrer o ${semestreAtual}º. A pauta fica em consulta — para lançar ou corrigir notas fora do semestre, peça ao DAAC.`
    : !lancamentoAberto
      ? "O lançamento de notas está fechado neste momento — é o DAAC que o abre e fecha. Pode consultar a pauta e marcar presenças; para lançar ou corrigir uma nota agora, peça ao DAAC."
      : null;

  return (
    <div className="flex flex-col gap-4">
      {motivoSoLeitura ? (
        <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">{motivoSoLeitura}</p>
      ) : null}
      <TurmaGradebook turmaDisciplinaId={turmaDisciplinaId} backHref="/professor" editable={editable} />
    </div>
  );
}
