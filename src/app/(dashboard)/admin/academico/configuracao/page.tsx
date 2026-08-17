import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { podeGerirCurriculo } from "@/lib/permissions";
import { toIsoDate } from "@/lib/utils";
import { ConfiguracaoAcademicaForm } from "./ConfiguracaoAcademicaForm";
import { SemestreAtualCard } from "./SemestreAtualCard";

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
          Regras de rematrícula e retenção (§4.2), o semestre corrente, e os prazos de lançamento de notas (§4.3).
        </p>
      </div>

      <SemestreAtualCard semestreAtual={config?.semestreAtual === 2 ? 2 : 1} />

      <Card>
        <CardHeader
          title="Ano letivo, rematrícula, retenção e prazos de lançamento"
          subtitle="Ano letivo e período de matrícula são janelas diferentes: a Secretaria só processa rematrículas dentro da janela de matrícula, mas é o fim do ano letivo que fecha o ano e repõe o semestre."
        />
        <CardBody>
          <ConfiguracaoAcademicaForm
            limiteReprovacoes={config?.limiteReprovacoes ?? 2}
            regraRetencao={config?.regraRetencao ?? "SO_REPROVADAS"}
            matriculaInicio={config?.matriculaInicio ? toIsoDate(config.matriculaInicio) : undefined}
            matriculaFim={config?.matriculaFim ? toIsoDate(config.matriculaFim) : undefined}
            anoLetivoInicio={config?.anoLetivoInicio ? toIsoDate(config.anoLetivoInicio) : undefined}
            anoLetivoFim={config?.anoLetivoFim ? toIsoDate(config.anoLetivoFim) : undefined}
            diasPrazoP1={config?.diasPrazoP1 ?? 5}
            diasPrazoP2={config?.diasPrazoP2 ?? 5}
            diasPrazoExame={config?.diasPrazoExame ?? 7}
            diasPrazoRecurso={config?.diasPrazoRecurso ?? 5}
            diasPrazoExameEspecial={config?.diasPrazoExameEspecial ?? 5}
          />
        </CardBody>
      </Card>
    </div>
  );
}
