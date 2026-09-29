"use strict";

/* ══════════════════════════════════════════════════════════════
   POLLEN BOMB 💣 — BYOP coding time trial
   Your App Key (client_id). Register the Redirect URI shown in
   "how it works" on it at https://enter.pollinations.ai/keys
   ══════════════════════════════════════════════════════════════ */
const APP_KEY = "pk_riLOLf810Dcf6Za4";

const GEN  = "https://gen.pollinations.ai";
const AUTH = "https://enter.pollinations.ai";

/* storage. the oauth token lives in sessionStorage only (never
   localStorage, never the URL) — per the BYOP docs. */
const SS = { verifier: "pb.verifier", state: "pb.state", token: "pb.token" };
const LS = { stats: "pb.stats", muted: "pb.muted", pk: "pb.pk" };

const SYSTEM_PROMPT = [
  "You are an AI racing a bomb timer to write code. A human set the fuse and armed it.",
  "Rules:",
  "1. Reply with code ONLY. Raw code, no markdown fences, no commentary, no preamble.",
  "2. The fuse can be as short as 15 seconds — be fast, never waffle.",
  '3. If a user message says "YOU LOSE", the bomb went off and you died. Reply in character as the dying AI in at most 2 short sentences. No code.',
].join("\n");

const DEATH_LINE = "YOU LOSE. You have died, the bomb has exploded, try faster coding.";

const TASKS = [
  { id: "palindrome", label: "palindrome",
    prompt: "Write a JavaScript function isPalindrome(str) that returns true when the string reads the same forwards and backwards, ignoring case, spaces and punctuation." },
  { id: "fizzbuzz", label: "fizzbuzz",
    prompt: 'Write a JavaScript function fizzBuzz(n) returning an array of 1..n where multiples of 3 become "Fizz", multiples of 5 "Buzz", multiples of both "FizzBuzz".' },
  { id: "debounce", label: "debounce",
    prompt: "Write a JavaScript function debounce(fn, delay) returning a debounced function with a .cancel() method." },
  { id: "slug", label: "slugify",
    prompt: "Write a JavaScript function slugify(str) that lowercases, replaces spaces and punctuation with hyphens, collapses repeats and trims the edges." },
  { id: "roman", label: "roman numerals",
    prompt: "Write JavaScript functions toRoman(n) and fromRoman(s) covering 1..3999." },
  { id: "csv", label: "json → csv",
    prompt: "Write a JavaScript function jsonToCsv(rows) that takes an array of objects, uses the first row's keys as headers, and RFC-4180-quotes values containing commas, quotes or newlines." },
  { id: "limiter", label: "rate limiter",
    prompt: "Write a JavaScript TokenBucket class: constructor(capacity, refillPerSec), .take(n) returns true when allowed, refilling continuously over time." },
  { id: "custom", label: "✍ custom", prompt: null },
];

const FUSES = [15, 30, 60, 120, 300];

const FALLBACK_MODELS = [
  { name: "openai/gpt-5.4-nano", title: "GPT-5.4 Nano", description: "Fast, affordable all-rounder" },
  { name: "deepseek/deepseek-v4-flash", title: "DeepSeek V4 Flash" },
  { name: "google/gemini-2.5-flash-lite", title: "Gemini 2.5 Flash Lite" },
  { name: "qwen/qwen3.8-flash", title: "Qwen 3.8 Flash" },
  { name: "openai/gpt-4o-mini", title: "GPT-4o Mini" },
  { name: "anthropic/claude-haiku-4.5", title: "Claude Haiku 4.5" },
];

/* ── tiny helpers ─────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmt(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}
function fuseLabel(s) {
  return s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}m${s % 60}`;
}
function fuseHint(s) {
  if (s <= 15) return "15s is a massacre. bring a will.";
  if (s <= 30) return "30s — tight but fair.";
  if (s <= 60) return "60s — a comfortable sprint.";
  if (s <= 120) return "2m — coffee-break pace.";
  return "5m — basically a vacation.";
}
function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randStr(n) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return b64url(a.buffer);
}

let toastTimer = null;
function toast(msg, kind) {
  const el = $("toast");
  el.textContent = msg;
  el.className = kind || "";
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 5000);
}

/* ── state ────────────────────────────────────────────────── */
const state = {
  phase: "setup",           // setup | running | won | lost
  token: null,
  keyKind: null,            // oauth | dev
  model: "openai/gpt-5.4-nano",
  models: [],
  task: TASKS[0],
  fuse: 30,
  messages: [],
  partial: "",
  reasoning: "",
  thinkingShown: false,
  thinkingDone: false,
  used: 0,
  deadline: 0,
  timer: null,
  lastSec: -1,
  ctrl: null,
  muted: localStorage.getItem(LS.muted) === "1",
  stats: loadStats(),
};

