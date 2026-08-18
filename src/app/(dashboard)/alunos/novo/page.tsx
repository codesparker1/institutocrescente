import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeRegistarPagamento } from "@/lib/permissions";
import { turmaLabel } from "@/lib/utils";
import { NovoAlunoForm } from "./NovoAlunoForm";

export default async function NovoAlunoPage() {
  const session = await auth();
  if (!session?.user || !podeRegistarPagamento(session.user)) redirect("/alunos");

  const turmas = await prisma.turma.findMany({
    include: { curso: true },
    orderBy: [{ anoLetivo: "desc" }, { curso: { nome: "asc" } }, { anoCurricular: "asc" }],
  });

  const turmaOptions = turmas.map((turma) => ({ id: turma.id, label: turmaLabel(turma) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Alunos
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">Nova Matrícula</h1>
      </div>

      <NovoAlunoForm turmas={turmaOptions} />
    </div>
  );
}
