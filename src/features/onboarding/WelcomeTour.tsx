import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../../design/Dialog';
import { Button } from '../../design/primitives';
import { update } from '../../state/store';
import { IconStudy, IconFlashcards, IconQbank, IconPlanner, IconSparkle } from '../../design/icons';

// Small state actions intentionally live beside the only component that owns them.
// eslint-disable-next-line react-refresh/only-export-components
export function markOnboarded(): void {
  update((s) => {
    (s.settings as Record<string, unknown>).onboarded = true;
  });
}

/** Reset so the tour shows again on the next dashboard visit. */
// eslint-disable-next-line react-refresh/only-export-components
export function replayTour(): void {
  update((s) => {
    (s.settings as Record<string, unknown>).onboarded = false;
  });
}

interface Step {
  icon: React.ReactNode;
  title: string;
  body: string;
  go?: string;
  cta?: string;
}

const STEPS: Step[] = [
  {
    icon: <IconSparkle size={26} />,
    title: 'Welcome to Foundation',
    body: 'Your focused medical study base — textbook reading, spaced-repetition flashcards, questions, notes and planning. Published chapters load securely while you are online; your personal progress stays on this device.',
  },
  {
    icon: <IconStudy size={26} />,
    title: 'Study — read the chapters',
    body: 'Open a chapter to read it like a textbook: sticky contents, high-yield boxes, tables and pitfalls. Select any text to turn it into a flashcard, or press Listen to hear it.',
    go: '/study',
    cta: 'Open Study',
  },
  {
    icon: <IconFlashcards size={26} />,
    title: 'Flashcards — lock it in',
    body: 'Review with spaced repetition so cards come back exactly when you are about to forget them. Grade each card Again / Hard / Good / Easy and the schedule does the rest.',
    go: '/flashcards',
    cta: 'Open Flashcards',
  },
  {
    icon: <IconQbank size={26} />,
    title: 'Question Bank — test yourself',
    body: 'Single-best-answer, multi-answer and EMQ questions with written rationales. Choose a topic, answer, review the explanation and keep moving.',
    go: '/qbank',
    cta: 'Open Questions',
  },
  {
    icon: <IconPlanner size={26} />,
    title: 'Plan your days',
    body: 'The dashboard shows Today’s plan — due cards, weak questions and your tasks in one ordered list. Tip: press g then s / q / f to jump between pages.',
  },
];

export default function WelcomeTour() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  function finish(go?: string) {
    markOnboarded();
    if (go) navigate(go);
  }

  return (
    <Dialog
      title="Getting started"
      onClose={() => markOnboarded()}
      footer={
        <div className="row spread">
          <button className="btn btn--ghost btn--sm" onClick={() => markOnboarded()}>
            Skip
          </button>
          <div className="row" style={{ gap: 8 }}>
            {i > 0 && (
              <Button size="sm" onClick={() => setI((n) => n - 1)}>
                Back
              </Button>
            )}
            {step.go && (
              <Button size="sm" variant="ghost" onClick={() => finish(step.go)}>
                {step.cta}
              </Button>
            )}
            {last ? (
              <Button variant="primary" size="sm" onClick={() => finish('/study')}>
                Start studying
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setI((n) => n + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="tour-step">
        <div className="tour-ico">{step.icon}</div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, n) => (
            <span key={n} className={`tour-dot${n === i ? ' on' : ''}`} />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
