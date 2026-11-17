/**
 * Pure Domain: Bangladesh NCTB / Madrasa / Board 5.00 GPA Grading & Merit Ranking Engine
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
  studentId?: string;
  subjects: EvaluatedSubjectResult[];
  mandatorySubjectCount: number;
  failedMandatoryCount: number;
  totalMarksObtained: number;
  gpaWithoutFourth: number;
  fourthSubjectBonus: number;
  finalGpa: number;
  finalLetterGrade: string;
  passed: boolean;
  meritPosition?: number;
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
  options: {
    studentId?: string;
    enableFourthSubjectBonus?: boolean;
    fourthSubjectDeduction?: number;
  } = {}
): StudentTermMarksheet {
  const {
    studentId,
    enableFourthSubjectBonus = true,
    fourthSubjectDeduction = 2.0,
  } = options;

  const evaluated: EvaluatedSubjectResult[] = inputs.map((sub) => {
    const res = evaluateSingleSubjectBd(sub.marksObtained, sub.totalMarks);
    return {
      ...sub,
      ...res,
    };
  });

  const totalMarksObtained = evaluated.reduce((s, e) => s + e.marksObtained, 0);
  const mandatory = evaluated.filter((s) => !s.isFourthSubject);
  const fourth = evaluated.find((s) => s.isFourthSubject);

  const mandatoryCount = mandatory.length;
  if (mandatoryCount === 0) {
    return {
      studentId,
      subjects: evaluated,
      mandatorySubjectCount: 0,
      failedMandatoryCount: 0,
      totalMarksObtained,
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
      studentId,
      subjects: evaluated,
      mandatorySubjectCount: mandatoryCount,
      failedMandatoryCount,
      totalMarksObtained,
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
    studentId,
    subjects: evaluated,
    mandatorySubjectCount: mandatoryCount,
    failedMandatoryCount: 0,
    totalMarksObtained,
    gpaWithoutFourth: Math.min(5.0, rawGpaWithoutFourth),
    fourthSubjectBonus: fourthBonus,
    finalGpa,
    finalLetterGrade: gpToLetterGradeBd(finalGpa),
    passed: true,
  };
}

/**
 * Ranks a list of student term marksheets according to Bangladesh board/school merit rules:
 * 1. Passed students always rank ahead of failed students.
 * 2. Higher finalGpa ranks first.
 * 3. Tie-breaker 1: Higher gpaWithoutFourth.
 * 4. Tie-breaker 2: Higher totalMarksObtained.
 */
export function computeMeritPositions(
  marksheets: StudentTermMarksheet[]
): StudentTermMarksheet[] {
  const sorted = [...marksheets].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
    if (b.finalGpa !== a.finalGpa) return b.finalGpa - a.finalGpa;
    if (b.gpaWithoutFourth !== a.gpaWithoutFourth) {
      return b.gpaWithoutFourth - a.gpaWithoutFourth;
    }
    return b.totalMarksObtained - a.totalMarksObtained;
  });

  return sorted.map((sheet, idx) => ({
    ...sheet,
    meritPosition: idx + 1,
  }));
}

/**
 * Auto-grades a Coaching / Online MCQ Exam with optional negative marking
 */
export function evaluateMcqSubmission(params: {
  questions: { id: string; correctOptionIndex: number; marks: number }[];
  answers: Record<string, number | null | undefined>;
  negativeMarkPerWrong?: number;
}): {
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  rawPositiveMarks: number;
  negativeMarksDeducted: number;
  netMarks: number;
} {
  const neg = params.negativeMarkPerWrong ?? 0;
  let attempted = 0;
  let correct = 0;
  let wrong = 0;
  let rawPositiveMarks = 0;

  for (const q of params.questions) {
    const ans = params.answers[q.id];
    if (ans === null || ans === undefined) continue;
    attempted++;
    if (ans === q.correctOptionIndex) {
      correct++;
      rawPositiveMarks += q.marks;
    } else {
      wrong++;
    }
  }

  const negativeMarksDeducted = Number((wrong * neg).toFixed(2));
  const netMarks = Math.max(
    0,
    Number((rawPositiveMarks - negativeMarksDeducted).toFixed(2))
  );

  return {
    totalQuestions: params.questions.length,
    attempted,
    correct,
    wrong,
    rawPositiveMarks: Number(rawPositiveMarks.toFixed(2)),
    negativeMarksDeducted,
    netMarks,
  };
}
