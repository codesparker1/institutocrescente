# Sessão 2026-08-24 — Teste 5-alunos v2 contra Vercel code-spark1

## O que foi feito

1. **Migração do deploy de teste de conta**: o deploy estava em `just-al-azy-coder-s-projects`
   (tomaszinho19-7604). Recriado em **code-spark1** (Code Spark, login `noideawhatmyname-3020`) para
   não queimar a conta principal com testes intensivos.
   - Novo projeto: `code-spark1/institutocrescente`
   - URL: **https://institutocrescente-code-spark1.vercel.app**
   - Env vars replicadas: DATABASE_URL/DIRECT_URL (Neon teste ep-old-wind-axst3xo7), SIMULATION_MODE=true, AUTH_SECRET, BLOB_STORE_ID, BLOB_READ_WRITE_TOKEN
   - **Deployment Protection (SSO) estava ATIVO por default em projeto novo** — todos os requests
     redirecionavam para vercel.com/sso-api e o Playwright nunca via o app. Desativado via API
     (`PATCH /v9/projects` com `ssoProtection: null`). O CLI não tem comando direto para isto.
2. **Bug do seed corrigido** (`scripts/seed-teste-5-anos.ts`): o upsert de ConfiguracaoAcademica
   tinha `update: {}` — contra uma BD já seedada (linha "config" existente com datas null) nunca
   escrevia as datas e teste-5-alunos falhava em lerConfigAcademica. Agora o update preenche tudo.
3. **Bug do harness corrigido** (`scripts/simulacao/cenarios-5-alunos/acoes-comuns.ts` →
   confirmarPropinaMaisAntiga): esperava só 500ms após clicar no aluno; contra a Vercel o painel
   de mensalidades ainda não tinha renderizado → `checkboxes.count()===0` → caía no ramo "já está
   tudo pago, return true" — **falso positivo que deixou TODOS os alunos com 16 cobranças
   PENDENTE** e rematrículas bloqueadas por 119 000 Kz (o "saldo residual múltiplo de 12 meses"
   das corridas anteriores!). Agora espera ativa pelo painel (20s) e pelo botão de confirmar
   (que só renderiza depois de marcar uma checkbox).
4. **Novo script v2** (`scripts/simulacao/teste-5-alunos-v2.ts` + `cenarios-5-alunos/extras-v2.ts`):
   - Screenshots JPEG (q70) em cada marco + dashboard admin após cada salto de relógio (60 no total);
   - **Frequências**: professor cria aula de hoje (CreateAulaForm) e marca presença
     (AttendanceChip) — ciclo 1 criou 1 aula + 1 frequência ✅; nos ciclos 2-4 o dia do marco
     não era dia de aula (comportamento correto do sistema, reportado honestamente);
   - **toggleMulta (ADMIN)** via MultaChip na ficha — alvo: multa ÓRFÃ do Domingos (a secção
     "Multas por atraso" só lista órfãs; multas mensais não têm chip). No fim do ciclo 1 a multa
     órfã NÃO existia (ver achado 1 abaixo);
   - **Reclamações L5**: aluno submete via /reclamacoes, DEV resolve via /admin/reclamacoes com
     resposta — 4/4 ciclos ✅ confirmado na BD. **/admin/reclamacoes é DEV-only** (ADMIN leva
     redirect para /dashboard — `session.user.role !== "DEV"`).
5. Corrida completa 4 ciclos contra a Vercel: **5/6 PASS, 0 violações ERROR**.

## Verificação final (relatorio.md no output/v2-1787585253835)

| Aluno | Resultado | Notas |
|---|---|---|
| Marta | PASS | 3 matrículas CONCLUIDA, fim de curso detetado |
| João | PASS | multas sempre pagas tarde (11 PAGO), fim de curso |
| Beatriz | PASS* | trancamento→tardia→conclusão OK; *Aluno.status final TRANCADO (esperado ATIVO — ver achado 3) |
| Domingos | **FAIL** | ver achados 1-2 |
| Isabel | PASS | nota automática (auto-zero P2) gerada, exame recupera |

## Achados (PENDENTES de decisão do utilizador)

1. **Multa órfã não nasceu** — a rematrícula tardia do Domingos (ciclo 1, pós-rollover, após pagar
   a dívida) devia criar a multa órfã (valorMultaRematriculaTardia=15000). Na BD não há NENHUMA
   cobrança MULTA com mesReferencia null para ele. OU o valorMultaRematriculaTardia não estava >0
   no momento da rematrícula tardia, OU a rematrícula tardia ADMIN não aplica a multa. VERIFICAR
   processarRematriculaAction: a multa tardia é aplicada só no caminho dentro-da-janela?
   (Nota: o script garante o valor 15000 no arranque — mas a corrida anterior pode ter deixado
   ConfiguracaoFinanceira com valor 0? Não: o v2 verifica e define. Investigar a action.)
2. **Repetição de cadeira não aconteceu** — Domingos reprovou Bases de Dados no 2º ano (notas
   baixas lançadas), mas: inscrições dele mostram todas tentativa=1, e a inscrição de 2027
   (ccAno=2) ficou SEM notas. Suspeita: a nota de reprovação nunca foi FECHADA (cascata
   calcularNotaFinal não correu / inscrição não ficou reprovada), por isso decidirRematricula
   não viu reprovações e a repetição (tentativa=2) nunca foi criada. VERIFICAR se o fluxo
   professor→nota→fecho de época→cálculo de nota final está a fechar a cadeira REPROVADO.
3. **Beatriz ficou Aluno.status=TRANCADO no fim** — esperado ATIVO (ela rematriculou nos ciclos
   2,3,4 com sucesso). O trancamento automático do ciclo 1 não foi revertido pela rematrícula
   tardia? (No v1 o mesmo assert passava — verificar se mudou algo ou se o v1 também tinha este
   estado e o assert era diferente.) MATÉRIA A CONFIRMAR COM O UTILIZADOR.
4. **WARNINGs inscricao-ativa-tem-horario** (não bloqueiam): as Turmas criadas por
   garantirTurmaAnoCurricular (setup do teste) não têm HorarioSlots — limitação do setup do
   teste, não bug do sistema (as turmas do seed do 1º ano têm horário).

## Estado da infra

- `.env.local` desta máquina aponta para Neon-teste (backup do original em /tmp/env.local.bak —
  repor DATABASE_URL/DIRECT_URL para localhost quando voltar a correr dev local).
- Vercel CLI desta máquina está logado em code-spark1 (Code Spark).
- Outputs: scripts/simulacao/output/v2-1787585253835 (relatorio.md/json + 60 jpgs + anomalias.md).

## Próximos passos propostos

1. Decidir/confirmar os achados 1-3 com o utilizador (walkthrough first).
2. Corrigir o que for bug do sistema vs. do teste.
3. Passe visual por papel (5 papéis paralelos, screenshots) sobre o estado final da BD.
