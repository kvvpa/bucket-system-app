import { useEffect, useMemo, useRef, useState, type ChangeEvent, type TouchEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import logoPng from "./img/slice-board-logo.png";
import pizzaSauceOnlyPng from "./img/pizza/pizza-sauce-only.png";
import pizzaCheeseOnlyPng from "./img/pizza/pizza-cheese-only.png";
import pizzaPepperoniPng from "./img/pizza/pizza-pepperoni.png";
import pizzaBasilPng from "./img/pizza/pizza-basil.png";
import pizzaMushroomPng from "./img/pizza/pizza-mushroom.png";
import pizzaOlivePng from "./img/pizza/pizza-olive.png";
import pizzaPepperPng from "./img/pizza/pizza-pepper.png";
import pizzaOnionPng from "./img/pizza/pizza-onion.png";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";

const STORAGE_KEY = "slice-board-v1";
const LEGACY_STORAGE_KEYS = ["joey-fidelity-pie-planner-v1"];
const CLOUD_BOARD_KEY = "primary";
const MAX_PIES = 6;
const SWIPE_THRESHOLD = 40;

type ToppingKind = "sauce" | "cheese" | "pepperoni" | "basil" | "mushroom" | "olive" | "pepper" | "onion";
type SliceKind = "unassigned" | "remaining" | "named";
type ViewKey = "pie" | "edit" | "data";
type ToolMode = "change" | "add" | "subtract";
type CloudStatus = "idle" | "working" | "success" | "error";

type Slice = {
  id: string;
  name: string;
  amount: number;
  topping: ToppingKind;
  kind?: SliceKind;
};

type Pie = {
  id: string;
  name: string;
  slices: Slice[];
};

type StoredState = {
  pies?: unknown;
  activePieId?: unknown;
  current?: unknown;
  next?: unknown;
  currentPie?: unknown;
  nextPie?: unknown;
  slices?: unknown;
  selectedSliceId?: unknown;
};

const PIZZA_TEXTURES: Record<ToppingKind, string> = {
  sauce: pizzaSauceOnlyPng,
  cheese: pizzaCheeseOnlyPng,
  pepperoni: pizzaPepperoniPng,
  basil: pizzaBasilPng,
  mushroom: pizzaMushroomPng,
  olive: pizzaOlivePng,
  pepper: pizzaPepperPng,
  onion: pizzaOnionPng,
};

const TOPPING_OPTIONS: { value: ToppingKind; label: string }[] = [
  { value: "pepperoni", label: "Pepperoni" },
  { value: "basil", label: "Basil" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "pepper", label: "Pepper" },
  { value: "onion", label: "Onion" },
];

const TOPPING_LABELS: Record<ToppingKind, string> = {
  sauce: "Sauce only",
  cheese: "Plain cheese",
  pepperoni: "Pepperoni",
  basil: "Basil",
  mushroom: "Mushroom",
  olive: "Olive",
  pepper: "Pepper",
  onion: "Onion",
};

const STARTER_CURRENT: Slice[] = [
  { id: "starter-bills", name: "Bills", amount: 580, topping: "olive", kind: "named" },
  { id: "starter-emergency", name: "Emergency Fund", amount: 300, topping: "basil", kind: "named" },
  { id: "starter-bankruptcy", name: "Bankruptcy", amount: 300, topping: "mushroom", kind: "named" },
  { id: "starter-fun", name: "Fun", amount: 120, topping: "pepperoni", kind: "named" },
  { id: "starter-transit", name: "Transit", amount: 80, topping: "pepper", kind: "named" },
  { id: "starter-subscriptions", name: "Subscriptions", amount: 40, topping: "onion", kind: "named" },
  { id: "starter-remaining", name: "Remaining", amount: 760, topping: "cheese", kind: "remaining" },
  { id: "starter-unassigned", name: "Unassigned", amount: 0, topping: "sauce", kind: "unassigned" },
];

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function newId(seed = "slice") {
  const clean = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "slice";
  return `${clean}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function money(value: number) {
  return moneyFormatter.format(value || 0);
}

function toAmount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function cloneSlices(slices: Slice[]) {
  return slices.map((slice) => ({ ...slice, id: newId(slice.name) }));
}

function blankSlices() {
  return STARTER_CURRENT.map((slice) => ({ ...slice, id: newId(slice.name), amount: 0 }));
}

function inferKind(name: string, rawKind?: unknown): SliceKind {
  const lower = name.trim().toLowerCase();
  if (lower === "unassigned") return "unassigned";
  if (lower === "remaining") return "remaining";
  if (rawKind === "unassigned" || rawKind === "remaining" || rawKind === "named") return rawKind;
  return "named";
}

function isTopping(value: unknown): value is ToppingKind {
  return value === "sauce" || value === "cheese" || value === "pepperoni" || value === "basil" || value === "mushroom" || value === "olive" || value === "pepper" || value === "onion";
}

function defaultToppingForName(name: string): ToppingKind {
  const lower = name.trim().toLowerCase();
  if (lower.includes("emergency")) return "basil";
  if (lower.includes("bankruptcy")) return "mushroom";
  if (lower.includes("fun") || lower.includes("show") || lower.includes("concert")) return "pepperoni";
  if (lower.includes("bill") || lower.includes("rent")) return "olive";
  if (lower.includes("transit") || lower.includes("gas") || lower.includes("travel")) return "pepper";
  if (lower.includes("sub") || lower.includes("apple") || lower.includes("google")) return "onion";
  return "pepperoni";
}

function normalizeSlice(raw: unknown, index: number): Slice {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = String(source.name ?? `Slice ${index + 1}`).trim() || `Slice ${index + 1}`;
  const kind = inferKind(name, source.kind);
  let topping: ToppingKind = isTopping(source.topping) ? source.topping : defaultToppingForName(name);

  if (kind === "unassigned") topping = "sauce";
  if (kind === "remaining") topping = "cheese";
  if (kind === "named" && (topping === "sauce" || topping === "cheese")) topping = defaultToppingForName(name);

  return {
    id: String(source.id ?? newId(name)),
    name,
    amount: toAmount(source.amount),
    topping,
    kind,
  };
}

function normalizeSlices(value: unknown, fallback: Slice[] = []) {
  if (!Array.isArray(value)) return cloneSlices(fallback);
  return value.map((item, index) => normalizeSlice(item, index));
}

function normalizePie(raw: unknown, index: number): Pie {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = String(source.name ?? `Pie ${index + 1}`).trim() || `Pie ${index + 1}`;
  return {
    id: String(source.id ?? newId(name)),
    name,
    slices: normalizeSlices(source.slices, index === 0 ? STARTER_CURRENT : blankSlices()),
  };
}

function starterState() {
  const starterPie = { id: newId("current-pie"), name: "Current Pie", slices: cloneSlices(STARTER_CURRENT) };
  return { pies: [starterPie], activePieId: starterPie.id, selectedSliceId: starterPie.slices[0]?.id ?? null };
}

function loadState() {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;

    try {
      const parsed = JSON.parse(stored) as StoredState;

      if (Array.isArray(parsed.pies)) {
        const pies = parsed.pies.map((pie, index) => normalizePie(pie, index)).slice(0, MAX_PIES);
        const safePies = pies.length ? pies : starterState().pies;
        const activePieId = typeof parsed.activePieId === "string" && safePies.some((pie) => pie.id === parsed.activePieId)
          ? parsed.activePieId
          : safePies[0].id;
        const activePie = safePies.find((pie) => pie.id === activePieId) ?? safePies[0];
        const selectedSliceId = typeof parsed.selectedSliceId === "string" && activePie.slices.some((slice) => slice.id === parsed.selectedSliceId)
          ? parsed.selectedSliceId
          : activePie.slices[0]?.id ?? null;
        return { pies: safePies, activePieId, selectedSliceId };
      }

      const current = normalizeSlices(parsed.current ?? parsed.currentPie ?? parsed.slices, STARTER_CURRENT);
      const next = normalizeSlices(parsed.next ?? parsed.nextPie, []);
      const pies: Pie[] = [{ id: newId("current-pie"), name: "Current Pie", slices: current }];
      if (next.length) pies.push({ id: newId("legacy-pie"), name: "Pie 2", slices: next });
      return { pies: pies.slice(0, MAX_PIES), activePieId: pies[0].id, selectedSliceId: current[0]?.id ?? null };
    } catch {
      // Try the next supported storage key.
    }
  }

  return starterState();
}

function totalFor(slices: Slice[]) {
  return slices.reduce((sum, slice) => sum + Math.max(0, slice.amount), 0);
}

function allocatedFor(slices: Slice[]) {
  return slices.reduce((sum, slice) => (slice.kind === "named" ? sum + Math.max(0, slice.amount) : sum), 0);
}

function percentFor(slice: Slice, total: number) {
  return total > 0 ? Math.max(0, slice.amount) / total : 0;
}

function cloudStatusText(status: CloudStatus, message: string) {
  if (message) return message;
  if (status === "working") return "Working...";
  if (status === "success") return "Done.";
  if (status === "error") return "Something went sideways.";
  return isSupabaseConfigured ? "Local backup remains active on this device." : "Cloud backup is not configured for this build.";
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function wedgePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const span = Math.max(0, endAngle - startAngle);
  const safeEnd = span >= 359.9 ? startAngle + 359.9 : endAngle;
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, safeEnd);
  const largeArcFlag = span > 180 ? 1 : 0;
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`, "Z"].join(" ");
}

