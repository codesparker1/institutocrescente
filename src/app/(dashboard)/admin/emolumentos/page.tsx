import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { deleteEmolumentoAction, toggleEmolumentoAtivoAction } from "@/actions/admin";
import { CreateEmolumentoForm } from "./CreateEmolumentoForm";
import { EditarValorEmolumento } from "./EditarValorEmolumento";

export default async function AdminEmolumentosPage() {
  const emolumentos = await prisma.emolumento.findMany({ orderBy: { nome: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Emolumentos</h1>
        <p className="text-sm text-navy-400">
          Catálogo de declarações, certidões e outros serviços — visível aos alunos para solicitação.
        </p>
      </div>

      <Card>
        <CardHeader title="Emolumentos" subtitle={`${emolumentos.length} emolumento(s)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateEmolumentoForm />

          {emolumentos.length === 0 ? (
            <EmptyState message="Nenhum emolumento cadastrado." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Descrição</Th>
                  <Th>Valor (Kz)</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {emolumentos.map((emolumento) => (
                  <Tr key={emolumento.id}>
                    <Td className="font-medium text-navy-900">{emolumento.nome}</Td>
                    <Td className="text-navy-400">{emolumento.descricao ?? "—"}</Td>
                    <Td>
                      <EditarValorEmolumento emolumentoId={emolumento.id} valor={Number(emolumento.valor)} />
                    </Td>
                    <Td>
                      <form action={toggleEmolumentoAtivoAction}>
                        <input type="hidden" name="id" value={emolumento.id} />
                        <button type="submit">
                          <Badge tone={emolumento.ativo ? "success" : "neutral"}>
                            {emolumento.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </button>
                      </form>
                    </Td>
                    <Td className="text-right">
                      <form action={deleteEmolumentoAction}>
                        <input type="hidden" name="id" value={emolumento.id} />
                        <button type="submit" className="rounded-md p-1.5 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                          <Trash2 size={15} />
                        </button>
                      </form>
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
