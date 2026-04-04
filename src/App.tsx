import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "joey-bucket-board-v10";

const PRESETS = [
  { label: "Baseline", amount: 1300 },
  { label: "Smallish", amount: 1254.5 },
  { label: "Tight", amount: 1100 },
  { label: "$1700 gross est", amount: 1254.5 },
];

const TONES = {
  sky: "border-sky-900/70 bg-sky-950/35",
  rose: "border-rose-900/70 bg-rose-950/35",
  amber: "border-amber-900/70 bg-amber-950/35",
  emerald: "border-emerald-900/70 bg-emerald-950/35",
  zinc: "border-zinc-800 bg-zinc-950/72",
  violet: "border-violet-900/70 bg-violet-950/35",
  fuchsia: "border-fuchsia-900/70 bg-fuchsia-950/35",
  cyan: "border-cyan-900/70 bg-cyan-950/35",
};

type ViewMode = "today" | "board" | "concert";
type BucketHorizon = "cycle" | "long";
type DueType = "none" | "this_cycle" | "next_cycle" | "date";

type Phase = { id: string; label: string; target: number };

type Bucket = {
  id: string;
  name: string;
  tone: keyof typeof TONES;
  note: string;
  saved: number;
  locked: boolean;
  archived: boolean;
  phaseIndex: number;
  phases: Phase[];
  horizon: BucketHorizon;
  dueType: DueType;
  dueDate?: string;
};

type ShowPlan = {
  id: string;
  name: string;
  date: string;
  venue: string;
  ticket: number;
  travel: number;
  misc: number;
  bought: boolean;
  active: boolean;
  notes: string;
};

type AppState = {
  paycheck: number;
  unassigned: number;
  view: ViewMode;
  buckets: Bucket[];
  drafts: Record<string, string>;
  shows: ShowPlan[];
  history: { id: string; text: string; ts: string }[];
  lastSavedAt?: string;
};

function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makePhase(id: string, label: string, target: number): Phase {
  return { id, label, target };
}

function makeShow(overrides: Partial<ShowPlan> = {}): ShowPlan {
  return {
    id: makeId("show"),
    name: "",
    date: "",
    venue: "",
    ticket: 75,
    travel: 20,
    misc: 0,
    bought: false,
    active: true,
    notes: "",
    ...overrides,
  };
}

const INITIAL_BUCKETS: Bucket[] = [
  {
    id: "lights",
    name: "Keep the Lights On",
    tone: "sky",
    note: "Rent, Mom, David, subscriptions.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [makePhase("lights-1", "Current cycle", 520.28)],
    horizon: "cycle",
    dueType: "this_cycle",
  },
  {
    id: "repair",
    name: "Make Fidelity Boring Again",
    tone: "rose",
    note: "Negative-balance cure and cleanup.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [
      makePhase("repair-1", "Fidelity + cleanup", 549.08),
      makePhase("repair-2", "Starter reserve", 800),
    ],
    horizon: "long",
    dueType: "none",
  },
  {
    id: "file",
    name: "Get File-Ready",
    tone: "amber",
    note: "Bankruptcy runway / filing costs.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [
      makePhase("file-1", "Filing fee starter", 335),
      makePhase("file-2", "Runway build", 700),
    ],
    horizon: "long",
    dueType: "none",
  },
  {
    id: "chaos",
    name: "Don't Get Blindsided",
    tone: "emerald",
    note: "Tiny anti-chaos pad.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [
      makePhase("chaos-1", "Micro pad", 300),
      makePhase("chaos-2", "Boring reserve", 1023.79),
    ],
    horizon: "long",
    dueType: "none",
  },
  {
    id: "life",
    name: "Daily Life",
    tone: "zinc",
    note: "Food, gas, routine life.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [makePhase("life-1", "Current float", 150)],
    horizon: "cycle",
    dueType: "this_cycle",
  },
  {
    id: "joy",
    name: "Small Joy",
    tone: "violet",
    note: "Softness, not ticket accumulation.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [makePhase("joy-1", "Current softness", 25)],
    horizon: "cycle",
    dueType: "next_cycle",
  },
  {
    id: "show",
    name: "Show Fund",
    tone: "fuchsia",
    note: "Tickets and show-specific spending.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [
      makePhase("show-1", "Single ticket", 75),
      makePhase("show-2", "Show + extras", 150),
      makePhase("show-3", "Next cycle cushion", 225),
    ],
    horizon: "cycle",
    dueType: "next_cycle",
  },
  {
    id: "future",
    name: "Future You",
    tone: "cyan",
    note: "Long-term build beyond payroll retirement.",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [
      makePhase("future-1", "Starter build", 100),
      makePhase("future-2", "Bigger future buffer", 500),
    ],
    horizon: "long",
    dueType: "none",
  },
];

const INITIAL_STATE: AppState = {
  paycheck: 1300,
  unassigned: 0,
  view: "today",
  buckets: INITIAL_BUCKETS,
  drafts: {},
  shows: [makeShow({ name: "Example Show", notes: "Delete or rename me." })],
  history: [],
};