function buildSegments(slices: Slice[]) {
  const visible = slices.filter((slice) => slice.amount > 0);
  const total = totalFor(visible);
  let angle = 0;
  return visible.map((slice) => {
    const span = total > 0 ? (slice.amount / total) * 360 : 0;
    const segment = { slice, startAngle: angle, endAngle: angle + span, span };
    angle += span;
    return segment;
  });
}

function shortLabel(name: string) {
  if (name.length <= 12) return name;
  return `${name.slice(0, 11)}...`;
}

function PizzaWindowChart({ slices, title, selectedSliceId, onSelect }: {
  slices: Slice[];
  title: string;
  selectedSliceId: string | null;
  onSelect: (id: string) => void;
}) {
  const segments = useMemo(() => buildSegments(slices), [slices]);
  const total = totalFor(slices);
  const chartId = `slice-board-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const cx = 190;
  const cy = 146;
  const outerRadius = 112;
  const innerRadius = 50;
  const imageX = cx - outerRadius;
  const imageY = cy - outerRadius;
  const imageSize = outerRadius * 2;
  const selectedSegment = segments.find((segment) => segment.slice.id === selectedSliceId) ?? null;
  const largeLabelSegments = segments.filter((segment) => percentFor(segment.slice, total) >= 0.035);
  const labelSegments = selectedSegment && !largeLabelSegments.some((segment) => segment.slice.id === selectedSegment.slice.id)
    ? [...largeLabelSegments, selectedSegment]
    : largeLabelSegments;

  return (
    <div className="pizza-chart-wrap callout-chart-wrap" aria-label={`${title} allocation chart`}>
      <svg className="pizza-chart-svg multi-pie-chart-svg" viewBox="0 0 380 292" role="img" aria-label={`${title} proportional raster pizza chart`}>
        <defs>
          {segments.map((segment, index) => (
            <clipPath key={`${segment.slice.id}-clip`} id={`${chartId}-clip-${index}`} clipPathUnits="userSpaceOnUse">
              <path d={wedgePath(cx, cy, outerRadius, segment.startAngle, segment.endAngle)} />
            </clipPath>
          ))}
          <radialGradient id={`${chartId}-shade`} cx="44%" cy="34%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="66%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.34)" />
          </radialGradient>
          <mask id={`${chartId}-donut-mask`} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="380" height="292" fill="black" />
            <circle cx={cx} cy={cy} r={outerRadius} fill="white" />
            <circle cx={cx} cy={cy} r={innerRadius} fill="black" />
          </mask>
        </defs>

        <circle cx={cx} cy={cy} r={outerRadius + 4} className="pizza-glow-ring" />
        <g mask={`url(#${chartId}-donut-mask)`}>
          {segments.length === 0 ? (
            <image href={pizzaCheeseOnlyPng} x={imageX} y={imageY} width={imageSize} height={imageSize} preserveAspectRatio="xMidYMid slice" opacity="0.32" />
          ) : (
            segments.map((segment, index) => (
              <g key={segment.slice.id} className="pizza-segment" clipPath={`url(#${chartId}-clip-${index})`} onClick={() => onSelect(segment.slice.id)}>
                <image href={PIZZA_TEXTURES[segment.slice.topping]} x={imageX} y={imageY} width={imageSize} height={imageSize} preserveAspectRatio="xMidYMid slice" />
              </g>
            ))
          )}
          <circle cx={cx} cy={cy} r={outerRadius} fill={`url(#${chartId}-shade)`} className="pizza-surface-shade" />
        </g>

        {segments.map((segment) => {
          if (segment.span >= 359.9) return null;
          const outer = polarPoint(cx, cy, outerRadius, segment.endAngle);
          const inner = polarPoint(cx, cy, innerRadius, segment.endAngle);
          return <line key={`${segment.slice.id}-separator`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="pizza-slice-separator" />;
        })}

        <circle cx={cx} cy={cy} r={innerRadius} className="pizza-center-hole" />
        <circle cx={cx} cy={cy} r={outerRadius} className="pizza-outer-stroke" />

        <g className="callout-layer">
          {labelSegments.map((segment) => {
            const midAngle = segment.startAngle + segment.span / 2;
            const lineStart = polarPoint(cx, cy, outerRadius + 3, midAngle);
            const lineBend = polarPoint(cx, cy, outerRadius + 16, midAngle);
            const rightSide = Math.cos(((midAngle - 90) * Math.PI) / 180) >= 0;
            const labelX = rightSide ? Math.min(356, lineBend.x + 32) : Math.max(24, lineBend.x - 32);
            const labelY = Math.max(24, Math.min(268, lineBend.y));
            const percent = percentFor(segment.slice, total) * 100;
            const selected = segment.slice.id === selectedSliceId;

            return (
              <g key={`${segment.slice.id}-callout`} className={`pizza-callout ${selected ? "selected" : ""}`} onClick={() => onSelect(segment.slice.id)}>
                <line x1={lineStart.x} y1={lineStart.y} x2={lineBend.x} y2={lineBend.y} className="pizza-callout-line" />
                <line x1={lineBend.x} y1={lineBend.y} x2={labelX} y2={labelY} className="pizza-callout-line" />
                <text x={labelX} y={labelY - 3} textAnchor={rightSide ? "end" : "start"} className="pizza-callout-name">{shortLabel(segment.slice.name)}</text>
                <text x={labelX} y={labelY + 12} textAnchor={rightSide ? "end" : "start"} className="pizza-callout-meta">{percent.toFixed(percent > 0 && percent < 1 ? 1 : 0)}%</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pizza-center-label">
        <span>{total > 0 ? money(total) : "Empty"}</span>
        <small>{total > 0 ? "total pie" : "add slices"}</small>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SelectedSlicePanel({ slices, total, selectedSliceId, onPrevious, onNext }: {
  slices: Slice[];
  total: number;
  selectedSliceId: string | null;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const selected = slices.find((slice) => slice.id === selectedSliceId) ?? slices[0] ?? null;
  if (!selected) return <div className="mobile-selected-panel callout-selected-panel">No slices yet.</div>;
  const percent = percentFor(selected, total) * 100;

  return (
    <div className="mobile-selected-panel callout-selected-panel callout-selected-panel-v2">
      <button type="button" className="bucket-step-button" onClick={onPrevious} aria-label="Previous bucket">Prev</button>
      <div className="selected-callout-summary">
        <span>
          <small>Selected bucket</small>
          <strong>{selected.name}</strong>
        </span>
        <span>
          <strong>{money(selected.amount)}</strong>
          <small>{percent.toFixed(percent > 0 && percent < 1 ? 1 : 0)}% / {TOPPING_LABELS[selected.topping]}</small>
        </span>
      </div>
      <button type="button" className="bucket-step-button" onClick={onNext} aria-label="Next bucket">Next</button>
    </div>
  );
}

export default function AppSliceBoardMobileCleanup() {
  const initial = useMemo(loadState, []);
  const [pies, setPies] = useState<Pie[]>(initial.pies);
  const [activePieId, setActivePieId] = useState<string>(initial.activePieId);
  const [view, setView] = useState<ViewKey>("pie");
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(initial.selectedSliceId);
  const [toolMode, setToolMode] = useState<ToolMode>("change");
  const [toolAmount, setToolAmount] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newTopping, setNewTopping] = useState<ToppingKind>("pepperoni");
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("idle");
  const [cloudMessage, setCloudMessage] = useState("");
  const touchStartXRef = useRef<number | null>(null);

  const activePie = pies.find((pie) => pie.id === activePieId) ?? pies[0];
  const activeSlices = activePie?.slices ?? [];
  const selectedSlice = activeSlices.find((slice) => slice.id === selectedSliceId) ?? activeSlices[0] ?? null;
  const activeTotal = totalFor(activeSlices);
  const activeAllocated = allocatedFor(activeSlices);
  const unassigned = Math.max(0, activeSlices.find((slice) => slice.kind === "unassigned")?.amount ?? 0);
  const activePieNumber = Math.max(1, pies.findIndex((pie) => pie.id === activePieId) + 1);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!pies.length) return;
    if (!pies.some((pie) => pie.id === activePieId)) {
      setActivePieId(pies[0].id);
    }
  }, [pies, activePieId]);

  useEffect(() => {
    if (!activeSlices.length) {
      if (selectedSliceId !== null) setSelectedSliceId(null);
      return;
    }
    if (!activeSlices.some((slice) => slice.id === selectedSliceId)) {
      setSelectedSliceId(activeSlices[0].id);
    }
  }, [activeSlices, selectedSliceId]);

  const payload = useMemo(
    () => ({
      app: "Slice Board",
      version: 12,
      pies,
      activePieId,
      selectedSliceId,
    }),
    [pies, activePieId, selectedSliceId],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [payload]);

  function updateActivePie(updater: (pie: Pie) => Pie) {
    setPies((items) => items.map((pie) => (pie.id === activePieId ? updater(pie) : pie)));
  }

  function updateActiveSlices(updater: (slices: Slice[]) => Slice[]) {
    updateActivePie((pie) => ({ ...pie, slices: updater(pie.slices) }));
  }

  function updatePieName(name: string) {
    updateActivePie((pie) => ({ ...pie, name }));
  }

  function updateSlice(id: string, patch: Partial<Slice>) {
    updateActiveSlices((slices) => slices.map((slice, index) => (slice.id === id ? normalizeSlice({ ...slice, ...patch }, index) : slice)));
  }

  function removeSlice(id: string) {
    updateActiveSlices((slices) => slices.filter((slice) => slice.id !== id));
  }

  function selectSibling(direction: -1 | 1) {
    if (!activeSlices.length) return;
    const currentIndex = Math.max(0, activeSlices.findIndex((slice) => slice.id === selectedSliceId));
    const nextIndex = (currentIndex + direction + activeSlices.length) % activeSlices.length;
    setSelectedSliceId(activeSlices[nextIndex].id);
  }

  function selectPieSibling(direction: -1 | 1) {
    if (pies.length <= 1) return;
    const currentIndex = Math.max(0, pies.findIndex((pie) => pie.id === activePieId));
    const nextIndex = (currentIndex + direction + pies.length) % pies.length;
    const nextPie = pies[nextIndex];
    setActivePieId(nextPie.id);
    setSelectedSliceId(nextPie.slices[0]?.id ?? null);
  }

  function handleSwipeStart(clientX: number) {
    touchStartXRef.current = clientX;
  }

  function handleSwipeEnd(clientX: number) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;

    if (startX === null || pies.length <= 1) return;

    const deltaX = clientX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

    if (deltaX < 0) selectPieSibling(1);
    if (deltaX > 0) selectPieSibling(-1);
  }

  function addPie() {
    if (pies.length >= MAX_PIES) return;
    const pieNumber = pies.length + 1;
    const nextPie: Pie = {
      id: newId(`pie-${pieNumber}`),
      name: `Pie ${pieNumber}`,
      slices: blankSlices(),
    };
    setPies((items) => [...items, nextPie]);
    setActivePieId(nextPie.id);
    setSelectedSliceId(nextPie.slices[0]?.id ?? null);
    setView("edit");
  }

  function deleteActivePie() {
    if (pies.length <= 1) return;
    const currentIndex = Math.max(0, pies.findIndex((pie) => pie.id === activePieId));
    const nextPies = pies.filter((pie) => pie.id !== activePieId);
    const nextPie = nextPies[Math.min(currentIndex, nextPies.length - 1)];
    setPies(nextPies);
    setActivePieId(nextPie.id);
    setSelectedSliceId(nextPie.slices[0]?.id ?? null);
    setView("pie");
  }

  function applyAmountTool() {
    if (!selectedSlice) return;
    const value = toAmount(toolAmount);
    updateActiveSlices((slices) =>
      slices.map((slice) => {
        if (slice.id !== selectedSlice.id) return slice;
        const amount = toolMode === "add" ? slice.amount + value : toolMode === "subtract" ? Math.max(0, slice.amount - value) : value;
        return { ...slice, amount };
      }),
    );
    setToolAmount("");
  }

  function addBucket() {
    const name = newName.trim();
    if (!name) return;
    const kind = inferKind(name);
    const topping = kind === "unassigned" ? "sauce" : kind === "remaining" ? "cheese" : newTopping;
    const slice = normalizeSlice({ id: newId(name), name, amount: toAmount(newAmount), topping, kind }, activeSlices.length);
    updateActiveSlices((slices) => [...slices, slice]);
    setSelectedSliceId(slice.id);
    setNewName("");
    setNewAmount("");
    setNewTopping("pepperoni");
    setShowAddBucket(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "slice-board-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function applyImportedPayload(parsed: StoredState) {
    const loaded = (() => {
      if (Array.isArray(parsed.pies)) {
        const importedPies = parsed.pies.map((pie, index) => normalizePie(pie, index)).slice(0, MAX_PIES);
        if (importedPies.length) return importedPies;
      }
      return [{ id: newId("current-pie"), name: "Current Pie", slices: normalizeSlices(parsed.current ?? parsed.currentPie ?? parsed.slices, STARTER_CURRENT) }];
    })();
    setPies(loaded);
    const nextActive = typeof parsed.activePieId === "string" && loaded.some((pie) => pie.id === parsed.activePieId) ? parsed.activePieId : loaded[0].id;
    const nextPie = loaded.find((pie) => pie.id === nextActive) ?? loaded[0];
    setActivePieId(nextActive);
    setView("pie");
    setSelectedSliceId(typeof parsed.selectedSliceId === "string" && nextPie.slices.some((slice) => slice.id === parsed.selectedSliceId) ? parsed.selectedSliceId : nextPie.slices[0]?.id ?? null);
  }

  function importJson() {
    try {
      applyImportedPayload(JSON.parse(importText) as StoredState);
      setImportMessage("Imported JSON into Slice Board.");
    } catch {
      setImportMessage("Import failed. Paste valid Slice Board JSON and try again.");
    }
  }

  async function sendSignInLink() {
    if (!supabase || !cloudEmail.trim()) return;
    setCloudStatus("working");
    setCloudMessage("");
    const { error } = await supabase.auth.signInWithOtp({ email: cloudEmail.trim(), options: { emailRedirectTo: window.location.origin } });
    if (error) {
      setCloudStatus("error");
      setCloudMessage(error.message);
      return;
    }
    setCloudStatus("success");
    setCloudMessage("Sign-in link sent. Check your email.");
  }

  async function signOutCloud() {
    if (!supabase) return;
    setCloudStatus("working");
    setCloudMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setCloudStatus("error");
      setCloudMessage(error.message);
      return;
    }
    setCloudStatus("idle");
    setCloudMessage("Signed out. Local backup remains on this device.");
  }

  async function saveToCloud() {
    if (!supabase || !session?.user) return;
    setCloudStatus("working");
    setCloudMessage("");
    const { error } = await supabase.from("board_states").upsert(
      { user_id: session.user.id, board_key: CLOUD_BOARD_KEY, payload },
      { onConflict: "user_id,board_key" },
    );
    if (error) {
      setCloudStatus("error");
      setCloudMessage(error.message);
      return;
    }
    setCloudStatus("success");
    setCloudMessage("Saved current board to cloud.");
  }

  async function loadFromCloud() {
    if (!supabase || !session?.user) return;
    setCloudStatus("working");
    setCloudMessage("");
    const { data, error } = await supabase.from("board_states").select("payload").eq("user_id", session.user.id).eq("board_key", CLOUD_BOARD_KEY).maybeSingle();
    if (error) {
      setCloudStatus("error");
      setCloudMessage(error.message);
      return;
    }
    if (!data?.payload) {
      setCloudStatus("idle");
      setCloudMessage("No cloud board found yet.");
      return;
    }
    applyImportedPayload(data.payload as StoredState);
    setCloudStatus("success");
    setCloudMessage("Loaded cloud board.");
  }

  return (
    <main className="app-shell multi-pie-app mobile-cleanup-app">
      <div className="dashboard-frame">
        <header className="hero-card">
          <img className="hero-logo" src={logoPng} alt="Slice Board logo" />
          <div>
            <p className="eyebrow">Slice Board</p>
            <h1>Slice Board</h1>
            <p className="hero-subtitle">Your money, by the slice.</p>
          </div>
        </header>

        <section className="stats-grid" aria-label="Active pie summary">
          <StatCard label="Pie total" value={money(activeTotal)} />
          <StatCard label="Allocated" value={money(activeAllocated)} />
          <StatCard label="Unassigned" value={money(unassigned)} />
        </section>

        <section
          className="screen-card chart-stage callout-stage multi-pie-stage swipe-pie-stage"
          onTouchStart={(event: TouchEvent<HTMLElement>) => handleSwipeStart(event.changedTouches[0]?.clientX ?? 0)}
          onTouchEnd={(event: TouchEvent<HTMLElement>) => handleSwipeEnd(event.changedTouches[0]?.clientX ?? 0)}
        >
          <div className="stage-heading multi-stage-heading">
            <div>
              <p className="eyebrow">Active pie</p>
              <h2>{activePie?.name ?? "Current Pie"}</h2>
            </div>
            <span className="pie-count-pill">{activePieNumber} / {MAX_PIES}</span>
          </div>
          <PizzaWindowChart slices={activeSlices} title={activePie?.id ?? "slice-board"} selectedSliceId={selectedSliceId} onSelect={setSelectedSliceId} />
          <div>
            <SelectedSlicePanel slices={activeSlices} total={activeTotal} selectedSliceId={selectedSliceId} onPrevious={() => selectSibling(-1)} onNext={() => selectSibling(1)} />
            <p className="swipe-hint">Swipe to switch pies.</p>
          </div>
        </section>

        <nav className="view-tabs multi-view-tabs" aria-label="Slice Board tools">
          <button type="button" className={view === "pie" ? "active" : ""} onClick={() => setView("pie")}>Pie</button>
          <button type="button" className={view === "edit" ? "active" : ""} onClick={() => setView("edit")}>Edit</button>
          <button type="button" className={view === "data" ? "active" : ""} onClick={() => setView("data")}>Data</button>
        </nav>

        <section className="screen-card workbench multi-workbench">
          {view === "pie" && (
            <div className="workbench-grid board-tools multi-board-tools compact-mobile-pane">
              <div className="segmented" aria-label="Amount change mode">
                <button type="button" className={toolMode === "change" ? "active" : ""} onClick={() => setToolMode("change")}>Change</button>
                <button type="button" className={toolMode === "add" ? "active" : ""} onClick={() => setToolMode("add")}>Add</button>
                <button type="button" className={toolMode === "subtract" ? "active" : ""} onClick={() => setToolMode("subtract")}>Sub</button>
              </div>
              <div className="inline-form amount-apply-row">
                <input
                  inputMode="decimal"
                  aria-label="Amount"
                  placeholder="Amount"
                  value={toolAmount}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setToolAmount(event.target.value)}
                />
                <button type="button" onClick={applyAmountTool} disabled={!selectedSlice}>Apply</button>
              </div>
            </div>
          )}

          {view === "edit" && (
            <div className="workbench-grid edit-tools multi-edit-tools compact-mobile-pane">
              <div className="pie-name-editor compact-pie-name-editor">
                <label>
                  <span>Pie name</span>
                  <input value={activePie?.name ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updatePieName(event.target.value)} aria-label="Pie name" />
                </label>
              </div>

              <div className="manage-pies-row">
                <button type="button" onClick={addPie} disabled={pies.length >= MAX_PIES}>Add Pie</button>
                <button type="button" onClick={deleteActivePie} disabled={pies.length <= 1}>Delete Pie</button>
              </div>

              {selectedSlice && (
                <div className="bucket-editor-card">
                  <div className="bucket-editor-heading">
                    <span>Selected bucket</span>
                    <strong>{selectedSlice.name}</strong>
                  </div>
                  <div className="bucket-editor-grid">
                    <input value={selectedSlice.name} onChange={(event: ChangeEvent<HTMLInputElement>) => updateSlice(selectedSlice.id, { name: event.target.value })} aria-label="Selected bucket name" />
                    <input inputMode="decimal" value={String(selectedSlice.amount)} onChange={(event: ChangeEvent<HTMLInputElement>) => updateSlice(selectedSlice.id, { amount: toAmount(event.target.value) })} aria-label="Selected bucket amount" />
                    <select value={selectedSlice.topping} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateSlice(selectedSlice.id, { topping: event.target.value as ToppingKind })} disabled={selectedSlice.kind !== "named"} aria-label="Selected bucket topping">
                      {(selectedSlice.kind === "named" ? TOPPING_OPTIONS : [{ value: selectedSlice.topping, label: TOPPING_LABELS[selectedSlice.topping] }]).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeSlice(selectedSlice.id)} disabled={selectedSlice.kind !== "named"}>Delete Bucket</button>
                  </div>
                </div>
              )}

              <div className="secondary-action-row">
                <button type="button" className="secondary-toggle-button" onClick={() => setShowAddBucket((value) => !value)}>
                  {showAddBucket ? "Hide Add Bucket" : "Add Bucket"}
                </button>
              </div>

              {showAddBucket && (
                <div className="multi-add-row collapsed-add-bucket-form">
                  <input value={newName} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewName(event.target.value)} placeholder="Bucket name" aria-label="New bucket name" />
                  <input inputMode="decimal" value={newAmount} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewAmount(event.target.value)} placeholder="Amount" aria-label="New bucket amount" />
                  <select value={newTopping} onChange={(event: ChangeEvent<HTMLSelectElement>) => setNewTopping(event.target.value as ToppingKind)} aria-label="New bucket topping">
                    {TOPPING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addBucket}>Save Bucket</button>
                </div>
              )}
            </div>
          )}

          {view === "data" && (
            <div className="workbench-grid json-tools data-tools compact-mobile-pane">
              <button type="button" className="full-button" onClick={exportJson}>Export Backup</button>
              <textarea value={importText} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setImportText(event.target.value)} placeholder="Paste backup JSON" aria-label="Import backup JSON" />
              <div className="data-button-grid">
                <button type="button" className="full-button" onClick={importJson}>Import Backup</button>
                {session ? (
                  <>
                    <button type="button" className="full-button" onClick={saveToCloud} disabled={cloudStatus === "working"}>Cloud Save</button>
                    <button type="button" className="full-button" onClick={loadFromCloud} disabled={cloudStatus === "working"}>Cloud Load</button>
                    <button type="button" className="full-button quiet-full-button" onClick={signOutCloud} disabled={cloudStatus === "working"}>Sign Out</button>
                  </>
                ) : (
                  <>
                    <input type="email" value={cloudEmail} onChange={(event: ChangeEvent<HTMLInputElement>) => setCloudEmail(event.target.value)} placeholder="Email for cloud backup" aria-label="Cloud backup email" />
                    <button type="button" className="full-button" onClick={sendSignInLink} disabled={!supabase || cloudStatus === "working"}>Cloud Backup</button>
                  </>
                )}
              </div>
              <p className="microcopy">{importMessage || cloudStatusText(cloudStatus, cloudMessage)}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
