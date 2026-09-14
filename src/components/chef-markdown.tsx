"use client";

import Markdown from "react-markdown";
import type { Components } from "react-markdown";

// Rendert de markdown die Chef Auguste produceert (vette koppen, bonnetje-tabellen
// in code-fences, horizontale lijnen) als echte opmaak binnen de chatbubbel.
// Code-fences krijgen een monospace-blok met horizontale scroll, zodat ruimte-
// uitgelijnde tabellen uitgelijnd blijven i.p.v. te breken op de bubbelbreedte.
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-charcoal">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-gold-deep underline">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 font-serif text-[16px] font-semibold text-charcoal first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 font-serif text-[15.5px] font-semibold text-charcoal first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1 mt-3 font-serif text-[15px] font-semibold text-charcoal first:mt-0">{children}</h3>,
  hr: () => <hr className="my-3 border-line" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto whitespace-pre rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px] leading-snug text-charcoal">
      {children}
    </pre>
  ),
  // Monospace voor code; het blok-kader/scroll zit op <pre>. Inline code blijft zo
  // gewoon monospace zonder dubbel kader.
  code: ({ children }) => <code className="font-mono">{children}</code>,
};

export function ChefMarkdown({ text }: { text: string }) {
  return (
    <div className="text-[14.5px] leading-relaxed text-ink">
      <Markdown components={components}>{text}</Markdown>
    </div>
  );
}
