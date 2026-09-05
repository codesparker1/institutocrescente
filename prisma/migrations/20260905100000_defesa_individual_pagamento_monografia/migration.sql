-- Defesa individual por finalista + confirmação do pagamento da monografia
-- (§pedido do cliente 2026-09-05). Só adições, sem perda de dados: as inscrições em monografia
-- que já existam ficam com defesaData/defesaSala a NULL (por marcar) e sem confirmação de
-- pagamento registada, que é a verdade — foram criadas antes de este passo existir.
ALTER TABLE "InscricaoCadeira" ADD COLUMN "defesaData" TIMESTAMP(3);
ALTER TABLE "InscricaoCadeira" ADD COLUMN "defesaSala" TEXT;
ALTER TABLE "InscricaoCadeira" ADD COLUMN "monografiaConfirmadaEm" TIMESTAMP(3);
ALTER TABLE "InscricaoCadeira" ADD COLUMN "monografiaConfirmadaPorId" TEXT;

ALTER TABLE "InscricaoCadeira"
  ADD CONSTRAINT "InscricaoCadeira_monografiaConfirmadaPorId_fkey"
  FOREIGN KEY ("monografiaConfirmadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
