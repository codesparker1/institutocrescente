import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { atualizarConfiguracaoFinanceiraAction } from "@/actions/financeiro";

export default async function ConfiguracaoFinanceiraPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const config = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
  const bloqueioAtivo = config?.bloqueioAtivo ?? true;
  const toleranciaDias = config?.toleranciaDias ?? 5;
  const valorMensalPadrao = config ? Number(config.valorMensalPadrao) : 15000;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Configuração Financeira</h1>
        <p className="text-sm text-navy-400">
          Controla o bloqueio de acesso por propinas em atraso. Estes valores ainda estão por confirmar com o
          cliente, por isso ficam configuráveis aqui em vez de fixos no código.
        </p>
      </div>

      <Card>
        <CardHeader title="Bloqueio por dívida" subtitle="Aplica-se a todos os alunos com mensalidades em atraso." />
        <CardBody>
          <form action={atualizarConfiguracaoFinanceiraAction} className="flex flex-col gap-4 max-w-md">
            <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
              <input
                type="checkbox"
                name="bloqueioAtivo"
                defaultChecked={bloqueioAtivo}
                className="h-4 w-4 rounded border-navy-200"
              />
              Bloquear acesso de alunos com propinas em atraso
            </label>

            <Field label="Dias de tolerância" htmlFor="toleranciaDias">
              <Input
                id="toleranciaDias"
                name="toleranciaDias"
                type="number"
                min={0}
                max={90}
                defaultValue={toleranciaDias}
              />
            </Field>

            <Field label="Valor mensal padrão (Kz)" htmlFor="valorMensalPadrao">
              <Input
                id="valorMensalPadrao"
                name="valorMensalPadrao"
                type="number"
                min={0}
                step="0.01"
                defaultValue={valorMensalPadrao}
              />
            </Field>

            <button
              type="submit"
              className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Guardar
            </button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
