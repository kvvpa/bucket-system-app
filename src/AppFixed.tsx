import { useEffect, useMemo, useState } from "react";
import logoPng from "./img/slice-board-logo.png";
import pizzaChartPng from "./img/slice-board-pizza-chart.png";

const STORAGE_KEY = "slice-board-v1";
const LEGACY_STORAGE_KEYS = ["joey-fidelity-pie-planner-v1"];

type ToppingKind =
  | "sauce"
  | "cheese"
  | "pepperoni"
  | "basil"
  | "mushroom"
  | "olive"
  | "pepper"
  | "onion";

type SliceKind = "unassigned" | "remaining" | "named";
type PieKey = "current" | "next";
type ToolMode = "change" | "add" | "subtract";
type ViewKey = "board" | "next" | "edit" | "json";

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
  activePie?: unknown;
  selectedSliceId?: unknown;
};

const TOPPING_OPTIONS: { value: ToppingKind; label: string }[] = [
  { value: "pepperoni", label: "Pepperoni" },
  { value: "basil", label: "Basil" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "pepper", label: "Pepper" },
  { value: "onion", label: "Onion" },
];

const ALL_TOPPING_LABELS: Record<ToppingKind, string> = {
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

function cloneSlices(slices: Slice[]): Slice[] {
  return slices.map((slice) => ({ ...slice, id: newId(slice.name) }));
}

function newId(seed = "slice"): string {
  return `${seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "slice"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toAmount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function money(value: number): string {
  return moneyFormatter.format(value || 0);
}

function inferKind(name: string, rawKind?: unknown): SliceKind {
  const lower = name.trim().toLowerCase();
  if (lower === "unassigned") return "unassigned";
  if (lower === "remaining") return "remaining";
  if (rawKind === "unassigned" || rawKind === "remaining" || rawKind === "named") return rawKind;
  return "named";
}

function isTopping(value: unknown): value is ToppingKind {
  return (
    value === "sauce" ||
    value === "cheese" ||
    value === "pepperoni" ||
    value === "basil" ||
    value === "mushroom" ||
    value === "olive" ||
    value === "pepper" ||
    value === "onion"
  );
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
  const rawTopping = source.topping;
  let topping: ToppingKind = isTopping(rawTopping) ? rawTopping : defaultToppingForName(name);

  if (kind === "unassigned") topping = "sauce";
  if (kind === "remaining") topping = "cheese";
  if (kind === "named" && (topping === "sauce" || topping === "cheese")) topping = defaultToppingForName(name);

  const normalized: Slice = {
    id: String(source.id ?? newId(name)),
    name,
    amount: toAmount(source.amount),
    topping,
    kind,
  };

  if (typeof source.color === "string") normalized.color = source.color;
  return normalized;
}

function normalizeSlices(value: unknown, fallback: Slice[] = []): Slice[] {
  if (!Array.isArray(value)) return cloneSlices(fallback);
  return value.map((item, index) => normalizeSlice(item, index));
}

function loadState(): { current: Slice[]; next: Slice[]; showNext: boolean; activePie: PieKey; selectedSliceId: string | null } {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

  for (const key of keys) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;

    try {
      const parsed = JSON.parse(stored) as StoredState;
      const current = normalizeSlices(parsed.current ?? parsed.currentPie ?? parsed.slices, STARTER_CURRENT);
      const next = normalizeSlices(parsed.next ?? parsed.nextPie, []);
      const activePie: PieKey = parsed.activePie === "next" ? "next" : "current";
      const selectedSliceId = typeof parsed.selectedSliceId === "string" ? parsed.selectedSliceId : current[0]?.id ?? null;
      return {
        current,
        next,
        showNext: parsed.showNext === false ? false : true,
        activePie,
        selectedSliceId,
      };
    } catch {
      // Keep searching fallback storage keys.
    }
  }

  return {
    current: cloneSlices(STARTER_CURRENT),
    next: [],
    showNext: true,
    activePie: "current",
    selectedSliceId: null,
  };
}

function totalFor(slices: Slice[]): number {
  return slices.reduce((sum, slice) => sum + Math.max(0, slice.amount), 0);
}

function allocatedFor(slices: Slice[]): number {
  return slices.reduce((sum, slice) => (slice.kind === "named" ? sum + Math.max(0, slice.amount) : sum), 0);
}

function percentFor(slice: Slice, total: number): number {
  return total > 0 ? Math.max(0, slice.amount) / total : 0;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function wedgePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
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
    const segment = {
      slice,
      startAngle: angle,
      endAngle: angle + span,
      span,
    };
    angle += span;
    return segment;
  });
}

function PizzaWindowChart({ slices, title }: { slices: Slice[]; title: string }) {
  const segments = useMemo(() => buildSegments(slices), [slices]);
  const total = totalFor(slices);
  const chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const cx = 160;
  const cy = 160;
  const outerRadius = 144;
  const innerRadius = 64;

  return (
    <div className="pizza-chart-wrap" aria-label={`${title} pizza allocation chart`}>
      <svg className="pizza-chart-svg" viewBox="0 0 320 320" role="img" aria-label={`${title} proportional raster pizza chart`}>
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
        </defs>

        <circle cx={cx} cy={cy} r={outerRadius + 4} className="pizza-glow-ring" />

        {segments.length === 0 ? (
          <image href={pizzaChartPng} x="16" y="16" width="288" height="288" preserveAspectRatio="xMidYMid slice" opacity="0.32" />
        ) : (
          segments.map((segment, index) => (
            <g key={segment.slice.id} clipPath={`url(#${chartId}-clip-${index})`}>
              <image href={pizzaChartPng} x="16" y="16" width="288" height="288" preserveAspectRatio="xMidYMid slice" />
            </g>
          ))
        )}

        <circle cx={cx} cy={cy} r={outerRadius} fill={`url(#${chartId}-shade)`} className="pizza-surface-shade" />
        {segments.map((segment) => {
          if (segment.span >= 359.9) return null;
          const outer = polarPoint(cx, cy, outerRadius, segment.endAngle);
          const inner = polarPoint(cx, cy, innerRadius, segment.endAngle);
          return (
            <line key={`${segment.slice.id}-separator`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="pizza-slice-separator" />
          );
        })}
        <circle cx={cx} cy={cy} r={innerRadius} className="pizza-center-hole" />
        <circle cx={cx} cy={cy} r={outerRadius} className="pizza-outer-stroke" />
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

function App() {
  const initial = useMemo(loadState, []);
  const [current, setCurrent] = useState<Slice[]>(initial.current);
  const [next, setNext] = useState<Slice[]>(initial.next);
  const [showNext, setShowNext] = useState(initial.showNext);
  const [activePie, setActivePie] = useState<PieKey>(initial.activePie);
  const [view, setView] = useState<ViewKey>("board");
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(initial.selectedSliceId);
  const [toolMode, setToolMode] = useState<ToolMode>("change");
  const [toolAmount, setToolAmount] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newTopping, setNewTopping] = useState<ToppingKind>("pepperoni");
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");

  const displayPie: PieKey = view === "next" ? "next" : activePie;
  const displaySlices = displayPie === "current" ? current : next;
  const activeSlices = activePie === "current" ? current : next;
  const displayTotal = totalFor(displaySlices);
  const currentTotal = totalFor(current);
  const currentAllocated = allocatedFor(current);
  const selectedSlice = activeSlices.find((slice) => slice.id === selectedSliceId) ?? activeSlices[0] ?? null;

  useEffect(() => {
    if (!activeSlices.length) {
      if (selectedSliceId !== null) setSelectedSliceId(null);
      return;
    }
    if (!activeSlices.some((slice) => slice.id === selectedSliceId)) {
      setSelectedSliceId(activeSlices[0].id);
    }
  }, [activePie, activeSlices, selectedSliceId]);

  useEffect(() => {
    const payload = {
      app: "Slice Board",
      version: 3,
      current,
      next,
      showNext,
      activePie,
      selectedSliceId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [current, next, showNext, activePie, selectedSliceId]);

  function setActiveView(nextView: ViewKey) {
    setView(nextView);
    if (nextView === "next") setActivePie("next");
    if (nextView === "board") setActivePie("current");
  }

  function updateActivePie(updater: (slices: Slice[]) => Slice[]) {
    if (activePie === "current") setCurrent(updater);
    else setNext(updater);
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
        const nextAmount = toolMode === "add" ? slice.amount + value : toolMode === "subtract" ? Math.max(0, slice.amount - value) : value;
        return { ...slice, amount: nextAmount };
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

  function copyCurrentToNext() {
    setNext(cloneSlices(current));
    setShowNext(true);
    setActivePie("next");
    setView("next");
  }

  function clearNextPie() {
    setNext([]);
    if (activePie === "next") setSelectedSliceId(null);
  }

  function loadStarterIntoActive() {
    const starter = cloneSlices(STARTER_CURRENT);
    if (activePie === "current") setCurrent(starter);
    else setNext(starter);
    setSelectedSliceId(starter[0]?.id ?? null);
  }

  function exportJson() {
    const payload = JSON.stringify(
      {
        app: "Slice Board",
        version: 3,
        current,
        next,
        showNext,
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "slice-board-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importJson() {
    try {
      const parsed = JSON.parse(importText) as StoredState;
      const importedCurrent = normalizeSlices(parsed.current ?? parsed.currentPie ?? parsed.slices, current);
      const importedNext = normalizeSlices(parsed.next ?? parsed.nextPie, next);
      setCurrent(importedCurrent);
      setNext(importedNext);
      setShowNext(parsed.showNext === false ? false : true);
      setActivePie("current");
      setView("board");
      setSelectedSliceId(importedCurrent[0]?.id ?? null);
      setImportMessage("Imported JSON into Slice Board.");
    } catch {
      setImportMessage("Import failed. Paste valid Slice Board JSON and try again.");
    }
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
          <StatCard label="Active" value={activePie === "current" ? "Current" : "Next"} />
          <StatCard label="Total" value={money(currentTotal)} />
          <StatCard label="Allocated" value={money(currentAllocated)} />
        </section>

        <section className="screen-card chart-stage">
          <div className="stage-heading">
            <div>
              <p className="eyebrow">{displayPie === "current" ? "Current Pie" : "Next Pie"}</p>
              <h2>{money(displayTotal)}</h2>
            </div>
            <span className="temp-badge">Temp raster</span>
          </div>
          {displayPie === "next" && !showNext ? (
            <div className="hidden-next-note">Next pie is hidden. Tap Show in Next.</div>
          ) : (
            <PizzaWindowChart slices={displaySlices} title={displayPie === "current" ? "Current Pie" : "Next Pie"} />
          )}
          <SliceList slices={displaySlices} total={displayTotal} selectedSliceId={selectedSliceId} onSelect={setSelectedSliceId} compact />
        </section>

        <nav className="view-tabs" aria-label="Slice Board sections">
          <button className={view === "board" ? "active" : ""} type="button" onClick={() => setActiveView("board")}>Board</button>
          <button className={view === "next" ? "active" : ""} type="button" onClick={() => setActiveView("next")}>Next</button>
          <button className={view === "edit" ? "active" : ""} type="button" onClick={() => setActiveView("edit")}>Edit</button>
          <button className={view === "json" ? "active" : ""} type="button" onClick={() => setActiveView("json")}>JSON</button>
        </nav>

        <section className="screen-card workbench">
          {view === "board" ? (
            <div className="workbench-grid board-tools">
              <div className="selected-chip">
                <span>{selectedSlice ? selectedSlice.name : "No slice"}</span>
                <strong>{selectedSlice ? money(selectedSlice.amount) : "--"}</strong>
              </div>
              <div className="segmented compact-segmented">
                {(["change", "add", "subtract"] as ToolMode[]).map((mode) => (
                  <button key={mode} className={toolMode === mode ? "active" : ""} type="button" onClick={() => setToolMode(mode)}>
                    {mode === "change" ? "Change" : mode === "add" ? "Add" : "Sub"}
                  </button>
                ))}
              </div>
              <div className="inline-form">
                <input inputMode="decimal" placeholder="Amount" value={toolAmount} onChange={(event) => setToolAmount(event.target.value)} />
                <button type="button" onClick={applyAmountTool} disabled={!selectedSlice}>Apply</button>
              </div>
            </div>
          ) : null}

          {view === "next" ? (
            <div className="workbench-grid next-tools">
              <div className="action-row tight-row">
                <button type="button" onClick={() => setShowNext((value) => !value)}>{showNext ? "Hide next" : "Show next"}</button>
                <button type="button" onClick={copyCurrentToNext}>Copy current</button>
                <button type="button" onClick={clearNextPie}>Clear next</button>
              </div>
              <p className="microcopy">Next total: {money(totalFor(next))}. This keeps next-pie planning on this screen without stacking another full chart.</p>
            </div>
          ) : null}

          {view === "edit" ? (
            <div className="workbench-grid edit-tools">
              <div className="pie-toggle compact-toggle" role="group" aria-label="Choose active pie">
                <button className={activePie === "current" ? "active" : ""} type="button" onClick={() => setActivePie("current")}>Current</button>
                <button className={activePie === "next" ? "active" : ""} type="button" onClick={() => setActivePie("next")}>Next</button>
              </div>
              {selectedSlice ? (
                <div className="compact-editor">
                  <input aria-label="Bucket name" value={selectedSlice.name} onChange={(event) => updateSlice(selectedSlice.id, { name: event.target.value })} />
                  <input aria-label="Amount" inputMode="decimal" value={String(selectedSlice.amount)} onChange={(event) => updateSlice(selectedSlice.id, { amount: toAmount(event.target.value) })} />
                  <select
                    aria-label="Topping identity"
                    value={selectedSlice.topping}
                    disabled={selectedSlice.kind !== "named"}
                    onChange={(event) => updateSlice(selectedSlice.id, { topping: event.target.value as ToppingKind })}
                  >
                    {selectedSlice.kind === "unassigned" ? <option value="sauce">Sauce only</option> : null}
                    {selectedSlice.kind === "remaining" ? <option value="cheese">Plain cheese</option> : null}
                    {selectedSlice.kind === "named"
                      ? TOPPING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))
                      : null}
                  </select>
                  <button type="button" onClick={() => removeSlice(selectedSlice.id)}>Remove</button>
                </div>
              ) : (
                <p className="empty-note">No selected slice.</p>
              )}
              <div className="compact-editor add-row">
                <input aria-label="New bucket name" placeholder="New bucket" value={newName} onChange={(event) => setNewName(event.target.value)} />
                <input aria-label="New bucket amount" inputMode="decimal" placeholder="$" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} />
                <select aria-label="New bucket topping" value={newTopping} onChange={(event) => setNewTopping(event.target.value as ToppingKind)}>
                  {TOPPING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button type="button" onClick={addBucket}>Add</button>
              </div>
              <button className="full-button" type="button" onClick={loadStarterIntoActive}>Load starter sections</button>
            </div>
          ) : null}

          {view === "json" ? (
            <div className="workbench-grid json-tools">
              <div className="action-row tight-row">
                <button type="button" onClick={exportJson}>Export JSON</button>
                <button type="button" onClick={importJson}>Import JSON</button>
              </div>
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste Slice Board JSON here." />
              {importMessage ? <p className="microcopy">{importMessage}</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SliceList({
  slices,
  total,
  selectedSliceId,
  onSelect,
  compact = false,
}: {
  slices: Slice[];
  total: number;
  selectedSliceId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  if (!slices.length) return <p className="empty-note">No slices yet.</p>;

  return (
    <div className={compact ? "slice-list compact-list" : "slice-list"}>
      {slices.map((slice) => {
        const pct = percentFor(slice, total) * 100;
        return (
          <button key={slice.id} type="button" className={`slice-row ${selectedSliceId === slice.id ? "selected" : ""}`} onClick={() => onSelect(slice.id)}>
            <span>
              <strong>{slice.name}</strong>
              <small>{ALL_TOPPING_LABELS[slice.topping]}</small>
            </span>
            <span className="slice-values">
              <strong>{pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%</strong>
              <small>{money(slice.amount)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default App;
