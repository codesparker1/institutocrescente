import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { MultasPendentes } from "@/components/financeiro/MultasPendentes";
import { CatalogoEmolumentos } from "@/components/financeiro/CatalogoEmolumentos";
import { EmolumentosPagos } from "@/components/financeiro/EmolumentosPagos";
import { formatCurrency } from "@/lib/utils";
import { getEstadoFinanceiroAluno, getCatalogoEmolumentos, getEmolumentosPagos } from "@/lib/financeiro";

export default async function MinhasPropinasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const [estadoFinanceiro, catalogoEmolumentos, emolumentosPagos] = await Promise.all([
    getEstadoFinanceiroAluno(session.user.alunoId),
    getCatalogoEmolumentos(),
    getEmolumentosPagos(session.user.alunoId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Propinas</h1>
        <p className="text-sm text-navy-400">Histórico completo das suas mensalidades.</p>
      </div>

      <Card>
        <CardHeader title="Resumo" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoStat label="Total pago" value={formatCurrency(estadoFinanceiro.totalPago)} />
          <InfoStat
            label="Dívida"
            value={formatCurrency(estadoFinanceiro.saldoEmDivida)}
            destaque={estadoFinanceiro.saldoEmDivida > 0}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mensalidades" subtitle="Só a secretaria pode confirmar pagamentos." />
        <CardBody className="flex flex-col gap-4">
          <PropinasMensais meses={estadoFinanceiro.meses} editable={false} />
          <MultasPendentes multas={estadoFinanceiro.multas} editable={false} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Catálogo de Emolumentos"
          subtitle="Declarações, certidões e outros serviços. Peça e pague na secretaria."
        />
        <CardBody>
          <CatalogoEmolumentos emolumentos={catalogoEmolumentos} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Emolumentos Pagos" />
        <CardBody>
          <EmolumentosPagos emolumentos={emolumentosPagos} />
        </CardBody>
      </Card>
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
