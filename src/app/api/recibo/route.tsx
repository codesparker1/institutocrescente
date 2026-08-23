import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, mesReferenciaLabel } from "@/lib/utils";
import { ReciboPagamentoDocument, type ReciboItem } from "@/components/pdf/ReciboPagamentoDocument";
import { getAgora } from "@/lib/tempo";

export const runtime = "nodejs";

function descricaoItem(cobranca: { tipo: string; mesReferencia: Date | null; descricao: string | null }): string {
  if (cobranca.tipo === "PROPINA") return `Mensalidade — ${mesReferenciaLabel(cobranca.mesReferencia!)}`;
  if (cobranca.tipo === "MULTA") {
    return cobranca.mesReferencia ? `Multa por atraso — ${mesReferenciaLabel(cobranca.mesReferencia)}` : "Multa por atraso";
  }
  return cobranca.descricao ?? "Emolumento";
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA"].includes(session.user.role)) {
    return new Response("Não autorizado", { status: 403 });
  }

  const idsParam = new URL(req.url).searchParams.get("ids");
  const ids = idsParam?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) return new Response("Nenhum item indicado", { status: 400 });

  const cobrancas = await prisma.cobranca.findMany({
    where: { id: { in: ids } },
    include: { aluno: true, registadoPor: true },
  });

  if (cobrancas.length !== ids.length) return new Response("Um ou mais pagamentos não foram encontrados", { status: 404 });

  const alunoId = cobrancas[0].alunoId;
  const mesmoAluno = cobrancas.every((c) => c.alunoId === alunoId);
  const todasPagas = cobrancas.every((c) => c.status === "PAGO");
  if (!mesmoAluno || !todasPagas) {
    return new Response("Os pagamentos indicados não formam um recibo válido", { status: 400 });
  }

  const aluno = cobrancas[0].aluno;
  const itens: ReciboItem[] = cobrancas.map((c) => ({ descricao: descricaoItem(c), valor: Number(c.valorPago) }));
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  const registadoPorNome = cobrancas.find((c) => c.registadoPor)?.registadoPor?.name ?? session.user.name ?? "Secretaria";

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const pdfBuffer = await renderToBuffer(
    <ReciboPagamentoDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={logoSrc}
      alunoNome={aluno.nome}
      numeroEstudante={aluno.numeroEstudante}
      curso={aluno.curso}
      anoCurricular={aluno.anoCurricular}
      itens={itens}
      total={total}
      dataEmissao={formatDateTime(await getAgora())}
      registadoPorNome={registadoPorNome}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${aluno.numeroEstudante}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
