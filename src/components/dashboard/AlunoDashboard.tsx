import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardCheck, GraduationCap, MapPin, PauseCircle, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { ProfileCard } from "./ProfileCard";
import { AvisoNotasBloqueadas } from "@/components/financeiro/AvisoNotasBloqueadas";
import { verificarBloqueioAluno } from "@/lib/financeiro";
import { DIA_SEMANA_LABEL, PERIODO_LABEL, diasAteProximo, formatAnoLetivo, formatCurrency, formatDate, formatHora, nomeProfessor } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { calcularNotaFinal, extrairNotasPorEpoca, epocasVisiveis, provaJaPassou, EPOCA_LABEL } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";

interface AlunoDashboardProps {
  alunoId: string;
}

export async function AlunoDashboard({ alunoId }: AlunoDashboardProps) {
  const bloqueio = await verificarBloqueioAluno(alunoId);

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });

  if (!aluno) {
    return <EmptyState message="Aluno não encontrado." />;
  }

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  // Do intervalo configurado, não do ano civil — ver nota em anoLetivoCorrente.
  const anoLetivo = anoLetivoCorrente(agora, config);

  // Por InscricaoCadeira, não por Matricula — cobre cadeiras repetidas noutra Turma (§4.2).
  // Filtrado ao semestre corrente (§pedido do cliente 2026-08-29): "Disciplinas ativas" e "Próximas
  // aulas" contavam as do 1º e do 2º semestre juntas, mostrando por exemplo "2 disciplinas ativas"
  // durante o 1º semestre quando só uma estava mesmo a decorrer.
  const inscricoes = await prisma.inscricaoCadeira.findMany({
    where: {
      alunoId,
      ativa: true,
      // A monografia sai daqui e passa a ter bloco próprio, em cima (§pedido do cliente
      // 2026-09-05): misturada nas "disciplinas ativas" não dizia nada útil ao finalista — sem
      // aulas, sem assiduidade, e com a data provisória da avaliação-veículo a aparecer como prova.
      turmaDisciplina: { semestre: semestreAtual, cadeiraCurricular: { eMonografia: false } },
    },
    include: {
      turmaDisciplina: {
        include: {
          disciplina: true,
          professor: true,
          horarioSlots: true,
          avaliacoes: true,
          turma: { include: { curso: true } },
        },
      },
      notas: { include: { avaliacao: true } },
      frequencias: true,
    },
  });

  // Uma resolução por inscrição — reaproveitada tanto para a média geral como para filtrar quais
  // épocas ainda são relevantes mostrar (§4.1/§4.3): um aluno dispensado ou já aprovado não deve
  // ver Recurso/Exame Especial na lista de "próximas provas", mesmo que estejam agendados para a turma.
  const resultadosPorInscricao = inscricoes.map((i) => {
    const notasCadeira = extrairNotasPorEpoca(i.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })));
    const resultado = calcularNotaFinal(notasCadeira, {
      permiteDispensa: i.permiteDispensaAplicada,
      notaMinimaDispensa: Number(i.notaMinimaDispensaAplicada),
      eMonografia: i.eMonografiaAplicada,
    });
    return { inscricao: i, notasCadeira, resultado };
  });

  const notasFinais = resultadosPorInscricao.map((r) => r.resultado.notaFinal).filter((n): n is number => n !== null);
  const mediaGeral = notasFinais.length > 0 ? notasFinais.reduce((a, b) => a + b, 0) / notasFinais.length : null;

  const todasFrequencias = inscricoes.flatMap((i) => i.frequencias);
  const presencas = todasFrequencias.filter((f) => f.presente).length;
  const percentualPresenca = todasFrequencias.length > 0 ? Math.round((presencas / todasFrequencias.length) * 100) : null;

  const todasDisciplinas = inscricoes.map((i) => i.turmaDisciplina);

  const proximasAulas = todasDisciplinas
    .flatMap((td) => td.horarioSlots.map((slot) => ({ ...slot, disciplinaNome: td.disciplina.nome })))
    .sort((a, b) => diasAteProximo(a.diaSemana, agora) - diasAteProximo(b.diaSemana, agora))
    .slice(0, 5);

  // "Próximas" = relevantes para o estado atual do aluno E ainda sem nota lançada — uma época já
  // graduada não é "próxima", é histórico (fica só em "Minhas disciplinas"/Minhas Notas). Sem este
  // segundo filtro, ordenar por data traria exames antigos já resolvidos para o topo da lista.
  const proximasProvas = resultadosPorInscricao
    .flatMap(({ inscricao, notasCadeira, resultado }) => {
      const visiveis = new Set(epocasVisiveis(notasCadeira, resultado.estado));
      const comNota = new Set(inscricao.notas.map((n) => n.avaliacao.epoca));
      return inscricao.turmaDisciplina.avaliacoes
        .filter((av) => visiveis.has(av.epoca) && !comNota.has(av.epoca))
        .map((av) => ({ ...av, disciplinaNome: inscricao.turmaDisciplina.disciplina.nome }));
    })
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .slice(0, 5);

  const trancado = aluno.status === "TRANCADO";

  // Bloco do finalista (§pedido do cliente 2026-09-05). Só existe quando há monografia atribuída —
  // e ela só é atribuída depois do pagamento confirmado, pelo que a sua presença aqui já é, por si,
  // a resposta à pergunta "já estou inscrito na defesa?".
  const monografia = await prisma.inscricaoCadeira.findFirst({
    where: { alunoId, ativa: true, eMonografiaAplicada: true },
    include: {
      orientador: { select: { nome: true } },
      turmaDisciplina: { include: { disciplina: true } },
    },
    orderBy: { turmaDisciplina: { turma: { anoLetivo: "desc" } } },
  });

  // Finalista sem mais nada a decorrer: a monografia não tem aulas nem presenças, e os blocos de
  // horário, assiduidade e disciplinas só teriam estados vazios a dizer "nada" três vezes
  // (§decisão do cliente 2026-09-05). Quem ainda arrasta cadeiras de anos anteriores continua a
  // vê-las — desapareceriam do ecrã justamente a quem mais precisa delas.
  const soMonografia = monografia !== null && todasDisciplinas.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Página Inicial</h1>
        <p className="text-sm text-texto-suave">Olá, {aluno.nome.split(" ")[0]}. Aqui está o resumo do seu percurso académico.</p>
      </div>

      {/* Bug 3 (sessão 2026-08-23): aluno TRANCADO precisa de saber QUE o problema é a matrícula,
          não o pagamento. Banner âmbar específico, acima de qualquer aviso de dívida. */}
      {trancado ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <PauseCircle size={18} className="mt-0.5 shrink-0" />
          <p>
            A sua matrícula ficou suspensa por não ter renovado dentro do prazo. Dirija-se à secretaria para tratar da
            rematrícula.
          </p>
        </div>
      ) : null}

      {bloqueio.bloqueado ? (
        <AvisoNotasBloqueadas
          saldoEmDivida={bloqueio.saldoEmDivida}
          saldoMultas={bloqueio.saldoMultas}
          saldoTotal={bloqueio.saldoTotal}
        />
      ) : null}

      {/* Multas sem bloqueio: o aviso vermelho só aparece quando as notas estão bloqueadas, e sem
          isto uma multa por pagar não aparecia em lado nenhum no painel do aluno. Âmbar, não
          vermelho — é dívida a regularizar, mas não lhe tira acesso a nada (§financeiro-tipos). */}
      {!bloqueio.bloqueado && bloqueio.saldoMultas > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            Tem <strong>{formatCurrency(bloqueio.saldoMultas)}</strong> em multas por pagar. Não bloqueiam o acesso às
            notas, mas deve regularizá-las na secretaria.
          </p>
        </div>
      ) : null}

      {/* Primeira coisa que o finalista vê: é a data que ele vem cá procurar. Nada disto aparece a
          quem não é finalista — a condição é a existência da monografia (§auditoria 2026-09-03). */}
      {monografia ? (
        <Card>
          <CardHeader
            title="A minha defesa"
            subtitle={monografia.turmaDisciplina.disciplina.nome}
            action={
              <Link href="/finalista" className="text-xs font-medium text-texto-suave hover:text-navy-700">
                Ver detalhes
              </Link>
            }
          />
          <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {monografia.defesaData ? (
              <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="flex items-center gap-2 text-texto">
                  <CalendarClock size={18} className="shrink-0 text-texto-suave" />
                  <strong>{formatDate(monografia.defesaData)}</strong>
                  <span>às {formatHora(monografia.defesaData)}</span>
                </span>
                <span className="flex items-center gap-2 text-sm text-texto">
                  <MapPin size={16} className="shrink-0 text-texto-suave" />
                  {monografia.defesaSala ?? "Sala por confirmar"}
                </span>
              </span>
            ) : (
              <span className="text-sm text-texto-suave">
                {monografia.orientadorId
                  ? "A data da defesa ainda não foi marcada."
                  : "Aguarda a atribuição de um orientador pelo DAAC."}
              </span>
            )}
            <span className="text-sm text-texto-suave">
              {monografia.orientador ? `Orientador: ${monografia.orientador.nome}` : "Sem orientador"}
            </span>
          </CardBody>
        </Card>
      ) : null}

      <ProfileCard
        nome={aluno.nome}
        cargo="Aluno"
        campos={[
          { label: "Nº Estudante", value: aluno.numeroEstudante },
          { label: "Curso", value: aluno.curso },
          { label: "Ano", value: `${aluno.anoCurricular}º Ano` },
          { label: "Email", value: aluno.email ?? "—" },
          // Aluno trancado não tem semestre ativo — mostrar "Sem matrícula ativa" em vez do
          // ano letivo/semestre correntes, que sugeririam um estado enganador (regra confirmada).
          trancado
            ? { label: "Matrícula", value: "Sem matrícula ativa" }
            : { label: "Ano Letivo", value: anoLetivo !== null ? formatAnoLetivo(anoLetivo) : "Por definir" },
          ...(trancado ? [] : [{ label: "Semestre", value: `${semestreAtual}º Semestre` }]),
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Média geral"
          value={bloqueio.bloqueado ? "—" : mediaGeral !== null ? mediaGeral.toFixed(1) : "—"}
          icon={<TrendingUp size={20} />}
        />
        {soMonografia ? null : (
          <StatCard label="Assiduidade" value={percentualPresenca !== null ? `${percentualPresenca}%` : "—"} icon={<ClipboardCheck size={20} />} />
        )}
        {soMonografia ? null : (
          <StatCard
            label={`Disciplinas ativas (${semestreAtual}º sem.)`}
            value={todasDisciplinas.length}
            icon={<GraduationCap size={20} />}
          />
        )}
      </div>

      {/* Um finalista sem mais nada a decorrer não tem aulas nem provas — a defesa dele já está no
          bloco em cima. Dois estados vazios lado a lado seriam ruído. */}
      {soMonografia ? null : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Próximas aulas"
            subtitle="Resumo do horário semanal"
            action={
              <Link href="/horario" className="text-texto-suave hover:text-navy-500" aria-label="Ver horário completo">
                <CalendarClock size={18} />
              </Link>
            }
          />
          {proximasAulas.length === 0 ? (
            <EmptyState message="Sem aulas agendadas." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {proximasAulas.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-texto">{slot.disciplinaNome}</p>
                    <p className="text-xs text-texto-suave">
                      {DIA_SEMANA_LABEL[slot.diaSemana]} · {slot.horaInicio}–{slot.horaFim} · {slot.sala}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Próximas provas" />
          {proximasProvas.length === 0 ? (
            <EmptyState message="Sem provas agendadas." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {proximasProvas.map((prova) => (
                <div key={prova.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-texto">
                      {EPOCA_LABEL[prova.epoca]} · {prova.disciplinaNome}
                    </p>
                    <p className="text-xs text-texto-suave">{prova.sala ?? "Sala a confirmar"}</p>
                  </div>
                  <Badge tone={provaJaPassou(prova.data, agora) ? "neutral" : "info"}>{formatDate(prova.data)}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>
      )}

      {soMonografia ? null : (
      <Card>
        <CardHeader title="Minhas disciplinas" subtitle={`${todasDisciplinas.length} disciplina(s) ativa(s)`} />
        {todasDisciplinas.length === 0 ? (
          <EmptyState message="Sem matrículas ativas." />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {inscricoes.map((inscricao) => (
              <div key={inscricao.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-texto">{inscricao.turmaDisciplina.disciplina.nome}</p>
                  <p className="text-xs text-texto-suave">
                    {nomeProfessor(inscricao.turmaDisciplina.professor)} · {PERIODO_LABEL[inscricao.turmaDisciplina.turma.periodo]}
                  </p>
                </div>
                <span className="text-xs text-texto-suave">
                  {bloqueio.bloqueado
                    ? "—"
                    : inscricao.notas.length === 0
                      ? "Sem notas"
                      : inscricao.notas.map((n) => `${EPOCA_LABEL[n.avaliacao.epoca]}: ${Number(n.valor)}`).join(" · ")}
                </span>
              </div>
            ))}
          </CardBody>
        )}
      </Card>
      )}
    </div>
  );
}
