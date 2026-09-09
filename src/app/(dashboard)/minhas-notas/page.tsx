import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { AvisoNotasBloqueadas } from "@/components/financeiro/AvisoNotasBloqueadas";
import { verificarBloqueioAluno } from "@/lib/financeiro";
import { calcularNotaFinal, extrairNotasPorEpoca, rotuloEstado, toneEstado } from "@/lib/avaliacao";
import { CelulaNota, COLUNAS_EPOCA, notaDaEpoca } from "@/components/notas/ColunasNotas";
import { anoLetivoCorrente, inscricoesVisiveisAoAluno, semestreFechado } from "@/lib/academico";
import { formatAnoLetivo } from "@/lib/utils";
import { getAgora } from "@/lib/tempo";


export default async function MinhasNotasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const bloqueio = await verificarBloqueioAluno(session.user.alunoId);
  if (bloqueio.bloqueado) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-texto">Minhas Notas</h1>
          <p className="text-sm text-texto-suave">As suas notas, organizadas por ano do curso e semestre.</p>
        </div>
        <AvisoNotasBloqueadas
          saldoEmDivida={bloqueio.saldoEmDivida}
          saldoMultas={bloqueio.saldoMultas}
          saldoTotal={bloqueio.saldoTotal}
        />
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
    prisma.configuracaoAcademica.findUnique({ where: { id: "config" } }),
  ]);
  const semestreAtual = configAcademica?.semestreAtual === 2 ? 2 : 1;
  // Para distinguir um semestre a decorrer de um já fechado: num fechado, "Em curso"/"Em recurso"
  // mentem, porque não vai entrar mais nota nenhuma (ver rotuloEstado).
  const agora = await getAgora();
  const anoLetivoAtual = anoLetivoCorrente(agora, configAcademica);

  function calcularEstado(inscricao: (typeof inscricoes)[number]) {
    const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    return calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
      eMonografia: inscricao.eMonografiaAplicada,
    });
  }


  // Uma repetição superada substitui a reprovação do ano anterior, em vez de aparecerem as duas
  // (§pedido do cliente 2026-09-09). A regra vive em lib/academico.ts para o PDF de /api/historico
  // poder usar exatamente a mesma — se divergissem, o aluno imprimia uma folha diferente do que
  // acabou de ver no ecrã. A ficha do aluno (Gestão de Matrícula) continua a mostrar tudo: lá o
  // histórico completo é o registo académico de que o DAAC precisa.
  const inscricoesVisiveis = inscricoesVisiveisAoAluno(
    inscricoes.map((inscricao) => ({
      inscricao,
      disciplinaId: inscricao.turmaDisciplina.disciplinaId,
      tentativa: inscricao.tentativa,
      aprovado: calcularEstado(inscricao).aprovado,
    })),
  ).map((v) => v.inscricao);

  type GrupoTurma = { label: string; anoLetivo: number; inscricoesPorSemestre: Map<number, typeof inscricoes> };
  const grupos = new Map<string, GrupoTurma>();
  for (const inscricao of inscricoesVisiveis) {
    const turma = inscricao.turmaDisciplina.turma;
    const chave = turma.id;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        label: `${turma.curso.nome} · ${turma.anoCurricular}º Ano`,
        anoLetivo: turma.anoLetivo,
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
  // Os cartões passam a estar arrumados por ANO LETIVO, e não soltos por turma: é a unidade que o
  // aluno imprime (§pedido do cliente 2026-09-09) e a que ele usa para se orientar. Um repetente
  // pode ter duas turmas no mesmo ano letivo — daí a lista de grupos dentro de cada ano.
  const anosLetivos = new Map<number, GrupoTurma[]>();
  for (const grupo of grupos.values()) {
    const lista = anosLetivos.get(grupo.anoLetivo) ?? [];
    lista.push(grupo);
    anosLetivos.set(grupo.anoLetivo, lista);
  }
  const anosOrdenados = [...anosLetivos.keys()].sort((a, b) => b - a);

  const previewPorSemestre = new Map<number, typeof previewCurriculo>();
  for (const cadeira of previewCurriculo) {
    const lista = previewPorSemestre.get(cadeira.semestre) ?? [];
    lista.push(cadeira);
    previewPorSemestre.set(cadeira.semestre, lista);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Minhas Notas</h1>
        <p className="text-sm text-texto-suave">As suas notas, organizadas por ano do curso e semestre.</p>
      </div>

      {previewPorSemestre.size > 0 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-suave">
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
                          <Td className="font-medium text-texto">{cadeira.disciplina.nome}</Td>
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
        anosOrdenados.map((anoLetivo) => (
          <div key={anoLetivo} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 border-b border-navy-50 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-texto">{formatAnoLetivo(anoLetivo)}</h2>
              {/* target="_blank" como nas outras impressões do sistema (pauta, pauta de defesas):
                  abre o PDF ao lado, sem tirar o aluno da página onde estava a consultar. */}
              <Link
                href={`/api/historico?anoLetivo=${anoLetivo}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-texto-suave hover:bg-navy-50 hover:text-navy-700"
              >
                <Printer size={15} />
                Imprimir {formatAnoLetivo(anoLetivo)}
              </Link>
            </div>

            {anosLetivos.get(anoLetivo)!.map((grupo) => {
              const semestres = [...grupo.inscricoesPorSemestre.keys()].sort((a, b) => a - b);
              return (
                <div key={grupo.label} className="flex flex-col gap-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-suave">{grupo.label}</h2>

                  {semestres.map((semestre) => {
                    const inscricoesSemestre = grupo.inscricoesPorSemestre.get(semestre)!;
                    const fechado = semestreFechado(
                      { anoLetivo: grupo.anoLetivo, semestre },
                      { anoLetivo: anoLetivoAtual, semestreAtual },
                    );
                    return (
                      <Card key={semestre}>
                        <CardHeader
                          title={`${semestre}º Semestre${semestre === semestreAtual && !fechado ? " · a decorrer" : fechado ? " · encerrado" : ""}`}
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
                                    <Td className="font-medium text-texto">
                                      {inscricao.turmaDisciplina.disciplina.nome}
                                      {inscricao.tentativa > 1 ? (
                                        <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                                          {inscricao.tentativa}ª tentativa
                                        </span>
                                      ) : null}
                                      {!inscricao.ativa ? (
                                        <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-texto-suave">
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
                                    <Td className="text-center font-medium text-texto">
                                      {resultado.notaFrequencia !== null ? resultado.notaFrequencia.toFixed(1) : "—"}
                                    </Td>
                                    <Td>
                                      {/* Num semestre já encerrado "Em curso"/"Em recurso" mentiriam —
                                          não vai entrar mais nota nenhuma. Ver rotuloEstado. */}
                                      <Badge tone={toneEstado(resultado.estado, fechado)}>
                                        {rotuloEstado(resultado.estado, fechado)}
                                      </Badge>
                                    </Td>
                                    <Td className="text-center font-semibold text-texto">
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
                          <p className="px-4 pb-3 text-xs text-texto-suave">
                            <span className="text-red-600">*</span> Nota lançada automaticamente a 0 — o prazo de
                            lançamento expirou sem nota entregue.
                          </p>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
