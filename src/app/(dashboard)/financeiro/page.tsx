import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { formatCurrency } from "@/lib/utils";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";

export default async function MinhasPropinasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const estadoFinanceiro = await getEstadoFinanceiroAluno(session.user.alunoId);
  // Aberto por omissão só quando ainda há algo por pagar de um ano anterior — nunca esconder
  // dívida atrás de um clique que ninguém é obrigado a dar (§pedido do cliente 2026-09-09).
  const historicoTemPendente = estadoFinanceiro.mesesHistorico.some((m) => m.status === "PENDENTE");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Minhas Propinas</h1>
        <p className="text-sm text-texto-suave">Mensalidades do ano letivo atual.</p>
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

      {estadoFinanceiro.mesesHistorico.length > 0 ? (
        <Disclosure
          title="Histórico de pagamento"
          subtitle={
            historicoTemPendente
              ? "Ainda há mensalidades de anos anteriores por pagar."
              : `${estadoFinanceiro.mesesHistorico.length} mensalidade(s) de anos anteriores, todas pagas.`
          }
          defaultOpen={historicoTemPendente}
        >
          <PropinasMensais meses={estadoFinanceiro.mesesHistorico} editable={false} />
        </Disclosure>
      ) : null}
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
