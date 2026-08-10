# SGE — ISPC Crescente

Requisitos recolhidos junto do Dr. Octávio Dos Santos (contacto interno) antes da
apresentação ao PCA. Base: sistema SGE já existente (Next.js + TypeScript +
Prisma + PostgreSQL/Neon, deploy na Vercel).

**Objectivo da demo:** substituir a gestão actual em Word/Excel por um sistema
centralizado, com foco no controlo de propinas.

---

## 1. Contexto actual do cliente

- Notas geridas em ficheiros **Excel**; documentos em **Word**.
- Pagamento de propinas feito **presencialmente na secretaria**.
- Registo de pagamentos feito **à mão** — o próprio cliente admite que a
  metodologia não é a melhor.
- Não existe forma rápida de saber quem está em dívida, de quanto, e há
  quanto tempo.

**Implicação:** não há sistema anterior para migrar, apenas ficheiros Excel.

---

## 2. Perfis de utilizador (3 na demo)

| Perfil | Acesso |
|---|---|
| **Admin / Secretaria** | Gestão de alunos, cursos, disciplinas, registo de pagamentos, emissão de listas |
| **Docente** | Lançamento de notas das suas disciplinas, impressão da lista de presença |
| **Aluno** | Consulta de notas e situação financeira — **bloqueado se em dívida** |

Palavras-passe guardadas com hash irreversível (nem o fornecedor as consulta).

---

## 3. Módulo de propinas *(prioridade máxima)*

Foi este o ponto que o cliente identificou como principal. Deve ser o centro
da demo.

### 3.1 Registo centralizado
- Cada aluno tem: **total devido, total pago, saldo em dívida**.
- Propinas organizadas **por mês** (o pagamento é mensal).
- O pagamento continua a ser feito **presencialmente**; o sistema **não recebe
  dinheiro**, apenas regista, organiza e dá visibilidade.
- Quem está na secretaria confirma o pagamento e marca o mês como liquidado.

### 3.2 Auditoria
- Cada registo de pagamento guarda: **data, mês referente, valor e utilizador
  que registou**.
- Histórico consultável por aluno — é isto que o registo manual não permite.

### 3.3 Lista de devedores
- Vista de admin com filtro **"em dívida"**.
- Colunas: aluno, curso/ano, valor em dívida, **meses em atraso**.
- Ordenável por antiguidade da dívida.

### 3.4 Bloqueio por dívida
- Aluno com propinas em atraso **não consulta nada** — notas, pautas, nem
  qualquer outro conteúdo. Confirmado explicitamente pelo cliente.
- **Excepção:** deve continuar a ver o **valor em dívida** e quais os meses em
  falta, para saber o que regularizar sem ter de ir à secretaria perguntar.
- O bloqueio deve ser **configurável** (ligar/desligar e período de tolerância),
  por ser matéria de regulamento interno.
- Ao ser registado o pagamento, o acesso é **reposto de imediato**.

---

## 4. Lista de presença para actos de prova *(requisito explícito)*

Documento **imprimível (PDF)** gerado pelo sistema. Exemplar já aprovado pelo
cliente após três iterações.

### Cabeçalho
- Logótipo e nome da instituição.
- **Curso**
- **Disciplina**
- **Ano / Turma**
- **Época / Prova** (ex.: Época Normal — 1.ª Prova)
- **Docente da disciplina**
- **Data / Hora**

### Tabela — colunas por esta ordem
1. N.º (sequencial)
2. N.º de estudante
3. Nome completo
4. **Assinatura** (em branco, para o aluno rubricar)
5. **Nota** (em branco, para o docente preencher)

### Regra crítica
- **Alunos com propinas em dívida NÃO aparecem na lista.** Não são assinalados
  — são omitidos por completo.
- A lista reflecte a situação **no momento da impressão**; se um aluno
  regularizar nesse dia, a lista é reimpressa.

### Notas de implementação
- Sem secção de resumo, sem totais, sem notas de rodapé, sem campos de
  assinatura de docente/serviços, sem menção ao sistema no documento.
- Paginação com repetição do cabeçalho da tabela em listas longas.

---

## 5. Gestão académica (base já existente)

- Cursos, disciplinas, anos e turmas.
- Matrículas de alunos.
- Lançamento de notas pelo docente.
- Consulta de notas pelo aluno (sujeita ao bloqueio do ponto 3.4).

---

## 6. Identidade visual

- Cores institucionais e logótipo do ISPC Crescente em toda a aplicação e nos
  documentos gerados.

---

## 7. Dados de demonstração

Popular com dados realistas e credíveis:
- Nomes angolanos plausíveis.
- Cursos e disciplinas reais do Instituto.
- Valores de propina realistas.
- Mistura de alunos regularizados e em dívida, com atrasos de durações
  diferentes.

**Evitar** "Teste Teste", valores como 999.999 e placeholders visíveis.

---

## 8. Fluxo a demonstrar na apresentação

Encadeamento único que prova que os módulos estão ligados entre si:

1. Admin abre a **lista de devedores** — problema visível.
2. Aluno em dívida faz login → **acesso bloqueado**, vê apenas o que deve.
3. Admin **regista o pagamento** na secretaria.
4. Aluno actualiza → **acesso reposto**, notas visíveis.
5. Docente **imprime a lista de presença** → o aluno agora consta.

---

## 9. Por confirmar com o cliente

- Fórmula de cálculo de médias e estrutura de épocas (frequência, exame, recurso).
- Regulamento académico: regras de progressão e reprovação.
- Se querem coluna adicional de **presente/ausente** além da assinatura.
- Valor das propinas por curso e existência de período de tolerância.
- Formato dos números de estudante.
- Integração futura com Multicaixa (depende de contrato de comerciante da
  instituição com o banco) — **fora do âmbito desta fase**.
