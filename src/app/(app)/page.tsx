import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import HomePageData from "./HomePageData";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          ¡Hola, {session.user.name || "bienvenido"}!
        </h1>
        <p className="text-sm text-secondary">
          Resumen de tu biblioteca y de lo pendiente de estudio hoy.
        </p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <HomePageData name={session.user.name ?? ""} />
      </Suspense>
    </div>
  );
}