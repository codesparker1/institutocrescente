import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ConfiguracaoForm } from "./ConfiguracaoForm";

export default async function ConfiguracaoFinanceiraPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const config = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  const bloqueioAtivo = config?.bloqueioAtivo ?? true;
  const toleranciaDias = config?.toleranciaDias ?? 0;
  const diaVencimento = config?.diaVencimento ?? 10;
  const valorMulta = config ? Number(config.valorMulta) : 5000;
  const valorMultaRematriculaTardia = config ? Number(config.valorMultaRematriculaTardia) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Configuração Financeira</h1>
        <p className="text-sm text-texto-suave">
          Controla o vencimento e a multa por propinas em atraso, e o bloqueio de acesso às notas. Valores
          confirmados com o diretor (dia 10, sem tolerância, multa fixa) — continuam editáveis aqui.
        </p>
      </div>

      <Card>
        <CardHeader title="Bloqueio por dívida" subtitle="Aplica-se a todos os alunos com mensalidades em atraso." />
        <CardBody>
          <ConfiguracaoForm
            bloqueioAtivo={bloqueioAtivo}
            toleranciaDias={toleranciaDias}
            diaVencimento={diaVencimento}
            valorMulta={valorMulta}
            valorMultaRematriculaTardia={valorMultaRematriculaTardia}
          />
        </CardBody>
      </Card>
    </div>
  );
}
