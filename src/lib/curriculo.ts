import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgora } from "@/lib/tempo";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import type { Periodo, Prisma } from "@/generated/prisma/client";
type Decimal = Prisma.Decimal;
import { SALA_A_CONFIRMAR } from "@/lib/utils";
import { datasDoAnoLetivoSeguinte, dentroDoAnoLetivo, trabalhoDeFimDeAno } from "@/lib/academico";

/**
 * Garante que todo aluno com matrícula ativa nesta turma tem uma InscricaoCadeira (tentativa 1,
 * ativa) para cada CadeiraCurricular oferecida pelas TurmaDisciplina da turma. Idempotente — só
 * cria o que falta, nunca duplica nem mexe em inscrições já existentes (incluindo repetições).
 *
 * Chamada depois de matricular um aluno numa turma, e depois de atribuir uma nova disciplina a
 * uma turma já com alunos — nos dois casos pode haver combinações aluno×cadeira em falta.
 */
export async function sincronizarInscricoesTurma(turmaId: string): Promise<void> {
  const [matriculas, turmaDisciplinas] = await Promise.all([
    prisma.matricula.findMany({ where: { turmaId, status: "ATIVA" }, select: { alunoId: true } }),
    prisma.turmaDisciplina.findMany({
      where: { turmaId },
      select: { id: true, cadeiraCurricularId: true, cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } } },
    }),
  ]);
  if (matriculas.length === 0 || turmaDisciplinas.length === 0) return;

  const alunoIds = matriculas.map((m) => m.alunoId);
  const cadeiraCurricularIds = turmaDisciplinas.map((td) => td.cadeiraCurricularId);

  const inscricoesExistentes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId: { in: alunoIds }, cadeiraCurricularId: { in: cadeiraCurricularIds } },
    select: { alunoId: true, cadeiraCurricularId: true },
  });
  const jaInscrito = new Set(inscricoesExistentes.map((i) => `${i.alunoId}:${i.cadeiraCurricularId}`));

  // Congelamento de regras (§4.1.1, Fase 6): copia as regras de dispensa da cadeira NESTE momento
  // — calcularNotaFinal usa sempre estes valores, nunca os atuais da CadeiraCurricular.
  const novasInscricoes = alunoIds.flatMap((alunoId) =>
    turmaDisciplinas
      .filter((td) => !jaInscrito.has(`${alunoId}:${td.cadeiraCurricularId}`))
      .map((td) => ({
        alunoId,
        cadeiraCurricularId: td.cadeiraCurricularId,
        turmaDisciplinaId: td.id,
        tentativa: 1,
        ativa: true,
        permiteDispensaAplicada: td.cadeiraCurricular.permiteDispensa,
        notaMinimaDispensaAplicada: td.cadeiraCurricular.notaMinimaDispensa,
      })),
  );

  if (novasInscricoes.length > 0) {
    await prisma.inscricaoCadeira.createMany({ data: novasInscricoes, skipDuplicates: true });

    // As Aula desta turma-disciplina podem já existir (aluno a entrar a meio do ano — repetição,
    // rematrícula, mudança de curso). Sem isto, o aluno aparece na pauta e no roster (que leem
    // InscricaoCadeira), mas fica invisível na marcação de presença das aulas já dadas, porque a
    // Frequencia só é criada no momento em que a Aula é criada (ver createAulaAction).
    const criadas = await prisma.inscricaoCadeira.findMany({
      where: { tentativa: 1, OR: novasInscricoes.map((n) => ({ alunoId: n.alunoId, cadeiraCurricularId: n.cadeiraCurricularId })) },
      select: { id: true, turmaDisciplinaId: true },
    });
    await backfillFrequenciasParaInscricoes(criadas);
  }
}

/**
 * Cria a Frequencia (ausente por omissão) para cada Aula já existente da turma-disciplina de cada
 * inscrição nova — sem isto, um aluno que entra a meio do ano fica invisível na marcação de
 * presença de aulas anteriores à sua inscrição, apesar de já aparecer na pauta e no roster.
 */
