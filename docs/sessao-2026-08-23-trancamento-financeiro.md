# SGE ISPC Crescente — Sessão de Testes & Correções (2026-08-23)

**Projeto:** `C:\dev\institutocrescente` — sistema universitário do Instituto Superior Politécnico Crescente (Angola).
**Método de teste:** Playwright headless (`playwright-core`) + relógio simulado DEV (`/admin/relogio`, SIMULATION_MODE=true) + inspeção direta da BD (Neon/Postgres).
**Contas de teste:** dev@ / admin@ / secretaria@ / aluno@ispc.ao — senha `Ispc@2026`. Login usa campos `identificador` / `password`.
**Missão:** testar cada função do sistema em dois eixos — "faz sentido code-wise" E "faz sentido human-wise" (prática universitária real). O utilizador é o contrapeso: a IA propõe regras, o utilizador confirma/nega antes de implementar.

---

## 1. Regra de negócio confirmada: Trancamento automático

| # | Regra | Estado |
|---|---|---|
| 1 | Ano letivo termina (`anoLetivoFim`, NÃO `matriculaFim`) sem rematrícula → aluno passa a `TRANCADO` automaticamente (job preguiçoso 1x/dia, `garantirSuspensaoAutomatica` em `src/lib/curriculo.ts`) | ✅ já existia, testado e a funcionar |
| 2 | Aluno trancado continua a poder logar | ✅ |
| 3 | Reentrada: fala com a ADMIN, que processa a rematrícula fora da janela (poder ADMIN); multa tardia configurável, **desligada por defeito** | ✅ implementado nesta sessão (ver §4) |
| 4 | Cobranças antigas ficam; multa aplicada 1x por mês vencido; **nenhuma propina nova** enquanto trancado (geração diária só vê matrículas `ATIVA`) | ✅ testado |
| 5 | Invisível para professores/pautas (inscrições ficam `ativa=false`) | ✅ testado |

**Trigger correto (correção do utilizador):** o aluno só trancando quando **perde a janela de rematrícula** — não no fim do ano letivo em si. O código usa `anoLetivoFim` como fronteira porque a janela de matrícula (com a extensão de maio confirmada) termina dentro/antes do fim do ano letivo.

---

## 2. Bugs encontrados nos testes

### 🐛 Bug 1 — Loop de redirect do DEV (RESOLVIDO)
- DEV é redirecionado de `/dashboard` → `/admin/reclamacoes`, mas o middleware só autorizava DEV em `/admin/relogio` → loop infinito 307 `/admin/reclamacoes ↔ /dashboard` (`ERR_TOO_MANY_REDIRECTS`).
- **Fix:** linha nova em `src/middleware.ts`: `{ prefix: "/admin/reclamacoes", roles: ["ADMIN", "DEV"] }` antes da regra genérica `/admin`.

### 🐛 Bug 2 — Corrida de ordem dos jobs na virada do ano (RESOLVIDO)
- No layout `(dashboard)/layout.tsx`, `garantirCobrancasGeradas` corria ANTES de `garantirSuspensaoAutomatica`. Num salto grande do relógio (vários meses de uma vez), o primeiro acesso faturava o mês corrente com matrículas ainda `ATIVA` e a suspensão fechava-as logo a seguir → propinas fantasma (evidência: PROPINA `mes=2027-10` para alunos já TRANCADO).
- **Fix 1:** ordem invertida no layout — suspensão primeiro, cobranças depois (com comentário explicativo).
- **Fix 2 (belt-and-braces):** a geração diária já filtra `matricula.status: "ATIVA"`; a inversão de ordem cobre o resto.

### 🐛 Bug 3 — Aluno trancado sem explicação (RESOLVIDO)
- Dashboard do aluno trancado mostra só o banner genérico de dívida ("Tem propinas em atraso… Regularize o pagamento") — **mensagem errada** para quem o problema é a matrícula, não o pagamento. Card ainda mostra "ANO LETIVO 2027 / 1º Semestre" enganador.
- **Fix implementado (regras confirmadas pelo utilizador):** banner âmbar quando `status === "TRANCADO"`: "A sua matrícula ficou suspensa por não ter renovado dentro do prazo. Dirija-se à secretaria para tratar da rematrícula." Card de perfil mostra "Matrícula: Sem matrícula ativa" em vez de Ano Letivo/Semestre; o aviso de dívida MANTÉM-SE visível por baixo (informativo). Ficheiro: `src/components/dashboard/AlunoDashboard.tsx`.

