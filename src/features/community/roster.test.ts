import { describe, expect, it } from 'vitest';
import { parseRoster } from './roster';

describe('parseRoster', () => {
  it('accepts one email per line and optional year columns', () => {
    expect(parseRoster('A@students.kasralainy.edu.eg,Year 2\nb@students.kasralainy.edu.eg\tYear 3').rows).toEqual([
      { email: 'a@students.kasralainy.edu.eg', academicYear: 'Year 2' },
      { email: 'b@students.kasralainy.edu.eg', academicYear: 'Year 3' },
    ]);
  });
  it('reports invalid lines and removes duplicate emails', () => {
    const result = parseRoster('bad\na@x.test\nA@x.test');
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual(['Line 1: invalid email']);
  });
});

