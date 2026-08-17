import Link from "next/link";
import { CalendarClock, GraduationCap, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { ProfileCard } from "./ProfileCard";
import { DIA_SEMANA_LABEL, diasAteProximo, formatDate } from "@/lib/utils";
import { EPOCA_LABEL } from "@/lib/avaliacao";
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
  const agora = getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const anoAtual = agora.getFullYear();
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { professorId, turma: { anoLetivo: anoAtual }, semestre: semestreAtual },
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
  // realizadas ficavam no topo da lista por ordenação de data.
  const proximasProvas = turmaDisciplinas
    .flatMap((td) => td.avaliacoes.map((av) => ({ ...av, disciplinaNome: td.disciplina.nome })))
    .filter((av) => av.data >= agora)
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Página Inicial</h1>
        <p className="text-sm text-navy-400">Olá, {professor.nome.split(" ")[0]}. Aqui está o resumo da sua atividade docente.</p>
      </div>

      <ProfileCard
        nome={professor.nome}
        cargo="Professor"
        campos={[
          { label: "Especialidade", value: professor.especialidade },
          { label: "Email", value: professor.email },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Disciplinas" value={turmaDisciplinas.length} icon={<GraduationCap size={20} />} />
        <StatCard label="Total de alunos" value={totalAlunos} icon={<Users size={20} />} />

        <Link href="/professor">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Ver</p>
              <p className="text-lg font-bold text-navy-900">Minhas Disciplinas</p>
            </div>
          </Card>
        </Link>

        <Link href="/horario">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <CalendarClock size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Ver</p>
              <p className="text-lg font-bold text-navy-900">Meu Horário</p>
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
              <Link href="/horario" className="text-navy-300 hover:text-navy-500" aria-label="Ver horário completo">
                <CalendarClock size={18} />
              </Link>
            }
          />
          {proximasAulas.length === 0 ? (
            <EmptyState message="Sem aulas agendadas." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {proximasAulas.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-navy-800">{slot.disciplinaNome}</p>
                    <p className="text-xs text-navy-400">
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
            <EmptyState message="Sem provas agendadas." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {proximasProvas.map((prova) => (
                <div key={prova.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-navy-800">
                      {EPOCA_LABEL[prova.epoca]} · {prova.disciplinaNome}
                    </p>
                    <p className="text-xs text-navy-400">{prova.sala ?? "Sala a confirmar"}</p>
                  </div>
                  <Badge tone={prova.data >= agora ? "info" : "neutral"}>{formatDate(prova.data)}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
