import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Printer } from "lucide-react";
import { formatCurrency, turmaLabel, parseIntParam, formatAnoLetivo, formatSituacaoDivida } from "@/lib/utils";
import { getListaDevedores } from "@/lib/financeiro";
import { podeRegistarPagamento } from "@/lib/permissions";
import type { CategoriaEstudante, Periodo } from "@/generated/prisma/client";

const CATEGORIA_LABEL: Record<CategoriaEstudante, string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

interface DevedoresPageProps {
  searchParams: Promise<{
    sort?: string;
    curso?: string;
    turmaId?: string;
    anoLetivo?: string;
    periodo?: string;
    categoria?: string;
  }>;
}

export default async function DevedoresPage({ searchParams }: DevedoresPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!podeRegistarPagamento(session.user)) redirect("/dashboard");

  const { sort, curso, turmaId, anoLetivo, periodo, categoria } = await searchParams;
  const ordenacao = sort === "valor" ? "valor" : sort === "nome" ? "nome" : "antiguidade";

  const [cursos, turmas, anosLetivos] = await Promise.all([
    prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.turma.findMany({
      orderBy: [{ anoLetivo: "desc" }, { anoCurricular: "asc" }],
      select: { id: true, anoCurricular: true, periodo: true, anoLetivo: true, curso: { select: { nome: true } } },
    }),
    prisma.turma.findMany({ distinct: ["anoLetivo"], select: { anoLetivo: true }, orderBy: { anoLetivo: "desc" } }),
  ]);

  const devedores = await getListaDevedores({
    sort: ordenacao,
    curso: curso || undefined,
    turmaId: turmaId || undefined,
    anoLetivo: parseIntParam(anoLetivo),
    periodo: (periodo || undefined) as Periodo | undefined,
    categoria: (categoria || undefined) as CategoriaEstudante | undefined,
  });

  const filtrosQuery = new URLSearchParams();
  if (curso) filtrosQuery.set("curso", curso);
  if (turmaId) filtrosQuery.set("turmaId", turmaId);
  if (anoLetivo) filtrosQuery.set("anoLetivo", anoLetivo);
  if (periodo) filtrosQuery.set("periodo", periodo);
  if (categoria) filtrosQuery.set("categoria", categoria);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Lista de Devedores</h1>
        <p className="text-sm text-navy-400">Alunos com propinas ou multas em atraso além do período de tolerância.</p>
      </div>

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
            <Select name="curso" defaultValue={curso ?? ""}>
              <option value="">Todos os cursos</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Select name="turmaId" defaultValue={turmaId ?? ""}>
              <option value="">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {turmaLabel(t)}
                </option>
              ))}
            </Select>
            <Select name="anoLetivo" defaultValue={anoLetivo ?? ""}>
              <option value="">Todos os anos letivos</option>
              {anosLetivos.map((a) => (
                <option key={a.anoLetivo} value={a.anoLetivo}>
                  {formatAnoLetivo(a.anoLetivo)}
                </option>
              ))}
            </Select>
            <Select name="periodo" defaultValue={periodo ?? ""}>
              <option value="">Todos os períodos</option>
              <option value="MATUTINO">Matutino</option>
              <option value="VESPERTINO">Vespertino</option>
              <option value="NOTURNO">Noturno</option>
            </Select>
            <Select name="categoria" defaultValue={categoria ?? ""}>
              <option value="">Todas as categorias</option>
              {Object.entries(CATEGORIA_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 sm:col-span-5 sm:w-fit"
            >
              Filtrar
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Alunos em dívida"
          subtitle={`${devedores.length} aluno(s)`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-navy-100 text-xs font-medium">
                <Link
                  href={`?${new URLSearchParams({ ...Object.fromEntries(filtrosQuery), sort: "antiguidade" })}`}
                  className={`px-3 py-1.5 ${ordenacao === "antiguidade" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
                >
                  Antiguidade
                </Link>
                <Link
                  href={`?${new URLSearchParams({ ...Object.fromEntries(filtrosQuery), sort: "valor" })}`}
                  className={`px-3 py-1.5 ${ordenacao === "valor" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
                >
                  Valor
                </Link>
                <Link
                  href={`?${new URLSearchParams({ ...Object.fromEntries(filtrosQuery), sort: "nome" })}`}
                  className={`px-3 py-1.5 ${ordenacao === "nome" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
                >
                  Nome
                </Link>
              </div>
              <a
                href={`/api/devedores?${new URLSearchParams({ ...Object.fromEntries(filtrosQuery), sort: ordenacao })}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-navy-100 bg-white px-3 py-1.5 text-xs font-medium text-navy-500 hover:bg-navy-50"
              >
                <Printer size={14} />
                Imprimir
              </a>
            </div>
          }
        />
        <CardBody>
          {devedores.length === 0 ? (
            <EmptyState message="Sem alunos em dívida para os filtros selecionados." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Aluno</Th>
                  <Th>Curso/Ano</Th>
                  <Th>Categoria</Th>
                  <Th>Valor em dívida</Th>
                  <Th>Situação</Th>
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
                    <Td>{CATEGORIA_LABEL[d.categoria]}</Td>
                    <Td className="font-semibold text-navy-900">{formatCurrency(d.valorEmDivida)}</Td>
                    <Td>
                      <Badge tone="danger">{formatSituacaoDivida(d.mesesPropinaEmAtraso, d.temMultaEmAtraso)}</Badge>
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
