// Natural-language quick-add for tasks.
//
// A student types the way they think — "drill upper limb tomorrow !!", "read
// surgery ch2 by friday", "mcqs monday" — and this pulls out the due date, the
// kind of work, and the priority, leaving a clean title. Every field is
// optional, so a bare "revise anatomy" still parses; nothing is ever rejected.

export type TaskType = 'read' | 'drill' | 'questions' | 'revise' | 'task';

export interface ParsedTask {
  title: string;
  type: TaskType;
  /** epoch ms at local midnight of the due day, or null for no date */
  due: number | null;
  /** 0 normal, 1 high, 2 urgent */
  priority: number;
}

const DAY = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 4 - 1, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Next occurrence of a weekday index (0=Sun), today counts only if `includeToday`. */
function nextWeekday(target: number, from: Date, includeToday: boolean): number {
  const cur = from.getDay();
  let delta = (target - cur + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return midnight(from) + delta * DAY;
}

const TYPE_WORDS: Array<[RegExp, TaskType]> = [
  [/\b(read|reading|chapter|ch\d+|study)\b/i, 'read'],
  [/\b(drill|cards?|flashcards?|recall|anki)\b/i, 'drill'],
  [/\b(mcqs?|questions?|quiz|practice|exam|emq|sba)\b/i, 'questions'],
  [/\b(revise|revision|review|recap|go over)\b/i, 'revise'],
];

/** Parse a line of free text into a structured task. */
export function parseTask(raw: string, now = new Date()): ParsedTask {
  let text = ' ' + raw.trim() + ' ';
  let due: number | null = null;
  let priority = 0;

  // priority: !, !!, or the word urgent/asap
  if (/\b(urgent|asap)\b/i.test(text) || /!{2,}/.test(text)) priority = 2;
  else if (/\bimportant\b/i.test(text) || /(?<!\!)\!(?!\!)/.test(text)) priority = 1;
  text = text.replace(/\burgent\b|\basap\b|\bimportant\b|!+/gi, ' ');

  // relative dates
  const rel: Array<[RegExp, () => number]> = [
    [/\b(today|tonight)\b/i, () => midnight(now)],
    [/\btomorrow\b/i, () => midnight(now) + DAY],
    [/\bin (\d{1,2}) days?\b/i, () => 0], // handled below with capture
    [/\bnext week\b/i, () => midnight(now) + 7 * DAY],
    [/\bthis weekend\b/i, () => nextWeekday(6, now, true)],
  ];
  const inDays = text.match(/\bin (\d{1,2}) days?\b/i);
  if (inDays) {
    due = midnight(now) + parseInt(inDays[1]!, 10) * DAY;
    text = text.replace(inDays[0], ' ');
  }
  if (due == null) {
    for (const [re, fn] of rel) {
      const m = text.match(re);
      if (m && !/in \d/.test(m[0])) {
        due = fn();
        text = text.replace(m[0], ' ');
        break;
      }
    }
  }

  // weekday names, optionally prefixed with "by"/"on"/"next"
  if (due == null) {
    const wd = text.match(/\b(?:by |on |next )?(sun|mon|tues?|weds?|thur?s?|fri|sat)(?:day)?\b/i);
    if (wd) {
      const key = wd[1]!.toLowerCase();
      const idx = WEEKDAY_ABBR[key] ?? WEEKDAYS.indexOf(key);
      if (idx >= 0) {
        const nextWord = /\bnext /i.test(wd[0]);
        due = nextWeekday(idx, now, false) + (nextWord ? 7 * DAY : 0);
        text = text.replace(wd[0], ' ');
      }
    }
  }

  // explicit dd/mm or dd-mm
  if (due == null) {
    const dm = text.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
    if (dm) {
      const d = parseInt(dm[1]!, 10);
      const mo = parseInt(dm[2]!, 10) - 1;
      let yr = dm[3] ? parseInt(dm[3], 10) : now.getFullYear();
      if (yr < 100) yr += 2000;
      const dt = new Date(yr, mo, d);
      if (!isNaN(dt.getTime())) {
        // if the date already passed this year with no year given, roll forward
        if (!dm[3] && midnight(dt) < midnight(now)) dt.setFullYear(yr + 1);
        due = midnight(dt);
        text = text.replace(dm[0], ' ');
      }
    }
  }

  // type from remaining words
  let type: TaskType = 'task';
  for (const [re, t] of TYPE_WORDS) {
    if (re.test(text)) {
      type = t;
      break;
    }
  }

  // clean the title: drop filler connectives left behind, collapse spaces
  const title = text
    .replace(/\b(by|on|at|the|a)\b/gi, (m) => m) // keep meaningful words
    .replace(/\s+/g, ' ')
    .replace(/^[\s-–—:]+|[\s-–—:]+$/g, '')
    .trim();

  return { title: title || raw.trim(), type, due, priority };
}

/** Friendly relative label for a due date. */
export function dueLabel(due: number | null, now = new Date()): string {
  if (due == null) return '';
  const d0 = midnight(now);
  const days = Math.round((due - d0) / DAY);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return new Date(due).toLocaleDateString('en-GB', { weekday: 'long' });
  return new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const TYPE_META: Record<TaskType, { label: string; hue: number }> = {
  read: { label: 'Read', hue: 265 },
  drill: { label: 'Drill', hue: 158 },
  questions: { label: 'Questions', hue: 210 },
  revise: { label: 'Revise', hue: 32 },
  task: { label: 'Task', hue: 220 },
};
