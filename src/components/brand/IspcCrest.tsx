import Image from "next/image";

interface IspcCrestProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export function IspcCrest({ size = 96, className, priority }: IspcCrestProps) {
  return (
    <Image
      src="/logo.png"
      alt="Instituto Superior Politécnico Crescente"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
