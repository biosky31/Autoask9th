export interface QuestionItem {
  num: number;
  answer: number; // T/F: 1 = صح (ص), 2 = خطأ (خ); MCQ: 1..4
  text?: string;
}

export interface ExamModel {
  id: string;
  examGroup?: string; // اسم الاختبار الموحد الذي يضم عدة نماذج (مثل: اختبار اللغة العربية الشهري)
  modelCode: string; // e.g., "P.83" or "نموذج أ"
  title: string;
  subject: string;
  grade: string;
  teacher: string;
  school: string;
  tfCount: number; // default 16
  mcqCount: number; // default 30
  tfPoints: number; // default 1
  mcqPoints: number; // default 2
  essayPoints: number; // default 4 (optional)
  tfQuestions: QuestionItem[];
  mcqQuestions: QuestionItem[];
  createdAt: string;
  source: "pdf-preset" | "ai-extracted" | "manual";
}

export interface StudentAssignment {
  id: string;
  studentName: string;
  committeeName: string;
  examId: string;
}

export interface SheetMetadata {
  studentName: string;
  modelCode: string;
  committeeName: string;
  examId: string;
  subject: string;
  grade: string;
  schoolName: string;
  teacherName: string;
}

export interface CalibrationSettings {
  fillThreshold: number; // 0.15 - 0.55 (default 0.28 darkness delta over paper)
  multiMarkMargin: number; // 0.05 - 0.25 (how close a 2nd dark bubble triggers double-mark)
  contrastBoost: number; // 1.0 - 2.0
}

export type BubbleStatus = "correct" | "wrong" | "blank" | "multiple";

export interface GradedQuestionResult {
  num: number;
  type: "tf" | "mcq";
  marked: number | null; // null if blank, -1 if multiple
  markedOptions: number[];
  correctAnswer: number;
  status: BubbleStatus;
  earnedPoints: number;
  maxPoints: number;
  confidences: number[]; // darkness ratio for each option
}

export interface ScannedResult {
  id: string;
  timestamp: string;
  studentName: string;
  committeeName: string;
  modelCode: string;
  examId: string;
  examTitle: string;
  subject: string;
  autoScore: number;
  autoMaxScore: number;
  essayScore: number;
  essayMaxScore: number;
  totalScore: number;
  totalMaxScore: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  multipleCount: number;
  questions: GradedQuestionResult[];
  annotatedImageUrl?: string;
  detectionMethod: "camera-cv" | "upload-cv" | "simulated-cv" | "ai-assisted";
}
