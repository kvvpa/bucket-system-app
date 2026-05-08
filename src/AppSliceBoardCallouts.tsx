import { useEffect, useMemo, useState } from "react";
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

type ToppingKind = "sauce" | "cheese" | "pepperoni" | "basil" | "mushroom" | "olive" | "pepper" | "onion";
type SliceKind = "unassigned" | "remaining" | "named";
type PieKey = "current" | "planning";
type ViewKey = "current" | "planning" | "edit" | "json";
type ToolMode = "change" | "add" | "subtract";
type CloudStatus = "idle" | "working" | "success" | "error";

type Slice = {
  id: string;
  name: string;
  amount: number;
  color?: string;
  topping: ToppingKind;
  kind?: SliceKind;
};

type StoredState = {
  current?: unknown;
  next?: unknown;
  currentPie?: unknown;
  nextPie?: unknown;
  slices?: unknown;
  showNext?: unknown;
  planningVisible?: unknown;
  activePie?: unknown;
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
    color: typeof source.color === "string" ? source.color : undefined,
    topping,
    kind,
  };
}

function normalizeSlices(value: unknown, fallback: Slice[] = []) {
  if (!Array.isArray(value)) return cloneSlices(fallback);
  return value.map((item, index) => normalizeSlice(item, index));
}

function storedPie(value: unknown): PieKey {
  return value === "planning" || value === "next" ? "planning" : "current";
}

function loadState() {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;
    try {
      const parsed = JSON.parse(stored) as StoredState;
      const current = normalizeSlices(parsed.current ?? parsed.currentPie ?? parsed.slices, STARTER_CURRENT);
      const planning = normalizeSlices(parsed.next ?? parsed.nextPie, []);
      const planningVisible = parsed.planningVisible === false || parsed.showNext === false ? false : true;
      return {
        current,
        planning,
        planningVisible,
        activePie: planningVisible ? storedPie(parsed.activePie) : "current",
        selectedSliceId: typeof parsed.selectedSliceId === "string" ? parsed.selectedSliceId : current[0]?.id ?? null,
      };
    } catch {
      // Try next key.
    }
  }
  return { current: cloneSlices(STARTER_CURRENT), planning: [], planningVisible: true, activePie: "current" as PieKey, selectedSliceId: null };
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
  return "Local backup remains active on this device.";
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

