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

export interface AiError {
  kind: 'no-key' | 'offline' | 'http' | 'parse';
  message: string;
}

function fail(kind: AiError['kind'], message: string): AiError {
  return { kind, message };
}

/**
 * One-shot completion against the Anthropic Messages API, direct from the browser.
 * Returns the assistant text, or an AiError describing what to tell the student.
 */
export async function aiComplete(
  system: string,
  user: string,
  opts: { maxTokens?: number; signal?: AbortSignal } = {}
): Promise<{ ok: true; text: string } | { ok: false; error: AiError }> {
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
        max_tokens: opts.maxTokens ?? 700,
        system,
        messages: [{ role: 'user', content: user }],
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

const TUTOR_SYSTEM =
  'You are a concise medical-school tutor helping a student with an exam question. ' +
  'Use British spelling. Be rigorous and correct. Do not invent facts or citations. ' +
  'Keep answers tight and readable in plain prose or short bullet points. No preamble.';

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
      'Explain in 3–5 short bullet points: why the correct answer is right, why the main distractors are wrong, ' +
      'and one high-yield take-home point. Keep it exam-focused.',
  };
}
