import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { formatCurrency } from "@/lib/utils";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";

export default async function MinhasPropinasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const estadoFinanceiro = await getEstadoFinanceiroAluno(session.user.alunoId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Minhas Propinas</h1>
        <p className="text-sm text-texto-suave">Histórico completo das suas mensalidades.</p>
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
        {/* O subtítulo dizia "Só a secretaria pode confirmar pagamentos" a TODA a gente — mas esta
            página é só do aluno (o redirect acima garante-o), e ele nunca teve botão nenhum para
            confirmar seja o que for. Era a resposta a uma pergunta que ninguém aqui fez. Diz-se
            agora o que lhe interessa, e só quando é o caso. */}
        <CardHeader
          title="Mensalidades"
          subtitle={
            estadoFinanceiro.saldoEmDivida > 0
              ? "Para regularizar, dirija-se à secretaria."
              : "Sem mensalidades por pagar."
          }
        />
        <CardBody className="flex flex-col gap-4">
          <PropinasMensais meses={estadoFinanceiro.meses} multas={estadoFinanceiro.multas} editable={false} />
        </CardBody>
      </Card>
    </div>
  );
}

function InfoStat({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg border border-navy-50 px-3 py-2">
      <p className="text-xs text-texto-suave">{label}</p>
      <p className={`text-lg font-bold ${destaque ? "text-red-600" : "text-texto"}`}>{value}</p>
    </div>
  );
}
