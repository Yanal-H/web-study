// Pure clinical formulas — independently derived, each cited in the UI. Kept
// separate from the view so they can be unit-tested against known inputs.

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2;

export const map = (sbp: number, dbp: number) => dbp + (sbp - dbp) / 3;

export const cockcroftGault = (age: number, weightKg: number, scrMgDl: number, female: boolean) => {
  const base = ((140 - age) * weightKg) / (72 * scrMgDl);
  return female ? base * 0.85 : base;
};

export const correctedCalcium = (caMgDl: number, albuminGdl: number) =>
  caMgDl + 0.8 * (4.0 - albuminGdl);

export const anionGap = (na: number, cl: number, hco3: number) => na - (cl + hco3);

export const correctedSodium = (na: number, glucoseMgDl: number) =>
  na + 1.6 * ((glucoseMgDl - 100) / 100);

export const bsaMosteller = (heightCm: number, weightKg: number) =>
  Math.sqrt((heightCm * weightKg) / 3600);

/** Parkland formula: total crystalloid over 24 h for a burn, half in the first 8 h. */
export const parkland = (weightKg: number, tbsaPct: number) => {
  const total = 4 * weightKg * tbsaPct; // mL over 24 h
  return { total, first8h: total / 2, rate8h: total / 2 / 8 };
};

/** Holliday–Segar 4-2-1 maintenance fluid rate (mL/h) by weight. */
export const maintenanceFluid = (weightKg: number) => {
  let rate = 0;
  rate += Math.min(weightKg, 10) * 4;
  if (weightKg > 10) rate += Math.min(weightKg - 10, 10) * 2;
  if (weightKg > 20) rate += (weightKg - 20) * 1;
  return rate; // mL/h
};

/** QT corrected for heart rate — Bazett. QT in ms, HR in bpm. */
export const qtcBazett = (qtMs: number, hrBpm: number) => {
  const rr = 60 / hrBpm; // seconds
  return qtMs / Math.sqrt(rr);
};

/** Ideal body weight — Devine formula (kg). height in cm. */
export const idealBodyWeight = (heightCm: number, female: boolean) => {
  const inchesOver5ft = Math.max(0, heightCm / 2.54 - 60);
  return (female ? 45.5 : 50) + 2.3 * inchesOver5ft;
};

/**
 * eGFR by the 2021 CKD-EPI creatinine equation (race-free), mL/min/1.73m².
 * Serum creatinine in mg/dL.
 */
export const egfrCkdEpi = (age: number, scrMgDl: number, female: boolean) => {
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const ratio = scrMgDl / kappa;
  const min = Math.min(ratio, 1) ** alpha;
  const max = Math.max(ratio, 1) ** -1.2;
  return 142 * min * max * 0.9938 ** age * (female ? 1.012 : 1);
};
