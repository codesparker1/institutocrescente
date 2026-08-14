"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Erro no dashboard:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardHeader title="Não foi possível concluir a operação" />
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={18} />
            <p className="text-sm text-red-700">
              {error.message || "Ocorreu um erro inesperado. Tente novamente ou volte à página anterior."}
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => window.history.back()}>
              Voltar
            </Button>
            <Button type="button" onClick={reset}>
              Tentar novamente
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
