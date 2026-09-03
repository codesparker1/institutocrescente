import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Disclosure } from "@/components/ui/Disclosure";
import { PropinasMensais } from "@/components/financeiro/PropinasMensais";
import { MultasPendentes } from "@/components/financeiro/MultasPendentes";
import { CategoriaEstudanteForm } from "@/components/alunos/CategoriaEstudanteForm";
import { RepeticaoForm } from "@/components/alunos/RepeticaoForm";
import { RematriculaForm } from "@/components/alunos/RematriculaForm";
import { MudarCursoForm } from "@/components/alunos/MudarCursoForm";
import { DesistenciaForm } from "@/components/alunos/DesistenciaForm";
import { LinhaPercursoEditavel } from "@/components/alunos/LinhaPercursoEditavel";
import { CreditarCadeiraForm } from "@/components/alunos/CreditarCadeiraForm";
import { DocumentosAlunoCard } from "@/components/alunos/DocumentosAlunoCard";
import { DadosPessoaisAlunoForm } from "@/components/alunos/DadosPessoaisAlunoForm";
import { formatDate, formatCurrency, chaveMes, PERIODO_LABEL, formatAnoLetivo, nomeProfessor } from "@/lib/utils";
import { anoLetivoCorrente, motivoRematriculaIndisponivel, semestreFechado } from "@/lib/academico";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";
import { ESTADO_COBRANCA_LABEL, ESTADO_COBRANCA_TONE } from "@/lib/estado-cobranca";
import { estadoCobrancaVisual } from "@/lib/estado-cobranca";
import { podeRegistarPagamento, podeGerirCurriculo, podeGerirDocumentos, podeGerirContas, podeMarcarDesistencia, podeReativarDesistente } from "@/lib/permissions";
import { calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { COLUNAS_EPOCA, notaDaEpoca } from "@/components/notas/ColunasNotas";
import { getAgora } from "@/lib/tempo";
import type { AlunoStatus, CobrancaTipo, Epoca } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
};

const COBRANCA_TIPO_LABEL: Record<CobrancaTipo, string> = {
  INSCRICAO: "Inscrição",
  CONFIRMACAO: "Confirmação",
  MATRICULA: "Matrícula",
  PROPINA: "Propina",
  MULTA: "Multa",
  EMOLUMENTO: "Emolumento",
};

interface AlunoDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AlunoDetailPage({ params }: AlunoDetailPageProps) {
  const { id } = await params;

  const aluno = await prisma.aluno.findUnique({
    where: { id },
    include: {
      matriculas: { include: { turma: { include: { curso: true } } } },
    },
  });

  if (!aluno) notFound();

