import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/Table";
import { PrecoPropinaCell } from "./PrecoPropinaCell";
import { PercentagemAgravamentoForm } from "./PercentagemAgravamentoForm";
import type { CategoriaEstudante } from "@/generated/prisma/client";

const CATEGORIAS: CategoriaEstudante[] = ["NORMAL", "BOLSEIRO_INAGBE", "COMPARTICIPADA"];
const CATEGORIA_LABEL: Record<CategoriaEstudante, string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

export default async function AdminPrecosPage() {
  const [maxDuracao, precos, config] = await Promise.all([
    prisma.curso.aggregate({ _max: { duracaoAnos: true } }),
    prisma.precoPropina.findMany(),
    prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } }),
  ]);
  // Todos os cursos partilham o mesmo preço (§pedido do cliente 2026-08-18) — a grelha cobre até
  // ao curso mais longo atualmente cadastrado, nunca um número fixo que ficaria desatualizado.
  const anos = Array.from({ length: maxDuracao._max.duracaoAnos ?? 5 }, (_, i) => i + 1);
  const precoPorChave = new Map(precos.map((p) => [`${p.categoria}:${p.anoCurricular}`, Number(p.valor)]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Preços de Propina</h1>
        <p className="text-sm text-navy-400">
          Preço mensal por categoria de estudante e ano curricular — igual em todos os cursos.
        </p>
      </div>

      <Card>
        <CardHeader title="Grelha de preços" subtitle="Grave ao sair do campo" />
        <CardBody>
          <Table>
            <Thead>
              <tr>
                <Th>Ano curricular</Th>
                {CATEGORIAS.map((c) => (
                  <Th key={c}>{CATEGORIA_LABEL[c]}</Th>
                ))}
              </tr>
            </Thead>
            <Tbody>
              {anos.map((ano) => (
                <Tr key={ano}>
                  <Td className="font-medium text-navy-900">{ano}º Ano</Td>
                  {CATEGORIAS.map((categoria) => (
                    <Td key={categoria}>
                      <PrecoPropinaCell categoria={categoria} anoCurricular={ano} valorInicial={precoPorChave.get(`${categoria}:${ano}`) ?? null} />
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Agravamento por cadeira em repetição"
          subtitle="Aplicado sobre o valor base da mensalidade de quem ainda arrasta cadeiras reprovadas do ano anterior"
        />
        <CardBody>
          <PercentagemAgravamentoForm valorInicial={Number(config?.percentagemAgravamentoPorCadeira ?? 0)} />
        </CardBody>
      </Card>
    </div>
  );
}
