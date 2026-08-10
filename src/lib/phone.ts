import { z } from "zod";

/** Valida um número de telemóvel angolano (9 dígitos, começando por 9) e formata-o como "+244 9XX XXX XXX". */
export const telefoneAngolaSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .regex(/^9\d{8}$/, "Telemóvel inválido. Deve ter 9 dígitos e começar por 9 (ex: 923 456 789)."),
  )
  .transform((v) => `+244 ${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6, 9)}`);
