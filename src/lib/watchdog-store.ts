"use client";

import { create } from "zustand";

// Client-store voor de Marge-Waakhond. Module-level zodat de bel overal in de
// app dezelfde alert-state deelt; de supplier-resync en OCR-apply triggeren een
// refresh zodat de bel direct reageert op de prijscascade.

export type AlertView = {
  id: string;
  ingredient: string;
  deltaPct: number;
  dish: string | null;
  affectedRecipeId: string | null;
  currentMarginPct: number | null;
  createdAt: string;
};

type WatchdogState = {
  alerts: AlertView[];
  open: boolean;
  loading: boolean;
  resolvingId: string | null;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  resolve: (id: string, action: "switch" | "accept") => Promise<string | undefined>;
};

export const useWatchdogStore = create<WatchdogState>((set, get) => ({
  alerts: [],
  open: false,
  loading: false,
  resolvingId: null,

  setOpen: (open) => set({ open }),

  async refresh() {
    set({ loading: true });
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = (await res.json()) as { alerts: AlertView[] };
        set({ alerts: data.alerts });
      }
    } catch {
      // stil falen — de bel blijft op de laatst bekende staat
    } finally {
      set({ loading: false });
    }
  },

  async resolve(id, action) {
    set({ resolvingId: id });
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: id, action }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      await get().refresh();
      return data.message ?? data.error;
    } finally {
      set({ resolvingId: null });
    }
  },
}));
