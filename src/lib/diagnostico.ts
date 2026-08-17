/**
 * Verificador de invariantes sobre o estado atual da BD (não sobre uma ação isolada). Um diff
 * antes/depois de uma Server Action só mostra o que mudou — nunca o que devia ter mudado e não
 * mudou. `InscricaoCadeira.ativa` esquecida em ações que fecham o ano de um aluno (rematrícula,
 * suspensão automática) é exatamente esse tipo de bug: cada linha do diff está "correta"
 * isoladamente, só o estado final está errado. Estas regras apanham isso.
 *
 * Funções puras — recebem os dados já carregados, não fazem queries. O runner (scripts/diagnostico)
 * é quem busca à BD e chama isto.
 */

export type Severidade = "ERROR" | "WARNING";

export interface Violacao {
  alunoId: string;
  alunoNome: string;
  regra: string;
  severidade: Severidade;
  detalhe: string;
}

export interface MatriculaResumo {
  id: string;
  status: "ATIVA" | "TRANCADA" | "CONCLUIDA";
  anoLetivo: number;
}

export interface InscricaoResumo {
  id: string;
  ativa: boolean;
  cadeiraCurricularId: string;
  cadeiraNome: string;
  turmaAnoLetivo: number;
  temHorarioSlot: boolean;
}

export interface AlunoParaDiagnostico {
  id: string;
  nome: string;
  status: "ATIVO" | "TRANCADO" | "FORMADO" | "DESISTENTE";
  matriculas: MatriculaResumo[];
  inscricoes: InscricaoResumo[];
}

function violacao(aluno: AlunoParaDiagnostico, regra: string, severidade: Severidade, detalhe: string): Violacao {
  return { alunoId: aluno.id, alunoNome: aluno.nome, regra, severidade, detalhe };
}

/** ERROR — não pode haver duas matrículas ATIVA em simultâneo para o mesmo aluno. */
function regraMatriculaAtivaUnica(aluno: AlunoParaDiagnostico): Violacao[] {
  const ativas = aluno.matriculas.filter((m) => m.status === "ATIVA");
  if (ativas.length <= 1) return [];
  return [violacao(aluno, "matricula-ativa-unica", "ERROR", `${ativas.length} matrículas ATIVA em simultâneo (ids: ${ativas.map((m) => m.id).join(", ")}).`)];
}

/**
 * ERROR — assinatura exata do bug de rematrícula/suspensão: uma InscricaoCadeira ativa cuja turma
 * é de um ano letivo anterior ao da matrícula ATIVA corrente do aluno. Sinal de que a ação que
 * fechou o ano anterior esqueceu de desativar esta inscrição.
 */
function regraInscricaoAtivaAnoAnterior(aluno: AlunoParaDiagnostico): Violacao[] {
  const matriculaAtiva = aluno.matriculas.find((m) => m.status === "ATIVA");
  if (!matriculaAtiva) return [];
  return aluno.inscricoes
    .filter((i) => i.ativa && i.turmaAnoLetivo < matriculaAtiva.anoLetivo)
    .map((i) =>
      violacao(
        aluno,
        "inscricao-ativa-ano-anterior",
        "ERROR",
        `Inscrição em ${i.cadeiraNome} (turma de ${i.turmaAnoLetivo}) continua ativa, mas a matrícula corrente é de ${matriculaAtiva.anoLetivo}.`,
      ),
    );
}

/** ERROR — aluno TRANCADO/DESISTENTE não deve ter nenhuma inscrição ativa. */
function regraSemInscricaoAtivaSeInativo(aluno: AlunoParaDiagnostico): Violacao[] {
  if (aluno.status !== "TRANCADO" && aluno.status !== "DESISTENTE") return [];
  const ativas = aluno.inscricoes.filter((i) => i.ativa);
  if (ativas.length === 0) return [];
  return [
    violacao(
      aluno,
      "sem-inscricao-ativa-se-inativo",
      "ERROR",
      `Aluno ${aluno.status} mas ainda tem ${ativas.length} inscrição(ões) ativa(s): ${ativas.map((i) => i.cadeiraNome).join(", ")}.`,
    ),
  ];
}

/** ERROR — só pode haver uma tentativa ativa por cadeira curricular de cada vez. */
function regraUmaTentativaAtivaPorCadeira(aluno: AlunoParaDiagnostico): Violacao[] {
  const contagem = new Map<string, InscricaoResumo[]>();
  for (const i of aluno.inscricoes.filter((i) => i.ativa)) {
    contagem.set(i.cadeiraCurricularId, [...(contagem.get(i.cadeiraCurricularId) ?? []), i]);
  }
  return [...contagem.values()]
    .filter((grupo) => grupo.length > 1)
    .map((grupo) => violacao(aluno, "uma-tentativa-ativa-por-cadeira", "ERROR", `${grupo.length} inscrições ativas para ${grupo[0].cadeiraNome} (ids: ${grupo.map((i) => i.id).join(", ")}).`));
}

/** WARNING — inscrição ativa cuja turma-disciplina ainda não tem horário construído (lacuna do DAAC, não corrupção). */
function regraInscricaoAtivaTemHorario(aluno: AlunoParaDiagnostico): Violacao[] {
  return aluno.inscricoes
    .filter((i) => i.ativa && !i.temHorarioSlot)
    .map((i) => violacao(aluno, "inscricao-ativa-tem-horario", "WARNING", `${i.cadeiraNome} está ativa mas a turma-disciplina não tem nenhum horário definido.`));
}

const REGRAS = [
  regraMatriculaAtivaUnica,
  regraInscricaoAtivaAnoAnterior,
  regraSemInscricaoAtivaSeInativo,
  regraUmaTentativaAtivaPorCadeira,
  regraInscricaoAtivaTemHorario,
];

export function diagnosticarAluno(aluno: AlunoParaDiagnostico): Violacao[] {
  return REGRAS.flatMap((regra) => regra(aluno));
}

export function diagnosticarTodos(alunos: AlunoParaDiagnostico[]): Violacao[] {
  return alunos.flatMap(diagnosticarAluno);
}
