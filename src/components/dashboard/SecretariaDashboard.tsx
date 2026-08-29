import Link from "next/link";
import { Users, Wallet, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { ProfileCard } from "./ProfileCard";
import { SecretariaAlunoSearchPanel } from "@/components/financeiro/SecretariaAlunoSearchPanel";
import { formatAnoLetivo, formatCurrency } from "@/lib/utils";
import { anoLetivoCorrente } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";
import { getListaDevedores } from "@/lib/financeiro";
import { prisma } from "@/lib/prisma";

interface SecretariaDashboardProps {
  nome: string;
  email: string;
}

export async function SecretariaDashboard({ nome, email }: SecretariaDashboardProps) {
  const [devedores, cursos, config, agora] = await Promise.all([
    getListaDevedores(),
    prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.configuracaoAcademica.findUnique({
      where: { id: "config" },
      select: { semestreAtual: true, anoLetivoInicio: true, anoLetivoFim: true },
    }),
    getAgora(),
  ]);
  const valorTotalEmDivida = devedores.reduce((soma, d) => soma + d.valorEmDivida, 0);
  const semestreAtual = config?.semestreAtual ?? 1;
  // Do intervalo configurado, não do ano civil — ver nota em anoLetivoCorrente.
  const anoLetivo = anoLetivoCorrente(agora, config);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Página Inicial</h1>
        <p className="text-sm text-navy-400">Resumo da situação financeira dos alunos.</p>
      </div>

      <ProfileCard
        nome={nome}
        cargo="Secretaria"
        campos={[
          { label: "Email", value: email },
          { label: "Ano Letivo", value: anoLetivo !== null ? formatAnoLetivo(anoLetivo) : "Por definir" },
          { label: "Semestre", value: `${semestreAtual}º Semestre` },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Alunos em dívida" value={devedores.length} icon={<AlertTriangle size={20} />} />
        <StatCard label="Valor total em dívida" value={formatCurrency(valorTotalEmDivida)} icon={<Wallet size={20} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/financeiro/registo">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Gerir</p>
              <p className="text-lg font-bold text-navy-900">Registo de Propinas</p>
            </div>
          </Card>
        </Link>

        <Link href="/alunos">
          <Card className="flex h-full items-center gap-4 px-5 py-4 transition-colors hover:border-navy-300">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-gold-300">
              <Users size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Ver</p>
              <p className="text-lg font-bold text-navy-900">Alunos</p>
            </div>
          </Card>
        </Link>
      </div>

      <SecretariaAlunoSearchPanel cursos={cursos.map((c) => c.nome)} />
    </div>
  );
}
