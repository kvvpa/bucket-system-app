import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "slice-board-v1";
const LEGACY_STORAGE_KEYS = ["joey-fidelity-pie-planner-v1"];
const CURRENT_DEFAULT_TOTAL = 0;
const NEXT_DEFAULT_TOTAL = 0;
const SLICE_COLORS = [
  "#d6b15e",
  "#c77743",
  "#8a5b3c",
  "#b98a52",
  "#a66738",
  "#6b4b36",
  "#e1c681",
  "#4f4038",
  "#c39a58",
  "#9d7144",
];

type ToppingKind = "cheese" | "pepperoni" | "basil" | "mushroom" | "olive" | "pepper" | "onion";

const TOPPING_OPTIONS: Array<{ value: ToppingKind; label: string }> = [
  { value: "cheese", label: "Cheese" },
  { value: "pepperoni", label: "Pepperoni" },
  { value: "basil", label: "Basil" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "pepper", label: "Pepper" },
  { value: "onion", label: "Onion" },
];

function normalizeTopping(value: unknown, index: number): ToppingKind {
  const fallback = TOPPING_OPTIONS[index % TOPPING_OPTIONS.length].value;
  return TOPPING_OPTIONS.some((option) => option.value === value) ? (value as ToppingKind) : fallback;
}

type Slice = {
  id: string;
  name: string;
  amount: number;
  color: string;
  topping?: ToppingKind;
};

type PiePlan = {
  total: number;
  sections: Slice[];
};

type AppState = {
  version: number;
  current: PiePlan;
  next: PiePlan;
  nextEnabled: boolean;
  updatedAt?: string;
};

type LegacyPlannerState = {
  version?: number;
  total?: number;
  sections?: Slice[];
  updatedAt?: string;
};

type MobileTab = "chart" | "edit" | "tools";
type PlanKey = "current" | "next";
type AmountAction = "set" | "add" | "subtract";

type ChartSegment = {
  id: string;
  label: string;
  value: number;
  amount: number;
  color: string;
  topping: ToppingKind;
};

type ChartState = {
  segments: ChartSegment[];
  allocated: number;
  remaining: number;
  chartTotal: number;
  template: boolean;
};

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

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

function cloneSections(sections: Slice[]): Slice[] {
  return sections.map((section) => ({ ...section, id: makeId("slice") }));
}

function starterSections(): Slice[] {
  return [
    { id: makeId("slice"), name: "Emergency Fund", amount: 0, color: nextColor(0), topping: "pepperoni" },
    { id: makeId("slice"), name: "Unassigned", amount: 0, color: nextColor(2), topping: "cheese" },
  ];
}

function normalizePlan(raw: Partial<PiePlan> | null | undefined, fallbackTotal: number): PiePlan {
  const total = parseMoney(raw?.total ?? fallbackTotal);
  const incoming = Array.isArray(raw?.sections) ? raw.sections : [];
  const sections = incoming.map((section, index) => ({
    id: section.id || makeId("slice"),
    name: section.name || `Section ${index + 1}`,
    amount: parseMoney(section.amount ?? 0),
    color: typeof section.color === "string" && section.color ? section.color : nextColor(index),
    topping: normalizeTopping((section as Partial<Slice>).topping, index),
  }));

  return { total, sections };
}

function defaultCurrentPlan(): PiePlan {
  return normalizePlan({ total: CURRENT_DEFAULT_TOTAL, sections: starterSections() }, CURRENT_DEFAULT_TOTAL);
}

function defaultNextPlan(): PiePlan {
  return normalizePlan({ total: NEXT_DEFAULT_TOTAL, sections: starterSections() }, NEXT_DEFAULT_TOTAL);
}

function makeFreshState(): AppState {
  return {
    version: 8,
    current: defaultCurrentPlan(),
    next: defaultNextPlan(),
    nextEnabled: true,
  };
}

