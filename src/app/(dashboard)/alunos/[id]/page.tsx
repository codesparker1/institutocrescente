import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { MultasPendentes } from "@/components/financeiro/MultasPendentes";
import { CategoriaEstudanteForm } from "@/components/alunos/CategoriaEstudanteForm";
import { RepeticaoForm } from "@/components/alunos/RepeticaoForm";
import { formatDate, formatCurrency, PERIODO_LABEL } from "@/lib/utils";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";
import { podeRegistarPagamento, podeGerirCurriculo } from "@/lib/permissions";
import type { AlunoStatus } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
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
                    {PERIODO_LABEL[matricula.turma.periodo]}
                  </p>
                  <Badge tone={matricula.status === "ATIVA" ? "success" : "neutral"}>{matricula.status}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Percurso Curricular" subtitle={`${inscricoes.length} inscrição(ões)`} />
        {inscricoes.length === 0 ? (
          <EmptyState message="Sem cadeiras inscritas." />
        ) : (
          <CardBody className="flex flex-col gap-4">
            <Table>
              <Thead>
                <tr>
                  <Th>Disciplina</Th>
                  <Th>Turma</Th>
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
                    <Td>{inscricao.turmaDisciplina.professor.nome}</Td>
                    <Td>{inscricao.tentativa}ª</Td>
                    <Td>
                      <Badge tone={inscricao.ativa ? "success" : "neutral"}>{inscricao.ativa ? "Ativa" : "Anterior"}</Badge>
                    </Td>
                    <Td>
                      {inscricao.notas.length === 0
                        ? "—"
                        : inscricao.notas.map((n) => `${n.avaliacao.nome}: ${n.valor}`).join(" · ")}
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
          </CardBody>
        )}
      </Card>
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
