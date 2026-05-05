import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "joey-fidelity-pie-planner-v1";
const DEFAULT_TOTAL = 302.96;
const SLICE_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
  "#4ade80",
  "#f97316",
  "#facc15",
];

type Slice = {
  id: string;
  name: string;
  amount: number;
  color: string;
};

type PlannerState = {
  version: number;
  total: number;
  sections: Slice[];
  updatedAt?: string;
};

function makeId(prefix = "slice") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseMoney(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatStamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

function nextColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

function normalizeState(raw: Partial<PlannerState> | null | undefined): PlannerState {
  const total = parseMoney(raw?.total ?? DEFAULT_TOTAL);
  const incoming = Array.isArray(raw?.sections) ? raw?.sections : [];
  const sections = incoming.map((section, index) => ({
    id: section.id || makeId("slice"),
    name: section.name || `Section ${index + 1}`,
    amount: parseMoney(section.amount ?? 0),
    color: typeof section.color === "string" && section.color ? section.color : nextColor(index),
  }));

  return {
    version: 1,
    total,
    sections,
    updatedAt: raw?.updatedAt,
  };
}

const INITIAL_STATE: PlannerState = normalizeState({
  version: 1,
  total: DEFAULT_TOTAL,
  sections: [
    { id: makeId("slice"), name: "Core", amount: 150, color: nextColor(0) },
    { id: makeId("slice"), name: "Buffer", amount: 75, color: nextColor(1) },
  ],
});

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function MoneyInput({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/90 px-3 py-2.5 text-sm text-zinc-300 shadow-inner shadow-black/20">
      <span className="text-zinc-500">$</span>
      <input
        value={focused ? draft : value}
        onFocus={() => {
          setFocused(true);
          setDraft(value);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e);
        }}
        inputMode="decimal"
        className="w-full bg-transparent text-right text-zinc-100 outline-none placeholder:text-zinc-600"
      />
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
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

function StatCard({ title, value, sub, tone = "zinc" }: { title: string; value: string; sub?: string; tone?: "zinc" | "cyan" | "emerald" | "amber" | "rose" }) {
  const tones = {
    zinc: "border-zinc-800 bg-zinc-950/70",
    cyan: "border-cyan-900/70 bg-cyan-950/35",
    emerald: "border-emerald-900/70 bg-emerald-950/35",
    amber: "border-amber-900/70 bg-amber-950/35",
    rose: "border-rose-900/70 bg-rose-950/35",
  };

  return (
    <div className={cls("rounded-[28px] border p-5 shadow-xl shadow-black/10", tones[tone])}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{title}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">{value}</div>
      {sub ? <div className="mt-2 text-sm leading-6 text-zinc-400">{sub}</div> : null}
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

function DonutChart({ total, sections }: { total: number; sections: Slice[] }) {
  const positiveSections = sections.filter((section) => section.amount > 0);
  const allocated = positiveSections.reduce((sum, section) => sum + section.amount, 0);
  const remaining = Math.max(0, total - allocated);
  const chartTotal = Math.max(total, allocated, 0);
  const radius = 74;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    ...positiveSections.map((section) => ({
      id: section.id,
      label: section.name,
      value: section.amount,
      color: section.color,
    })),
    ...(remaining > 0
      ? [
          {
            id: "remaining",
            label: "Remaining",
            value: remaining,
            color: "#27272a",
          },
        ]
      : []),
  ];

  let accumulated = 0;

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="relative mx-auto h-[220px] w-[220px] shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="24" />
          {chartTotal > 0
            ? segments.map((segment) => {
                const dash = (segment.value / chartTotal) * circumference;
                const offset = (accumulated / chartTotal) * circumference;
                accumulated += segment.value;

                return (
                  <circle
                    key={segment.id}
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="24"
                    strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                    transform="rotate(-90 90 90)"
                  />
                );
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Allocated</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{formatMoney(allocated)}</div>
          <div className="mt-1 text-sm text-zinc-400">of {formatMoney(total)}</div>
        </div>
      </div>

      <div className="w-full space-y-2">
        {segments.length ? (
          segments.map((segment) => {
            const percent = chartTotal > 0 ? (segment.value / chartTotal) * 100 : 0;
            return (
              <div key={segment.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{segment.label}</div>
                    <div className="text-xs text-zinc-500">{formatPercent(percent)}</div>
                  </div>
                </div>
                <div className="text-sm font-medium text-zinc-100">{formatMoney(segment.value)}</div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 px-4 py-6 text-sm text-zinc-400">
            No positive sections yet. Add one below and the chart will wake up.
          </div>
        )}
      </div>
    </div>
  );
}

function SliceRow({
  section,
  total,
  onChange,
  onDelete,
}: {
  section: Slice;
  total: number;
  onChange: (patch: Partial<Slice>) => void;
  onDelete: () => void;
}) {
  const percent = total > 0 ? (section.amount / total) * 100 : 0;

  return (
    <div className="rounded-[26px] border border-zinc-800 bg-zinc-950/60 p-4 shadow-inner shadow-black/15">
      <div className="grid gap-3 xl:grid-cols-[auto_1.3fr_220px_auto_auto] xl:items-center">
        <div className="flex justify-center xl:justify-start">
          <input
            type="color"
            value={section.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-12 w-12 cursor-pointer rounded-2xl border border-zinc-700 bg-transparent p-1"
            aria-label={`${section.name} color`}
          />
        </div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section name</div>
          <input
            value={section.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/90 px-4 py-3 text-sm text-zinc-100 outline-none"
            placeholder="Rent, buffer, gas, whatever"
          />
        </div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Amount</div>
          <MoneyInput value={String(section.amount)} onChange={(e) => onChange({ amount: parseMoney(e.target.value) })} />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Percent</div>
          <div className="mt-1 text-sm font-medium text-zinc-100">{formatPercent(percent)}</div>
        </div>

        <div className="flex justify-end xl:justify-center">
          <ActionButton onClick={onDelete} variant="ghost" className="px-3">Delete</ActionButton>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<PlannerState>(INITIAL_STATE);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      setState(normalizeState(JSON.parse(raw) as Partial<PlannerState>));
    } catch {
      // ignore bad local storage
    }
  }, []);

  useEffect(() => {
    const updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt }));
  }, [state]);

  const allocated = useMemo(() => state.sections.reduce((sum, section) => sum + section.amount, 0), [state.sections]);
  const remaining = useMemo(() => Number((state.total - allocated).toFixed(2)), [state.total, allocated]);
  const overAllocated = remaining < 0;

  const updateSection = (id: string, patch: Partial<Slice>) => {
    setState((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    }));
  };

  const addSection = () => {
    setState((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: makeId("slice"),
          name: `Section ${prev.sections.length + 1}`,
          amount: 0,
          color: nextColor(prev.sections.length),
        },
      ],
    }));
  };

  const deleteSection = (id: string) => {
    setState((prev) => ({
      ...prev,
      sections: prev.sections.filter((section) => section.id !== id),
    }));
  };

  const exportState = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    const payload = JSON.stringify({ ...state, version: 1, updatedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fidelity-pie-planner_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<PlannerState>;
        setState(normalizeState(parsed));
      } catch {
        alert("That JSON file could not be read.");
      }
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  const resetPlanner = () => {
    setState(INITIAL_STATE);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950 pb-16 text-zinc-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%)]" />
        <div className="absolute left-[-12%] top-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-16 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl p-4 md:p-8">
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importState} />

        <div className="mb-8 grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="relative overflow-hidden rounded-[36px] border border-zinc-800 bg-zinc-900/72 p-6 shadow-2xl shadow-black/25 backdrop-blur-sm md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%)]" />
            <div className="relative">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">Fidelity pie planner</span>
                <span className="rounded-full border border-cyan-900/70 bg-cyan-950/35 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100">Manual allocator</span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">Save / export / import</span>
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-5xl">See Fidelity as editable pieces.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                A simple visual allocator: set the account total, make manual slices, create new sections, and keep a clean JSON backup for moving between devices.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-[260px_auto]">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Fidelity total</div>
                  <MoneyInput value={String(state.total)} onChange={(e) => setState((prev) => ({ ...prev, total: parseMoney(e.target.value) }))} />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <ActionButton onClick={addSection} variant="primary">Add section</ActionButton>
                  <ActionButton onClick={exportState}>Export JSON</ActionButton>
                  <ActionButton onClick={() => fileRef.current?.click()}>Import JSON</ActionButton>
                  <ActionButton onClick={resetPlanner} variant="ghost">Reset</ActionButton>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <StatCard title="Total account" value={formatMoney(state.total)} sub="Manual top-line Fidelity amount." tone="cyan" />
            <StatCard title="Allocated" value={formatMoney(allocated)} sub={`${state.sections.length} section${state.sections.length === 1 ? "" : "s"}.`} tone="emerald" />
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard title="Remaining" value={formatMoney(Math.max(0, remaining))} sub={overAllocated ? "You are over the total." : "Still unassigned."} tone={overAllocated ? "amber" : "zinc"} />
          <StatCard title="Last local save" value={formatStamp(state.updatedAt)} sub="Auto-saved in this browser." tone="zinc" />
          <StatCard title="Status" value={overAllocated ? "Over" : "Balanced"} sub={overAllocated ? `${formatMoney(Math.abs(remaining))} over total.` : `${formatMoney(Math.max(0, remaining))} left to place.`} tone={overAllocated ? "rose" : "emerald"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionShell title="Visual split" sub="The chart is based on your manual amounts. Unassigned remainder is shown automatically when there is room left.">
            <DonutChart total={state.total} sections={state.sections} />
          </SectionShell>

          <SectionShell title="Sections" sub="Each section is fully manual: name, amount, and color.">
            <div className="space-y-3">
              {state.sections.length ? (
                state.sections.map((section) => (
                  <SliceRow
                    key={section.id}
                    section={section}
                    total={state.total}
                    onChange={(patch) => updateSection(section.id, patch)}
                    onDelete={() => deleteSection(section.id)}
                  />
                ))
              ) : (
                <div className="rounded-[26px] border border-dashed border-zinc-800 bg-zinc-950/60 p-8 text-sm text-zinc-400">
                  No sections yet. Tap <span className="text-zinc-200">Add section</span> and build the split you want.
                </div>
              )}
            </div>
          </SectionShell>
        </div>
      </div>
    </div>
  );
}
