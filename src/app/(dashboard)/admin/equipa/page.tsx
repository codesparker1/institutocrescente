import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteStaffUserAction } from "@/actions/admin";
import { CreateStaffForm } from "./CreateStaffForm";
import { formatDate } from "@/lib/utils";

export default async function AdminEquipaPage() {
  const staff = await prisma.user.findMany({
    where: { role: { in: ["DAAC", "SECRETARIA"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Equipa (DAAC e Secretaria)</h1>
        <p className="text-sm text-navy-400">Contas de staff do DAAC e da Secretaria — exclusivo do ADMIN.</p>
      </div>

      <Card>
        <CardHeader title="Contas" subtitle={`${staff.length} conta(s)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateStaffForm />

          {staff.length === 0 ? (
            <EmptyState message="Nenhuma conta de DAAC/Secretaria cadastrada." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Email</Th>
                  <Th>Papel</Th>
                  <Th>Criada em</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {staff.map((user) => (
                  <Tr key={user.id}>
                    <Td className="font-medium text-navy-900">{user.name}</Td>
                    <Td>{user.email}</Td>
                    <Td>
                      <Badge tone={user.role === "DAAC" ? "info" : "neutral"}>{user.role}</Badge>
                    </Td>
                    <Td>{formatDate(user.createdAt)}</Td>
                    <Td className="text-right">
                      <DeleteButtonForm action={deleteStaffUserAction} id={user.id} />
                    </Td>
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
