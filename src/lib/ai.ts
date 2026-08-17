// Optional AI tutor. Bring-your-own-key, off by default, and never touched unless
// the student explicitly asks for a hint or an explanation. The core app stays
// fully offline — this is the one place a network request can happen, and only
// after a deliberate click by someone who has entered their own key.

import { state as liveState, update } from '../state/store';

export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
}

export const AI_MODELS: Array<{ value: string; label: string }> = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast, cheap' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced' },
  { value: 'claude-opus-5', label: 'Claude Opus 5 — deepest' },
];

const DEFAULTS: AiConfig = { enabled: false, apiKey: '', model: AI_MODELS[0]!.value };

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

/** True when the tutor is switched on and a key has been entered. */
export function aiReady(): boolean {
  const c = getAiConfig();
  return c.enabled && c.apiKey.trim().length > 0;
}

/* ---- Answer cache: a hint/explanation is deterministic enough to reuse, so we
 * keep the last few hundred replies in localStorage. Re-opening a question is then
 * instant and free. FIFO-capped so it never grows without bound. ---- */
const CACHE_KEY = 'foundation_ai_cache_v1';
const CACHE_MAX = 300;

function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
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
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
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

/**
 * Multi-turn chat against the Anthropic Messages API, direct from the browser.
 * Pass the whole conversation so follow-up questions keep their context.
 */
export async function aiChat(
  system: string,
  messages: AiMessage[],
  opts: { maxTokens?: number; signal?: AbortSignal } = {}
): Promise<AiResult> {
  const cfg = getAiConfig();
  if (!cfg.enabled || !cfg.apiKey.trim()) {
    return { ok: false, error: fail('no-key', 'Turn on the AI tutor and add your API key in Settings.') };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: fail('offline', 'You are offline — the AI tutor needs a connection.') };
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model || DEFAULTS.model,
        max_tokens: opts.maxTokens ?? 1000,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status}).`;
      try {
        const j = await res.json();
        detail = j?.error?.message || detail;
      } catch {
        /* keep the status-code message */
      }
      if (res.status === 401) detail = 'Your API key was rejected — check it in Settings.';
      return { ok: false, error: fail('http', detail) };
    }
    const data = await res.json();
    const text = Array.isArray(data?.content)
      ? data.content.map((b: { text?: string }) => b?.text || '').join('').trim()
      : '';
    if (!text) return { ok: false, error: fail('parse', 'The tutor returned an empty reply.') };
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Cancelled.' : 'Could not reach the AI service.';
    return { ok: false, error: fail('offline', msg) };
  }
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
