import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Disclosure } from "@/components/ui/Disclosure";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { MultasPendentes } from "@/components/financeiro/MultasPendentes";
import { CategoriaEstudanteForm } from "@/components/alunos/CategoriaEstudanteForm";
import { RepeticaoForm } from "@/components/alunos/RepeticaoForm";
import { RematriculaForm } from "@/components/alunos/RematriculaForm";
import { MudarCursoForm } from "@/components/alunos/MudarCursoForm";
import { EditarNotaHistoricaForm } from "@/components/alunos/EditarNotaHistoricaForm";
import { CreditarCadeiraForm } from "@/components/alunos/CreditarCadeiraForm";
import { DocumentosAlunoCard } from "@/components/alunos/DocumentosAlunoCard";
import { DadosPessoaisAlunoForm } from "@/components/alunos/DadosPessoaisAlunoForm";
import { formatDate, formatCurrency, chaveMes, PERIODO_LABEL, formatAnoLetivo } from "@/lib/utils";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";
import { podeRegistarPagamento, podeGerirCurriculo, podeGerirDocumentos, podeGerirContas } from "@/lib/permissions";
import { EPOCA_LABEL, calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";
import type { AlunoStatus, CobrancaTipo } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
};

const COBRANCA_TIPO_LABEL: Record<CobrancaTipo, string> = {
  INSCRICAO: "Inscrição",
  CONFIRMACAO: "Confirmação",
  MATRICULA: "Matrícula",
  PROPINA: "Propina",
  MULTA: "Multa",
  EMOLUMENTO: "Emolumento",
};

interface AlunoDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AlunoDetailPage({ params }: AlunoDetailPageProps) {
  const { id } = await params;

  const aluno = await prisma.aluno.findUnique({
    where: { id },
    include: {
      matriculas: { include: { turma: { include: { curso: true } } } },
    },
  });

  if (!aluno) notFound();

