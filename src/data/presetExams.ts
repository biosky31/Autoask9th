import type { ExamModel } from "../types/omr";

function makeQuestions(tfArr: number[], mcqArr: number[]) {
  return {
    tfQuestions: tfArr.map((answer, idx) => ({ num: idx + 1, answer })),
    mcqQuestions: mcqArr.map((answer, idx) => ({ num: tfArr.length + idx + 1, answer })),
  };
}

export const DEFAULT_COMMITTEES = [
  "لجنة (أ) - قاعة الخنساء",
  "لجنة (ب) - قاعة معاذ بن جبل",
  "لجنة (ج) - قاعة السلام",
  "لجنة (د) - قاعة النور",
];

/**
 * 5 نماذج حقيقية مستخرجة ومطابقة حرفياً لنماذج التصحيح الإلكتروني في الملف المرفق
 * (اختبار الشهادة الأساسية - الصف التاسع - اللغة العربية - 1446هـ / 2024-2025م)
 */
export const PRESET_EXAMS: ExamModel[] = [
  (() => {
    const { tfQuestions, mcqQuestions } = makeQuestions(
      [1, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1],
      [1, 1, 2, 4, 3, 1, 1, 4, 3, 2, 3, 3, 4, 4, 2, 1, 2, 3, 4, 1, 2, 2, 4, 3, 2, 2, 3, 4, 2, 4]
    );
    return {
      id: "exam_p83",
      examGroup: "اختبار الشهادة الأساسية - اللغة العربية",
      modelCode: "P.83",
      title: "اختبار الشهادة الأساسية - اللغة العربية (نموذج P.83)",
      subject: "اللغة العربية",
      grade: "الصف التاسع الأساسي",
      teacher: "الأستاذ إبراهيم",
      school: "مدارس إشراق اليمن",
      tfCount: 16,
      mcqCount: 30,
      tfPoints: 1,
      mcqPoints: 2,
      essayPoints: 4,
      tfQuestions,
      mcqQuestions,
      createdAt: "2025-05-01T08:00:00.000Z",
      source: "pdf-preset",
    };
  })(),
  (() => {
    const { tfQuestions, mcqQuestions } = makeQuestions(
      [1, 2, 2, 1, 2, 1, 1, 2, 1, 1, 1, 2, 2, 1, 2, 1],
      [2, 3, 4, 2, 2, 3, 2, 2, 1, 2, 3, 3, 4, 4, 2, 1, 4, 3, 4, 1, 1, 2, 4, 3, 2, 2, 3, 3, 3, 2]
    );
    return {
      id: "exam_p9",
      examGroup: "اختبار الشهادة الأساسية - اللغة العربية",
      modelCode: "P.9",
      title: "اختبار الشهادة الأساسية - اللغة العربية (نموذج P.9)",
      subject: "اللغة العربية",
      grade: "الصف التاسع الأساسي",
      teacher: "الأستاذ إبراهيم",
      school: "مدارس إشراق اليمن",
      tfCount: 16,
      mcqCount: 30,
      tfPoints: 1,
      mcqPoints: 2,
      essayPoints: 4,
      tfQuestions,
      mcqQuestions,
      createdAt: "2025-05-01T08:05:00.000Z",
      source: "pdf-preset",
    };
  })(),
  (() => {
    const { tfQuestions, mcqQuestions } = makeQuestions(
      [1, 1, 2, 1, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1],
      [3, 3, 1, 3, 3, 1, 2, 1, 4, 3, 3, 2, 3, 2, 1, 4, 4, 3, 4, 3, 3, 1, 4, 1, 3, 3, 3, 4, 3, 3]
    );
    return {
      id: "exam_p22",
      examGroup: "اختبار الشهادة الأساسية - اللغة العربية",
      modelCode: "P.22",
      title: "اختبار الشهادة الأساسية - اللغة العربية (نموذج P.22)",
      subject: "اللغة العربية",
      grade: "الصف التاسع الأساسي",
      teacher: "الأستاذ إبراهيم",
      school: "مدارس إشراق اليمن",
      tfCount: 16,
      mcqCount: 30,
      tfPoints: 1,
      mcqPoints: 2,
      essayPoints: 4,
      tfQuestions,
      mcqQuestions,
      createdAt: "2025-05-01T08:10:00.000Z",
      source: "pdf-preset",
    };
  })(),
  (() => {
    const { tfQuestions, mcqQuestions } = makeQuestions(
      [1, 2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1],
      [2, 3, 3, 1, 3, 1, 3, 3, 3, 4, 3, 1, 3, 4, 2, 4, 3, 1, 2, 1, 2, 2, 4, 3, 3, 3, 3, 1, 1, 1]
    );
    return {
      id: "exam_p5",
      examGroup: "اختبار الشهادة الأساسية - اللغة العربية",
      modelCode: "P.5",
      title: "اختبار الشهادة الأساسية - اللغة العربية (نموذج P.5)",
      subject: "اللغة العربية",
      grade: "الصف التاسع الأساسي",
      teacher: "الأستاذ إبراهيم",
      school: "مدارس إشراق اليمن",
      tfCount: 16,
      mcqCount: 30,
      tfPoints: 1,
      mcqPoints: 2,
      essayPoints: 4,
      tfQuestions,
      mcqQuestions,
      createdAt: "2025-05-01T08:15:00.000Z",
      source: "pdf-preset",
    };
  })(),
  (() => {
    const { tfQuestions, mcqQuestions } = makeQuestions(
      [1, 2, 2, 1, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1],
      [1, 3, 2, 2, 3, 3, 1, 3, 2, 3, 3, 1, 4, 4, 2, 4, 4, 3, 4, 2, 2, 1, 4, 3, 4, 3, 3, 4, 2, 1]
    );
    return {
      id: "exam_p40",
      examGroup: "اختبار الشهادة الأساسية - اللغة العربية",
      modelCode: "P.40",
      title: "اختبار الشهادة الأساسية - اللغة العربية (نموذج P.40)",
      subject: "اللغة العربية",
      grade: "الصف التاسع الأساسي",
      teacher: "الأستاذ إبراهيم",
      school: "مدارس إشراق اليمن",
      tfCount: 16,
      mcqCount: 30,
      tfPoints: 1,
      mcqPoints: 2,
      essayPoints: 4,
      tfQuestions,
      mcqQuestions,
      createdAt: "2025-05-01T08:20:00.000Z",
      source: "pdf-preset",
    };
  })(),
];
