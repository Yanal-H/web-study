import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useStoreVersion } from '../../state/useStore';
import { deckStats } from '../../data/session';
import { whenPublishedContentReady } from '../../data/remoteContent';
import { Button, Card, EmptyState } from '../../design/primitives';
import { IconFlashcards, IconQbank, IconStudy, IconTarget } from '../../design/icons';
import { todayProgress, weakMcqs } from '../../lib/stats';
import { collectItems, queueStats } from '../flashcards/deck';
import { getCatalogChapter, listCatalogChapters } from '../../content/catalog';
import { isDue as mcqDue } from '../qbank/perf';
import WelcomeTour from '../onboarding/WelcomeTour';

type NextAction = {
  eyebrow: string;
  title: string;
  detail: string;
  label: string;
  go: string;
  icon: React.ReactNode;
};

/** The student home answers “what should I do now?” before showing detail. */
export default function DashboardView() {
  const state = useStore();
  const navigate = useNavigate();
  const storeVersion = useStoreVersion();

  const userDeck = collectItems().filter((item) => item.source === 'user');
  const userQueue = queueStats(userDeck);
  const [engineQueue, setEngineQueue] = useState({ due: 0, neu: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    void whenPublishedContentReady()
      .then(() => deckStats(''))
      .then((next) => alive && setEngineQueue(next))
      .catch(() => {});
    return () => { alive = false; };
  }, [storeVersion]);

  const cards = {
    due: userQueue.due + engineQueue.due,
    new: userQueue.neu + engineQueue.neu,
    total: userQueue.total + engineQueue.total,
  };
  const catalogQuestions = listCatalogChapters().flatMap((chapter) => chapter.mcqs);
  const questionDue = catalogQuestions
    .filter((question) => state.study.mcqPerf[question.id] && mcqDue(question.id)).length;
  const weak = weakMcqs(state.study.mcqPerf, 3);
  const goal = todayProgress(state);

  const recent = (() => {
    const progress = state.study.progress || {};
    return Object.entries(progress)
      .filter(([, item]: [string, any]) => item?.lastOpened)
      .map(([id, item]: [string, any]) => ({ id, chapter: getCatalogChapter(id), lastOpened: item.lastOpened as string }))
      .filter((item) => item.chapter)
      .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1))
      .slice(0, 3);
  })();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const current = recent[0];

  const next = (() : NextAction => {
    if (cards.due > 0) return {
      eyebrow: 'Review due', title: `${cards.due} card${cards.due === 1 ? '' : 's'} need review`,
      detail: cards.new > 0 ? `${cards.new} new card${cards.new === 1 ? '' : 's'} are also ready when you finish.` : 'Keep your recall schedule on track.',
      label: 'Review cards', go: '/flashcards', icon: <IconFlashcards size={21} />,
    };
    if (questionDue > 0) return {
      eyebrow: 'Question review', title: `${questionDue} question${questionDue === 1 ? '' : 's'} are ready again`,
      detail: 'Revisit earlier questions while the explanation is still useful.',
      label: 'Review questions', go: '/qbank', icon: <IconQbank size={21} />,
    };
    if (current) return {
      eyebrow: 'Continue studying', title: current.chapter!.title,
      detail: `${current.chapter!.subject} · pick up where you last stopped.`,
      label: 'Resume chapter', go: `/study/${encodeURIComponent(current.id)}`, icon: <IconStudy size={21} />,
    };
    if (weak.length > 0) return {
      eyebrow: 'Targeted practice', title: `${weak.length} weak area${weak.length === 1 ? '' : 's'} to practise`,
      detail: 'Focus on questions you have missed repeatedly.',
      label: 'Practise questions', go: '/qbank', icon: <IconTarget size={21} />,
    };
    return {
      eyebrow: 'Start studying', title: 'Choose a chapter',
      detail: 'Read a topic, then use its cards and questions to check recall.',
      label: 'Open study library', go: '/study', icon: <IconStudy size={21} />,
    };
  })();

  return (
    <>
      {!(state.settings as Record<string, unknown>).onboarded && <WelcomeTour />}

      <header className="study-home-head">
        <div>
          <p className="study-home-kicker">{greeting}</p>
          <h1>Study today</h1>
          <p>One clear next step, then the material that needs your attention.</p>
        </div>
        <div className="daily-goal" aria-label={`${goal.done} of ${goal.goal} daily reviews complete`}>
          <div className="daily-goal-top"><span>Daily goal</span><strong>{goal.done}/{goal.goal}</strong></div>
          <span className="daily-goal-track" aria-hidden="true"><span style={{ width: `${Math.round(goal.ratio * 100)}%` }} /></span>
        </div>
      </header>

      <section className="study-next enter" aria-label="Recommended next step">
        <div className="study-next-icon">{next.icon}</div>
        <div className="study-next-copy">
          <span>{next.eyebrow}</span>
          <h2>{next.title}</h2>
          <p>{next.detail}</p>
        </div>
        <Button variant="primary" onClick={() => navigate(next.go)}>{next.label}</Button>
      </section>

      <section className="section" aria-labelledby="continue-heading">
        <div className="section-head"><h2 id="continue-heading">Continue</h2></div>
        {current ? (
          <div className="continue-grid">
            {recent.map((item) => (
              <button key={item.id} className="continue-card" onClick={() => navigate(`/study/${encodeURIComponent(item.id)}`)}>
                <span className="continue-card-subject">{item.chapter!.subject}</span>
                <strong>{item.chapter!.title}</strong>
                <small>Last opened {new Date(item.lastOpened).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>
                <span className="continue-card-go">Resume <IconStudy size={14} /></span>
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={<IconStudy size={22} />} title="No chapter in progress">
              Open a chapter and it will appear here so you can return in one tap.
              <Button size="sm" style={{ marginTop: 12 }} onClick={() => navigate('/study')}>Browse chapters</Button>
            </EmptyState>
          </Card>
        )}
      </section>

      <div className="study-home-grid">
        <section className="section" aria-labelledby="review-heading">
          <div className="section-head"><h2 id="review-heading">Review</h2></div>
          <Card className="review-summary">
            <ReviewRow icon={<IconFlashcards size={18} />} title="Flashcards" detail={cards.total ? `${cards.due} due · ${cards.new} new` : 'No cards loaded yet'} action="Open cards" onClick={() => navigate('/flashcards')} />
            <ReviewRow icon={<IconQbank size={18} />} title="Questions" detail={questionDue ? `${questionDue} due for review` : 'No questions due right now'} action="Open questions" onClick={() => navigate('/qbank')} />
          </Card>
        </section>

        <section className="section" aria-labelledby="weak-heading">
          <div className="section-head"><h2 id="weak-heading">Weak areas</h2></div>
          <Card className="weak-summary">
            {weak.length === 0 ? (
              <EmptyState icon={<IconTarget size={22} />} title="Nothing flagged yet">
                Questions missed repeatedly will appear here for targeted practice.
              </EmptyState>
            ) : (
              <>
                <p>Based on questions answered at least twice.</p>
                <div className="weak-list">
                  {weak.map((item) => {
                    const question = catalogQuestions.find((candidate) => candidate.id === item.qid);
                    return (
                      <div key={item.qid} className="weak-item">
                        <div><strong>{question?.subject || 'Question bank'}</strong><span>{Math.round(item.accuracy * 100)}% correct across {item.attempts} attempts</span></div>
                        <span className="weak-score">Needs review</span>
                      </div>
                    );
                  })}
                </div>
                <Button size="sm" onClick={() => navigate('/qbank')}>Practise weak areas</Button>
              </>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

function ReviewRow({ icon, title, detail, action, onClick }: { icon: React.ReactNode; title: string; detail: string; action: string; onClick: () => void }) {
  return (
    <div className="review-row">
      <span className="review-row-icon">{icon}</span>
      <div><strong>{title}</strong><span>{detail}</span></div>
      <Button size="sm" variant="ghost" onClick={onClick}>{action}</Button>
    </div>
  );
}
