"use client";

import { useState, useTransition } from "react";
import {
  Lock,
  ShieldCheck,
  ShieldAlert,
  Thermometer,
  CheckCircle2,
  AlertTriangle,
  History,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import { recordMeasurement } from "@/server/haccp/actions";

type Checkpoint = {
  id: string;
  zone: string;
  target: string;
  unit: string;
  limitValue: number;
  cmp: "LTE" | "GTE";
};
type Record = {
  id: string;
  checkpointId: string;
  zone: string;
  target: string;
  value: string;
  unit: string;
  status: "OK" | "ATTENTION";
  recordedAt: string;
  signedByName: string;
  hash: string;
  prevHash: string | null;
  retentionUntil: string;
};
type Verification = { valid: boolean; count: number; brokenAt?: string | null; reason?: string };

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL");
}

export function HaccpBoard({
  checkpoints,
  records: initialRecords,
  verification,
  retentionYears,
}: {
  checkpoints: Checkpoint[];
  records: Record[];
  verification: Verification;
  retentionYears: number;
}) {
  // Records synchroniseren tijdens render (geen effect) zodra de server na een
  // registratie nieuwe data doorgeeft.
  const [records, setRecords] = useState(initialRecords);
  const [prev, setPrev] = useState(initialRecords);
  if (prev !== initialRecords) {
    setPrev(initialRecords);
    setRecords(initialRecords);
  }

  const [values, setValues] = useState<{ [id: string]: string }>({});
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const today = new Date().toLocaleDateString("nl-NL");
  const todays = records.filter((r) => new Date(r.recordedAt).toLocaleDateString("nl-NL") === today);
  const latestByCheckpoint = new Map<string, Record>();
  for (const r of records) if (!latestByCheckpoint.has(r.checkpointId)) latestByCheckpoint.set(r.checkpointId, r);
  const doneToday = checkpoints.filter((c) =>
    todays.some((r) => r.checkpointId === c.id),
  ).length;
  const attentionToday = todays.filter((r) => r.status === "ATTENTION").length;

  function submit(checkpointId: string) {
    const value = (values[checkpointId] ?? "").trim();
    if (!value || isPending) return;
    setActiveId(checkpointId);
    startTransition(async () => {
      try {
        const res = await recordMeasurement({ checkpointId, value });
        setRecords((rs) => [res.record, ...rs]); // optimistisch; server revalideert
        setValues((v) => ({ ...v, [checkpointId]: "" }));
      } catch {
        // laat de waarde staan; de server heeft niets vastgelegd
      } finally {
        setActiveId(null);
      }
    });
  }

  return (
    <div className="max-w-[900px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[480px] text-[14.5px] leading-relaxed text-ink">
          Dagstaat voedselveiligheid. Vul de gemeten waardes in — de norm wordt automatisch gecontroleerd en elke
          meting wordt <strong>onveranderlijk</strong> vastgelegd in een manipulatie-bestendige audit trail.
        </p>
        {/* Integriteitsbadge (hash-chain) */}
        {verification.valid ? (
          <span className="inline-flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2 text-[13px] font-semibold text-success">
            <ShieldCheck size={16} /> Keten geverifieerd · {verification.count} registraties
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2 text-[13px] font-semibold text-danger">
            <ShieldAlert size={16} /> Manipulatie gedetecteerd ({verification.reason})
          </span>
        )}
      </div>

      <div className="mb-4 flex w-fit items-center gap-2 rounded-[10px] bg-success-soft px-3 py-2 text-xs text-success">
        <Lock size={14} /> Registraties zijn append-only, ondertekend en gehasht — bewaartermijn {retentionYears} jaar.
      </div>

      {/* Samenvatting */}
      <div className="mb-[18px] flex flex-wrap gap-3.5">
        <Stat label="Vandaag" value={`${doneToday}/${checkpoints.length}`} />
        <Stat label="Aandacht" value={String(attentionToday)} accent={attentionToday ? "text-danger" : "text-success"} />
        <Stat label="Vastgelegd" value={String(verification.count)} accent="text-gold" />
      </div>

      {/* Dagstaat */}
      <div className="mb-[18px] overflow-hidden rounded-[18px] border border-line bg-card">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[2fr_1fr_1.4fr_0.7fr] gap-3 border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span>Registratiepunt</span>
            <span>Norm</span>
            <span>Meting</span>
            <span className="text-right">Status</span>
          </div>
          {checkpoints.map((c) => {
            const latest = latestByCheckpoint.get(c.id);
            const busy = isPending && activeId === c.id;
            return (
              <div key={c.id} className="grid grid-cols-[2fr_1fr_1.4fr_0.7fr] items-center gap-3 border-b border-canvas px-5 py-3">
                <span className="flex items-center gap-2 text-[14px] font-semibold">
                  <Thermometer size={15} className="text-muted" /> {c.zone}
                </span>
                <span className="text-[13px] text-muted">{c.target}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    value={values[c.id] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit(c.id);
                    }}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`meting ${c.zone}`}
                    className="w-16 rounded-[9px] border border-line bg-canvas px-2 py-1.5 text-center text-[14px] text-charcoal tabular-nums"
                  />
                  <span className="text-[12.5px] text-muted">{c.unit}</span>
                  <button
                    onClick={() => submit(c.id)}
                    disabled={busy || !(values[c.id] ?? "").trim()}
                    className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-lg bg-forest px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />} Vastleggen
                  </button>
                </span>
                <span className="text-right">
                  {!latest ? (
                    <span className="text-[12px] text-muted">—</span>
                  ) : latest.status === "OK" ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success">
                      <CheckCircle2 size={14} /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger">
                      <AlertTriangle size={14} /> actie
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit trail (append-only, hash-chain) */}
      <div className="overflow-hidden rounded-[18px] border border-line bg-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-[14px] font-semibold">
          <History size={16} className="text-gold" /> Audit-logboek · {records.length} registraties
        </div>
        {records.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-muted">Nog geen registraties vastgelegd.</div>
        )}
        {records.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-canvas px-5 py-3 text-[13px]">
            <div className="flex min-w-0 items-center gap-2.5">
              <Lock size={12} className="shrink-0 text-muted" />
              <span className="font-medium">{r.zone}</span>
              <span className="text-muted tabular-nums">
                {r.value} {r.unit}
              </span>
              <span className={`font-semibold ${r.status === "OK" ? "text-success" : "text-danger"}`}>
                {r.status === "OK" ? "OK" : "actie"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-muted">
              <span className="tabular-nums">{fmt(r.recordedAt)}</span>
              <span>{r.signedByName}</span>
              <span className="font-mono text-[10.5px] text-gold-deep" title={`hash ${r.hash}\nprev ${r.prevHash ?? "genesis"}`}>
                #{r.hash.slice(0, 10)}
              </span>
            </div>
          </div>
        ))}
        <div className="px-5 py-2.5 text-[11.5px] text-muted">
          Append-only: elke registratie draagt de hash van de vorige (hash-chain). Records kunnen niet achteraf
          worden gewijzigd; een correctie is een nieuw record. Bewaartermijn t/m{" "}
          {records[0] ? fmtDate(records[0].retentionUntil) : `+${retentionYears} jaar`}.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-charcoal" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 basis-[140px] rounded-[14px] border border-line bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-1 font-serif text-[23px] font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
