import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { AvisoNotasBloqueadas } from "@/components/financeiro/AvisoNotasBloqueadas";
import { verificarBloqueioAluno } from "@/lib/financeiro";
import { calcularNotaFinal, extrairNotasPorEpoca, ESTADO_LABEL, type EstadoAvaliacao } from "@/lib/avaliacao";
import type { Epoca } from "@/generated/prisma/client";

const ESTADO_TONE: Record<EstadoAvaliacao, "success" | "warning" | "danger" | "neutral"> = {
  EM_CURSO: "neutral",
  DISPENSADO: "success",
  ADMITIDO_A_EXAME: "warning",
  EM_RECURSO: "warning",
  EM_EXAME_ESPECIAL: "warning",
  APROVADO: "success",
  REPROVADO: "danger",
};

/** Uma coluna por época, na ordem da cascata — a leitura em linha segue o percurso da cadeira. */
const COLUNAS_EPOCA: { epoca: Epoca; label: string }[] = [
  { epoca: "P1", label: "P1" },
  { epoca: "P2", label: "P2" },
  { epoca: "EXAME", label: "Exame" },
  { epoca: "RECURSO", label: "Recurso" },
  { epoca: "EXAME_ESPECIAL", label: "Ex. Especial" },
];

/**
 * Célula de nota. Vazia quando a época não se aplica à cadeira, "—" quando está agendada mas ainda
 * sem nota, e a vermelho quando é um 0 automático por prazo expirado (o aluno tem de perceber que
 * aquele zero não foi uma prova feita).
 */
function CelulaNota({ nota }: { nota: { valor: number | null; automatica: boolean } | null }) {
  if (!nota) return <Td className="text-center text-navy-200">{""}</Td>;
  if (nota.valor === null) return <Td className="text-center text-navy-300">—</Td>;
  return (
    <Td className={`text-center font-medium ${nota.automatica ? "text-red-600" : "text-navy-800"}`}>
      <span title={nota.automatica ? "0 automático — prazo de lançamento expirado sem nota entregue" : undefined}>
        {nota.valor.toFixed(1)}
        {nota.automatica ? "*" : ""}
      </span>
    </Td>
  );
}

