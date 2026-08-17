"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const DEMO_PASSWORD = "Ispc@2026";

const DEMO_ACCOUNTS = [
  { role: "Administrador", email: "admin@ispc.ao", tone: "bg-navy-700" },
  { role: "Secretaria", email: "secretaria@ispc.ao", tone: "bg-emerald-600" },
  { role: "DAAC", email: "daac@ispc.ao", tone: "bg-purple-600" },
  { role: "Professor", email: "professor@ispc.ao", tone: "bg-gold-600" },
  { role: "Aluno", email: "aluno@ispc.ao", tone: "bg-navy-500" },
] as const;

interface DemoAccountsPanelProps {
  onSelect: (email: string, password: string) => void;
}

export function DemoAccountsPanel({ onSelect }: DemoAccountsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-0 top-1/2 z-20 flex -translate-y-1/2 items-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-l-lg border border-r-0 border-navy-800 bg-navy-900 px-2 py-3 text-navy-300 hover:text-gold-300"
        aria-expanded={open}
        aria-label="Mostrar contas de demonstração"
      >
        {open ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        <span className="hidden [writing-mode:vertical-rl] text-xs font-semibold uppercase tracking-wide sm:inline">
          Contas demo
        </span>
      </button>

      <div
        className={cn(
          "overflow-hidden border border-navy-800 bg-navy-900 shadow-xl transition-[width,opacity] duration-200",
          open ? "w-72 opacity-100" : "w-0 border-l-0 opacity-0",
        )}
      >
        <div className="w-72 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy-300">
            <KeyRound size={14} />
            Contas de demonstração
          </div>
          <p className="mb-3 text-xs text-navy-400">
            Para testar, clique numa conta para preencher o formulário automaticamente. Senha igual para todas:{" "}
            <span className="font-mono text-gold-300">{DEMO_PASSWORD}</span>
          </p>
          <ul className="flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => onSelect(account.email, DEMO_PASSWORD)}
                  className="flex w-full items-center gap-3 rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-2 text-left transition-colors hover:border-gold-500/50 hover:bg-navy-800"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", account.tone)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-navy-50">{account.role}</span>
                    <span className="block truncate font-mono text-[11px] text-navy-400">{account.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
