import Link from "next/link";
import { CalendarClock, ClipboardCheck, GraduationCap, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { DIA_SEMANA_LABEL, PERIODO_LABEL, diasAteProximo, formatDate } from "@/lib/utils";

interface AlunoDashboardProps {
  alunoId: string;
}

export async function AlunoDashboard({ alunoId }: AlunoDashboardProps) {
  const aluno = await prisma.aluno.findUnique({
    where: { id: alunoId },
    include: {
      matriculas: {
        where: { status: "ATIVA" },
        include: {
          turma: { include: { disciplina: true, professor: true, horarioSlots: true, avaliacoes: true } },
          notas: { include: { avaliacao: true } },
          frequencias: true,
        },
      },
    },
  });

  if (!aluno) {
    return <EmptyState message="Aluno não encontrado." />;
  }

  const todasNotas = aluno.matriculas.flatMap((m) => m.notas.map((n) => Number(n.valor)));
  const mediaGeral = todasNotas.length > 0 ? todasNotas.reduce((a, b) => a + b, 0) / todasNotas.length : null;

  const todasFrequencias = aluno.matriculas.flatMap((m) => m.frequencias);
  const presencas = todasFrequencias.filter((f) => f.presente).length;
  const percentualPresenca = todasFrequencias.length > 0 ? Math.round((presencas / todasFrequencias.length) * 100) : null;

  const proximasAulas = aluno.matriculas
    .flatMap((m) => m.turma.horarioSlots.map((slot) => ({ ...slot, turmaNome: m.turma.nome })))
    .sort((a, b) => diasAteProximo(a.diaSemana) - diasAteProximo(b.diaSemana))
    .slice(0, 5);

  const hoje = new Date();
  const proximasProvas = aluno.matriculas
    .flatMap((m) => m.turma.avaliacoes.map((av) => ({ ...av, turmaNome: m.turma.nome })))
    .filter((av) => av.data >= hoje)
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Olá, {aluno.nome.split(" ")[0]}</h1>
        <p className="text-sm text-navy-400">
          {aluno.numeroEstudante} · {aluno.curso} · {aluno.anoCurricular}º Ano
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Média geral" value={mediaGeral !== null ? mediaGeral.toFixed(1) : "—"} icon={<TrendingUp size={20} />} />
        <StatCard label="Assiduidade" value={percentualPresenca !== null ? `${percentualPresenca}%` : "—"} icon={<ClipboardCheck size={20} />} />
        <StatCard label="Disciplinas ativas" value={aluno.matriculas.length} icon={<GraduationCap size={20} />} />
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
                    <p className="font-medium text-navy-800">{slot.turmaNome}</p>
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
                      {prova.nome} · {prova.turmaNome}
                    </p>
                    <p className="text-xs text-navy-400">{prova.sala ?? "Sala a confirmar"}</p>
                  </div>
                  <Badge tone="info">{formatDate(prova.data)}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Minhas disciplinas" subtitle={`${aluno.matriculas.length} disciplina(s) ativa(s)`} />
        {aluno.matriculas.length === 0 ? (
          <EmptyState message="Sem matrículas ativas." />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {aluno.matriculas.map((matricula) => (
              <div key={matricula.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-navy-800">{matricula.turma.nome}</p>
                  <p className="text-xs text-navy-400">
                    {matricula.turma.professor.nome} · {PERIODO_LABEL[matricula.turma.periodo]}
                  </p>
                </div>
                <span className="text-xs text-navy-400">
                  {matricula.notas.length === 0
                    ? "Sem notas"
                    : matricula.notas.map((n) => `${n.avaliacao.nome}: ${Number(n.valor)}`).join(" · ")}
                </span>
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
