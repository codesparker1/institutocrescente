import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { formatCurrency } from "@/lib/utils";
import type { EmolumentoCatalogo } from "@/lib/financeiro";

interface CatalogoEmolumentosProps {
  emolumentos: EmolumentoCatalogo[];
}

export function CatalogoEmolumentos({ emolumentos }: CatalogoEmolumentosProps) {
  if (emolumentos.length === 0) {
    return <EmptyState message="Nenhum emolumento disponível no momento." />;
  }

  return (
    <Table>
      <Thead>
        <tr>
          <Th>Emolumento</Th>
          <Th>Descrição</Th>
          <Th>Valor</Th>
        </tr>
      </Thead>
      <Tbody>
        {emolumentos.map((e) => (
          <Tr key={e.id}>
            <Td className="font-medium text-texto">{e.nome}</Td>
            <Td className="text-texto-suave">{e.descricao ?? "—"}</Td>
            <Td className="font-semibold text-texto">{formatCurrency(e.valor)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
