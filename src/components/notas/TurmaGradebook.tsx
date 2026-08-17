import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Table";
import { GradebookEditor } from "./GradebookEditor";
import { AttendanceChip } from "./AttendanceChip";
import { CreateAulaForm } from "./CreateAulaForm";
import { DIA_SEMANA_LABEL, diaSemanaHoje, formatDate, PERIODO_LABEL, proximasDatasValidas, toIsoDate } from "@/lib/utils";
import { EPOCA_ORDEM } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";

interface TurmaGradebookProps {
  turmaDisciplinaId: string;
  backHref: string;
  editable: boolean;
  /** DAAC ignora sempre o prazo de lançamento (§4.3) — false para a página do professor. */
  podeIgnorarPrazo?: boolean;
}

export async function TurmaGradebook({ turmaDisciplinaId, backHref, editable, podeIgnorarPrazo = false }: TurmaGradebookProps) {
  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: turmaDisciplinaId },
    include: {
      disciplina: true,
      professor: true,
      turma: { include: { curso: true } },
      avaliacoes: true,
      horarioSlots: true,
      inscricoes: { where: { ativa: true }, include: { aluno: true }, orderBy: { aluno: { nome: "asc" } } },
      aulas: {
        orderBy: { data: "desc" },
        include: {
          frequencias: {
            include: { inscricaoCadeira: { include: { aluno: true } } },
            orderBy: { inscricaoCadeira: { aluno: { nome: "asc" } } },
          },
        },
      },
    },
  });

  if (!turmaDisciplina) notFound();

  const avaliacaoPorEpoca = new Map(turmaDisciplina.avaliacoes.map((a) => [a.epoca, a]));

  const notas = await prisma.nota.findMany({
    where: { avaliacao: { turmaDisciplinaId } },
    include: { avaliacao: { select: { epoca: true } } },
  });
  const notasPorInscricao = new Map<string, { epoca: (typeof notas)[number]["avaliacao"]["epoca"]; valor: number; automatica: boolean }[]>();
  for (const nota of notas) {
    const lista = notasPorInscricao.get(nota.inscricaoCadeiraId) ?? [];
    lista.push({ epoca: nota.avaliacao.epoca, valor: Number(nota.valor), automatica: nota.automatica });
    notasPorInscricao.set(nota.inscricaoCadeiraId, lista);
  }

  const agora = getAgora();
  const inscricoes = turmaDisciplina.inscricoes;
  const diasLetivos = [...new Set(turmaDisciplina.horarioSlots.map((s) => s.diaSemana))];
  const datasValidas = proximasDatasValidas(diasLetivos, 8, agora);
  const hoje = diaSemanaHoje(agora);
  const hojeEhDiaDeAula = (diasLetivos as string[]).includes(hoje);
  const hojeIsoValor = toIsoDate(agora);
  const proximoDiaLabel = datasValidas.find((d) => d.iso !== hojeIsoValor)?.label ?? datasValidas[0]?.label ?? null;
  const aulaDeHojeJaExiste = turmaDisciplina.aulas.some((a) => toIsoDate(a.data) === hojeIsoValor);

  // As 5 colunas mostram-se sempre, mesmo antes de Recurso/Exame Especial terem sido formalmente
  // agendados em Horário e Provas — sem Avaliacao ainda, a coluna não tem prazo (nunca desativada
  // por prazo), a Avaliacao nasce sozinha na primeira nota lançada (lancarNotasEmLoteAction).
  const avaliacoesParaEditor = EPOCA_ORDEM.map((epoca) => {
    const avaliacao = avaliacaoPorEpoca.get(epoca);
    return {
      epoca,
      disabled: Boolean(avaliacao && !podeIgnorarPrazo && avaliacao.prazoLancamento < agora),
    };
  });
  const inscricoesParaEditor = inscricoes.map((inscricao) => ({
    id: inscricao.id,
    alunoNome: inscricao.aluno.nome,
    tentativa: inscricao.tentativa,
    permiteDispensaAplicada: inscricao.permiteDispensaAplicada,
    notaMinimaDispensaAplicada: Number(inscricao.notaMinimaDispensaAplicada),
    notas: notasPorInscricao.get(inscricao.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">{turmaDisciplina.disciplina.nome}</h1>
        <p className="text-sm text-navy-400">
          {turmaDisciplina.turma.curso.nome} · {turmaDisciplina.turma.anoCurricular}º Ano ·{" "}
          {PERIODO_LABEL[turmaDisciplina.turma.periodo]} · {turmaDisciplina.semestre}º Semestre ·{" "}
          {turmaDisciplina.professor.nome}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Pauta de notas"
          subtitle={editable ? "Edite as notas e clique em Guardar alterações" : "Modo de visualização"}
          action={
            <a
              href={`/api/pauta/${turmaDisciplina.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-navy-400 hover:bg-navy-50 hover:text-navy-700"
              aria-label="Imprimir pauta"
              title="Imprimir pauta"
            >
              <Printer size={14} />
              Imprimir
            </a>
          }
        />
        {inscricoes.length === 0 ? (
          <EmptyState message="Sem alunos inscritos nesta disciplina." />
        ) : (
          <CardBody>
            <GradebookEditor
              turmaDisciplinaId={turmaDisciplina.id}
              avaliacoes={avaliacoesParaEditor}
              inscricoes={inscricoesParaEditor}
              editable={editable}
            />
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title="Frequência" subtitle="Clique no nome do aluno para marcar/desmarcar presença" />
        <CardBody className="flex flex-col gap-4">
          {turmaDisciplina.aulas.length === 0 ? (
            <EmptyState message="Sem aulas registadas." />
          ) : (
            turmaDisciplina.aulas.map((aula) => {
              const ativas = aula.frequencias.filter((f) => f.inscricaoCadeira.ativa);
              const presentes = ativas.filter((f) => f.presente).length;
              const inativasComRegisto = aula.frequencias.length - ativas.length;
              return (
                <div key={aula.id} className="rounded-lg border border-navy-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-navy-700">
                      {formatDate(aula.data)} {aula.tema ? `· ${aula.tema}` : ""}
                    </span>
                    <span className="text-xs text-navy-400">
                      {presentes}/{ativas.length} presentes
                      {inativasComRegisto > 0 ? ` · ${inativasComRegisto} inativo(s)` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aula.frequencias.map((freq) => (
                      <AttendanceChip
                        key={freq.id}
                        frequenciaId={freq.id}
                        nome={freq.inscricaoCadeira.aluno.nome}
                        presenteInicial={freq.presente}
                        disabled={!editable}
                        inativa={!freq.inscricaoCadeira.ativa}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {editable ? (
            datasValidas.length === 0 ? (
              <p className="border-t border-navy-50 pt-4 text-xs text-navy-400">
                Defina o horário semanal desta disciplina em Horário e Provas antes de adicionar aulas.
              </p>
            ) : !hojeEhDiaDeAula ? (
              <p className="border-t border-navy-50 pt-4 text-xs font-medium text-gold-700">
                Hoje ({DIA_SEMANA_LABEL[hoje]}) não é dia de aula desta disciplina.
                {proximoDiaLabel ? ` Aguarde o próximo dia de aula: ${proximoDiaLabel}.` : ""}
              </p>
            ) : aulaDeHojeJaExiste ? (
              <p className="border-t border-navy-50 pt-4 text-xs text-navy-400">A aula de hoje já foi registada abaixo.</p>
            ) : (
              <div className="flex flex-col gap-3 border-t border-navy-50 pt-4">
                <p className="text-xs font-medium text-emerald-700">Hoje ({DIA_SEMANA_LABEL[hoje]}) é dia de aula desta disciplina.</p>
                <CreateAulaForm
                  turmaDisciplinaId={turmaDisciplina.id}
                  dataIso={hojeIsoValor}
                  dataLabel={formatDate(agora)}
                />
              </div>
            )
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