function parseMoney(value: string | number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatStamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

function currentPhase(bucket: Bucket): Phase {
  return bucket.phases[bucket.phaseIndex] || bucket.phases[0] || { id: "fallback", label: "Main", target: 0 };
}

function targetOf(bucket: Bucket): number {
  return currentPhase(bucket).target;
}

function labelOf(bucket: Bucket): string {
  return currentPhase(bucket).label;
}

function progress(saved: number, target: number): number {
  return target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : 0;
}

function showNeeded(show: ShowPlan): number {
  return (show.bought ? 0 : parseMoney(show.ticket)) + parseMoney(show.travel) + parseMoney(show.misc);
}

function showTotal(show: ShowPlan): number {
  return parseMoney(show.ticket) + parseMoney(show.travel) + parseMoney(show.misc);
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function horizonLabel(horizon: BucketHorizon): string {
  return horizon === "cycle" ? "Cycle" : "Long-term";
}

function dueLabel(bucket: Bucket): string {
  if (bucket.horizon === "long") return "Long arc";
  if (bucket.dueType === "this_cycle") return "Due this cycle";
  if (bucket.dueType === "next_cycle") return "Due next cycle";
  if (bucket.dueType === "date") return bucket.dueDate ? `Due ${bucket.dueDate}` : "Pick a date";
  return "No deadline";
}

function dueWeight(bucket: Bucket): number {
  if (bucket.horizon === "long") return 100;
  if (bucket.dueType === "this_cycle") return 0;
  if (bucket.dueType === "next_cycle") return 1;
  if (bucket.dueType === "date") {
    if (!bucket.dueDate) return 3;
    const due = new Date(`${bucket.dueDate}T00:00:00`);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((due.getTime() - now.getTime()) / 86400000);
    if (diff < 0) return -1;
    if (diff <= 7) return 0.5;
    return 2;
  }
  return 3;
}

function bucketStatus(bucket: Bucket): { label: string; tone: keyof typeof TONES } {
  const target = targetOf(bucket);
  if (bucket.saved >= target && target > 0) return { label: "Funded", tone: "emerald" };
  if (bucket.horizon === "long") return { label: "Building", tone: bucket.tone };
  if (bucket.dueType === "this_cycle") return { label: "Current cycle", tone: "rose" };
  if (bucket.dueType === "next_cycle") return { label: "Next cycle", tone: "amber" };
  if (bucket.dueType === "date") return { label: "Date-bound", tone: "sky" };
  return { label: "Open", tone: bucket.tone };
}

function iconForBucket(bucketId: string) {
  const map: Record<string, string> = {
    lights: "LT",
    repair: "FB",
    file: "FR",
    chaos: "CP",
    life: "DL",
    joy: "SJ",
    show: "SF",
    future: "FY",
  };
  return map[bucketId] || "BK";
}

function normalizeBucket(bucket: Partial<Bucket>, fallback?: Bucket): Bucket {
  const base = fallback || {
    id: String(bucket.id || makeId("bucket")),
    name: "Untitled bucket",
    tone: "zinc" as keyof typeof TONES,
    note: "",
    saved: 0,
    locked: false,
    archived: false,
    phaseIndex: 0,
    phases: [makePhase("phase-1", "Main", 0)],
    horizon: "long" as BucketHorizon,
    dueType: "none" as DueType,
    dueDate: "",
  };

  const phases = Array.isArray(bucket.phases) && bucket.phases.length
    ? bucket.phases.map((phase, index) => ({
        id: phase.id || makeId(`phase-${index}`),
        label: phase.label || `Phase ${index + 1}`,
        target: parseMoney(phase.target || 0),
      }))
    : base.phases;

  const safeIndex = Math.min(Math.max(0, Number(bucket.phaseIndex ?? base.phaseIndex ?? 0)), Math.max(0, phases.length - 1));
  const horizon = bucket.horizon === "cycle" ? "cycle" : bucket.horizon === "long" ? "long" : base.horizon;
  const dueType: DueType =
    horizon === "long"
      ? "none"
      : bucket.dueType === "this_cycle" || bucket.dueType === "next_cycle" || bucket.dueType === "date" || bucket.dueType === "none"
      ? bucket.dueType
      : base.dueType;

  return {
    ...base,
    ...bucket,
    tone: bucket.tone && bucket.tone in TONES ? bucket.tone : base.tone,
    saved: parseMoney(bucket.saved ?? base.saved),
    locked: Boolean(bucket.locked ?? base.locked),
    archived: Boolean(bucket.archived ?? base.archived),
    phaseIndex: safeIndex,
    phases,
    horizon,
    dueType,
    dueDate: bucket.dueDate || base.dueDate || "",
  };
}

function normalizeState(raw: Partial<AppState>): AppState {
  const defaultsById = Object.fromEntries(INITIAL_BUCKETS.map((bucket) => [bucket.id, bucket]));
  const incoming = Array.isArray(raw.buckets) ? raw.buckets : [];
  const seen = new Set<string>();

  const mergedIncoming = incoming.map((bucket) => {
    const fallback = bucket.id && defaultsById[String(bucket.id)] ? defaultsById[String(bucket.id)] : undefined;
    const normalized = normalizeBucket(bucket, fallback);
    seen.add(normalized.id);
    return normalized;
  });

  const missingDefaults = INITIAL_BUCKETS.filter((bucket) => !seen.has(bucket.id)).map((bucket) => normalizeBucket(bucket, bucket));

  return {
    paycheck: parseMoney(raw.paycheck ?? INITIAL_STATE.paycheck),
    unassigned: parseMoney(raw.unassigned ?? INITIAL_STATE.unassigned),
    view: raw.view === "today" || raw.view === "board" || raw.view === "concert" ? raw.view : INITIAL_STATE.view,
    buckets: [...mergedIncoming, ...missingDefaults],
    drafts: raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {},
    shows: Array.isArray(raw.shows) && raw.shows.length
      ? raw.shows.map((show) => ({
          ...makeShow(),
          ...show,
          ticket: parseMoney(show.ticket ?? 0),
          travel: parseMoney(show.travel ?? 0),
          misc: parseMoney(show.misc ?? 0),
          bought: Boolean(show.bought),
          active: Boolean(show.active ?? true),
        }))
      : INITIAL_STATE.shows,
    history: Array.isArray(raw.history)
      ? raw.history.map((entry) => ({
          id: entry.id || makeId("log"),
          text: entry.text || "",
          ts: entry.ts || new Date().toISOString(),
        }))
      : [],
    lastSavedAt: raw.lastSavedAt,
  };
}

function BucketAvatar({ bucket }: { bucket: Bucket }) {
  return (
    <div className={cls("relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border text-[10px] font-semibold tracking-[0.22em] text-zinc-50", TONES[bucket.tone])}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_65%)]" />
      <div className="absolute inset-x-2 bottom-2 h-[2px] rounded-full bg-white/20" />
      <div className="absolute inset-x-3 bottom-5 h-[2px] rounded-full bg-white/10" />
      <span className="relative">{iconForBucket(bucket.id)}</span>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    primary: "border-zinc-100 bg-zinc-100 text-zinc-950 hover:bg-white",
    secondary: "border-zinc-700 bg-zinc-950/80 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900",
    ghost: "border-zinc-800 bg-transparent text-zinc-300 hover:border-zinc-600 hover:bg-zinc-950/60",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cls(
        "rounded-2xl border px-4 py-2.5 text-sm font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

function TonePill({
  children,
  tone = "zinc",
  active = false,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  active?: boolean;
}) {
  return (
    <span
      className={cls(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
        active ? "border-zinc-100 bg-zinc-100 text-zinc-900" : TONES[tone],
        active ? "" : "text-zinc-200"
      )}
    >
      {children}
    </span>
  );
}

function Stat({
  title,
  value,
  sub,
  tone = "zinc",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className={cls("relative overflow-hidden rounded-[30px] border p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm", TONES[tone])}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">{title}</div>
        <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">{value}</div>
        {sub ? <div className="mt-2 text-sm leading-6 text-zinc-400">{sub}</div> : null}
      </div>
    </div>
  );
}

function SectionShell({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-zinc-800/90 bg-zinc-900/68 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm md:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%)]" />
      <div className="relative">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
            {sub ? <p className="mt-1 text-sm leading-6 text-zinc-400">{sub}</p> : null}
          </div>
          {right ? <div className="flex flex-wrap gap-2">{right}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function ViewTabs({ value, onChange }: { value: ViewMode; onChange: (view: ViewMode) => void }) {
  const tabs: Array<{ value: ViewMode; label: string }> = [
    { value: "today", label: "Today" },
    { value: "board", label: "Board" },
    { value: "concert", label: "Concert" },
  ];

  return (
    <div className="inline-flex rounded-full border border-zinc-800 bg-zinc-950/70 p-1 shadow-inner shadow-black/30">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cls(
            "rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition",
            value === tab.value ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(value);
    }
  }, [value, isFocused]);

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/90 px-3 py-2.5 text-sm text-zinc-300 shadow-inner shadow-black/25">
      <span className="text-zinc-500">$</span>
      <input
        className="w-full bg-transparent text-right text-zinc-100 outline-none placeholder:text-zinc-600"
        value={isFocused ? draft : value}
        onFocus={() => {
          setIsFocused(true);
          setDraft(value);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e);
        }}
        onBlur={() => setIsFocused(false)}
        inputMode="decimal"
      />
    </div>
  );
}

function BucketMiniCard({ bucket }: { bucket: Bucket }) {
  const target = targetOf(bucket);
  const pct = progress(bucket.saved, target);
  const status = bucketStatus(bucket);

  return (
    <div className={cls("rounded-[26px] border p-4 shadow-xl shadow-black/10", TONES[bucket.tone])}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BucketAvatar bucket={bucket} />
          <div>
            <div className="text-sm font-semibold text-zinc-50">{bucket.name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <TonePill tone={bucket.tone}>{horizonLabel(bucket.horizon)}</TonePill>
              <TonePill tone={status.tone}>{dueLabel(bucket)}</TonePill>
            </div>
          </div>
        </div>
        {bucket.saved >= target && target > 0 ? <TonePill active>Ready</TonePill> : null}
      </div>
      <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
        <span>{formatMoney(bucket.saved)}</span>
        <span>{formatMoney(target)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-950 ring-1 ring-white/5">
        <div className="h-full rounded-full bg-zinc-100 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TodayView({
  unassigned,
  totalNeeded,
  cycleBuckets,
  longBuckets,
  nextCore,
  concertPool,
  nextShow,
}: {
  unassigned: number;
  totalNeeded: number;
  cycleBuckets: Bucket[];
  longBuckets: Bucket[];
  nextCore?: Bucket;
  concertPool: number;
  nextShow?: ShowPlan;
}) {
  const cycleNeeded = cycleBuckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0);
  const longNeeded = longBuckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0);

  return (
    <div className="mb-6 space-y-4">
      <SectionShell title="Today view" sub="Cycle pressure separated from long-arc building so the board feels calmer.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Unassigned now" value={formatMoney(unassigned)} sub="Money waiting for a job." tone="cyan" />
          <Stat
            title="Next cycle pressure"
            value={formatMoney(cycleNeeded)}
            sub={nextCore ? `${nextCore.name} is still on deck.` : "No cycle bucket is screaming right now."}
            tone="rose"
          />
          <Stat
            title="Concert-ready pool"
            value={formatMoney(concertPool)}
            sub={nextShow ? `${nextShow.name || "Next show"} needs ${formatMoney(showNeeded(nextShow))}.` : "No active show card right now."}
            tone="fuchsia"
          />
          <Stat title="Long-arc build" value={formatMoney(longNeeded)} sub={`Total still needed across long-term buckets. ${formatMoney(totalNeeded)} overall.`} tone="emerald" />
        </div>
      </SectionShell>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionShell title="Cycle-specific buckets" sub="Closer to deadlines, pay-cycle pressure, or near-term choices.">
          <div className="grid gap-3 md:grid-cols-2">
            {cycleBuckets.map((bucket) => (
              <BucketMiniCard key={bucket.id} bucket={bucket} />
            ))}
          </div>
        </SectionShell>

        <SectionShell title="Long-term build" sub="Not everything needs a countdown. These are meant to quietly accumulate.">
          <div className="grid gap-3 md:grid-cols-2">
            {longBuckets.map((bucket) => (
              <BucketMiniCard key={bucket.id} bucket={bucket} />
            ))}
          </div>
        </SectionShell>
      </div>
    </div>
  );
}

function BucketCard({
  bucket,
  draftValue,
  onDraftChange,
  onAssign,
  onPullBack,
  onPatch,
  onMoveUp,
  onMoveDown,
  onAdvancePhase,
  onAddPhase,
  onUpdatePhase,
  disableMoveUp,
  disableMoveDown,
}: {
  bucket: Bucket;
  draftValue: string;
  onDraftChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAssign: () => void;
  onPullBack: () => void;
  onPatch: (patch: Partial<Bucket>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAdvancePhase: () => void;
  onAddPhase: () => void;
  onUpdatePhase: (phaseId: string, patch: Partial<Phase>) => void;
  disableMoveUp: boolean;
  disableMoveDown: boolean;
}) {
  const target = targetOf(bucket);
  const remaining = Math.max(0, target - bucket.saved);
  const pct = progress(bucket.saved, target);
  const funded = bucket.saved >= target && target > 0;
  const canAdvance = bucket.phaseIndex < bucket.phases.length - 1;
  const status = bucketStatus(bucket);

  return (
    <div className={cls("relative overflow-hidden rounded-[32px] border p-5 shadow-2xl shadow-black/15 backdrop-blur-sm", TONES[bucket.tone])}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap gap-2">
              <TonePill tone={bucket.tone}>{labelOf(bucket)}</TonePill>
              <TonePill tone={bucket.tone}>{horizonLabel(bucket.horizon)}</TonePill>
              <TonePill tone={status.tone}>{dueLabel(bucket)}</TonePill>
              {funded ? <TonePill active>Funded</TonePill> : null}
              {bucket.locked ? <TonePill tone="zinc">Locked</TonePill> : null}
              {bucket.archived ? <TonePill tone="zinc">Archived</TonePill> : null}
            </div>

            <div className="flex items-center gap-3">
              <BucketAvatar bucket={bucket} />
              <input
                value={bucket.name}
                onChange={(e) => onPatch({ name: e.target.value })}
                className="w-full bg-transparent text-lg font-semibold tracking-tight text-zinc-50 outline-none"
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{bucket.note}</p>

            <div className="mt-4 grid gap-3 xl:grid-cols-[auto_auto_1fr_160px]">
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Saved</div>
                <div className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">{formatMoney(bucket.saved)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Target</div>
                <div className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">{formatMoney(target)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Horizon</div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    onClick={() => onPatch({ horizon: "cycle", dueType: bucket.horizon === "cycle" ? bucket.dueType : "this_cycle" })}
                    variant={bucket.horizon === "cycle" ? "primary" : "secondary"}
                    className="px-3 py-2 text-xs"
                  >
                    Cycle
                  </ActionButton>
                  <ActionButton
                    onClick={() => onPatch({ horizon: "long", dueType: "none", dueDate: "" })}
                    variant={bucket.horizon === "long" ? "primary" : "secondary"}
                    className="px-3 py-2 text-xs"
                  >
                    Long-term
                  </ActionButton>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Due</div>
                {bucket.horizon === "cycle" ? (
                  <div className="space-y-2">
                    <select
                      value={bucket.dueType}
                      onChange={(e) => {
                        const nextDueType = e.target.value as DueType;
                        onPatch({ dueType: nextDueType, dueDate: nextDueType === "date" ? bucket.dueDate || "" : "" });
                      }}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none"
                    >
                      <option value="none">No deadline</option>
                      <option value="this_cycle">This cycle</option>
                      <option value="next_cycle">Next cycle</option>
                      <option value="date">Specific date</option>
                    </select>
                    {bucket.dueType === "date" ? (
                      <input
                        type="date"
                        value={bucket.dueDate || ""}
                        onChange={(e) => onPatch({ dueDate: e.target.value })}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none"
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm leading-6 text-zinc-400">Long-term buckets stay out of countdown mode.</div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:w-[260px]">
            <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
              <span>{pct.toFixed(0)}% built</span>
              <span>{formatMoney(remaining)} to go</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-zinc-950/90 ring-1 ring-white/5">
              <div className="h-full rounded-full bg-zinc-100 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>

            <div className="mt-4 grid gap-3">
              <MoneyInput value={draftValue} onChange={onDraftChange} />
              <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={onAssign} variant="primary">Assign</ActionButton>
                <ActionButton onClick={onPullBack}>Pull back</ActionButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={() => onPatch({ locked: !bucket.locked })}>{bucket.locked ? "Unlock" : "Lock"}</ActionButton>
                <ActionButton onClick={() => onPatch({ archived: !bucket.archived })}>{bucket.archived ? "Restore" : "Archive"}</ActionButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={onMoveUp} disabled={disableMoveUp} className="px-3">Up</ActionButton>
                <ActionButton onClick={onMoveDown} disabled={disableMoveDown} className="px-3">Down</ActionButton>
              </div>
              <ActionButton onClick={onAdvancePhase} disabled={!funded || !canAdvance}>Advance phase</ActionButton>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-zinc-800 bg-zinc-950/60 p-4 shadow-inner shadow-black/20">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-zinc-100">Phases</div>
              <div className="mt-1 text-xs text-zinc-400">Saved dollars stay. Targets evolve.</div>
            </div>
            <ActionButton onClick={onAddPhase} className="px-3 py-2 text-xs">Add phase</ActionButton>
          </div>
          <div className="space-y-2">
            {bucket.phases.map((phase, index) => {
              const active = index === bucket.phaseIndex;
              return (
                <div
                  key={phase.id}
                  className={cls(
                    "grid gap-2 rounded-2xl border p-3 md:grid-cols-[1fr_180px]",
                    active ? "border-zinc-100 bg-zinc-900/90" : "border-zinc-800 bg-zinc-950/70"
                  )}
                >
                  <input
                    value={phase.label}
                    onChange={(e) => onUpdatePhase(phase.id, { label: e.target.value })}
                    className="bg-transparent text-sm text-zinc-100 outline-none"
                  />
                  <MoneyInput value={String(phase.target)} onChange={(e) => onUpdatePhase(phase.id, { target: parseMoney(e.target.value) })} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShowCard({
  show,
  concertPool,
  onUpdate,
  onDuplicate,
  onToggleActive,
  onDelete,
}: {
  show: ShowPlan;
  concertPool: number;
  onUpdate: (patch: Partial<ShowPlan>) => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const total = showTotal(show);
  const needed = showNeeded(show);
  const ready = concertPool >= needed;
  const pct = total > 0 ? Math.min(100, (concertPool / total) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-900/68 p-5 shadow-2xl shadow-black/15 backdrop-blur-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.08),transparent_55%)]" />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TonePill tone="fuchsia">{show.active ? "Active" : "Inactive"}</TonePill>
          <TonePill tone="violet">{show.bought ? "Ticket bought" : "Ticket needed"}</TonePill>
          <TonePill tone={ready ? "emerald" : "amber"}>{ready ? "Can happen now" : "Needs more money"}</TonePill>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Show name</div>
            <input value={show.name} onChange={(e) => onUpdate({ name: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="Currents / ERRA / etc" />
          </label>
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Venue</div>
            <input value={show.venue} onChange={(e) => onUpdate({ venue: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="El Corazon / etc" />
          </label>
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Date</div>
            <input type="date" value={show.date} onChange={(e) => onUpdate({ date: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" />
          </label>
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Notes</div>
            <input value={show.notes} onChange={(e) => onUpdate({ notes: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="Two tickets? parking? no merch?" />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Ticket</div>
            <MoneyInput value={String(show.ticket)} onChange={(e) => onUpdate({ ticket: parseMoney(e.target.value) })} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Travel</div>
            <MoneyInput value={String(show.travel)} onChange={(e) => onUpdate({ travel: parseMoney(e.target.value) })} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Misc</div>
            <MoneyInput value={String(show.misc)} onChange={(e) => onUpdate({ misc: parseMoney(e.target.value) })} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <ActionButton onClick={() => onUpdate({ bought: !show.bought })}>{show.bought ? "Mark ticket needed" : "Mark ticket bought"}</ActionButton>
          <ActionButton onClick={onToggleActive}>{show.active ? "Set inactive" : "Set active"}</ActionButton>
          <ActionButton onClick={onDuplicate}>Duplicate</ActionButton>
          <ActionButton onClick={onDelete} variant="ghost">Delete</ActionButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Stat title="Total target" value={formatMoney(total)} sub="Ticket + travel + misc" tone="fuchsia" />
          <Stat title="Needed now" value={formatMoney(needed)} sub={show.bought ? "Ticket excluded" : "Full amount still needed"} tone="violet" />
          <Stat title="Pool test" value={ready ? "YES" : "NO"} sub={`${formatMoney(concertPool)} against ${formatMoney(needed)}`} tone={ready ? "emerald" : "amber"} />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
            <span>Pool vs full show target</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-950 ring-1 ring-white/5">
            <div className="h-full rounded-full bg-zinc-100 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BucketSystemApp() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AppState>;
      setState(normalizeState(parsed));
    } catch {
      // ignore bad local storage
    }
  }, []);

  useEffect(() => {
    const ts = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: ts }));
  }, [state]);

  const activeBuckets = useMemo(() => state.buckets.filter((bucket) => !bucket.archived), [state.buckets]);
  const cycleBuckets = useMemo(
    () =>
      activeBuckets
        .filter((bucket) => bucket.horizon === "cycle")
        .sort((a, b) => dueWeight(a) - dueWeight(b) || targetOf(a) - targetOf(b)),
    [activeBuckets]
  );
  const longBuckets = useMemo(
    () =>
      activeBuckets
        .filter((bucket) => bucket.horizon === "long")
        .sort((a, b) => targetOf(a) - targetOf(b)),
    [activeBuckets]
  );
  const visibleBuckets = useMemo(
    () => state.buckets.filter((bucket) => !bucket.archived && (state.view === "concert" ? ["joy", "show"].includes(bucket.id) : true)),
    [state.buckets, state.view]
  );
  const archivedBuckets = useMemo(() => state.buckets.filter((bucket) => bucket.archived), [state.buckets]);
  const totalSaved = useMemo(() => state.buckets.reduce((sum, bucket) => sum + bucket.saved, 0), [state.buckets]);
  const totalTargets = useMemo(() => state.buckets.reduce((sum, bucket) => sum + targetOf(bucket), 0), [state.buckets]);
  const totalNeeded = useMemo(() => state.buckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0), [state.buckets]);
  const fundedCount = useMemo(() => state.buckets.filter((bucket) => bucket.saved >= targetOf(bucket) && targetOf(bucket) > 0).length, [state.buckets]);
  const nextCore = useMemo(
    () => cycleBuckets.find((bucket) => ["lights", "life", "joy", "show"].includes(bucket.id) && bucket.saved < targetOf(bucket)),
    [cycleBuckets]
  );
  const showFund = state.buckets.find((bucket) => bucket.id === "show")?.saved || 0;
  const smallJoy = state.buckets.find((bucket) => bucket.id === "joy")?.saved || 0;
  const concertPool = showFund + smallJoy + state.unassigned;
  const activeShows = state.shows.filter((show) => show.active);
  const inactiveShows = state.shows.filter((show) => !show.active);

  const log = (text: string) => {
    setState((prev) => ({
      ...prev,
      history: [{ id: makeId("log"), text, ts: new Date().toISOString() }, ...prev.history].slice(0, 80),
    }));
  };

  const updateBuckets = (fn: (buckets: Bucket[]) => Bucket[]) => {
    setState((prev) => ({ ...prev, buckets: fn(prev.buckets) }));
  };

  const updateShows = (fn: (shows: ShowPlan[]) => ShowPlan[]) => {
    setState((prev) => ({ ...prev, shows: fn(prev.shows) }));
  };

  const patchBucket = (bucketId: string, patch: Partial<Bucket>) => {
    updateBuckets((buckets) =>
      buckets.map((bucket) => {
        if (bucket.id !== bucketId) return bucket;
        const merged = { ...bucket, ...patch };
        if (merged.horizon === "long") {
          merged.dueType = "none";
          merged.dueDate = "";
        }
        return normalizeBucket(merged, bucket);
      })
    );
  };

  const addToUnassigned = () => {
    const amount = parseMoney(state.paycheck);
    if (amount <= 0) return;
    setState((prev) => ({ ...prev, unassigned: parseMoney(prev.unassigned + amount), paycheck: 0 }));
    log(`Added ${formatMoney(amount)} to unassigned.`);
  };

  const assign = (bucketId: string) => {
    const amount = parseMoney(state.drafts[bucketId]);
    if (amount <= 0) return;
    const usable = Math.min(amount, state.unassigned);
    if (usable <= 0) return;
    const bucketName = state.buckets.find((bucket) => bucket.id === bucketId)?.name || bucketId;
    setState((prev) => ({
      ...prev,
      unassigned: parseMoney(prev.unassigned - usable),
      drafts: { ...prev.drafts, [bucketId]: "" },
      buckets: prev.buckets.map((bucket) => (bucket.id === bucketId ? { ...bucket, saved: parseMoney(bucket.saved + usable) } : bucket)),
    }));
    log(`Assigned ${formatMoney(usable)} to ${bucketName}.`);
  };

  const pullBack = (bucketId: string) => {
    const amount = parseMoney(state.drafts[bucketId]);
    if (amount <= 0) return;
    const bucket = state.buckets.find((item) => item.id === bucketId);
    if (!bucket) return;
    const usable = Math.min(amount, bucket.saved);
    if (usable <= 0) return;
    setState((prev) => ({
      ...prev,
      unassigned: parseMoney(prev.unassigned + usable),
      drafts: { ...prev.drafts, [bucketId]: "" },
      buckets: prev.buckets.map((item) => (item.id === bucketId ? { ...item, saved: parseMoney(item.saved - usable) } : item)),
    }));
    log(`Pulled back ${formatMoney(usable)} from ${bucket.name}.`);
  };

  const autoFill = () => {
    let pool = state.unassigned;
    const next = state.buckets.map((bucket) => ({ ...bucket }));
    const sorted = [...next].sort((a, b) => dueWeight(a) - dueWeight(b) || targetOf(a) - targetOf(b));
    const moves: string[] = [];
    for (const bucket of sorted) {
      if (bucket.locked || bucket.archived) continue;
      const needed = Math.max(0, targetOf(bucket) - bucket.saved);
      if (!needed || pool <= 0) continue;
      const add = Math.min(needed, pool);
      bucket.saved = parseMoney(bucket.saved + add);
      pool = parseMoney(pool - add);
      moves.push(`${formatMoney(add)} -> ${bucket.name}`);
    }
    setState((prev) => ({ ...prev, unassigned: pool, buckets: next }));
    if (moves.length) log(`Auto-fill: ${moves.join(", ")}.`);
  };

  const exportBackup = () => {
    const d = new Date();
    const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bucket-board-backup_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log("Exported backup file.");
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<AppState>;
        setState(normalizeState(parsed));
        log("Imported backup file.");
      } catch {
        alert("That backup file could not be read.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const moveBucket = (bucketId: string, direction: "up" | "down") => {
    const list = [...state.buckets];
    const i = list.findIndex((bucket) => bucket.id === bucketId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setState((prev) => ({ ...prev, buckets: list }));
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950 pb-28 text-zinc-100 md:pb-8">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),transparent_42%)]" />
        <div className="absolute left-[-12%] top-8 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-16 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(to_top,rgba(0,0,0,0.38),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-7xl p-4 md:p-8">
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importBackup} />

        <div className="mb-8 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="relative overflow-hidden rounded-[36px] border border-zinc-800 bg-zinc-900/72 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%)]" />
            <div className="relative">
              <div className="mb-3 flex flex-wrap gap-2">
                <TonePill tone="zinc">Bucket board</TonePill>
                <TonePill tone="sky">{state.view}</TonePill>
                <TonePill tone="rose">{cycleBuckets.length} cycle buckets</TonePill>
                <TonePill tone="emerald">{longBuckets.length} long-term</TonePill>
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
                Give the money a shape, then let the pressure separate itself.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                Same board logic, but clearer horizons. Cycle-specific buckets stay deadline-aware. Long-term buckets stay allowed to be boring.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-zinc-300">
                <TonePill tone="cyan">Local save</TonePill>
                <TonePill tone="fuchsia">Show planner</TonePill>
                <TonePill tone="amber">Horizon split</TonePill>
                <TonePill tone="emerald">Visual refresh</TonePill>
              </div>
              <div className="mt-6 hidden md:block">
                <ViewTabs value={state.view} onChange={(view) => setState((prev) => ({ ...prev, view }))} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Stat title="Unassigned cash" value={formatMoney(state.unassigned)} sub="Money not yet told what job it has." tone="cyan" />
            <Stat title="Total saved in buckets" value={formatMoney(totalSaved)} sub={`${fundedCount} funded buckets.`} tone="emerald" />
          </div>
        </div>

        <SectionShell
          title="Command bar"
          sub="Feed the pool, switch views, and keep the board moving without hunting for buttons."
          right={
            <>
              <div className="hidden md:block">
                <ViewTabs value={state.view} onChange={(view) => setState((prev) => ({ ...prev, view }))} />
              </div>
              <ActionButton onClick={exportBackup}>Export</ActionButton>
              <ActionButton onClick={() => fileRef.current?.click()}>Import</ActionButton>
            </>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_auto]">
            <div className="rounded-[28px] border border-zinc-800 bg-zinc-950/54 p-4">
              <div className="mb-3 text-sm text-zinc-400">When money lands, let it sit in unassigned first.</div>
              <div className="mb-3 flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setState((prev) => ({ ...prev, paycheck: preset.amount }))}
                    className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <MoneyInput value={String(state.paycheck)} onChange={(e) => setState((prev) => ({ ...prev, paycheck: parseMoney(e.target.value) }))} />
                <ActionButton onClick={addToUnassigned} variant="primary">Add to unassigned</ActionButton>
              </div>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-zinc-800 bg-zinc-950/54 p-4 sm:grid-cols-2 lg:grid-cols-2">
              <ActionButton onClick={autoFill}>Auto-fill</ActionButton>
              <ActionButton onClick={exportBackup}>Export backup</ActionButton>
              <ActionButton onClick={() => fileRef.current?.click()}>Import backup</ActionButton>
              <ActionButton onClick={() => setState((prev) => ({ ...prev, view: prev.view === "today" ? "board" : prev.view === "board" ? "concert" : "today" }))}>
                Cycle view
              </ActionButton>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-[28px] border border-zinc-800 bg-zinc-950/54 p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Last local save</div>
                <div className="mt-2 text-sm leading-6 text-zinc-300">{formatStamp(state.lastSavedAt)}</div>
              </div>
              <ActionButton onClick={() => setState(INITIAL_STATE)} variant="ghost">Reset board</ActionButton>
            </div>
          </div>
        </SectionShell>

        <div className="my-6 grid gap-4 md:grid-cols-4">
          <Stat title="Total bucket targets" value={formatMoney(totalTargets)} sub="Current phase targets." tone="zinc" />
          <Stat title="Cycle bucket count" value={String(cycleBuckets.length)} sub="Deadline-aware / nearer-term buckets." tone="rose" />
          <Stat title="Long-term count" value={String(longBuckets.length)} sub="Quiet build buckets." tone="emerald" />
          <Stat title="Archived buckets" value={String(archivedBuckets.length)} sub="Retired without disappearing." tone="violet" />
        </div>

        {state.view === "today" ? (
          <TodayView
            unassigned={state.unassigned}
            totalNeeded={totalNeeded}
            cycleBuckets={cycleBuckets}
            longBuckets={longBuckets}
            nextCore={nextCore}
            concertPool={concertPool}
            nextShow={activeShows[0]}
          />
        ) : null}

        {state.view === "concert" ? (
          <div className="mb-6 space-y-4">
            <SectionShell
              title="Concert mode"
              sub="Show Fund + Small Joy + unassigned = concert-ready pool."
              right={
                <ActionButton
                  onClick={() => {
                    updateShows((shows) => [makeShow({ name: "New Show" }), ...shows]);
                    log("Added new show card.");
                  }}
                >
                  Add show
                </ActionButton>
              }
            >
              <div className="grid gap-4 md:grid-cols-4">
                <Stat title="Show Fund" value={formatMoney(showFund)} tone="fuchsia" />
                <Stat title="Small Joy" value={formatMoney(smallJoy)} tone="violet" />
                <Stat title="Concert-ready pool" value={formatMoney(concertPool)} tone="sky" />
                <Stat
                  title="Active shows"
                  value={String(activeShows.length)}
                  sub={activeShows[0] ? `${activeShows[0].name || "Untitled"} needs ${formatMoney(showNeeded(activeShows[0]))}` : "No active shows."}
                  tone="amber"
                />
              </div>
            </SectionShell>

            {activeShows.map((show) => (
              <ShowCard
                key={show.id}
                show={show}
                concertPool={concertPool}
                onUpdate={(patch) => updateShows((shows) => shows.map((item) => (item.id === show.id ? { ...item, ...patch } : item)))}
                onDuplicate={() => {
                  updateShows((shows) => [makeShow({ ...show, name: `${show.name || "Show"} copy` }), ...shows]);
                  log(`Duplicated ${show.name || "show"}.`);
                }}
                onToggleActive={() => {
                  updateShows((shows) => shows.map((item) => (item.id === show.id ? { ...item, active: !item.active } : item)));
                  log(`${show.name || "Show"} marked ${show.active ? "inactive" : "active"}.`);
                }}
                onDelete={() => {
                  updateShows((shows) => shows.filter((item) => item.id !== show.id));
                  log(`Deleted ${show.name || "show"}.`);
                }}
              />
            ))}

            {inactiveShows.length ? (
              <SectionShell title="Inactive shows" sub="Kept for later without cluttering the active concert stack.">
                <div className="space-y-3">
                  {inactiveShows.map((show) => (
                    <div key={show.id} className="rounded-[24px] border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-50">{show.name || "Untitled show"}</div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {show.date || "No date"} {show.venue ? `| ${show.venue}` : ""} | Needs {formatMoney(showNeeded(show))}
                          </div>
                        </div>
                        <ActionButton onClick={() => updateShows((shows) => shows.map((item) => (item.id === show.id ? { ...item, active: true } : item)))}>
                          Reactivate
                        </ActionButton>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionShell>
            ) : null}
          </div>
        ) : null}

        {state.view !== "today" ? (
          <div className="space-y-4">
            {visibleBuckets.map((bucket, index) => (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                draftValue={state.drafts[bucket.id] || ""}
                onDraftChange={(e) => setState((prev) => ({ ...prev, drafts: { ...prev.drafts, [bucket.id]: e.target.value } }))}
                onAssign={() => assign(bucket.id)}
                onPullBack={() => pullBack(bucket.id)}
                onPatch={(patch) => patchBucket(bucket.id, patch)}
                onMoveUp={() => moveBucket(bucket.id, "up")}
                onMoveDown={() => moveBucket(bucket.id, "down")}
                onAdvancePhase={() => {
                  if (bucket.saved < targetOf(bucket) || bucket.phaseIndex >= bucket.phases.length - 1) return;
                  updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, phaseIndex: item.phaseIndex + 1 } : item)));
                  log(`${bucket.name} advanced to ${bucket.phases[bucket.phaseIndex + 1].label}.`);
                }}
                onAddPhase={() =>
                  updateBuckets((buckets) =>
                    buckets.map((item) =>
                      item.id === bucket.id ? { ...item, phases: [...item.phases, makePhase(makeId("phase"), `Phase ${item.phases.length + 1}`, targetOf(item))] } : item
                    )
                  )
                }
                onUpdatePhase={(phaseId, patch) =>
                  updateBuckets((buckets) =>
                    buckets.map((item) =>
                      item.id !== bucket.id
                        ? item
                        : {
                            ...item,
                            phases: item.phases.map((phase) =>
                              phase.id === phaseId ? { ...phase, ...patch, target: patch.target !== undefined ? parseMoney(patch.target) : phase.target } : phase
                            ),
                          }
                    )
                  )
                }
                disableMoveUp={index === 0}
                disableMoveDown={index === visibleBuckets.length - 1}
              />
            ))}
          </div>
        ) : null}

        {archivedBuckets.length ? (
          <div className="mt-8">
            <SectionShell title="Archived buckets" sub="Retired buckets stay available without cluttering the main stack.">
              <div className="space-y-3">
                {archivedBuckets.map((bucket) => (
                  <div key={bucket.id} className={cls("rounded-[24px] border p-4", TONES[bucket.tone])}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-50">{bucket.name}</div>
                        <div className="mt-1 text-sm text-zinc-400">
                          Saved {formatMoney(bucket.saved)} | {horizonLabel(bucket.horizon)} | {labelOf(bucket)}
                        </div>
                      </div>
                      <ActionButton onClick={() => patchBucket(bucket.id, { archived: false })}>Restore</ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            </SectionShell>
          </div>
        ) : null}

        <div className="mt-8">
          <SectionShell title="History" sub="Tiny human log, not accountant theater." right={<TonePill tone="zinc">{state.history.length} entries</TonePill>}>
            <div className="space-y-2">
              {state.history.length ? (
                state.history.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="text-xs text-zinc-500">{formatStamp(entry.ts)}</div>
                    <div className="mt-1 text-sm text-zinc-200">{entry.text}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
                  No history yet. Start by adding money or assigning a dollar.
                </div>
              )}
            </div>
          </SectionShell>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-3 gap-2">
          <button onClick={() => setState((prev) => ({ ...prev, view: "today" }))} className={cls("rounded-2xl px-3 py-3 text-xs uppercase tracking-[0.16em] transition", state.view === "today" ? "bg-zinc-100 text-zinc-900" : "border border-zinc-800 bg-zinc-900 text-zinc-300")}>Today</button>
          <button onClick={() => setState((prev) => ({ ...prev, view: "board" }))} className={cls("rounded-2xl px-3 py-3 text-xs uppercase tracking-[0.16em] transition", state.view === "board" ? "bg-zinc-100 text-zinc-900" : "border border-zinc-800 bg-zinc-900 text-zinc-300")}>Board</button>
          <button onClick={() => setState((prev) => ({ ...prev, view: "concert" }))} className={cls("rounded-2xl px-3 py-3 text-xs uppercase tracking-[0.16em] transition", state.view === "concert" ? "bg-zinc-100 text-zinc-900" : "border border-zinc-800 bg-zinc-900 text-zinc-300")}>Concert</button>
        </div>
      </div>
    </div>
  );
}
