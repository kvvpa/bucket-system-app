const STORAGE_KEY = "joey-bucket-board-v10";
const BUTTON_ID = "unassigned-adjust-button";
const DIALOG_ID = "unassigned-adjust-dialog";

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(next) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...next,
      lastSavedAt: new Date().toISOString(),
    })
  );
}

function closeDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

function applyUnassigned(value) {
  const state = readState();
  if (!state) {
    alert("No local board data found yet. Add money or save the board first.");
    return;
  }

  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  const nextUnassigned = Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;

  writeState({
    ...state,
    unassigned: nextUnassigned,
  });

  closeDialog();
  window.location.reload();
}

function openDialog() {
  if (document.getElementById(DIALOG_ID)) return;

  const state = readState();
  const current = state && typeof state.unassigned === "number" ? state.unassigned : 0;

  const overlay = document.createElement("div");
  overlay.id = DIALOG_ID;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.55)";
  overlay.style.backdropFilter = "blur(6px)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "16px";

  const card = document.createElement("div");
  card.style.width = "min(420px, 100%)";
  card.style.background = "rgba(24,24,27,0.98)";
  card.style.border = "1px solid rgba(63,63,70,0.9)";
  card.style.borderRadius = "24px";
  card.style.padding = "20px";
  card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.45)";
  card.style.color = "#fafafa";
  card.innerHTML = `
    <div style="font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#a1a1aa; margin-bottom:8px;">Unassigned cash</div>
    <div style="font-size:24px; font-weight:600; margin-bottom:8px;">Set spendable unassigned amount</div>
    <div style="font-size:14px; line-height:1.6; color:#a1a1aa; margin-bottom:16px;">Use this when you need to correct the live unassigned pool directly instead of faking a paycheck or moving bucket money around.</div>
    <label style="display:block; font-size:12px; text-transform:uppercase; letter-spacing:0.14em; color:#71717a; margin-bottom:8px;">New unassigned amount</label>
  `;

  const inputWrap = document.createElement("div");
  inputWrap.style.display = "flex";
  inputWrap.style.alignItems = "center";
  inputWrap.style.gap = "8px";
  inputWrap.style.border = "1px solid rgba(63,63,70,0.95)";
  inputWrap.style.background = "rgba(9,9,11,0.95)";
  inputWrap.style.borderRadius = "16px";
  inputWrap.style.padding = "12px 14px";
  inputWrap.style.marginBottom = "16px";

  const dollar = document.createElement("span");
  dollar.textContent = "$";
  dollar.style.color = "#71717a";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.value = String(current);
  input.style.width = "100%";
  input.style.background = "transparent";
  input.style.border = "0";
  input.style.outline = "none";
  input.style.color = "#fafafa";
  input.style.fontSize = "16px";
  input.style.textAlign = "right";

  inputWrap.append(dollar, input);
  card.appendChild(inputWrap);

  const actions = document.createElement("div");
  actions.style.display = "grid";
  actions.style.gridTemplateColumns = "1fr 1fr";
  actions.style.gap = "10px";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = closeDialog;
  cancel.style.border = "1px solid rgba(63,63,70,0.95)";
  cancel.style.background = "transparent";
  cancel.style.color = "#d4d4d8";
  cancel.style.borderRadius = "16px";
  cancel.style.padding = "12px 14px";
  cancel.style.cursor = "pointer";

  const apply = document.createElement("button");
  apply.textContent = "Apply";
  apply.onclick = () => applyUnassigned(input.value);
  apply.style.border = "1px solid rgba(244,244,245,0.95)";
  apply.style.background = "#f4f4f5";
  apply.style.color = "#09090b";
  apply.style.borderRadius = "16px";
  apply.style.padding = "12px 14px";
  apply.style.cursor = "pointer";
  apply.style.fontWeight = "600";

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyUnassigned(input.value);
    if (event.key === "Escape") closeDialog();
  });

  actions.append(cancel, apply);
  card.appendChild(actions);
  overlay.appendChild(card);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeDialog();
  });

  document.body.appendChild(overlay);
  input.focus();
  input.select();
}

function mountButton() {
  if (document.getElementById(BUTTON_ID)) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.textContent = "Adjust unassigned";
  button.type = "button";
  button.onclick = openDialog;
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "88px";
  button.style.zIndex = "9998";
  button.style.border = "1px solid rgba(63,63,70,0.95)";
  button.style.background = "rgba(9,9,11,0.94)";
  button.style.color = "#fafafa";
  button.style.borderRadius = "999px";
  button.style.padding = "12px 16px";
  button.style.fontSize = "12px";
  button.style.letterSpacing = "0.14em";
  button.style.textTransform = "uppercase";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";

  if (window.matchMedia("(min-width: 768px)").matches) {
    button.style.bottom = "24px";
  }

  document.body.appendChild(button);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountButton, { once: true });
} else {
  mountButton();
}