function loadStats() {
  try { return JSON.parse(localStorage.getItem(LS.stats)) || { won: 0, lost: 0, best: null }; }
  catch { return { won: 0, lost: 0, best: null }; }
}
function saveStats() { localStorage.setItem(LS.stats, JSON.stringify(state.stats)); }
function renderStats() {
  const s = state.stats;
  $("stats").textContent =
    `defused ${s.won} · exploded ${s.lost}` + (s.best != null ? ` · best ${s.best.toFixed(1)}s` : "");
}

/* ══════════════════ AUTH (BYOP / PKCE) ══════════════════ */
function clientKey() { return localStorage.getItem(LS.pk) || APP_KEY; }

function redirectURI() {
  // always a clean directory URL so the app can show you exactly what to register
  let p = location.pathname.replace(/index\.html?$/i, "");
  if (!p.endsWith("/")) p += "/";
  return location.origin + p;
}

async function pkcePair() {
  const verifier = randStr(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

async function connectBYOP() {
  if (location.protocol === "file:") {
    toast("serve this folder over http://localhost (node server.js) — OAuth needs a real origin", "err");
    return;
  }
  try {
    const { verifier, challenge } = await pkcePair();
    const st = randStr(24);
    sessionStorage.setItem(SS.verifier, verifier);
    sessionStorage.setItem(SS.state, st);
    const url = `${AUTH}/authorize?` + new URLSearchParams({
      response_type: "code",
      client_id: clientKey(),
      redirect_uri: redirectURI(),
      scope: "usage",
      state: st,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    location.href = url;
  } catch (e) {
    toast("could not start oauth: " + (e.message || e), "err");
  }
}

async function handleCallback() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code")) return;
  const code = q.get("code");
  const st = q.get("state");
  history.replaceState({}, "", location.pathname);

  const savedState = sessionStorage.getItem(SS.state) || "";
  sessionStorage.removeItem(SS.state);
  if (!savedState || st !== savedState) {
    toast("oauth state mismatch — try connecting again", "err");
    return;
  }
  const verifier = sessionStorage.getItem(SS.verifier) || "";
  sessionStorage.removeItem(SS.verifier);

  try {
    const r = await fetch(`${AUTH}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientKey(),
        redirect_uri: redirectURI(),
        code_verifier: verifier,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error_description || j.error || `HTTP ${r.status}`);
    setToken(j.access_token, "oauth", Date.now() + (j.expires_in || 604800) * 1000);
    toast("wallet connected 🎉 the fuse is live", "ok");
    loadBalance();
  } catch (e) {
    toast("token exchange failed: " + (e.message || e), "err");
  }
}

function setToken(t, kind, exp) {
  state.token = t;
  state.keyKind = kind;
  sessionStorage.setItem(SS.token, JSON.stringify({ t, kind, exp: exp || null }));
  renderAuth();
}
function restoreSession() {
  try {
    const j = JSON.parse(sessionStorage.getItem(SS.token) || "null");
    if (j && j.t && (!j.exp || Date.now() < j.exp)) {
      state.token = j.t;
      state.keyKind = j.kind;
    } else if (j) {
      sessionStorage.removeItem(SS.token);
    }
  } catch { /* ignore */ }
}
function clearToken() {
  state.token = null;
  state.keyKind = null;
  sessionStorage.removeItem(SS.token);
  $("balance").classList.add("hidden");
  renderAuth();
}

function renderAuth() {
  const authed = !!state.token;
  $("authed").classList.toggle("hidden", !authed);
  // the dashboard only exists after a BYOP connect
  $("gate").classList.toggle("hidden", authed);
  if (state.phase !== "running") $("setup").classList.toggle("hidden", !authed);
  if (authed) loadBalance();
}

async function loadBalance() {
  if (state.keyKind !== "oauth" || !state.token) return;
  try {
    const r = await fetch(`${GEN}/account/balance`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!r.ok) return;
    const j = await r.json();
    if (typeof j.balance === "number") {
      const el = $("balance");
      el.textContent = `🪙 ${j.balance.toLocaleString()} pollen`;
      el.classList.remove("hidden");
    }
  } catch { /* offline / no scope — pill just stays hidden */ }
}

/* ══════════════════ MODEL CATALOG ══════════════════ */
async function loadModels() {
  let models = [];
  try {
    const r = await fetch(`${GEN}/text/models`);
    const j = await r.json();
    models = Array.isArray(j) ? j : (j.data || j.models || []);
  } catch { /* fall through */ }

  models = models.filter((m) =>
    (Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes("/v1/chat/completions")) ||
    (!m.supported_endpoints && m.category === "text")
  );
  if (!models.length) models = FALLBACK_MODELS.slice();
  state.models = models;

  const sel = $("model");
  sel.innerHTML = "";
  models.sort((a, b) =>
    (b.name === state.model) - (a.name === state.model) ||
    (a.title || a.name).localeCompare(b.title || b.name)
  );
  for (const m of models) {
    const o = document.createElement("option");
    o.value = m.name;
    o.textContent = `${m.title || m.name} · ${m.name}`;
    sel.appendChild(o);
  }
  if (!models.some((m) => m.name === state.model)) state.model = models[0].name;
  sel.value = state.model;
  sel.addEventListener("change", () => { state.model = sel.value; renderModelHint(); });
  renderModelHint();
}

function renderModelHint() {
  const m = state.models.find((x) => x.name === state.model);
  const p = m && m.pricing;
  const bits = [];
  if (m && m.description) bits.push(m.description);
  if (p && p.promptTextTokens)
    bits.push(`in ${(p.promptTextTokens * 1e6).toFixed(2)} / out ${(p.completionTextTokens * 1e6).toFixed(2)} pollen per 1M tok`);
  $("model-hint").textContent = bits.join(" · ") || "live catalog unreachable — fallback list in use";
}

/* ══════════════════ SETUP UI ══════════════════ */
function renderTasks() {
  const wrap = $("task-chips");
  wrap.innerHTML = "";
  for (const t of TASKS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (t.id === state.task.id ? " active" : "");
    b.textContent = t.label;
    b.addEventListener("click", () => {
      state.task = t;
      renderTasks();
      $("task-custom").classList.toggle("hidden", t.id !== "custom");
      if (t.id === "custom") $("task-custom").focus();
    });
    wrap.appendChild(b);
  }
}

function renderFuses() {
  const wrap = $("fuse-chips");
  wrap.innerHTML = "";
  for (const s of FUSES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (s === state.fuse ? " active" : "");
    b.textContent = fuseLabel(s);
    b.addEventListener("click", () => {
      state.fuse = s;
      $("fuse-custom").value = "";
      renderFuses();
    });
    wrap.appendChild(b);
  }
  $("fuse-hint").textContent = fuseHint(state.fuse);
}

function currentPrompt() {
  if (state.task.id === "custom") return $("task-custom").value.trim();
  return state.task.prompt;
}

/* ── the lightbulb: streams reasoning, fades out when done ── */
function feedThinking(text) {
  if (state.thinkingDone || state.phase !== "running") return;
  state.reasoning += text;
  $("think-text").textContent = state.reasoning;
  if (state.thinkingShown) return;
  state.thinkingShown = true;
  const t = $("thinking");
  t.classList.remove("hidden", "fade");
  t.classList.add("on");
}
function stopThinking() {
  state.thinkingDone = true;
  const t = $("thinking");
  if (t.classList.contains("hidden")) return;
  t.classList.remove("on");
  t.classList.add("fade");
  setTimeout(() => {
    t.classList.add("hidden");
    t.classList.remove("fade");
    $("think-text").textContent = "";
  }, 470);
}
function resetThinking() {
  state.reasoning = "";
  state.thinkingShown = false;
  state.thinkingDone = false;
  const t = $("thinking");
  t.classList.add("hidden");
  t.classList.remove("fade", "on");
  $("think-text").textContent = "";
}

/* ══════════════════ STREAMING ══════════════════ */
async function streamChat(messages, opts = {}) {
  const { signal, onDelta, onReasoning, onDone, onError } = opts;

  let res;
  try {
    res = await fetch(`${GEN}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ model: state.model, messages, stream: true }),
      signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") return;
    onError && onError("network error: " + ((e && e.message) || e));
    return;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = (j.error && (j.error.message || j.error.msg)) || j.message || msg;
    } catch { /* not json */ }
    if (res.status === 401) onError && onError("key rejected (401) — reconnect your wallet", 401);
    else if (res.status === 402) onError && onError("out of pollen (402) — top up at enter.pollinations.ai", 402);
    else if (res.status === 400 && /content_blocked|blocked/i.test(msg)) onError && onError("safety filter blocked the task: " + msg, 400);
    else onError && onError(msg, res.status);
    return;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let sawDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { sawDone = true; break; }
        let j;
        try { j = JSON.parse(payload); } catch { continue; }
        if (j.error) throw new Error(j.error.message || "stream error");
        const d = j.choices && j.choices[0] ? j.choices[0].delta : null;
        if (d) {
          if (d.content) onDelta && onDelta(d.content);
          const think = d.reasoning_content != null
            ? d.reasoning_content
            : (typeof d.reasoning === "string" ? d.reasoning : null);
          if (think) onReasoning && onReasoning(think);
        }
      }
      if (sawDone) break;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
    onError && onError((e && e.message) || String(e));
    return;
  }
  onDone && onDone();
}

