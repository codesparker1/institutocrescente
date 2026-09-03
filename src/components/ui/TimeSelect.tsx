"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface TimeSelectProps {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

const selectClassName =
  "rounded-lg border border-navy-100 bg-white px-2 py-2 text-xs text-texto focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function TimeSelect({ name, defaultValue = "08:00", required, className }: TimeSelectProps) {
  const [initialHour, initialMinute] = defaultValue.split(":");
  const [hour, setHour] = useState(HOURS.includes(initialHour) ? initialHour : "08");
  const [minute, setMinute] = useState(MINUTES.includes(initialMinute) ? initialMinute : "00");

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select
        aria-label="Hora"
        className={selectClassName}
        value={hour}
        onChange={(e) => setHour(e.target.value)}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-texto-suave">:</span>
      <select
        aria-label="Minuto"
        className={selectClassName}
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input type="hidden" name={name} value={`${hour}:${minute}`} required={required} />
    </div>
  );
}