export async function backfillFrequenciasParaInscricoes(inscricoes: { id: string; turmaDisciplinaId: string }[]): Promise<void> {
  if (inscricoes.length === 0) return;

  const turmaDisciplinaIds = [...new Set(inscricoes.map((i) => i.turmaDisciplinaId))];
  const aulas = await prisma.aula.findMany({
    where: { turmaDisciplinaId: { in: turmaDisciplinaIds } },
    select: { id: true, turmaDisciplinaId: true },
  });
  if (aulas.length === 0) return;

  const aulaIdsPorTurmaDisciplina = new Map<string, string[]>();
  for (const aula of aulas) {
    const lista = aulaIdsPorTurmaDisciplina.get(aula.turmaDisciplinaId) ?? [];
    lista.push(aula.id);
    aulaIdsPorTurmaDisciplina.set(aula.turmaDisciplinaId, lista);
  }

  const novasFrequencias = inscricoes.flatMap((inscricao) =>
    (aulaIdsPorTurmaDisciplina.get(inscricao.turmaDisciplinaId) ?? []).map((aulaId) => ({
      aulaId,
      inscricaoCadeiraId: inscricao.id,
      presente: false,
    })),
  );

  if (novasFrequencias.length > 0) {
    await prisma.frequencia.createMany({ data: novasFrequencias, skipDuplicates: true });
  }
}

/**
 * Anos curriculares anteriores a `anoCurricularEntrada` que ainda não têm Turma criada para este
 * curso×período×anoLetivo — usado para bloquear a matrícula direta num ano > 1º (§pedido do
 * cliente: entrada direta tem de trazer as cadeiras anteriores em falta) antes de criar o aluno.
 * Devolve [] se não houver nenhum em falta (inclui o caso anoCurricularEntrada <= 1, que não
 * precisa de nenhum ano anterior).
 */
export async function anosAnterioresEmFalta(
  cursoId: string,
  periodo: Periodo,
  anoLetivo: number,
  anoCurricularEntrada: number,
): Promise<number[]> {
  if (anoCurricularEntrada <= 1) return [];
  const anosNecessarios = Array.from({ length: anoCurricularEntrada - 1 }, (_, i) => i + 1);

  const turmasExistentes = await prisma.turma.findMany({
    where: { cursoId, periodo, anoLetivo, anoCurricular: { in: anosNecessarios } },
    select: { anoCurricular: true },
  });
  const anosComTurma = new Set(turmasExistentes.map((t) => t.anoCurricular));
  return anosNecessarios.filter((ano) => !anosComTurma.has(ano));
}

/**
 * Entrada direta num ano > 1º (§pedido do cliente): inscreve o aluno em todas as cadeiras dos
 * anos curriculares anteriores, na oferta corrente (mesmo anoLetivo/período) desses anos — o
 * aluno ainda tem de as cursar aqui, ao mesmo tempo que as do ano de entrada. Chamar só depois de
 * confirmar, com `anosAnterioresEmFalta`, que todas as turmas anteriores já existem (esta função
 * não valida nem cria turmas em falta — silenciosamente ignora anos sem oferta).
 *
 * Sem Matricula nova para os anos anteriores: o aluno só fica formalmente matriculado na turma de
 * entrada, tal como uma repetição manual (criarTentativaRepeticaoAction) também não cria
 * Matricula — só a InscricaoCadeira representa "está a cursar esta cadeira".
 */
export async function inscreverCadeirasAnosAnteriores(
  alunoId: string,
  cursoId: string,
  periodo: Periodo,
  anoLetivo: number,
  anoCurricularEntrada: number,
): Promise<void> {
  if (anoCurricularEntrada <= 1) return;
  const anosNecessarios = Array.from({ length: anoCurricularEntrada - 1 }, (_, i) => i + 1);

  const turmaDisciplinas = await prisma.turmaDisciplina.findMany({
    where: { turma: { cursoId, periodo, anoLetivo, anoCurricular: { in: anosNecessarios } } },
    select: {
      id: true,
      cadeiraCurricularId: true,
      cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } },
    },
  });
  if (turmaDisciplinas.length === 0) return;

  // Congelamento de regras (§4.1.1) — mesmo raciocínio de sincronizarInscricoesTurma.
  const novasInscricoes = turmaDisciplinas.map((td) => ({
    alunoId,
    cadeiraCurricularId: td.cadeiraCurricularId,
    turmaDisciplinaId: td.id,
    tentativa: 1,
    ativa: true,
    permiteDispensaAplicada: td.cadeiraCurricular.permiteDispensa,
    notaMinimaDispensaAplicada: td.cadeiraCurricular.notaMinimaDispensa,
  }));
  await prisma.inscricaoCadeira.createMany({ data: novasInscricoes, skipDuplicates: true });

  // Mesma lógica de sincronizarInscricoesTurma: sem isto, o aluno fica invisível na marcação de
  // presença de aulas de anos anteriores já dadas antes da sua entrada (não deveria haver
  // nenhuma no mesmo dia da criação, mas a entrada pode acontecer a meio do ano letivo).
  const criadas = await prisma.inscricaoCadeira.findMany({
    where: { alunoId, tentativa: 1, cadeiraCurricularId: { in: turmaDisciplinas.map((td) => td.cadeiraCurricularId) } },
    select: { id: true, turmaDisciplinaId: true },
  });
  await backfillFrequenciasParaInscricoes(criadas);
}