### 🐛 Bug 4 — ADMIN sem poder de rematrícula tardia (RESOLVIDO)
- `processarRematriculaAction` rejeitava fora de `[matriculaInicio, matriculaFim]` para todos; e o gate de dívida bloqueava com QUALQUER saldo (incluindo multas). A aluna que mais precisava (perdeu a janela, tem dívida) ficava sem caminho de volta — contrariava a regra confirmada.

---

## 3. Regras financeiras confirmadas pelo diretor (via utilizador) — implementadas

1. **Só a PROPINA bloqueia** o aluno (notas, acesso). MULTA é dívida real mas **nunca bloqueia sozinha**.
   - `src/lib/financeiro.ts`: `TIPOS_QUE_BLOQUEIAM = ["PROPINA"]` (portões) vs `TIPOS_QUE_CONTAM_COMO_DIVIDA = ["PROPINA","MULTA"]` (lista de devedores + histórico da ficha).
2. **SECRETARIA** confirma mensalidades; vê a multa **embutida** no mês; nunca confirma multa isolada.
3. **ADMIN (só ela)** pode confirmar a mensalidade **sem** a multa (`semMulta` — já existia) → a multa fica **órfã**: PENDENTE na BD, presa ao aluno, para a ADMIN confirmar/reverter depois (`toggleMultaAction` — já existia).
4. **Dívida pré-existente sobrevive** à rematrícula (Cobranca é presa ao aluno, não à matrícula). Rematricular não perdoa nada.
5. **Rematrícula tardia = poder ADMIN**, fora da janela; Secretaria continua limitada à janela.
6. **Multa por rematrícula tardia**: campo novo `ConfiguracaoFinanceira.valorMultaRematriculaTardia` (default 0 = desligada). Quando >0 e a ADMIN rematricula fora da janela, nasce Cobranca `MULTA` órfã (sem mesReferencia) com auditoria.
7. **Gate de dívida da rematrícula**: agora conta só saldo de PROPINAS pendentes (multas não bloqueiam).

---

## 4. Alterações feitas no código (esta sessão)

| Ficheiro | Mudança |
|---|---|
| `src/middleware.ts` | + `/admin/reclamacoes` para ADMIN+DEV (fix loop DEV) |
| `src/app/(dashboard)/layout.tsx` | Ordem dos jobs: `garantirSuspensaoAutomatica` ANTES de `garantirCobrancasGeradas` |
| `src/lib/financeiro.ts` | `TIPOS_QUE_BLOQUEIAM` → só PROPINA; novo `TIPOS_QUE_CONTAM_COMO_DIVIDA` (PROPINA+MULTA) para devedores e histórico |
| `src/actions/academico.ts` | `processarRematriculaAction`: bypass da janela para ADMIN; gate de dívida só propinas; cria multa tardia órfã quando `valorMultaRematriculaTardia > 0`; avisos na mensagem de resultado |
| `prisma/schema.prisma` + migration `20260823135331_multa_rematricula_tardia` | Campo `valorMultaRematriculaTardia Decimal @default(0)` em ConfiguracaoFinanceira; `prisma generate` corrido |
| `src/actions/financeiro.ts` | `ConfiguracaoFinanceiraSchema` + `CAMPOS_CONFIG` + parse incluem `valorMultaRematriculaTardia` |
| `.../alunos/RematriculaForm.tsx` + `alunos/[id]/page.tsx` | **Gap novo corrigido**: botão "Processar Rematrícula" agora aparece à ADMIN fora da janela (com aviso âmbar); Secretaria continua sem ação fora da janela. O bypass da action era código morto sem isto |
| `src/lib/financeiro-tipos.ts` + `.test.ts` | Constantes `TIPOS_QUE_BLOQUEIAM`/`TIPOS_QUE_CONTAM_COMO_DIVIDA` extraídas para módulo testável + 2 testes unitários novos (53 total) |
| `.../admin/financeiro/configuracao/ConfiguracaoForm.tsx` + `page.tsx` | Novo campo UI "Multa por rematrícula tardia (Kz)" com nota explicativa (0 = desligada) |
| `src/components/dashboard/AlunoDashboard.tsx` | Banner trancado + "Sem matrícula ativa" no perfil (Bug 3) |

**AINDA POR FAZER (aprovado, não implementado):**
- Nota: o servidor dev estava a correr durante as edições — convém confirmar hot-reload/rebuild.
- ~~Re-teste E2E~~ ✅ FEITO (ver §5b abaixo).
- ~~Regressão dos unit tests~~ ✅ 53/53 pass (`npx tsx --test src/lib/*.test.ts`; são node:test, NÃO vitest — vitest falha com "No test suite found").

