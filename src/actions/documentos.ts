"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { requireGerirCurriculo } from "@/lib/permissions";

const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
const TIPOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

export interface CarregarDocumentoState {
  error?: string;
}

/**
 * "Backlog" de documentos administrativos do aluno (certificado de transferência, BI, etc.) —
 * lista simples, sem categorias fixas (decisão do cliente, 2026-08-18). blobUrl nunca é exposto
 * ao browser: guardado só do lado do servidor, lido pela route handler de download
 * (src/app/api/documentos/[id]/route.tsx), nunca embutido diretamente numa página.
 */
export async function carregarDocumentoAlunoAction(_prevState: CarregarDocumentoState, formData: FormData): Promise<CarregarDocumentoState> {
  const session = await requireGerirCurriculo();

  const alunoId = String(formData.get("alunoId") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const ficheiro = formData.get("ficheiro");

  if (!nome) {
    return { error: "Indique uma descrição para o documento." };
  }
  if (!(ficheiro instanceof File) || ficheiro.size === 0) {
    return { error: "Selecione um ficheiro." };
  }
  if (ficheiro.size > TAMANHO_MAXIMO_BYTES) {
    return { error: "Ficheiro demasiado grande (máximo 10MB)." };
  }
  if (!TIPOS_PERMITIDOS.includes(ficheiro.type)) {
    return { error: "Tipo de ficheiro não permitido — só PDF, JPG ou PNG." };
  }

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true } });
  if (!aluno) {
    return { error: "Aluno não encontrado." };
  }

  const nomeSanitizado = ficheiro.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `alunos/${alunoId}/${randomUUID()}-${nomeSanitizado}`;
  const blob = await put(pathname, ficheiro, { access: "public" });

  const documento = await prisma.documentoAluno.create({
    data: {
      alunoId,
      nome,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      tamanhoBytes: ficheiro.size,
      tipoMime: ficheiro.type,
      carregadoPorId: session.user.id,
    },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Carregou o documento "${nome}" ao aluno "${alunoId}"`,
    entityType: "DocumentoAluno",
    entityId: documento.id,
  });

  revalidatePath(`/alunos/${alunoId}`);
  return {};
}

export async function apagarDocumentoAlunoAction(formData: FormData): Promise<void> {
  const session = await requireGerirCurriculo();
  const id = String(formData.get("id") ?? "");

  const documento = await prisma.documentoAluno.findUniqueOrThrow({ where: { id } });
  await del(documento.blobUrl);
  await prisma.documentoAluno.delete({ where: { id } });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Apagou o documento "${documento.nome}" do aluno "${documento.alunoId}"`,
    entityType: "DocumentoAluno",
    entityId: documento.id,
  });

  revalidatePath(`/alunos/${documento.alunoId}`);
}
