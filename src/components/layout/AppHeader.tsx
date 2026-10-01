"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { AppShellUser } from "./AppSidebar";

interface AppHeaderProps {
  user: AppShellUser;
  onMenuClick: () => void;
}

export default function AppHeader({ user, onMenuClick }: AppHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú de navegación"
        className="-ml-1 rounded-lg p-2 text-secondary-foreground transition-colors hover:bg-secondary hover:text-primary lg:hidden"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <span className="text-base font-semibold text-primary lg:hidden">MyAnki</span>

      <div className="flex-1" />

      <span className="hidden text-sm text-secondary-foreground sm:block">
        {user.name || user.email}
      </span>

      <button
        type="button"
        onClick={handleLogout}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
      >
        Cerrar Sesión
      </button>
    </header>
  );
}