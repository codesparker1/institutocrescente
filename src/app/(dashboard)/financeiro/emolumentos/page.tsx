import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { CatalogoEmolumentos } from "@/components/financeiro/CatalogoEmolumentos";
import { EmolumentosPagos } from "@/components/financeiro/EmolumentosPagos";
import { getCatalogoEmolumentos, getEmolumentosPagos } from "@/lib/financeiro";

export default async function CatalogoEmolumentosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const [catalogoEmolumentos, emolumentosPagos] = await Promise.all([
    getCatalogoEmolumentos(),
    getEmolumentosPagos(session.user.alunoId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Catálogo de Emolumentos</h1>
        <p className="text-sm text-texto-suave">Declarações, certidões e outros serviços. Peça e pague na secretaria.</p>
      </div>

      <Card>
        <CardHeader title="Serviços disponíveis" />
        <CardBody>
          <CatalogoEmolumentos emolumentos={catalogoEmolumentos} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Emolumentos Pagos" />
        <CardBody>
          <EmolumentosPagos emolumentos={emolumentosPagos} />
        </CardBody>
      </Card>
    </div>
  );
}
