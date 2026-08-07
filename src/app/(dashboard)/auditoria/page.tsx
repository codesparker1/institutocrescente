import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import type { Role } from "@/generated/prisma/client";

const ROLE_TONE: Record<Role, "info" | "success" | "warning" | "neutral"> = {
  ADMIN: "info",
  SECRETARIA: "success",
  PROFESSOR: "warning",
  ALUNO: "neutral",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AuditoriaPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Auditoria</h1>
        <p className="text-sm text-navy-400">
          Registo de todas as ações realizadas no sistema — utilizador, papel, ação e endereço IP.
        </p>
      </div>

      <Card>
        <CardHeader title="Histórico de ações" subtitle={`${logs.length} registo(s) mais recentes`} />
        {logs.length === 0 ? (
          <EmptyState message="Sem registos de auditoria ainda." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Data/Hora</Th>
                <Th>Utilizador</Th>
                <Th>Papel</Th>
                <Th>Ação</Th>
                <Th>Entidade</Th>
                <Th>IP</Th>
              </tr>
            </Thead>
            <Tbody>
              {logs.map((log) => (
                <Tr key={log.id}>
                  <Td className="whitespace-nowrap text-xs text-navy-400">{formatDateTime(log.createdAt)}</Td>
                  <Td className="font-medium text-navy-900">{log.userName}</Td>
                  <Td>
                    <Badge tone={ROLE_TONE[log.userRole]}>{log.userRole}</Badge>
                  </Td>
                  <Td>{log.action}</Td>
                  <Td className="text-navy-400">{log.entityType}</Td>
                  <Td className="font-mono text-xs text-navy-400">{log.ipAddress ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