  // Por InscricaoCadeira, não por Matricula — cobre cadeiras que o aluno frequenta noutra Turma
  // (repetição, §4.2). Inclui inativas para mostrar o histórico de tentativas.
  const inscricoes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId: aluno.id },
    include: {
      turmaDisciplina: { include: { disciplina: true, professor: true, turma: { include: { curso: true } } } },
      notas: { include: { avaliacao: true } },
    },
    orderBy: [{ ativa: "desc" }, { tentativa: "desc" }],
  });

  const session = await auth();
  const podeEditarCategoria = session?.user ? podeRegistarPagamento(session.user) : false;
  const podeRepetir = session?.user ? podeGerirCurriculo(session.user) : false;
  // Situação Financeira volta a ser editável aqui, mas só para ADMIN (§pedido do cliente
  // 2026-08-18) — a Secretaria mantém-se só leitura nesta página, continua a confirmar/reverter
  // exclusivamente pelo fluxo de Registo de Pagamentos.
  const podeEditarFinanceiroAqui = session?.user?.role === "ADMIN";
  // Nome/nº de estudante — só ADMIN (§pedido do cliente 2026-08-18).
  const podeEditarDadosPessoais = session?.user ? podeGerirContas(session.user) : false;
  // Documentos é partilhado com a Secretaria (recebe em mão do aluno), ao contrário do resto
  // deste domínio académico (podeRepetir), que continua exclusivo do DAAC.
  const podeVerDocumentos = session?.user ? podeGerirDocumentos(session.user) : false;
  const estadoFinanceiro = await getEstadoFinanceiroAluno(aluno.id);

  // Multas sem mensalidade correspondente no mesmo mês ficam de fora do merge de
  // PropinasMensais (mesmo tratamento de PagamentosSecretariaPanel) — só essas aparecem na lista
  // separada abaixo, em vez de todas.
  const mesesChaves = new Set(estadoFinanceiro.meses.map((mes) => chaveMes(mes.mesReferencia)));
  const multasOrfas = estadoFinanceiro.multas.filter((m) => !m.mesReferencia || !mesesChaves.has(chaveMes(m.mesReferencia)));

  const cadeirasAtivas = inscricoes
    .filter((i) => i.ativa)
    .map((i) => ({ cadeiraCurricularId: i.cadeiraCurricularId, disciplinaNome: i.turmaDisciplina.disciplina.nome }));

  // select, não include: RepeticaoForm (Client Component) só precisa de id/nome — Curso.valorPropina
  // é Decimal e o Next.js recusa-se a serializar Decimal ao passar de Server para Client Component
  // (mesmo cuidado já aplicado a outrosCursos/MudarCursoForm, mais abaixo). Ficou latente até agora
  // porque só DAAC/ADMIN chegam aqui (podeRepetir) e o DAAC só ganhou acesso a /alunos hoje.
  const ofertas = podeRepetir
    ? await prisma.turmaDisciplina.findMany({
        where: { cadeiraCurricularId: { in: cadeirasAtivas.map((c) => c.cadeiraCurricularId) } },
        select: {
          id: true,
          cadeiraCurricularId: true,
          disciplina: { select: { nome: true } },
          professor: { select: { nome: true } },
          turma: { select: { anoCurricular: true, curso: { select: { nome: true } } } },
        },
      })
    : [];

  // Rematrícula (§4.2/Fase 8b) — resumo do ano corrente e janela de matrícula.
  const configAcademica = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const agora = getAgora();
  const dentroDaJanela = Boolean(
    configAcademica?.matriculaInicio &&
      configAcademica.matriculaFim &&
      agora >= configAcademica.matriculaInicio &&
      agora <= configAcademica.matriculaFim,
  );
  const reprovacoesAnoCorrente = inscricoes.filter((i) => {
    if (!i.ativa) return false;
    const notas = i.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    const resultado = calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: i.permiteDispensaAplicada,
      notaMinimaDispensa: Number(i.notaMinimaDispensaAplicada),
    });
    return resultado.estado === "REPROVADO";
  }).length;

  // Segunda licenciatura / mudança de curso (Fase 8c) — cursos além do atual do aluno.
  // select: MudarCursoForm (Client Component) só precisa de id/nome — Curso.valorPropina é
  // Decimal e o Next.js recusa-se a serializar Decimal ao passar de Server para Client Component.
  const outrosCursos = podeEditarCategoria
    ? await prisma.curso.findMany({ where: { nome: { not: aluno.curso } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    : [];

  // Histórico de pagamentos — auditoria do percurso financeiro completo, não só o que está em
  // aberto agora (isso já é "Situação Financeira" acima). Inclui quem registou cada pagamento.
  const cobrancas = await prisma.cobranca.findMany({
    where: { alunoId: aluno.id },
    include: { registadoPor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Aproveitamento de cadeiras de outra instituição (aluno transferido) — só cadeiras do curso do
  // aluno que ainda não têm nenhuma InscricaoCadeira (qualquer tentativa), para não duplicar.
  const cadeirasJaInscritas = new Set(inscricoes.map((i) => i.cadeiraCurricularId));
  const cadeirasDisponiveisParaCreditar = podeRepetir
    ? (
        await prisma.cadeiraCurricular.findMany({
          where: { curso: { nome: aluno.curso } },
          include: { disciplina: true },
          orderBy: [{ anoCurricular: "asc" }, { disciplina: { nome: "asc" } }],
        })
      )
        .filter((c) => !cadeirasJaInscritas.has(c.id))
        .map((c) => ({ id: c.id, disciplinaNome: c.disciplina.nome, anoCurricular: c.anoCurricular }))
    : [];

  // Documentos administrativos (certificado de transferência, BI, etc.) — backlog simples,
  // partilhado entre Secretaria (recebe o documento em mão) e DAAC (consulta/usa academicamente).
  const documentos = podeVerDocumentos
    ? await prisma.documentoAluno.findMany({
        where: { alunoId: aluno.id },
        include: { carregadoPor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Alunos
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">{aluno.nome}</h1>
          <p className="text-sm text-navy-400">
            {aluno.numeroEstudante} · {aluno.curso} · {aluno.anoCurricular}º Ano
          </p>
          {podeEditarDadosPessoais ? (
            <div className="mt-1">
              <DadosPessoaisAlunoForm alunoId={aluno.id} nome={aluno.nome} numeroEstudante={aluno.numeroEstudante} />
            </div>
          ) : null}
        </div>
        <Badge tone={STATUS_TONE[aluno.status]}>{aluno.status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Dados pessoais" />
          <CardBody className="flex flex-col gap-3 text-sm">
            <InfoRow label="Email" value={aluno.email ?? "—"} />
            <InfoRow label="Telefone" value={aluno.telefone ?? "—"} />
            <InfoRow label="Data de nascimento" value={formatDate(aluno.dataNascimento)} />
            <InfoRow label="Género" value={aluno.genero} />
            <InfoRow label="Ano de ingresso" value={String(aluno.anoIngresso)} />
            <div className="flex items-center justify-between border-b border-navy-50 pb-2 last:border-0 last:pb-0">
              <span className="text-navy-400">Categoria</span>
              <CategoriaEstudanteForm alunoId={aluno.id} categoria={aluno.categoria} editable={podeEditarCategoria} />
            </div>
            <InfoRow label="Registado em" value={formatDate(aluno.createdAt)} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Matrículas" subtitle={`${aluno.matriculas.length} turma(s)`} />
          {aluno.matriculas.length === 0 ? (
            <EmptyState message="Sem matrículas registadas." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {aluno.matriculas.map((matricula) => (
                <div key={matricula.id} className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy-900">
                    {matricula.turma.curso.nome} · {matricula.turma.anoCurricular}º Ano ·{" "}
                    {PERIODO_LABEL[matricula.turma.periodo]} · {formatAnoLetivo(matricula.turma.anoLetivo)}
                  </p>
                  <Badge tone={matricula.status === "ATIVA" ? "success" : "neutral"}>{matricula.status}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Situação Financeira"
          subtitle={
            podeEditarFinanceiroAqui
              ? `Dívida: ${formatCurrency(estadoFinanceiro.saldoEmDivida)}`
              : `Dívida: ${formatCurrency(estadoFinanceiro.saldoEmDivida)} · só leitura — confirme ou reverta pagamentos em Registo de Pagamentos`
          }
        />
        <CardBody className="flex flex-col gap-4">
          {/* Editável só para ADMIN aqui (§pedido do cliente 2026-08-18) — a Secretaria continua
              só-leitura, confirma/reverte exclusivamente pelo fluxo de Registo de Pagamentos
              (emite recibo, respeita seleção em lote). */}
          <PropinasMensais meses={estadoFinanceiro.meses} multas={estadoFinanceiro.multas} editable={podeEditarFinanceiroAqui} />
          <MultasPendentes multas={multasOrfas} editable={podeEditarFinanceiroAqui} />
        </CardBody>
      </Card>

      {podeEditarCategoria ? (
        <Card>
          <CardHeader
            title="Rematrícula"
            subtitle={`Ano corrente: ${reprovacoesAnoCorrente} reprovação(ões) nas cadeiras ativas`}
          />
          <CardBody>
            <RematriculaForm alunoId={aluno.id} dentroDaJanela={dentroDaJanela} />
          </CardBody>
        </Card>
      ) : null}

      {podeEditarCategoria ? (
        <Card>
          <CardHeader
            title="Segunda Licenciatura / Mudança de Curso"
            subtitle="Sem aproveitamento de créditos — entra sempre no 1º ano do curso novo."
          />
          <CardBody>
            <MudarCursoForm alunoId={aluno.id} cursos={outrosCursos} />
          </CardBody>
        </Card>
      ) : null}

      <Disclosure title="Percurso Curricular" subtitle={`${inscricoes.length} inscrição(ões)`}>
        <div className="flex flex-col gap-4">
          {inscricoes.length === 0 ? (
            <EmptyState message="Sem cadeiras inscritas." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Disciplina</Th>
                  <Th>Turma</Th>
                  <Th>Ano Letivo</Th>
                  <Th>Professor</Th>
                  <Th>Tentativa</Th>
                  <Th>Estado</Th>
                  <Th>Notas</Th>
                </tr>
              </Thead>
              <Tbody>
                {inscricoes.map((inscricao) => (
                  <Tr key={inscricao.id}>
                    <Td className="font-medium text-navy-900">
                      {inscricao.turmaDisciplina.disciplina.nome}
                      {inscricao.creditada ? (
                        <span
                          className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          title={inscricao.instituicaoOrigemCreditado ?? undefined}
                        >
                          Creditado
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      {inscricao.turmaDisciplina.turma.curso.nome} · {inscricao.turmaDisciplina.turma.anoCurricular}º Ano
                    </Td>
                    <Td>{formatAnoLetivo(inscricao.turmaDisciplina.turma.anoLetivo)}</Td>
                    <Td>{inscricao.turmaDisciplina.professor.nome}</Td>
                    <Td>{inscricao.tentativa}ª</Td>
                    <Td>
                      <Badge tone={inscricao.ativa ? "success" : "neutral"}>{inscricao.ativa ? "Ativa" : "Anterior"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <span>
                          {inscricao.notas.length === 0
                            ? "—"
                            : inscricao.notas.map((n) => `${EPOCA_LABEL[n.avaliacao.epoca]}: ${n.valor}`).join(" · ")}
                        </span>
                        {podeRepetir ? (
                          <EditarNotaHistoricaForm
                            inscricaoCadeiraId={inscricao.id}
                            notasAtuais={Object.fromEntries(
                              inscricao.notas.map((n) => [
                                { P1: "p1", P2: "p2", EXAME: "exame", RECURSO: "recurso", EXAME_ESPECIAL: "exameEspecial" }[n.avaliacao.epoca],
                                Number(n.valor),
                              ]),
                            )}
                          />
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          {podeRepetir && cadeirasAtivas.length > 0 ? (
            <div className="border-t border-navy-50 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                Inscrever numa nova tentativa (repetição)
              </p>
              <RepeticaoForm alunoId={aluno.id} cadeirasAtivas={cadeirasAtivas} ofertas={ofertas} />
            </div>
          ) : null}

          {podeRepetir ? (
            <div className="border-t border-navy-50 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                Aproveitamento (aluno transferido)
              </p>
              <CreditarCadeiraForm alunoId={aluno.id} cadeirasDisponiveis={cadeirasDisponiveisParaCreditar} />
            </div>
          ) : null}
        </div>
      </Disclosure>

      {podeVerDocumentos ? (
        <Disclosure title="Documentos" subtitle={`${documentos.length} documento(s)`}>
          <DocumentosAlunoCard alunoId={aluno.id} documentos={documentos} />
        </Disclosure>
      ) : null}

      <Disclosure title="Histórico de Pagamentos" subtitle={`${cobrancas.length} registo(s)`}>
        {cobrancas.length === 0 ? (
          <EmptyState message="Sem cobranças registadas." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Referência</Th>
                <Th>Valor</Th>
                <Th>Estado</Th>
                <Th>Pago em</Th>
                <Th>Registado por</Th>
              </tr>
            </Thead>
            <Tbody>
              {cobrancas.map((cobranca) => (
                <Tr key={cobranca.id}>
                  <Td className="font-medium text-navy-900">{COBRANCA_TIPO_LABEL[cobranca.tipo]}</Td>
                  <Td>{cobranca.mesReferencia ? formatDate(cobranca.mesReferencia) : (cobranca.descricao ?? "—")}</Td>
                  <Td>{formatCurrency(Number(cobranca.valorPago) > 0 ? Number(cobranca.valorPago) : Number(cobranca.valorDevido))}</Td>
                  <Td>
                    <Badge tone={cobranca.status === "PAGO" ? "success" : "warning"}>{cobranca.status === "PAGO" ? "Pago" : "Pendente"}</Badge>
                  </Td>
                  <Td>{cobranca.dataPagamento ? formatDate(cobranca.dataPagamento) : "—"}</Td>
                  <Td>{cobranca.registadoPor?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Disclosure>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-navy-50 pb-2 last:border-0 last:pb-0">
      <span className="text-navy-400">{label}</span>
      <span className="font-medium text-navy-800">{value}</span>
    </div>
  );
}
