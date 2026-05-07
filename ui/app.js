const state = {
  controls: [],
  bindings: {},
  descriptions: {},
  selected: "k1",
  layer: 1,
  firmwareLayer: 0,
  busy: false,
  liveActive: [],
  liveUnknown: [],
  liveError: null,
  liveSignature: "",
};

const els = {
  deviceStatus: document.querySelector("#deviceStatus"),
  layerSelect: document.querySelector("#layerSelect"),
  firmwareLayerLabel: document.querySelector("#firmwareLayerLabel"),
  refreshButton: document.querySelector("#refreshButton"),
  keyGrid: document.querySelector("#keyGrid"),
  knobArea: document.querySelector("#knobArea"),
  selectedName: document.querySelector("#selectedName"),
  selectedKind: document.querySelector("#selectedKind"),
  bindingInput: document.querySelector("#bindingInput"),
  translatedValue: document.querySelector("#translatedValue"),
  outputValue: document.querySelector("#outputValue"),
  liveStatus: document.querySelector("#liveStatus"),
  liveActive: document.querySelector("#liveActive"),
  liveOutput: document.querySelector("#liveOutput"),
  saveButton: document.querySelector("#saveButton"),
  reloadSelectedButton: document.querySelector("#reloadSelectedButton"),
  message: document.querySelector("#message"),
  quickMap: document.querySelector(".quick-map"),
};

init();

async function init() {
  for (let layer = 1; layer <= 9; layer += 1) {
    const option = document.createElement("option");
    option.value = String(layer);
    option.textContent = String(layer);
    els.layerSelect.append(option);
  }
  els.layerSelect.value = String(state.layer);

  wireEvents();
  await loadControls();
  await refreshAll();
  window.setInterval(refreshLiveInput, 110);
}

function wireEvents() {
  els.refreshButton.addEventListener("click", refreshAll);
  els.layerSelect.addEventListener("change", async () => {
    state.layer = Number(els.layerSelect.value);
    await refreshAll();
  });
  els.bindingInput.addEventListener("input", debounce(updateTranslation, 160));
  els.saveButton.addEventListener("click", saveSelected);
  els.reloadSelectedButton.addEventListener("click", refreshAll);
  els.quickMap.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    els.bindingInput.value = button.dataset.value;
    updateTranslation();
  });
}

async function loadControls() {
  const payload = await apiGet("/api/controls");
  state.controls = payload.controls;
  renderPad();
}

async function refreshAll() {
  setBusy(true);
  setMessage("Reading device layer " + state.layer + "...", "");
  try {
    const status = await apiGet("/api/status");
    const bindings = await apiGet(`/api/bindings?layer=${state.layer}`);
    state.bindings = bindings.bindings;
    state.descriptions = bindings.descriptions ?? {};
    state.firmwareLayer = bindings.firmwareLayer;
    renderStatus(status.device);
    renderPad();
    syncEditor();
    syncLayerLabel();
    setMessage("Device layer " + state.layer + " loaded.", "ok");
  } catch (error) {
    setMessage(error.message, "bad");
    renderPad();
  } finally {
    setBusy(false);
  }
}

async function saveSelected() {
  const value = els.bindingInput.value.trim();
  if (!value) {
    setMessage("Binding is empty.", "bad");
    return;
  }

  setBusy(true);
  setMessage("Writing " + state.selected + "...", "");
  try {
    const result = await apiPost("/api/binding", {
      control: state.selected,
      value,
      layer: state.layer,
    });
    state.bindings[state.selected] = result.keycode;
    state.descriptions[state.selected] = result.output;
    state.firmwareLayer = result.firmwareLayer;
    renderPad();
    syncEditor();
    syncLayerLabel();
    setMessage(`${state.selected} saved on device layer ${state.layer} as ${result.keycode}.`, "ok");
  } catch (error) {
    setMessage(error.message, "bad");
  } finally {
    setBusy(false);
  }
}

async function updateTranslation() {
  const value = els.bindingInput.value.trim();
  if (!value) {
    els.translatedValue.textContent = "-";
    els.outputValue.textContent = "-";
    return;
  }
  try {
    const result = await apiPost("/api/translate", { value });
    els.translatedValue.textContent = result.keycode;
    els.outputValue.textContent = outputText(result.output);
  } catch (error) {
    els.translatedValue.textContent = error.message;
    els.outputValue.textContent = "-";
  }
}

async function refreshLiveInput() {
  if (state.busy) return;
  try {
    const payload = await apiGet(`/api/live-input?layer=${state.layer}`);
    const unknown = payload.unknownActive ?? [];
    const nextSignature = [
      ...(payload.active ?? []).map((item) => item.name),
      ...unknown.map((item) => `matrix ${item.matrix.join(",")}`),
    ].join("|");
    state.liveActive = payload.active ?? [];
    state.liveUnknown = unknown;
    state.liveError = null;
    renderLiveInput();
    if (nextSignature !== state.liveSignature) {
      state.liveSignature = nextSignature;
      renderPad();
    }
  } catch (error) {
    const hadActiveControls = Boolean(state.liveSignature);
    state.liveActive = [];
    state.liveUnknown = [];
    state.liveError = error.message;
    state.liveSignature = "";
    renderLiveInput();
    if (hadActiveControls) renderPad();
  }
}

