import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { AvisoNotasBloqueadas } from "@/components/financeiro/AvisoNotasBloqueadas";
import { verificarBloqueioAluno } from "@/lib/financeiro";
import { calcularNotaFinal, extrairNotasPorEpoca, EPOCA_LABEL, ESTADO_LABEL, type EstadoAvaliacao } from "@/lib/avaliacao";

const ESTADO_TONE: Record<EstadoAvaliacao, "success" | "warning" | "danger" | "neutral"> = {
  EM_CURSO: "neutral",
  DISPENSADO: "success",
  ADMITIDO_A_EXAME: "warning",
  EM_RECURSO: "warning",
  EM_EXAME_ESPECIAL: "warning",
  APROVADO: "success",
  REPROVADO: "danger",
};

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
  const [aluno, inscricoes] = await Promise.all([
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
  ]);

  function calcularEstado(inscricao: (typeof inscricoes)[number]) {
    const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    return calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    });
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
                    <CardHeader title={`${semestre}º Semestre`} subtitle={`${inscricoesSemestre.length} disciplina(s)`} />
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Disciplina</Th>
                          <Th>Notas</Th>
                          <Th>Estado</Th>
                          <Th>Nota Final</Th>
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
                              <Td>
                                {inscricao.turmaDisciplina.avaliacoes.length === 0 ? (
                                  "—"
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {inscricao.turmaDisciplina.avaliacoes.map((av) => {
                                      const nota = inscricao.notas.find((n) => n.avaliacaoId === av.id);
                                      return (
                                        <Badge
                                          key={av.id}
                                          tone={nota?.automatica ? "danger" : nota ? "info" : "neutral"}
                                          title={nota?.automatica ? "0 automático — prazo de lançamento expirado sem nota entregue" : undefined}
                                        >
                                          {EPOCA_LABEL[av.epoca]}: {nota ? Number(nota.valor) : "—"}
                                          {nota?.automatica ? " (falta)" : ""}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                )}
                              </Td>
                              <Td>
                                <Badge tone={ESTADO_TONE[resultado.estado]}>{ESTADO_LABEL[resultado.estado]}</Badge>
                              </Td>
                              <Td className="font-semibold text-navy-900">{resultado.notaFinal !== null ? resultado.notaFinal.toFixed(1) : "—"}</Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
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
