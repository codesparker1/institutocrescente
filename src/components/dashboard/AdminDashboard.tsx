import { Users, GraduationCap, ClipboardCheck, ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

export async function AdminDashboard() {
  const [totalAlunos, totalTurmas, totalNotas, ultimasAuditorias] = await Promise.all([
    prisma.aluno.count({ where: { status: "ATIVO" } }),
    prisma.turma.count(),
    prisma.nota.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Visão Geral</h1>
        <p className="text-sm text-navy-400">Resumo do sistema de gestão académica do ISPC.</p>
      </div>

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
