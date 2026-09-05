import { redirect } from "next/navigation";
import { CalendarClock, Mail, MapPin, Phone } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { calcularNotaFinal, extrairNotasPorEpoca, rotuloEstado, toneEstado } from "@/lib/avaliacao";
import { formatDate, formatHora } from "@/lib/utils";

/**
 * Finalista — tudo o que diz respeito à monografia deste aluno: quem o orienta, como o contactar,
 * quando e onde é a defesa, e a nota depois de lançada (§pedido do cliente 2026-09-04, alargado e
 * renomeado a 2026-09-05: antes chamava-se "Meu Orientador", que era o nome de um campo e não da
 * página).
 *
 * A data da defesa vem de InscricaoCadeira.defesaData — individual. Até 2026-09-05 vinha da
 * Avaliacao da turma-disciplina, partilhada: três finalistas do mesmo curso viam os três a mesma
 * data, que podia ser a de outra pessoa. Agora é estruturalmente impossível ver a defesa de outrem.
 *
 * A monografia mais recente, não a do ano corrente: quem já defendeu continua a poder ver quem o
 * orientou e que nota teve. O menu só mostra esta página a quem tem monografia (ver DashboardShell),
 * mas quem chegar por URL sem ter uma vê a explicação em vez de um erro.
 */
export default async function FinalistaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const inscricao = await prisma.inscricaoCadeira.findFirst({
    where: { alunoId: session.user.alunoId, eMonografiaAplicada: true },
    include: {
      orientador: true,
      notas: { include: { avaliacao: true } },
      turmaDisciplina: { include: { disciplina: true, turma: { include: { curso: true } } } },
    },
    orderBy: { turmaDisciplina: { turma: { anoLetivo: "desc" } } },
  });

  if (!inscricao) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-texto">Finalista</h1>
        </div>
        <Card>
          <EmptyState message="Ainda não tem a monografia atribuída. Ela é atribuída na secretaria, depois de pago o respectivo emolumento — esta página passa a ter conteúdo nessa altura." />
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
  const orientador = inscricao.orientador;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Finalista</h1>
        <p className="text-sm text-texto-suave">
          {inscricao.turmaDisciplina.disciplina.nome} · {inscricao.turmaDisciplina.turma.curso.nome} ·{" "}
          {inscricao.turmaDisciplina.turma.anoCurricular}º Ano
        </p>
      </div>

      {/* A defesa primeiro: é a data que o finalista vem cá ver. */}
      <Card>
        <CardHeader title="A minha defesa" />
        <CardBody className="flex flex-col gap-3">
          {inscricao.defesaData ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <span className="flex items-center gap-2 text-texto">
                <CalendarClock size={18} className="shrink-0 text-texto-suave" />
                <span>
                  <strong className="text-lg">{formatDate(inscricao.defesaData)}</strong>
                  <span className="ml-2">às {formatHora(inscricao.defesaData)}</span>
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm text-texto">
                <MapPin size={16} className="shrink-0 text-texto-suave" />
                {inscricao.defesaSala ?? "Sala por confirmar"}
              </span>
            </div>
          ) : (
            <p className="text-sm text-texto-suave">
              A data da defesa ainda não foi marcada. É o DAAC que a marca, depois de lhe ser atribuído o orientador.
            </p>
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
    </div>
  );
}
