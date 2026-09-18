"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Utensils,
  Crown,
  ArrowRight,
  LogOut,
} from "lucide-react";
import { NAV, FLAT_NAV, TITLES } from "@/lib/nav";
import { doSignOut } from "@/server/auth-actions";
import { MarginWatchdog } from "@/components/margin-watchdog";

type ShellUser = {
  name: string;
  role: string;
  locationName: string;
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Eigenaar",
  EXEC_CHEF: "Executive Chef",
  CHEF: "Chef de Partie",
  STAFF: "Medewerker",
};

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeId =
    FLAT_NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
      ?.id ?? "chef";
  const active = FLAT_NAV.find((n) => n.id === activeId);
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (≥980px) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-forest text-[#E6EAE3] min-[980px]:flex">
        <div className="px-6 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-champagne text-forest">
              <Utensils size={19} />
            </div>
            <div>
              <div className="font-serif text-[22px] font-semibold leading-none">
                SousPlus<span className="text-gold">+</span>
              </div>
              <div className="mt-[3px] text-[10.5px] uppercase tracking-[0.18em] text-[#9DB0A2]">
                Kitchen Studio
              </div>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-forest-line bg-[rgba(240,230,210,0.08)] px-2.5 py-[5px] text-[11px] font-semibold text-champagne">
            <Crown size={13} /> PREMIUM
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3.5 py-2.5">
          {NAV.map((grp) => (
            <div key={grp.section}>
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7E9085]">
                {grp.section}
              </div>
              <div className="flex flex-col gap-[3px]">
                {grp.items.map((n) => {
                  const Icon = n.icon;
                  const on = n.id === activeId;
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      className={`flex w-full items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition ${
                        on
                          ? "bg-champagne font-semibold text-forest"
                          : "font-medium text-[#C2CEC6] hover:bg-forest-2"
                      }`}
                    >
                      <Icon size={17} className="shrink-0" />
                      {n.label}
                      {n.id === "chef" && !on && (
                        <span className="ml-auto rounded-full border border-forest-line px-1.5 py-px text-[9px] tracking-[0.05em] text-gold">
                          AI
                        </span>
                      )}
                      {on && <ArrowRight size={14} className="ml-auto" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-forest-line p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-deep font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold">
                {user.name}
              </div>
              <div className="truncate text-[11.5px] text-[#9DB0A2]">
                {ROLE_LABEL[user.role] ?? user.role} · {user.locationName}
              </div>
            </div>
            <form action={doSignOut}>
              <button
                type="submit"
                aria-label="Uitloggen"
                className="grid size-8 place-items-center rounded-lg text-[#9DB0A2] transition hover:bg-forest-2 hover:text-champagne"
              >
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between border-b border-line bg-[rgba(244,242,236,0.85)] px-4 backdrop-blur-md min-[980px]:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-[30px] place-items-center rounded-lg bg-forest text-champagne">
              <Utensils size={16} />
            </div>
            <div className="hidden min-[980px]:block">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
                {TITLES[activeId]}
              </div>
              <div className="mt-px font-serif text-[19px] font-semibold">
                {active?.label}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <MarginWatchdog />
          </div>
        </header>

        {/* Topnav (≤980px) */}
        <div className="sticky top-[70px] z-25 flex gap-1 overflow-x-auto border-b border-forest-line bg-forest px-3 py-2 min-[980px]:hidden">
          {FLAT_NAV.map((n) => {
            const Icon = n.icon;
            const on = n.id === activeId;
            return (
              <Link
                key={n.id}
                href={n.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] transition ${
                  on
                    ? "bg-champagne font-semibold text-forest"
                    : "font-medium text-[#C2CEC6]"
                }`}
              >
                <Icon size={16} />
                {n.label}
              </Link>
            );
          })}
        </div>

        <main className="flex-1 overflow-y-auto px-4 py-6 min-[980px]:px-8 min-[980px]:py-8">
          <div className="mx-auto max-w-[1180px] [animation:sp-fade_.3s_ease]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
