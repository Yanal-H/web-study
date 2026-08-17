import { describe, expect, it } from 'vitest';
import { parseTask, dueLabel } from './parse';

// a fixed Wednesday so weekday maths is deterministic
const WED = new Date(2026, 0, 7, 10, 0, 0); // 2026-01-07 is a Wednesday
const DAY = 86_400_000;
const mid = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

describe('parseTask', () => {
  it('parses tomorrow and strips it from the title', () => {
    const t = parseTask('drill upper limb tomorrow', WED);
    expect(t.due).toBe(mid(WED) + DAY);
    expect(t.title).toBe('drill upper limb');
    expect(t.type).toBe('drill');
  });

  it('reads "in N days"', () => {
    const t = parseTask('read surgery in 3 days', WED);
    expect(t.due).toBe(mid(WED) + 3 * DAY);
    expect(t.type).toBe('read');
    expect(t.title).toBe('read surgery');
  });

  it('finds the next weekday', () => {
    const t = parseTask('mcqs friday', WED); // Wed -> Fri is +2
    expect(t.due).toBe(mid(WED) + 2 * DAY);
    expect(t.type).toBe('questions');
  });

  it('rolls a same-day weekday to next week', () => {
    const t = parseTask('revise wed', WED);
    expect(t.due).toBe(mid(WED) + 7 * DAY);
  });

  it('honours "next" before a weekday', () => {
    const t = parseTask('read anatomy next monday', WED); // Wed->Mon is +5, +7 = +12
    expect(t.due).toBe(mid(WED) + 12 * DAY);
  });

  it('detects urgent priority two ways', () => {
    expect(parseTask('finish notes !!', WED).priority).toBe(2);
    expect(parseTask('urgent revise', WED).priority).toBe(2);
    expect(parseTask('important read', WED).priority).toBe(1);
    expect(parseTask('single ! task', WED).priority).toBe(1);
  });

  it('parses dd/mm and rolls a past date forward a year', () => {
    const t = parseTask('exam 1/1', WED); // 1 Jan already passed on 7 Jan
    expect(new Date(t.due!).getFullYear()).toBe(2027);
  });

  it('keeps a bare task with no date or type', () => {
    const t = parseTask('call the registrar', WED);
    expect(t.due).toBeNull();
    expect(t.type).toBe('task');
    expect(t.title).toBe('call the registrar');
  });

  it('never returns an empty title', () => {
    expect(parseTask('tomorrow', WED).title.length).toBeGreaterThan(0);
  });
});

describe('dueLabel', () => {
  it('labels relative days', () => {
    expect(dueLabel(mid(WED), WED)).toBe('Today');
    expect(dueLabel(mid(WED) + DAY, WED)).toBe('Tomorrow');
    expect(dueLabel(mid(WED) - 2 * DAY, WED)).toBe('2d overdue');
    expect(dueLabel(null, WED)).toBe('');
  });
});
