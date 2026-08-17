# Cost meter: prontidão para deploy à escala

Workflow manual (`.github/workflows/cost-meter.yml`) que responde a uma pergunta concreta: **o
SGE ISPC Crescente aguenta-se com dados e utilizadores a uma escala realista?** — não "funciona
com 1 utilizador", mas 5 cursos, 100 professores, 1000 alunos, e 15+ agentes reais a mexer no
sistema ao mesmo tempo contra um build de produção.

Corre só quando disparado manualmente (`workflow_dispatch`) — é pesado (seed em escala + `next
build` + Playwright concorrente + testes de carga) e não faz sentido em cada push.

## Como disparar

Pela UI do GitHub (Actions → Cost meter → Run workflow), ou via CLI:

```bash
gh workflow run cost-meter.yml
```

Os artefactos (anomalias, screenshots, resultado da simulação, logs de carga, relatório final)
ficam disponíveis para download na página do run durante 14 dias. O veredito também aparece
direto no resumo do run (`$GITHUB_STEP_SUMMARY`), sem precisares de abrir os artefactos.

## O que a corrida faz

1. Sobe um Postgres descartável (serviço do próprio job) e aplica as migrações.
2. **`npm run seed:grande`** — reset completo + 5 cursos, 100 professores, 1000 alunos
   distribuídos por curso/ano, com matrículas, inscrições, avaliações/notas, frequência e
   cobranças em volume realista. Nunca corre contra o Neon (`scripts/lib/guardarNeon.ts` lança
   erro se detetar `neon.tech` em `DATABASE_URL`/`DIRECT_URL`).
3. `next build && next start` — build de produção real, não `next dev`.
4. **`npm run simular:grande`** — 15 agentes concorrentes (10 alunos, 3 professores, 1
   secretaria, 1 admin, por omissão) via Playwright, reaproveitando os mesmos agentes de
   `scripts/simulacao/agentes/*.ts` que já existiam para a corrida pequena sequencial
   (`run-pequeno.ts`). No fim corre `diagnosticarTodos` (`src/lib/diagnostico.ts`) para apanhar
   inconsistências de dados que só aparecem sob concorrência.
5. `scripts/stress/run.mjs` (já existente) contra as páginas mais pesadas: dashboard, lista de
   devedores, gestão de matrícula.
6. **`npm run relatorio:grande`** — junta as 3 fontes acima e escreve um veredito:
   `PRONTO | PRONTO COM RESSALVAS | NÃO PRONTO`, com a lista concreta de motivos.

## Correr localmente para depurar (antes de confiar numa corrida em CI)

Sempre contra a Postgres local `institutocrescente_stress` (nunca o Neon), com o servidor de
produção já a correr:

```bash
npm run seed:grande
npm run build
npm run start
# noutro terminal, com o servidor já a responder em :3000
npm run simular:grande -- --url http://localhost:3000
node scripts/stress/run.mjs --path /dashboard --role secretaria --connections 20 --duration 30
npm run relatorio:grande
```

`npm run simular:grande` aceita `--alunos`, `--professores`, `--secretarias`, `--admins`,
`--daac` para ajustar o número de contextos concorrentes de cada papel.

## Fora de âmbito (por agora)

Instrumentação de queries Prisma e modelo de custo Neon/Vercel (tempo acordado, GB-segundos),
comparação com a branch base e comentário automático em PR. Fica para depois de vermos os
resultados desta primeira corrida.
