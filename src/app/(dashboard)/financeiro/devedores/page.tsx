import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { getListaDevedores } from "@/lib/financeiro";

interface DevedoresPageProps {
  searchParams: Promise<{ sort?: string }>;
}

export default async function DevedoresPage({ searchParams }: DevedoresPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const { sort } = await searchParams;
  const ordenacao = sort === "valor" ? "valor" : "antiguidade";
  const devedores = await getListaDevedores(ordenacao);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Lista de Devedores</h1>
        <p className="text-sm text-navy-400">Alunos com propinas em atraso além do período de tolerância.</p>
      </div>

      <Card>
        <CardHeader
          title="Alunos em dívida"
          subtitle={`${devedores.length} aluno(s)`}
          action={
            <div className="flex overflow-hidden rounded-lg border border-navy-100 text-xs font-medium">
              <Link
                href="?sort=antiguidade"
                className={`px-3 py-1.5 ${ordenacao === "antiguidade" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
              >
                Antiguidade
              </Link>
              <Link
                href="?sort=valor"
                className={`px-3 py-1.5 ${ordenacao === "valor" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
              >
                Valor
              </Link>
            </div>
          }
        />
        <CardBody>
          {devedores.length === 0 ? (
            <EmptyState message="Sem alunos em dívida." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Aluno</Th>
                  <Th>Curso/Ano</Th>
                  <Th>Valor em dívida</Th>
                  <Th>Meses em atraso</Th>
                </tr>
              </Thead>
              <Tbody>
                {devedores.map((d) => (
                  <Tr key={d.alunoId}>
                    <Td>
                      <Link href={`/alunos/${d.alunoId}`} className="font-medium text-navy-900 hover:underline">
                        {d.nome}
                      </Link>
                      <p className="text-xs text-navy-400">{d.numeroEstudante}</p>
                    </Td>
                    <Td>
                      {d.curso} · {d.anoCurricular}º Ano
                    </Td>
                    <Td className="font-semibold text-navy-900">{formatCurrency(d.valorEmDivida)}</Td>
                    <Td>
                      <Badge tone="danger">{d.mesesEmAtraso} mês(es)</Badge>
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
