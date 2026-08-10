import { Trash2, Printer } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TimeSelect } from "@/components/ui/TimeSelect";
import { DateSelect } from "@/components/ui/DateSelect";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Table";
import { DIA_SEMANA_LABEL, formatDate } from "@/lib/utils";
import { createHorarioSlotAction, deleteHorarioSlotAction, createProvaAction, deleteProvaAction } from "@/actions/horario";
import type { Avaliacao, Disciplina, HorarioSlot } from "@/generated/prisma/client";

const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"] as const;

export interface TurmaDisciplinaComHorario {
  id: string;
  sala: string;
  disciplina: Disciplina;
  horarioSlots: HorarioSlot[];
  avaliacoes: Avaliacao[];
  cursoAnoLabel?: string;
}

interface ScheduleGridProps {
  turmaDisciplinas: TurmaDisciplinaComHorario[];
  view: "aulas" | "provas";
  editable: boolean;
  canPrint?: boolean;
}

export function ScheduleGrid({ turmaDisciplinas, view, editable, canPrint = true }: ScheduleGridProps) {
  if (turmaDisciplinas.length === 0) {
    return <EmptyState message="Sem disciplinas para mostrar." />;
  }

  if (view === "provas") {
    const provas = turmaDisciplinas
      .flatMap((td) => td.avaliacoes.map((av) => ({ ...av, disciplina: td.disciplina, turmaDisciplinaId: td.id, cursoAnoLabel: td.cursoAnoLabel })))
      .sort((a, b) => a.data.getTime() - b.data.getTime());

    return (
      <div className="flex flex-col gap-4">
        {provas.length === 0 ? (
          <EmptyState message="Sem provas agendadas." />
        ) : (
          <Card>
            <CardBody className="flex flex-col gap-2">
              {provas.map((prova) => (
                <div key={prova.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-navy-800">
                      {prova.nome} · {prova.disciplina.nome}
                    </p>
                    <p className="text-xs text-navy-400">
                      {prova.cursoAnoLabel ? `${prova.cursoAnoLabel} · ` : ""}
                      {prova.sala ?? "Sala a confirmar"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={prova.data >= new Date() ? "info" : "neutral"}>{formatDate(prova.data)}</Badge>
                    {canPrint ? (
                      <a
                        href={`/api/lista-presenca/${prova.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1 text-navy-300 hover:bg-navy-50 hover:text-navy-600"
                        aria-label="Imprimir lista de presença"
                        title="Imprimir lista de presença"
                      >
                        <Printer size={14} />
                      </a>
                    ) : null}
                    {editable ? (
                      <form action={deleteProvaAction}>
                        <input type="hidden" name="id" value={prova.id} />
                        <button type="submit" className="rounded-md p-1 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                          <Trash2 size={14} />
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {editable ? (
          <Card>
            <CardBody>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-400">Agendar prova</p>
              <form action={createProvaAction} className="flex flex-wrap items-end gap-2">
                <Select name="turmaDisciplinaId" required defaultValue={turmaDisciplinas[0]?.id} className="w-44 text-xs">
                  {turmaDisciplinas.map((td) => (
                    <option key={td.id} value={td.id}>
                      {td.disciplina.nome}
                    </option>
                  ))}
                </Select>
                <Input name="nome" placeholder="Nome" required className="w-32 text-xs" />
                <Select name="tipo" required defaultValue="TESTE" className="w-32 text-xs">
                  <option value="TESTE">Teste</option>
                  <option value="TRABALHO">Trabalho</option>
                  <option value="EXAME_FINAL">Exame Final</option>
                </Select>
                <DateSelect name="data" minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear() + 2} />
                <Input name="sala" placeholder="Sala" required className="w-24 text-xs" />
                <Input name="peso" type="number" step="0.1" min={0} max={1} placeholder="Peso" required defaultValue={0.3} className="w-16 text-xs" />
                <Button type="submit" variant="ghost" className="text-xs">
                  Agendar
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {DIAS.map((dia) => {
          const slotsDoDia = turmaDisciplinas
            .flatMap((td) => td.horarioSlots.filter((s) => s.diaSemana === dia).map((s) => ({ ...s, disciplina: td.disciplina, cursoAnoLabel: td.cursoAnoLabel })))
            .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

          return (
            <Card key={dia} className="flex flex-col">
              <div className="border-b border-navy-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-navy-500">
                {DIA_SEMANA_LABEL[dia]}
              </div>
              <CardBody className="flex flex-1 flex-col gap-2 px-2 py-2">
                {slotsDoDia.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-navy-300">—</p>
                ) : (
                  slotsDoDia.map((slot) => (
                    <div key={slot.id} className="rounded-md bg-navy-50 px-2 py-1.5 text-xs">
                      <p className="font-medium text-navy-800">{slot.disciplina.nome}</p>
                      <p className="text-navy-500">
                        {slot.horaInicio}–{slot.horaFim}
                      </p>
                      <p className="text-navy-400">{slot.sala}</p>
                      {slot.cursoAnoLabel ? <p className="text-navy-300">{slot.cursoAnoLabel}</p> : null}
                      {editable ? (
                        <form action={deleteHorarioSlotAction} className="mt-1">
                          <input type="hidden" name="id" value={slot.id} />
                          <button type="submit" className="text-[10px] font-medium text-red-500 hover:text-red-700">
                            remover
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {editable ? (
        <Card>
          <CardBody>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-400">Adicionar aula ao horário</p>
            <form action={createHorarioSlotAction} className="flex flex-wrap items-end gap-2">
              <Select name="turmaDisciplinaId" required defaultValue={turmaDisciplinas[0]?.id} className="w-44 text-xs">
                {turmaDisciplinas.map((td) => (
                  <option key={td.id} value={td.id}>
                    {td.disciplina.nome}
                  </option>
                ))}
              </Select>
              <Select name="diaSemana" required defaultValue="SEGUNDA" className="w-32 text-xs">
                {DIAS.map((dia) => (
                  <option key={dia} value={dia}>
                    {DIA_SEMANA_LABEL[dia]}
                  </option>
                ))}
              </Select>
              <TimeSelect name="horaInicio" defaultValue="08:00" required />
              <span className="text-xs text-navy-400">até</span>
              <TimeSelect name="horaFim" defaultValue="10:00" required />
              <Input name="sala" placeholder="Sala" required className="w-24 text-xs" />
              <Button type="submit" variant="ghost" className="text-xs">
                Adicionar
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
