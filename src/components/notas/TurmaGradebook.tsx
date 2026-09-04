import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Table";
import { GradebookEditor } from "./GradebookEditor";
import { AttendanceChip } from "./AttendanceChip";
import { CreateAulaForm } from "./CreateAulaForm";
import { DIA_SEMANA_LABEL, diaSemanaHoje, formatDate, nomeProfessor, PERIODO_LABEL, proximasDatasValidas, toIsoDate } from "@/lib/utils";
import { EPOCA_DA_DEFESA, EPOCA_ORDEM, motivoLancamentoFechadoOuAusente } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";

interface TurmaGradebookProps {
  turmaDisciplinaId: string;
  backHref: string;
  editable: boolean;
  /** DAAC/ADMIN ignora sempre a janela de lançamento — false para a página do professor. */
  podeIgnorarJanela?: boolean;
  /**
   * Bloqueia SÓ as células de nota, deixando a frequência editável. Usado na monografia vista pelo
   * professor: a nota da defesa é do DAAC, mas as presenças continuam a ser dele (§cliente
   * 2026-09-04). Não usar `editable={false}` para isto — essa prop governa as duas coisas.
   */
  notasSoLeitura?: boolean;
  /**
   * Quando preenchido, a pauta só abre se esta TurmaDisciplina for mesmo deste professor — sem
   * isto, qualquer professor via a pauta de qualquer colega escrevendo o id no URL (as Server
   * Actions já recusavam a escrita, mas a leitura passava).
   */
  restringirAoProfessorId?: string | null;
}

export async function TurmaGradebook({
  turmaDisciplinaId,
  backHref,
  editable,
  podeIgnorarJanela = false,
  notasSoLeitura = false,
  restringirAoProfessorId = null,
}: TurmaGradebookProps) {
  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: turmaDisciplinaId },
    include: {
      disciplina: true,
      professor: true,
      turma: { include: { curso: true } },
      // A monografia é propriedade da cadeira do plano, não da inscrição — todos os alunos desta
      // TurmaDisciplina partilham a mesma CadeiraCurricular, logo ou é monografia para todos ou
      // para nenhum. As inscrições trazem a cópia congelada, para o cálculo.
      cadeiraCurricular: { select: { eMonografia: true } },
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
  // 404, não "acesso negado": não confirma sequer que a disciplina existe a quem não é dela.
  if (restringirAoProfessorId && turmaDisciplina.professorId !== restringirAoProfessorId) notFound();

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

  const agora = await getAgora();
  // Sem config (instalação nova) a janela conta como FECHADA — o contrário do default do schema,
  // e é deliberado: ausência de configuração é uma anomalia, não um convite a abrir tudo.
  const configAcademica = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { lancamentoNotasAberto: true },
  });
  const lancamentoAberto = configAcademica?.lancamentoNotasAberto ?? false;
  const inscricoes = turmaDisciplina.inscricoes;
  const diasLetivos = [...new Set(turmaDisciplina.horarioSlots.map((s) => s.diaSemana))];
  const datasValidas = proximasDatasValidas(diasLetivos, 8, agora);
  const hoje = diaSemanaHoje(agora);
  const hojeEhDiaDeAula = (diasLetivos as string[]).includes(hoje);
  const hojeIsoValor = toIsoDate(agora);
  const proximoDiaLabel = datasValidas.find((d) => d.iso !== hojeIsoValor)?.label ?? datasValidas[0]?.label ?? null;
  const aulaDeHojeJaExiste = turmaDisciplina.aulas.some((a) => toIsoDate(a.data) === hojeIsoValor);

  const eMonografia = turmaDisciplina.cadeiraCurricular.eMonografia;

  // As 5 colunas mostram-se sempre, mesmo antes de Recurso/Exame Especial terem sido formalmente
  // agendados em Horário e Provas — a Avaliacao nasce sozinha na primeira nota lançada
  // (lancarNotasEmLoteAction). Desde §2026-09-02 uma época sem Avaliacao também obedece à janela.
  //
  // Exceção: numa monografia há UMA coluna, a da defesa (§cliente 2026-09-04). Mostrar P1, P2,
  // Recurso e Especial convidaria a lançar notas que a cadeira não tem, e que o cálculo trata
  // como órfãs — quatro campos que só servem para enganar quem lança.
  const colunas = eMonografia ? [EPOCA_DA_DEFESA] : EPOCA_ORDEM;
  const avaliacoesParaEditor = colunas.map((epoca) => {
    const avaliacao = avaliacaoPorEpoca.get(epoca);
    // Duas condições: a janela global do DAAC (§2026-09-02) e a prova já realizada (§2026-08-28).
    // O DAAC/ADMIN (podeIgnorarJanela) continua sem limites — é o mecanismo de correção.
    const motivoFechado = podeIgnorarJanela
      ? null
      : motivoLancamentoFechadoOuAusente(avaliacao, agora, lancamentoAberto);
    return {
      epoca,
      disabled: motivoFechado !== null,
      motivoFechado,
      dataProva: avaliacao?.data ?? null,
    };
  });
  const inscricoesParaEditor = inscricoes.map((inscricao) => ({
    id: inscricao.id,
    alunoNome: inscricao.aluno.nome,
    tentativa: inscricao.tentativa,
    permiteDispensaAplicada: inscricao.permiteDispensaAplicada,
    notaMinimaDispensaAplicada: Number(inscricao.notaMinimaDispensaAplicada),
    eMonografiaAplicada: inscricao.eMonografiaAplicada,
    notas: notasPorInscricao.get(inscricao.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-texto hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar
        </Link>
        <h1 className="mt-2 text-xl font-bold text-texto">{turmaDisciplina.disciplina.nome}</h1>
        <p className="text-sm text-texto-suave">
          {turmaDisciplina.turma.curso.nome} · {turmaDisciplina.turma.anoCurricular}º Ano ·{" "}
          {PERIODO_LABEL[turmaDisciplina.turma.periodo]} · {turmaDisciplina.semestre}º Semestre ·{" "}
          {nomeProfessor(turmaDisciplina.professor)}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Pauta de notas"
          subtitle={editable && !notasSoLeitura ? "Edite as notas e clique em Guardar alterações" : "Modo de visualização"}
          action={
            <a
              href={`/api/pauta/${turmaDisciplina.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-texto-suave hover:bg-navy-50 hover:text-navy-700"
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
              editable={editable && !notasSoLeitura}
              eMonografia={eMonografia}
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
                    <span className="text-sm font-medium text-texto">
                      {formatDate(aula.data)} {aula.tema ? `· ${aula.tema}` : ""}
                    </span>
                    <span className="text-xs text-texto-suave">
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
              <p className="border-t border-navy-50 pt-4 text-xs text-texto-suave">
                Defina o horário semanal desta disciplina em Horário e Provas antes de adicionar aulas.
              </p>
            ) : !hojeEhDiaDeAula ? (
              <p className="border-t border-navy-50 pt-4 text-xs font-medium text-gold-700">
                Hoje ({DIA_SEMANA_LABEL[hoje]}) não é dia de aula desta disciplina.
                {proximoDiaLabel ? ` Aguarde o próximo dia de aula: ${proximoDiaLabel}.` : ""}
              </p>
            ) : aulaDeHojeJaExiste ? (
              <p className="border-t border-navy-50 pt-4 text-xs text-texto-suave">A aula de hoje já foi registada abaixo.</p>
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
