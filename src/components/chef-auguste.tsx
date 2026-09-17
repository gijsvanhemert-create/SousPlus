"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Send, Sparkles, Check, X, Loader2, ArrowRight } from "lucide-react";
import { useChefStore } from "@/lib/chef-store";
import { useWatchdogStore } from "@/lib/watchdog-store";
import { ChefMarkdown } from "@/components/chef-markdown";

const TASKS = [
  "Analyseer de marge van het menu en wijs het zwakste gerecht aan.",
  "Stel een nieuw bietenvoorgerecht voor met echte inkoopprijzen en sla het op.",
  "Zet de HACCP-dagstaat voor vandaag klaar.",
  "Wissel de leverancier van roomboter naar een goedkoper alternatief.",
];

export function ChefAuguste() {
  const router = useRouter();
  const { messages, busy, pending, loaded, pendingPrompt, setPendingPrompt, loadHistory, send, confirm } = useChefStore();
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const lastConsumedRef = useRef<string | null>(null);
  const watchdogCountRef = useRef(0);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy, pending]);

  // Vraag die een andere module (bv. de Marge-Waakhond) heeft klaargezet: pas
  // versturen zodra de historie geladen is, en elke prompt hooguit één keer.
  useEffect(() => {
    if (!loaded || !pendingPrompt || busy) return;
    if (lastConsumedRef.current === pendingPrompt) return;
    lastConsumedRef.current = pendingPrompt;
    const prompt = pendingPrompt;
    setPendingPrompt(null);
    void (async () => {
      setInput("");
      const navigateTo = await send(prompt);
      if (navigateTo) router.push(navigateTo);
    })();
  }, [loaded, pendingPrompt, busy, send, setPendingPrompt, router]);

  // Zodra Auguste een Waakhond-alert oplost (nieuwe 'watchdog'-actie), ververs de
  // bel zodat de teller direct klopt.
  useEffect(() => {
    const count = messages.reduce(
      (n, m) => n + (m.actions?.filter((a) => a.kind === "watchdog").length ?? 0),
      0,
    );
    if (count > watchdogCountRef.current) void useWatchdogStore.getState().refresh();
    watchdogCountRef.current = count;
  }, [messages]);

  async function submit(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    const navigateTo = await send(text);
    if (navigateTo) router.push(navigateTo);
  }

  async function onConfirm(accept: boolean) {
    const navigateTo = await confirm(accept);
    if (navigateTo) router.push(navigateTo);
  }

  const showSuggestions = loaded && messages.length <= 1;
  // "Werkt…"-indicator alleen tonen zolang er nog geen tekst streamt in de laatste
  // chef-bubbel; zodra de tekst binnendruppelt is de indicator overbodig.
  const last = messages[messages.length - 1];
  const streamingStarted = last?.role === "chef" && last.text.length > 0;
  const showWorking = busy && !streamingStarted;

  return (
    <div className="flex min-h-[calc(100vh-220px)] flex-col">
      {/* Pass-briefing header */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[18px] bg-forest px-5 py-4 text-[#E6EAE3]">
        <div className="grid size-13 shrink-0 place-items-center rounded-full border-2 border-champagne bg-gradient-to-br from-gold to-gold-deep font-serif text-2xl font-semibold text-white">
          A
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg font-semibold">Chef Auguste</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-forest-line px-2 py-0.5 text-[10px] font-semibold text-gold">
              <Sparkles size={11} /> AI · Tier 2
            </span>
          </div>
          <div className="text-[12.5px] text-[#9DB0A2]">Brigade-souschef · voert acties uit via tool-use</div>
        </div>
      </div>

      {/* Conversatie — chef's pass */}
      <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.map((m, i) =>
          m.role === "you" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-forest px-4 py-2.5 text-[14px] leading-relaxed text-[#E6EAE3]">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-deep font-serif text-sm font-semibold text-white">
                <ChefHat size={18} />
              </div>
              <div className="max-w-[80%] min-w-0 rounded-2xl rounded-tl-sm border border-champagne bg-card px-4 py-3 shadow-[0_1px_0_var(--color-champagne-soft)]">
                <ChefMarkdown text={m.text} />
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.actions.map((a, k) =>
                      a.href ? (
                        <button
                          key={k}
                          onClick={() => router.push(a.href!)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold bg-champagne-soft px-3 py-1 text-[12px] font-semibold text-gold-deep transition hover:bg-champagne"
                        >
                          {a.label} <ArrowRight size={13} />
                        </button>
                      ) : (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1 text-[12px] font-semibold text-muted"
                        >
                          {a.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {showWorking && (
          <div className="flex items-center gap-2 pl-12 text-[13px] text-muted">
            <Loader2 size={14} className="animate-spin" /> Chef Auguste werkt…
          </div>
        )}

        {showSuggestions && (
          <div className="grid gap-2 pl-12 sm:grid-cols-2">
            {TASKS.map((t) => (
              <button
                key={t}
                onClick={() => submit(t)}
                className="rounded-xl border border-line bg-card px-4 py-3 text-left text-[13px] leading-snug text-ink transition hover:border-gold hover:bg-champagne-soft"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bevestigingsbalk voor destructieve acties */}
      {pending && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold bg-champagne-soft px-4 py-3">
          <span className="text-[13px] font-medium text-gold-deep">
            Bevestig: Chef Auguste wil <strong>{pending.tool.replace(/_/g, " ")}</strong> uitvoeren.
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onConfirm(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-forest px-3.5 py-2 text-[13px] font-semibold text-white"
            >
              <Check size={15} /> Uitvoeren
            </button>
            <button
              onClick={() => onConfirm(false)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink"
            >
              <X size={15} /> Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Invoer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-card p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Geef Chef Auguste een opdracht…"
          disabled={busy}
          className="flex-1 bg-transparent px-3 py-2 text-[14.5px] text-charcoal outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Versturen"
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-forest text-white transition disabled:opacity-40"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
