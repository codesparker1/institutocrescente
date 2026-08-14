import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Table";
import { Input, Field } from "@/components/ui/Input";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { MultasPendentes } from "@/components/financeiro/MultasPendentes";
import { EmolumentosPagos } from "@/components/financeiro/EmolumentosPagos";
import { RegistarPagamentoEmolumentoForm } from "@/components/financeiro/RegistarPagamentoEmolumentoForm";
import { formatCurrency } from "@/lib/utils";
import { getEstadoFinanceiroAluno, getCatalogoEmolumentos, getEmolumentosPagos } from "@/lib/financeiro";

interface RegistoPageProps {
  searchParams: Promise<{ q?: string; alunoId?: string }>;
}

export default async function RegistoPropinasPage({ searchParams }: RegistoPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["ADMIN", "SECRETARIA"].includes(session.user.role)) redirect("/dashboard");

  const { q, alunoId } = await searchParams;

  const resultados = q
    ? await prisma.aluno.findMany({
        where: { nome: { contains: q, mode: "insensitive" } },
        orderBy: { nome: "asc" },
        take: 10,
      })
    : [];

  const alunoSelecionado = alunoId
    ? await prisma.aluno.findUnique({ where: { id: alunoId } })
    : null;

  const [estadoFinanceiro, catalogoEmolumentos, emolumentosPagos] = alunoSelecionado
    ? await Promise.all([
        getEstadoFinanceiroAluno(alunoSelecionado.id),
        getCatalogoEmolumentos(),
        getEmolumentosPagos(alunoSelecionado.id),
      ])
    : [null, [], []];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Registo de Propinas</h1>
        <p className="text-sm text-navy-400">
          Pesquise um aluno pelo nome para confirmar ou reverter o pagamento das mensalidades, mês a mês.
        </p>
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Nome do aluno" htmlFor="q">
                <Input id="q" type="search" name="q" defaultValue={q} placeholder="Pesquisar por nome..." />
              </Field>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Pesquisar
            </button>
          </form>
        </CardBody>
      </Card>

      {q && !alunoSelecionado ? (
        <Card>
          <CardHeader title="Resultados" subtitle={`${resultados.length} aluno(s) encontrado(s)`} />
          {resultados.length === 0 ? (
            <EmptyState message="Nenhum aluno encontrado com esse nome." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {resultados.map((aluno) => (
                <Link
                  key={aluno.id}
                  href={`/financeiro/registo?alunoId=${aluno.id}`}
                  className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm hover:bg-navy-50"
                >
                  <span className="font-medium text-navy-900">{aluno.nome}</span>
                  <span className="text-xs text-navy-400">
                    {aluno.numeroEstudante} · {aluno.curso} · {aluno.anoCurricular}º Ano
                  </span>
                </Link>
              ))}
            </CardBody>
          )}
        </Card>
      ) : null}

      {alunoSelecionado && estadoFinanceiro ? (
        <Card>
          <CardHeader
            title={alunoSelecionado.nome}
            subtitle={`${alunoSelecionado.numeroEstudante} · ${alunoSelecionado.curso} · ${alunoSelecionado.anoCurricular}º Ano`}
            action={
              <Link href="/financeiro/registo" className="text-xs text-navy-400 hover:text-navy-600">
                Nova pesquisa
              </Link>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoStat label="Total pago" value={formatCurrency(estadoFinanceiro.totalPago)} />
              <InfoStat
                label="Dívida"
                value={formatCurrency(estadoFinanceiro.saldoEmDivida)}
                destaque={estadoFinanceiro.saldoEmDivida > 0}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                Mensalidades (clique para confirmar/reverter — apenas por ordem)
              </p>
              <PropinasMensais meses={estadoFinanceiro.meses} editable />
            </div>

            <MultasPendentes multas={estadoFinanceiro.multas} editable />
          </CardBody>
        </Card>
      ) : null}

      {alunoSelecionado ? (
        <Card>
          <CardHeader title="Emolumentos" subtitle="Pedido e pagamento presenciais — regista aqui depois de cobrar." />
          <CardBody className="flex flex-col gap-4">
            <RegistarPagamentoEmolumentoForm alunoId={alunoSelecionado.id} emolumentos={catalogoEmolumentos} />
            <EmolumentosPagos emolumentos={emolumentosPagos} editable />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function InfoStat({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg border border-navy-50 px-3 py-2">
      <p className="text-xs text-navy-400">{label}</p>
      <p className={`text-lg font-bold ${destaque ? "text-red-600" : "text-navy-900"}`}>{value}</p>
    </div>
  );
}
