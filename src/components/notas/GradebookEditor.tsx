"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { lancarNotasEmLoteAction } from "@/actions/notas";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { cn, formatDate } from "@/lib/utils";
import {
  calcularNotaFinal,
  extrairNotasPorEpoca,
  epocasVisiveis,
  EPOCA_LABEL,
  ESTADO_LABEL,
  type EstadoAvaliacao,
  type NotasCadeira,
} from "@/lib/avaliacao";
import type { Epoca } from "@/generated/prisma/client";

const ESTADO_TONE: Record<EstadoAvaliacao, "success" | "warning" | "danger" | "neutral"> = {
  EM_CURSO: "neutral",
  DISPENSADO: "success",
  ADMITIDO_A_EXAME: "warning",
  EM_RECURSO: "warning",
  EM_EXAME_ESPECIAL: "warning",
  APROVADO: "success",
  REPROVADO: "danger",
};

interface AvaliacaoResumo {
  epoca: Epoca;
  /** Sem efeito enquanto a Avaliacao ainda não existir (nasce na primeira nota lançada) — nunca desativada por prazo até lá. */
  disabled: boolean;
  /**
   * Porquê fechada — dá ao professor a razão em vez de um campo cinzento sem explicação.
   * null quando está aberta (ou quando `disabled` vem de outra causa que não a janela).
   */
  motivoFechado?: "PROVA_POR_REALIZAR" | "LANCAMENTO_FECHADO" | null;
  /** Data da prova, para a mensagem dizer a partir de quando abre. */
  dataProva?: Date | null;
}

interface InscricaoResumo {
  id: string;
  alunoNome: string;
  tentativa: number;
  permiteDispensaAplicada: boolean;
  notaMinimaDispensaAplicada: number;
  notas: { epoca: Epoca; valor: number; automatica: boolean }[];
}

interface GradebookEditorProps {
  turmaDisciplinaId: string;
  avaliacoes: AvaliacaoResumo[];
  inscricoes: InscricaoResumo[];
  editable: boolean;
}

function chave(inscricaoCadeiraId: string, epoca: Epoca): string {
  return `${inscricaoCadeiraId}:${epoca}`;
}

