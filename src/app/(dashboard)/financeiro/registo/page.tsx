import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RegistoPagamentosBusca } from "@/components/financeiro/RegistoPagamentosBusca";
import { AcessibilidadeZoom } from "@/components/layout/AcessibilidadeZoom";

export default async function RegistoPropinasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["ADMIN", "SECRETARIA"].includes(session.user.role)) redirect("/dashboard");

  const cursos = await prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { nome: true } });

  return (
    <AcessibilidadeZoom>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Registo de Propinas</h1>
          <p className="mt-1 text-base text-navy-500">
            Pesquise um aluno pelo nome para confirmar pagamentos em lote e emitir o recibo, ou reverter um pagamento já confirmado.
          </p>
        </div>

        <RegistoPagamentosBusca cursos={cursos.map((c) => c.nome)} />
      </div>
    </AcessibilidadeZoom>
  );
}
