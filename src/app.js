/**
 * SensorWatch · app.js
 *
 * Environment configuration — edit the ENV object below,
 * or replace values with your build-tool / dotenv injection.
 *
 * Required broker setup:
 *   - WebSocket support enabled on your MQTT broker
 *   - Default Mosquitto WS port: 9001
 *   - For TLS connections use wss:// instead of ws://
 */

// ─── ENV CONFIG ──────────────────────────────────────────────────────────────
const ENV = {
  MQTT_URL:      "",  // ws:// or wss://
  MQTT_USERNAME: "",
  MQTT_PASSWORD: "",
  TOPIC_LEAK:     "LEAK",
  TOPIC_PRESSURE: "PRESSURE",
  TOPIC_TEMP:     "TEMP",
  // Ranges used for gauge / thermometer visuals
  PRESSURE_MIN: 0,
  PRESSURE_MAX: 200,
  TEMP_MIN:    -20,
  TEMP_MAX:    500,
};

// ─── DOM HELPERS ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const now = () => new Date().toLocaleTimeString();

// ─── STATE ───────────────────────────────────────────────────────────────────
let mqttClient = null;

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  populateForm();
  startClock();
  bindEvents();
});

function populateForm() {
  $("f-url").value    = ENV.MQTT_URL;
  $("f-user").value   = ENV.MQTT_USERNAME;
  $("f-pass").value   = ENV.MQTT_PASSWORD;
  $("f-topics").value = [ENV.TOPIC_LEAK, ENV.TOPIC_PRESSURE, ENV.TOPIC_TEMP].join(", ");

  // Seed gauge / thermo scale labels
  $("gauge-min").textContent = ENV.PRESSURE_MIN;
  $("gauge-max").textContent = ENV.PRESSURE_MAX;
  $("ts-min").textContent    = ENV.TEMP_MIN + "°";
  $("ts-max").textContent    = ENV.TEMP_MAX + "°";
}

// ─── CLOCK ───────────────────────────────────────────────────────────────────
function startClock() {
  const el = $("clock");
  const tick = () => { el.textContent = new Date().toLocaleTimeString(); };
  tick();
  setInterval(tick, 1000);
}

// ─── EVENT BINDINGS ──────────────────────────────────────────────────────────
function bindEvents() {
  $("btn-settings").addEventListener("click", () => {
    $("modal").classList.remove("hidden");
  });

  $("btn-connect").addEventListener("click", () => {
    const url    = $("f-url").value.trim();
    const user   = $("f-user").value.trim();
    const pass   = $("f-pass").value.trim();
    const topics = $("f-topics").value
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    if (!url) return;
    $("modal").classList.add("hidden");
    connectMQTT(url, user, pass, topics);
  });

  $("btn-clear").addEventListener("click", () => {
    $("log-list").innerHTML = "";
  });
}

// ─── MQTT CONNECTION ─────────────────────────────────────────────────────────
function connectMQTT(url, username, password, topics) {
  if (mqttClient) mqttClient.end(true);

  setStatus("connecting", "Connecting…");
  addLog("SYSTEM", "Connecting to " + url);

  const opts = {
    clientId: "sensorwatch_" + Math.random().toString(16).slice(2, 8),
    clean: true,
    reconnectPeriod: 5000,
  };
  if (username) opts.username = username;
  if (password) opts.password = password;

  mqttClient = mqtt.connect(url, opts);

  mqttClient.on("connect", () => {
    setStatus("connected", "Connected");
    $("broker-info").textContent = url;
    addLog("SYSTEM", "Connected · subscribing to " + topics.join(", "));

    topics.forEach(topic => {
      mqttClient.subscribe(topic, err => {
        if (err) addLog("ERROR", "Could not subscribe to " + topic);
        else     addLog("SYSTEM", "Subscribed → " + topic);
      });
    });
  });

  mqttClient.on("reconnect", () => setStatus("connecting", "Reconnecting…"));
  mqttClient.on("offline",   () => setStatus("error", "Offline"));
  mqttClient.on("error", e  => { setStatus("error", "Error"); addLog("ERROR", e.message); });

  mqttClient.on("message", (topic, payload) => {
    const msg = payload.toString().trim();
    addLog(topic, msg);
    handleMessage(topic, msg);
  });
}