/* ══════════════════ THE GAME ══════════════════ */
function arm() {
  if (state.phase === "running") return;
  if (!state.token) {
    toast("connect a wallet first — the bomb spends your pollen", "err");
    const b = $("connect-btn");
    b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge");
    return;
  }
  const prompt = currentPrompt();
  if (!prompt) { toast("write the task first ✍", "err"); return; }

  state.messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
  state.partial = "";
  resetThinking();
  $("stream").textContent = "";          // empty the code part on every new task
  state.deadline = performance.now() + state.fuse * 1000;
  state.lastSec = -1;
  state.phase = "running";
  state.ctrl = new AbortController();

  $("setup").classList.add("hidden");
  $("result-overlay").classList.add("hidden");
  $("lastwords-box").classList.add("hidden");
  $("arena").classList.remove("hidden");
  $("arena-task").textContent = state.task.id === "custom" ? "custom task" : state.task.label;
  $("arena-model").textContent = state.model;
  $("terminal").scrollTop = 0;

  renderTimer(state.fuse * 1000);
  clearInterval(state.timer);
  state.timer = setInterval(tick, 50);

  streamChat(state.messages, {
    signal: state.ctrl.signal,
    onReasoning: (r) => feedThinking(r),
    onDelta: (d) => {
      if (state.phase !== "running") return;
      stopThinking();                     // code started → the thought is over
      state.partial += d;
      const el = $("stream");
      el.textContent = state.partial;
      $("terminal").scrollTop = $("terminal").scrollHeight;
    },
    onDone: () => { if (state.phase === "running") win(); },
    onError: (msg, status) => {
      if (state.phase !== "running") return;
      if (status === 401) clearToken();
      failRun(msg);
    },
  });
}

