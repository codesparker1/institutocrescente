import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Table";
import { ScheduleGrid, type TurmaDisciplinaComHorario } from "@/components/horario/ScheduleGrid";
import { PERIODO_LABEL, formatAnoLetivo, parseIntParam, toIsoDate } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";
import { podeGerirCurriculo } from "@/lib/permissions";
import { calcularNotaFinal, extrairNotasPorEpoca, epocasVisiveis } from "@/lib/avaliacao";

const TURMA_DISCIPLINA_INCLUDE = {
  disciplina: true,
  horarioSlots: true,
  avaliacoes: true,
} as const;

interface HorarioPageProps {
  searchParams: Promise<{ cursoId?: string; anoCurricular?: string; periodo?: string; semestre?: string; view?: string }>;
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

    const configPessoal = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
    const semestreAtual = configPessoal?.semestreAtual === 2 ? 2 : 1;
    // Do intervalo configurado, não do ano civil — ver nota em anoLetivoCorrente.
    const anoLetivoPessoal = anoLetivoCorrente(await getAgora(), configPessoal);

    if (role === "PROFESSOR") {
      if (!session.user.professorId) redirect("/dashboard");
      // Filtrado ao semestre e ao ano letivo correntes (§pedido do cliente 2026-09-01): sem isto o
      // professor via as aulas e provas do 1º semestre — já encerrado — misturadas com as do 2º, e
      // as de anos letivos anteriores por cima. O mesmo filtro que o aluno já tinha.
      const rows = await prisma.turmaDisciplina.findMany({
        where: {
          professorId: session.user.professorId,
          semestre: semestreAtual,
          ...(anoLetivoPessoal !== null ? { turma: { anoLetivo: anoLetivoPessoal } } : {}),
        },
        include: { ...TURMA_DISCIPLINA_INCLUDE, turma: { include: { curso: true } } },
      });
      turmaDisciplinas = rows.map((r) => ({
        ...r,
        cursoAnoLabel: `${r.turma.curso.nome} · ${r.turma.anoCurricular}º Ano`,
      }));
      subtitle = `${semestreAtual}º Semestre — as suas disciplinas.`;
    } else {
      if (!session.user.alunoId) redirect("/dashboard");
      // Por InscricaoCadeira, não pela Matricula — um repetente frequenta cadeiras cujas
      // TurmaDisciplina pertencem a uma Turma de ano diferente da sua matrícula atual (§4.2).
      // Filtrado ao semestre corrente (§pedido do cliente 2026-08-29): sem isto, o aluno via as
      // disciplinas do 1º e do 2º semestre juntas no mesmo horário e na mesma contagem, mesmo só
      // devendo assistir às do semestre a decorrer.
      const inscricoes = await prisma.inscricaoCadeira.findMany({
        where: { alunoId: session.user.alunoId, ativa: true, turmaDisciplina: { semestre: semestreAtual } },
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
          ? `${semestreAtual}º Semestre — ${repetidas} cadeira(s) em repetição, mostradas em separado.`
          : `${semestreAtual}º Semestre.`;
    }

    return (
      <div className="flex flex-col gap-6">
        <HorarioHeader subtitle={subtitle} view={view} baseQuery={{}} />
        <ScheduleGrid turmaDisciplinas={turmaDisciplinas} view={view} editable={false} canPrint={role !== "ALUNO"} />
      </div>
    );
  }

  // ADMIN: escolher curso + ano + período primeiro. Só entram cursos que tenham pelo menos uma
  // turma com alunos matriculados — marcar aulas ou provas numa turma vazia não serve para nada, e
  // o ecrã enchia-se de combinações que nunca existiram (§pedido do cliente 2026-08-28).
  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { semestreAtual: true, anoLetivoInicio: true, anoLetivoFim: true },
  });

  // O ano letivo é o âmbito de tudo o resto: um ano letivo contém dois semestres, e cada semestre
  // o seu horário e as suas provas (§pedido do cliente 2026-08-28). Sem ele fixado, o ecrã caía no
  // `orderBy: anoLetivo desc` e mostrava silenciosamente a turma do ano passado — deixando marcar
  // provas num ano letivo já encerrado sem nada a assinalar.
  const anoLetivo = anoLetivoCorrente(agora, config);
  if (anoLetivo === null) {
    return (
      <div className="flex flex-col gap-6">
        <HorarioHeader subtitle="Gerir horário de aulas e provas." view={view} baseQuery={{}} />
        <EmptyState message="Não há ano letivo a decorrer. Defina as datas de início e fim do ano letivo em Admin → Académico → Configuração antes de marcar aulas ou provas." />
      </div>
    );
  }

  // Só entram cursos com turmas DESTE ano letivo e com alunos matriculados — marcar aulas ou provas
  // numa turma vazia não serve para nada, e o ecrã enchia-se de combinações que nunca existiram.
  const cursos = await prisma.curso.findMany({
    where: { turmas: { some: { anoLetivo, matriculas: { some: {} } } } },
    orderBy: { nome: "asc" },
  });
  const cursoId = cursos.some((c) => c.id === params.cursoId) ? params.cursoId! : (cursos[0]?.id ?? "");
  const cursoSelecionado = cursos.find((c) => c.id === cursoId) ?? null;

  // As turmas COM alunos deste curso definem o que o filtro pode oferecer — nem todos os anos do
  // curso têm turma aberta, e o seletor mostrava sempre 1º a 6º Ano mesmo num curso de 4 anos.
  const turmasComAlunos = cursoId
    ? await prisma.turma.findMany({
        where: { cursoId, anoLetivo, matriculas: { some: {} } },
        select: { anoCurricular: true, periodo: true },
        distinct: ["anoCurricular", "periodo"],
        orderBy: [{ anoCurricular: "asc" }, { periodo: "asc" }],
      })
    : [];

  // Limitado à duração do curso mesmo que exista uma turma fora dela (dado antigo) — o seletor não
  // deve ser a porta para continuar a criar horários num 5º ano de um curso de 4.
  const duracao = cursoSelecionado?.duracaoAnos ?? 0;
  const anosDisponiveis = [...new Set(turmasComAlunos.map((t) => t.anoCurricular))]
    .filter((ano) => ano <= duracao)
    .sort((a, b) => a - b);
  const anoPedido = parseIntParam(params.anoCurricular);
  const anoCurricular = anoPedido !== undefined && anosDisponiveis.includes(anoPedido) ? anoPedido : (anosDisponiveis[0] ?? 1);

  const periodosDisponiveis = [
    ...new Set(turmasComAlunos.filter((t) => t.anoCurricular === anoCurricular).map((t) => t.periodo)),
  ];
  const periodo =
    params.periodo && (periodosDisponiveis as string[]).includes(params.periodo)
      ? params.periodo
      : (periodosDisponiveis[0] ?? "MATUTINO");

  const turma =
    cursoId && anosDisponiveis.length > 0
      ? await prisma.turma.findFirst({
          where: {
            cursoId,
            anoLetivo,
            anoCurricular,
            periodo: periodo as "MATUTINO" | "VESPERTINO" | "NOTURNO",
            matriculas: { some: {} },
          },
          include: { curso: true, turmaDisciplinas: { include: TURMA_DISCIPLINA_INCLUDE } },
        })
      : null;

  // A turma tem as disciplinas dos DOIS semestres (nascem todas do plano curricular ao criar a
  // turma). O ecrã abre no semestre corrente, e o outro só se CONSULTA: o plano curricular do
  // semestre seguinte ainda está sujeito a alterações, e essas alterações mudam a atribuição de
  // cadeiras às turmas — um horário marcado adiantado ficaria preso a disciplinas que podem deixar
  // de existir (§decisão do cliente 2026-08-29).
  const semestrePedido = parseIntParam(params.semestre);
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  const semestre = semestrePedido === 1 || semestrePedido === 2 ? semestrePedido : semestreAtual;
  const turmaDisciplinasDoSemestre = turma?.turmaDisciplinas.filter((td) => td.semestre === semestre) ?? [];
  const editavel = podeGerirCurriculo(session.user) && semestre === semestreAtual;

  // A janela agendável das provas: de hoje (nunca antes — não se marca uma prova para ontem) até ao
  // fim do ano letivo. O ano não chega sequer a ser uma escolha do utilizador: sai daqui
  // (§pedido do cliente 2026-08-29). O servidor revalida na mesma — isto evita o erro, não o
  // substitui.
  const inicioAnoLetivo = config?.anoLetivoInicio ?? null;
  const fimAnoLetivo = config?.anoLetivoFim ?? null;
  const janelaProvas =
    editavel && inicioAnoLetivo && fimAnoLetivo
      ? {
          minIso: toIsoDate(agora > inicioAnoLetivo ? agora : inicioAnoLetivo),
          maxIso: toIsoDate(fimAnoLetivo),
          anoLetivoLabel: formatAnoLetivo(anoLetivo),
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <HorarioHeader
        subtitle={`Ano letivo ${formatAnoLetivo(anoLetivo)} · ${semestre}º Semestre — o horário e as provas pertencem a este semestre.`}
        view={view}
        baseQuery={{ cursoId, anoCurricular: String(anoCurricular), periodo, semestre: String(semestre) }}
      />

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
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
                {anosDisponiveis.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}º Ano
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Período" htmlFor="periodo">
              <Select id="periodo" name="periodo" defaultValue={periodo}>
                {periodosDisponiveis.map((p) => (
                  <option key={p} value={p}>
                    {PERIODO_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Semestre" htmlFor="semestre">
              <Select id="semestre" name="semestre" defaultValue={String(semestre)}>
                <option value="1">1º Semestre{config?.semestreAtual !== 2 ? " (atual)" : ""}</option>
                <option value="2">2º Semestre{config?.semestreAtual === 2 ? " (atual)" : ""}</option>
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
        <EmptyState
          message={
            cursos.length === 0
              ? "Ainda não há turmas com alunos matriculados. Matricule alunos em Alunos → Novo antes de marcar aulas ou provas."
              : "Nenhuma turma com alunos para este curso, ano e período. Só se marcam aulas e provas em turmas que tenham alunos."
          }
        />
      ) : (
        <>
          <p className="text-sm font-medium text-navy-700">
            {turma.curso.nome} · {turma.anoCurricular}º Ano · {PERIODO_LABEL[turma.periodo]} · {semestre}º Semestre
          </p>
          {semestre !== semestreAtual ? (
            <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-2.5 text-xs text-gold-800">
              Está a consultar o {semestre}º semestre, que ainda não começou — só leitura. O plano curricular deste
              semestre pode ainda mudar, e com ele as disciplinas atribuídas às turmas. Marque o horário e as provas
              quando o semestre estiver a decorrer.
            </p>
          ) : null}
          {turmaDisciplinasDoSemestre.length === 0 ? (
            <EmptyState message={`Esta turma não tem disciplinas no ${semestre}º semestre do plano curricular.`} />
          ) : (
            <ScheduleGrid
              turmaDisciplinas={turmaDisciplinasDoSemestre}
              view={view}
              editable={editavel}
              janela={janelaProvas}
            />
          )}
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