function normalizeAppState(raw: Partial<AppState> | LegacyPlannerState | null | undefined): AppState {
  const hasDualPlans = Boolean(raw && typeof raw === "object" && ("current" in raw || "next" in raw));

  if (hasDualPlans) {
    const typed = raw as Partial<AppState>;
    return {
      version: 8,
      current: normalizePlan(typed.current, CURRENT_DEFAULT_TOTAL),
      next: normalizePlan(typed.next, NEXT_DEFAULT_TOTAL),
      nextEnabled: typed.nextEnabled ?? true,
      updatedAt: typed.updatedAt,
    };
  }

  const legacy = raw as LegacyPlannerState | null | undefined;
  return {
    version: 8,
    current: normalizePlan(legacy, CURRENT_DEFAULT_TOTAL),
    next: normalizePlan({ total: NEXT_DEFAULT_TOTAL, sections: [] }, NEXT_DEFAULT_TOTAL),
    nextEnabled: true,
    updatedAt: legacy?.updatedAt,
  };
}

function buildChartState(total: number, sections: Slice[]): ChartState {
  const positiveSections = sections.filter((section) => section.amount > 0);
  const allocated = positiveSections.reduce((sum, section) => sum + section.amount, 0);
  const remaining = Math.max(0, total - allocated);

  if (total <= 0 && allocated <= 0 && sections.length > 0) {
    return {
      segments: sections.map((section, index) => ({
        id: section.id,
        label: section.name,
        value: 1,
        amount: 0,
        color: section.color,
        topping: normalizeTopping(section.topping, index),
      })),
      allocated: 0,
      remaining: 0,
      chartTotal: sections.length,
      template: true,
    };
  }

  const segments: ChartSegment[] = [
    ...positiveSections.map((section, index) => ({
      id: section.id,
      label: section.name,
      value: section.amount,
      amount: section.amount,
      color: section.color,
      topping: normalizeTopping(section.topping, index),
    })),
    ...(remaining > 0
      ? [{ id: "remaining", label: "Remaining", value: remaining, amount: remaining, color: "#2b2724", topping: "cheese" as ToppingKind }]
      : []),
  ];

  return {
    segments,
    allocated,
    remaining,
    chartTotal: Math.max(total, allocated, 0),
    template: false,
  };
}

const INITIAL_STATE: AppState = makeFreshState();

