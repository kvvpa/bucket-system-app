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

type MobileTab = "chart" | "edit" | "tools";

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
        "rounded-2xl border px-3 py-2.5 text-sm font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

function MiniStat({ title, value, tone = "zinc" }: { title: string; value: string; tone?: "zinc" | "cyan" | "emerald" | "amber" | "rose" }) {
  const tones = {
    zinc: "border-zinc-800 bg-zinc-950/70",
    cyan: "border-cyan-900/70 bg-cyan-950/35",
    emerald: "border-emerald-900/70 bg-emerald-950/35",
    amber: "border-amber-900/70 bg-amber-950/35",
    rose: "border-rose-900/70 bg-rose-950/35",
  };

  return (
    <div className={cls("rounded-[22px] border px-4 py-3", tones[tone])}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{title}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">{value}</div>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        "rounded-2xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition",
        active ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-zinc-800 bg-zinc-950/70 text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

function MobileNavButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        "rounded-2xl px-3 py-3 text-xs uppercase tracking-[0.16em] transition",
        active ? "bg-zinc-100 text-zinc-950" : "border border-zinc-800 bg-zinc-900 text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

function Panel({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="relative h-full overflow-hidden rounded-[30px] border border-zinc-800/90 bg-zinc-900/68 p-4 shadow-2xl shadow-black/20 backdrop-blur-sm md:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%)]" />
      <div className="relative flex h-full flex-col">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-50">{title}</h2>
            {sub ? <p className="mt-1 text-sm leading-5 text-zinc-400">{sub}</p> : null}
          </div>
          {right}
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </section>
  );
}

function DonutChart({ total, sections, size = 186 }: { total: number; sections: Slice[]; size?: number }) {
  const positiveSections = sections.filter((section) => section.amount > 0);
  const allocated = positiveSections.reduce((sum, section) => sum + section.amount, 0);
  const remaining = Math.max(0, total - allocated);
  const chartTotal = Math.max(total, allocated, 0);
  const radius = 58;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    ...positiveSections.map((section) => ({
      id: section.id,
      value: section.amount,
      color: section.color,
    })),
    ...(remaining > 0 ? [{ id: "remaining", value: remaining, color: "#27272a" }] : []),
  ];

  let accumulated = 0;

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {chartTotal > 0
          ? segments.map((segment) => {
              const dash = (segment.value / chartTotal) * circumference;
              const offset = (accumulated / chartTotal) * circumference;
              accumulated += segment.value;

              return (
                <circle
                  key={segment.id}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                />
              );
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Allocated</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{formatMoney(allocated)}</div>
        <div className="mt-1 text-sm text-zinc-400">of {formatMoney(total)}</div>
      </div>
    </div>
  );
}

function SummaryList({ total, sections }: { total: number; sections: Slice[] }) {
  const allocated = sections.reduce((sum, section) => sum + section.amount, 0);
  const remaining = Math.max(0, total - allocated);
  const chartTotal = Math.max(total, allocated, 0);
  const top = [...sections]
    .filter((section) => section.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const hiddenCount = sections.filter((section) => section.amount > 0).length - top.length;

  const items = [
    ...top.map((section) => ({
      id: section.id,
      label: section.name,
      amount: section.amount,
      color: section.color,
      percent: chartTotal > 0 ? (section.amount / chartTotal) * 100 : 0,
    })),
    ...(remaining > 0
      ? [
          {
            id: "remaining",
            label: "Remaining",
            amount: remaining,
            color: "#27272a",
            percent: chartTotal > 0 ? (remaining / chartTotal) * 100 : 0,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            <div>
              <div className="text-sm font-medium text-zinc-100">{item.label}</div>
              <div className="text-xs text-zinc-500">{formatPercent(item.percent)}</div>
            </div>
          </div>
          <div className="text-sm font-medium text-zinc-100">{formatMoney(item.amount)}</div>
        </div>
      ))}
      {hiddenCount > 0 ? <div className="px-1 text-xs text-zinc-500">+ {hiddenCount} more section{hiddenCount === 1 ? "" : "s"}</div> : null}
    </div>
  );
}

function SliceEditor({
  section,
  total,
  index,
  count,
  onChange,
  onDelete,
  onPrev,
  onNext,
  onAdd,
}: {
  section: Slice | null;
  total: number;
  index: number;
  count: number;
  onChange: (patch: Partial<Slice>) => void;
  onDelete: () => void;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
}) {
  if (!section) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[26px] border border-dashed border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-zinc-400">
        <div>No sections yet.</div>
        <ActionButton onClick={onAdd} variant="primary">Add section</ActionButton>
      </div>
    );
  }

  const percent = total > 0 ? (section.amount / total) * 100 : 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <ActionButton onClick={onPrev} disabled={count <= 1} className="px-3">Prev</ActionButton>
        <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
          {count ? `${index + 1} / ${count}` : "0 / 0"}
        </div>
        <ActionButton onClick={onNext} disabled={count <= 1} className="px-3">Next</ActionButton>
      </div>

      <div className="flex-1 rounded-[26px] border border-zinc-800 bg-zinc-950/60 p-4 shadow-inner shadow-black/15">
        <div className="grid h-full gap-3 content-start">
          <div className="flex items-center justify-center">
            <input
              type="color"
              value={section.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-14 w-14 cursor-pointer rounded-2xl border border-zinc-700 bg-transparent p-1"
              aria-label={`${section.name} color`}
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section name</div>
            <input
              value={section.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/90 px-4 py-3 text-sm text-zinc-100 outline-none"
              placeholder="Rent, buffer, gas"
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Amount</div>
            <MoneyInput value={String(section.amount)} onChange={(e) => onChange({ amount: parseMoney(e.target.value) })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat title="Percent" value={formatPercent(percent)} />
            <MiniStat title="Value" value={formatMoney(section.amount)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton onClick={onAdd} variant="primary">Add</ActionButton>
        <ActionButton onClick={onDelete} variant="ghost">Delete</ActionButton>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<PlannerState>(INITIAL_STATE);
  const [tab, setTab] = useState<MobileTab>("chart");
  const [activeIndex, setActiveIndex] = useState(0);
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

  useEffect(() => {
    if (!state.sections.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex > state.sections.length - 1) {
      setActiveIndex(state.sections.length - 1);
    }
  }, [state.sections.length, activeIndex]);

  const allocated = useMemo(() => state.sections.reduce((sum, section) => sum + section.amount, 0), [state.sections]);
  const remaining = useMemo(() => Number((state.total - allocated).toFixed(2)), [state.total, allocated]);
  const overAllocated = remaining < 0;
  const currentSection = state.sections[activeIndex] || null;

  const updateSection = (id: string, patch: Partial<Slice>) => {
    setState((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    }));
  };

  const addSection = () => {
    setState((prev) => {
      const nextSections = [
        ...prev.sections,
        {
          id: makeId("slice"),
          name: `Section ${prev.sections.length + 1}`,
          amount: 0,
          color: nextColor(prev.sections.length),
        },
      ];
      return { ...prev, sections: nextSections };
    });
    setActiveIndex(state.sections.length);
    setTab("edit");
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
        setActiveIndex(0);
      } catch {
        alert("That JSON file could not be read.");
      }
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  const resetPlanner = () => {
    setState(INITIAL_STATE);
    setActiveIndex(0);
    setTab("chart");
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-zinc-950 text-zinc-100 md:min-h-screen md:h-auto md:overflow-x-hidden md:overflow-y-auto">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%)]" />
        <div className="absolute left-[-12%] top-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-16 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex h-full max-w-6xl flex-col p-3 md:min-h-screen md:p-6">
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importState} />

        <header className="shrink-0 rounded-[30px] border border-zinc-800 bg-zinc-900/72 p-4 shadow-2xl shadow-black/25 backdrop-blur-sm md:p-6">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">Fidelity pie planner</span>
            <span className="rounded-full border border-cyan-900/70 bg-cyan-950/35 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100">No-scroll mobile layout</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-4xl">See Fidelity as editable pieces.</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400 md:max-w-2xl">
                Total at the top. Manual slices. JSON out and back in. On phone, editing lives in tabs instead of a long scroll.
              </p>
            </div>
            <div className="hidden shrink-0 gap-2 md:flex">
              <TabButton active={tab === "chart"} onClick={() => setTab("chart")}>Chart</TabButton>
              <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>Edit</TabButton>
              <TabButton active={tab === "tools"} onClick={() => setTab("tools")}>Tools</TabButton>
            </div>
          </div>
        </header>

        <div className="mt-3 grid shrink-0 grid-cols-3 gap-2 md:mt-4 md:grid-cols-4 md:gap-3">
          <MiniStat title="Total" value={formatMoney(state.total)} tone="cyan" />
          <MiniStat title="Allocated" value={formatMoney(allocated)} tone="emerald" />
          <MiniStat title="Remaining" value={formatMoney(Math.max(0, remaining))} tone={overAllocated ? "amber" : "zinc"} />
          <div className="hidden md:block">
            <MiniStat title="Status" value={overAllocated ? "Over" : "Balanced"} tone={overAllocated ? "rose" : "emerald"} />
          </div>
        </div>

        <main className="mt-3 min-h-0 flex-1 md:mt-4">
          {tab === "chart" ? (
            <Panel title="Visual split" sub="Top slices plus automatic remaining.">
              <div className="flex h-full flex-col justify-between gap-4 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center justify-center">
                  <DonutChart total={state.total} sections={state.sections} size={190} />
                </div>
                <div className="min-h-0 flex-1">
                  <SummaryList total={state.total} sections={state.sections} />
                </div>
              </div>
            </Panel>
          ) : null}

          {tab === "edit" ? (
            <Panel
              title="Edit sections"
              sub="One section at a time so phone stays on one screen."
              right={<div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-zinc-400">{state.sections.length} total</div>}
            >
              <SliceEditor
                section={currentSection}
                total={state.total}
                index={activeIndex}
                count={state.sections.length}
                onChange={(patch) => currentSection && updateSection(currentSection.id, patch)}
                onDelete={() => currentSection && deleteSection(currentSection.id)}
                onPrev={() => setActiveIndex((prev) => (state.sections.length ? (prev - 1 + state.sections.length) % state.sections.length : 0))}
                onNext={() => setActiveIndex((prev) => (state.sections.length ? (prev + 1) % state.sections.length : 0))}
                onAdd={addSection}
              />
            </Panel>
          ) : null}

          {tab === "tools" ? (
            <Panel title="Tools" sub="Set the top-line amount and move JSON between devices.">
              <div className="grid h-full content-start gap-3">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Fidelity total</div>
                  <MoneyInput value={String(state.total)} onChange={(e) => setState((prev) => ({ ...prev, total: parseMoney(e.target.value) }))} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ActionButton onClick={addSection} variant="primary">Add section</ActionButton>
                  <ActionButton onClick={exportState}>Export JSON</ActionButton>
                  <ActionButton onClick={() => fileRef.current?.click()}>Import JSON</ActionButton>
                  <ActionButton onClick={resetPlanner} variant="ghost">Reset</ActionButton>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <MiniStat title="Sections" value={String(state.sections.length)} />
                  <MiniStat title="Status" value={overAllocated ? "Over" : "Balanced"} tone={overAllocated ? "rose" : "emerald"} />
                </div>

                <div className="rounded-[24px] border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Last local save</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-300">{formatStamp(state.updatedAt)}</div>
                </div>
              </div>
            </Panel>
          ) : null}
        </main>

        <nav className="mt-3 grid shrink-0 grid-cols-3 gap-2 md:hidden">
          <MobileNavButton active={tab === "chart"} onClick={() => setTab("chart")}>Chart</MobileNavButton>
          <MobileNavButton active={tab === "edit"} onClick={() => setTab("edit")}>Edit</MobileNavButton>
          <MobileNavButton active={tab === "tools"} onClick={() => setTab("tools")}>Tools</MobileNavButton>
        </nav>
      </div>
    </div>
  );
}
