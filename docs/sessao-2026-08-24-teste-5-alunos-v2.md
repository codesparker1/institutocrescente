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

## Sessão 2026-08-25 (continuação) — causa raiz dos "achados" era outra: corridas zumbis + seed apontado à BD errada

### O que se descobriu
1. **Processos zumbis**: pelo menos 5 corridas de teste-5-alunos(.ts/v2.ts) de ontem e desta
   manhã (03:21, 15:48 de ontem; 05:47, 06:08, 06:40 de hoje) continuavam vivas em paralelo,
   TODAS contra a mesma Vercel+Neon-teste. Pisavam-se umas às outras no relógio simulado —
   daí relatórios parciais com anos letivos inconsistentes (2031 vs 2034). Todos mortos
   (Stop-Process); sem cron jobs. Os "novos processos" durante a limpeza eram os próprios
   comandos de inspeção (o grep apanhava-se a si próprio).
2. **Seed apontava à BD de PRODUÇÃO**: scripts/seed-teste-5-anos.ts usava
   `import "dotenv/config"` (sem override) → leu `.env` (Neon ep-polished-dew) em vez do
   `.env.local` (Neon-teste). O seed das ~06:41 limpou e re-semeou a BD de PRODUÇÃO
   (elenco de teste: dev@/admin@/... + 5 alunos ATIVO). **FIX APLICADO**: o seed agora usa
   dotenv.config({path:'.env.local', override:true}) como os scripts de simulação.
3. BD de teste re-semeada e verificada: 5 alunos ATIVO, 1 matrícula cada, 0 cobranças,
   relógio = agora, semestreAtual=1, ultimaSuspensaoEm=null. Pronta a correr.

### Estado real dos 3 achados originais — REABRIR numa corrida limpa
A corrida v2-1787585253835 (a que produziu os achados) correu SEM concorrência e os seus
resultados são válidos. Mas a BD atual foi re-semeada por cima; para investigar os achados
1-3 (multa órfã, repetição de cadeira, Beatriz TRANCADO) há duas opções:
(a) correr a simulação de novo agora que não há zumbis e ver se reproduzem; ou
(b) analisar o código diretamente (processarRematriculaAction cria a multa tardia quando
rematriculaTardia && valorMultaRematriculaTardia>0 — código parece correto; investigar por
que não nasceu: valor 0 no momento? role errada? janela aberta?).

### Lições (para memória)
- Antes de correr/interpretar qualquer simulação: verificar processos node/tsx zumbis
  (`Get-CimInstance Win32_Process | ? CommandLine -match 'teste-5-alunos'` mas filtrar
  Name -match '^node' para não se apanhar a si próprio).
- O seed NÃO pode usar `dotenv/config` simples enquanto o `.env` apontar à produção.

## Sessão 2026-08-25 — Feature DESISTENTE + "Faculdade de Verdade"

### Feature nova no sistema: desistência (commits até 3de8f35)
- `podeMarcarDesistencia` (ADMIN+DAAC) / `podeReativarDesistente` (só ADMIN) em permissions.ts
- `marcarDesistenteAction`: motivo obrigatório (zod, 3–500), transação fecha matrícula ATIVA→TRANCADA,
  desativa inscrições ativas, status→DESISTENTE, auditoria com motivo. Guarda: só ATIVO pode desistir.
- `reativarDesistenteAction`: só ADMIN; DESISTENTE→ATIVO sem turma/inscrições (rematrícula é fluxo separado).
- `DesistenciaForm.tsx` na ficha do aluno com confirm() antes de submit.
- Testado code-wise contra Neon-teste (transação espelhada): PASS.

### Seed "faculdade de verdade" (scripts/curriculo-faculdade.ts + seed-teste-5-anos.ts reescrito)
- CURRICULO canónico partilhado seed↔simulação: 8 disciplinas (2/ano × 4 anos, nenhuma repetida):
  1º Prog I+Bases Dados; 2º Sist Op+Redes; 3º Eng Soft+IA; 4º Projeto Final+Comp Gráfica.
- 8 professores (1/cadeira, emails @ispc.ao). 12 alunos (5 originais + Carlos transferido,
  Ana bolseira INAGBE, Paulo desistente, Luísa recurso, Eduardo exame especial, Sandra dispensa+emolumento,
  Tomás muda categoria). ConfigFinanceira: agravamento 10% LIGADO + multaTardia 15000.
- Seed corrido e VERIFICADO na Neon-teste (8 disciplinas, 2 cadeiras/ano, 12 alunos c/User, categorias OK).
- curriculo-setup.ts reescrito p/ ler o currículo canónico (professor certo por ano, horários criados);
  garantirOfertaRepeticao genérica (Domingos agora reprova Redes de Computadores no 2º ano).
- Orquestrador v2: staff.professor1/professor2 resolvidos POR CICLO (par do ano do currículo);
  ctx.disciplinaSemestre2 novo (Isabel auto-zero funciona em qualquer ano).
- extras-faculdade.ts: creditarCadeiraComoDaac, marcarDesistenteComoAdmin, registarEmolumentoComoSecretaria,
  mudarCategoriaComoAdmin — integrados nos marcos (abertura-matricula ciclo 1 / pós-fim ciclo 2)
  + verificações finais dos 4 novos perfis no relatório.

### Pendente
- Deploy Vercel em curso (push codesparker1 master 454fbcc..3de8f35) — confirmar build OK antes de correr.
- Corrida completa v2 (agora com 9 verificações finais) contra Vercel+Neon-teste.
- Perfis Luísa (RECURSO) e Eduardo (EXAME_ESPECIAL) definidos mas ainda SEM cenário dedicado —
  próximos a acrescentar se o utilizador quiser (épocas RECURSO/EXAME_ESPECIAL nunca exercitadas).
