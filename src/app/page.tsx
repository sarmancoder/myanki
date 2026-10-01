import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">¡Bienvenido, {session.user?.name || "usuario"}!</h1>
        <p className="mt-4 text-lg text-secondary">
          MyAnki está listo para ayudarte a aprender.
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="/decks"
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ver Mis Mazos
          </a>
          <a
            href="/settings"
            className="rounded-lg border border-border px-6 py-3 font-medium text-primary transition-colors hover:bg-secondary"
          >
            Configuración
          </a>
        </div>
      </div>
    </div>
  );
}
