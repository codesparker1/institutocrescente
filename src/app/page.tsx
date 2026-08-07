import Link from "next/link";
import { IspcCrest } from "@/components/brand/IspcCrest";
import { Button } from "@/components/ui/Button";

const HIGHLIGHTS = [
  {
    title: "Matrículas e Alunos",
    description: "Gestão centralizada do percurso académico de cada estudante.",
  },
  {
    title: "Notas e Frequência",
    description: "Lançamento de avaliações e presenças por turma, em tempo real.",
  },
  {
    title: "Portal do Professor",
    description: "Acesso dedicado às turmas, avaliações e pautas de cada docente.",
  },
  {
    title: "Auditoria e Governança",
    description: "Registo de todas as ações no sistema, com utilizador e IP identificados.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-navy-950 text-navy-50">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <IspcCrest size={44} />
          <span className="text-sm font-bold tracking-wide text-gold-300">ISPC</span>
        </div>
        <Link href="/login">
          <Button variant="secondary">Entrar</Button>
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <IspcCrest size={128} />
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gold-300 sm:text-5xl">ISPC</h1>
          <p className="mx-auto mt-3 max-w-xl text-balance text-navy-200">
            Instituto Superior Politécnico Crescente — Sistema de Gestão Académica.
          </p>
        </div>
        <Link href="/login">
          <Button variant="secondary" className="px-6 py-3 text-base">
            Aceder ao sistema
          </Button>
        </Link>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-6 pb-20 sm:grid-cols-2">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title} className="rounded-xl border border-navy-800 bg-navy-900 p-5">
            <h3 className="font-semibold text-gold-300">{item.title}</h3>
            <p className="mt-1 text-sm text-navy-300">{item.description}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-navy-800 py-6 text-center text-xs text-navy-500">
        Instituto Superior Politécnico Crescente (ISPC)
      </footer>
    </main>
  );
}