function PizzaWindowChart({
  slices,
  title,
  selectedSliceId,
  onSelect,
}: {
  slices: Slice[];
  title: string;
  selectedSliceId: string | null;
  onSelect: (id: string) => void;
}) {
  const segments = useMemo(() => buildSegments(slices), [slices]);
  const total = totalFor(slices);
  const chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const cx = 190;
  const cy = 172;
  const outerRadius = 118;
  const innerRadius = 53;
  const imageX = cx - outerRadius;
  const imageY = cy - outerRadius;
  const imageSize = outerRadius * 2;

  return (
    <div className="pizza-chart-wrap callout-chart-wrap" aria-label={`${title} allocation chart`}>
      <svg className="pizza-chart-svg callout-chart-svg" viewBox="0 0 380 344" role="img" aria-label={`${title} proportional raster pizza chart`}>
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
            <rect x="0" y="0" width="380" height="344" fill="black" />
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
          {segments.map((segment) => {
            const midAngle = segment.startAngle + segment.span / 2;
            const lineStart = polarPoint(cx, cy, outerRadius + 3, midAngle);
            const lineBend = polarPoint(cx, cy, outerRadius + 20, midAngle);
            const rightSide = Math.cos(((midAngle - 90) * Math.PI) / 180) >= 0;
            const labelX = rightSide ? Math.min(360, lineBend.x + 34) : Math.max(20, lineBend.x - 34);
            const labelY = Math.max(28, Math.min(318, lineBend.y));
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

function SelectedSlicePanel({ slices, total, selectedSliceId }: { slices: Slice[]; total: number; selectedSliceId: string | null }) {
  const selected = slices.find((slice) => slice.id === selectedSliceId) ?? slices[0] ?? null;
  if (!selected) return <div className="mobile-selected-panel callout-selected-panel">No slices yet.</div>;
  const percent = percentFor(selected, total) * 100;

  return (
    <div className="mobile-selected-panel callout-selected-panel">
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
      <p>Tap a slice label to switch buckets.</p>
    </div>
  );
}

function App() {
  const initial = useMemo(loadState, []);
  const [current, setCurrent] = useState<Slice[]>(initial.current);
  const [planning, setPlanning] = useState<Slice[]>(initial.planning);
  const [planningVisible, setPlanningVisible] = useState(initial.planningVisible);
  const [activePie, setActivePie] = useState<PieKey>(initial.activePie);
  const [view, setView] = useState<ViewKey>("current");
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(initial.selectedSliceId);
  const [toolMode, setToolMode] = useState<ToolMode>("change");
  const [toolAmount, setToolAmount] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newTopping, setNewTopping] = useState<ToppingKind>("pepperoni");
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("idle");
  const [cloudMessage, setCloudMessage] = useState("");

  const safeActivePie: PieKey = planningVisible ? activePie : "current";
  const displayPie: PieKey = view === "planning" && planningVisible ? "planning" : safeActivePie;
  const displaySlices = displayPie === "current" ? current : planning;
  const activeSlices = safeActivePie === "current" ? current : planning;
  const selectedSlice = activeSlices.find((slice) => slice.id === selectedSliceId) ?? activeSlices[0] ?? null;
  const currentTotal = totalFor(current);
  const displayTotal = totalFor(displaySlices);
  const displayTitle = displayPie === "current" ? "Current Pie" : "Planning Pie";

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!planningVisible && (activePie === "planning" || view === "planning")) {
      setActivePie("current");
      setView("current");
      setSelectedSliceId(current[0]?.id ?? null);
    }
  }, [planningVisible, activePie, view, current]);

  useEffect(() => {
    if (!activeSlices.length) {
      if (selectedSliceId !== null) setSelectedSliceId(null);
      return;
    }
    if (!activeSlices.some((slice) => slice.id === selectedSliceId)) setSelectedSliceId(activeSlices[0].id);
  }, [activeSlices, selectedSliceId]);

  const payload = useMemo(
    () => ({
      app: "Slice Board",
      version: 9,
      current,
      next: planning,
      planningVisible,
      showNext: planningVisible,
      activePie: safeActivePie === "planning" ? "next" : "current",
      selectedSliceId,
    }),
    [current, planning, planningVisible, safeActivePie, selectedSliceId],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [payload]);

  function setActiveView(nextView: ViewKey) {
    if (nextView === "planning" && !planningVisible) return;
    setView(nextView);
    if (nextView === "current") setActivePie("current");
    if (nextView === "planning") setActivePie("planning");
  }

  function updateActivePie(updater: (slices: Slice[]) => Slice[]) {
    if (safeActivePie === "current") setCurrent(updater);
    else setPlanning(updater);
  }

  function updateSlice(id: string, patch: Partial<Slice>) {
    updateActivePie((slices) => slices.map((slice, index) => (slice.id === id ? normalizeSlice({ ...slice, ...patch }, index) : slice)));
  }

  function removeSlice(id: string) {
    updateActivePie((slices) => slices.filter((slice) => slice.id !== id));
  }

  function applyAmountTool() {
    if (!selectedSlice) return;
    const value = toAmount(toolAmount);
    updateActivePie((slices) =>
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
    updateActivePie((slices) => [...slices, slice]);
    setSelectedSliceId(slice.id);
    setNewName("");
    setNewAmount("");
    setNewTopping("pepperoni");
  }

  function showPlanningPie() {
    setPlanningVisible(true);
    setActivePie("planning");
    setView("planning");
    setSelectedSliceId(planning[0]?.id ?? null);
  }

  function hidePlanningPie() {
    setPlanningVisible(false);
    setActivePie("current");
    setView("current");
    setSelectedSliceId(current[0]?.id ?? null);
  }

  function copyCurrentToPlanning() {
    const copied = cloneSlices(current);
    setPlanning(copied);
    setPlanningVisible(true);
    setActivePie("planning");
    setView("planning");
    setSelectedSliceId(copied[0]?.id ?? null);
  }

  function clearPlanningPie() {
    setPlanning([]);
    if (safeActivePie === "planning") setSelectedSliceId(null);
  }

  function loadStarterIntoActive() {
    const starter = cloneSlices(STARTER_CURRENT);
    if (safeActivePie === "current") setCurrent(starter);
    else setPlanning(starter);
    setSelectedSliceId(starter[0]?.id ?? null);
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
    const importedCurrent = normalizeSlices(parsed.current ?? parsed.currentPie ?? parsed.slices, current);
    const importedPlanning = normalizeSlices(parsed.next ?? parsed.nextPie, planning);
    const importedPlanningVisible = parsed.planningVisible === false || parsed.showNext === false ? false : true;
    setCurrent(importedCurrent);
    setPlanning(importedPlanning);
    setPlanningVisible(importedPlanningVisible);
    setActivePie("current");
    setView("current");
    setSelectedSliceId(importedCurrent[0]?.id ?? null);
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
    if (!data?.payload || typeof data.payload !== "object") {
      setCloudStatus("error");
      setCloudMessage("No cloud backup found for this account yet.");
      return;
    }
    applyImportedPayload(data.payload as StoredState);
    setCloudStatus("success");
    setCloudMessage("Loaded cloud backup into Slice Board.");
  }

  return (
    <main className="app-shell">
      <div className="dashboard-frame">
        <header className="hero-card">
          <img className="hero-logo" src={logoPng} alt="Slice Board pizza logo" />
          <div>
            <p className="eyebrow">Pizza-coded allocation</p>
            <h1>Slice Board</h1>
            <p className="hero-subtitle">Plan your balance.</p>
          </div>
        </header>

        <section className="stats-grid" aria-label="Current pie stats">
          <StatCard label="Active" value={safeActivePie === "current" ? "Current Pie" : "Planning Pie"} />
          <StatCard label="Total" value={money(currentTotal)} />
          <StatCard label="Allocated" value={money(allocatedFor(current))} />
        </section>

        <section className="screen-card chart-stage callout-stage">
          <div className="stage-heading">
            <div>
              <p className="eyebrow">{displayTitle}</p>
              <h2>{money(displayTotal)}</h2>
            </div>
            <span className="temp-badge">Raster slices</span>
          </div>
          <PizzaWindowChart slices={displaySlices} title={displayTitle} selectedSliceId={selectedSliceId} onSelect={setSelectedSliceId} />
          <SelectedSlicePanel slices={displaySlices} total={displayTotal} selectedSliceId={selectedSliceId} />
        </section>

        <nav className={`view-tabs ${planningVisible ? "" : "planning-hidden"}`} aria-label="Slice Board sections">
          <button className={view === "current" ? "active" : ""} type="button" onClick={() => setActiveView("current")}>Current Pie</button>
          {planningVisible ? <button className={view === "planning" ? "active" : ""} type="button" onClick={() => setActiveView("planning")}>Planning Pie</button> : null}
          <button className={view === "edit" ? "active" : ""} type="button" onClick={() => setActiveView("edit")}>Edit</button>
          <button className={view === "json" ? "active" : ""} type="button" onClick={() => setActiveView("json")}>Data</button>
        </nav>

        <section className="screen-card workbench">
          {view === "current" ? (
            <div className="workbench-grid board-tools">
              <div className="segmented compact-segmented">
                {(["change", "add", "subtract"] as ToolMode[]).map((mode) => (
                  <button key={mode} className={toolMode === mode ? "active" : ""} type="button" onClick={() => setToolMode(mode)}>{mode === "change" ? "Change" : mode === "add" ? "Add" : "Sub"}</button>
                ))}
              </div>
              <div className="inline-form">
                <input inputMode="decimal" placeholder={selectedSlice ? `Amount for ${selectedSlice.name}` : "Amount"} value={toolAmount} onChange={(event) => setToolAmount(event.target.value)} />
                <button type="button" onClick={applyAmountTool} disabled={!selectedSlice}>Apply</button>
              </div>
              {!planningVisible ? <div className="action-row tight-row"><button type="button" onClick={showPlanningPie}>Show Planning Pie</button></div> : null}
            </div>
          ) : null}

          {view === "planning" && planningVisible ? (
            <div className="workbench-grid next-tools">
              <div className="action-row tight-row">
                <button type="button" onClick={hidePlanningPie}>Hide Planning Pie</button>
                <button type="button" onClick={copyCurrentToPlanning}>Copy Current Pie</button>
                <button type="button" onClick={clearPlanningPie}>Clear Planning Pie</button>
              </div>
              <p className="microcopy">Planning total: {money(totalFor(planning))}. Hiding Planning Pie removes it from the UI without deleting its saved data.</p>
            </div>
          ) : null}

          {view === "edit" ? (
            <div className="workbench-grid edit-tools">
              {planningVisible ? (
                <div className="pie-toggle compact-toggle" role="group" aria-label="Choose active pie">
                  <button className={safeActivePie === "current" ? "active" : ""} type="button" onClick={() => setActivePie("current")}>Current Pie</button>
                  <button className={safeActivePie === "planning" ? "active" : ""} type="button" onClick={() => setActivePie("planning")}>Planning Pie</button>
                </div>
              ) : null}
              {selectedSlice ? (
                <div className="compact-editor">
                  <input aria-label="Bucket name" value={selectedSlice.name} onChange={(event) => updateSlice(selectedSlice.id, { name: event.target.value })} />
                  <input aria-label="Amount" inputMode="decimal" value={String(selectedSlice.amount)} onChange={(event) => updateSlice(selectedSlice.id, { amount: toAmount(event.target.value) })} />
                  <select aria-label="Topping identity" value={selectedSlice.topping} disabled={selectedSlice.kind !== "named"} onChange={(event) => updateSlice(selectedSlice.id, { topping: event.target.value as ToppingKind })}>
                    {selectedSlice.kind === "unassigned" ? <option value="sauce">Sauce only</option> : null}
                    {selectedSlice.kind === "remaining" ? <option value="cheese">Plain cheese</option> : null}
                    {selectedSlice.kind === "named" ? TOPPING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
                  </select>
                  <button type="button" onClick={() => removeSlice(selectedSlice.id)}>Remove</button>
                </div>
              ) : <p className="empty-note">No selected slice.</p>}
              <div className="compact-editor add-row">
                <input aria-label="New bucket name" placeholder="New bucket" value={newName} onChange={(event) => setNewName(event.target.value)} />
                <input aria-label="New bucket amount" inputMode="decimal" placeholder="$" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} />
                <select aria-label="New bucket topping" value={newTopping} onChange={(event) => setNewTopping(event.target.value as ToppingKind)}>{TOPPING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                <button type="button" onClick={addBucket}>Add</button>
              </div>
              <button className="full-button" type="button" onClick={loadStarterIntoActive}>Load starter sections</button>
            </div>
          ) : null}

          {view === "json" ? (
            <div className="workbench-grid json-tools data-tools">
              <div className="action-row tight-row">
                <button type="button" onClick={exportJson}>Export Backup</button>
                <button type="button" onClick={importJson}>Import Backup</button>
              </div>
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste Slice Board JSON here." />
              {importMessage ? <p className="microcopy">{importMessage}</p> : null}
              <div className="cloud-data-panel">
                <div className="cloud-heading"><strong>Cloud Backup</strong><span>{session?.user ? session.user.email ?? "Signed in" : "Email sign-in"}</span></div>
                {!isSupabaseConfigured ? (
                  <p className="cloud-message error">Cloud backup is not configured for this build.</p>
                ) : session?.user ? (
                  <div className="cloud-actions">
                    <button type="button" onClick={saveToCloud}>Save to Cloud</button>
                    <button type="button" onClick={loadFromCloud}>Load from Cloud</button>
                    <button type="button" onClick={signOutCloud}>Sign Out</button>
                  </div>
                ) : (
                  <div className="cloud-signin-row">
                    <input type="email" placeholder="Email for sign-in link" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} />
                    <button type="button" onClick={sendSignInLink}>Send Link</button>
                  </div>
                )}
                <p className={`cloud-message ${cloudStatus}`}>{cloudStatusText(cloudStatus, cloudMessage)}</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default App;
