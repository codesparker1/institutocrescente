import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { podeGerirRelogioSimulado } from "@/lib/permissions";
import { SIMULATION_MODE, getAgora } from "@/lib/tempo";
import { formatDateTime } from "@/lib/utils";
import { RelogioSimuladoForm } from "./RelogioSimuladoForm";

export default async function RelogioSimuladoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!podeGerirRelogioSimulado(session.user)) redirect("/dashboard");
  if (!SIMULATION_MODE) redirect("/dashboard");

  const agora = await getAgora();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Relógio Simulado</h1>
        <p className="text-sm text-navy-400">
          Avança a data usada por todo o sistema (propinas, multas, suspensão automática, prazos de lançamento) sem esperar o
          tempo real passar. Só visível com SIMULATION_MODE=true — nunca afeta produção fora deste modo.
        </p>
      </div>

      <Card>
        <CardHeader title="Data simulada corrente" subtitle="É esta data que getAgora() devolve a todo o sistema enquanto SIMULATION_MODE=true." />
        <CardBody>
          <p className="text-2xl font-bold text-navy-900">{formatDateTime(agora)}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Avançar o tempo"
          subtitle="Indique quantos dias avançar (ex.: 30 para um mês, 365 para um ano). Cada acesso ao dashboard depois disto aciona as reações automáticas (propinas, suspensão, notas por falta) contra a nova data."
        />
        <CardBody>
          <RelogioSimuladoForm />
        </CardBody>
      </Card>
    </div>
  );
}
