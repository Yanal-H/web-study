import { describe, expect, it } from 'vitest';
import {
  bmi,
  map,
  cockcroftGault,
  correctedCalcium,
  anionGap,
  correctedSodium,
  bsaMosteller,
} from './formulas';

// Known-input checks — these guard the medical integrity of the calculators.
describe('clinical formulas', () => {
  it('BMI', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2);
    expect(bmi(100, 200)).toBeCloseTo(25, 5);
  });

  it('Mean arterial pressure', () => {
    expect(map(120, 80)).toBeCloseTo(93.33, 2);
    expect(map(90, 60)).toBeCloseTo(70, 5);
  });

  it('Cockcroft–Gault, with the 0.85 female factor', () => {
    // 40y, 72kg, SCr 1.0 mg/dL, male → (140-40)*72 / (72*1) = 100
    expect(cockcroftGault(40, 72, 1.0, false)).toBeCloseTo(100, 5);
    expect(cockcroftGault(40, 72, 1.0, true)).toBeCloseTo(85, 5);
  });

  it('Corrected calcium', () => {
    // low albumin raises corrected calcium
    expect(correctedCalcium(8.0, 2.0)).toBeCloseTo(9.6, 5);
    expect(correctedCalcium(9.0, 4.0)).toBeCloseTo(9.0, 5);
  });

  it('Anion gap', () => {
    expect(anionGap(140, 104, 24)).toBe(12);
    expect(anionGap(140, 100, 10)).toBe(30);
  });

  it('Corrected sodium (Katz 1.6 per 100 mg/dL glucose)', () => {
    // Na 130, glucose 400 → 130 + 1.6*3 = 134.8
    expect(correctedSodium(130, 400)).toBeCloseTo(134.8, 5);
    expect(correctedSodium(140, 100)).toBeCloseTo(140, 5);
  });

  it('Body surface area (Mosteller)', () => {
    expect(bsaMosteller(175, 70)).toBeCloseTo(1.8447, 3);
    expect(bsaMosteller(100, 3600 / 100)).toBeCloseTo(1, 5);
  });
});
