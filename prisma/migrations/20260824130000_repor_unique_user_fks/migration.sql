-- §decisão 2026-08-24 (cliente): UMA conta por pessoa. Aluno entra por email OU numeroEstudante;
-- professor só por email. Os atalhos professor@/aluno@ eram aliases que colidiam com estas
-- constraints — removidos da BD; a unicidade mantém-se como invariante do sistema.
CREATE UNIQUE INDEX IF NOT EXISTS "User_professorId_key" ON "User"("professorId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_alunoId_key" ON "User"("alunoId");