function renderStatus(device) {
  els.deviceStatus.textContent = device.connected ? "Raw HID device connected" : "Raw HID device not visible";
  els.deviceStatus.className = device.connected ? "device-ok" : "device-bad";
}

function renderPad() {
  renderKeys();
  renderKnobs();
}

function renderKeys() {
  els.keyGrid.replaceChildren();
  for (const control of state.controls.filter((item) => item.kind === "key")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key-button";
    if (control.name === state.selected) button.classList.add("selected");
    if (isLiveActive(control.name)) button.classList.add("active");
    button.innerHTML = `
      <span class="control-name"></span>
      <span class="binding-label"></span>
    `;
    button.querySelector(".control-name").textContent = control.name;
    button.querySelector(".binding-label").textContent = displayBindingFor(control.name);
    button.addEventListener("click", () => selectControl(control.name));
    els.keyGrid.append(button);
  }
}

function renderKnobs() {
  els.knobArea.replaceChildren();

  const small = document.createElement("div");
  small.className = "small-knobs";
  small.append(renderKnob("w1", "small"));
  small.append(renderKnob("w2", "small"));
  els.knobArea.append(small);
  els.knobArea.append(renderKnob("w3", "large"));
}

function renderKnob(name, size) {
  const cluster = document.createElement("div");
  cluster.className = `knob-cluster ${size}`;
  cluster.innerHTML = `
    <div class="knob-label"></div>
    <div class="knob-face"></div>
    <div class="knob-actions"></div>
  `;
  cluster.querySelector(".knob-label").textContent = name;
  cluster.querySelector(".knob-face").textContent = name;

  const actions = cluster.querySelector(".knob-actions");
  for (const suffix of ["ccw", "press", "cw"]) {
    const controlName = `${name}_${suffix}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knob-action";
    if (controlName === state.selected) button.classList.add("selected");
    if (isLiveActive(controlName)) button.classList.add("active");
    button.innerHTML = `<span></span><code></code>`;
    button.querySelector("span").textContent = suffix;
    button.querySelector("code").textContent = displayBindingFor(controlName);
    button.addEventListener("click", () => selectControl(controlName));
    actions.append(button);
  }

  return cluster;
}

function selectControl(name) {
  state.selected = name;
  renderPad();
  syncEditor();
}

function syncEditor() {
  const selected = state.controls.find((control) => control.name === state.selected);
  els.selectedName.textContent = state.selected;
  els.selectedKind.textContent = selected?.kind ?? "control";
  els.bindingInput.value = bindingFor(state.selected);
  els.translatedValue.textContent = bindingFor(state.selected);
  els.outputValue.textContent = outputText(state.descriptions[state.selected]);
}

function renderLiveInput() {
  if (state.liveError) {
    els.liveStatus.textContent = "Offline";
    els.liveActive.textContent = "Raw HID live read failed";
    els.liveOutput.textContent = state.liveError;
    return;
  }

  if (!state.liveActive.length && !state.liveUnknown.length) {
    els.liveStatus.textContent = "Listening";
    els.liveActive.textContent = "No control pressed";
    els.liveOutput.textContent = "-";
    return;
  }

  els.liveStatus.textContent = "Pressed";
  els.liveActive.textContent = [
    ...state.liveActive.map((item) => item.name),
    ...state.liveUnknown.map((item) => `matrix ${item.matrix.join(",")}`),
  ].join(", ");
  const knownOutput = state.liveActive
    .map((item) => {
      const layerSuffix = item.effectiveLayer === state.firmwareLayer ? "" : ` via firmware layer ${item.effectiveLayer}`;
      return `${item.name}: ${outputText(item.effectiveOutput ?? item.output)} (${item.effectiveBinding ?? item.binding})${layerSuffix}`;
    });
  const unknownOutput = state.liveUnknown.map((item) => `unmapped live matrix ${item.matrix.join(",")}`);
  els.liveOutput.textContent = [...knownOutput, ...unknownOutput].join(" | ");
}

function syncLayerLabel() {
  els.firmwareLayerLabel.textContent = `Firmware layer ${state.firmwareLayer}`;
}

function bindingFor(name) {
  return state.bindings[name] ?? "-";
}

function displayBindingFor(name) {
  const output = state.descriptions[name];
  if (output?.action && output.action !== output.keycode) return output.action;
  if (output?.chord) return output.chord;
  return bindingFor(name);
}

function outputText(output) {
  if (!output) return "-";
  if (output.action && output.chord && output.action !== output.chord) return `${output.action} (${output.chord})`;
  return output.chord ?? output.action ?? output.keycode ?? "-";
}

function isLiveActive(name) {
  return state.liveActive.some((item) => item.name === name);
}

function setBusy(value) {
  state.busy = value;
  els.refreshButton.disabled = value;
  els.saveButton.disabled = value;
  els.reloadSelectedButton.disabled = value;
}

function setMessage(text, tone) {
  els.message.textContent = text;
  els.message.className = `message ${tone}`;
}

async function apiGet(path) {
  const response = await fetch(path);
  return readResponse(response);
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

async function readResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return payload;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
