import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeGerirCurriculo } from "@/lib/permissions";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Único caminho pelo qual os bytes de um DocumentoAluno chegam ao browser — blobUrl nunca é
 * embutido diretamente numa página (documentos administrativos sensíveis: BI, certificados).
 * Confirma a sessão aqui, faz o fetch ao Blob do lado do servidor, e transmite a resposta.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !podeGerirCurriculo(session.user)) {
    return new Response("Não autorizado", { status: 403 });
  }

  const { id } = await params;
  const documento = await prisma.documentoAluno.findUnique({ where: { id } });
  if (!documento) return new Response("Documento não encontrado", { status: 404 });

  const resposta = await fetch(documento.blobUrl);
  if (!resposta.ok || !resposta.body) {
    return new Response("Falha ao obter o documento.", { status: 502 });
  }

  return new Response(resposta.body, {
    headers: {
      "Content-Type": documento.tipoMime,
      "Content-Disposition": `inline; filename="${documento.nome.replace(/["]/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