export function GradebookEditor({ turmaDisciplinaId, avaliacoes, inscricoes, editable }: GradebookEditorProps) {
  const [edicoes, setEdicoes] = useState<Map<string, number>>(new Map());
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // A Média (frequência, (P1+P2)/2) não é uma Avaliacao lançável — é um valor derivado, mostrado
  // entre P2 e Exame para o professor ver já a caminhar para dispensa antes de a época de exame
  // sequer ser editável.
  const antesDoExame = avaliacoes.filter((a) => a.epoca === "P1" || a.epoca === "P2");
  const desdeExame = avaliacoes.filter((a) => a.epoca !== "P1" && a.epoca !== "P2");
  const mostrarMedia = antesDoExame.length > 0;

  function handleChange(inscricaoCadeiraId: string, epoca: Epoca, valorStr: string) {
    setErro(null);
    setEdicoes((prev) => {
      const proximo = new Map(prev);
      if (valorStr === "") {
        proximo.delete(chave(inscricaoCadeiraId, epoca));
      } else {
        proximo.set(chave(inscricaoCadeiraId, epoca), Number(valorStr));
      }
      return proximo;
    });
  }

  function notasEfetivas(inscricao: InscricaoResumo) {
    return avaliacoes
      .map((avaliacao) => {
        const editado = edicoes.get(chave(inscricao.id, avaliacao.epoca));
        const salvo = inscricao.notas.find((n) => n.epoca === avaliacao.epoca)?.valor;
        const valor = editado ?? salvo;
        return valor === undefined ? null : { valor, avaliacao: { epoca: avaliacao.epoca } };
      })
      .filter((n): n is { valor: number; avaliacao: { epoca: Epoca } } => n !== null);
  }

  /** Média "a caminhar" para o professor acompanhar em tempo real — diferente de
   * resultado.notaFrequencia, que fica null até P1 e P2 existirem (correto para a decisão de
   * dispensa/exame, mas não para esta pré-visualização: com só uma nota lançada, mostra essa nota
   * como média provisória em vez de "—", em vez de esperar pela segunda). */
  function mediaProvisoria(notasCadeira: NotasCadeira): number | null {
    const valores = [notasCadeira.p1, notasCadeira.p2].filter((v): v is number => v !== null);
    if (valores.length === 0) return null;
    return valores.reduce((soma, v) => soma + v, 0) / valores.length;
  }

  // Uma linha por inscrição, calculada uma vez por render — reutilizada tanto pelo JSX (para
  // desativar/esvaziar células órfãs em tempo real) como por guardar() (para nunca enviar uma
  // edição pendente de uma célula que a própria tecla que a precedeu acabou de tornar irrelevante).
  const linhas = inscricoes.map((inscricao) => {
    const notasCadeira = extrairNotasPorEpoca(notasEfetivas(inscricao));
    const resultado = calcularNotaFinal(notasCadeira, {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: inscricao.notaMinimaDispensaAplicada,
    });
    // Recalculado a cada tecla — assim que P1+P2 (ainda não gravados) já dão dispensa, o
    // Exame/Recurso/Especial ficam bloqueados de imediato, sem esperar por Guardar.
    const visiveis = new Set(epocasVisiveis(notasCadeira, resultado.estado));
    const orfas = new Set(resultado.epocasOrfas);
    const media = mediaProvisoria(notasCadeira);
    return { inscricao, resultado, visiveis, orfas, media };
  });

  function guardar() {
    const orfasPorInscricao = new Map(linhas.map((l) => [l.inscricao.id, l.orfas]));
    const entradas = [...edicoes.entries()]
      .map(([key, valor]) => {
        const [inscricaoCadeiraId, epoca] = key.split(":") as [string, Epoca];
        return { turmaDisciplinaId, epoca, inscricaoCadeiraId, valor };
      })
      // Uma célula de recurso preenchida antes de corrigir o exame que a tornou desnecessária,
      // por exemplo — descartar em vez de gravar uma nota que o próprio pedido já sabe ser órfã.
      .filter((e) => !orfasPorInscricao.get(e.inscricaoCadeiraId)?.has(e.epoca));
    if (entradas.length === 0) return;

    startTransition(async () => {
      const result = await lancarNotasEmLoteAction(entradas);
      if (result.error) {
        setErro(result.error);
      } else {
        setEdicoes(new Map());
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {editable ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-navy-100 bg-navy-50/60 px-4 py-2.5">
          <p className="text-xs text-navy-500">
            {edicoes.size === 0
              ? "Edite as notas e clique em Guardar — só as células alteradas são enviadas."
              : `${edicoes.size} nota(s) por gravar.`}
          </p>
          <div className="flex items-center gap-2">
            {erro ? <p className="text-xs text-red-600">{erro}</p> : null}
            <button
              type="button"
              onClick={guardar}
              disabled={edicoes.size === 0 || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar alterações
            </button>
          </div>
        </div>
      ) : null}

      <Table>
        <Thead>
          <tr>
            <Th>Aluno</Th>
            {antesDoExame.map((avaliacao) => (
              <Th key={avaliacao.epoca}>{EPOCA_LABEL[avaliacao.epoca]}</Th>
            ))}
            {mostrarMedia ? <Th>Média</Th> : null}
            {desdeExame.map((avaliacao) => (
              <Th key={avaliacao.epoca}>{EPOCA_LABEL[avaliacao.epoca]}</Th>
            ))}
            <Th>Estado</Th>
            <Th>Nota Final</Th>
          </tr>
        </Thead>
        <Tbody>
          {linhas.map(({ inscricao, resultado, visiveis, orfas, media }) => {
            function celula(avaliacao: AvaliacaoResumo) {
              const orfa = orfas.has(avaliacao.epoca);
              const notaSalva = orfa ? null : (inscricao.notas.find((n) => n.epoca === avaliacao.epoca) ?? null);
              const editado = orfa ? undefined : edicoes.get(chave(inscricao.id, avaliacao.epoca));
              const valor = editado !== undefined ? editado.toString() : (notaSalva?.valor.toString() ?? "");
              const foraDeAlcance = !orfa && !visiveis.has(avaliacao.epoca) && notaSalva === null;
              const desativado = !editable || avaliacao.disabled || foraDeAlcance || orfa;
              const ehAutomatica = notaSalva?.automatica === true && editado === undefined;
              return (
                <Td key={avaliacao.epoca}>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step="0.5"
                    value={valor}
                    disabled={desativado}
                    title={
                      orfa
                        ? "Já não é preciso — uma época anterior corrigida já resolve o resultado"
                        : foraDeAlcance
                          ? "Ainda não é preciso — depende do resultado das épocas anteriores"
                          : avaliacao.motivoFechado === "PROVA_POR_REALIZAR"
                            ? `A prova ainda não se realizou — abre a ${avaliacao.dataProva ? formatDate(avaliacao.dataProva) : "data da prova"}`
                            : avaliacao.motivoFechado === "LANCAMENTO_FECHADO"
                              ? "O lançamento de notas está fechado — peça ao DAAC para abrir"
                              : ehAutomatica
                                ? "0 automático — atribuído no fecho do semestre por falta de nota"
                                : undefined
                    }
                    onChange={(e) => handleChange(inscricao.id, avaliacao.epoca, e.target.value)}
                    className={cn(
                      "w-16 rounded-md border px-2 py-1 text-center text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100",
                      desativado ? "cursor-not-allowed bg-navy-50 text-navy-300 border-navy-100" : "border-navy-100",
                      ehAutomatica && "border-red-300 bg-red-50 text-red-700",
                      edicoes.has(chave(inscricao.id, avaliacao.epoca)) && "border-gold-400 bg-gold-50",
                    )}
                  />
                </Td>
              );
            }

            return (
              <Tr key={inscricao.id}>
                <Td className="font-medium text-navy-900">
                  {inscricao.alunoNome}
                  {inscricao.tentativa > 1 ? (
                    <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">{inscricao.tentativa}ª tentativa</span>
                  ) : null}
                </Td>
                {antesDoExame.map(celula)}
                {mostrarMedia ? <Td className="font-medium text-navy-600">{media !== null ? media.toFixed(1) : "—"}</Td> : null}
                {desdeExame.map(celula)}
                <Td>
                  <Badge tone={ESTADO_TONE[resultado.estado]}>{ESTADO_LABEL[resultado.estado]}</Badge>
                </Td>
                <Td className="font-semibold text-navy-900">{resultado.notaFinal !== null ? resultado.notaFinal.toFixed(1) : "—"}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </div>
  );
}
