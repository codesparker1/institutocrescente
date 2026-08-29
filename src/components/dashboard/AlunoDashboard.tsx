import Link from "next/link";
import { CalendarClock, ClipboardCheck, GraduationCap, PauseCircle, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { ProfileCard } from "./ProfileCard";
import { AvisoNotasBloqueadas } from "@/components/financeiro/AvisoNotasBloqueadas";
import { verificarBloqueioAluno } from "@/lib/financeiro";
import { DIA_SEMANA_LABEL, PERIODO_LABEL, diasAteProximo, formatAnoLetivo, formatDate, nomeProfessor } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { calcularNotaFinal, extrairNotasPorEpoca, epocasVisiveis, EPOCA_LABEL } from "@/lib/avaliacao";
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

  // Por InscricaoCadeira, não por Matricula — cobre cadeiras repetidas noutra Turma (§4.2).
  const inscricoes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId, ativa: true },
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
    });
    return { inscricao: i, notasCadeira, resultado };
  });

  const notasFinais = resultadosPorInscricao.map((r) => r.resultado.notaFinal).filter((n): n is number => n !== null);
  const mediaGeral = notasFinais.length > 0 ? notasFinais.reduce((a, b) => a + b, 0) / notasFinais.length : null;

  const todasFrequencias = inscricoes.flatMap((i) => i.frequencias);
  const presencas = todasFrequencias.filter((f) => f.presente).length;
  const percentualPresenca = todasFrequencias.length > 0 ? Math.round((presencas / todasFrequencias.length) * 100) : null;

  const todasDisciplinas = inscricoes.map((i) => i.turmaDisciplina);
  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  // Do intervalo configurado, não do ano civil — ver nota em anoLetivoCorrente.
  const anoLetivo = anoLetivoCorrente(agora, config);

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Página Inicial</h1>
        <p className="text-sm text-navy-400">Olá, {aluno.nome.split(" ")[0]}. Aqui está o resumo do seu percurso académico.</p>
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

      {bloqueio.bloqueado ? <AvisoNotasBloqueadas saldoEmDivida={bloqueio.saldoEmDivida} /> : null}

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
        <StatCard label="Assiduidade" value={percentualPresenca !== null ? `${percentualPresenca}%` : "—"} icon={<ClipboardCheck size={20} />} />
        <StatCard label="Disciplinas ativas" value={todasDisciplinas.length} icon={<GraduationCap size={20} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Próximas aulas"
            subtitle="Resumo do horário semanal"
            action={
              <Link href="/horario" className="text-navy-300 hover:text-navy-500" aria-label="Ver horário completo">
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
                    <p className="font-medium text-navy-800">{slot.disciplinaNome}</p>
                    <p className="text-xs text-navy-400">
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
                    <p className="font-medium text-navy-800">
                      {EPOCA_LABEL[prova.epoca]} · {prova.disciplinaNome}
                    </p>
                    <p className="text-xs text-navy-400">{prova.sala ?? "Sala a confirmar"}</p>
                  </div>
                  <Badge tone={prova.data >= agora ? "info" : "neutral"}>{formatDate(prova.data)}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Minhas disciplinas" subtitle={`${todasDisciplinas.length} disciplina(s) ativa(s)`} />
        {todasDisciplinas.length === 0 ? (
          <EmptyState message="Sem matrículas ativas." />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {inscricoes.map((inscricao) => (
              <div key={inscricao.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-navy-800">{inscricao.turmaDisciplina.disciplina.nome}</p>
                  <p className="text-xs text-navy-400">
                    {nomeProfessor(inscricao.turmaDisciplina.professor)} · {PERIODO_LABEL[inscricao.turmaDisciplina.turma.periodo]}
                  </p>
                </div>
                <span className="text-xs text-navy-400">
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
    </div>
  );
}
