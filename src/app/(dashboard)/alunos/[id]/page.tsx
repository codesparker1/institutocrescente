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
import { formatDate, formatCurrency, PERIODO_LABEL, formatAnoLetivo } from "@/lib/utils";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";
import { podeRegistarPagamento, podeGerirCurriculo } from "@/lib/permissions";
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
  const podeGerirPropinas = session?.user.role === "ADMIN" || session?.user.role === "SECRETARIA";
  const podeEditarCategoria = session?.user ? podeRegistarPagamento(session.user) : false;
  const podeRepetir = session?.user ? podeGerirCurriculo(session.user) : false;
  const estadoFinanceiro = await getEstadoFinanceiroAluno(aluno.id);

  const cadeirasAtivas = inscricoes
    .filter((i) => i.ativa)
    .map((i) => ({ cadeiraCurricularId: i.cadeiraCurricularId, disciplinaNome: i.turmaDisciplina.disciplina.nome }));

  const ofertas = podeRepetir
    ? await prisma.turmaDisciplina.findMany({
        where: { cadeiraCurricularId: { in: cadeirasAtivas.map((c) => c.cadeiraCurricularId) } },
        include: { turma: { include: { curso: true } }, professor: true, disciplina: true },
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
  // DIAGNÓSTICO TEMPORÁRIO (remover depois de explicar o achado do cost-meter sobre a janela de
  // rematrícula) — captura de logs do servidor (stdout, depois fs.appendFileSync) mostrou-se nada
  // fiável neste workflow; em vez disso, um marcador no próprio HTML que o Playwright lê
  // diretamente — a mesma pipeline (resultado-ano.json) que já se mostrou 100% fiável.
  const diagRematriculaTexto = `agora=${agora.toISOString()}|matriculaInicio=${configAcademica?.matriculaInicio?.toISOString()}|matriculaFim=${configAcademica?.matriculaFim?.toISOString()}|dentroDaJanela=${dentroDaJanela}|SIMULATION_MODE=${process.env.SIMULATION_MODE}`;
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
          subtitle={`Dívida: ${formatCurrency(estadoFinanceiro.saldoEmDivida)}`}
        />
        <CardBody className="flex flex-col gap-4">
          <PropinasMensais meses={estadoFinanceiro.meses} editable={podeGerirPropinas} />
          <MultasPendentes multas={estadoFinanceiro.multas} editable={podeGerirPropinas} />
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
            {/* DIAGNÓSTICO TEMPORÁRIO — remover depois de explicar o achado do cost-meter. */}
            <span data-diag-rematricula={diagRematriculaTexto} style={{ display: "none" }} />
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
        {inscricoes.length === 0 ? (
          <EmptyState message="Sem cadeiras inscritas." />
        ) : (
          <div className="flex flex-col gap-4">
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
                    <Td className="font-medium text-navy-900">{inscricao.turmaDisciplina.disciplina.nome}</Td>
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
                      {inscricao.notas.length === 0
                        ? "—"
                        : inscricao.notas.map((n) => `${EPOCA_LABEL[n.avaliacao.epoca]}: ${n.valor}`).join(" · ")}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {podeRepetir && cadeirasAtivas.length > 0 ? (
              <div className="border-t border-navy-50 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                  Inscrever numa nova tentativa (repetição)
                </p>
                <RepeticaoForm alunoId={aluno.id} cadeirasAtivas={cadeirasAtivas} ofertas={ofertas} />
              </div>
            ) : null}
          </div>
        )}
      </Disclosure>

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