function tick() {
  const left = state.deadline - performance.now();
  if (left <= 0) { explode(); return; }
  renderTimer(left);
  const sec = Math.ceil(left / 1000);
  if (sec !== state.lastSec) { state.lastSec = sec; tickSound(sec); }
}

function renderTimer(left) {
  $("timer").textContent = fmt(left);
  const fuseMs = state.fuse * 1000;
  const pct = Math.max(0, Math.min(100, (left / fuseMs) * 100));
  $("fuse-fill").style.width = pct + "%";
  const danger = left <= 10000 || left <= fuseMs * 0.25;
  $("timer").classList.toggle("danger", danger);
}

function win() {
  if (state.phase !== "running") return;
  state.phase = "won";
  clearInterval(state.timer);
  stopThinking();
  const left = Math.max(0, state.deadline - performance.now());
  state.used = (state.fuse * 1000 - left) / 1000;
  state.stats.won++;
  if (state.stats.best == null || state.used < state.stats.best) state.stats.best = state.used;
  saveStats(); renderStats();
  chime(); burst("green");
  showResult({ won: true, left });
  loadBalance();
}

function explode() {
  if (state.phase !== "running") return;
  state.phase = "lost";
  clearInterval(state.timer);
  stopThinking();
  if (state.ctrl) state.ctrl.abort();
  state.used = state.fuse;
  state.stats.lost++;
  saveStats(); renderStats();
  boom(); shake(); burst("red");
  showResult({ won: false, left: 0 });
  if (state.token) setTimeout(lastWords, 1500);
  loadBalance();
}

function failRun(msg) {
  state.phase = "setup";
  clearInterval(state.timer);
  stopThinking();
  $("arena").classList.add("hidden");
  $("setup").classList.remove("hidden");
  toast(msg, "err");
}

function showResult({ won, left }) {
  const ov = $("result-overlay");
  ov.classList.toggle("win", won);
  ov.classList.remove("hidden");
  $("result-big").textContent = won ? "💣 DEFUSED" : "YOU LOSE";
  $("result-sub").textContent = won
    ? `code finished with ${fmt(left)} left on the fuse`
    : DEATH_LINE;
  $("result-meta").textContent = won
    ? `${state.used.toFixed(1)}s of ${state.fuse}s used · ${state.model} · ${state.task.id === "custom" ? "custom task" : state.task.label}`
    : `${state.fuse}s fuse · detonated at 00:00.0 · ${state.model} · ${state.task.id === "custom" ? "custom task" : state.task.label}`;
  $("copy-btn").classList.toggle("hidden", !state.partial);
  if (won) $("lastwords-box").classList.add("hidden");
  else $("lastwords").textContent = "";
}

