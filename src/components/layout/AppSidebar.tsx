"use client";

import Link from "next/link";

export interface AppShellUser {
  name: string;
  email: string;
  image: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: "home" | "decks" | "settings";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/decks", label: "Mazos", icon: "decks" },
  { href: "/settings", label: "Ajustes", icon: "settings" },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavIconProps {
  name: NavItem["icon"];
}

function NavIcon({ name }: NavIconProps) {
  if (name === "home") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    );
  }

  if (name === "decks") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="12" height="16" rx="2" />
        <path d="M7 4V3h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
    </svg>
  );
}

interface AppSidebarProps {
  user: AppShellUser;
  pathname: string;
  onNavigate?: () => void;
}

export default function AppSidebar({ user, pathname, onNavigate }: AppSidebarProps) {
  const initial = user.name?.trim() || user.email;
  const avatarText = initial.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          M
        </span>
        <span className="text-lg font-bold text-primary">MyAnki</span>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-secondary-foreground-foreground hover:bg-accent hover:text-primary"
              }`}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <Link
          href="/settings"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-accent"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-full w-full object-cover" />
            ) : (
              avatarText
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-primary">{user.name || "Usuario"}</span>
            <span className="block truncate text-xs text-secondary-foreground">{user.email}</span>
          </span>
        </Link>
      </div>
    </div>
  );
}