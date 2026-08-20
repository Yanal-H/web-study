// Optional AI tutor. Bring-your-own-key, off by default, and never touched unless
// the student explicitly asks for a hint or an explanation. The core app stays
// fully offline — this is the one place a network request can happen, and only
// after a deliberate click by someone who has entered their own key.

import { state as liveState, update } from '../state/store';
import { scopedLocalStorageKey } from './storageScope';
import { supabase } from './supabase';

export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
}

export const AI_MODELS: Array<{ value: string; label: string }> = [
  { value: 'claude-opus-5', label: 'Claude Opus 5 — deepest (recommended)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast, cheap' },
];

// Paid AI is opt-in. New accounts start disabled and use the cheapest supported
// model when enabled. The server proxy has a separate deployment kill switch.
const DEFAULTS: AiConfig = { enabled: false, apiKey: '', model: 'claude-haiku-4-5-20251001' };

export function getAiConfig(): AiConfig {
  const raw = (liveState.settings as Record<string, unknown>).ai as Partial<AiConfig> | undefined;
  return { ...DEFAULTS, ...(raw || {}) };
}

export function setAiConfig(patch: Partial<AiConfig>): void {
  update((s) => {
    const cur = ((s.settings as Record<string, unknown>).ai ||= { ...DEFAULTS }) as AiConfig;
    Object.assign(cur, patch);
  });
}

/**
 * True when the tutor is switched on. A request then goes through the server proxy
 * (no student key needed) or, if the student entered their own key, directly with
 * that key. Either way the buttons are live; a missing server key surfaces as a
 * clear message telling them to add their own.
 */
export function aiReady(): boolean {
  return getAiConfig().enabled;
}

/* ---- Answer cache: a hint/explanation is deterministic enough to reuse, so we
 * keep the last few hundred replies in localStorage. Re-opening a question is then
 * instant and free. FIFO-capped so it never grows without bound. ---- */
const CACHE_KEY = 'foundation_ai_cache_v1';
const CACHE_MAX = 300;

function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(scopedLocalStorageKey(CACHE_KEY)) || '{}');
  } catch {
    return {};
  }
}

export function aiCacheGet(key: string): string | null {
  return loadCache()[key] ?? null;
}

export function aiCacheSet(key: string, value: string): void {
  const c = loadCache();
  c[key] = value;
  const keys = Object.keys(c);
  if (keys.length > CACHE_MAX) delete c[keys[0]!];
  try {
    localStorage.setItem(scopedLocalStorageKey(CACHE_KEY), JSON.stringify(c));
  } catch {
    /* storage full — the cache is a nicety, not critical */
  }
}

export interface AiError {
  kind: 'no-key' | 'offline' | 'http' | 'parse';
  message: string;
}

