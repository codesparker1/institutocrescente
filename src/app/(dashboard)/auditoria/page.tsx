import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Prisma, Role } from "@/generated/prisma/client";

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

interface AuditoriaPageProps {
  searchParams: Promise<{ q?: string; papel?: string; entidade?: string }>;
}

export default async function AuditoriaPage({ searchParams }: AuditoriaPageProps) {
  const { q, papel, entidade } = await searchParams;

  const where: Prisma.AuditLogWhereInput = {};
  if (q) {
    where.OR = [
      { userName: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
    ];
  }
  if (papel) where.userRole = papel as Role;
  if (entidade) where.entityType = entidade;

  const [logs, entidades] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Registo de Auditoria</h1>
        <p className="text-sm text-navy-400">
          Registo de todas as ações realizadas no sistema — utilizador, papel, ação e endereço IP.
        </p>
      </div>

      <Card>
        <CardHeader title="Histórico de ações" subtitle={`${logs.length} registo(s) mais recentes`} />
        <CardBody className="flex flex-col gap-4">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <Input type="search" name="q" defaultValue={q} placeholder="Utilizador ou ação..." />
            <Select name="papel" defaultValue={papel ?? ""}>
              <option value="">Todos os papéis</option>
              <option value="ADMIN">Administrador</option>
              <option value="SECRETARIA">Secretaria</option>
              <option value="PROFESSOR">Professor</option>
              <option value="ALUNO">Aluno</option>
            </Select>
            <Select name="entidade" defaultValue={entidade ?? ""}>
              <option value="">Todas as entidades</option>
              {entidades.map((e) => (
                <option key={e.entityType} value={e.entityType}>
                  {e.entityType}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Filtrar
            </button>
          </form>

          {logs.length === 0 ? (
            <EmptyState message="Sem registos de auditoria para os filtros selecionados." />
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
        </CardBody>
      </Card>
    </div>
  );
}
