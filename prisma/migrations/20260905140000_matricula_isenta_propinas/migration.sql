-- Matrícula ativa sem geração de mensalidades (§pedido do cliente 2026-09-05) — o finalista que
-- transita à espera de defesa sem voltar a pagar o ano. Só adição, com defeito false: nenhuma
-- matrícula existente muda de comportamento.
ALTER TABLE "Matricula" ADD COLUMN "isentaPropinas" BOOLEAN NOT NULL DEFAULT false;
