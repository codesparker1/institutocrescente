# Ledger de Cobertura da Simulação — ações e rotas

> Inventário completo das **60 server actions** (src/actions/) e das **~30 rotas** (src/app/),
> com o estado real de cobertura pela simulação atual (teste-5-alunos + run-pequeno/run-ano),
> medido por grep sobre scripts/simulacao/ em 2026-08-24.
>
> Legenda:
> - ✅ **Exercizada** — a ação é realmente invocada (UI clicada ou chamada direta no script)
> - 🔶 **Parcial** — rota visitada sem interagir, ou estado semeado via Prisma direto (a ação nunca corre)
> - ❌ **Nunca tocada** — nem a ação nem a sua rota entram na simulação
>
> Objetivo: toda a tabela a ✅ (ou ❌ justificado como "só negativo"). O relatório de cobertura
> no fim de cada corrida compara contra este ficheiro.

---

## 1. Server actions (60)

### academico.ts (4)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `processarRematriculaAction` | ✅ | Chamada direta ×7 (janela + tardia Beatriz, Domingos repetente, etc.) |
| `atualizarConfiguracaoAcademicaAction` | ✅ | Chamada direta (config janela rematrícula / datas) |
| `alterarSemestreAction` | ❌ | PLANO: passe ADMIN no marco avaliacoes-p2 (semestre 1→2 via UI, não via Prisma como hoje) |
| `iniciarNovoCursoAction` | ❌ | PLANO: Marta conclui curso no ano 4 → inicia novo curso (destino natural dela) |

### admin.ts (22)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `createCursoAction` | 🔶 | Cursos seedados via Prisma (curriculo-setup); a ACTION nunca corre. Passe ADMIN cria um curso novo |
| `deleteCursoAction` | ❌ | Passe ADMIN: delete de curso SEM dependências + tentativa de delete COM turmas (deve falhar limpo) |
| `createDisciplinaAction` | ❌ | Passe ADMIN |
| `deleteDisciplinaAction` | ❌ | Passe ADMIN: positivo + conflito (disciplina com cadeiras) |
| `createCadeiraCurricularAction` | ❌ | Passe ADMIN |
| `atualizarRegrasCadeiraCurricularAction` | ❌ | Passe ADMIN: mudar notaMinimaDispensa e ver efeito na cascata do ano seguinte |
| `deleteCadeiraCurricularAction` | ❌ | Passe ADMIN: positivo + conflito (cadeira com inscrições) |
| `createProfessorAction` | ❌ | Passe ADMIN: criar professor novo + atribuir-lhe uma TurmaDisciplina |
| `deleteProfessorAction` | ❌ | Passe ADMIN: positivo + conflito (professor com TurmaDisciplina) |
| `createStaffUserAction` | ❌ | Passe ADMIN: criar secretária nova + login com ela |
| `deleteStaffUserAction` | ❌ | Passe ADMIN |
| `createTurmaAction` | 🔶 | Turmas seedadas via Prisma (garantirTurmaAnoCurricular); action nunca corre. Passe ADMIN cria turma do ano seguinte |
| `deleteTurmaAction` | ❌ | Passe ADMIN: positivo + conflito (turma com matrículas) |
| `createTurmaDisciplinaAction` | 🔶 | curriculo-setup semeia via Prisma direto — a ação nunca corre. Passe ADMIN cria oferta via UI |
| `atualizarProfessorTurmaDisciplinaAction` | ❌ | Passe ADMIN: trocar professor da oferta (professor2 assume Bases de Dados) |
| `deleteTurmaDisciplinaAction` | ❌ | Passe ADMIN: positivo + conflito (oferta com inscrições) |
| `atualizarPrecoPropinaAction` | ❌ | Passe ADMIN: subir preço e ver propina gerada no ano seguinte com valor novo |
| `atualizarPercentagemAgravamentoAction` | ❌ | Passe ADMIN: definir % e cruzar com atualizarCategoriaEstudanteAction (trabalhador-estudante) |
| `createEmolumentoAction` | ❌ | Passe ADMIN: criar emolumento (ex.: "Requerimento Matriz") |
| `atualizarValorEmolumentoAction` | ❌ | Passe ADMIN |
| `toggleEmolumentoAtivoAction` | ❌ | Passe ADMIN: desativar emolumento e confirmar que desaparece do catálogo da SECRETARIA |
| `deleteEmolumentoAction` | ❌ | Passe ADMIN: positivo + conflito (emolumento já pago) |

