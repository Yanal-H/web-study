import { describe, expect, it } from 'vitest';
import {
  bmi,
  map,
  cockcroftGault,
  correctedCalcium,
  anionGap,
  correctedSodium,
  bsaMosteller,
  parkland,
  maintenanceFluid,
  qtcBazett,
  idealBodyWeight,
  egfrCkdEpi,
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

describe('added surgical & medical calculators', () => {
  it('Parkland burns — 4 mL x kg x %TBSA, half in 8 h', () => {
    const r = parkland(70, 30); // 4*70*30 = 8400
    expect(r.total).toBe(8400);
    expect(r.first8h).toBe(4200);
    expect(r.rate8h).toBeCloseTo(525, 5);
  });

  it('Maintenance fluid 4-2-1', () => {
    expect(maintenanceFluid(10)).toBe(40);
    expect(maintenanceFluid(20)).toBe(60);
    expect(maintenanceFluid(70)).toBe(110); // 40 + 20 + 50
  });

  it('QTc Bazett', () => {
    // QT 400 ms at HR 60 (RR 1s) -> 400
    expect(qtcBazett(400, 60)).toBeCloseTo(400, 5);
    // faster HR lengthens QTc
    expect(qtcBazett(400, 100)).toBeGreaterThan(400);
  });

  it('Ideal body weight (Devine)', () => {
    // 175 cm male: 68.9 in -> 8.9 over 60 -> 50 + 2.3*8.9
    expect(idealBodyWeight(175, false)).toBeCloseTo(50 + 2.3 * (175 / 2.54 - 60), 4);
    expect(idealBodyWeight(152.4, true)).toBeCloseTo(45.5, 4); // exactly 5 ft
  });

  it('eGFR CKD-EPI 2021 is in a sane range, sex-adjusted, and falls with age', () => {
    const male = egfrCkdEpi(50, 1.0, false);
    const female = egfrCkdEpi(50, 1.0, true);
    expect(male).toBeGreaterThan(60);
    expect(male).toBeLessThan(140);
    // at SCr 1.0 the female is above her kappa threshold, so eGFR sits lower
    expect(female).not.toBeCloseTo(male, 1);
    // a rise in creatinine or age must lower the estimate
    expect(egfrCkdEpi(80, 1.0, false)).toBeLessThan(male);
    expect(egfrCkdEpi(50, 2.0, false)).toBeLessThan(male);
  });
});
