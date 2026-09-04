import { redirect } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { calcularNotaFinal, extrairNotasPorEpoca, rotuloEstado, toneEstado } from "@/lib/avaliacao";
import { formatDate } from "@/lib/utils";

/**
 * Meu Orientador — quem orienta a monografia deste aluno, como o contactar, quando é a defesa e,
 * depois de lançada, a nota (§pedido do cliente 2026-09-04).
 *
 * A monografia mais recente, não a do ano corrente: se o aluno já defendeu, continua a poder ver
 * quem o orientou e que nota teve. O menu só mostra esta página a quem tem monografia (ver
 * DashboardShell), mas quem chegar por URL sem ter uma vê a explicação em vez de um erro.
 */
export default async function MeuOrientadorPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const inscricao = await prisma.inscricaoCadeira.findFirst({
    where: { alunoId: session.user.alunoId, eMonografiaAplicada: true },
    include: {
      orientador: true,
      notas: { include: { avaliacao: true } },
      turmaDisciplina: { include: { disciplina: true, avaliacoes: true, turma: true } },
    },
    orderBy: { turmaDisciplina: { turma: { anoLetivo: "desc" } } },
  });

  if (!inscricao) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-texto">Meu Orientador</h1>
        </div>
        <Card>
          <EmptyState message="Ainda não está inscrito numa monografia. Esta página passa a ter conteúdo no último ano do curso." />
        </Card>
      </div>
    );
  }

  const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
  const resultado = calcularNotaFinal(extrairNotasPorEpoca(notas), {
    permiteDispensa: inscricao.permiteDispensaAplicada,
    notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    eMonografia: inscricao.eMonografiaAplicada,
  });
  const defesa = inscricao.turmaDisciplina.avaliacoes.find((a) => a.epoca === "EXAME");
  const orientador = inscricao.orientador;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Meu Orientador</h1>
        <p className="text-sm text-texto-suave">
          {inscricao.turmaDisciplina.disciplina.nome} · {inscricao.turmaDisciplina.turma.anoCurricular}º Ano
        </p>
      </div>

      <Card>
        <CardHeader title="Orientador" />
        <CardBody>
          {orientador ? (
            <div className="flex flex-col gap-2">
              <p className="text-lg font-semibold text-texto">{orientador.nome}</p>
              <p className="text-sm text-texto-suave">{orientador.especialidade}</p>
              <div className="mt-1 flex flex-col gap-1.5 text-sm text-texto">
                <span className="flex items-center gap-2">
                  <Mail size={15} className="shrink-0 text-texto-suave" />
                  <a href={`mailto:${orientador.email}`} className="hover:underline">
                    {orientador.email}
                  </a>
                </span>
                <span className="flex items-center gap-2">
                  <Phone size={15} className="shrink-0 text-texto-suave" />
                  {orientador.telefone}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-texto-suave">
              Ainda não lhe foi atribuído um orientador. É o DAAC que faz a atribuição — se demorar, fale com a
              secretaria.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Defesa" />
        <CardBody className="flex flex-col gap-3">
          {defesa ? (
            <p className="text-sm text-texto">
              <strong>{formatDate(defesa.data)}</strong>
              {defesa.sala ? ` · ${defesa.sala}` : ""}
            </p>
          ) : (
            <p className="text-sm text-texto-suave">A data da defesa ainda não foi marcada.</p>
          )}

          <div className="flex items-center gap-3 border-t border-navy-50 pt-3">
            <Badge tone={toneEstado(resultado.estado, false)}>{rotuloEstado(resultado.estado, false)}</Badge>
            {resultado.notaFinal !== null ? (
              <p className="text-sm text-texto">
                Nota da defesa: <strong className="text-lg">{resultado.notaFinal.toFixed(1)}</strong>
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