/**
 * Alinha as turmas do ano letivo corrente com o plano curricular: cria a TurmaDisciplina em falta
 * para cada CadeiraCurricular do curso×ano que a turma ainda não oferece, sem professor (o DAAC
 * atribui-o depois) e com sala por confirmar.
 *
 * Só ACRESCENTA — nunca apaga. Uma disciplina já a decorrer pode ter notas, aulas e presenças, e o
 * histórico do aluno tem de sobreviver a mudanças posteriores do plano (§pedido do cliente
 * 2026-08-27): quem cursou uma cadeira em 2026 mantém a InscricaoCadeira e a nota mesmo que ela
 * saia do plano em 2027. Remover uma cadeira do plano continua a ser um acto manual do DAAC, e a
 * BD já o impede enquanto houver turmas ou inscrições a usá-la (deleteCadeiraCurricularAction).
 *
 * Anos letivos passados ficam intocados — são registo histórico, não se reescrevem.
 * Devolve quantas ofertas criou, para a auditoria/telemetria poder dizer se fez alguma coisa.
 */
export async function sincronizarTurmasComPlanoCurricular(anoLetivo: number): Promise<number> {
  const turmas = await prisma.turma.findMany({
    where: { anoLetivo: { gte: anoLetivo } },
    select: {
      id: true,
      cursoId: true,
      anoCurricular: true,
      turmaDisciplinas: { select: { cadeiraCurricularId: true } },
    },
  });
  if (turmas.length === 0) return 0;

  // Uma query só para todo o plano das combinações curso×ano envolvidas — evita N queries.
  const cadeiras = await prisma.cadeiraCurricular.findMany({
    where: { OR: turmas.map((t) => ({ cursoId: t.cursoId, anoCurricular: t.anoCurricular })) },
    select: { id: true, cursoId: true, anoCurricular: true, disciplinaId: true, semestre: true },
  });
  const planoPorChave = new Map<string, typeof cadeiras>();
  for (const cadeira of cadeiras) {
    const chave = `${cadeira.cursoId}:${cadeira.anoCurricular}`;
    planoPorChave.set(chave, [...(planoPorChave.get(chave) ?? []), cadeira]);
  }

  const novasOfertas = turmas.flatMap((turma) => {
    const doPlano = planoPorChave.get(`${turma.cursoId}:${turma.anoCurricular}`) ?? [];
    const jaOferecidas = new Set(turma.turmaDisciplinas.map((td) => td.cadeiraCurricularId));
    return doPlano
      .filter((cadeira) => !jaOferecidas.has(cadeira.id))
      .map((cadeira) => ({
        turmaId: turma.id,
        disciplinaId: cadeira.disciplinaId,
        cadeiraCurricularId: cadeira.id,
        professorId: null,
        semestre: cadeira.semestre,
        sala: SALA_A_CONFIRMAR,
      }));
  });
  if (novasOfertas.length === 0) return 0;

  await prisma.turmaDisciplina.createMany({ data: novasOfertas, skipDuplicates: true });

  // Os alunos já matriculados nessas turmas têm de ficar inscritos nas disciplinas novas.
  const turmasTocadas = [...new Set(novasOfertas.map((o) => o.turmaId))];
  for (const turmaId of turmasTocadas) {
    await sincronizarInscricoesTurma(turmaId);
  }

  return novasOfertas.length;
}

