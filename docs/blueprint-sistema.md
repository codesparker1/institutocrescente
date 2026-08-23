# Blueprint Geral — SGE ISPC Crescente

**Sistema de Gestão Escolar do Instituto Superior Politécnico Crescente (Angola)**
Visão de referência: o que o sistema É hoje, o que LHE FALTA face a uma faculdade real, e a ordem de construção (pirâmide L1→L5).
Método de evolução: walkthrough regra a regra → utilizador confirma contra a prática universitária real → só depois implementar e testar (code-wise E human-wise).

---

## 0. Atores e poderes (base de tudo)

| Role | Poder atual | Notas human-wise |
|---|---|---|
| **ADMIN** (direção) | Tudo: config, cursos, currículo, turmas, professores, preços, emolumentos, matrícula tardia (fora da janela), multas (confirmar/reverter), semMulta | Única com poderes extraordinários — é ela quem "salva" casos fora da norma |
| **SECRETARIA** | Matrículas/Rematrículas DENTRO da janela; confirma mensalidades (nunca multas isoladas); novas matrículas na janela | O balcão do dia-a-dia — limitado à janela por design |
| **PROFESSOR** | Pautas/notas das suas turmas-disciplinas; horário | Vê só os seus alunos; aluno trancado invisível |
| **ALUNO** | Dashboard, notas, horário, histórico financeiro próprio | Trancado continua a logar mas sem semestre ativo |
| **DAAC** | (existe no enum; papel a definir) | Ponto a decidir na fase de matrículas |
| **DEV** | Só /admin/reclamacoes + /admin/relogio (simulação) | Suporte técnico isolado do negócio |

Regra transversal confirmada: **só PROPINA bloqueia**; MULTA é dívida real que nunca bloqueia sozinha.

---

## 1. Mapa dos módulos existentes (estado atual)

### ✅ Sólidos (já testados)
- **Currículo**: Cursos → CadeirasCurriculares (ano/semestre) → Turmas (coortes) → TurmaDisciplina (professor+horário) → Inscrições
- **Trancamento automático**: pós `anoLetivoFim` sem rematrícula → TRANCADO; banner explicativo; reentrada ADMIN
- **Financeiro core**: propinas mensais (Option A: BD PENDENTE/PAGO, display deriva), multas por atraso, multa órfã, rematrícula tardia c/ multa configurável, gate de bloqueio só-propina
- **Avaliação**: épocas (Normal/Recurso/Especial), notas, cálculo de nota final, dispensas
- **Horário**: slots, conflitos professor/turma/sala (testado)
- **Relógio simulado** DEV (`SIMULATION_MODE`) — infraestrutura de teste

### 🟡 Parciais (existem mas não foram revistos a fundo)
- Emolumentos (tipos pontuais: INSCRICAO, CONFIRMACAO, MATRICULA…)
- Documentos de alunos (upload existe, fluxo de aprovação?)
- Reclamações (aluno→DEV/ADMIN)
- Auditoria (AuditLog com valorAnterior/Novo)
- Preços por curso (PrecoPropina)

### ❌ Ausentes (típicos de uma faculdade real — ver §3)

---

## 2. Pirâmide de walkthrough (plano de revisão)

```
L1 Calendário/Académico  ██████████ ✅ (esta sessão: trancamento, janelas, relógio)
L2 Financeiro            ░░░░░░░░░░ PRÓXIMA — propinas/multas/pagamentos regra a regra
L3 Avaliação             ░░░░░░░░░░ épocas, lançamento, pautas, recuperações
L4 Progressão            ░░░░░░░░░░ aprovação/reprovação, repetição, rematrícula decisões
L5 Comunicação           ░░░░░░░░░░ notificações, reclamações, documentos
```

Cada L = sessão de walkthrough: listar comportamento atual → propor regras → utilizador confirma/nega → implementar gaps → testar nos dois eixos.

---

## 3. Blueprint de expansão — módulos que uma faculdade real tem e este ainda não tem

Ordenados por impacto no dia-a-dia real do ISPC:

### Fase A — Completar o núcleo (dependências do que já existe)
1. **Época de inscrições por cadeira** — hoje inscreve-se via rematrícula em bloco; falta inscrição/disciplina avulsa (arrasto, melhoria)
2. **Pautas oficiais** — PDF/impressão por turma-disciplina com assinaturas (secretaria exige papel)
3. **Recibos de pagamento** — número sequencial, impressão; hoje confirma-se na BD mas o aluno não leva prova física
4. **Certidões/atlas escolar** — matrícula, frequência, aproveitamento; geradas da BD

### Fase B — Ciclo de vida completo do estudante
5. **Transferência / mudança de curso** — existe UI "Segunda Licenciatura/Mudança de Curso" parcial; falta fluxo completo com equivalências
6. **Suspensão pedida pelo aluno** (trancamento voluntário vs automático) — hoje só existe o automático
7. **Conclusão de curso** — estado FINALISTA/CONCLUÍDO, caderneta definitiva, diploma (fluxo longo, baixa prioridade imediata)
8. **DAAC definido** — ou elimina-se do enum, ou define-se (gestão de vagas/admissões?)

### Fase C — Comunicação & operação
9. **Notificações internas** — banner/dashboard já serve; SMS/email é caro em Angola — decidir se vale
10. **Aprovação de documentos** — aluno sobe documento → secretaria valida/rejeita com motivo
11. **Quadro de horários global** — vista sala-a-sala para a secretaria gerir ocupação
12. **Relatórios de direção** — inadimplência por curso/ano, taxa de aprovação, evasão (dados já estão na BD)

### Fase D — Robustez (transversal, quando as revisões acabarem)
13. **Backup/restauro** documentado (Neon tem PITR — documentar procedimento)
14. **Build de produção + deploy** (PC lento: só depois de todas as revisões)
15. **Suite de testes promovida** — scripts tmp-e2e-* viram suite nomeada

---

## 4. Regras de ouro do projeto (memória de decisão)

1. Walkthrough primeiro; nada se implementa sem confirmação humana.
2. Todo o teste nos dois eixos: code-wise (lógica certa) + human-wise (faz sentido no balcão).
3. Option A: BD guarda PENDENTE/PAGO; display deriva (Devendo/Aguarda vencimento).
4. Só PROPINA bloqueia; dívida sobrevive à rematrícula (presa ao aluno).
5. Multas: SECRETARIA nunca confirma; ADMIN confirma/reverte; semMulta gera órfã.
6. Janela de matrícula pode estender-se para dentro do ano letivo; tarde = poder ADMIN (+multa opcional).
7. Relógio simulado para todos os testes temporais; jobs preguiçosos em ordem dependente (suspensão ANTES de cobranças).
8. PC lento: `npm run dev` durante revisões; build só no fim. Migrations exigem restart do dev server.
9. Testes: playwright-core headless, scripts `scripts/tmp-*.mts`, contas *@ispc.ao senha Ispc@2026.
10. Sem resets/clean runs até todos os pontos de uma fase estarem revistos.

---

## 5. Próximo passo imediato

**L2 Financeiro** — levantamento regra a regra do que existe:
vencimento/tolerância → multa mensal → confirmação secretaria → semMulta → multa órfã → toggleMulta → bloqueios → lista de devedores → PDF → emolumentos → preços por curso.
Utilizador confirma cada regra contra a prática real antes de qualquer mudança.
