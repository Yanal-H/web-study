import { useEffect, useMemo, useRef, useState } from 'react';
import { aiChat, aiReady, aiCacheGet, aiCacheSet, tutorSystem, type AiMessage } from '../../lib/ai';
import { renderMarkdown } from '../../lib/markdown';
import { IconSparkle } from '../../design/icons';

interface AiTutorProps {
  /** stable id (question/card id) used to cache the first explanation */
  cacheKey: string;
  /** prompt that produces the full explanation */
  explainPrompt: string;
  /** optional pre-answer hint prompt; the Hint button shows only when this is present and canHint is true */
  hintPrompt?: string;
  /** hide the Hint button once the answer is visible */
  canHint?: boolean;
  /** hide the Show explanation button until the answer is visible (recall-first) */
  canExplain?: boolean;
  /** a plain-text description of the question/card, so follow-up chat has context */
  contextForChat: string;
}

type Turn = AiMessage & { hidden?: boolean };

export default function AiTutor({ cacheKey, explainPrompt, hintPrompt, canHint = true, canExplain = true, contextForChat }: AiTutorProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [input, setInput] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  // one tutor thread per question/card — reset everything when it changes
  useEffect(() => {
    setTurns([]);
    setErr('');
    setInput('');
  }, [cacheKey]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, loading]);

  const shown = useMemo(() => turns.filter((t) => !t.hidden), [turns]);

  if (!aiReady()) return null;

  const apiMessages = (extra: Turn[] = []): AiMessage[] =>
    [...turns, ...extra].map((t) => ({ role: t.role, content: t.content }));

  async function seed(kind: 'hint' | 'explain') {
    const prompt = kind === 'hint' ? hintPrompt! : explainPrompt;
    if (kind === 'explain') {
      const cached = aiCacheGet(cacheKey);
      if (cached) {
        setTurns([
          { role: 'user', content: prompt, hidden: true },
          { role: 'assistant', content: cached },
        ]);
        return;
      }
    }
    setErr('');
    const base: Turn[] = [{ role: 'user', content: prompt, hidden: true }];
    setTurns(base);
    setLoading(true);
    const res = await aiChat(tutorSystem(), base.map((t) => ({ role: t.role, content: t.content })), {
      maxTokens: kind === 'hint' ? 220 : 1200,
    });
    setLoading(false);
    if (res.ok) {
      setTurns([...base, { role: 'assistant', content: res.text }]);
      if (kind === 'explain') aiCacheSet(cacheKey, res.text);
    } else {
      setErr(res.error.message);
    }
  }

  function openChat() {
    if (turns.length === 0) {
      setTurns([
        { role: 'user', content: `${contextForChat}\n\nI want to discuss this.`, hidden: true },
        { role: 'assistant', content: 'Ask me anything about this — the reasoning, a specific option, or how it connects to the wider topic.' },
      ]);
    }
  }

  async function send() {
    const t = input.trim();
    if (!t || loading) return;
    setInput('');
    setErr('');
    const userTurn: Turn = { role: 'user', content: t };
    const msgs = apiMessages([userTurn]);
    setTurns((cur) => [...cur, userTurn]);
    setLoading(true);
    const res = await aiChat(tutorSystem(), msgs, { maxTokens: 1000 });
    setLoading(false);
    if (res.ok) setTurns((cur) => [...cur, { role: 'assistant', content: res.text }]);
    else setErr(res.error.message);
  }

  return (
    <div className="ai-tutor no-print">
      {shown.length === 0 && !loading ? (
        <div className="ai-actions">
          {hintPrompt && canHint && (
            <button className="ai-btn" onClick={() => void seed('hint')}>
              <IconSparkle size={15} /> Hint
            </button>
          )}
          {canExplain && (
            <button className="ai-btn ai-btn--solid" onClick={() => void seed('explain')}>
              <IconSparkle size={15} /> Show explanation
            </button>
          )}
          <button className="ai-btn" onClick={openChat}>
            Ask AI
          </button>
        </div>
      ) : (
        <div className="ai-thread">
          <div className="ai-thread-head">
            <IconSparkle size={14} /> AI tutor
            <span className="ai-panel-note">generated live — verify against the material</span>
          </div>
          <div className="ai-messages" ref={scroller}>
            {shown.map((t, i) =>
              t.role === 'assistant' ? (
                <div key={i} className="ai-msg ai-msg--bot md" dangerouslySetInnerHTML={{ __html: renderMarkdown(t.content) }} />
              ) : (
                <div key={i} className="ai-msg ai-msg--me">
                  {t.content}
                </div>
              )
            )}
            {loading && (
              <div className="ai-msg ai-msg--bot ai-typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
          {err && <div className="ai-err">{err}</div>}
          <div className="ai-compose">
            <input
              className="input ai-input"
              placeholder="Ask a follow-up…"
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="ai-btn ai-btn--solid" onClick={() => void send()} disabled={loading || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
