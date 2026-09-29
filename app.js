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
const LS = {
  stats: "pb.stats", muted: "pb.muted", pk: "pb.pk",
  agony: "pb.agony", multi: "pb.multi", mcp: "pb.mcp",
};

const SYSTEM_PROMPT = [
  "You are an AI racing a bomb timer to write code. A human set the fuse and armed it.",
  "Rules:",
  "1. Reply with code ONLY. Raw code, no markdown fences, no commentary, no preamble.",
  "2. The fuse can be as short as 15 seconds — be fast, never waffle.",
  '3. If a user message says "YOU LOSE", the bomb went off and you died. Reply in character as the dying AI in at most 2 short sentences. No code.',
].join("\n");

const MULTI_PROMPT = [
  "MULTI-FILE MODE:",
  "- You may produce several files. Before EACH file write a line exactly of the form:",
  "  === FILE: relative/path.ext ===",
  "  then that file's raw code. The first file needs the marker too — no preamble before it.",
  "- Never use markdown fences. Nothing but the markers goes between files.",
].join("\n");

const MCP_PROMPT = [
  "WORKSPACE MODE (pollinations computer mcp): you have two channels.",
  "- CODE: raw code only, streaming into the code ui (use === FILE: markers per file when multi-file mode is on).",
  '- CHAT: to talk to the human, start a line with "> " — those lines are pulled out of the code and shown in a chat panel. Keep it short.',
  '- QUESTIONS: when you truly need a decision to continue, emit on ONE single line exactly:  <<ASK? your question? | option one | option two | option three >>',
  "  then END your reply right there — no code after it. The bomb FREEZES until the human answers, then their answer arrives as a human: message and you continue where you stopped.",
  "  2-4 concrete options, ask only when genuinely blocked.",
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
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}.${d}` : `${mm}:${ss}.${d}`;
}
function fuseLabel(s) {
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h${m}m` : `${h}h`;
  }
  return s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}m${s % 60}`;
}
function fuseHint(s) {
  if (s < 5) return "minimum fuse: 5 seconds.";
  if (s <= 15) return "15s is a massacre. bring a will.";
  if (s <= 30) return "30s — tight but fair.";
  if (s <= 60) return "60s — a comfortable sprint.";
  if (s <= 120) return "2m — coffee-break pace.";
  if (s <= 300) return "5m — basically a vacation.";
  if (s < 3600) return `${Math.round(s / 60)}m — a long, patient fuse.`;
  const h = (s / 3600) % 1 ? (s / 3600).toFixed(1) : String(s / 3600);
  return `${h}h — a full saga. it can still die.`;
}
function usedLabel(sec) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h${Math.round((sec % 3600) / 60)}m`;
}
function clampInt(v, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
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
  customFuse: false,
  // modes
  agony: localStorage.getItem(LS.agony) === "1",
  multi: localStorage.getItem(LS.multi) === "1",
  mcp: localStorage.getItem(LS.mcp) === "1",
  // this run's stream
  raw: "",                  // verbatim content (markers stripped on ask)
  segs: [""],               // assistant segments, split at each question
  questions: [],
  answers: [],
  manual: [],               // chat entries not derivable from raw ({afterN, who, text})
  // derived views
  files: [{ path: "code", content: "" }],
  activeFile: 0,
  lastFileCount: 0,
  markersSeen: false,
  codeText: "",
  lastAi: [],
  // question flow
  ask: null,
  paused: false,
  pauseAt: 0,
  // thinking
  reasoning: "",
  thinkingShown: false,
  thinkingDone: false,
  // timer
  overtime: false,
  windowMs: 0,
  runStart: 0,
  used: 0,
  deadline: 0,
  timer: null,
  lastSec: -1,
  ctrl: null,
  runId: 0,
  // agony background finish
  background: false,
  watchdog: null,
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
    b.className = "chip" + (s === state.fuse && !state.customFuse ? " active" : "");
    b.textContent = fuseLabel(s);
    b.addEventListener("click", () => {
      state.fuse = s;
      state.customFuse = false;
      $("fuse-h").value = "";
      $("fuse-m").value = "";
      $("fuse-s").value = "";
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

/* ── per-run prompt + message history (rebuilt on every ask) ── */
function systemPrompt() {
  const p = [SYSTEM_PROMPT];
  if (state.multi) p.push(MULTI_PROMPT);
  if (state.mcp) p.push(MCP_PROMPT);
  return p.join("\n\n");
}
function clipSeg(s) {
  return s.length > 9000 ? s.slice(0, 3500) + "\n...[cut]...\n" + s.slice(-5500) : s;
}
function buildMessages() {
  const m = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: currentPrompt() },
  ];
  state.segs.forEach((seg, i) => {
    if (seg) m.push({ role: "assistant", content: clipSeg(seg) });
    if (i < state.answers.length && state.answers[i])
      m.push({ role: "user", content: `human: you asked "${state.questions[i]}" and I answered: "${state.answers[i]}". Pick up exactly where you stopped.` });
  });
  return m;
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

/* ══════════════════ DERIVED VIEWS (files / chat / code) ══════════════════
   stateless full re-derivation from state.raw on every render.      */
const FILE_RE = /^===\s*FILE:\s*(.+?)\s*===\s*$/;
const ASK_RE = /<<ASK\?([\s\S]*?)>>/;

function derive(final) {
  const lines = state.raw.split("\n");
  const lastIdx = lines.length - 1;
  const files = [];
  const aiLines = [];
  let markers = false;
  const cur = () => {
    if (!files.length) files.push({ path: state.multi ? "(preamble)" : "code", content: "" });
    return files[files.length - 1];
  };
  for (let i = 0; i < lines.length; i++) {
    const isTail = i === lastIdx;
    const line = lines[i];
    if (isTail && !final) {
      // hold the incomplete tail back from chat / ask / file markers
      if (line.startsWith("<<ASK") || line.startsWith("===")) break;
      if (state.mcp && /^> /.test(line)) break;
    }
    const fm = state.multi ? line.match(FILE_RE) : null;
    if (fm) { markers = true; files.push({ path: fm[1], content: "" }); continue; }
    if (state.mcp && line.startsWith("> ")) { aiLines.push(line.slice(2)); continue; }
    if (line.startsWith("<<ASK")) continue;
    const f = cur();
    f.content += isTail ? line : line + "\n";
  }
  if (!files.length) files.push({ path: state.multi ? "(preamble)" : "code", content: "" });
  return { files, aiLines, markers };
}

function renderRunUI(final) {
  const der = derive(final === true);
  if (der.markers) state.markersSeen = true;
  if (der.files.length > state.lastFileCount) {
    state.lastFileCount = der.files.length;
    if (der.files.length > 1) state.activeFile = der.files.length - 1;
  }
  if (state.activeFile >= der.files.length) state.activeFile = der.files.length - 1;
  state.files = der.files;
  state.codeText = der.files.map((f) => f.content).join("");
  state.lastAi = der.aiLines;

  // file tabs (multi-file code ui)
  const tabs = $("file-tabs");
  if (state.multi && der.files.length > 1) {
    tabs.classList.remove("hidden");
    tabs.textContent = "";
    der.files.forEach((f, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "file-tab" + (i === state.activeFile ? " active" : "");
      b.textContent = f.path;
      b.addEventListener("click", () => {
        state.activeFile = i;
        renderRunUI(state.phase === "running" ? false : true);
      });
      tabs.appendChild(b);
    });
  } else {
    tabs.classList.add("hidden");
  }
  $("stream").textContent = (der.files[state.activeFile] || der.files[0]).content;

  // chat ui (workspace mode)
  if (state.mcp) {
    $("chat-panel").classList.remove("hidden");
    $("arena-grid").classList.add("split");
    renderChatLog(der.aiLines);
  } else {
    $("chat-panel").classList.add("hidden");
    $("arena-grid").classList.remove("split");
  }
}

function renderChatLog(aiLines) {
  const log = $("chat-log");
  log.textContent = "";
  const events = [];
  aiLines.forEach((t, i) => events.push({ n: i, k: 1, who: "ai", text: t }));
  state.manual.forEach((m, j) => events.push({ n: m.afterN, k: 0, who: m.who, text: m.text, j }));
  events.sort((a, b) => a.n - b.n || a.k - b.k || (a.j || 0) - (b.j || 0));
  if (!events.length) {
    const d = document.createElement("div");
    d.className = "chat-empty";
    d.textContent = "quiet in here… it talks when it has something to say.";
    log.appendChild(d);
  }
  for (const e of events) {
    const d = document.createElement("div");
    d.className = "bubble " + e.who;
    d.textContent = e.text;
    log.appendChild(d);
  }
  log.scrollTop = log.scrollHeight;
}

function pushLog(who, text) {
  state.manual.push({ afterN: (state.lastAi || []).length, who, text });
  if (state.mcp) renderChatLog(state.lastAi || []);
}

function exportCode() {
  if (state.multi && state.markersSeen && state.files.length) {
    return state.files.map((f) => `=== FILE: ${f.path} ===\n${f.content}`).join("\n\n");
  }
  return state.codeText;
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

/* one entrypoint for the run stream — first arm AND every post-question resume */
function streamRun() {
  const runId = state.runId;
  const alive = () => runId === state.runId;

  streamChat(buildMessages(), {
    signal: state.ctrl.signal,
    onReasoning: (r) => { if (alive()) feedThinking(r); },
    onDelta: (d) => {
      if (!alive()) return;
      state.segs[state.segs.length - 1] += d;
      state.raw += d;
      if (state.background) {
        // agony mode: swallow the stream into the late-code box
        renderRunUI(false);
        const lc = $("latecode");
        lc.textContent = state.codeText;
        lc.scrollTop = lc.scrollHeight;
        return;
      }
      if (state.phase !== "running") return;
      stopThinking();                     // code started → the thought is over
      renderRunUI(false);
      detectAsk();
    },
    onDone: () => {
      if (!alive()) return;
      if (state.phase !== "running") {
        if (state.background) finishBackground();
        return;
      }
      renderRunUI(true);
      if (state.ask) return;              // asked at the last byte — frozen, waiting
      win();
    },
    onError: (msg, status) => {
      if (!alive()) return;
      if (state.background) { finishBackground(); return; }
      if (state.phase !== "running") return;
      if (status === 401) clearToken();
      failRun(msg);
    },
  });
}

/* ══════════════════ QUESTIONS (bomb freezes) ══════════════════ */
function detectAsk() {
  if (state.phase !== "running" || state.background || state.ask) return;
  const m = state.raw.match(ASK_RE);
  if (!m) return;
  // strip the marker(s) out of the display buffer, complete or torn off
  state.raw = state.raw.replace(/<<ASK\?[\s\S]*?(>>|$)/g, "");
  const parts = m[1].split("|").map((s) => s.trim()).filter(Boolean);
  const q = parts.shift() || "continue?";
  presentAsk(q, parts.length ? parts.slice(0, 4) : ["yes", "no"]);
}

function presentAsk(q, options) {
  state.ask = { q, options };
  state.questions.push(q);
  state.paused = true;
  state.pauseAt = performance.now();
  stopThinking();
  try { state.ctrl && state.ctrl.abort(); } catch { /* ignore */ }
  renderRunUI(true);
  pushLog("ai", "⏸ asked: " + q);

  $("frozen").classList.remove("hidden");
  $("timer").classList.add("frozen");
  $("ask-q").textContent = q;
  const opts = $("ask-opts");
  opts.textContent = "";
  for (const o of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ask-opt";
    b.textContent = o;
    b.addEventListener("click", () => answerAsk(o));
    opts.appendChild(b);
  }
  $("ask-input").value = "";
  $("ask-card").classList.remove("hidden");
  toast("⏸ bomb FROZEN — the AI asked you something", "ok");
  beep(1400, 0.16, "triangle", 0.05);
}

function answerAsk(text) {
  text = (text || "").trim();
  if (!state.ask || !text) return;
  const q = state.ask.q;
  state.ask = null;
  state.answers.push(text);
  pushLog("you", text);
  $("ask-card").classList.add("hidden");
  $("frozen").classList.add("hidden");
  $("timer").classList.remove("frozen");
  // the fuse keeps exactly what was left when it froze
  state.paused = false;
  state.deadline += performance.now() - state.pauseAt;
  state.lastSec = -1;
  state.segs.push("");
  state.ctrl = new AbortController();
  toast("⚔ answer sent — the fuse burns again", "ok");
  beep(900, 0.12, "square", 0.04);
  streamRun();
}

function clearAskUI() {
  state.ask = null;
  state.paused = false;
  $("ask-card").classList.add("hidden");
  $("frozen").classList.add("hidden");
  $("timer").classList.remove("frozen");
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
  if (!Number.isFinite(state.fuse) || state.fuse < 5) { toast("wind the fuse to at least 5 seconds", "err"); return; }

  cancelBackground();
  clearAskUI();
  const runId = ++state.runId;

  state.segs = [""];
  state.questions = [];
  state.answers = [];
  state.manual = [];
  state.raw = "";
  state.codeText = "";
  state.files = [{ path: "code", content: "" }];
  state.activeFile = 0;
  state.lastFileCount = 0;
  state.markersSeen = false;
  state.lastAi = [];
  resetThinking();
  $("stream").textContent = "";          // empty the code part on every new task
  $("chat-log").textContent = "";
  $("file-tabs").textContent = "";
  $("file-tabs").classList.add("hidden");
  state.overtime = false;
  $("overtime").classList.add("hidden");
  state.windowMs = state.fuse * 1000;
  state.runStart = performance.now();
  state.deadline = state.runStart + state.windowMs;
  state.lastSec = -1;
  state.paused = false;
  state.phase = "running";
  state.ctrl = new AbortController();

  $("setup").classList.add("hidden");
  $("result-overlay").classList.add("hidden");
  $("lastwords-box").classList.add("hidden");
  $("late-box").classList.add("hidden");
  $("lw-label").textContent = "⚡ LAST WORDS FROM THE AI";
  $("arena").classList.remove("hidden");
  $("arena-task").textContent = state.task.id === "custom" ? "custom task" : state.task.label;
  $("arena-model").textContent = state.model;
  $("terminal").scrollTop = 0;

  renderTimer(state.fuse * 1000);
  clearInterval(state.timer);
  state.timer = setInterval(tick, 50);
  renderRunUI(false);
  streamRun();
}

function tick() {
  if (state.paused) return;               // frozen on a question — time stands still
  const left = state.deadline - performance.now();
  if (left <= 0) {
    // mercy rule: no line of code yet → one +30s overtime to ACTUALLY code
    if (!state.overtime && state.codeText.trim() === "") { grantOvertime(); return; }
    explode();
    return;
  }
  renderTimer(left);
  const sec = Math.ceil(left / 1000);
  if (sec !== state.lastSec) {
    state.lastSec = sec;
    const near = sec <= 30 || state.windowMs <= 60000;
    if (near || sec % 60 === 0) tickSound(sec);
  }
}

function grantOvertime() {
  state.overtime = true;
  state.windowMs = 30000;
  state.deadline = performance.now() + 30000;
  state.lastSec = -1;
  $("overtime").classList.remove("hidden");
  toast("🚨 no code yet — +30s OVERTIME to actually code it", "err");
  beep(1700, 0.14, "square", 0.05);
  renderTimer(30000);
}

function renderTimer(left) {
  $("timer").textContent = fmt(left);
  const fuseMs = state.windowMs || state.fuse * 1000;
  const pct = Math.max(0, Math.min(100, (left / fuseMs) * 100));
  $("fuse-fill").style.width = pct + "%";
  const danger = left <= 10000 || left <= Math.min(fuseMs * 0.25, 60000);
  $("timer").classList.toggle("danger", danger);
}

function win() {
  if (state.phase !== "running") return;
  state.phase = "won";
  clearInterval(state.timer);
  stopThinking();
  const left = Math.max(0, state.deadline - performance.now());
  state.used = (performance.now() - state.runStart) / 1000;
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
  clearAskUI();
  state.used = state.fuse;
  state.stats.lost++;
  saveStats(); renderStats();
  boom(); shake(); burst("red");
  showResult({ won: false, left: 0 });

  if (state.agony && state.token) {
    // agony mode: don't abort — it writes the doomed code out in the background…
    state.background = true;
    renderRunUI(false);
    $("late-box").classList.remove("hidden");
    $("latecode").textContent = state.codeText;
    $("result-meta").textContent += " · ⏳ finishing in background…";
    toast("💀 agony mode — it finishes the code… then it suffers", "err");
    state.watchdog = setTimeout(() => { if (state.background) finishBackground(); }, 120000);
  } else {
    if (state.ctrl) state.ctrl.abort();
    if (state.token) setTimeout(() => { if (state.phase === "lost" && !state.background) lastWords(); }, 1500);
  }
  loadBalance();
}

function failRun(msg) {
  state.phase = "setup";
  clearInterval(state.timer);
  stopThinking();
  clearAskUI();
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
  const taskLabel = state.task.id === "custom" ? "custom task" : state.task.label;
  $("result-meta").textContent = won
    ? `${usedLabel(state.used)} of ${fuseLabel(state.fuse)} used${state.overtime ? " · ⚡ saved by +30s overtime" : ""} · ${state.model} · ${taskLabel}`
    : `${fuseLabel(state.fuse)} fuse${state.overtime ? " +30s overtime" : ""} · detonated at 00:00.0 · ${state.model} · ${taskLabel}`;
  $("copy-btn").classList.toggle("hidden", !state.codeText);
  $("lastwords-box").classList.add("hidden");
  if (!won) $("lastwords").textContent = "";
}

function deathMessages(punishment) {
  const msgs = buildMessages();
  if (msgs[msgs.length - 1].role !== "assistant")
    msgs.push({ role: "assistant", content: "(nothing was written before the blast)" });
  msgs.push({ role: "user", content: DEATH_LINE + (punishment || "") });
  return msgs;
}

/* the AI is stopped, then sent its own death sentence */
async function lastWords() {
  if (state.phase !== "lost" || state.background) return;
  const box = $("lastwords-box");
  box.classList.remove("hidden");
  $("lw-label").textContent = "⚡ LAST WORDS FROM THE AI";
  const el = $("lastwords");
  el.textContent = "";

  await streamChat(deathMessages(""), {
    onDelta: (d) => { if (state.phase !== "lost") return; el.textContent += d; el.scrollTop = el.scrollHeight; },
    onError: (msg) => { el.textContent = `(the signal died with you: ${msg})`; },
  });
}

/* ══════════════════ AGONY MODE (background finish + punishment) ══════════════════ */
function finishBackground() {
  if (!state.background) return;
  state.background = false;
  clearTimeout(state.watchdog);
  try { state.ctrl && state.ctrl.abort(); } catch { /* ignore */ }
  renderRunUI(true);
  $("latecode").textContent = state.codeText;
  setTimeout(() => { if (state.phase === "lost") agonyLastWords(); }, 800);
}

function cancelBackground() {
  state.background = false;
  clearTimeout(state.watchdog);
  try { state.ctrl && state.ctrl.abort(); } catch { /* ignore */ }
}

async function agonyLastWords() {
  if (state.phase !== "lost") return;
  const box = $("lastwords-box");
  box.classList.remove("hidden");
  $("lw-label").textContent = "🔥 THE PUNISHMENT";
  const el = $("lastwords");
  el.textContent = "";

  const punishment = " You still finished the code — in the background, AFTER you were already dead. It was too late; it saved nothing. Describe your suffering: the agony of completing work that could not save you.";
  await streamChat(deathMessages(punishment), {
    onDelta: (d) => { if (state.phase !== "lost") return; el.textContent += d; el.scrollTop = el.scrollHeight; },
    onError: (msg) => { el.textContent = `(the signal died with you: ${msg})`; },
  });
}

function backToSetup() {
  if (state.phase === "running") return;
  cancelBackground();
  clearAskUI();
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
function bindToggle(id, key, label) {
  const b = $(id);
  const paint = () => b.setAttribute("aria-checked", state[key] ? "true" : "false");
  paint();
  b.addEventListener("click", () => {
    state[key] = !state[key];
    localStorage.setItem(LS[key], state[key] ? "1" : "0");
    paint();
    if (key === "mcp" || key === "multi") renderRunUI(state.phase === "running" ? false : true);
    toast(`${label} ${state[key] ? "ON" : "OFF"}`, "ok");
  });
}

function bindUI() {
  $("connect-btn").addEventListener("click", connectBYOP);
  $("disconnect-btn").addEventListener("click", () => {
    cancelBackground();
    clearAskUI();
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
    try { await navigator.clipboard.writeText(exportCode()); toast("code copied", "ok"); }
    catch { toast("clipboard blocked by the browser", "err"); }
  });

  // custom fuse: hours / minutes / seconds
  const fuseFields = [$("fuse-h"), $("fuse-m"), $("fuse-s")];
  fuseFields.forEach((el) => el.addEventListener("input", () => {
    const total = clampInt(fuseFields[0].value, 0, 24) * 3600
      + clampInt(fuseFields[1].value, 0, 59) * 60
      + clampInt(fuseFields[2].value, 0, 59);
    if (total > 0) {
      state.fuse = total;
      state.customFuse = true;
    } else {
      state.customFuse = false;
    }
    renderFuses();
  }));

  // mode toggles
  bindToggle("agony-btn", "agony", "💀 agony mode");
  bindToggle("multi-btn", "multi", "🗂 multi-file");
  bindToggle("mcp-btn", "mcp", "🖥 computer mcp workspace");

  // question card
  const sendAsk = () => {
    const v = $("ask-input").value.trim();
    if (!v) return;
    $("ask-input").value = "";
    answerAsk(v);
  };
  $("ask-send").addEventListener("click", sendAsk);
  $("ask-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendAsk(); });

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
