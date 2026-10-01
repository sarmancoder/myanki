"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppSidebar, { type AppShellUser } from "./AppSidebar";
import AppHeader from "./AppHeader";

interface AppShellProps {
  user: AppShellUser;
  children: ReactNode;
}

export default function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-secondary lg:block">
        <AppSidebar user={user} pathname={pathname} />
      </aside>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú de navegación"
            onClick={() => setIsMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 h-full w-64 border-r border-border bg-secondary shadow-xl">
            <AppSidebar user={user} pathname={pathname} onNavigate={() => setIsMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} onMenuClick={() => setIsMenuOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}