import Link from "next/link";
import { CalendarClock, GraduationCap, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { ProfileCard } from "./ProfileCard";
import { DIA_SEMANA_LABEL, diasAteProximo, formatAnoLetivo, formatDate } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { EPOCA_LABEL, provaJaPassou } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";

interface ProfessorDashboardProps {
  professorId: string;
}

export async function ProfessorDashboard({ professorId }: ProfessorDashboardProps) {
  const professor = await prisma.professor.findUnique({ where: { id: professorId } });

  if (!professor) {
    return <EmptyState message="Professor não encontrado." />;
  }

  // Mesmo filtro de "Minhas Disciplinas" (professor/page.tsx) — ano letivo e semestre correntes.
  // Sem isto, o resumo da página inicial (disciplinas, alunos, próximas aulas/provas) incluía anos
  // anteriores (histórico), turmas de 2027 pré-criadas para a rematrícula (ainda vazias), e
  // disciplinas do semestre que o DAAC ainda não abriu — inconsistente com o que a lista mostra.
  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  // Do intervalo configurado, NÃO de agora.getFullYear(): a meio do ano letivo o ano civil vira
  // (Fevereiro de 2027 ainda é 2026/2027) e o professor deixava de ver TODAS as suas disciplinas,
  // com o painel a ficar vazio sem dizer porquê.
  const anoLetivo = anoLetivoCorrente(agora, config);
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where:
      anoLetivo === null
        ? { id: "" } // fora de um ano letivo não há nada a decorrer — a mensagem explica-o abaixo
        : {
            professorId,
            turma: { anoLetivo },
            // Monografia dura o ano inteiro — ver a mesma nota em professor/page.tsx.
            OR: [{ semestre: semestreAtual }, { cadeiraCurricular: { eMonografia: true } }],
          },
    include: {
      disciplina: true,
      horarioSlots: true,
      avaliacoes: true,
      // Roster real da disciplina (InscricaoCadeira ativa) — não turma._count.matriculas, que
      // não vê repetentes cuja Matricula está numa turma diferente (§4.2).
      _count: { select: { inscricoes: { where: { ativa: true } } } },
    },
  });

  const totalAlunos = turmaDisciplinas.reduce((sum, td) => sum + td._count.inscricoes, 0);

  const proximasAulas = turmaDisciplinas
    .flatMap((td) => td.horarioSlots.map((slot) => ({ ...slot, disciplinaNome: td.disciplina.nome })))
    .sort((a, b) => diasAteProximo(a.diaSemana, agora) - diasAteProximo(b.diaSemana, agora))
    .slice(0, 5);

  // "Próximas" = ainda não vencidas, tal como no dashboard do aluno — sem este filtro, provas já
  // realizadas ficavam no topo da lista por ordenação de data. A prova de HOJE conta como próxima
  // (provaJaPassou compara por dia): comparar com `agora` fazia-a desaparecer da lista logo de
  // manhã, no dia em que o professor mais precisa de a ver.
  const proximasProvas = turmaDisciplinas
    .flatMap((td) => td.avaliacoes.map((av) => ({ ...av, disciplinaNome: td.disciplina.nome })))
    .filter((av) => !provaJaPassou(av.data, agora))
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Página Inicial</h1>
        <p className="text-sm text-texto-suave">Olá, {professor.nome.split(" ")[0]}. Aqui está o resumo da sua atividade docente.</p>
      </div>

      <ProfileCard
        nome={professor.nome}
        cargo="Professor"
        campos={[
          { label: "Especialidade", value: professor.especialidade },
          { label: "Email", value: professor.email },
          { label: "Ano Letivo", value: anoLetivo !== null ? formatAnoLetivo(anoLetivo) : "Sem ano letivo a decorrer" },
          { label: "Semestre", value: `${semestreAtual}º Semestre` },
        ]}
      />

      {/* Um ecrã vazio sem explicação faz o professor pensar que o sistema está avariado. Estas
          mensagens dizem-lhe o que se passa e a quem falar — não o deixam a adivinhar. */}
      {anoLetivo === null ? (
        <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Não há nenhum ano letivo a decorrer neste momento, por isso não aparecem disciplinas nem aulas. Isto é normal
          entre anos letivos. Se acha que é engano, fale com o DAAC.
        </p>
      ) : turmaDisciplinas.length === 0 ? (
        <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Ainda não tem disciplinas atribuídas no {semestreAtual}º semestre de {formatAnoLetivo(anoLetivo)}. É o DAAC
          que faz essa atribuição — fale com o DAAC se estiver à espera de leccionar este semestre.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Disciplinas" value={turmaDisciplinas.length} icon={<GraduationCap size={20} />} />
        <StatCard label="Total de alunos" value={totalAlunos} icon={<Users size={20} />} />

        <Link href="/professor">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">Ver</p>
              <p className="text-lg font-bold text-texto">Minhas Disciplinas</p>
            </div>
          </Card>
        </Link>

        <Link href="/horario">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <CalendarClock size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">Ver</p>
              <p className="text-lg font-bold text-texto">Meu Horário</p>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Próximas aulas"
            subtitle="Resumo do horário semanal"
            action={
              <Link href="/horario" className="text-texto-suave hover:text-navy-500" aria-label="Ver horário completo">
                <CalendarClock size={18} />
              </Link>
            }
          />
          {proximasAulas.length === 0 ? (
            <EmptyState
              message={
                turmaDisciplinas.length === 0
                  ? "Sem disciplinas atribuídas neste semestre."
                  : "As suas disciplinas ainda não têm horário marcado. É o DAAC que o define."
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {proximasAulas.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-texto">{slot.disciplinaNome}</p>
                    <p className="text-xs text-texto-suave">
                      {DIA_SEMANA_LABEL[slot.diaSemana]} · {slot.horaInicio}–{slot.horaFim} · {slot.sala}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Próximas provas" />
          {proximasProvas.length === 0 ? (
            <EmptyState
              message={
                turmaDisciplinas.length === 0
                  ? "Sem disciplinas atribuídas neste semestre."
                  : "Nenhuma prova por realizar. O DAAC agenda as provas em Horário e Provas."
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {proximasProvas.map((prova) => (
                <div key={prova.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-texto">
                      {EPOCA_LABEL[prova.epoca]} · {prova.disciplinaNome}
                    </p>
                    <p className="text-xs text-texto-suave">{prova.sala ?? "Sala a confirmar"}</p>
                  </div>
                  <Badge tone={provaJaPassou(prova.data, agora) ? "neutral" : "info"}>{formatDate(prova.data)}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