---

## 5b. E2E rematrícula tardia (2026-08-23, tarde)

Cenário completo com relógio simulado (setup → trancamento automático pós `anoLetivoFim` 2027-07-14 → rematrícula ADMIN fora da janela):

1. **Marta Kiala:** trancou ✅; banner trancado + "Sem matrícula ativa" visíveis na vista dela ✅; gate recusou com 68 000 Kz em propinas (multas não bloqueiam — mensagem certa) ✅; após propinas PAGO (Option A na BD), rematrícula processada → ATIVO, avançou ao 2º Ano, 12 propinas novas geradas 2027-07→2028-06 ✅.
2. **Domingos Cavaco (após restart do dev server):** rematrícula tardia → **multa órfã 15 000 Kz PENDENTE criada** (mesReferencia=null) + auditoria ✅. Antes do restart a multa NÃO nascia — causa: dev server com Prisma client anterior à migration `valorMultaRematriculaTardia` (`?? 0` silencioso). **Lição: migrations de schema exigem restart do `npm run dev`, hot-reload não chega.**
3. Dependências reais da rematrícula descobertas pelo E2E: precisa turma do ano seguinte existir (criada via script como ADMIN faria em Admin > Turmas) e notas todas lançadas.

Scripts E2E desta fase: `scripts/tmp-e2e-{rematricula,jobs,relogio,config,contas,turma,multas,cenario2,ui,ui2}.mts`. Screenshots: `scripts/tmp-shots/e2e-*.png`.

**PRÓXIMA FASE sugerida:** L2 financeiro (pirâmide de walkthrough) — walkthrough regra a regra antes de implementar.

---

## 5. Evidência dos testes (Playwright + relógio)

- **Setup limpo:** script `scripts/tmp-setup-repro.mts` — repõe alunos ATIVO, matrículas ATIVA, inscrições ativas, relógio 2027-07-10, limpa `ultimaGeracaoEm`/`ultimaSuspensaoEm`, apaga propinas pós-07/2027.
- **Teste salto pequeno (+5d, 2027-07-10 → 07-15):** suspensão disparou limpo — 5/5 TRANCADO, matrículas TRANCADA, inscrições inativas, **0 propinas pós-ano**. ✅
- **Teste salto grande (vários meses):** reproduziu as propinas fantasma (Bug 2) antes do fix.
- **Vista do aluno trancado** (Marta Kiala, screenshot `scripts/tmp-shots/aluno-trancado.png`): sem explicação do estado; só banner de dívida (Bug 3).
- **Vista ADMIN na ficha** (`/alunos/<id>`): "REMATRÍCULA — Fora do período de matrícula — sem ação disponível" (Bug 4, antes do fix).
- Scripts de teste: `scripts/tmp-teste-suspensao.mts`, `scripts/tmp-aluno-view.mts`, `scripts/tmp-admin-rematricula.mts`, `scripts/tmp-check-relogio.mts` (podem ser limpos/promovidos a suite).

---

## 6. Próximos passos sugeridos

1. UI do campo `valorMultaRematriculaTardia` (Admin > Financeiro > Configuração).
2. Banner trancado no dashboard do aluno (Bug 3).
3. Re-testar end-to-end: ADMIN rematricula a Marta fora da janela → aluno volta a ATIVO, propinas do novo ano geradas a partir do mês corrente, multa tardia órfã criada (se configurada), notas bloqueadas só se houver PROPINA vencida.
4. Continuar a pirâmide de walkthrough: L1 calendário ✅ (esta sessão) → L2 financeiro → L3 avaliação → L4 progressão → L5 comunicação.
5. Regressão dos testes unitários existentes (`src/lib/*.test.ts`) — a mudança de `TIPOS_QUE_BLOQUEIAM` pode afetar testes de `divida.test.ts`/`financeiro`.

---

## 7. Decisões de contexto (memória de longa duração)

- PC lento: `npm run dev` (SIMULATION_MODE=true) durante revisões; build só quando as revisões acabarem.
- "Option A" financeiro: BD fica PENDENTE/PAGO; display deriva Devendo/Aguarda vencimento via `ehVencidoAlemDaTolerancia` (`src/lib/estado-cobranca.ts`, sem server-only).
- Janela de matrícula PODE estender-se para dentro do ano letivo (confirmado).
- Testes UI: Playwright headless + screenshots; `playwright-core` (não `@playwright/test`).
- Estilo de trabalho: walkthrough primeiro (regra a regra confirmada contra a prática real), só depois implementar; sem resets/clean runs até todos os pontos revistos.
