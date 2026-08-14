import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { GradeCell } from "./GradeCell";
import { AttendanceChip } from "./AttendanceChip";
import { CreateAulaForm } from "./CreateAulaForm";
import { DIA_SEMANA_LABEL, diaSemanaHoje, formatDate, PERIODO_LABEL, proximasDatasValidas, toIsoDate } from "@/lib/utils";

interface TurmaGradebookProps {
  turmaDisciplinaId: string;
  backHref: string;
  editable: boolean;
}

export async function TurmaGradebook({ turmaDisciplinaId, backHref, editable }: TurmaGradebookProps) {
  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: turmaDisciplinaId },
    include: {
      disciplina: true,
      professor: true,
      turma: { include: { curso: true } },
      avaliacoes: { orderBy: { data: "asc" } },
      horarioSlots: true,
      inscricoes: { where: { ativa: true }, include: { aluno: true }, orderBy: { aluno: { nome: "asc" } } },
      aulas: {
        orderBy: { data: "desc" },
        include: {
          frequencias: {
            include: { inscricaoCadeira: { include: { aluno: true } } },
            orderBy: { inscricaoCadeira: { aluno: { nome: "asc" } } },
          },
        },
      },
    },
  });

  if (!turmaDisciplina) notFound();

  const notas = await prisma.nota.findMany({
    where: { avaliacao: { turmaDisciplinaId } },
  });
  const notaPorCelula = new Map<string, number>();
  for (const nota of notas) {
    notaPorCelula.set(`${nota.inscricaoCadeiraId}:${nota.avaliacaoId}`, Number(nota.valor));
  }

  const inscricoes = turmaDisciplina.inscricoes;
  const diasLetivos = [...new Set(turmaDisciplina.horarioSlots.map((s) => s.diaSemana))];
  const datasValidas = proximasDatasValidas(diasLetivos);
  const hoje = diaSemanaHoje();
  const hojeEhDiaDeAula = (diasLetivos as string[]).includes(hoje);
  const hojeIsoValor = toIsoDate(new Date());
  const proximoDiaLabel = datasValidas.find((d) => d.iso !== hojeIsoValor)?.label ?? datasValidas[0]?.label ?? null;
  const aulaDeHojeJaExiste = turmaDisciplina.aulas.some((a) => toIsoDate(a.data) === hojeIsoValor);

  function calcularNotaGeral(inscricaoCadeiraId: string): number | null {
    let soma = 0;
    let temNota = false;
    for (const avaliacao of turmaDisciplina!.avaliacoes) {
      const valor = notaPorCelula.get(`${inscricaoCadeiraId}:${avaliacao.id}`);
      if (valor !== undefined) {
        soma += valor * Number(avaliacao.peso);
        temNota = true;
      }
    }
    return temNota ? soma : null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">{turmaDisciplina.disciplina.nome}</h1>
        <p className="text-sm text-navy-400">
          {turmaDisciplina.turma.curso.nome} · {turmaDisciplina.turma.anoCurricular}º Ano ·{" "}
          {PERIODO_LABEL[turmaDisciplina.turma.periodo]} · {turmaDisciplina.semestre}º Semestre ·{" "}
          {turmaDisciplina.professor.nome}
        </p>
      </div>

      <Card>
        <CardHeader title="Pauta de notas" subtitle={editable ? "Clique num campo e prima Tab/Enter para gravar" : "Modo de visualização"} />
        {inscricoes.length === 0 || turmaDisciplina.avaliacoes.length === 0 ? (
          <EmptyState message="Sem alunos ou avaliações registadas para esta disciplina." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Aluno</Th>
                {turmaDisciplina.avaliacoes.map((avaliacao) => (
                  <Th key={avaliacao.id}>{avaliacao.nome}</Th>
                ))}
                <Th>Nota Geral</Th>
              </tr>
            </Thead>
            <Tbody>
              {inscricoes.map((inscricao) => {
                const notaGeral = calcularNotaGeral(inscricao.id);
                return (
                  <Tr key={inscricao.id}>
                    <Td className="font-medium text-navy-900">
                      {inscricao.aluno.nome}
                      {inscricao.tentativa > 1 ? (
                        <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                          {inscricao.tentativa}ª tentativa
                        </span>
                      ) : null}
                    </Td>
                    {turmaDisciplina.avaliacoes.map((avaliacao) => (
                      <Td key={avaliacao.id}>
                        <GradeCell
                          avaliacaoId={avaliacao.id}
                          inscricaoCadeiraId={inscricao.id}
                          valorInicial={notaPorCelula.get(`${inscricao.id}:${avaliacao.id}`) ?? null}
                          disabled={!editable}
                        />
                      </Td>
                    ))}
                    <Td className="font-semibold text-navy-900">{notaGeral !== null ? notaGeral.toFixed(1) : "—"}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Frequência" subtitle="Clique no nome do aluno para marcar/desmarcar presença" />
        <CardBody className="flex flex-col gap-4">
          {turmaDisciplina.aulas.length === 0 ? (
            <EmptyState message="Sem aulas registadas." />
          ) : (
            turmaDisciplina.aulas.map((aula) => {
              const total = aula.frequencias.length;
              const presentes = aula.frequencias.filter((f) => f.presente).length;
              return (
                <div key={aula.id} className="rounded-lg border border-navy-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-navy-700">
                      {formatDate(aula.data)} {aula.tema ? `· ${aula.tema}` : ""}
                    </span>
                    <span className="text-xs text-navy-400">
                      {presentes}/{total} presentes
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aula.frequencias.map((freq) => (
                      <AttendanceChip
                        key={freq.id}
                        frequenciaId={freq.id}
                        nome={freq.inscricaoCadeira.aluno.nome}
                        presenteInicial={freq.presente}
                        disabled={!editable}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {editable ? (
            datasValidas.length === 0 ? (
              <p className="border-t border-navy-50 pt-4 text-xs text-navy-400">
                Defina o horário semanal desta disciplina em Horário e Provas antes de adicionar aulas.
              </p>
            ) : !hojeEhDiaDeAula ? (
              <p className="border-t border-navy-50 pt-4 text-xs font-medium text-gold-700">
                Hoje ({DIA_SEMANA_LABEL[hoje]}) não é dia de aula desta disciplina.
                {proximoDiaLabel ? ` Aguarde o próximo dia de aula: ${proximoDiaLabel}.` : ""}
              </p>
            ) : aulaDeHojeJaExiste ? (
              <p className="border-t border-navy-50 pt-4 text-xs text-navy-400">A aula de hoje já foi registada abaixo.</p>
            ) : (
              <div className="flex flex-col gap-3 border-t border-navy-50 pt-4">
                <p className="text-xs font-medium text-emerald-700">Hoje ({DIA_SEMANA_LABEL[hoje]}) é dia de aula desta disciplina.</p>
                <CreateAulaForm
                  turmaDisciplinaId={turmaDisciplina.id}
                  dataIso={hojeIsoValor}
                  dataLabel={formatDate(new Date())}
                />
              </div>
            )
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
