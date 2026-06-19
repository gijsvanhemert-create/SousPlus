"use client";

import { create } from "zustand";

// Lichte client-store voor de Chef Auguste-conversatie. Module-level Zustand,
// dus de gespreksstate blijft behouden bij navigeren binnen de app (de server
// blijft bron van waarheid; bij hard herladen wordt de historie opnieuw geladen).

export type ChefActionView = { kind: string; label: string; detail?: string; href?: string };

export type ChefMessage = {
  role: "you" | "chef";
  text: string;
  actions?: ChefActionView[];
};

type Pending = { tool: string; summary: string; originalMessage: string } | null;

type TurnResult = {
  conversationId: string;
  text: string;
  actions?: ChefActionView[];
  navigateTo?: string;
  pendingConfirmation?: { tool: string; summary: string };
  error?: string;
};

type ChefState = {
  conversationId: string | null;
  messages: ChefMessage[];
  busy: boolean;
  pending: Pending;
  loaded: boolean;
  loadHistory: () => Promise<void>;
  send: (text: string, opts?: { autoConfirm?: boolean; echo?: boolean }) => Promise<string | undefined>;
  confirm: (accept: boolean) => Promise<string | undefined>;
};

const GREETING: ChefMessage = {
  role: "chef",
  text:
    "Chef. De brigade staat klaar. Ik heb zicht op je recepturen, de live inkoopprijzen en de HACCP-staat. Zeg het maar — een analyse, een receptuur fijnslijpen, of de dagstaat klaarzetten. Ik voer het uit.",
};

export const useChefStore = create<ChefState>((set, get) => ({
  conversationId: null,
  messages: [GREETING],
  busy: false,
  pending: null,
  loaded: false,

  async loadHistory() {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/chef");
      if (res.ok) {
        const data = (await res.json()) as { conversationId: string | null; messages: { role: "user" | "assistant"; text: string }[] };
        const msgs: ChefMessage[] = data.messages.map((m) => ({ role: m.role === "user" ? "you" : "chef", text: m.text }));
        set({ conversationId: data.conversationId, messages: msgs.length ? msgs : [GREETING], loaded: true });
        return;
      }
    } catch {
      // stilletjes vallen we terug op de begroeting
    }
    set({ loaded: true });
  },

  async send(text, opts) {
    const trimmed = text.trim();
    if (!trimmed || get().busy) return;
    const echo = opts?.echo ?? true;
    set((s) => ({
      busy: true,
      pending: null,
      messages: echo ? [...s.messages, { role: "you", text: trimmed }] : s.messages,
    }));

    try {
      const res = await fetch("/api/chef", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId: get().conversationId, autoConfirm: opts?.autoConfirm }),
      });
      const data = (await res.json()) as TurnResult;
      if (!res.ok) {
        set((s) => ({ busy: false, messages: [...s.messages, { role: "chef", text: data.error ?? "Er ging iets mis, chef." }] }));
        return;
      }

      if (data.pendingConfirmation) {
        set((s) => ({
          busy: false,
          conversationId: data.conversationId,
          pending: { tool: data.pendingConfirmation!.tool, summary: data.pendingConfirmation!.summary, originalMessage: trimmed },
          messages: [...s.messages, { role: "chef", text: data.text || data.pendingConfirmation!.summary }],
        }));
        return;
      }

      set((s) => ({
        busy: false,
        conversationId: data.conversationId,
        messages: [...s.messages, { role: "chef", text: data.text, actions: data.actions }],
      }));
      return data.navigateTo;
    } catch {
      set((s) => ({ busy: false, messages: [...s.messages, { role: "chef", text: "De lijn met de keuken hapert even — geef me zo opnieuw de opdracht." }] }));
    }
  },

  async confirm(accept) {
    const pending = get().pending;
    if (!pending) return;
    if (!accept) {
      set((s) => ({ pending: null, messages: [...s.messages, { role: "chef", text: "Begrepen, chef — ik laat het zo." }] }));
      return;
    }
    set({ pending: null });
    // Herhaal de oorspronkelijke opdracht mét bevestiging; geen dubbele echo.
    return get().send(pending.originalMessage, { autoConfirm: true, echo: false });
  },
}));