  // Por InscricaoCadeira, não por Matricula — cobre cadeiras que o aluno frequenta noutra Turma
  // (repetição, §4.2). Inclui inativas para mostrar o histórico de tentativas.
  const inscricoes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId: aluno.id },
    include: {
      turmaDisciplina: {
        include: { disciplina: true, professor: true, turma: { include: { curso: true } }, avaliacoes: true },
      },
      notas: { include: { avaliacao: true } },
    },
    orderBy: [{ ativa: "desc" }, { tentativa: "desc" }],
  });

  // O percurso lê-se por ano letivo, do mais recente para trás, e dentro dele por ano curricular e
  // semestre (§pedido do cliente 2026-08-31). A tabela plana repetia turma/ano/professor em todas as
  // linhas e não deixava ver onde o aluno está nem o que já fez — o agrupamento é que conta a
  // história; as colunas repetidas passam a ser o cabeçalho do grupo.
  const percurso = new Map<
    string,
    { anoLetivo: number; cursoNome: string; anoCurricular: number; porSemestre: Map<number, typeof inscricoes> }
  >();
  for (const inscricao of inscricoes) {
    const turma = inscricao.turmaDisciplina.turma;
    const chave = `${turma.anoLetivo}:${turma.curso.nome}:${turma.anoCurricular}`;
    if (!percurso.has(chave)) {
      percurso.set(chave, {
        anoLetivo: turma.anoLetivo,
        cursoNome: turma.curso.nome,
        anoCurricular: turma.anoCurricular,
        porSemestre: new Map(),
      });
    }
    const grupo = percurso.get(chave)!;
    const semestre = inscricao.turmaDisciplina.semestre;
    const lista = grupo.porSemestre.get(semestre) ?? [];
    lista.push(inscricao);
    grupo.porSemestre.set(semestre, lista);
  }
  const percursoOrdenado = [...percurso.values()].sort(
    (a, b) => b.anoLetivo - a.anoLetivo || b.anoCurricular - a.anoCurricular,
  );

  /** Resultado académico da inscrição — o que "Ativa/Anterior" não dizia: passou, chumbou, falta. */
  function resultadoDaInscricao(inscricao: (typeof inscricoes)[number]) {
    const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    return calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    });
  }

  const session = await auth();
  const podeEditarCategoria = session?.user ? podeRegistarPagamento(session.user) : false;
  const podeRepetir = session?.user ? podeGerirCurriculo(session.user) : false;
  // Situação Financeira volta a ser editável aqui, mas só para ADMIN (§pedido do cliente
  // 2026-08-18) — a Secretaria mantém-se só leitura nesta página, continua a confirmar/reverter
  // exclusivamente pelo fluxo de Registo de Pagamentos.
  const podeEditarFinanceiroAqui = session?.user?.role === "ADMIN";
  // Nome/nº de estudante — só ADMIN (§pedido do cliente 2026-08-18).
  const podeEditarDadosPessoais = session?.user ? podeGerirContas(session.user) : false;
  // Documentos é partilhado com a Secretaria (recebe em mão do aluno), ao contrário do resto
  // deste domínio académico (podeRepetir), que continua exclusivo do DAAC.
  const podeVerDocumentos = session?.user ? podeGerirDocumentos(session.user) : false;
  const estadoFinanceiro = await getEstadoFinanceiroAluno(aluno.id);

  // Multas sem mensalidade correspondente no mesmo mês ficam de fora do merge de
  // PropinasMensais (mesmo tratamento de PagamentosSecretariaPanel) — só essas aparecem na lista
  // separada abaixo, em vez de todas.
  const mesesChaves = new Set(estadoFinanceiro.meses.map((mes) => chaveMes(mes.mesReferencia)));
  const multasOrfas = estadoFinanceiro.multas.filter((m) => !m.mesReferencia || !mesesChaves.has(chaveMes(m.mesReferencia)));

  const cadeirasAtivas = inscricoes
    .filter((i) => i.ativa)
    .map((i) => ({ cadeiraCurricularId: i.cadeiraCurricularId, disciplinaNome: i.turmaDisciplina.disciplina.nome }));

  // select, não include: RepeticaoForm (Client Component) só precisa de id/nome — Curso.valorPropina
  // é Decimal e o Next.js recusa-se a serializar Decimal ao passar de Server para Client Component
  // (mesmo cuidado já aplicado a outrosCursos/MudarCursoForm, mais abaixo). Ficou latente até agora
  // porque só DAAC/ADMIN chegam aqui (podeRepetir) e o DAAC só ganhou acesso a /alunos hoje.
  const ofertas = podeRepetir
    ? await prisma.turmaDisciplina.findMany({
        where: { cadeiraCurricularId: { in: cadeirasAtivas.map((c) => c.cadeiraCurricularId) } },
        select: {
          id: true,
          cadeiraCurricularId: true,
          disciplina: { select: { nome: true } },
          professor: { select: { nome: true } },
          turma: { select: { anoCurricular: true, curso: { select: { nome: true } } } },
        },
      })
    : [];

  // Rematrícula (§4.2/Fase 8b) — resumo do ano corrente e janela de matrícula.
  const configAcademica = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const agora = await getAgora();
  // Para distinguir, na pauta, um semestre a decorrer de um já encerrado: num encerrado
  // "Em curso"/"Em recurso" mentem, porque não vai entrar mais nota nenhuma (ver rotuloEstado).
  const anoLetivoAtual = anoLetivoCorrente(agora, configAcademica);
  const semestreAtualConfig = configAcademica?.semestreAtual === 2 ? 2 : 1;
  const dentroDaJanela = Boolean(
    configAcademica?.matriculaInicio &&
      configAcademica.matriculaFim &&
      agora >= configAcademica.matriculaInicio &&
      agora <= configAcademica.matriculaFim,
  );
  const reprovacoesAnoCorrente = inscricoes.filter(
    (i) => i.ativa && resultadoDaInscricao(i).estado === "REPROVADO",
  ).length;

  // As mesmas condições que processarRematriculaAction verifica, calculadas aqui para o cartão
  // poder dizer o que falta em vez de oferecer um botão que vai recusar. DEVENDO (vencida além da
  // tolerância), não qualquer PENDENTE: gerarPropinasAnoLetivo pré-gera o ano letivo inteiro e a
  // maioria dos meses ainda nem venceu — ver a nota na própria action.
  const saldoPropinasDevendo = estadoFinanceiro.meses
    .filter((m) => m.estadoVisual === "DEVENDO")
    .reduce((soma, m) => soma + (m.valorDevido - m.valorPago), 0);
  // A MESMA condição do DesistenciaForm (ATIVO ou TRANCADO + permissão) — se divergir, a página
  // explica uma ação que o formulário não mostra, ou cala-se sobre uma que mostra.
  const podeMarcarDesistenciaAqui =
    (aluno.status === "ATIVO" || aluno.status === "TRANCADO") &&
    Boolean(session?.user && podeMarcarDesistencia(session.user));

  const podeRematricular =
    motivoRematriculaIndisponivel({
      status: aluno.status,
      temMatriculaAnterior: aluno.matriculas.length > 0,
      saldoPropinasDevendo,
      dentroDaJanela,
      podeForaDaJanela: session?.user?.role === "ADMIN",
    }) === null;

  // Segunda licenciatura / mudança de curso (Fase 8c) — cursos além do atual do aluno.
  // select: MudarCursoForm (Client Component) só precisa de id/nome — Curso.valorPropina é
  // Decimal e o Next.js recusa-se a serializar Decimal ao passar de Server para Client Component.
  const outrosCursos = podeEditarCategoria
    ? await prisma.curso.findMany({ where: { nome: { not: aluno.curso } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    : [];

  // Histórico de pagamentos — auditoria do percurso financeiro completo, não só o que está em
  // aberto agora (isso já é "Situação Financeira" acima). Inclui quem registou cada pagamento.
  const [configFin, cobrancas] = await Promise.all([
    prisma.configuracaoFinanceira.findUnique({ where: { id: "config" }, select: { toleranciaDias: true } }),
    prisma.cobranca.findMany({
      where: { alunoId: aluno.id },
      include: { registadoPor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const agoraHistorico = await getAgora();
  const tolerancia = configFin?.toleranciaDias ?? 0;
  const cobrancasComEstado = cobrancas.map((c) => ({
    ...c,
    estadoVisual: estadoCobrancaVisual(c.status as "PENDENTE" | "PAGO", c.dataVencimento, tolerancia, agoraHistorico),
  }));

  // Aproveitamento de cadeiras de outra instituição (aluno transferido) — cadeiras do curso do
  // aluno sem nenhuma nota lançada ainda: tanto as nunca inscritas quanto as que a entrada direta
  // (inscreverCadeirasAnosAnteriores) já inscreveu automaticamente para cursar aqui, mas que afinal
  // o aluno já tinha aprovado noutra instituição — creditarCadeiraAction converte essa inscrição em
  // vez de recusar. Uma cadeira com nota já lançada nunca aparece aqui (creditar apagaria histórico
  // real).
  const cadeirasSemNota = new Set(inscricoes.filter((i) => i.notas.length === 0).map((i) => i.cadeiraCurricularId));
  const cadeirasComNota = new Set(inscricoes.filter((i) => i.notas.length > 0).map((i) => i.cadeiraCurricularId));
  const cadeirasDisponiveisParaCreditar = podeRepetir
    ? (
        await prisma.cadeiraCurricular.findMany({
          where: { curso: { nome: aluno.curso } },
          include: { disciplina: true },
          orderBy: [{ anoCurricular: "asc" }, { disciplina: { nome: "asc" } }],
        })
      )
        .filter((c) => !cadeirasComNota.has(c.id))
        .map((c) => ({
          id: c.id,
          disciplinaNome: c.disciplina.nome,
          anoCurricular: c.anoCurricular,
          jaInscrita: cadeirasSemNota.has(c.id),
        }))
    : [];

  // Documentos administrativos (certificado de transferência, BI, etc.) — backlog simples,
  // partilhado entre Secretaria (recebe o documento em mão) e DAAC (consulta/usa academicamente).
  const documentos = podeVerDocumentos
    ? await prisma.documentoAluno.findMany({
        where: { alunoId: aluno.id },
        include: { carregadoPor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Alunos
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">{aluno.nome}</h1>
          <p className="text-sm text-navy-400">
            {aluno.numeroEstudante} · {aluno.curso} · {aluno.anoCurricular}º Ano
          </p>
          {podeEditarDadosPessoais ? (
            <div className="mt-1">
              <DadosPessoaisAlunoForm alunoId={aluno.id} nome={aluno.nome} numeroEstudante={aluno.numeroEstudante} />
            </div>
          ) : null}
        </div>
        <Badge tone={STATUS_TONE[aluno.status]}>{aluno.status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Dados pessoais" />
          <CardBody className="flex flex-col gap-3 text-sm">
            <InfoRow label="Email" value={aluno.email ?? "—"} />
            <InfoRow label="Telefone" value={aluno.telefone ?? "—"} />
            <InfoRow label="Data de nascimento" value={formatDate(aluno.dataNascimento)} />
            <InfoRow label="Género" value={aluno.genero} />
            <InfoRow label="Ano de ingresso" value={String(aluno.anoIngresso)} />
            <div className="flex items-center justify-between border-b border-navy-50 pb-2 last:border-0 last:pb-0">
              <span className="text-navy-400">Categoria</span>
              <CategoriaEstudanteForm alunoId={aluno.id} categoria={aluno.categoria} editable={podeEditarCategoria} />
            </div>
            <InfoRow label="Registado em" value={formatDate(aluno.createdAt)} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Matrículas" subtitle={`${aluno.matriculas.length} turma(s)`} />
          {aluno.matriculas.length === 0 ? (
            <EmptyState message="Sem matrículas registadas." />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {aluno.matriculas.map((matricula) => (
                <div key={matricula.id} className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy-900">
                    {matricula.turma.curso.nome} · {matricula.turma.anoCurricular}º Ano ·{" "}
                    {PERIODO_LABEL[matricula.turma.periodo]} · {formatAnoLetivo(matricula.turma.anoLetivo)}
                  </p>
                  <Badge tone={matricula.status === "ATIVA" ? "success" : "neutral"}>{matricula.status}</Badge>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Situação Financeira"
          subtitle={
            podeEditarFinanceiroAqui
              ? `Dívida: ${formatCurrency(estadoFinanceiro.saldoEmDivida)}`
              : `Dívida: ${formatCurrency(estadoFinanceiro.saldoEmDivida)} · só leitura — confirme ou reverta pagamentos em Registo de Pagamentos`
          }
        />
        <CardBody className="flex flex-col gap-4">
          {/* Editável só para ADMIN aqui (§pedido do cliente 2026-08-18) — a Secretaria continua
              só-leitura, confirma/reverte exclusivamente pelo fluxo de Registo de Pagamentos
              (emite recibo, respeita seleção em lote). */}
          <PropinasMensais meses={estadoFinanceiro.meses} multas={estadoFinanceiro.multas} editable={podeEditarFinanceiroAqui} />
          <MultasPendentes multas={multasOrfas} editable={podeEditarFinanceiroAqui} />
        </CardBody>
      </Card>

      {/* Rematrícula, mudança de curso e desistência ocupavam três cartões grandes sempre abertos,
          entre a Situação Financeira e o Percurso Curricular — empurravam para baixo o que se
          consulta todos os dias, para dar destaque a ações usadas uma ou duas vezes por ano
          (§pedido do cliente 2026-08-28: a página estava sobrecarregada). Recolhidas num bloco só,
          continuam a um clique de distância. */}
      <Disclosure
        title="Ações de gestão"
        subtitle={`Rematrícula${podeEditarCategoria ? " · Mudança de curso" : ""} · Desistência${
          reprovacoesAnoCorrente > 0 ? ` — ${reprovacoesAnoCorrente} reprovação(ões) no ano corrente` : ""
        }`}
      >
        <div className="flex flex-col gap-5">
          {podeEditarCategoria ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-400">Rematrícula</p>
              {/* A explicação do mecanismo só aparece quando há mesmo botão para carregar
                  (§pedido do cliente 2026-09-03: "só ter informação quando uma condição é
                  encontrada"). Quando não há, o próprio RematriculaForm diz o que falta — dizer
                  as duas coisas seria explicar como funciona algo que não se pode fazer. */}
              {podeRematricular ? (
                <p className="mb-2 text-xs text-navy-400">
                  Avança de ano (ou retém) a partir das notas — as cadeiras reprovadas são inscritas automaticamente.
                </p>
              ) : null}
              <RematriculaForm
                alunoId={aluno.id}
                dentroDaJanela={dentroDaJanela}
                podeForaDaJanela={session?.user?.role === "ADMIN"}
                status={aluno.status}
                saldoPropinasDevendo={saldoPropinasDevendo}
                temMatriculaAnterior={aluno.matriculas.length > 0}
              />
            </div>
          ) : null}

          {podeEditarCategoria ? (
            <div className="border-t border-navy-50 pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-400">
                Segunda licenciatura / mudança de curso
              </p>
              {/* Só quando há para onde mudar: sem outro curso, o MudarCursoForm diz "Sem outro
                  curso cadastrado" e explicar as regras de uma mudança impossível é ruído. */}
              {outrosCursos.length > 0 ? (
                <p className="mb-2 text-xs text-navy-400">
                  Sem aproveitamento de créditos — entra sempre no 1º ano do curso novo.
                </p>
              ) : null}
              <MudarCursoForm alunoId={aluno.id} cursos={outrosCursos} />
            </div>
          ) : null}

          <div className="border-t border-navy-50 pt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-400">Desistência</p>
            {/* A explicação só quando há mesmo o que fazer. Antes dizia "Só para alunos ATIVOS",
                o que era falso (o formulário aceita TRANCADO — é o estado natural de quem desiste),
                e para um DESISTENTE repetia "reativação exclusiva da ADMIN" mesmo à ADMIN, que via
                a frase e o botão de reativar por baixo dela. Quando não há ação, é o próprio
                DesistenciaForm que diz porquê. */}
            {podeMarcarDesistenciaAqui ? (
              <p className="mb-2 text-xs text-navy-400">
                A dívida mantém-se; o regresso exige reativação da ADMIN.
              </p>
            ) : null}
            <DesistenciaForm
              alunoId={aluno.id}
              status={aluno.status}
              podeMarcar={session?.user ? podeMarcarDesistencia(session.user) : false}
              podeReativar={session?.user ? podeReativarDesistente(session.user) : false}
            />
          </div>
        </div>
      </Disclosure>

      {/* Aberto por omissão: é uma das três coisas que o Admin/DAAC consulta mais (§pedido do
          cliente 2026-08-28) — as ações de gestão é que ficam recolhidas, não o percurso. */}
      <Disclosure title="Percurso Curricular" subtitle={`${inscricoes.length} inscrição(ões)`} defaultOpen>
        <div className="flex flex-col gap-6">
          {inscricoes.length === 0 ? (
            <EmptyState message="Sem cadeiras inscritas." />
          ) : (
            percursoOrdenado.map((grupo) => {
              const semestres = [...grupo.porSemestre.keys()].sort((a, b) => a - b);
              const doGrupo = semestres.flatMap((s) => grupo.porSemestre.get(s)!);
              const aprovadas = doGrupo.filter((i) => resultadoDaInscricao(i).aprovado === true).length;
              return (
                <div key={`${grupo.anoLetivo}-${grupo.anoCurricular}`} className="flex flex-col gap-3">
                  {/* O que se repetia em cada linha (ano letivo, curso, ano) sobe para aqui, uma vez. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy-100 pb-2">
                    <h3 className="text-sm font-semibold text-navy-900">
                      {formatAnoLetivo(grupo.anoLetivo)} · {grupo.cursoNome} · {grupo.anoCurricular}º Ano
                    </h3>
                    <span className="text-xs text-navy-400">
                      {aprovadas} de {doGrupo.length} aprovada(s)
                    </span>
                  </div>

                  {semestres.map((semestre) => {
                    const doSemestre = grupo.porSemestre.get(semestre)!;
                    return (
                      <div key={semestre} className="flex flex-col gap-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">
                          {semestre}º Semestre
                        </p>
                        <div className="overflow-x-auto">
                          <Table>
                            <Thead>
                              <tr>
                                <Th>Disciplina</Th>
                                {COLUNAS_EPOCA.map((coluna) => (
                                  <Th key={coluna.epoca} className="text-center">
                                    {coluna.label}
                                  </Th>
                                ))}
                                <Th className="text-center">Média</Th>
                                <Th className="text-center">Final</Th>
                                <Th>Resultado</Th>
                                <Th>Professor</Th>
                                {podeRepetir ? <Th>{""}</Th> : null}
                              </tr>
                            </Thead>
                            <Tbody>
                              {doSemestre.map((inscricao) => {
                                const resultado = resultadoDaInscricao(inscricao);
                                return (
                                  <LinhaPercursoEditavel
                                    key={inscricao.id}
                                    inscricaoCadeiraId={inscricao.id}
                                    disciplinaNome={inscricao.turmaDisciplina.disciplina.nome}
                                    tentativa={inscricao.tentativa}
                                    ativa={inscricao.ativa}
                                    creditada={inscricao.creditada}
                                    instituicaoOrigemCreditado={inscricao.instituicaoOrigemCreditado}
                                    notasPorEpoca={Object.fromEntries(
                                      COLUNAS_EPOCA.map((c) => [c.epoca, notaDaEpoca(inscricao, c.epoca)]),
                                    ) as Record<Epoca, ReturnType<typeof notaDaEpoca>>}
                                    notaFrequencia={resultado.notaFrequencia}
                                    notaFinal={resultado.notaFinal}
                                    estado={resultado.estado}
                                    semestreEncerrado={semestreFechado(
                                      { anoLetivo: grupo.anoLetivo, semestre },
                                      { anoLetivo: anoLetivoAtual, semestreAtual: semestreAtualConfig },
                                    )}
                                    professorNome={nomeProfessor(inscricao.turmaDisciplina.professor)}
                                    temProfessor={Boolean(inscricao.turmaDisciplina.professor)}
                                    editavel={podeRepetir}
                                  />
                                );
                              })}
                            </Tbody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}

          {/* Legenda só quando há mesmo um zero automático — um asterisco sem explicação não diz
              nada a quem o vê pela primeira vez. */}
          {inscricoes.some((i) => i.notas.some((n) => n.automatica)) ? (
            <p className="text-xs text-navy-400">
              <span className="text-red-600">*</span> Nota lançada automaticamente a 0 — o prazo de lançamento
              expirou sem nota entregue.
            </p>
          ) : null}

          {/* `cadeirasDisponiveisParaCreditar.length` também: o CreditarCadeiraForm devolve null
              quando não há cadeiras a creditar, e sem esta guarda ficava o título e o separador
              por cima de coisa nenhuma. */}
          {podeRepetir && cadeirasDisponiveisParaCreditar.length > 0 ? (
            <div className="border-t border-navy-50 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                Aproveitamento (aluno transferido)
              </p>
              <CreditarCadeiraForm alunoId={aluno.id} cadeirasDisponiveis={cadeirasDisponiveisParaCreditar} />
            </div>
          ) : null}

          {/* A repetição deixou de ser o caminho normal — a rematrícula inscreve sozinha as
              cadeiras reprovadas, e desde 2026-08-28 cria até a oferta em falta. Isto fica como
              válvula de escape manual (repetir a meio do ano, corrigir uma repetição falhada), por
              isso passa a último e recolhido, em vez de parecer o fluxo principal. */}
          {podeRepetir && cadeirasAtivas.length > 0 ? (
            <details className="group border-t border-navy-50 pt-4">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-navy-400 hover:text-navy-600">
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                Inscrever numa repetição manualmente
              </summary>
              <p className="mb-2 mt-2 text-xs text-navy-400">
                Normalmente não é preciso: a rematrícula inscreve sozinha as cadeiras reprovadas. Use isto só para corrigir
                uma repetição que falhou, ou para inscrever fora da janela de matrículas.
              </p>
              <RepeticaoForm alunoId={aluno.id} cadeirasAtivas={cadeirasAtivas} ofertas={ofertas} />
            </details>
          ) : null}
        </div>
      </Disclosure>

      {podeVerDocumentos ? (
        <Disclosure title="Documentos" subtitle={`${documentos.length} documento(s)`}>
          <DocumentosAlunoCard alunoId={aluno.id} documentos={documentos} />
        </Disclosure>
      ) : null}

      <Disclosure title="Histórico de Pagamentos" subtitle={`${cobrancasComEstado.length} registo(s)`}>
        {cobrancasComEstado.length === 0 ? (
          <EmptyState message="Sem cobranças registadas." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Referência</Th>
                <Th>Valor</Th>
                <Th>Estado</Th>
                <Th>Pago em</Th>
                <Th>Registado por</Th>
              </tr>
            </Thead>
            <Tbody>
              {cobrancasComEstado.map((cobranca) => (
                <Tr key={cobranca.id}>
                  <Td className="font-medium text-navy-900">{COBRANCA_TIPO_LABEL[cobranca.tipo]}</Td>
                  <Td>{cobranca.mesReferencia ? formatDate(cobranca.mesReferencia) : (cobranca.descricao ?? "—")}</Td>
                  <Td>{formatCurrency(Number(cobranca.valorPago) > 0 ? Number(cobranca.valorPago) : Number(cobranca.valorDevido))}</Td>
                  <Td>
                    <Badge tone={ESTADO_COBRANCA_TONE[cobranca.estadoVisual]}>{ESTADO_COBRANCA_LABEL[cobranca.estadoVisual]}</Badge>
                  </Td>
                  <Td>{cobranca.dataPagamento ? formatDate(cobranca.dataPagamento) : "—"}</Td>
                  <Td>{cobranca.registadoPor?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Disclosure>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-navy-50 pb-2 last:border-0 last:pb-0">
      <span className="text-navy-400">{label}</span>
      <span className="font-medium text-navy-800">{value}</span>
    </div>
  );
}
