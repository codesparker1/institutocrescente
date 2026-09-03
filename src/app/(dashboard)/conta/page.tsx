import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ContaForm } from "@/components/conta/ContaForm";

export default async function ContaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // O telefone não vai no JWT (só id/role/professorId/alunoId/deveTrocarSenha, ver auth.config.ts)
  // — leitura fresca à BD para os valores atuais do formulário.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  const emailObrigatorio = user.role !== "ALUNO";
  const telefoneObrigatorio = user.role === "PROFESSOR";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Minha Conta</h1>
        <p className="text-sm text-texto-suave">Altere o seu email, telefone ou senha.</p>
      </div>

      <Card>
        <CardHeader title="Dados da conta" />
        <CardBody>
          <ContaForm
            emailAtual={user.email}
            telefoneAtual={user.telefone}
            emailObrigatorio={emailObrigatorio}
            telefoneObrigatorio={telefoneObrigatorio}
          />
        </CardBody>
      </Card>
    </div>
  );
}
