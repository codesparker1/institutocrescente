import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Table";
import { ScheduleGrid, type TurmaDisciplinaComHorario } from "@/components/horario/ScheduleGrid";
import { PERIODO_LABEL, parseIntParam } from "@/lib/utils";
import { podeGerirCurriculo } from "@/lib/permissions";
import { calcularNotaFinal, extrairNotasPorEpoca, epocasVisiveis } from "@/lib/avaliacao";

const TURMA_DISCIPLINA_INCLUDE = {
  disciplina: true,
  horarioSlots: true,
  avaliacoes: true,
} as const;

interface HorarioPageProps {
  searchParams: Promise<{ cursoId?: string; anoCurricular?: string; periodo?: string; view?: string }>;
}

export default async function HorarioPage({ searchParams }: HorarioPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "SECRETARIA") redirect("/dashboard");

  const { role } = session.user;
  const params = await searchParams;
  const view: "aulas" | "provas" = params.view === "provas" ? "provas" : "aulas";

  if (role === "PROFESSOR" || role === "ALUNO") {
    let turmaDisciplinas: TurmaDisciplinaComHorario[] = [];
    let subtitle = "";

    if (role === "PROFESSOR") {
      if (!session.user.professorId) redirect("/dashboard");
      const rows = await prisma.turmaDisciplina.findMany({
        where: { professorId: session.user.professorId },
        include: { ...TURMA_DISCIPLINA_INCLUDE, turma: { include: { curso: true } } },
      });
      turmaDisciplinas = rows.map((r) => ({
        ...r,
        cursoAnoLabel: `${r.turma.curso.nome} · ${r.turma.anoCurricular}º Ano`,
      }));
      subtitle = "Horário das suas disciplinas.";
    } else {
      if (!session.user.alunoId) redirect("/dashboard");
      // Por InscricaoCadeira, não pela Matricula — um repetente frequenta cadeiras cujas
      // TurmaDisciplina pertencem a uma Turma de ano diferente da sua matrícula atual (§4.2).
      const inscricoes = await prisma.inscricaoCadeira.findMany({
        where: { alunoId: session.user.alunoId, ativa: true },
        include: {
          turmaDisciplina: { include: { ...TURMA_DISCIPLINA_INCLUDE, turma: { include: { curso: true } } } },
          notas: { include: { avaliacao: true } },
        },
      });
      turmaDisciplinas = inscricoes.map((i) => {
        const notasCadeira = extrairNotasPorEpoca(i.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })));
        const estado = calcularNotaFinal(notasCadeira, {
          permiteDispensa: i.permiteDispensaAplicada,
          notaMinimaDispensa: Number(i.notaMinimaDispensaAplicada),
        }).estado;
        // Não mostrar Recurso/Exame Especial a quem já foi dispensado ou aprovado sem precisar deles.
        const visiveis = new Set(epocasVisiveis(notasCadeira, estado));
        return {
          ...i.turmaDisciplina,
          avaliacoes: i.turmaDisciplina.avaliacoes.filter((av) => visiveis.has(av.epoca)),
          cursoAnoLabel: `${i.turmaDisciplina.turma.curso.nome} · ${i.turmaDisciplina.turma.anoCurricular}º Ano`,
          // tentativa > 1 é exatamente "está a repetir": a rematrícula cria a inscrição nova com a
          // tentativa incrementada (processarRematriculaAction). Sai numa grelha própria — pode
          // colidir na hora com o ano corrente, e o aluno escolhe a que assiste.
          emRepeticao: i.tentativa > 1,
        };
      });
      const repetidas = turmaDisciplinas.filter((td) => td.emRepeticao).length;
      subtitle =
        repetidas > 0
          ? `O seu horário de aulas e provas — ${repetidas} cadeira(s) em repetição, mostradas em separado.`
          : "O seu horário de aulas e provas.";
    }

    return (
      <div className="flex flex-col gap-6">
        <HorarioHeader subtitle={subtitle} view={view} baseQuery={{}} />
        <ScheduleGrid turmaDisciplinas={turmaDisciplinas} view={view} editable={false} canPrint={role !== "ALUNO"} />
      </div>
    );
  }

  // ADMIN: escolher curso + ano + período primeiro.
  const cursos = await prisma.curso.findMany({ orderBy: { nome: "asc" } });
  const cursoId = params.cursoId ?? cursos[0]?.id ?? "";
  const anoCurricular = parseIntParam(params.anoCurricular) ?? 1;
  const periodo = params.periodo ?? "MATUTINO";

  const turma = cursoId
    ? await prisma.turma.findFirst({
        where: { cursoId, anoCurricular, periodo: periodo as "MATUTINO" | "VESPERTINO" | "NOTURNO" },
        include: { curso: true, turmaDisciplinas: { include: TURMA_DISCIPLINA_INCLUDE } },
        orderBy: { anoLetivo: "desc" },
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <HorarioHeader
        subtitle="Gerir horário de aulas e provas."
        view={view}
        baseQuery={{ cursoId, anoCurricular: String(anoCurricular), periodo }}
      />

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Curso" htmlFor="cursoId">
              <Select id="cursoId" name="cursoId" defaultValue={cursoId}>
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ano curricular" htmlFor="anoCurricular">
              <Select id="anoCurricular" name="anoCurricular" defaultValue={String(anoCurricular)}>
                {[1, 2, 3, 4, 5, 6].map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}º Ano
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Período" htmlFor="periodo">
              <Select id="periodo" name="periodo" defaultValue={periodo}>
                <option value="MATUTINO">Matutino</option>
                <option value="VESPERTINO">Vespertino</option>
                <option value="NOTURNO">Noturno</option>
              </Select>
            </Field>
            <input type="hidden" name="view" value={view} />
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Filtrar
            </button>
          </form>
        </CardBody>
      </Card>

      {!turma ? (
        <EmptyState message="Nenhuma turma encontrada para este curso, ano e período. Crie-a em Admin → Turmas." />
      ) : (
        <>
          <p className="text-sm font-medium text-navy-700">
            {turma.curso.nome} · {turma.anoCurricular}º Ano · {PERIODO_LABEL[turma.periodo]}
          </p>
          <ScheduleGrid turmaDisciplinas={turma.turmaDisciplinas} view={view} editable={podeGerirCurriculo(session.user)} />
        </>
      )}
    </div>
  );
}

function HorarioHeader({
  subtitle,
  view,
  baseQuery,
}: {
  subtitle: string;
  view: "aulas" | "provas";
  baseQuery: Record<string, string>;
}) {
  const query = new URLSearchParams(baseQuery);
  const aulasQuery = new URLSearchParams(query);
  aulasQuery.set("view", "aulas");
  const provasQuery = new URLSearchParams(query);
  provasQuery.set("view", "provas");

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Horário</h1>
        <p className="text-sm text-navy-400">{subtitle}</p>
      </div>
      <div className="flex overflow-hidden rounded-lg border border-navy-100">
        <a
          href={`?${aulasQuery.toString()}`}
          className={`px-4 py-1.5 text-sm font-medium ${view === "aulas" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
        >
          Aulas
        </a>
        <a
          href={`?${provasQuery.toString()}`}
          className={`px-4 py-1.5 text-sm font-medium ${view === "provas" ? "bg-navy-700 text-gold-100" : "bg-white text-navy-500 hover:bg-navy-50"}`}
        >
          Provas
        </a>
      </div>
    </div>
  );
}
