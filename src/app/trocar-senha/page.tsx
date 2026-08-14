import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TrocarSenhaForm } from "@/components/auth/TrocarSenhaForm";

export default async function TrocarSenhaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <TrocarSenhaForm />;
}