/**
 * Garante que existe uma TurmaDisciplina para esta CadeiraCurricular no ano letivo alvo, criando a
 * Turma correspondente se ainda não houver — usada pela rematrícula quando um aluno tem de repetir
 * uma cadeira de um ano curricular que ainda não abriu turma no ano novo (§pedido do cliente
 * 2026-08-28). Sem isto a repetição não era criada: ficava um aviso e a cadeira por resolver à mão.
 *
 * A turma nasce no mesmo curso e período da matrícula de origem — é onde o aluno repetente vai
 * assistir. Sem professor, como qualquer oferta criada automaticamente.
 *
 * Devolve null se a cadeira não pertencer ao curso indicado (não se inventa oferta fora do plano).
 */
export async function garantirOfertaParaRepeticao(params: {
  cadeiraCurricularId: string;
  cursoId: string;
  periodo: Periodo;
  anoLetivo: number;
}): Promise<{ id: string; cadeiraCurricular: { permiteDispensa: boolean; notaMinimaDispensa: Decimal } } | null> {
  const { cadeiraCurricularId, cursoId, periodo, anoLetivo } = params;

  const cadeira = await prisma.cadeiraCurricular.findUnique({
    where: { id: cadeiraCurricularId },
    select: { id: true, cursoId: true, anoCurricular: true, disciplinaId: true, semestre: true, permiteDispensa: true, notaMinimaDispensa: true },
  });
  if (!cadeira || cadeira.cursoId !== cursoId) return null;

  // A turma do ano curricular da CADEIRA (não a do aluno): quem avança para o 2º ano e repete uma
  // cadeira do 1º assiste na turma de 1º ano.
  const turma = await prisma.turma.upsert({
    where: { cursoId_anoCurricular_periodo_anoLetivo: { cursoId, anoCurricular: cadeira.anoCurricular, periodo, anoLetivo } },
    update: {},
    create: { cursoId, anoCurricular: cadeira.anoCurricular, periodo, anoLetivo },
    select: { id: true },
  });

  // upsert e não create: dois repetentes da mesma cadeira processados em paralelo entrariam os dois
  // aqui, e o @@unique([turmaId, cadeiraCurricularId]) rejeitaria o segundo.
  const oferta = await prisma.turmaDisciplina.upsert({
    where: { turmaId_cadeiraCurricularId: { turmaId: turma.id, cadeiraCurricularId: cadeira.id } },
    update: {},
    create: {
      turmaId: turma.id,
      disciplinaId: cadeira.disciplinaId,
      cadeiraCurricularId: cadeira.id,
      professorId: null,
      semestre: cadeira.semestre,
      sala: SALA_A_CONFIRMAR,
    },
    select: { id: true },
  });

  return {
    id: oferta.id,
    cadeiraCurricular: { permiteDispensa: cadeira.permiteDispensa, notaMinimaDispensa: cadeira.notaMinimaDispensa },
  };
}

/**
 * Rede de segurança diária da sincronização acima. O caminho normal é imediato — adicionar uma
 * cadeira ao plano propaga-a logo (createCadeiraCurricularAction) — mas isso não apanha turmas que
 * ficaram desalinhadas por outra via: criadas antes de a oferta automática existir, ou o plano
 * mudou quando ainda não havia turma desse ano. Mesmo padrão preguiçoso de
 * garantirSuspensaoAutomatica: no máximo uma vez por dia civil, sem cron.
 */