// ─── CONNECTION STATUS BADGE ─────────────────────────────────────────────────
function setStatus(state, label) {
  $("status-dot").className  = "status-dot " + state;
  $("conn-label").textContent = label;
}

// ─── MESSAGE DISPATCH ────────────────────────────────────────────────────────
function handleMessage(topic, msg) {
  const T = topic.toUpperCase();
  if (T === ENV.TOPIC_LEAK.toUpperCase())     updateLeak(msg);
  else if (T === ENV.TOPIC_PRESSURE.toUpperCase()) updatePressure(msg);
  else if (T === ENV.TOPIC_TEMP.toUpperCase())     updateTemp(msg);
}

// ─── LEAK CARD ───────────────────────────────────────────────────────────────
function updateLeak(msg) {
  const upper  = msg.toUpperCase();
  const isLeak = upper === "TRUE";

  const card  = $("card-leak");
  const badge = $("leak-badge");
  const txt   = $("leak-text");
  const icon  = $("leak-icon");

  if (isLeak) {
    card.dataset.status = "crit";
    badge.className     = "badge crit";
    txt.textContent     = "LEAK DETECTED";
    icon.textContent    = "🚨";
  } else {
    card.dataset.status = "ok";
    badge.className     = "badge ok";
    txt.textContent     = "NO LEAK DETECTED";
    icon.textContent    = "✅";
  }

  $("leak-ts").textContent = now();
}

// ─── PRESSURE CARD ───────────────────────────────────────────────────────────
function updatePressure(msg) {
  const val  = parseFloat(msg);
  const card = $("card-pressure");
  const el   = $("pressure-val");

  if (isNaN(val)) {
    el.textContent = msg;
    return;
  }

  el.textContent = val.toFixed(1);
  el.classList.remove("idle-val");

  const pct = clamp(
    (val - ENV.PRESSURE_MIN) / (ENV.PRESSURE_MAX - ENV.PRESSURE_MIN) * 100
  );
  $("gauge-fill").style.width = pct + "%";

  card.dataset.status = pct > 80 ? "crit" : pct > 55 ? "warn" : "ok";
  $("pressure-ts").textContent = now();
}

// ─── TEMPERATURE CARD ────────────────────────────────────────────────────────
function updateTemp(msg) {
  const val  = parseFloat(msg);
  const card = $("card-temp");
  const el   = $("temp-val");

  if (isNaN(val)) {
    el.textContent = msg;
    return;
  }

  el.textContent = val.toFixed(1);
  el.classList.remove("idle-val");

  const pct = clamp(
    (val - ENV.TEMP_MIN) / (ENV.TEMP_MAX - ENV.TEMP_MIN) * 100
  );
  $("thermo-fill").style.height = pct + "%";

  card.dataset.status = val > 80 ? "crit" : val > 50 ? "warn" : "ok";
  $("temp-ts").textContent = now();
}

// ─── MESSAGE LOG ─────────────────────────────────────────────────────────────
function addLog(topic, msg) {
  const list = $("log-list");
  const li   = document.createElement("li");
  li.className = "log-item";
  li.innerHTML =
    `<span class="log-time">${now()}</span>` +
    `<span class="log-topic">${escHtml(topic)}</span>` +
    `<span class="log-msg">${escHtml(msg)}</span>`;

  list.insertBefore(li, list.firstChild);

  // Keep log at max 60 entries
  while (list.children.length > 60) list.removeChild(list.lastChild);
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
function clamp(val, min = 0, max = 100) {
  return Math.min(max, Math.max(min, val));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}