### alunos.ts (3)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `createAlunoAction` | ✅ | Chamada direta (seed dos 5) |
| `atualizarCategoriaEstudanteAction` | ❌ | PLANO: tornar Domingos trabalhador-estudante no ano 3 → agravamento na propina seguinte |
| `atualizarDadosPessoaisAlunoAction` | ❌ | PLANO: passe ALUNO ou SECRETARIA edita contactos |

### auth.ts (4)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `loginAction` | ✅ | UI, todos os logins |
| `switchDemoAccountAction` | ❌ | NOVO (neste diff). PLANO: passe demo clica no switcher + caso NEGATIVO (email fora da lista deve falhar) |
| `trocarSenhaAction` | ❌ | PLANO: aluno troca senha, logout, login com a nova |
| `logoutAction` | 🔶 | Sim fecha contexts em vez de fazer logout explícito |

### conta.ts (1)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `atualizarContaAction` | ❌ | PLANO: passe ALUNO em /conta |

### curriculo.ts (1)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `criarTentativaRepeticaoAction` | ❌ | PLANO: Domingos repete Bases de Dados VIA ESTA AÇÃO (hoje a oferta é semeada por Prisma — a tentativa de repetição propriamente dita nunca corre pelo caminho real) |

### documentos.ts (2)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `carregarDocumentoAlunoAction` | ❌ | PLANO: SECRETARIA carrega documento (BI/certificado) na página do aluno |
| `apagarDocumentoAlunoAction` | ❌ | PLANO: apagar o mesmo documento |

### financeiro.ts (10)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `confirmarPagamentosEmLoteAction` | ✅ | Chamada direta ×2 (propinas, propina+multa do João) |
| `togglePropinaAction` | ✅ | Chamada direta |
| `searchAlunosAction` | ✅ | Chamada direta |
| `getEstadoFinanceiroAlunoAction` | 🔶 | Corre indiretamente dentro das páginas; nunca chamada isoladamente |
| `toggleMultaAction` | ❌ | CRÍTICO — regra ADMIN-only nunca testada! PLANO: NEGATIVO (SECRETARIA tenta confirmar multa → recusado) + POSITIVO (ADMIN confirma multa órfã pendente) |
| `registarEmolumentosEmLoteAction` | ❌ | PLANO: SECRETARIA regista emolumento pago num lote |
| `removerPagamentoEmolumentoAction` | ❌ | PLANO: remover o pagamento acima e confirmar reversão |
| `getCatalogoEmolumentosAction` | 🔶 | Indireto (página financeiro/emolumentos visitada) |
| `getEmolumentosPagosAction` | 🔶 | Indireto |
| `atualizarConfiguracaoFinanceiraAction` | 🔶 | Rota /admin/financeiro/configuracao visitada (run-pequeno), form nunca submetido |

### frequencia.ts (2)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `createAulaAction` | ❌ | ZERO cobertura de frequência. PLANO: passe PROFESSOR cria aula no marco avaliacoes-p1 |
| `toggleFrequenciaAction` | ❌ | PLANO: marcar presenças (marcar 1 falta propositada — cruzar com garantirNotasAutomaticasPorFalta?) |

### horario.ts (4)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `createHorarioSlotAction` | 🔶 | Slots seedados via Prisma; ação nunca corre. Passe PROFESSOR/ADMIN cria slot via UI |
| `deleteHorarioSlotAction` | ❌ | Passe PROFESSOR/ADMIN |
| `createProvaAction` | 🔶 | Prova P2 da Isabel semeada via Prisma direto (comentário diz "estruturalmente idêntica à UI") — a ação real nunca corre. PLANO: criar prova VIA UI |
| `deleteProvaAction` | ❌ | PLANO: apagar prova sem notas + conflito (prova com notas) |

