import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, parseIntParam, formatAnoLetivo, turmaLabel } from "@/lib/utils";
import { getListaDevedores } from "@/lib/financeiro";
import { DevedoresDocument } from "@/components/pdf/DevedoresDocument";
import { getAgora } from "@/lib/tempo";
import type { CategoriaEstudante, Periodo } from "@/generated/prisma/client";

export const runtime = "nodejs";

const CATEGORIA_LABEL: Record<CategoriaEstudante, string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

const PERIODO_LABEL: Record<Periodo, string> = {
  MATUTINO: "Matutino",
  VESPERTINO: "Vespertino",
  NOTURNO: "Noturno",
};

/** Mesmo PDF que a página /financeiro/devedores mostra em tabela — respeita exatamente os filtros da URL. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA"].includes(session.user.role)) {
    return new Response("Não autorizado", { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const sort = params.get("sort") === "valor" || params.get("sort") === "nome" ? params.get("sort") : "antiguidade";
  const curso = params.get("curso") || undefined;
  const turmaId = params.get("turmaId") || undefined;
  const anoLetivo = parseIntParam(params.get("anoLetivo") ?? undefined);
  const periodo = (params.get("periodo") || undefined) as Periodo | undefined;
  const categoria = (params.get("categoria") || undefined) as CategoriaEstudante | undefined;

  const [devedores, turma] = await Promise.all([
    getListaDevedores({ sort: sort as "antiguidade" | "valor" | "nome", curso, turmaId, anoLetivo, periodo, categoria }),
    turmaId ? prisma.turma.findUnique({ where: { id: turmaId }, include: { curso: true } }) : null,
  ]);

  const filtrosAplicados: string[] = [];
  if (curso) filtrosAplicados.push(`Curso: ${curso}`);
  if (turma) filtrosAplicados.push(`Turma: ${turmaLabel(turma)}`);
  if (anoLetivo) filtrosAplicados.push(`Ano letivo: ${formatAnoLetivo(anoLetivo)}`);
  if (periodo) filtrosAplicados.push(`Período: ${PERIODO_LABEL[periodo]}`);
  if (categoria) filtrosAplicados.push(`Categoria: ${CATEGORIA_LABEL[categoria]}`);

  const totalEmDivida = devedores.reduce((soma, d) => soma + d.valorEmDivida, 0);

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const pdfBuffer = await renderToBuffer(
    <DevedoresDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={logoSrc}
      filtrosAplicados={filtrosAplicados}
      totalEmDivida={totalEmDivida}
      dataEmissao={formatDateTime(getAgora())}
      devedores={devedores.map((d) => ({
        numeroEstudante: d.numeroEstudante,
        nome: d.nome,
        curso: d.curso,
        anoCurricular: d.anoCurricular,
        categoria: CATEGORIA_LABEL[d.categoria],
        valorEmDivida: d.valorEmDivida,
        mesesEmAtraso: d.mesesEmAtraso,
      }))}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lista-devedores.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