function fail(kind: AiError['kind'], message: string): AiError {
  return { kind, message };
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AiResult = { ok: true; text: string } | { ok: false; error: AiError };

/** Fallback model for keys that cannot use Opus (no premium/tier access). */
const FALLBACK_MODEL = 'claude-sonnet-5';

type RawResult = AiResult & { downgradeable?: boolean };

/** Pull the assistant text out of an Anthropic-shaped response body. */
function textFrom(data: unknown): string {
  const content = (data as { content?: Array<{ text?: string }> })?.content;
  return Array.isArray(content) ? content.map((b) => b?.text || '').join('').trim() : '';
}

/** Direct request with the student's own key (browser → Anthropic). */
async function rawDirect(
  system: string,
  messages: AiMessage[],
  model: string,
  apiKey: string,
  opts: { maxTokens?: number; signal?: AbortSignal }
): Promise<RawResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 1000, system, messages }),
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status}).`;
      try {
        detail = (await res.json())?.error?.message || detail;
      } catch {
        /* keep status message */
      }
      const downgradeable =
        res.status === 403 || res.status === 404 || /model|permission|not[_ ]?found|not allowed|access|tier|entitl/i.test(detail);
      if (res.status === 401) detail = 'Your API key was rejected — check it in Settings.';
      return { ok: false, error: fail('http', detail), downgradeable };
    }
    const text = textFrom(await res.json());
    if (!text) return { ok: false, error: fail('parse', 'The tutor returned an empty reply.') };
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Cancelled.' : 'Could not reach the AI service.';
    return { ok: false, error: fail('offline', msg) };
  }
}

/** Request through the same-origin server proxy — no student key needed. */
async function rawProxy(
  system: string,
  messages: AiMessage[],
  model: string,
  opts: { maxTokens?: number; signal?: AbortSignal }
): Promise<RawResult> {
  const NO_SERVER = 'The AI tutor is not set up on the server — add your own API key in Settings to use it now.';
  try {
    const sessionResult = await supabase?.auth.getSession();
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      return { ok: false, error: fail('http', 'Sign in again before using the AI tutor.') };
    }
    const res = await fetch('/api/ai', {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ system, messages, model, maxTokens: opts.maxTokens ?? 1000 }),
    });
    // A static host with no function returns HTML for /api/ai; treat non-JSON as "no server".
    if (!(res.headers.get('content-type') || '').includes('application/json')) {
      return { ok: false, error: fail('http', NO_SERVER) };
    }
    const responseData = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) {
      let detail = responseData.error?.message || `Request failed (${res.status}).`;
      if (res.status === 503 || res.status === 404) detail = NO_SERVER;
      const downgradeable = res.status === 403 || /model|permission|tier|entitl/i.test(detail);
      return { ok: false, error: fail('http', detail), downgradeable };
    }
    const text = textFrom(responseData);
    if (!text) return { ok: false, error: fail('parse', 'The tutor returned an empty reply.') };
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Cancelled.' : 'Could not reach the AI service.';
    return { ok: false, error: fail('offline', msg) };
  }
}

/**
 * Multi-turn chat. Uses the server proxy by default (so students need no key); if a
 * student has entered their own key it goes direct with that key instead. If the
 * chosen model (Opus by default) is unavailable, it retries once with Sonnet and
 * remembers that, so no one is left with an error where a strong answer was possible.
 */
export async function aiChat(
  system: string,
  messages: AiMessage[],
  opts: { maxTokens?: number; signal?: AbortSignal } = {}
): Promise<AiResult> {
  const cfg = getAiConfig();
  if (!cfg.enabled) {
    return { ok: false, error: fail('no-key', 'Turn on the AI tutor in Settings.') };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: fail('offline', 'You are offline — the AI tutor needs a connection.') };
  }
  const key = cfg.apiKey.trim();
  const model = cfg.model || DEFAULTS.model;
  const run = (m: string) => (key ? rawDirect(system, messages, m, key, opts) : rawProxy(system, messages, m, opts));

  const first = await run(model);
  if (first.ok) return first;
  if (first.downgradeable && model !== FALLBACK_MODEL) {
    const alt = await run(FALLBACK_MODEL);
    if (alt.ok) {
      setAiConfig({ model: FALLBACK_MODEL });
      return alt;
    }
  }
  return { ok: false, error: first.error };
}

/** One-shot completion — a single user turn. Thin wrapper over aiChat. */
export function aiComplete(
  system: string,
  user: string,
  opts: { maxTokens?: number; signal?: AbortSignal } = {}
): Promise<AiResult> {
  return aiChat(system, [{ role: 'user', content: user }], opts);
}

/** The shared system prompt, exported so the chat panel can reuse it for follow-ups. */
export const tutorSystem = () => TUTOR_SYSTEM;

const TUTOR_SYSTEM =
  'You are a rigorous, encouraging medical-school tutor. Use British spelling. Be correct and ' +
  'precise; never invent facts, citations, trials or numbers — if unsure of a specific figure, ' +
  'explain the idea without it. Write clearly with short paragraphs or bullet points and match the ' +
  'depth to what is asked. No preamble and no sign-off.';

/** Build a plain-text description of an MCQ for the model. */
function describeQuestion(q: {
  stem: string;
  options: Array<{ id?: string; text: string; correct?: boolean }>;
}): string {
  const opts = q.options
    .map((o, i) => `${'ABCDEF'[i]}. ${o.text}`)
    .join('\n');
  return `Question:\n${q.stem}\n\nOptions:\n${opts}`;
}

/** A hint that nudges without giving the answer away. */
export function hintPrompt(q: { stem: string; options: Array<{ id?: string; text: string; correct?: boolean }> }) {
  return {
    system: TUTOR_SYSTEM,
    user:
      describeQuestion(q) +
      '\n\nGive ONE short hint (2 sentences max) that points the student toward the right reasoning. ' +
      'Do NOT reveal which option is correct and do NOT name the answer.',
  };
}

/** A full teaching explanation, safe to show after the student has answered. */
export function explainPrompt(q: {
  stem: string;
  options: Array<{ id?: string; text: string; correct?: boolean }>;
}) {
  const correct = q.options.filter((o) => o.correct).map((o) => o.text).join('; ');
  return {
    system: TUTOR_SYSTEM,
    user:
      describeQuestion(q) +
      `\n\nThe correct answer is: ${correct}.\n\n` +
      'Give a complete teaching explanation a student could revise from:\n' +
      '1. **Why the correct answer is right** — state the underlying mechanism or principle, not just the fact.\n' +
      '2. **Every other option, one by one** (A, B, C, …) — explain specifically why each is wrong or less correct; ' +
      'do not skip any.\n' +
      '3. **Take-home** — one high-yield point, plus the common trap or misconception this question targets.\n' +
      'Be thorough but exam-relevant, and use the headings/bullets above so it is easy to scan.',
  };
}

/** A pre-reveal hint for a flashcard — guides recall without giving the answer. */
export function hintCardPrompt(card: { front?: string; back?: string; cloze?: string }) {
  const prompt = card.cloze
    ? `Cloze card (the blanks are the answer): ${card.cloze.replace(/\{\{c\d+::([^}]*?)(?:::[^}]*?)?\}\}/g, '[...]')}`
    : `Flashcard prompt: ${card.front ?? ''}`;
  return {
    system: TUTOR_SYSTEM,
    user:
      `${prompt}\n\nGive ONE short hint (2 sentences max) that guides me toward recalling the answer — ` +
      'point at the concept or mechanism. Do NOT state the answer itself.',
  };
}

/** A full teaching explanation for a flashcard, shown once the answer is revealed. */
export function explainCardPrompt(card: { front?: string; back?: string; cloze?: string }) {
  const body = card.cloze
    ? `Cloze card (answers are inside {{c::…}}): ${card.cloze}`
    : `Front (prompt): ${card.front ?? ''}\nBack (answer): ${card.back ?? ''}`;
  return {
    system: TUTOR_SYSTEM,
    user:
      `${body}\n\n` +
      'Give a complete teaching explanation of this flashcard a student could revise from:\n' +
      '1. **Why the answer is correct** — the underlying mechanism or reasoning, not just a restatement.\n' +
      '2. **Key associations** — the related facts, classic links and how this fits the bigger topic.\n' +
      '3. **Common confusions** — what students wrongly answer here and how to tell those apart from the right answer.\n' +
      '4. **Take-home** — one high-yield point.\n' +
      'Be thorough but exam-relevant; use the headings/bullets above.',
  };
}
