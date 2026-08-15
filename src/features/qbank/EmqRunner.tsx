import { useState } from 'react';
import { Card, Button, Badge, ProgressRing } from '../../design/primitives';
import { IconCheck } from '../../design/icons';
import { recordResult } from './perf';
import type { Emq } from '../../content/schema';

type EmqWithMeta = Emq & { chapterId: string; subject: string };

export default function EmqRunner({ emqs, onExit }: { emqs: EmqWithMeta[]; onExit: () => void }) {
  const [active, setActive] = useState<EmqWithMeta | null>(emqs.length === 1 ? emqs[0]! : null);

  if (!active) {
    return (
      <>
        <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1>EMQ sets</h1>
            <div className="sub">Extended matching — one shared option bank, several stems.</div>
          </div>
          <Button variant="ghost" onClick={onExit}>Back</Button>
        </header>
        <div className="subject-grid">
          {emqs.map((e) => (
            <Card key={e.id} interactive padSm onClick={() => setActive(e)}>
              <div className="card-eyebrow">{e.subject}</div>
              <h3 style={{ margin: '2px 0 8px', fontSize: 'var(--fs-md)' }}>{e.theme}</h3>
              <div className="row wrap" style={{ gap: 6 }}>
                <Badge>{e.options.length} options</Badge>
                <Badge tone="info">{e.stems.length} stems</Badge>
              </div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return <EmqSet emq={active} onExit={() => (emqs.length === 1 ? onExit() : setActive(null))} />;
}

function EmqSet({ emq, onExit }: { emq: EmqWithMeta; onExit: () => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const answeredAll = emq.stems.every((_, i) => answers[i]);
  const correctCount = emq.stems.filter((s, i) => answers[i] === s.answer).length;

  function submit() {
    setSubmitted(true);
    // record each stem as an attempt keyed by a stable id
    emq.stems.forEach((s, i) => {
      recordResult(`${emq.id}#${i}`, answers[i] === s.answer);
    });
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="card-eyebrow">{emq.subject} · EMQ</div>
          <h1>{emq.theme}</h1>
          {emq.instruction && <div className="sub">{emq.instruction}</div>}
        </div>
        <Button variant="ghost" onClick={onExit}>Back</Button>
      </header>

      <div className="emq-layout">
        <Card className="emq-bank" padSm>
          <div className="card-eyebrow" style={{ marginBottom: 8 }}>Option bank</div>
          <ol className="emq-options">
            {emq.options.map((o) => (
              <li key={o.id}>
                <span className="emq-key">{o.id.toUpperCase()}</span> {o.text}
              </li>
            ))}
          </ol>
        </Card>

        <div className="emq-stems">
          {emq.stems.map((s, i) => {
            const picked = answers[i];
            const correct = submitted && picked === s.answer;
            const wrong = submitted && picked && picked !== s.answer;
            return (
              <Card key={i} padSm className={`emq-stem ${correct ? 'correct' : wrong ? 'incorrect' : ''}`}>
                <div className="emq-stem-text">
                  <strong>{i + 1}.</strong> {s.stem}
                </div>
                <div className="emq-choices">
                  {emq.options.map((o) => (
                    <button
                      key={o.id}
                      className={`emq-choice ${picked === o.id ? 'picked' : ''} ${submitted && o.id === s.answer ? 'answer' : ''}`}
                      disabled={submitted}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: o.id }))}
                    >
                      {o.id.toUpperCase()}
                    </button>
                  ))}
                </div>
                {submitted && (
                  <div className="emq-feedback">
                    {correct ? <span className="ok">Correct</span> : <span className="no">Answer: {s.answer.toUpperCase()}</span>}
                    {s.why && <span className="emq-why"> — {s.why}</span>}
                  </div>
                )}
              </Card>
            );
          })}

          {!submitted ? (
            <Button variant="primary" block disabled={!answeredAll} style={{ marginTop: 12 }} onClick={submit}>
              Submit ({Object.keys(answers).length}/{emq.stems.length})
            </Button>
          ) : (
            <Card style={{ marginTop: 12, textAlign: 'center' }}>
              <ProgressRing value={correctCount / emq.stems.length} size={96} label={`${correctCount}/${emq.stems.length}`} />
              <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
                <Button variant="primary" onClick={onExit}>
                  <IconCheck size={16} /> Done
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
