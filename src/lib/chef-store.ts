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
    // Voeg de gebruikersecho toe (indien nodig) plus een lege chef-bubbel die we
    // tijdens het streamen vullen.
    set((s) => ({
      busy: true,
      pending: null,
      messages: [...s.messages, ...(echo ? [{ role: "you" as const, text: trimmed }] : []), { role: "chef" as const, text: "" }],
    }));

    // Werk de laatste (streamende) chef-bubbel bij.
    const setLastChef = (fn: (m: ChefMessage) => ChefMessage) =>
      set((s) => {
        const msgs = s.messages.slice();
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "chef") {
            msgs[i] = fn(msgs[i]);
            break;
          }
        }
        return { messages: msgs };
      });

    try {
      const res = await fetch("/api/chef", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId: get().conversationId, autoConfirm: opts?.autoConfirm }),
      });
      if (!res.ok || !res.body) {
        let msg = "Er ging iets mis, chef.";
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {}
        setLastChef((m) => ({ ...m, text: msg }));
        set({ busy: false });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let navigateTo: string | undefined;

      const handle = (evt: {
        type: string;
        text?: string;
        conversationId?: string;
        actions?: ChefActionView[];
        navigateTo?: string;
        pendingConfirmation?: { tool: string; summary: string };
        error?: string;
      }) => {
        if (evt.type === "delta") {
          setLastChef((m) => ({ ...m, text: m.text + (evt.text ?? "") }));
        } else if (evt.type === "done") {
          if (evt.error) {
            setLastChef((m) => ({ ...m, text: evt.error! }));
          } else if (evt.pendingConfirmation) {
            setLastChef((m) => ({ ...m, text: m.text || evt.pendingConfirmation!.summary }));
            set({
              conversationId: evt.conversationId ?? get().conversationId,
              pending: { tool: evt.pendingConfirmation.tool, summary: evt.pendingConfirmation.summary, originalMessage: trimmed },
            });
          } else {
            setLastChef((m) => ({ ...m, text: evt.text ?? m.text, actions: evt.actions }));
            if (evt.conversationId) set({ conversationId: evt.conversationId });
            navigateTo = evt.navigateTo;
          }
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handle(JSON.parse(line));
        }
      }
      set({ busy: false });
      return navigateTo;
    } catch {
      setLastChef((m) => ({ ...m, text: m.text || "De lijn met de keuken hapert even — geef me zo opnieuw de opdracht." }));
      set({ busy: false });
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