### notas.ts (3)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `lancarNotasEmLoteAction` | ✅ | UI (pauta/TurmaGradebook), todos os cenários de notas |
| `guardarNotaHistoricaAction` | ❌ | PLANO: nota histórica de cadeira feita noutro estabelecimento |
| `creditarCadeiraAction` | ❌ | PLANO: creditar cadeira equivalente a um aluno (Isabel?) |

### reclamacoes.ts (2)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `criarReclamacaoAction` | ❌ | PLANO: ALUNO abre reclamação sobre uma nota; SECRETARIA/ADMIN responde e fecha |
| `atualizarReclamacaoAction` | ❌ | Idem |

### relogio.ts (2)
| Ação | Estado | Coberto por / plano |
|---|---|---|
| `avancarRelogioAction` | 🔶 | Sim avança o relógio via script/Prisma + dispara jobs visitando /dashboard; a ACTION nunca corre |
| `reporRelogioAction` | ❌ | Só entre corridas (reset). PLANO: correr uma vez no fim para validar |

**Resumo: 6 ✅ · 12 🔶 · 42 ❌ — ~10% exercizadas de verdade.**

---

## 2. Rotas (visitadas vs. nunca abertas)

Visitadas pela simulação (18): `/login`, `/dashboard`, `/alunos`, `/alunos/[id]`, `/notas`,
`/notas` (gradebook via pauta), `/minhas-notas`, `/horario`, `/financeiro`,
`/financeiro/registo`, `/financeiro/devedores`, `/financeiro/emolumentos`,
`/admin/cursos`, `/admin/professores`, `/admin/curriculo`,
`/admin/academico/configuracao`, `/admin/financeiro/configuracao`, `/auditoria`.

**Nunca abertas (12):**
- `/admin/turmas` e `/admin/turmas/[id]`
- `/admin/disciplinas`
- `/admin/emolumentos`
- `/admin/equipa`
- `/admin/reclamacoes`
- `/admin/relogio`
- `/alunos/novo`
- `/conta`
- `/reclamacoes`
- `/trocar-senha`

---

## 3. Casos negativos / de regra (o sistema deve RECUSAR)

| # | Caso | Regra | Estado |
|---|---|---|---|
| N1 | SECRETARIA tenta confirmar multa | ADMIN-only (`toggleMultaAction`) | ❌ |
| N2 | Rematrícula com propina DEVENDO | bloqueia | ✅ (Domingos ano 1) |
| N3 | Rematrícula fora da janela | Secretaria não pode; ADMIN pode (tardia) | ✅ (Beatriz tardia) |
| N4 | Delete de entidade com dependências | falha limpa, sem órfãos | ❌ |
| N5 | switchDemoAccount com email arbitrário | lista fechada | ❌ |
| N6 | Multa pendente NÃO bloqueia rematrícula | só PROPINA trava | ✅ (implícito nos cenários) |
| N7 | Aluno trancado não gera novas propinas / invisível ao professor | trancamento | 🔶 (Beatriz, parcial) |
| N8 | Nota fora de prazo → input disabled | prazo por Avaliacao | 🔶 (descoberto pelo bug da Isabel) |

---

## 4. Notas estruturais descobertas no inventário

1. **Agentes caóticos existem mas não correm no teste principal** — `agentes/caotico/*` só são
   usados por `run-ano.ts`/`run-grande.ts`. O teste-5-alunos não os integra.
2. **Muito seeding via Prisma direto** onde devia haver UI/action: cursos, turmas,
   TurmaDisciplinas, horário slots, prova da Isabel. Isso esconde bugs de validação/zod/UX
   que a action real apanha.
3. **Frequência = zero** em todo o pipeline de simulação.
4. **`verificarSemErroVisivel`** (agentes admin/secretaria) só verifica que não há erro VISÍVEL
   na página — não valida dados escritos. Um passe de atores precisa de asserts de BD.
