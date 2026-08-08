import { Trash2 } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DIA_SEMANA_LABEL, PERIODO_LABEL, formatDate } from "@/lib/utils";
import { createHorarioSlotAction, deleteHorarioSlotAction, createProvaAction, deleteProvaAction } from "@/actions/horario";
import type { Avaliacao, Disciplina, HorarioSlot, Periodo, Professor, Turma } from "@/generated/prisma/client";

const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"] as const;

type TurmaComHorario = Turma & {
  disciplina: Disciplina;
  professor: Professor;
  horarioSlots: HorarioSlot[];
  avaliacoes: Avaliacao[];
};

interface TurmaHorarioCardProps {
  turma: TurmaComHorario;
  editable: boolean;
}

export function TurmaHorarioCard({ turma, editable }: TurmaHorarioCardProps) {
  const provasFuturas = [...turma.avaliacoes].sort((a, b) => a.data.getTime() - b.data.getTime());
  const slotsOrdenados = [...turma.horarioSlots].sort((a, b) => DIAS.indexOf(a.diaSemana as (typeof DIAS)[number]) - DIAS.indexOf(b.diaSemana as (typeof DIAS)[number]));

  return (
    <Card>
      <CardHeader
        title={turma.nome}
        subtitle={`${turma.professor.nome} · ${turma.anoCurricular}º Ano · ${PERIODO_LABEL[turma.periodo as Periodo]}`}
      />
      <CardBody className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Aulas semanais</p>
          {slotsOrdenados.length === 0 ? (
            <p className="text-sm text-navy-400">Sem horário definido.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {slotsOrdenados.map((slot) => (
                <li key={slot.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-1.5 text-sm">
                  <span className="text-navy-700">
                    <span className="font-medium">{DIA_SEMANA_LABEL[slot.diaSemana]}</span> · {slot.horaInicio}–{slot.horaFim} · {slot.sala}
                  </span>
                  {editable ? (
                    <form action={deleteHorarioSlotAction}>
                      <input type="hidden" name="id" value={slot.id} />
                      <button type="submit" className="rounded-md p-1 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {editable ? (
            <form action={createHorarioSlotAction} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
              <input type="hidden" name="turmaId" value={turma.id} />
              <Select name="diaSemana" required defaultValue="SEGUNDA" className="text-xs">
                {DIAS.map((dia) => (
                  <option key={dia} value={dia}>
                    {DIA_SEMANA_LABEL[dia]}
                  </option>
                ))}
              </Select>
              <Input name="horaInicio" type="time" required defaultValue="08:00" className="text-xs" />
              <Input name="horaFim" type="time" required defaultValue="10:00" className="text-xs" />
              <Input name="sala" placeholder="Sala" required defaultValue={turma.sala} className="text-xs" />
              <Button type="submit" variant="ghost" className="text-xs">
                Adicionar
              </Button>
            </form>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Provas e avaliações</p>
          {provasFuturas.length === 0 ? (
            <p className="text-sm text-navy-400">Sem provas agendadas.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {provasFuturas.map((prova) => (
                <li key={prova.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-3 py-1.5 text-sm">
                  <span className="text-navy-700">
                    <span className="font-medium">{prova.nome}</span> · {prova.sala ?? "Sala a confirmar"}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={prova.data >= new Date() ? "info" : "neutral"}>{formatDate(prova.data)}</Badge>
                    {editable ? (
                      <form action={deleteProvaAction}>
                        <input type="hidden" name="id" value={prova.id} />
                        <button type="submit" className="rounded-md p-1 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                          <Trash2 size={14} />
                        </button>
                      </form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {editable ? (
            <form action={createProvaAction} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6 sm:items-end">
              <input type="hidden" name="turmaId" value={turma.id} />
              <Input name="nome" placeholder="Nome" required className="text-xs" />
              <Select name="tipo" required defaultValue="TESTE" className="text-xs">
                <option value="TESTE">Teste</option>
                <option value="TRABALHO">Trabalho</option>
                <option value="EXAME_FINAL">Exame Final</option>
              </Select>
              <Input name="data" type="date" required className="text-xs" />
              <Input name="sala" placeholder="Sala" required defaultValue={turma.sala} className="text-xs" />
              <Input name="peso" type="number" step="0.1" min={0} max={1} placeholder="Peso" required defaultValue={0.3} className="text-xs" />
              <Button type="submit" variant="ghost" className="text-xs">
                Agendar
              </Button>
            </form>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