export async function garantirTurmasSincronizadasComPlano(): Promise<void> {
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const agora = await getAgora();
  if (config?.ultimaSincronizacaoPlanoEm && inicioDoDia(config.ultimaSincronizacaoPlanoEm).getTime() === inicioDoDia(agora).getTime()) {
    return;
  }

  // Reclama o "turno" do dia com um update condicional, como os outros jobs preguiçosos — dois
  // pedidos em simultâneo no primeiro acesso do dia não fazem o trabalho duas vezes.
  const reclamado = await prisma.configuracaoAcademica.updateMany({
    where: {
      id: "config",
      OR: [{ ultimaSincronizacaoPlanoEm: null }, { ultimaSincronizacaoPlanoEm: { lt: inicioDoDia(agora) } }],
    },
    data: { ultimaSincronizacaoPlanoEm: agora },
  });
  if (reclamado.count === 0) return;

  after(async () => {
    await sincronizarTurmasComPlanoCurricular(agora.getFullYear());
  });
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Suspende automaticamente quem não veio fazer a rematrícula (§4.2/Fase 8b): todo o Aluno ATIVO
 * cuja Matricula mais recente aponta a um ano letivo anterior ao corrente passa a TRANCADO (e essa
 * Matricula a TRANCADA) — fica associado ao ano onde parou, e nunca mais aparece nas turmas do ano
 * novo, porque nunca ganha Matricula nova.
 *
 * §2026-09-03: espera pelo FIM DA JANELA DE MATRÍCULA, não pelo fim do ano letivo. Antes usava
 * `anoLetivoFim`, e a versão anterior deste comentário defendia a escolha dizendo que "são
 * fronteiras diferentes" — são, mas a errada estava a ser usada. Na configuração real do cliente o
 * ano letivo acabava a 24/Jun e as matrículas só abriam a 30/Ago: os alunos eram todos trancados
 * em bloco no dia 25/Jun, DOIS MESES antes de existir sequer maneira de renovar. E a mensagem que
 * o aluno lia — "não renovou dentro do prazo" — falava de um prazo que nunca chegou a existir.
 * Só depois de a janela fechar é que "não veio renovar" é uma afirmação verdadeira.
 *
 * Sem janela de matrícula configurada, não suspende ninguém: sem fronteira não há forma de
 * distinguir quem faltou de quem ainda vai a tempo, e trancar por omissão é o pior dos erros
 * possíveis aqui — tira o acesso a quem não fez nada de errado.
 *
 * O rollover das turmas e das datas NÃO depende disto e continua a acontecer no fim do ano letivo
 * (ver o after() abaixo): as turmas do ano novo têm de existir ANTES de as matrículas abrirem,
 * senão não há para onde rematricular.
 *
 * Mesmo padrão preguiçoso de garantirCobrancasGeradas (financeiro.ts): corre no máximo uma vez
 * por dia civil, reclamando o "turno" com um updateMany condicional. Sem cron horário.
 */
export async function garantirSuspensaoAutomatica(): Promise<void> {
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  // Ambas as datas: o ano novo e as datas novas derivam-se do intervalo antigo, não do calendário.
  if (!config?.anoLetivoFim || !config.anoLetivoInicio) return;

  const agora = await getAgora();

  // Entre anos letivos o semestre é sempre o 1º — é assim que o ano novo tem de arrancar. Corre
  // FORA do turno diário e antes dele, de propósito: é uma condição contínua, não uma tarefa de
  // fim de ano. §2026-09-03: o rollover repunha o semestre, mas corre uma única vez, no dia em que
  // o ano acaba; qualquer alteração posterior — um clique manual, um seed, uma restauração de
  // backup — ficava até ao fim do ano letivo SEGUINTE. Aconteceu nesta instalação: o ano
  // 2027/2028 ia arrancar no 2º semestre, e os alunos veriam as disciplinas erradas no primeiro
  // dia. O `updateMany` só escreve quando está errado, por isso é barato e idempotente.
  if (!dentroDoAnoLetivo(agora, config)) {
    await prisma.configuracaoAcademica.updateMany({
      where: { id: "config", semestreAtual: { not: 1 } },
      data: { semestreAtual: 1 },
    });
  }

  // Dois gatilhos distintos, deliberadamente separados — a regra vive em trabalhoDeFimDeAno
  // (lib/academico.ts), onde é testável, e a nota lá explica porquê.
  const { rollover: precisaRollover, suspender: precisaSuspender } = trabalhoDeFimDeAno(agora, config);
  if (!precisaRollover && !precisaSuspender) return;

  if (config.ultimaSuspensaoEm && inicioDoDia(config.ultimaSuspensaoEm).getTime() === inicioDoDia(agora).getTime()) {
    return;
  }

  const reclamado = await prisma.configuracaoAcademica.updateMany({
    where: {
      id: "config",
      OR: [{ ultimaSuspensaoEm: null }, { ultimaSuspensaoEm: { lt: inicioDoDia(agora) } }],
    },
    data: { ultimaSuspensaoEm: agora },
  });
  if (reclamado.count === 0) return;

  // O ano novo é o que acabou + 1, lido da configuração — não o ano civil de hoje. Ver nota em
  // rolloverTurmas: o job corre no primeiro acesso depois do fim do ano letivo, e essa data pode
  // cair em qualquer altura do ano civil.
  // Fixados fora do closure: dentro de after() o TypeScript já não vê o guarda de null acima.
  const { anoLetivoInicio, anoLetivoFim, matriculaInicio, matriculaFim } = config;

  // Depois do rollover, a config já aponta ao ano novo: o ano corrente é o do início configurado, e
  // só há "+1" enquanto o rollover ainda está por fazer. Sem esta distinção, a suspensão que corre
  // numa passagem posterior compararia contra um ano letivo que não existe.
  const anoLetivoCorrenteConfig = anoLetivoInicio.getFullYear();
  const anoLetivoNovo = precisaRollover ? anoLetivoCorrenteConfig + 1 : anoLetivoCorrenteConfig;

  after(async () => {
    if (precisaRollover) {
      await rolloverTurmas(anoLetivoNovo);
      // Sem avançar as datas, a configuração continuava a apontar para o ano que acabou:
      // anoLetivoCorrente devolvia null, o Horário bloqueava e o sistema ficava parado à espera que
      // alguém fosse mexer nas datas — precisamente quando as matrículas abrem e é preciso marcar
      // os horários. O DAAC ajusta depois se as datas reais do ano novo forem outras.
      //
      // §2026-09-03: a janela de MATRÍCULA avança junto. Antes ficava no ano que acabou, e a
      // Secretaria não conseguia rematricular ninguém ("fora do período de matrícula") no momento
      // exato em que era suposto fazê-lo — só a ADMIN passava, por ter podeForaDaJanela.
      //
      // O semestre volta a 1º aqui, com as datas: começa um ano letivo novo, e o DAAC não tem de
      // se lembrar de o repor todos os anos. §2026-09-03: estava em suspenderNaoRematriculados, o
      // que deixou de servir quando a suspensão passou a poder correr a meio do ano letivo (no
      // fecho da janela de matrícula) — de lá, rebobinaria o semestre para 1 no meio do 2º.
      await prisma.configuracaoAcademica.update({
        where: { id: "config" },
        data: {
          ...datasDoAnoLetivoSeguinte({ anoLetivoInicio, anoLetivoFim, matriculaInicio, matriculaFim }),
          semestreAtual: 1,
        },
      });
    }

    // Só quando a janela já fechou. Enquanto estiver aberta — ou ainda por abrir, como no intervalo
    // entre o fim do ano letivo e a abertura das matrículas — quem não renovou está a tempo, não em
    // falta, e trancá-lo seria dizer-lhe que falhou um prazo que ainda não passou.
    if (precisaSuspender) {
      await suspenderNaoRematriculados(anoLetivoNovo);
    }
  });
}

/**
 * Cria a turma do ano letivo novo para cada combinação curso×ano curricular×período que já tinha
 * turma no ano que acabou (§pedido do cliente 2026-08-18: "quando o ano letivo termina, a página
 * de turmas atualiza automaticamente, a antiga fica só como histórico"). Sem isto,
 * processarRematriculaAction rejeitava toda rematrícula com "crie a turma primeiro em Admin >
 * Turmas" — alguém tinha de pré-criar cada combinação à mão antes da época de rematrícula.
 *
 * Copia as disciplinas, mas NÃO o professor nem a sala (§decisão do cliente 2026-08-29): quem
 * lecciona o quê, e onde, decide-se no início de cada ano, e um professor herdado do ano anterior é
 * uma informação que parece verdadeira e pode não ser — pior do que estar vazia, porque ninguém a
 * revê. Vazio força a decisão consciente, e o cartão "A precisar de atenção" no painel conta
 * quantas faltam. O horário também não é copiado (nunca foi): marca-se de novo a cada ano.
 *
 * `anoLetivoNovo` vem da configuração (ano que acabou + 1), NÃO de agora.getFullYear(): o job corre
 * no primeiro acesso depois do fim do ano letivo, que pode cair em qualquer altura do ano civil, e
 * com o ano errado ou criava turmas duplicadas (engolidas pelo catch, ficando o ano novo sem
 * nenhuma) ou trancava os alunos errados.
 *
 * A turma antiga nunca é tocada — fica exatamente como histórico.
 */
async function rolloverTurmas(anoLetivoNovo: number): Promise<void> {
  const turmasAnoAnterior = await prisma.turma.findMany({
    where: { anoLetivo: anoLetivoNovo - 1 },
    include: { turmaDisciplinas: true },
  });

  for (const turmaAntiga of turmasAnoAnterior) {
    let turmaNova;
    try {
      turmaNova = await prisma.turma.create({
        data: {
          cursoId: turmaAntiga.cursoId,
          anoCurricular: turmaAntiga.anoCurricular,
          periodo: turmaAntiga.periodo,
          anoLetivo: anoLetivoNovo,
        },
      });
    } catch (error) {
      // Já rolada (corrida entre dois pedidos no mesmo dia da virada, ou reprocessamento) — só
      // continua se a turma nova ainda não tiver nenhuma TurmaDisciplina copiada.
      if (!isUniqueConstraintViolation(error)) throw error;
      turmaNova = await prisma.turma.findUniqueOrThrow({
        where: {
          cursoId_anoCurricular_periodo_anoLetivo: {
            cursoId: turmaAntiga.cursoId,
            anoCurricular: turmaAntiga.anoCurricular,
            periodo: turmaAntiga.periodo,
            anoLetivo: anoLetivoNovo,
          },
        },
      });
      const jaTemDisciplinas = await prisma.turmaDisciplina.findFirst({ where: { turmaId: turmaNova.id } });
      if (jaTemDisciplinas) continue;
    }

    if (turmaAntiga.turmaDisciplinas.length > 0) {
      await prisma.turmaDisciplina.createMany({
        data: turmaAntiga.turmaDisciplinas.map((td) => ({
          turmaId: turmaNova.id,
          disciplinaId: td.disciplinaId,
          cadeiraCurricularId: td.cadeiraCurricularId,
          // professorId e sala ficam por preencher de propósito — ver nota no cabeçalho.
          professorId: null,
          semestre: td.semestre,
          sala: SALA_A_CONFIRMAR,
        })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Corre em `after()`, fora do request-response — ver o mesmo raciocínio em
 * garantirCobrancasGeradas (src/lib/financeiro.ts). Este findMany sobre todos os alunos ATIVO
 * é da mesma família de custo pesado-no-dia-da-virada que causava contenção no pool de ligações
 * sob os picos de tráfego da simulação de ano caótico.
 */
async function suspenderNaoRematriculados(anoLetivoNovo: number): Promise<void> {
  // §Opção A (2026-08-24): só ATIVO é suspendível. FORMADO fica de fora de propósito — quem
  // terminou o curso (processarRematriculaAction marca FORMADO no fim-de-curso) não "trancou",
  // terminou; TRANCADO/DESISTENTE já estão fora do ciclo de matrículas.
  const alunosAtivos = await prisma.aluno.findMany({
    where: { status: "ATIVO" },
    select: {
      id: true,
      matriculas: {
        orderBy: { turma: { anoLetivo: "desc" } },
        take: 1,
        select: { id: true, turma: { select: { anoLetivo: true } } },
      },
    },
  });

  const aSuspender = alunosAtivos.filter((a) => {
    const ultimaMatricula = a.matriculas[0];
    return ultimaMatricula && ultimaMatricula.turma.anoLetivo < anoLetivoNovo;
  });
  if (aSuspender.length === 0) return;

  const alunoIds = aSuspender.map((a) => a.id);
  await prisma.$transaction([
    prisma.aluno.updateMany({ where: { id: { in: alunoIds } }, data: { status: "TRANCADO" } }),
    prisma.matricula.updateMany({
      where: { id: { in: aSuspender.map((a) => a.matriculas[0].id) } },
      data: { status: "TRANCADA" },
    }),
    // Sem isto, as inscrições do ano suspenso ficam `ativa=true` para sempre — mesma classe de
    // bug da rematrícula (src/lib/diagnostico.ts: regra sem-inscricao-ativa-se-inativo).
    prisma.inscricaoCadeira.updateMany({ where: { alunoId: { in: alunoIds }, ativa: true }, data: { ativa: false } }),
  ]);
}
