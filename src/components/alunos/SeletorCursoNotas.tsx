"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

interface SeletorCursoNotasProps {
  cursos: string[];
  cursoSelecionado: string;
}

/**
 * Dropdown para escolher qual curso ver em Minhas Notas (§pedido do cliente 2026-09-09) — quem
 * mudou de curso ou já terminou um e começou outro (iniciarNovoCursoAction, "segunda licenciatura")
 * tinha os dois percursos misturados na mesma lista, sem forma de separar um do outro.
 *
 * A navegação por `?curso=` (não useState) para a escolha sobreviver a um refresh e poder ser
 * partilhada/impressa — o resto da página já lê o mesmo padrão de outros filtros do sistema
 * (Admin > Turmas, Finalistas). `router.push` em vez de um `<form>` com submit: é uma escolha
 * única, sem mais campos a acompanhar, e o padrão de formulário+botão existente é para filtros
 * com várias entradas ao mesmo tempo.
 */
export function SeletorCursoNotas({ cursos, cursoSelecionado }: SeletorCursoNotasProps) {
  const router = useRouter();

  return (
    <Select
      value={cursoSelecionado}
      onChange={(e) => router.push(`/minhas-notas?curso=${encodeURIComponent(e.target.value)}`)}
      className="w-auto"
      aria-label="Curso"
    >
      {cursos.map((curso) => (
        <option key={curso} value={curso}>
          {curso}
        </option>
      ))}
    </Select>
  );
}
