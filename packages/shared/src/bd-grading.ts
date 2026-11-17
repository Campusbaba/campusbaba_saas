/**
 * Bangladesh NCTB / Madrasa / Board 5.00 GPA Grading Engine
 * Standard Bangladesh Education Board Scale:
 *   80 - 100% : A+ (5.00)
 *   70 -  79% : A  (4.00)
 *   60 -  69% : A- (3.50)
 *   50 -  59% : B  (3.00)
 *   40 -  49% : C  (2.00)
 *   33 -  39% : D  (1.00)
 *    0 -  32% : F  (0.00)
 *
 * Rules:
 * 1. If a student scores 'F' (0.00) in any mandatory subject, total GPA is 0.00 ('F').
 * 2. Optional 4th Subject rule: Grade points above 2.00 in the 4th subject
 *    (i.e. max(0, fourthSubjectGP - 2.00)) are added to total mandatory grade points
 *    before dividing by the number of mandatory subjects, capped at 5.00.
 *    Failing the 4th subject does NOT fail the student.
 */

export interface GradeBand {
  minPct: number;
  maxPct: number;
  letter: "A+" | "A" | "A-" | "B" | "C" | "D" | "F";
  gp: number;
}

export const BD_BOARD_GRADE_BANDS: GradeBand[] = [
  { minPct: 80, maxPct: 100, letter: "A+", gp: 5.0 },
  { minPct: 70, maxPct: 79.9999, letter: "A", gp: 4.0 },
  { minPct: 60, maxPct: 69.9999, letter: "A-", gp: 3.5 },
  { minPct: 50, maxPct: 59.9999, letter: "B", gp: 3.0 },
  { minPct: 40, maxPct: 49.9999, letter: "C", gp: 2.0 },
  { minPct: 33, maxPct: 39.9999, letter: "D", gp: 1.0 },
  { minPct: 0, maxPct: 32.9999, letter: "F", gp: 0.0 },
];

export interface SubjectScoreInput {
  subjectCode: string;
  subjectName: string;
  marksObtained: number;
  totalMarks: number;
  isFourthSubject?: boolean;
}

export interface EvaluatedSubjectResult extends SubjectScoreInput {
  percentage: number;
  letterGrade: string;
  gradePoint: number;
  passed: boolean;
}

export interface StudentTermMarksheet {
  subjects: EvaluatedSubjectResult[];
  mandatorySubjectCount: number;
  failedMandatoryCount: number;
  gpaWithoutFourth: number;
  fourthSubjectBonus: number;
  finalGpa: number;
  finalLetterGrade: string;
  passed: boolean;
}

export function evaluateSingleSubjectBd(
  marksObtained: number,
  totalMarks: number,
  bands: GradeBand[] = BD_BOARD_GRADE_BANDS
): { percentage: number; letterGrade: string; gradePoint: number; passed: boolean } {
  if (totalMarks <= 0) {
    return { percentage: 0, letterGrade: "F", gradePoint: 0, passed: false };
  }
  const clamped = Math.max(0, Math.min(totalMarks, marksObtained));
  const percentage = Number(((clamped / totalMarks) * 100).toFixed(2));

  for (const band of bands) {
    if (percentage >= band.minPct && percentage <= band.maxPct) {
      return {
        percentage,
        letterGrade: band.letter,
        gradePoint: band.gp,
        passed: band.gp > 0,
      };
    }
  }
  return { percentage, letterGrade: "F", gradePoint: 0, passed: false };
}

export function gpToLetterGradeBd(gp: number): string {
  if (gp >= 5.0) return "A+";
  if (gp >= 4.0) return "A";
  if (gp >= 3.5) return "A-";
  if (gp >= 3.0) return "B";
  if (gp >= 2.0) return "C";
  if (gp >= 1.0) return "D";
  return "F";
}

export function calculateBangladeshTermGpa(
  inputs: SubjectScoreInput[],
  options: { enableFourthSubjectBonus?: boolean; fourthSubjectDeduction?: number } = {}
): StudentTermMarksheet {
  const { enableFourthSubjectBonus = true, fourthSubjectDeduction = 2.0 } = options;

  const evaluated: EvaluatedSubjectResult[] = inputs.map((sub) => {
    const res = evaluateSingleSubjectBd(sub.marksObtained, sub.totalMarks);
    return {
      ...sub,
      ...res,
    };
  });

  const mandatory = evaluated.filter((s) => !s.isFourthSubject);
  const fourth = evaluated.find((s) => s.isFourthSubject);

  const mandatoryCount = mandatory.length;
  if (mandatoryCount === 0) {
    return {
      subjects: evaluated,
      mandatorySubjectCount: 0,
      failedMandatoryCount: 0,
      gpaWithoutFourth: 0,
      fourthSubjectBonus: 0,
      finalGpa: 0,
      finalLetterGrade: "F",
      passed: false,
    };
  }

  const failedMandatoryCount = mandatory.filter((s) => !s.passed).length;
  const mandatoryGpSum = mandatory.reduce((sum, s) => sum + s.gradePoint, 0);
  const rawGpaWithoutFourth = Number((mandatoryGpSum / mandatoryCount).toFixed(2));

  const fourthBonus =
    enableFourthSubjectBonus && fourth && fourth.gradePoint > fourthSubjectDeduction
      ? Number((fourth.gradePoint - fourthSubjectDeduction).toFixed(2))
      : 0;

  if (failedMandatoryCount > 0) {
    return {
      subjects: evaluated,
      mandatorySubjectCount: mandatoryCount,
      failedMandatoryCount,
      gpaWithoutFourth: 0,
      fourthSubjectBonus: fourthBonus,
      finalGpa: 0,
      finalLetterGrade: "F",
      passed: false,
    };
  }

  const finalGpa = Math.min(
    5.0,
    Number(((mandatoryGpSum + fourthBonus) / mandatoryCount).toFixed(2))
  );

  return {
    subjects: evaluated,
    mandatorySubjectCount: mandatoryCount,
    failedMandatoryCount: 0,
    gpaWithoutFourth: Math.min(5.0, rawGpaWithoutFourth),
    fourthSubjectBonus: fourthBonus,
    finalGpa,
    finalLetterGrade: gpToLetterGradeBd(finalGpa),
    passed: true,
  };
}
