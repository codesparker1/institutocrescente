import { Printer } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { DIA_SEMANA_LABEL, formatDate, cn } from "@/lib/utils";
import { EPOCA_LABEL } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";
import { deleteHorarioSlotAction, deleteProvaAction } from "@/actions/horario";
import { CreateProvaForm } from "./CreateProvaForm";
import { CreateHorarioSlotForm } from "./CreateHorarioSlotForm";
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

export async function ScheduleGrid({ turmaDisciplinas, view, editable, canPrint = true }: ScheduleGridProps) {
  if (turmaDisciplinas.length === 0) {
    return <EmptyState message="Sem disciplinas para mostrar." />;
  }

  if (view === "provas") {
    const agora = await getAgora();
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
              {provas.map((prova) => {
                // Prova já dada — a lista de presença deixa de fazer sentido para imprimir (era
                // para conferir quem entra na sala nesse dia, não um registo histórico).
                const passada = prova.data < agora;
                return (
                  <div
                    key={prova.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border border-navy-50 px-4 py-2.5 text-sm",
                      passada && "opacity-50",
                    )}
                  >
                    <div>
                      <p className={cn("font-medium", passada ? "text-navy-500" : "text-navy-800")}>
                        {EPOCA_LABEL[prova.epoca]} · {prova.disciplina.nome}
                      </p>
                      <p className="text-xs text-navy-400">
                        {prova.cursoAnoLabel ? `${prova.cursoAnoLabel} · ` : ""}
                        {prova.sala ?? "Sala a confirmar"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={passada ? "neutral" : "info"}>{formatDate(prova.data)}</Badge>
                      {canPrint ? (
                        passada ? (
                          <span
                            className="cursor-not-allowed rounded-md p-1 text-navy-200"
                            aria-label="Prova já dada — lista de presença indisponível"
                            title="Prova já dada — já não é possível imprimir a lista de presença"
                          >
                            <Printer size={14} />
                          </span>
                        ) : (
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
                        )
                      ) : null}
                      {editable ? <DeleteButtonForm action={deleteProvaAction} id={prova.id} /> : null}
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}

        {editable ? (
          <Card>
            <CardBody>
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Agendar prova</p>
              <p className="mb-3 text-xs text-navy-400">
                O prazo de lançamento de notas é calculado automaticamente a partir da data da prova, conforme os dias
                configurados pelo DAAC em Configuração Académica.
              </p>
              <CreateProvaForm
                disciplinas={turmaDisciplinas.map((td) => ({ id: td.id, nome: td.disciplina.nome }))}
              />
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
                        <DeleteButtonForm action={deleteHorarioSlotAction} id={slot.id} variant="link" className="mt-1" />
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
            <CreateHorarioSlotForm
              disciplinas={turmaDisciplinas.map((td) => ({ id: td.id, nome: td.disciplina.nome }))}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