export default async function MinhasNotasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const bloqueio = await verificarBloqueioAluno(session.user.alunoId);
  if (bloqueio.bloqueado) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Minhas Notas</h1>
          <p className="text-sm text-navy-400">As suas notas, organizadas por ano do curso e semestre.</p>
        </div>
        <AvisoNotasBloqueadas saldoEmDivida={bloqueio.saldoEmDivida} />
      </div>
    );
  }

  // Por InscricaoCadeira, não por Matricula — cobre repetentes, cujas cadeiras podem estar
  // ligadas a uma Turma de um ano anterior ao ano curricular atual do aluno (§4.2). Inclui
  // tentativas inativas (histórico académico, Fase 8) — antes só a ativa era visível ao aluno,
  // e uma tentativa reprovada desaparecia assim que a repetição era criada.
  // As notas do aluno mostram-se SEMPRE todas, agrupadas por semestre em cartões separados: são o
  // seu histórico académico, e esconder o 1º semestre quando o 2º começa tirava-lhe as notas que já
  // tem. O semestre a decorrer fica assinalado, que é o que evita a confusão (§pedido do cliente
  // 2026-08-29) sem esconder nada.
  const [aluno, inscricoes, configAcademica] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: session.user.alunoId }, select: { curso: true, anoCurricular: true } }),
    prisma.inscricaoCadeira.findMany({
      where: { alunoId: session.user.alunoId },
      include: {
        turmaDisciplina: {
          include: {
            disciplina: true,
            turma: { include: { curso: true } },
            avaliacoes: { orderBy: { data: "asc" } },
          },
        },
        notas: { include: { avaliacao: true } },
      },
      orderBy: [{ turmaDisciplina: { disciplina: { nome: "asc" } } }, { tentativa: "asc" }],
    }),
    prisma.configuracaoAcademica.findUnique({ where: { id: "config" }, select: { semestreAtual: true } }),
  ]);
  const semestreAtual = configAcademica?.semestreAtual === 2 ? 2 : 1;

  function calcularEstado(inscricao: (typeof inscricoes)[number]) {
    const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    return calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    });
  }

  /**
   * A nota de uma época, para a sua própria coluna. Distingue três casos que a leitura em coluna
   * torna importantes: nota lançada, época agendada mas ainda sem nota ("—"), e época que nem
   * sequer se aplica a esta cadeira (fica vazia, não "—", para a linha não sugerir que falta algo).
   */
  function notaDaEpoca(inscricao: (typeof inscricoes)[number], epoca: Epoca) {
    const nota = inscricao.notas.find((n) => n.avaliacao.epoca === epoca);
    if (nota) return { valor: Number(nota.valor), automatica: nota.automatica };
    const agendada = inscricao.turmaDisciplina.avaliacoes.some((av) => av.epoca === epoca);
    return agendada ? { valor: null, automatica: false } : null;
  }

  const grupos = new Map<string, { label: string; inscricoesPorSemestre: Map<number, typeof inscricoes> }>();
  for (const inscricao of inscricoes) {
    const turma = inscricao.turmaDisciplina.turma;
    const chave = turma.id;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        label: `${turma.curso.nome} · ${turma.anoCurricular}º Ano`,
        inscricoesPorSemestre: new Map(),
      });
    }
    const grupo = grupos.get(chave)!;
    const semestre = inscricao.turmaDisciplina.semestre;
    const lista = grupo.inscricoesPorSemestre.get(semestre) ?? [];
    lista.push(inscricao);
    grupo.inscricoesPorSemestre.set(semestre, lista);
  }

  // Pré-visualização do currículo do ano atual do aluno (§pedido do cliente 2026-08-18) — só
  // aparece enquanto NÃO houver nenhuma InscricaoCadeira para o seu ano curricular/curso atuais
  // (turmas ainda não criadas pelo DAAC para o novo ano letivo, típico logo a seguir a uma
  // matrícula/rematrícula). Lê diretamente CadeiraCurricular, sem TurmaDisciplina nem professor —
  // é só "que disciplinas correspondem ao meu ano", não uma inscrição real.
  const jaTemTurmaNoAnoAtual = inscricoes.some(
    (i) => i.turmaDisciplina.turma.anoCurricular === aluno?.anoCurricular && i.turmaDisciplina.turma.curso.nome === aluno?.curso,
  );
  const previewCurriculo =
    aluno && !jaTemTurmaNoAnoAtual
      ? await prisma.cadeiraCurricular.findMany({
          where: { curso: { nome: aluno.curso }, anoCurricular: aluno.anoCurricular },
          include: { disciplina: true },
          orderBy: [{ semestre: "asc" }, { disciplina: { nome: "asc" } }],
        })
      : [];
  const previewPorSemestre = new Map<number, typeof previewCurriculo>();
  for (const cadeira of previewCurriculo) {
    const lista = previewPorSemestre.get(cadeira.semestre) ?? [];
    lista.push(cadeira);
    previewPorSemestre.set(cadeira.semestre, lista);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Notas</h1>
        <p className="text-sm text-navy-400">As suas notas, organizadas por ano do curso e semestre.</p>
      </div>

      {previewPorSemestre.size > 0 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
            {aluno!.curso} · {aluno!.anoCurricular}º Ano (previsão — turma ainda por criar)
          </h2>
          {[...previewPorSemestre.keys()]
            .sort((a, b) => a - b)
            .map((semestre) => {
              const cadeiras = previewPorSemestre.get(semestre)!;
              return (
                <Card key={semestre}>
                  <CardHeader title={`${semestre}º Semestre`} subtitle={`${cadeiras.length} disciplina(s)`} />
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Disciplina</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {cadeiras.map((cadeira) => (
                        <Tr key={cadeira.id}>
                          <Td className="font-medium text-navy-900">{cadeira.disciplina.nome}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Card>
              );
            })}
        </div>
      ) : null}

      {grupos.size === 0 && previewPorSemestre.size === 0 ? (
        <EmptyState message="Sem cadeiras inscritas." />
      ) : (
        [...grupos.values()].map((grupo) => {
          const semestres = [...grupo.inscricoesPorSemestre.keys()].sort((a, b) => a - b);
          return (
            <div key={grupo.label} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">{grupo.label}</h2>

              {semestres.map((semestre) => {
                const inscricoesSemestre = grupo.inscricoesPorSemestre.get(semestre)!;
                return (
                  <Card key={semestre}>
                    <CardHeader
                      title={`${semestre}º Semestre${semestre === semestreAtual ? " · a decorrer" : ""}`}
                      subtitle={`${inscricoesSemestre.length} disciplina(s)`}
                    />
                    {/* Uma coluna por época (§pedido do cliente 2026-08-31): a leitura fica em
                        linha, como numa pauta, em vez de badges empilhados numa só célula. Rola na
                        horizontal em ecrã estreito — as colunas não encolhem até ficarem ilegíveis. */}
                    <div className="overflow-x-auto">
                      <Table>
                        <Thead>
                          <tr>
                            <Th>Disciplina</Th>
                            {COLUNAS_EPOCA.map((coluna) => (
                              <Th key={coluna.epoca} className="text-center">
                                {coluna.label}
                              </Th>
                            ))}
                            <Th className="text-center">Média</Th>
                            <Th>Situação</Th>
                            <Th className="text-center">Nota Final</Th>
                          </tr>
                        </Thead>
                        <Tbody>
                          {inscricoesSemestre.map((inscricao) => {
                            const resultado = calcularEstado(inscricao);
                            return (
                              <Tr key={inscricao.id} className={!inscricao.ativa ? "opacity-60" : undefined}>
                                <Td className="font-medium text-navy-900">
                                  {inscricao.turmaDisciplina.disciplina.nome}
                                  {inscricao.tentativa > 1 ? (
                                    <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                                      {inscricao.tentativa}ª tentativa
                                    </span>
                                  ) : null}
                                  {!inscricao.ativa ? (
                                    <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-400">
                                      Histórico
                                    </span>
                                  ) : null}
                                  {inscricao.creditada ? (
                                    <span
                                      className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                                      title={inscricao.instituicaoOrigemCreditado ? `Creditado — ${inscricao.instituicaoOrigemCreditado}` : "Creditado de outra instituição"}
                                    >
                                      Creditado
                                    </span>
                                  ) : null}
                                </Td>
                                {COLUNAS_EPOCA.map((coluna) => (
                                  <CelulaNota key={coluna.epoca} nota={notaDaEpoca(inscricao, coluna.epoca)} />
                                ))}
                                {/* Média de frequência (P1+P2)/2 — é dela que sai a dispensa, por
                                    isso fica ao lado das notas que a produzem, não no fim. */}
                                <Td className="text-center font-medium text-navy-800">
                                  {resultado.notaFrequencia !== null ? resultado.notaFrequencia.toFixed(1) : "—"}
                                </Td>
                                <Td>
                                  <Badge tone={ESTADO_TONE[resultado.estado]}>{ESTADO_LABEL[resultado.estado]}</Badge>
                                </Td>
                                <Td className="text-center font-semibold text-navy-900">
                                  {resultado.notaFinal !== null ? resultado.notaFinal.toFixed(1) : "—"}
                                </Td>
                              </Tr>
                            );
                          })}
                        </Tbody>
                      </Table>
                    </div>
                    {/* Legenda só quando há mesmo um zero automático — um asterisco sem explicação
                        não diz nada a quem o vê pela primeira vez. */}
                    {inscricoesSemestre.some((i) => i.notas.some((n) => n.automatica)) ? (
                      <p className="px-4 pb-3 text-xs text-navy-400">
                        <span className="text-red-600">*</span> Nota lançada automaticamente a 0 — o prazo de
                        lançamento expirou sem nota entregue.
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
