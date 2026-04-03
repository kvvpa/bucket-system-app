import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "joey-bucket-board-v8";

const PRESETS = [
  { label: "Baseline", amount: 1300 },
  { label: "Smallish", amount: 1254.5 },
  { label: "Tight", amount: 1100 },
  { label: "$1700 gross est", amount: 1254.5 },
];

const TONES = {
  sky: "border-sky-900/70 bg-sky-950/25",
  rose: "border-rose-900/70 bg-rose-950/25",
  amber: "border-amber-900/70 bg-amber-950/25",
  emerald: "border-emerald-900/70 bg-emerald-950/25",
  zinc: "border-zinc-800 bg-zinc-950/60",
  violet: "border-violet-900/70 bg-violet-950/25",
  fuchsia: "border-fuchsia-900/70 bg-fuchsia-950/25",
  cyan: "border-cyan-900/70 bg-cyan-950/25",
};

function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makePhase(id: string, label: string, target: number) {
  return { id, label, target };
}

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
  view: "board" | "concert";
  buckets: Bucket[];
  drafts: Record<string, string>;
  shows: ShowPlan[];
  history: { id: string; text: string; ts: string }[];
  lastSavedAt?: string;
};

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
  },
];

const INITIAL_STATE: AppState = {
  paycheck: 1300,
  unassigned: 0,
  view: "board",
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

function Stat({ title, value, sub, tone = "zinc" }: { title: string; value: string; sub?: string; tone?: keyof typeof TONES }) {
  return (
    <div className={`rounded-2xl border p-4 ${TONES[tone]}`}>
      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-50">{value}</div>
      {sub ? <div className="mt-2 text-sm text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-300">{children}</span>;
}

function MoneyInput({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
      <span>$</span>
      <input className="w-full bg-transparent text-right text-zinc-100 outline-none" value={value} onChange={onChange} inputMode="decimal" />
    </div>
  );
}

function BucketCard(props: {
  bucket: Bucket;
  draftValue: string;
  onDraftChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAssign: () => void;
  onPullBack: () => void;
  onRename: (name: string) => void;
  onToggleLock: () => void;
  onArchiveToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAdvancePhase: () => void;
  onAddPhase: () => void;
  onUpdatePhase: (phaseId: string, patch: Partial<Phase>) => void;
  disableMoveUp: boolean;
  disableMoveDown: boolean;
}) {
  const { bucket, draftValue, onDraftChange, onAssign, onPullBack, onRename, onToggleLock, onArchiveToggle, onMoveUp, onMoveDown, onAdvancePhase, onAddPhase, onUpdatePhase, disableMoveUp, disableMoveDown } = props;
  const target = targetOf(bucket);
  const remaining = Math.max(0, target - bucket.saved);
  const pct = progress(bucket.saved, target);
  const funded = bucket.saved >= target && target > 0;
  const canAdvance = bucket.phaseIndex < bucket.phases.length - 1;

  return (
    <div className={`rounded-3xl border p-5 ${TONES[bucket.tone]}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            <Pill>{labelOf(bucket)}</Pill>
            {funded ? <Pill>Funded</Pill> : null}
            {bucket.locked ? <Pill>Locked</Pill> : null}
            {bucket.archived ? <Pill>Archived</Pill> : null}
          </div>
          <input value={bucket.name} onChange={(e) => onRename(e.target.value)} className="w-full bg-transparent text-lg font-semibold text-zinc-50 outline-none" />
          <p className="mt-1 text-sm leading-6 text-zinc-400">{bucket.note}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[260px] lg:grid-cols-1">
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Saved</div>
            <div className="text-2xl font-semibold text-zinc-50">{formatMoney(bucket.saved)}</div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Target</div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-right text-sm text-zinc-100">{formatMoney(target)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
          <span>{pct.toFixed(0)}% built</span>
          <span>{formatMoney(remaining)} to go</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
          <div className="h-full rounded-full bg-zinc-100 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto]">
        <MoneyInput value={draftValue} onChange={onDraftChange} />
        <button onClick={onAssign} className="rounded-2xl border border-zinc-700 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">Assign</button>
        <button onClick={onPullBack} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">Pull back</button>
        <button onClick={onToggleLock} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">{bucket.locked ? "Unlock" : "Lock"}</button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onMoveUp} disabled={disableMoveUp} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40">Up</button>
          <button onClick={onMoveDown} disabled={disableMoveDown} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40">Down</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button onClick={onAdvancePhase} disabled={!funded || !canAdvance} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 disabled:opacity-40">Advance phase</button>
        <button onClick={onArchiveToggle} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">{bucket.archived ? "Restore" : "Archive"}</button>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">Phases</div>
            <div className="mt-1 text-xs text-zinc-400">Saved dollars stay. Targets evolve.</div>
          </div>
          <button onClick={onAddPhase} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500">Add phase</button>
        </div>
        <div className="space-y-2">
          {bucket.phases.map((phase, index) => {
            const active = index === bucket.phaseIndex;
            return (
              <div key={phase.id} className={`grid gap-2 rounded-2xl border p-3 md:grid-cols-[1fr_180px] ${active ? "border-zinc-100 bg-zinc-900/90" : "border-zinc-800 bg-zinc-950/70"}`}>
                <input value={phase.label} onChange={(e) => onUpdatePhase(phase.id, { label: e.target.value })} className="bg-transparent text-sm text-zinc-100 outline-none" />
                <MoneyInput value={String(phase.target)} onChange={(e) => onUpdatePhase(phase.id, { target: parseMoney(e.target.value) })} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShowCard(props: {
  show: ShowPlan;
  concertPool: number;
  onUpdate: (patch: Partial<ShowPlan>) => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { show, concertPool, onUpdate, onDuplicate, onToggleActive, onDelete } = props;
  const total = showTotal(show);
  const needed = showNeeded(show);
  const ready = concertPool >= needed;
  const pct = total > 0 ? Math.min(100, (concertPool / total) * 100) : 0;

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill>{show.active ? "Active" : "Inactive"}</Pill>
        <Pill>{show.bought ? "Ticket bought" : "Ticket needed"}</Pill>
        <Pill>{ready ? "Can happen now" : "Needs more money"}</Pill>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Show name</div>
          <input value={show.name} onChange={(e) => onUpdate({ name: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="Currents / ERRA / etc" />
        </label>
        <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Venue</div>
          <input value={show.venue} onChange={(e) => onUpdate({ venue: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="El Corazon / etc" />
        </label>
        <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Date</div>
          <input type="date" value={show.date} onChange={(e) => onUpdate({ date: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" />
        </label>
        <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Notes</div>
          <input value={show.notes} onChange={(e) => onUpdate({ notes: e.target.value })} className="w-full bg-transparent text-zinc-100 outline-none" placeholder="Two tickets? parking? no merch?" />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Ticket</div>
          <MoneyInput value={String(show.ticket)} onChange={(e) => onUpdate({ ticket: parseMoney(e.target.value) })} />
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Travel</div>
          <MoneyInput value={String(show.travel)} onChange={(e) => onUpdate({ travel: parseMoney(e.target.value) })} />
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Misc</div>
          <MoneyInput value={String(show.misc)} onChange={(e) => onUpdate({ misc: parseMoney(e.target.value) })} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => onUpdate({ bought: !show.bought })} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">{show.bought ? "Mark ticket needed" : "Mark ticket bought"}</button>
        <button onClick={onToggleActive} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">{show.active ? "Set inactive" : "Set active"}</button>
        <button onClick={onDuplicate} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">Duplicate</button>
        <button onClick={onDelete} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">Delete</button>
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
        <div className="h-3 overflow-hidden rounded-full bg-zinc-950">
          <div className="h-full rounded-full bg-zinc-100 transition-all" style={{ width: `${pct}%` }} />
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
      const parsed = JSON.parse(raw) as AppState;
      setState({ ...INITIAL_STATE, ...parsed });
    } catch {
      // ignore bad local storage
    }
  }, []);

  useEffect(() => {
    const ts = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: ts }));
  }, [state]);

  const visibleBuckets = useMemo(
    () => state.buckets.filter((bucket) => !bucket.archived && (state.view === "concert" ? ["joy", "show"].includes(bucket.id) : true)),
    [state.buckets, state.view]
  );
  const archivedBuckets = useMemo(() => state.buckets.filter((bucket) => bucket.archived), [state.buckets]);
  const totalSaved = useMemo(() => state.buckets.reduce((sum, bucket) => sum + bucket.saved, 0), [state.buckets]);
  const totalTargets = useMemo(() => state.buckets.reduce((sum, bucket) => sum + targetOf(bucket), 0), [state.buckets]);
  const totalNeeded = useMemo(() => state.buckets.reduce((sum, bucket) => sum + Math.max(0, targetOf(bucket) - bucket.saved), 0), [state.buckets]);
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
    const sorted = [...next].sort((a, b) => targetOf(a) - targetOf(b));
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
        const parsed = JSON.parse(String(reader.result)) as AppState;
        setState({ ...INITIAL_STATE, ...parsed });
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importBackup} />

        <div className="mb-8 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Bucket system</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Let the dollars live somewhere.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">Clean working version. Core buckets, phases, history, import/export, and a real show planner.</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-zinc-300">
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5">Runs in one file</span>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5">Import / export</span>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5">Show planner</span>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5">Mobile friendly</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Stat title="Unassigned cash" value={formatMoney(state.unassigned)} sub="Money not yet told what job it has." tone="cyan" />
            <Stat title="Total saved in buckets" value={formatMoney(totalSaved)} sub={`${state.buckets.filter((bucket) => bucket.saved >= targetOf(bucket)).length} funded buckets.`} tone="emerald" />
          </div>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_1fr_auto]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="mb-3 text-sm text-zinc-400">When money lands, drop it into unassigned first.</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button key={preset.label} onClick={() => setState((prev) => ({ ...prev, paycheck: preset.amount }))} className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <MoneyInput value={String(state.paycheck)} onChange={(e) => setState((prev) => ({ ...prev, paycheck: parseMoney(e.target.value) }))} />
              <button onClick={addToUnassigned} className="rounded-2xl border border-zinc-700 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">Add to unassigned</button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={autoFill} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-500">Auto-fill</button>
              <button onClick={exportBackup} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-500">Export</button>
              <button onClick={() => fileRef.current?.click()} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-500">Import</button>
              <button onClick={() => setState((prev) => ({ ...prev, view: prev.view === "board" ? "concert" : "board" }))} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-500">
                {state.view === "board" ? "Concert mode" : "Full board"}
              </button>
            </div>
            <div className="mt-3 text-xs text-zinc-400">Last local save: {formatStamp(state.lastSavedAt)}</div>
          </div>

          <button onClick={() => setState(INITIAL_STATE)} className="rounded-3xl border border-zinc-800 bg-zinc-900/70 px-5 py-4 text-sm text-zinc-300 hover:border-zinc-600">Reset</button>
        </div>

        {state.view === "concert" ? (
          <div className="mb-6 space-y-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-50">Concert mode</h2>
                  <p className="mt-1 text-sm text-zinc-400">Show Fund + Small Joy + unassigned = concert-ready pool.</p>
                </div>
                <button onClick={() => { updateShows((shows) => [makeShow({ name: "New Show" }), ...shows]); log("Added new show card."); }} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">Add show</button>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <Stat title="Show Fund" value={formatMoney(showFund)} tone="fuchsia" />
                <Stat title="Small Joy" value={formatMoney(smallJoy)} tone="violet" />
                <Stat title="Concert-ready pool" value={formatMoney(concertPool)} tone="sky" />
                <Stat title="Active shows" value={String(activeShows.length)} sub={activeShows[0] ? `${activeShows[0].name || "Untitled"} needs ${formatMoney(showNeeded(activeShows[0]))}` : "No active shows."} tone="amber" />
              </div>
            </div>

            {activeShows.map((show) => (
              <ShowCard
                key={show.id}
                show={show}
                concertPool={concertPool}
                onUpdate={(patch) => updateShows((shows) => shows.map((item) => (item.id === show.id ? { ...item, ...patch } : item)))}
                onDuplicate={() => { updateShows((shows) => [makeShow({ ...show, name: `${show.name || "Show"} copy` }), ...shows]); log(`Duplicated ${show.name || "show"}.`); }}
                onToggleActive={() => { updateShows((shows) => shows.map((item) => (item.id === show.id ? { ...item, active: !item.active } : item))); log(`${show.name || "Show"} marked ${show.active ? "inactive" : "active"}.`); }}
                onDelete={() => { updateShows((shows) => shows.filter((item) => item.id !== show.id)); log(`Deleted ${show.name || "show"}.`); }}
              />
            ))}

            {inactiveShows.length ? (
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
                <div className="mb-4 text-lg font-semibold text-zinc-50">Inactive shows</div>
                <div className="space-y-3">
                  {inactiveShows.map((show) => (
                    <div key={show.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-50">{show.name || "Untitled show"}</div>
                          <div className="mt-1 text-sm text-zinc-400">{show.date || "No date"} {show.venue ? `| ${show.venue}` : ""} | Needs {formatMoney(showNeeded(show))}</div>
                        </div>
                        <button onClick={() => updateShows((shows) => shows.map((item) => (item.id === show.id ? { ...item, active: true } : item)))} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">Reactivate</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Stat title="Total bucket targets" value={formatMoney(totalTargets)} sub="Current phase targets." tone="zinc" />
          <Stat title="Still needed" value={formatMoney(totalNeeded)} sub="Remaining across active buckets." tone="amber" />
          <Stat title="Archived buckets" value={String(archivedBuckets.length)} sub="Retired without disappearing." tone="violet" />
          <Stat title="How to use" value="Add -> assign -> watch" sub="Buckets are labels. Rails are real." tone="sky" />
        </div>

        <div className="space-y-4">
          {visibleBuckets.map((bucket, index) => (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              draftValue={state.drafts[bucket.id] || ""}
              onDraftChange={(e) => setState((prev) => ({ ...prev, drafts: { ...prev.drafts, [bucket.id]: e.target.value } }))}
              onAssign={() => assign(bucket.id)}
              onPullBack={() => pullBack(bucket.id)}
              onRename={(name) => updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, name } : item)))}
              onToggleLock={() => updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, locked: !item.locked } : item)))}
              onArchiveToggle={() => updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, archived: !item.archived } : item)))}
              onMoveUp={() => moveBucket(bucket.id, "up")}
              onMoveDown={() => moveBucket(bucket.id, "down")}
              onAdvancePhase={() => {
                if (bucket.saved < targetOf(bucket) || bucket.phaseIndex >= bucket.phases.length - 1) return;
                updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, phaseIndex: item.phaseIndex + 1 } : item)));
                log(`${bucket.name} advanced to ${bucket.phases[bucket.phaseIndex + 1].label}.`);
              }}
              onAddPhase={() => updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, phases: [...item.phases, makePhase(makeId("phase"), `Phase ${item.phases.length + 1}`, targetOf(item))] } : item)))}
              onUpdatePhase={(phaseId, patch) => updateBuckets((buckets) => buckets.map((item) => item.id !== bucket.id ? item : { ...item, phases: item.phases.map((phase) => phase.id === phaseId ? { ...phase, ...patch, target: patch.target !== undefined ? parseMoney(patch.target) : phase.target } : phase) }))}
              disableMoveUp={index === 0}
              disableMoveDown={index === visibleBuckets.length - 1}
            />
          ))}
        </div>

        {archivedBuckets.length ? (
          <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="mb-4 text-lg font-semibold text-zinc-50">Archived buckets</div>
            <div className="space-y-3">
              {archivedBuckets.map((bucket) => (
                <div key={bucket.id} className={`rounded-2xl border p-4 ${TONES[bucket.tone]}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-50">{bucket.name}</div>
                      <div className="mt-1 text-sm text-zinc-400">Saved {formatMoney(bucket.saved)} | {labelOf(bucket)}</div>
                    </div>
                    <button onClick={() => updateBuckets((buckets) => buckets.map((item) => (item.id === bucket.id ? { ...item, archived: false } : item)))} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">Restore</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-50">History</h2>
              <p className="mt-1 text-sm text-zinc-400">Tiny human log, not accountant theater.</p>
            </div>
            <Pill>{state.history.length} entries</Pill>
          </div>
          <div className="space-y-2">
            {state.history.length ? (
              state.history.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="text-xs text-zinc-500">{formatStamp(entry.ts)}</div>
                  <div className="mt-1 text-sm text-zinc-200">{entry.text}</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">No history yet. Start by adding money or assigning a dollar.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
