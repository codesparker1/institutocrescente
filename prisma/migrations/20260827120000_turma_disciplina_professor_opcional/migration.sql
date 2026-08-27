-- Professor deixa de ser obrigatorio numa TurmaDisciplina (pedido do cliente 2026-08-27):
-- ao criar uma Turma, as disciplinas nascem automaticamente do plano curricular
-- (CadeiraCurricular) e o DAAC atribui o professor depois. Ate la a disciplina ja existe e o
-- aluno ve-a na sua lista e no horario.
--
-- Alteracao nao destrutiva: as linhas existentes mantem o professor que tem.
ALTER TABLE "TurmaDisciplina" ALTER COLUMN "professorId" DROP NOT NULL;
