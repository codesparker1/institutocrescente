import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { podeGerirCurriculo } from "@/lib/permissions";
import { toIsoDate } from "@/lib/utils";
import { ConfiguracaoAcademicaForm } from "./ConfiguracaoAcademicaForm";

export default async function ConfiguracaoAcademicaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!podeGerirCurriculo(session.user)) redirect("/dashboard");

  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Configuração Académica</h1>
        <p className="text-sm text-navy-400">
          Regras de rematrícula e retenção (§4.2) — quantas reprovações ainda permitem avançar de ano, o que
          acontece a um aluno retido, e quando a janela de rematrícula está aberta.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Rematrícula e retenção"
          subtitle="A Secretaria só consegue processar rematrículas dentro desta janela."
        />
        <CardBody>
          <ConfiguracaoAcademicaForm
            limiteReprovacoes={config?.limiteReprovacoes ?? 2}
            regraRetencao={config?.regraRetencao ?? "SO_REPROVADAS"}
            matriculaInicio={config?.matriculaInicio ? toIsoDate(config.matriculaInicio) : undefined}
            matriculaFim={config?.matriculaFim ? toIsoDate(config.matriculaFim) : undefined}
          />
        </CardBody>
      </Card>
    </div>
  );
}
