import Link from "next/link";
import { Users, GraduationCap, ClipboardCheck, ScrollText, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ProfileCard } from "./ProfileCard";
import { formatAnoLetivo, formatDate } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";
import type { Role } from "@/generated/prisma/client";

const CARGO_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  SECRETARIA: "Secretaria",
  DAAC: "DAAC",
};

interface AdminDashboardProps {
  nome: string;
  email: string;
  role: Role;
}

export async function AdminDashboard({ nome, email, role }: AdminDashboardProps) {
  const [totalAlunos, totalTurmas, totalNotas, ultimasAuditorias, config, agora] = await Promise.all([
    prisma.aluno.count({ where: { status: "ATIVO" } }),
    prisma.turma.count(),
    prisma.nota.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.configuracaoAcademica.findUnique({
      where: { id: "config" },
      select: { semestreAtual: true, anoLetivoInicio: true, anoLetivoFim: true },
    }),
    getAgora(),
  ]);

  const semestreAtual = config?.semestreAtual ?? 1;
  // Do intervalo configurado, NÃO de agora.getFullYear(): em Fevereiro de 2027 o ano civil já é
  // 2027 mas o ano letivo ainda é 2026/2027, e o painel anunciava o ano errado a meio do ano.
  const anoLetivo = anoLetivoCorrente(agora, config);

  // Pendências que travam trabalho a jusante. Vivem no painel, não na página onde o problema está:
  // uma disciplina sem professor não avisa ninguém se ninguém abrir a turma, e sem professor não há
  // quem lance notas. O sistema é usado por pessoas sem formação técnica — a obrigação de reparar
  // que algo falta é dele, não delas.
  // Só do SEMESTRE a decorrer: é esse o trabalho de agora. As do outro semestre aparecem quando o
  // DAAC mudar de semestre — e a própria mudança já avisa quantas são.
  const escopoDoSemestre =
    anoLetivo === null ? null : { semestre: semestreAtual, turma: { anoLetivo } };
  const [disciplinasSemProfessor, disciplinasSemHorario, turmasSemDisciplinas] = await Promise.all([
    escopoDoSemestre === null
      ? 0
      : prisma.turmaDisciplina.count({ where: { ...escopoDoSemestre, professorId: null } }),
    escopoDoSemestre === null
      ? 0
      : prisma.turmaDisciplina.count({ where: { ...escopoDoSemestre, horarioSlots: { none: {} } } }),
    anoLetivo === null ? 0 : prisma.turma.count({ where: { anoLetivo, turmaDisciplinas: { none: {} } } }),
  ]);
  const pendencias = [
    anoLetivo === null
      ? {
          texto: "Não há nenhum ano letivo a decorrer. Sem as datas de início e fim, não é possível marcar horários nem provas.",
          href: "/admin/academico/configuracao",
          accao: "Definir datas",
        }
      : null,
    disciplinasSemProfessor > 0
      ? {
          texto: `${disciplinasSemProfessor} disciplina(s) do ${semestreAtual}º semestre sem professor. Sem professor, ninguém pode lançar notas nem marcar presenças.`,
          href: "/admin/turmas",
          accao: "Atribuir professores",
        }
      : null,
    disciplinasSemHorario > 0
      ? {
          texto: `${disciplinasSemHorario} disciplina(s) do ${semestreAtual}º semestre sem horário marcado. Os alunos não veem estas aulas no horário deles.`,
          href: "/horario",
          accao: "Marcar horário",
        }
      : null,
    turmasSemDisciplinas > 0
      ? {
          texto: `${turmasSemDisciplinas} turma(s) sem nenhuma disciplina. Os alunos dessas turmas não veem nada no horário.`,
          href: "/admin/turmas",
          accao: "Ver turmas",
        }
      : null,
  ].filter((p) => p !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Página Inicial</h1>
        <p className="text-sm text-navy-400">Resumo do sistema de gestão académica do ISPC.</p>
      </div>

      <ProfileCard
        nome={nome}
        cargo={CARGO_LABEL[role] ?? role}
        campos={[
          { label: "Email", value: email },
          { label: "Ano Letivo", value: anoLetivo !== null ? formatAnoLetivo(anoLetivo) : "Por definir" },
          { label: "Semestre", value: `${semestreAtual}º Semestre` },
        ]}
      />

      {pendencias.length > 0 ? (
        <Card>
          <CardHeader
            title="A precisar de atenção"
            subtitle={`Trabalho por fazer no ${semestreAtual}º semestre. Enquanto estiver por fazer, professores e alunos não conseguem usar estas disciplinas.`}
            action={<AlertTriangle size={18} className="text-gold-500" />}
          />
          <CardBody className="px-0 py-0">
            <ul className="divide-y divide-navy-50">
              {pendencias.map((pendencia) => (
                <li key={pendencia.href + pendencia.accao} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <p className="text-sm text-navy-700">{pendencia.texto}</p>
                  <Link
                    href={pendencia.href}
                    className="rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800"
                  >
                    {pendencia.accao}
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Alunos ativos" value={totalAlunos} icon={<Users size={20} />} />
        <StatCard label="Turmas" value={totalTurmas} icon={<GraduationCap size={20} />} />
        <StatCard label="Notas lançadas" value={totalNotas} icon={<ClipboardCheck size={20} />} />
      </div>

      <Card>
        <CardHeader title="Atividade recente" subtitle="Últimos registos de auditoria" action={<ScrollText size={18} className="text-navy-300" />} />
        <CardBody className="px-0 py-0">
          {ultimasAuditorias.length === 0 ? (
            <p className="px-5 py-6 text-sm text-navy-400">Sem atividade registada ainda.</p>
          ) : (
            <ul className="divide-y divide-navy-50">
              {ultimasAuditorias.map((log) => (
                <li key={log.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <span className="font-medium text-navy-800">{log.userName}</span>{" "}
                    <span className="text-navy-500">{log.action}</span>
                  </div>
                  <span className="text-xs text-navy-400">{formatDate(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
