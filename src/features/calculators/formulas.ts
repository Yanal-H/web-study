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
