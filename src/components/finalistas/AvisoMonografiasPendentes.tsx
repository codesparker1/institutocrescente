import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { anoLetivoDeReferenciaFinalistas, getMonografiasPendentesDeDecisao } from "@/lib/finalistas";
import { getAgora } from "@/lib/tempo";
import { formatAnoLetivo, formatDate } from "@/lib/utils";
import { DecisaoTransicao } from "./DecisaoTransicao";

/**
 * Aviso das monografias por defender que transitaram de ano sem decisão — §pedido do cliente
 * 2026-09-05: "aparece no momento do fim do ano lectivo... e se isso não for respondido aparece de
 * novo na época de matrículas".
 *
 * Não tem lógica de datas de propósito: fica visível enquanto houver casos por decidir, o que
 * cobre os dois momentos e mais os que estiverem pelo meio. Um aviso que só aparecesse em duas
 * janelas podia ser fechado sem ninguém decidir nada — e o aluno ficava suspenso à mesma.
 *
 * Usa anoLetivoDeReferenciaFinalistas, não anoLetivoCorrente diretamente (§2026-09-06): o intervalo
 * entre um ano letivo e o seguinte — TODOS os anos, não uma exceção — é justamente quando este
 * aviso mais importa, e anoLetivoCorrente fica null nesse intervalo. Sem o recurso, o aviso
 * desaparecia sozinho exatamente na altura para que foi pensado.
 *
 * Devolve null quando não há nada a decidir: o ecrã não deve ter uma caixa vazia a dizer que está
 * tudo bem (§auditoria 2026-09-03).
 */
export async function AvisoMonografiasPendentes() {
  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { anoLetivoInicio: true, anoLetivoFim: true },
  });
  const anoLetivo = await anoLetivoDeReferenciaFinalistas(agora, config);
  if (anoLetivo === null) return null;

  const pendentes = await getMonografiasPendentesDeDecisao(anoLetivo);
  if (pendentes.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-amber-900">
            {pendentes.length === 1
              ? "1 aluno pagou a monografia e não chegou a defender"
              : `${pendentes.length} alunos pagaram a monografia e não chegaram a defender`}
          </p>
          <p className="max-w-3xl text-sm text-amber-800">
            O ano letivo em que se inscreveram já terminou. Decida, para cada um, se a matrícula e o pagamento passam
            para {formatAnoLetivo(anoLetivo)}. Até decidir, nenhum deles é suspenso automaticamente — e este aviso
            continua aqui.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {pendentes.map((p) => (
          <div
            key={p.inscricaoId}
            className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="text-sm">
              <p className="font-medium text-texto">
                {p.nome} <span className="text-xs font-normal text-texto-suave">{p.numeroEstudante}</span>
              </p>
              <p className="text-xs text-texto-suave">
                {p.cursoNome} · {formatAnoLetivo(p.anoLetivoOrigem)} ·{" "}
                {p.orientadorNome ? `Orientador: ${p.orientadorNome}` : "Sem orientador"}
              </p>
              {/* A data falhada explica o caso melhor do que qualquer rótulo: houve marcação e não se cumpriu. */}
              {p.defesaDataAnterior ? (
                <p className="text-xs text-texto-suave">Defesa marcada para {formatDate(p.defesaDataAnterior)}, não realizada.</p>
              ) : (
                <p className="text-xs text-texto-suave">A defesa nunca chegou a ser marcada.</p>
              )}
              {p.confirmadaEm ? (
                <p className="text-xs text-texto-suave">Pagamento confirmado a {formatDate(p.confirmadaEm)}.</p>
              ) : null}
            </div>
            <DecisaoTransicao inscricaoId={p.inscricaoId} nome={p.nome} />
          </div>
        ))}
      </div>
    </div>
  );
}
