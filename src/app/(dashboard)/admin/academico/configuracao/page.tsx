import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { podeGerirCurriculo } from "@/lib/permissions";
import { toIsoDate } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { contarFechoSemestre } from "@/lib/fecho-semestre";
import { getAgora } from "@/lib/tempo";
import { ConfiguracaoAcademicaForm } from "./ConfiguracaoAcademicaForm";
import { SemestreAtualCard } from "./SemestreAtualCard";
import { LancamentoNotasCard } from "./LancamentoNotasCard";

export default async function ConfiguracaoAcademicaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!podeGerirCurriculo(session.user)) redirect("/dashboard");

  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  const proximoSemestre = semestreAtual === 1 ? 2 : 1;

  // O que ficará por fazer NO OUTRO semestre, contado agora: o aviso da confirmação passa a dizer
  // números concretos ("4 disciplinas sem professor") em vez de um "se calhar falta alguma coisa"
  // genérico. Quem confirma vê o tamanho do trabalho antes de mudar, não depois.
  const agora = await getAgora();
  const anoLetivo = anoLetivoCorrente(agora, config);
  const [semProfessor, semHorario] =
    anoLetivo === null
      ? [0, 0]
      : await Promise.all([
          prisma.turmaDisciplina.count({
            where: { semestre: proximoSemestre, professorId: null, turma: { anoLetivo } },
          }),
          prisma.turmaDisciplina.count({
            where: { semestre: proximoSemestre, horarioSlots: { none: {} }, turma: { anoLetivo } },
          }),
        ]);

  // O que o fecho do 1º semestre vai marcar a 0 — contado antes, para o aviso poder dizer o número
  // em vez de o DAAC só descobrir depois de a mudança já ser irreversível.
  const fecho =
    anoLetivo === null || semestreAtual !== 1
      ? { porFechar: 0, semAvaliacaoAgendada: 0 }
      : await contarFechoSemestre(anoLetivo, 1);

  // O mesmo cálculo, mas para o semestre CORRENTE (seja ele qual for) — é o que o cartão da janela
  // de lançamento precisa. `porFechar - semAvaliacaoAgendada` = cadeiras pendentes numa época já
  // agendada, exatamente as que um professor consegue lançar enquanto a janela estiver aberta.
  const fechoCorrente =
    anoLetivo === null
      ? { porFechar: 0, semAvaliacaoAgendada: 0 }
      : semestreAtual === 1
        ? fecho
        : await contarFechoSemestre(anoLetivo, semestreAtual);
  const cadeirasPorLancar = fechoCorrente.porFechar - fechoCorrente.semAvaliacaoAgendada;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Configuração Académica</h1>
        <p className="text-sm text-navy-400">
          Regras de rematrícula e retenção (§4.2), o semestre corrente e a janela de lançamento de notas.
        </p>
      </div>

      <SemestreAtualCard
        semestreAtual={semestreAtual}
        disciplinasSemProfessor={semProfessor}
        disciplinasSemHorario={semHorario}
        cadeirasPorFechar={fecho.porFechar}
        semAvaliacaoAgendada={fecho.semAvaliacaoAgendada}
        dentroDoAnoLetivo={anoLetivo !== null}
      />

      <LancamentoNotasCard
        aberto={config?.lancamentoNotasAberto ?? true}
        alteradoEm={config?.lancamentoNotasAlteradoEm ?? null}
        cadeirasPorLancar={cadeirasPorLancar}
      />

      <Card>
        <CardHeader
          title="Ano letivo, rematrícula e retenção"
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
            anoDeReferencia={agora.getFullYear()}
          />
        </CardBody>
      </Card>
    </div>
  );
}