/* the AI is stopped, then sent its own death sentence */
async function lastWords() {
  const box = $("lastwords-box");
  box.classList.remove("hidden");
  const el = $("lastwords");
  el.textContent = "";

  const partial = state.partial
    ? (state.partial.length > 6000 ? state.partial.slice(-6000) + "\n/* [cut off by the explosion] */" : state.partial)
    : "(nothing was written before the blast)";

  const msgs = [
    ...state.messages,
    { role: "assistant", content: partial },
    { role: "user", content: DEATH_LINE },
  ];

  await streamChat(msgs, {
    onDelta: (d) => {
      if (state.phase !== "lost") return;
      el.textContent += d;
      el.scrollTop = el.scrollHeight;
    },
    onError: (msg) => { el.textContent = `(the signal died with you: ${msg})`; },
  });
}

function backToSetup() {
  if (state.phase === "running") return;
  state.phase = "setup";
  $("result-overlay").classList.add("hidden");
  $("arena").classList.add("hidden");
  $("setup").classList.remove("hidden");
}

/* ══════════════════ AUDIO ══════════════════ */
let AC = null;
function ac() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function beep(freq, dur, type, gain) {
  if (state.muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.04, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  } catch { /* no audio, no problem */ }
}
function tickSound(sec) { beep(sec <= 10 ? 1500 : 880, 0.045, "square", 0.03); }
function chime() {
  if (state.muted) return;
  [660, 880, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.2, "triangle", 0.06), i * 95));
}
function boom() {
  if (state.muted) return;
  try {
    const c = ac();
    const dur = 1.0;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4);
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600, c.currentTime);
    lp.frequency.exponentialRampToValueAtTime(130, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start();
    const o = c.createOscillator(); const og = c.createGain();
    o.frequency.setValueAtTime(130, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(26, c.currentTime + 0.55);
    og.gain.setValueAtTime(0.55, c.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.65);
    o.connect(og); og.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.7);
  } catch { /* ignore */ }
}

/* ══════════════════ FX ══════════════════ */
function burst(kind) {
  for (let i = 0; i < 46; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const a = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 240;
    p.style.setProperty("--tx", Math.cos(a) * dist + "px");
    p.style.setProperty("--ty", Math.sin(a) * dist + "px");
    p.style.setProperty("--c", kind === "red"
      ? (Math.random() < 0.5 ? "#ff3b3b" : "#ff9d2f")
      : (Math.random() < 0.5 ? "#38e08a" : "#9dffd0"));
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}
function shake() {
  const el = $("shake");
  el.classList.remove("shaking"); void el.offsetWidth; el.classList.add("shaking");
}

/* ══════════════════ WIRING ══════════════════ */
function bindUI() {
  $("connect-btn").addEventListener("click", connectBYOP);
  $("disconnect-btn").addEventListener("click", () => {
    if (state.phase === "running") {
      state.phase = "setup";
      clearInterval(state.timer);
      if (state.ctrl) state.ctrl.abort();
      $("arena").classList.add("hidden");
    }
    clearToken();
    toast("wallet disconnected", "ok");
  });

  $("sound-btn").addEventListener("click", () => {
    state.muted = !state.muted;
    localStorage.setItem(LS.muted, state.muted ? "1" : "0");
    $("sound-btn").textContent = state.muted ? "🔇" : "🔊";
  });
  $("sound-btn").textContent = state.muted ? "🔇" : "🔊";

  $("arm-btn").addEventListener("click", arm);
  $("detonate-btn").addEventListener("click", explode);
  $("again-btn").addEventListener("click", arm);
  $("new-btn").addEventListener("click", backToSetup);
  $("copy-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(state.partial); toast("code copied", "ok"); }
    catch { toast("clipboard blocked by the browser", "err"); }
  });

  $("fuse-custom").addEventListener("input", (e) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v >= 5 && v <= 600) {
      state.fuse = v;
      renderFuses();
      e.target.value = v; // renderFuses doesn't touch it, but keep explicit
    }
  });

  $("copy-redirect").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("redirect-uri").textContent); toast("redirect uri copied — paste it on your app key", "ok"); }
    catch { toast("clipboard blocked by the browser", "err"); }
  });
}

function init() {
  restoreSession();
  renderAuth();
  renderStats();
  renderTasks();
  renderFuses();
  bindUI();
  loadModels();
  $("redirect-uri").textContent = redirectURI();
  handleCallback();
}

init();
