-- Um repetente que avança de ano precisa de uma 2ª TurmaDisciplina para a mesma disciplina, na
-- mesma turma, ligada à CadeiraCurricular do ano que está a repetir (processarRematriculaAction
-- procura essa oferta por cadeiraCurricularId, não por disciplinaId). A unicidade por
-- (turmaId, disciplinaId) impedia isso — troca para (turmaId, cadeiraCurricularId).
DROP INDEX "TurmaDisciplina_turmaId_disciplinaId_key";

CREATE UNIQUE INDEX "TurmaDisciplina_turmaId_cadeiraCurricularId_key" ON "TurmaDisciplina"("turmaId", "cadeiraCurricularId");
