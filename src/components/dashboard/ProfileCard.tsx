import { User } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface ProfileField {
  label: string;
  value: string;
}

interface ProfileCardProps {
  nome: string;
  cargo: string;
  campos: ProfileField[];
}

export function ProfileCard({ nome, cargo, campos }: ProfileCardProps) {
  return (
    <Card className="flex flex-wrap items-center gap-5 px-6 py-5">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-700 text-gold-300">
        <User size={26} />
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-between gap-x-8 gap-y-2">
        <div>
          <p className="text-lg font-bold text-texto">{nome}</p>
          <p className="text-sm font-medium text-gold-600">{cargo}</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          {campos.map((campo) => (
            <div key={campo.label}>
              <p className="text-xs uppercase tracking-wide text-texto-suave">{campo.label}</p>
              <p className="text-sm font-medium text-texto">{campo.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