function MoneyInput({ value, onChange, placeholder = "0" }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-zinc-950/90 px-3 py-2.5 text-sm text-zinc-300 shadow-inner shadow-black/20">
      <span className="text-amber-300/70">$</span>
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
        placeholder={placeholder}
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
    primary: "border-amber-200/70 bg-gradient-to-r from-amber-200 to-orange-200 text-zinc-950 hover:from-amber-100 hover:to-orange-100",
    secondary: "border-amber-500/25 bg-zinc-950/80 text-zinc-100 hover:border-amber-400/45 hover:bg-zinc-900",
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

function MiniStat({ title, value, tone = "zinc" }: { title: string; value: string; tone?: "zinc" | "gold" | "orange" | "rose" }) {
  const tones = {
    zinc: "border-zinc-800 bg-zinc-950/70",
    gold: "border-amber-500/25 bg-amber-950/20",
    orange: "border-orange-500/25 bg-orange-950/20",
    rose: "border-rose-500/25 bg-rose-950/20",
  };

  return (
    <div className={cls("rounded-[22px] border px-4 py-3", tones[tone])}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">{title}</div>
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
        active
          ? "border-amber-200/70 bg-gradient-to-r from-amber-100 to-orange-200 text-zinc-950"
          : "border-amber-500/20 bg-zinc-950/70 text-zinc-300"
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
        active
          ? "bg-gradient-to-r from-amber-100 to-orange-200 text-zinc-950"
          : "border border-amber-500/20 bg-zinc-900 text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

function PlanButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        "rounded-2xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition",
        active
          ? "border-amber-200 bg-amber-100 text-zinc-950"
          : "border-amber-500/20 bg-zinc-950/70 text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

function PizzaIcon({ className = "h-14 w-14" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tileGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#18181b" />
          <stop offset="100%" stopColor="#09090b" />
        </linearGradient>
        <linearGradient id="crustGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#efb45a" />
          <stop offset="100%" stopColor="#b7702f" />
        </linearGradient>
        <linearGradient id="cheeseGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffe89a" />
          <stop offset="100%" stopColor="#e4b23a" />
        </linearGradient>
        <linearGradient id="sauceGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#c64a22" />
          <stop offset="100%" stopColor="#8f2f17" />
        </linearGradient>
      </defs>

      <rect x="7" y="7" width="82" height="82" rx="18" fill="url(#tileGradient)" />
      <rect x="7" y="7" width="82" height="82" rx="18" fill="none" stroke="#d89a3e" strokeWidth="2" opacity="0.8" />

      <circle cx="48" cy="48" r="31" fill="none" stroke="url(#crustGradient)" strokeWidth="10" />
      <circle cx="48" cy="48" r="25" fill="none" stroke="url(#sauceGradient)" strokeWidth="4" opacity="0.9" />
      <circle cx="48" cy="48" r="23" fill="url(#cheeseGradient)" />

      <g stroke="#7b5225" strokeWidth="2.4" strokeLinecap="round" opacity="0.8">
        <path d="M48 25.5v10" />
        <path d="M70.5 48h-10" />
        <path d="M37.2 68.3l5-8.6" />
        <path d="M27.5 37.2l8.7 5" />
      </g>

      <circle cx="48" cy="48" r="12.5" fill="#0b0b0c" />
      <circle cx="48" cy="48" r="13.5" fill="none" stroke="#3b2a1e" strokeWidth="2" />

      <circle cx="61.5" cy="38.5" r="3.5" fill="#b63c2a" stroke="#8a281c" strokeWidth="1" />
      <circle cx="35" cy="55" r="3.1" fill="#b63c2a" stroke="#8a281c" strokeWidth="1" />
    </svg>
  );
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="relative h-full overflow-hidden rounded-[30px] border border-amber-500/15 bg-zinc-900/70 p-4 shadow-2xl shadow-black/25 backdrop-blur-sm md:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.09),transparent_60%)]" />
      <div className="relative flex h-full flex-col">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-zinc-50">{title}</h2>
          {right}
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </section>
  );
}

function polarPoint(angle: number, distance: number) {
  return {
    x: 90 + Math.cos(angle) * distance,
    y: 90 + Math.sin(angle) * distance,
  };
}

function renderPizzaTopping(kind: string, x: number, y: number, scale = 1, rotate = 0, key: string) {
  const transform = `translate(${x} ${y}) rotate(${rotate}) scale(${scale})`;

  if (kind === "cheese") {
    return (
      <g key={key} transform={transform} opacity="0.8">
        <circle cx="-4" cy="-1" r="2.3" fill="#fff3b8" />
        <circle cx="4" cy="3" r="1.8" fill="#f4c55a" />
      </g>
    );
  }

  if (kind === "basil") {
    return (
      <g key={key} transform={transform}>
        <path d="M-2 -10C5 -10 10 -5 10 1C9 8 2 12 -6 11C-11 6 -11 0 -8 -5C-6 -8 -4 -9 -2 -10Z" fill="#6ba73a" stroke="#416723" strokeWidth="1.4" />
        <path d="M-4 8C-1 3 2 -2 5 -7" fill="none" stroke="#547f33" strokeWidth="1" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "mushroom") {
    return (
      <g key={key} transform={transform}>
        <path d="M-10 -2C-6 -8 6 -8 10 -2C8 3 3 6 0 6C-3 6 -8 3 -10 -2Z" fill="#eadcc8" stroke="#a77c5d" strokeWidth="1.5" />
        <path d="M0 6V13" fill="none" stroke="#a77c5d" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "olive") {
    return (
      <g key={key} transform={transform}>
        <circle cx="-5" cy="-1" r="5" fill="#45413c" stroke="#1f1d1b" strokeWidth="1.2" />
        <circle cx="-5" cy="-1" r="2" fill="#f0d778" />
        <circle cx="6" cy="4" r="4.4" fill="#45413c" stroke="#1f1d1b" strokeWidth="1.2" />
        <circle cx="6" cy="4" r="1.7" fill="#f0d778" />
      </g>
    );
  }

  if (kind === "pepper") {
    return (
      <g key={key} transform={transform}>
        <path d="M-11 -3C-4 -11 5 -11 11 -5" fill="none" stroke="#6aa84f" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M-9 6C-2 -2 7 -2 11 3" fill="none" stroke="#6aa84f" strokeWidth="2.8" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "onion") {
    return (
      <g key={key} transform={transform}>
        <path d="M-10 3C-7 -5 6 -5 10 3" fill="none" stroke="#d7bedb" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M-5 7C-2 0 3 0 6 7" fill="none" stroke="#ead9ee" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  }

  return (
    <g key={key} transform={transform}>
      <circle cx="-4" cy="-1" r="5.2" fill="#b63c2a" stroke="#8a281c" strokeWidth="1.2" />
      <circle cx="5.5" cy="4" r="4" fill="#b63c2a" stroke="#8a281c" strokeWidth="1.1" />
      <circle cx="-4" cy="-1" r="1.2" fill="#d97766" opacity="0.65" />
      <circle cx="5.5" cy="4" r="1" fill="#d97766" opacity="0.65" />
    </g>
  );
}

function ToppingBadge({ topping }: { topping: ToppingKind }) {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="#17110d" stroke="#4a2f17" strokeWidth="2" />
      {renderPizzaTopping(topping, 20, 18, 0.95, topping === "pepperoni" ? 0 : -12, "badge")}
    </svg>
  );
}

function buildToppingPlacement(kind: ToppingKind, angle: number, span: number) {
  const count = span > Math.PI ? 6 : span > 1.6 ? 4 : span > 0.75 ? 3 : span > 0.3 ? 2 : 1;
  const spread = Math.min(span * 0.72, 2.25);
  const anchors = Array.from({ length: count }, (_, index) => {
    const centered = index - (count - 1) / 2;
    const itemAngle = angle + (count === 1 ? 0 : (centered * spread) / Math.max(1, count - 1));
    const distance = [53, 61, 56, 64, 50, 59][index % 6];
    const scale = count > 4 ? 0.72 : count > 2 ? 0.8 : 0.88;

    return {
      ...polarPoint(itemAngle, distance),
      scale,
      rotate: (itemAngle * 180) / Math.PI + 90,
    };
  });

  return { kind, anchors };
}

function DonutChart({ total, sections, size = 220 }: { total: number; sections: Slice[]; size?: number }) {
  const chart = buildChartState(total, sections);
  const radius = 56;
  const stroke = 24;
  const circumference = 2 * Math.PI * radius;
  const separatorInner = radius - stroke / 2 + 2;
  const separatorOuter = radius + stroke / 2 - 2;
  let accumulated = 0;
  let boundaryAccum = 0;

  const boundaries =
    chart.chartTotal > 0
      ? chart.segments.slice(0, -1).map((segment) => {
          boundaryAccum += segment.value;
          const angle = (boundaryAccum / chart.chartTotal) * Math.PI * 2 - Math.PI / 2;
          return {
            key: `${segment.id}-boundary`,
            x1: 90 + Math.cos(angle) * separatorInner,
            y1: 90 + Math.sin(angle) * separatorInner,
            x2: 90 + Math.cos(angle) * separatorOuter,
            y2: 90 + Math.sin(angle) * separatorOuter,
          };
        })
      : [];

  const toppingGroups =
    chart.chartTotal > 0
      ? chart.segments.map((segment, index) => {
          const start = accumulated;
          const span = (segment.value / chart.chartTotal) * Math.PI * 2;
          accumulated += segment.value;
          const midAngle = ((start + segment.value / 2) / chart.chartTotal) * Math.PI * 2 - Math.PI / 2;
          return {
            key: segment.id,
            ...buildToppingPlacement(segment.topping, midAngle, span),
          };
        })
      : [];

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <div className="absolute inset-5 rounded-full bg-amber-500/5 blur-2xl" />
      <svg viewBox="0 0 180 180" className="relative h-full w-full drop-shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
        <defs>
          <radialGradient id="crustFill" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#f2b764" />
            <stop offset="100%" stopColor="#b56f33" />
          </radialGradient>
          <linearGradient id="cheeseFill" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f7df8a" />
            <stop offset="100%" stopColor="#e4b23a" />
          </linearGradient>
          <linearGradient id="sauceRing" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#cf4e24" />
            <stop offset="100%" stopColor="#9f3117" />
          </linearGradient>
        </defs>

        <circle cx="90" cy="90" r="66" fill="none" stroke="url(#crustFill)" strokeWidth="12" />
        <circle cx="90" cy="90" r="66" fill="none" stroke="#f0c679" strokeWidth="3" opacity="0.5" />
        <circle cx="90" cy="90" r={58} fill="none" stroke="url(#sauceRing)" strokeWidth="6" opacity="0.92" />
        <circle cx="90" cy="90" r={radius} fill="none" stroke="url(#cheeseFill)" strokeWidth={stroke} />
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#fff2b8" strokeWidth="2" opacity="0.28" />

        {boundaries.map((boundary) => (
          <line
            key={boundary.key}
            x1={boundary.x1}
            y1={boundary.y1}
            x2={boundary.x2}
            y2={boundary.y2}
            stroke="#2b221d"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.72"
          />
        ))}

        {toppingGroups.map((group) =>
          group.anchors.map((anchor, index) =>
            renderPizzaTopping(group.kind, anchor.x, anchor.y, anchor.scale, anchor.rotate, `${group.key}-${index}`)
          )
        )}

        <circle cx="90" cy="90" r="33" fill="#0b0b0c" />
        <circle cx="90" cy="90" r="34" fill="none" stroke="#3b2a1e" strokeWidth="3" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-5 text-center">
        {chart.template ? (
          <div className="max-w-[120px]">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">Template</div>
            <div className="mt-2 text-xl font-semibold leading-tight tracking-tight text-zinc-50">Set amounts</div>
            <div className="mt-1 text-xs leading-4 text-zinc-400">{sections.length} sections ready</div>
          </div>
        ) : (
          <div className="max-w-[124px]">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">Allocated</div>
            <div className="mt-2 break-words text-xl font-semibold leading-tight tracking-tight text-zinc-50">{formatMoney(chart.allocated)}</div>
            <div className="mt-1 text-xs leading-4 text-zinc-400">of {formatMoney(total)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryList({ total, sections }: { total: number; sections: Slice[] }) {
  const chart = buildChartState(total, sections);
  const top = chart.template ? chart.segments.slice(0, 4) : chart.segments.slice(0, 5);
  const hiddenCount = Math.max(0, chart.segments.length - top.length);

  return (
    <div className="space-y-2">
      {top.map((item) => {
        const percent = chart.chartTotal > 0 ? (item.value / chart.chartTotal) * 100 : 0;
        return (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/10 bg-zinc-950/55 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <ToppingBadge topping={item.topping} />
              <div>
                <div className="text-sm font-medium text-zinc-100">{item.label}</div>
                <div className="text-xs text-zinc-500">
                  {TOPPING_OPTIONS.find((option) => option.value === item.topping)?.label ?? "Cheese"} - {chart.template ? "Template" : formatPercent(percent)}
                </div>
              </div>
            </div>
            <div className="text-sm font-medium text-zinc-100">{formatMoney(item.amount)}</div>
          </div>
        );
      })}
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
  onAddSection,
  onAmountAction,
}: {
  section: Slice | null;
  total: number;
  index: number;
  count: number;
  onChange: (patch: Partial<Slice>) => void;
  onDelete: () => void;
  onPrev: () => void;
  onNext: () => void;
  onAddSection: () => void;
  onAmountAction: (action: AmountAction, value: string) => void;
}) {
  const [amountDraft, setAmountDraft] = useState("");

  useEffect(() => {
    setAmountDraft("");
  }, [section?.id]);

  if (!section) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[26px] border border-dashed border-amber-500/20 bg-zinc-950/60 p-6 text-center text-sm text-zinc-400">
        <div>No sections yet.</div>
        <ActionButton onClick={onAddSection} variant="primary">New section</ActionButton>
      </div>
    );
  }

  const percent = total > 0 ? (section.amount / total) * 100 : 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <ActionButton onClick={onPrev} disabled={count <= 1} className="px-3">Prev</ActionButton>
        <div className="rounded-full border border-amber-500/15 bg-zinc-950/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-amber-200/70">
          {count ? `${index + 1} / ${count}` : "0 / 0"}
        </div>
        <ActionButton onClick={onNext} disabled={count <= 1} className="px-3">Next</ActionButton>
      </div>

      <div className="flex-1 rounded-[26px] border border-amber-500/15 bg-zinc-950/60 p-4 shadow-inner shadow-black/15">
        <div className="grid h-full gap-3 content-start">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Topping</div>
            <select
              value={section.topping ?? "cheese"}
              onChange={(e) => onChange({ topping: e.target.value as ToppingKind })}
              className="w-full rounded-2xl border border-amber-500/15 bg-zinc-950/90 px-4 py-3 text-sm text-zinc-100 outline-none"
              aria-label={`${section.name} topping`}
            >
              {TOPPING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Section name</div>
            <input
              value={section.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-full rounded-2xl border border-amber-500/15 bg-zinc-950/90 px-4 py-3 text-sm text-zinc-100 outline-none"
              placeholder="Emergency Fund, Unassigned"
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Amount tool</div>
            <MoneyInput value={amountDraft} onChange={(e) => setAmountDraft(e.target.value)} placeholder="Enter value" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ActionButton onClick={() => onAmountAction("set", amountDraft)} disabled={!amountDraft}>Change</ActionButton>
              <ActionButton onClick={() => onAmountAction("add", amountDraft)} disabled={!amountDraft}>Add</ActionButton>
              <ActionButton onClick={() => onAmountAction("subtract", amountDraft)} disabled={!amountDraft}>Subtract</ActionButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat title="Percent" value={formatPercent(percent)} tone="gold" />
            <MiniStat title="Value" value={formatMoney(section.amount)} tone="orange" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton onClick={onAddSection} variant="primary">New section</ActionButton>
        <ActionButton onClick={onDelete} variant="ghost">Delete section</ActionButton>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [tab, setTab] = useState<MobileTab>("chart");
  const [plan, setPlan] = useState<PlanKey>("current");
  const [activeIndices, setActiveIndices] = useState<Record<PlanKey, number>>({ current: 0, next: 0 });
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Partial<AppState> | LegacyPlannerState;
        const normalized = normalizeAppState(parsed);
        setState(normalized);
        setLastSavedAt(normalized.updatedAt);
        return;
      }
    } catch {
      // ignore bad local storage
    }
  }, []);

  useEffect(() => {
    const updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt }));
    setLastSavedAt(updatedAt);
  }, [state]);

  useEffect(() => {
    const nextIndices = { ...activeIndices };
    let changed = false;

    for (const key of ["current", "next"] as PlanKey[]) {
      const sections = state[key].sections;
      if (!sections.length && nextIndices[key] !== 0) {
        nextIndices[key] = 0;
        changed = true;
      } else if (sections.length && nextIndices[key] > sections.length - 1) {
        nextIndices[key] = sections.length - 1;
        changed = true;
      }
    }

    if (changed) setActiveIndices(nextIndices);
  }, [state, activeIndices]);

  useEffect(() => {
    if (!state.nextEnabled && plan === "next") setPlan("current");
  }, [state.nextEnabled, plan]);

  const activePie = state[plan];
  const chart = useMemo(() => buildChartState(activePie.total, activePie.sections), [activePie]);
  const overAllocated = activePie.total - chart.allocated < 0;
  const activeIndex = activeIndices[plan] || 0;
  const currentSection = activePie.sections[activeIndex] || null;

  const updatePlan = (planKey: PlanKey, updater: (pie: PiePlan) => PiePlan) => {
    setState((prev) => ({ ...prev, [planKey]: updater(prev[planKey]) }));
  };

  const updateSection = (planKey: PlanKey, id: string, patch: Partial<Slice>) => {
    updatePlan(planKey, (pie) => ({
      ...pie,
      sections: pie.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    }));
  };

  const applyAmountAction = (planKey: PlanKey, id: string, action: AmountAction, rawValue: string) => {
    const amount = parseMoney(rawValue);
    if (amount <= 0 && rawValue !== "0" && rawValue !== "0.00") return;

    updatePlan(planKey, (pie) => {
      const nextSections = pie.sections.map((section) => {
        if (section.id !== id) return section;
        if (action === "set") return { ...section, amount };
        if (action === "add") return { ...section, amount: parseMoney(section.amount + amount) };
        return { ...section, amount: parseMoney(Math.max(0, section.amount - amount)) };
      });

      const allocated = nextSections.reduce((sum, section) => sum + section.amount, 0);
      const nextTotal = parseMoney(Math.max(pie.total, allocated));

      return {
        ...pie,
        total: nextTotal,
        sections: nextSections,
      };
    });
  };

  const toggleNextEnabled = () => {
    setState((prev) => ({ ...prev, nextEnabled: !prev.nextEnabled }));
    if (state.nextEnabled && plan === "next") setPlan("current");
  };

  const addSection = (planKey: PlanKey) => {
    const nextIndex = state[planKey].sections.length;
    updatePlan(planKey, (pie) => ({
      ...pie,
      sections: [
        ...pie.sections,
        {
          id: makeId("slice"),
          name: `Section ${pie.sections.length + 1}`,
          amount: 0,
          color: nextColor(pie.sections.length),
          topping: normalizeTopping(undefined, pie.sections.length),
        },
      ],
    }));
    setActiveIndices((prev) => ({ ...prev, [planKey]: nextIndex }));
    setPlan(planKey);
    setTab("edit");
  };

  const deleteSection = (planKey: PlanKey, id: string) => {
    updatePlan(planKey, (pie) => ({
      ...pie,
      sections: pie.sections.filter((section) => section.id !== id),
    }));
  };

  const clearNextPlan = () => {
    if (!window.confirm("Clear the Next pie? This will remove its total and all sections.")) return;
    setState((prev) => ({ ...prev, next: { total: 0, sections: [] } }));
    setActiveIndices((prev) => ({ ...prev, next: 0 }));
    setPlan("next");
    setTab("chart");
  };

  const copyCurrentToNext = () => {
    if (!window.confirm("Copy the Current pie into the Next pie? This will replace the Next pie.")) return;
    setState((prev) => ({
      ...prev,
      next: {
        total: prev.current.total,
        sections: cloneSections(prev.current.sections),
      },
    }));
    setActiveIndices((prev) => ({ ...prev, next: 0 }));
    setPlan("next");
    setTab("chart");
  };

  const exportState = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    const payload = JSON.stringify({ ...state, version: 8, updatedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slice-board_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<AppState> | LegacyPlannerState;
        const normalized = normalizeAppState(parsed);
        setState(normalized);
        setLastSavedAt(normalized.updatedAt);
        setActiveIndices({ current: 0, next: 0 });
        setPlan("current");
        setTab("chart");
      } catch {
        alert("That JSON file could not be read.");
      }
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  const resetPlanner = () => {
    if (!window.confirm("Reset everything? This will restore both pies to their starter state.")) return;
    setState(makeFreshState());
    setActiveIndices({ current: 0, next: 0 });
    setPlan("current");
    setTab("chart");
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-zinc-950 text-zinc-100 md:min-h-screen md:h-auto md:overflow-x-hidden md:overflow-y-auto">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_42%)]" />
        <div className="absolute left-[-12%] top-8 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-14 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex h-full max-w-6xl flex-col p-3 md:min-h-screen md:p-6">
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importState} />

        <header className="shrink-0 rounded-[30px] border border-amber-500/15 bg-zinc-900/72 p-4 shadow-2xl shadow-black/25 backdrop-blur-sm md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <PizzaIcon className="h-16 w-16 shrink-0" />
              <div>
                <h1 className="bg-[linear-gradient(135deg,#fff7ed_0%,#facc15_50%,#f97316_100%)] bg-clip-text text-2xl font-semibold tracking-tight text-transparent md:text-4xl">
                  Slice Board
                </h1>
                <p className="mt-2 text-sm leading-6 text-zinc-400 md:max-w-2xl">Plan your balance.</p>
              </div>
            </div>
            <div className="hidden shrink-0 gap-2 md:flex">
              <TabButton active={tab === "chart"} onClick={() => setTab("chart")}>Chart</TabButton>
              <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>Edit</TabButton>
              <TabButton active={tab === "tools"} onClick={() => setTab("tools")}>Tools</TabButton>
            </div>
          </div>
          {state.nextEnabled ? (
            <div className="mt-3 hidden gap-2 md:flex">
              <PlanButton active={plan === "current"} onClick={() => setPlan("current")}>Current</PlanButton>
              <PlanButton active={plan === "next"} onClick={() => setPlan("next")}>Next</PlanButton>
            </div>
          ) : null}
        </header>

        <div className="mt-3 grid shrink-0 grid-cols-3 gap-2 md:mt-4 md:grid-cols-4 md:gap-3">
          <MiniStat title="Active pie" value={plan === "current" ? "Current" : "Next"} tone="gold" />
          <MiniStat title="Total" value={formatMoney(activePie.total)} tone="gold" />
          <MiniStat title="Allocated" value={formatMoney(chart.allocated)} tone="orange" />
          <div className="hidden md:block">
            <MiniStat title="Remaining" value={formatMoney(Math.max(0, chart.remaining))} tone={overAllocated ? "rose" : "zinc"} />
          </div>
        </div>

        <main className="mt-3 min-h-0 flex-1 md:mt-4">
          {tab === "chart" ? (
            <Panel title={plan === "current" ? "Current Pie" : "Next Pie"}>
              <div className="flex h-full flex-col justify-between gap-4 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center justify-center">
                  <DonutChart total={activePie.total} sections={activePie.sections} size={230} />
                </div>
                <div className="min-h-0 flex-1">
                  <SummaryList total={activePie.total} sections={activePie.sections} />
                </div>
              </div>
            </Panel>
          ) : null}

          {tab === "edit" ? (
            <Panel
              title="Edit sections"
              right={
                <div className="rounded-full border border-amber-500/15 bg-zinc-950/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-amber-200/70">
                  {activePie.sections.length} total
                </div>
              }
            >
              <SliceEditor
                section={currentSection}
                total={activePie.total}
                index={activeIndex}
                count={activePie.sections.length}
                onChange={(patch) => currentSection && updateSection(plan, currentSection.id, patch)}
                onDelete={() => currentSection && deleteSection(plan, currentSection.id)}
                onPrev={() =>
                  setActiveIndices((prev) => ({
                    ...prev,
                    [plan]: activePie.sections.length ? (prev[plan] - 1 + activePie.sections.length) % activePie.sections.length : 0,
                  }))
                }
                onNext={() =>
                  setActiveIndices((prev) => ({
                    ...prev,
                    [plan]: activePie.sections.length ? (prev[plan] + 1) % activePie.sections.length : 0,
                  }))
                }
                onAddSection={() => addSection(plan)}
                onAmountAction={(action, value) => currentSection && applyAmountAction(plan, currentSection.id, action, value)}
              />
            </Panel>
          ) : null}

          {tab === "tools" ? (
            <Panel title="Tools">
              <div className="grid h-full content-start gap-3">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-amber-200/70">{plan === "current" ? "Current total" : "Next total"}</div>
                  <MoneyInput value={String(activePie.total)} onChange={(e) => updatePlan(plan, (pie) => ({ ...pie, total: parseMoney(e.target.value) }))} />
                </div>

                <div className="rounded-[24px] border border-amber-500/15 bg-zinc-950/60 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Planning pie</div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="text-sm text-zinc-300">{state.nextEnabled ? "Next pie is visible" : "Next pie is hidden"}</div>
                    <ActionButton onClick={toggleNextEnabled}>{state.nextEnabled ? "Hide next" : "Show next"}</ActionButton>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ActionButton onClick={() => addSection(plan)} variant="primary">New section</ActionButton>
                  <ActionButton onClick={exportState}>Export JSON</ActionButton>
                  <ActionButton onClick={() => fileRef.current?.click()}>Import JSON</ActionButton>
                  <ActionButton onClick={resetPlanner} variant="ghost">Reset all</ActionButton>
                </div>

                {state.nextEnabled && plan === "next" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton onClick={copyCurrentToNext}>Copy current in</ActionButton>
                    <ActionButton onClick={clearNextPlan} variant="ghost">Clear next pie</ActionButton>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <MiniStat title="Sections" value={String(activePie.sections.length)} tone="zinc" />
                  <MiniStat title="Status" value={overAllocated ? "Over" : chart.template ? "Template" : "Balanced"} tone={overAllocated ? "rose" : chart.template ? "gold" : "orange"} />
                </div>

                <div className="rounded-[24px] border border-amber-500/15 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Last local save</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-300">{formatStamp(lastSavedAt)}</div>
                </div>
              </div>
            </Panel>
          ) : null}
        </main>

        <nav className="mt-3 grid shrink-0 gap-2 md:hidden">
          {state.nextEnabled ? (
            <div className="grid grid-cols-2 gap-2">
              <PlanButton active={plan === "current"} onClick={() => setPlan("current")}>Current</PlanButton>
              <PlanButton active={plan === "next"} onClick={() => setPlan("next")}>Next</PlanButton>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <MobileNavButton active={tab === "chart"} onClick={() => setTab("chart")}>Chart</MobileNavButton>
            <MobileNavButton active={tab === "edit"} onClick={() => setTab("edit")}>Edit</MobileNavButton>
            <MobileNavButton active={tab === "tools"} onClick={() => setTab("tools")}>Tools</MobileNavButton>
          </div>
        </nav>
      </div>
    </div>
  );
}
