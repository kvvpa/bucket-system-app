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
type DueMode = "none" | "paycycle" | "date";
type DueSelectValue = "none" | "current" | "next" | "date";
type BucketCategory = "operational" | "discretionary";
type FilterMode = "all" | "underfunded" | "current" | "operational" | "discretionary" | "long";

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
  dueMode: DueMode;
  dueDate: string;
};

type LegacyBucket = Partial<Bucket> & {
  dueType?: "none" | "this_cycle" | "next_cycle" | "date";
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

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizeDate(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function makeLocalDate(year: number, monthIndex: number, day: number): Date {
  const next = new Date(year, monthIndex, day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return makeLocalDate(year, month, day);
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return dateKey(a) === dateKey(b);
}

function getNextPayday(ref: Date): Date {
  const date = normalizeDate(ref);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if (day <= 10) return makeLocalDate(year, month, 10);
  if (day <= 25) return makeLocalDate(year, month, 25);
  return makeLocalDate(year, month + 1, 10);
}

function getFollowingPayday(payday: Date): Date {
  const date = normalizeDate(payday);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if (day === 10) return makeLocalDate(year, month, 25);
  return makeLocalDate(year, month + 1, 10);
}

function getPreviousPayday(ref: Date): Date {
  const next = getNextPayday(ref);
  const normalized = normalizeDate(ref);
  if (sameDate(next, normalized)) {
    if (next.getDate() === 10) return makeLocalDate(next.getFullYear(), next.getMonth() - 1, 25);
    return makeLocalDate(next.getFullYear(), next.getMonth(), 10);
  }
  if (next.getDate() === 10) return makeLocalDate(next.getFullYear(), next.getMonth() - 1, 25);
  return makeLocalDate(next.getFullYear(), next.getMonth(), 10);
}

function getCycleInfo(ref: Date) {
  const today = normalizeDate(ref);
  const nextPayday = getNextPayday(today);
  const secondPayday = getFollowingPayday(nextPayday);
  const previousPayday = getPreviousPayday(today);
  return {
    today,
    previousPayday,
    nextPayday,
    secondPayday,
    currentWindowLabel: `${previousPayday.getDate()}th -> ${nextPayday.getDate()}th`,
  };
}

function makePhase(id: string, label: string, target: number): Phase {
  return { id, label, target };
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

function horizonLabel(horizon: BucketHorizon): string {
  return horizon === "cycle" ? "Cycle" : "Long-term";
}

function bucketCategory(bucket: Bucket): BucketCategory {
  return ["joy", "show"].includes(bucket.id) ? "discretionary" : "operational";
}

function categoryLabel(category: BucketCategory): string {
  return category === "operational" ? "Operational" : "Discretionary";
}

function categoryTone(category: BucketCategory): keyof typeof TONES {
  return category === "operational" ? "zinc" : "violet";
}

function bucketFrameClass(bucket: Bucket): string {
  return bucketCategory(bucket) === "operational"
    ? "shadow-black/15"
    : "shadow-fuchsia-950/25 ring-1 ring-fuchsia-500/8";
}

function iconForBucket(bucketId: string) {
  const map: Record<string, string> = {
    lights: "LT",
    repair: "FB",
    file: "FR",
    chaos: "UC",
    life: "DL",
    joy: "SJ",
    show: "SF",
    future: "FY",
  };
  return map[bucketId] || "BK";
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

function createInitialBuckets(refDate: Date): Bucket[] {
  const cycle = getCycleInfo(refDate);
  return [
    {
      id: "lights",
      name: "Keep the Lights On",
      tone: "sky",
      note: "Core obligations: rent, Mom, David, subscriptions.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("lights-1", "Current cycle", 520.28)],
      horizon: "cycle",
      dueMode: "paycycle",
      dueDate: dateKey(cycle.nextPayday),
    },
    {
      id: "repair",
      name: "Make Fidelity Boring Again",
      tone: "rose",
      note: "Fidelity repair + reserve.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("repair-1", "Fidelity + cleanup", 549.08), makePhase("repair-2", "Starter reserve", 800)],
      horizon: "long",
      dueMode: "none",
      dueDate: "",
    },
    {
      id: "file",
      name: "Get File-Ready",
      tone: "amber",
      note: "Filing fee + runway.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("file-1", "Filing fee starter", 335), makePhase("file-2", "Runway build", 700)],
      horizon: "long",
      dueMode: "none",
      dueDate: "",
    },
    {
      id: "chaos",
      name: "Unexpected Costs",
      tone: "emerald",
      note: "Unexpected costs buffer.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("chaos-1", "Micro pad", 300), makePhase("chaos-2", "Boring reserve", 1023.79)],
      horizon: "long",
      dueMode: "none",
      dueDate: "",
    },
    {
      id: "life",
      name: "Daily Life",
      tone: "zinc",
      note: "Food, gas, and routine life.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("life-1", "Current float", 150)],
      horizon: "cycle",
      dueMode: "paycycle",
      dueDate: dateKey(cycle.nextPayday),
    },
    {
      id: "joy",
      name: "Small Joy",
      tone: "violet",
      note: "Personal softness / low-stakes spending.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("joy-1", "Current softness", 25)],
      horizon: "cycle",
      dueMode: "paycycle",
      dueDate: dateKey(cycle.secondPayday),
    },
    {
      id: "show",
      name: "Show Fund",
      tone: "fuchsia",
      note: "Tickets, travel, and show spending.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("show-1", "Single ticket", 75), makePhase("show-2", "Show + extras", 150), makePhase("show-3", "Next cycle cushion", 225)],
      horizon: "cycle",
      dueMode: "paycycle",
      dueDate: dateKey(cycle.secondPayday),
    },
    {
      id: "future",
      name: "Future You",
      tone: "cyan",
      note: "Long-term savings.",
      saved: 0,
      locked: false,
      archived: false,
      phaseIndex: 0,
      phases: [makePhase("future-1", "Starter build", 100), makePhase("future-2", "Bigger future buffer", 500)],
      horizon: "long",
      dueMode: "none",
      dueDate: "",
    },
  ];
}

function createInitialState(refDate: Date): AppState {
  return {
    paycheck: 1300,
    unassigned: 0,
    view: "today",
    buckets: createInitialBuckets(refDate),
    drafts: {},
    shows: [makeShow({ name: "Example Show", notes: "Delete or rename me." })],
    history: [],
  };
}

function normalizeBucket(raw: LegacyBucket, fallback: Bucket, refDate: Date): Bucket {
  const phases = Array.isArray(raw.phases) && raw.phases.length
    ? raw.phases.map((phase, index) => ({ id: phase.id || makeId(`phase-${index}`), label: phase.label || `Phase ${index + 1}`, target: parseMoney(phase.target || 0) }))
    : fallback.phases;

  const horizon: BucketHorizon = raw.horizon === "cycle" || raw.horizon === "long" ? raw.horizon : fallback.horizon;
  let dueMode: DueMode = raw.dueMode === "paycycle" || raw.dueMode === "date" || raw.dueMode === "none" ? raw.dueMode : fallback.dueMode;
  let dueDate = typeof raw.dueDate === "string" ? raw.dueDate : fallback.dueDate;

  if ((raw as LegacyBucket).dueType) {
    const cycle = getCycleInfo(refDate);
    if ((raw as LegacyBucket).dueType === "this_cycle") {
      dueMode = "paycycle";
      dueDate = dateKey(cycle.nextPayday);
    } else if ((raw as LegacyBucket).dueType === "next_cycle") {
      dueMode = "paycycle";
      dueDate = dateKey(cycle.secondPayday);
    } else if ((raw as LegacyBucket).dueType === "date") {
      dueMode = "date";
      dueDate = typeof raw.dueDate === "string" ? raw.dueDate : "";
    } else {
      dueMode = "none";
      dueDate = "";
    }
  }

  if (horizon === "long") {
    dueMode = "none";
    dueDate = "";
  } else if (dueMode === "paycycle" && !dueDate) {
    dueDate = fallback.dueDate || dateKey(getCycleInfo(refDate).nextPayday);
  } else if (dueMode === "date" && !dueDate) {
    dueDate = dateKey(getCycleInfo(refDate).nextPayday);
  }

  const phaseIndex = Math.min(Math.max(0, Number(raw.phaseIndex ?? fallback.phaseIndex ?? 0)), Math.max(0, phases.length - 1));

  return {
    id: raw.id || fallback.id,
    name: raw.name || fallback.name,
    tone: raw.tone && raw.tone in TONES ? raw.tone : fallback.tone,
    note: raw.note ?? fallback.note,
    saved: parseMoney(raw.saved ?? fallback.saved),
    locked: Boolean(raw.locked ?? fallback.locked),
    archived: Boolean(raw.archived ?? fallback.archived),
    phaseIndex,
    phases,
    horizon,
    dueMode,
    dueDate,
  };
}

function normalizeState(raw: Partial<AppState>, refDate: Date): AppState {
  const initial = createInitialState(refDate);
  const defaultsById = Object.fromEntries(initial.buckets.map((bucket) => [bucket.id, bucket]));
  const incoming = Array.isArray(raw.buckets) ? raw.buckets : [];
  const buckets = incoming.map((bucket) => {
    const fallback = bucket.id && defaultsById[String(bucket.id)] ? defaultsById[String(bucket.id)] : initial.buckets[0];
    return normalizeBucket(bucket as LegacyBucket, fallback, refDate);
  });
  for (const defaultBucket of initial.buckets) {
    if (!buckets.find((bucket) => bucket.id === defaultBucket.id)) buckets.push(defaultBucket);
  }
  return {
    paycheck: parseMoney(raw.paycheck ?? initial.paycheck),
    unassigned: parseMoney(raw.unassigned ?? initial.unassigned),
    view: raw.view === "today" || raw.view === "board" || raw.view === "concert" ? raw.view : initial.view,
    buckets,
    drafts: raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {},
    shows: Array.isArray(raw.shows) && raw.shows.length
      ? raw.shows.map((show) => ({ ...makeShow(), ...show, ticket: parseMoney(show.ticket ?? 0), travel: parseMoney(show.travel ?? 0), misc: parseMoney(show.misc ?? 0), bought: Boolean(show.bought), active: Boolean(show.active ?? true) }))
      : initial.shows,
    history: Array.isArray(raw.history)
      ? raw.history.map((entry) => ({ id: entry.id || makeId("log"), text: entry.text || "", ts: entry.ts || new Date().toISOString() }))
      : [],
    lastSavedAt: raw.lastSavedAt,
  };
}

function describeBucketDue(bucket: Bucket, refDate: Date) {
  if (bucket.horizon === "long") {
    return { title: "Long-term build", detail: "No fixed date", weight: 100, tone: "emerald" as keyof typeof TONES };
  }
  if (bucket.dueMode === "none") {
    return { title: "No fixed date", detail: "Cycle bucket without a fixed deadline", weight: 20, tone: "zinc" as keyof typeof TONES };
  }
  const cycle = getCycleInfo(refDate);
  const due = parseDateKey(bucket.dueDate);
  if (!due) {
    return { title: "Pick a date", detail: "Deadline missing", weight: 20, tone: "amber" as keyof typeof TONES };
  }
  if (due < cycle.today) {
    return { title: `Overdue ${formatShortDate(due)}`, detail: "Past due", weight: -1, tone: "rose" as keyof typeof TONES };
  }
  if (due <= cycle.nextPayday) {
    return { title: `Due ${formatShortDate(due)}`, detail: "Current cycle", weight: 0, tone: "rose" as keyof typeof TONES };
  }
  if (due <= cycle.secondPayday) {
    return { title: `Due ${formatShortDate(due)}`, detail: "Next cycle", weight: 1, tone: "amber" as keyof typeof TONES };
  }
  return { title: `Due ${formatShortDate(due)}`, detail: "Later", weight: 2, tone: "sky" as keyof typeof TONES };
}

function getDueSelectValue(bucket: Bucket, refDate: Date): DueSelectValue {
  if (bucket.horizon === "long" || bucket.dueMode === "none") return "none";
  if (bucket.dueMode === "date") return "date";
  const cycle = getCycleInfo(refDate);
  const due = parseDateKey(bucket.dueDate);
  if (sameDate(due, cycle.nextPayday)) return "current";
  if (sameDate(due, cycle.secondPayday)) return "next";
  return "date";
}

function matchesFilter(bucket: Bucket, filter: FilterMode, refDate: Date): boolean {
  if (filter === "all") return true;
  if (filter === "underfunded") return bucket.saved < targetOf(bucket);
  if (filter === "current") return describeBucketDue(bucket, refDate).weight <= 0;
  if (filter === "operational") return bucketCategory(bucket) === "operational";
  if (filter === "discretionary") return bucketCategory(bucket) === "discretionary";
  if (filter === "long") return bucket.horizon === "long";
  return true;
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

function ActionButton({ children, onClick, variant = "secondary", disabled = false, className = "" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; disabled?: boolean; className?: string; }) {
  const variants = {
    primary: "border-zinc-100 bg-zinc-100 text-zinc-950 hover:bg-white",
    secondary: "border-zinc-700 bg-zinc-950/80 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900",
    ghost: "border-zinc-800 bg-transparent text-zinc-300 hover:border-zinc-600 hover:bg-zinc-950/60",
  };
  return <button onClick={onClick} disabled={disabled} className={cls("rounded-2xl border px-4 py-2.5 text-sm font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-40", variants[variant], className)}>{children}</button>;
}

function TonePill({ children, tone = "zinc", active = false }: { children: React.ReactNode; tone?: keyof typeof TONES; active?: boolean; }) {
  return <span className={cls("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]", active ? "border-zinc-100 bg-zinc-100 text-zinc-900" : TONES[tone], active ? "" : "text-zinc-200")}>{children}</span>;
}

function Stat({ title, value, sub, tone = "zinc" }: { title: string; value: string; sub?: string; tone?: keyof typeof TONES; }) {
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

function SectionShell({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; }) {
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

function ViewTabs({ value, onChange }: { value: ViewMode; onChange: (view: ViewMode) => void; }) {
  const tabs: Array<{ value: ViewMode; label: string }> = [{ value: "today", label: "Today" }, { value: "board", label: "Board" }, { value: "concert", label: "Concert" }];
  return (
    <div className="inline-flex rounded-full border border-zinc-800 bg-zinc-950/70 p-1 shadow-inner shadow-black/30">
      {tabs.map((tab) => <button key={tab.value} onClick={() => onChange(tab.value)} className={cls("rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition", value === tab.value ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200")}>{tab.label}</button>)}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }) {
  const [draft, setDraft] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => { if (!isFocused) setDraft(value); }, [value, isFocused]);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/90 px-3 py-2.5 text-sm text-zinc-300 shadow-inner shadow-black/25">
      <span className="text-zinc-500">$</span>
      <input className="w-full bg-transparent text-right text-zinc-100 outline-none placeholder:text-zinc-600" value={isFocused ? draft : value} onFocus={() => { setIsFocused(true); setDraft(value); }} onChange={(e) => { setDraft(e.target.value); onChange(e); }} onBlur={() => setIsFocused(false)} inputMode="decimal" />
    </div>
  );
}

function FilterPill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void; }) {
  return <button onClick={onClick} className={cls("rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.16em] transition", active ? "border-zinc-100 bg-zinc-100 text-zinc-900" : "border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-zinc-500")}>{children}</button>;
}

function BucketMiniCard({ bucket, refDate }: { bucket: Bucket; refDate: Date; }) {
  const target = targetOf(bucket);
  const pct = progress(bucket.saved, target);
  const due = describeBucketDue(bucket, refDate);
  const category = bucketCategory(bucket);
  return (
    <div className={cls("rounded-[26px] border p-4 shadow-xl", bucketFrameClass(bucket), TONES[bucket.tone])}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BucketAvatar bucket={bucket} />
          <div>
            <div className="text-sm font-semibold text-zinc-50">{bucket.name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <TonePill tone={bucket.tone}>{horizonLabel(bucket.horizon)}</TonePill>
              <TonePill tone={due.tone}>{due.title}</TonePill>
              <TonePill tone={categoryTone(category)}>{categoryLabel(category)}</TonePill>
            </div>
            <div className="mt-2 text-xs leading-5 text-zinc-300">{bucket.note}</div>
            <div className="mt-1 text-xs text-zinc-500">{due.detail}</div>
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

function TodayView({ refDate, unassigned, totalNeeded, cycleBuckets, longBuckets, nextCore, concertPool, nextShow }: { refDate: Date; unassigned: number; totalNeeded: number; cycleBuckets: Bucket[]; longBuckets: Bucket[]; nextCore?: Bucket; concertPool: number; nextShow?: ShowPlan; }) {
  const cycle = getCycleInfo(refDate);
  const cycleNeeded = cycleBuckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0);
  const longNeeded = longBuckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0);
  return (
    <div className="mb-6 space-y-4">
      <SectionShell title="Today view" sub="Real cycle dates drive the pressure map now. Deadlines move automatically; dollars do not.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat title="Current window" value={cycle.currentWindowLabel} sub={`Next payday ${formatShortDate(cycle.nextPayday)}`} tone="rose" />
          <Stat title="Unassigned now" value={formatMoney(unassigned)} sub="Real received money waiting for a job." tone="cyan" />
          <Stat title="Current cycle pressure" value={formatMoney(cycleNeeded)} sub={nextCore ? `${nextCore.name} is still on deck.` : "Nothing current-cycle is screaming right now."} tone="amber" />
          <Stat title="Long-arc build" value={formatMoney(longNeeded)} sub={`${formatMoney(totalNeeded)} still needed overall.`} tone="emerald" />
        </div>
      </SectionShell>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionShell title="Cycle-specific buckets" sub="Closer to deadlines, pay-cycle pressure, or near-term choices.">
          <div className="grid gap-3 md:grid-cols-2">
            {cycleBuckets.map((bucket) => <BucketMiniCard key={bucket.id} bucket={bucket} refDate={refDate} />)}
          </div>
        </SectionShell>

        <SectionShell title="Long-term build" sub="Not everything needs a countdown. These are allowed to accumulate quietly.">
          <div className="grid gap-3 md:grid-cols-2">
            {longBuckets.map((bucket) => <BucketMiniCard key={bucket.id} bucket={bucket} refDate={refDate} />)}
          </div>
        </SectionShell>
      </div>

      <SectionShell title="Concert pulse" sub="Separate from the cycle logic, but still grounded in real money.">
        <div className="grid gap-4 md:grid-cols-3">
          <Stat title="Concert-ready pool" value={formatMoney(concertPool)} sub={nextShow ? `${nextShow.name || "Next show"} needs ${formatMoney(showNeeded(nextShow))}.` : "No active show card right now."} tone="fuchsia" />
          <Stat title="Next payday" value={formatShortDate(cycle.nextPayday)} sub="Current-cycle buckets are due by this boundary." tone="sky" />
          <Stat title="Following payday" value={formatShortDate(cycle.secondPayday)} sub="Next-cycle buckets roll into current after the first boundary passes." tone="violet" />
        </div>
      </SectionShell>
    </div>
  );
}

function BucketCard({ bucket, refDate, draftValue, onDraftChange, onAssign, onPullBack, onPatch, onMoveUp, onMoveDown, onAdvancePhase, onAddPhase, onUpdatePhase, disableMoveUp, disableMoveDown }: { bucket: Bucket; refDate: Date; draftValue: string; onDraftChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onAssign: () => void; onPullBack: () => void; onPatch: (patch: Partial<Bucket>) => void; onMoveUp: () => void; onMoveDown: () => void; onAdvancePhase: () => void; onAddPhase: () => void; onUpdatePhase: (phaseId: string, patch: Partial<Phase>) => void; disableMoveUp: boolean; disableMoveDown: boolean; }) {
  const target = targetOf(bucket);
  const remaining = Math.max(0, target - bucket.saved);
  const pct = progress(bucket.saved, target);
  const funded = bucket.saved >= target && target > 0;
  const canAdvance = bucket.phaseIndex < bucket.phases.length - 1;
  const due = describeBucketDue(bucket, refDate);
  const dueSelect = getDueSelectValue(bucket, refDate);
  const category = bucketCategory(bucket);

  return (
    <div className={cls("relative overflow-hidden rounded-[32px] border p-5 shadow-2xl backdrop-blur-sm", bucketFrameClass(bucket), TONES[bucket.tone])}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap gap-2">
              <TonePill tone={bucket.tone}>{labelOf(bucket)}</TonePill>
              <TonePill tone={bucket.tone}>{horizonLabel(bucket.horizon)}</TonePill>
              <TonePill tone={due.tone}>{due.title}</TonePill>
              <TonePill tone={categoryTone(category)}>{categoryLabel(category)}</TonePill>
              {funded ? <TonePill active>Funded</TonePill> : null}
              {bucket.locked ? <TonePill tone="zinc">Locked</TonePill> : null}
              {bucket.archived ? <TonePill tone="zinc">Archived</TonePill> : null}
            </div>

            <div className="flex items-center gap-3">
              <BucketAvatar bucket={bucket} />
              <input value={bucket.name} onChange={(e) => onPatch({ name: e.target.value })} className="w-full bg-transparent text-lg font-semibold tracking-tight text-zinc-50 outline-none" />
            </div>

            <p className="mt-2 text-sm leading-6 text-zinc-300">{bucket.note}</p>
            <div className="mt-2 text-xs text-zinc-500">{due.detail}</div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[auto_auto_1fr_190px]">
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
                  <ActionButton onClick={() => onPatch({ horizon: "cycle", dueMode: bucket.horizon === "cycle" ? bucket.dueMode : "paycycle", dueDate: bucket.horizon === "cycle" ? bucket.dueDate : dateKey(getCycleInfo(refDate).nextPayday) })} variant={bucket.horizon === "cycle" ? "primary" : "secondary"} className="px-3 py-2 text-xs">Cycle</ActionButton>
                  <ActionButton onClick={() => onPatch({ horizon: "long", dueMode: "none", dueDate: "" })} variant={bucket.horizon === "long" ? "primary" : "secondary"} className="px-3 py-2 text-xs">Long-term</ActionButton>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Due</div>
                {bucket.horizon === "cycle" ? (
                  <div className="space-y-2">
                    <select value={dueSelect} onChange={(e) => { const cycle = getCycleInfo(refDate); const nextValue = e.target.value as DueSelectValue; if (nextValue === "none") onPatch({ dueMode: "none", dueDate: "" }); if (nextValue === "current") onPatch({ dueMode: "paycycle", dueDate: dateKey(cycle.nextPayday) }); if (nextValue === "next") onPatch({ dueMode: "paycycle", dueDate: dateKey(cycle.secondPayday) }); if (nextValue === "date") onPatch({ dueMode: "date", dueDate: bucket.dueDate || dateKey(cycle.nextPayday) }); }} className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none">
                      <option value="none">No deadline</option>
                      <option value="current">Current cycle</option>
                      <option value="next">Next cycle</option>
                      <option value="date">Specific date</option>
                    </select>
                    {(dueSelect === "date" || bucket.dueMode === "date") ? <input type="date" value={bucket.dueDate} onChange={(e) => onPatch({ dueMode: "date", dueDate: e.target.value })} className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none" /> : null}
                  </div>
                ) : <div className="text-sm leading-6 text-zinc-400">Long-term buckets stay out of countdown mode.</div>}
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
                <div key={phase.id} className={cls("grid gap-2 rounded-2xl border p-3 md:grid-cols-[1fr_180px]", active ? "border-zinc-100 bg-zinc-900/90" : "border-zinc-800 bg-zinc-950/70")}>
                  <input value={phase.label} onChange={(e) => onUpdatePhase(phase.id, { label: e.target.value })} className="bg-transparent text-sm text-zinc-100 outline-none" />
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

function ShowCard({ show, concertPool, onUpdate, onDuplicate, onToggleActive, onDelete }: { show: ShowPlan; concertPool: number; onUpdate: (patch: Partial<ShowPlan>) => void; onDuplicate: () => void; onToggleActive: () => void; onDelete: () => void; }) {
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
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Show name</div><input value={show.name} onChange={(e) => onUpdate({ name: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="Currents / ERRA / etc" /></label>
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Venue</div><input value={show.venue} onChange={(e) => onUpdate({ venue: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="El Corazon / etc" /></label>
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Date</div><input type="date" value={show.date} onChange={(e) => onUpdate({ date: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" /></label>
          <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Notes</div><input value={show.notes} onChange={(e) => onUpdate({ notes: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="Two tickets? parking? no merch?" /></label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Ticket</div><MoneyInput value={String(show.ticket)} onChange={(e) => onUpdate({ ticket: parseMoney(e.target.value) })} /></div>
          <div><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Travel</div><MoneyInput value={String(show.travel)} onChange={(e) => onUpdate({ travel: parseMoney(e.target.value) })} /></div>
          <div><div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Misc</div><MoneyInput value={String(show.misc)} onChange={(e) => onUpdate({ misc: parseMoney(e.target.value) })} /></div>
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
          <div className="mb-2 flex items-center justify-between text-sm text-zinc-300"><span>Pool vs full show target</span><span>{pct.toFixed(0)}%</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-950 ring-1 ring-white/5"><div className="h-full rounded-full bg-zinc-100 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

export default function BucketSystemApp() {
  const [state, setState] = useState<AppState>(() => createInitialState(new Date()));
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      setState(normalizeState(JSON.parse(raw) as Partial<AppState>, new Date()));
    } catch {
      // ignore bad local storage
    }
  }, []);

  useEffect(() => {
    const ts = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: ts }));
  }, [state]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const cycleInfo = useMemo(() => getCycleInfo(now), [now]);
  const activeBuckets = useMemo(() => state.buckets.filter((bucket) => !bucket.archived), [state.buckets]);
  const cycleBuckets = useMemo(() => activeBuckets.filter((bucket) => bucket.horizon === "cycle").sort((a, b) => describeBucketDue(a, now).weight - describeBucketDue(b, now).weight || targetOf(a) - targetOf(b)), [activeBuckets, now]);
  const longBuckets = useMemo(() => activeBuckets.filter((bucket) => bucket.horizon === "long").sort((a, b) => targetOf(a) - targetOf(b)), [activeBuckets]);
  const boardBuckets = useMemo(() => state.buckets.filter((bucket) => !bucket.archived && matchesFilter(bucket, filter, now)), [state.buckets, filter, now]);
  const concertBuckets = useMemo(() => state.buckets.filter((bucket) => !bucket.archived && ["joy", "show"].includes(bucket.id)), [state.buckets]);
  const visibleBuckets = state.view === "concert" ? concertBuckets : boardBuckets;
  const archivedBuckets = useMemo(() => state.buckets.filter((bucket) => bucket.archived), [state.buckets]);
  const totalSaved = useMemo(() => state.buckets.reduce((sum, bucket) => sum + bucket.saved, 0), [state.buckets]);
  const totalTargets = useMemo(() => state.buckets.reduce((sum, bucket) => sum + targetOf(bucket), 0), [state.buckets]);
  const totalNeeded = useMemo(() => state.buckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0), [state.buckets]);
  const fundedCount = useMemo(() => state.buckets.filter((bucket) => bucket.saved >= targetOf(bucket) && targetOf(bucket) > 0).length, [state.buckets]);
  const nextCore = useMemo(() => cycleBuckets.find((bucket) => bucket.saved < targetOf(bucket)), [cycleBuckets]);
  const showFund = state.buckets.find((bucket) => bucket.id === "show")?.saved || 0;
  const smallJoy = state.buckets.find((bucket) => bucket.id === "joy")?.saved || 0;
  const concertPool = showFund + smallJoy + state.unassigned;
  const activeShows = state.shows.filter((show) => show.active);
  const inactiveShows = state.shows.filter((show) => !show.active);

  const log = (text: string) => setState((prev) => ({ ...prev, history: [{ id: makeId("log"), text, ts: new Date().toISOString() }, ...prev.history].slice(0, 80) }));
  const updateBuckets = (fn: (buckets: Bucket[]) => Bucket[]) => setState((prev) => ({ ...prev, buckets: fn(prev.buckets) }));
  const updateShows = (fn: (shows: ShowPlan[]) => ShowPlan[]) => setState((prev) => ({ ...prev, shows: fn(prev.shows) }));

  const patchBucket = (bucketId: string, patch: Partial<Bucket>) => updateBuckets((buckets) => buckets.map((bucket) => {
    if (bucket.id !== bucketId) return bucket;
    const next = { ...bucket, ...patch };
    if (next.horizon === "long") {
      next.dueMode = "none";
      next.dueDate = "";
    }
    return next;
  }));

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
    setState((prev) => ({ ...prev, unassigned: parseMoney(prev.unassigned - usable), drafts: { ...prev.drafts, [bucketId]: "" }, buckets: prev.buckets.map((bucket) => bucket.id === bucketId ? { ...bucket, saved: parseMoney(bucket.saved + usable) } : bucket) }));
    log(`Assigned ${formatMoney(usable)} to ${bucketName}.`);
  };

  const pullBack = (bucketId: string) => {
    const amount = parseMoney(state.drafts[bucketId]);
    if (amount <= 0) return;
    const bucket = state.buckets.find((item) => item.id === bucketId);
    if (!bucket) return;
    const usable = Math.min(amount, bucket.saved);
    if (usable <= 0) return;
    setState((prev) => ({ ...prev, unassigned: parseMoney(prev.unassigned + usable), drafts: { ...prev.drafts, [bucketId]: "" }, buckets: prev.buckets.map((item) => item.id === bucketId ? { ...item, saved: parseMoney(item.saved - usable) } : item) }));
    log(`Pulled back ${formatMoney(usable)} from ${bucket.name}.`);
  };

  const autoFill = () => {
    let pool = state.unassigned;
    const nextBuckets = state.buckets.map((bucket) => ({ ...bucket }));
    const sorted = [...nextBuckets].sort((a, b) => describeBucketDue(a, now).weight - describeBucketDue(b, now).weight || targetOf(a) - targetOf(b));
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
    setState((prev) => ({ ...prev, unassigned: pool, buckets: nextBuckets }));
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
        setState(normalizeState(parsed, new Date()));
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
                <TonePill tone="rose">{cycleInfo.currentWindowLabel}</TonePill>
                <TonePill tone="amber">Next {formatShortDate(cycleInfo.nextPayday)}</TonePill>
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-5xl">Real cycle dates, real money, less ambiguity.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">Targets can exist before payday. Assigned dollars should not. Current-cycle and next-cycle pressure now follow your actual 10th / 25th rollover automatically.</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-zinc-300">
                <TonePill tone="cyan">Local save</TonePill>
                <TonePill tone="fuchsia">Show planner</TonePill>
                <TonePill tone="amber">10th / 25th aware</TonePill>
                <TonePill tone="emerald">Live allocation board</TonePill>
              </div>
              <div className="mt-6 hidden md:block"><ViewTabs value={state.view} onChange={(view) => setState((prev) => ({ ...prev, view }))} /></div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Stat title="Unassigned cash" value={formatMoney(state.unassigned)} sub="Real received money not yet placed." tone="cyan" />
            <Stat title="Total saved in buckets" value={formatMoney(totalSaved)} sub={`${fundedCount} funded buckets.`} tone="emerald" />
          </div>
        </div>

        <SectionShell title="Command bar" sub="Feed the pool, switch views, and move money only after it is actually spendable." right={<><div className="hidden md:block"><ViewTabs value={state.view} onChange={(view) => setState((prev) => ({ ...prev, view }))} /></div><ActionButton onClick={exportBackup}>Export</ActionButton><ActionButton onClick={() => fileRef.current?.click()}>Import</ActionButton></>}>
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_auto]">
            <div className="rounded-[28px] border border-zinc-800 bg-zinc-950/54 p-4">
              <div className="mb-3 text-sm text-zinc-400">When money lands, let it sit in unassigned first.</div>
              <div className="mb-3 flex flex-wrap gap-2">{PRESETS.map((preset) => <button key={preset.label} onClick={() => setState((prev) => ({ ...prev, paycheck: preset.amount }))} className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500">{preset.label}</button>)}</div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <MoneyInput value={String(state.paycheck)} onChange={(e) => setState((prev) => ({ ...prev, paycheck: parseMoney(e.target.value) }))} />
                <ActionButton onClick={addToUnassigned} variant="primary">Add to unassigned</ActionButton>
              </div>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-zinc-800 bg-zinc-950/54 p-4 sm:grid-cols-2 lg:grid-cols-2">
              <ActionButton onClick={autoFill}>Auto-fill</ActionButton>
              <ActionButton onClick={exportBackup}>Export backup</ActionButton>
              <ActionButton onClick={() => fileRef.current?.click()}>Import backup</ActionButton>
              <ActionButton onClick={() => setState((prev) => ({ ...prev, view: prev.view === "today" ? "board" : prev.view === "board" ? "concert" : "today" }))}>Cycle view</ActionButton>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-[28px] border border-zinc-800 bg-zinc-950/54 p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Last local save</div>
                <div className="mt-2 text-sm leading-6 text-zinc-300">{formatStamp(state.lastSavedAt)}</div>
              </div>
              <ActionButton onClick={() => setState(createInitialState(new Date()))} variant="ghost">Reset board</ActionButton>
            </div>
          </div>
        </SectionShell>

        <div className="my-6 grid gap-4 md:grid-cols-4">
          <Stat title="Total bucket targets" value={formatMoney(totalTargets)} sub="Current phase targets." tone="zinc" />
          <Stat title="Cycle buckets" value={String(cycleBuckets.length)} sub={`Current window ${cycleInfo.currentWindowLabel}.`} tone="rose" />
          <Stat title="Long-term buckets" value={String(longBuckets.length)} sub="No countdown unless you choose one." tone="emerald" />
          <Stat title="Archived buckets" value={String(archivedBuckets.length)} sub="Retired without disappearing." tone="violet" />
        </div>

        {state.view === "today" ? <TodayView refDate={now} unassigned={state.unassigned} totalNeeded={totalNeeded} cycleBuckets={cycleBuckets} longBuckets={longBuckets} nextCore={nextCore} concertPool={concertPool} nextShow={activeShows[0]} /> : null}

        {state.view === "concert" ? (
          <div className="mb-6 space-y-4">
            <SectionShell title="Concert mode" sub="Show Fund + Small Joy + unassigned = concert-ready pool." right={<ActionButton onClick={() => { updateShows((shows) => [makeShow({ name: "New Show" }), ...shows]); log("Added new show card."); }}>Add show</ActionButton>}>
              <div className="grid gap-4 md:grid-cols-4">
                <Stat title="Show Fund" value={formatMoney(showFund)} tone="fuchsia" />
                <Stat title="Small Joy" value={formatMoney(smallJoy)} tone="violet" />
                <Stat title="Concert-ready pool" value={formatMoney(concertPool)} tone="sky" />
                <Stat title="Active shows" value={String(activeShows.length)} sub={activeShows[0] ? `${activeShows[0].name || "Untitled"} needs ${formatMoney(showNeeded(activeShows[0]))}` : "No active shows."} tone="amber" />
              </div>
            </SectionShell>

            {activeShows.map((show) => <ShowCard key={show.id} show={show} concertPool={concertPool} onUpdate={(patch) => updateShows((shows) => shows.map((item) => item.id === show.id ? { ...item, ...patch } : item))} onDuplicate={() => { updateShows((shows) => [makeShow({ ...show, name: `${show.name || "Show"} copy` }), ...shows]); log(`Duplicated ${show.name || "show"}.`); }} onToggleActive={() => { updateShows((shows) => shows.map((item) => item.id === show.id ? { ...item, active: !item.active } : item)); log(`${show.name || "Show"} marked ${show.active ? "inactive" : "active"}.`); }} onDelete={() => { updateShows((shows) => shows.filter((item) => item.id !== show.id)); log(`Deleted ${show.name || "show"}.`); }} />)}

            {inactiveShows.length ? <SectionShell title="Inactive shows" sub="Kept for later without cluttering the active concert stack."><div className="space-y-3">{inactiveShows.map((show) => <div key={show.id} className="rounded-[24px] border border-zinc-800 bg-zinc-950/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-50">{show.name || "Untitled show"}</div><div className="mt-1 text-sm text-zinc-400">{show.date || "No date"} {show.venue ? `| ${show.venue}` : ""} | Needs {formatMoney(showNeeded(show))}</div></div><ActionButton onClick={() => updateShows((shows) => shows.map((item) => item.id === show.id ? { ...item, active: true } : item))}>Reactivate</ActionButton></div></div>)}</div></SectionShell> : null}
          </div>
        ) : null}

        {state.view === "board" ? (
          <div className="mb-4 rounded-[28px] border border-zinc-800 bg-zinc-900/62 p-4 shadow-xl shadow-black/15 backdrop-blur-sm">
            <div className="mb-3 text-sm text-zinc-400">Reduce clutter and ask one question at a time.</div>
            <div className="flex flex-wrap gap-2">
              <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>All</FilterPill>
              <FilterPill active={filter === "underfunded"} onClick={() => setFilter("underfunded")}>Underfunded</FilterPill>
              <FilterPill active={filter === "current"} onClick={() => setFilter("current")}>Current cycle</FilterPill>
              <FilterPill active={filter === "operational"} onClick={() => setFilter("operational")}>Operational</FilterPill>
              <FilterPill active={filter === "discretionary"} onClick={() => setFilter("discretionary")}>Discretionary</FilterPill>
              <FilterPill active={filter === "long"} onClick={() => setFilter("long")}>Long-term</FilterPill>
            </div>
          </div>
        ) : null}

        {state.view !== "today" ? (
          <div className="space-y-4">
            {visibleBuckets.map((bucket, index) => <BucketCard key={bucket.id} bucket={bucket} refDate={now} draftValue={state.drafts[bucket.id] || ""} onDraftChange={(e) => setState((prev) => ({ ...prev, drafts: { ...prev.drafts, [bucket.id]: e.target.value } }))} onAssign={() => assign(bucket.id)} onPullBack={() => pullBack(bucket.id)} onPatch={(patch) => patchBucket(bucket.id, patch)} onMoveUp={() => moveBucket(bucket.id, "up")} onMoveDown={() => moveBucket(bucket.id, "down")} onAdvancePhase={() => { if (bucket.saved < targetOf(bucket) || bucket.phaseIndex >= bucket.phases.length - 1) return; updateBuckets((buckets) => buckets.map((item) => item.id === bucket.id ? { ...item, phaseIndex: item.phaseIndex + 1 } : item)); log(`${bucket.name} advanced to ${bucket.phases[bucket.phaseIndex + 1].label}.`); }} onAddPhase={() => updateBuckets((buckets) => buckets.map((item) => item.id === bucket.id ? { ...item, phases: [...item.phases, makePhase(makeId("phase"), `Phase ${item.phases.length + 1}`, targetOf(item))] } : item))} onUpdatePhase={(phaseId, patch) => updateBuckets((buckets) => buckets.map((item) => item.id !== bucket.id ? item : { ...item, phases: item.phases.map((phase) => phase.id === phaseId ? { ...phase, ...patch, target: patch.target !== undefined ? parseMoney(patch.target) : phase.target } : phase) }))} disableMoveUp={index === 0} disableMoveDown={index === visibleBuckets.length - 1} />)}
            {!visibleBuckets.length ? <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/62 p-6 text-sm text-zinc-400">No buckets match that filter right now.</div> : null}
          </div>
        ) : null}

        {archivedBuckets.length ? (
          <div className="mt-8">
            <SectionShell title="Archived buckets" sub="Retired buckets stay available without cluttering the main stack.">
              <div className="space-y-3">
                {archivedBuckets.map((bucket) => <div key={bucket.id} className={cls("rounded-[24px] border p-4", TONES[bucket.tone])}><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-50">{bucket.name}</div><div className="mt-1 text-sm text-zinc-400">{bucket.note} | Saved {formatMoney(bucket.saved)} | {horizonLabel(bucket.horizon)} | {labelOf(bucket)}</div></div><ActionButton onClick={() => patchBucket(bucket.id, { archived: false })}>Restore</ActionButton></div></div>)}
              </div>
            </SectionShell>
          </div>
        ) : null}

        <div className="mt-8">
          <SectionShell title="History" sub="Tiny human log, not accountant theater." right={<TonePill tone="zinc">{state.history.length} entries</TonePill>}>
            <div className="space-y-2">
              {state.history.length ? state.history.map((entry) => <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="text-xs text-zinc-500">{formatStamp(entry.ts)}</div><div className="mt-1 text-sm text-zinc-200">{entry.text}</div></div>) : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">No history yet. Start by adding money or assigning a dollar.</div>}
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
