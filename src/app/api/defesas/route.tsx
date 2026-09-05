import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeGerirCurriculo } from "@/lib/permissions";
import { anoLetivoCorrente } from "@/lib/academico";
import { getFinalistas } from "@/lib/finalistas";
import { getAgora } from "@/lib/tempo";
import { formatAnoLetivo, formatDate, formatDateTime, formatHora, PERIODO_LABEL, SALA_A_CONFIRMAR } from "@/lib/utils";
import { DefesasDocument } from "@/components/pdf/DefesasDocument";
import type { Periodo } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * Pauta de defesas em PDF (§pedido do cliente 2026-09-05) — nome, curso, sala e hora de quem já
 * tem defesa marcada. Respeita os mesmos filtros da página /admin/finalistas, exceto o de estado:
 * o critério aqui é sempre "tem data marcada", que é o que faz de uma linha uma convocatória.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !podeGerirCurriculo(session.user)) {
    return new Response("Não autorizado", { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const curso = params.get("curso") || undefined;
  const periodo = (params.get("periodo") || undefined) as Periodo | undefined;
  const q = params.get("q")?.trim() || undefined;

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { anoLetivoInicio: true, anoLetivoFim: true },
  });
  const anoLetivo = anoLetivoCorrente(agora, config);
  if (anoLetivo === null) {
    return new Response("Não há nenhum ano letivo a decorrer.", { status: 409 });
  }

  const finalistas = await getFinalistas(anoLetivo, { curso, periodo, q });
  const comDefesa = finalistas
    .filter((f): f is typeof f & { defesaData: Date } => f.defesaData !== null)
    .sort((a, b) => a.defesaData.getTime() - b.defesaData.getTime());

  const filtrosAplicados = [`Ano letivo: ${formatAnoLetivo(anoLetivo)}`];
  if (curso) filtrosAplicados.push(`Curso: ${curso}`);
  if (periodo) filtrosAplicados.push(`Período: ${PERIODO_LABEL[periodo]}`);
  if (q) filtrosAplicados.push(`Pesquisa: ${q}`);

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const pdfBuffer = await renderToBuffer(
    <DefesasDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={logoSrc}
      filtrosAplicados={filtrosAplicados}
      dataEmissao={formatDateTime(agora)}
      defesas={comDefesa.map((f) => ({
        dia: formatDate(f.defesaData),
        hora: formatHora(f.defesaData),
        nome: f.nome,
        numeroEstudante: f.numeroEstudante,
        curso: f.cursoNome,
        sala: f.defesaSala ?? SALA_A_CONFIRMAR,
        orientador: f.orientadorNome ?? "Sem orientador",
      }))}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pauta-defesas.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
