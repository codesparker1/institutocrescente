import { IspcCrest } from "./IspcCrest";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  priority?: boolean;
}

export function Logo({ size = 40, className, showWordmark = true, priority }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <IspcCrest size={size} priority={priority} />
      {showWordmark ? (
        <div className="leading-tight">
          <div className="text-lg font-extrabold tracking-wide text-gold-400">ISPC</div>
          <div className="text-[10px] uppercase tracking-wider text-texto-suave">
            Instituto Superior Politécnico Crescente
          </div>
        </div>
      ) : null}
    </div>
  );
}
