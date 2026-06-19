"use client";

import { useActionState } from "react";
import { Loader2, LogIn, Utensils } from "lucide-react";
import { authenticate } from "./actions";

export function LoginForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-champagne text-forest">
          <Utensils size={20} />
        </div>
        <div>
          <div className="font-serif text-2xl font-semibold leading-none text-charcoal">
            SousPlus<span className="text-gold">+</span>
          </div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-muted">
            Kitchen Studio
          </div>
        </div>
      </div>

      <h1 className="font-serif text-3xl font-semibold text-charcoal">
        Welkom terug, chef
      </h1>
      <p className="mt-2 text-sm text-ink">
        Log in op je keuken om verder te werken.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            E-mail
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue="mark@bistroplus.nl"
            className="h-12 rounded-xl border border-line bg-card px-4 text-[15px] text-charcoal outline-none focus:border-gold focus:ring-2 focus:ring-champagne"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Wachtwoord
          </span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            defaultValue="demo1234"
            className="h-12 rounded-xl border border-line bg-card px-4 text-[15px] text-charcoal outline-none focus:border-gold focus:ring-2 focus:ring-champagne"
          />
        </label>

        {errorMessage && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 flex h-12 items-center justify-center gap-2.5 rounded-xl bg-forest text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <LogIn size={17} />
          )}
          Inloggen
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Demo-toegang · mark@bistroplus.nl / demo1234
      </p>
    </div>
  );
}
