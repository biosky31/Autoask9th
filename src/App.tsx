import { useEffect, useState } from "react";
import { DEFAULT_COMMITTEES, PRESET_EXAMS } from "./data/presetExams";
import type {
  CalibrationSettings,
  ExamModel,
  ScannedResult,
  StudentAssignment,
} from "./types/omr";
import { SheetGeneratorView } from "./components/SheetGeneratorView";
import { CameraScannerView } from "./components/CameraScannerView";
import { ExamsDashboardView } from "./components/ExamsDashboardView";
import { ResultsDashboardView } from "./components/ResultsDashboardView";

type ActiveTab = "generator" | "scanner" | "exams" | "results";

const STORAGE_EXAMS_KEY = "ishraq_omr_exams_v1";
const STORAGE_RESULTS_KEY = "ishraq_omr_results_v1";
const STORAGE_CALIBRATION_KEY = "ishraq_omr_calibration_v1";
const STORAGE_COMMITTEES_KEY = "ishraq_omr_committees_v1";
const STORAGE_ROSTER_KEY = "ishraq_omr_roster_v1";

const DEFAULT_ROSTER: StudentAssignment[] = [
  {
    id: "stu_seed_1",
    studentName: "محمد عبد الله الصبري",
    committeeName: DEFAULT_COMMITTEES[0],
    examId: PRESET_EXAMS[0].id,
  },
  {
    id: "stu_seed_2",
    studentName: "أحمد يحيى الشامي",
    committeeName: DEFAULT_COMMITTEES[0],
    examId: PRESET_EXAMS[1].id,
  },
  {
    id: "stu_seed_3",
    studentName: "عمر علي الحداد",
    committeeName: DEFAULT_COMMITTEES[1],
    examId: PRESET_EXAMS[0].id,
  },
  {
    id: "stu_seed_4",
    studentName: "سالم ناصر المقطري",
    committeeName: DEFAULT_COMMITTEES[1],
    examId: PRESET_EXAMS[1].id,
  },
];

const DEFAULT_CALIBRATION: CalibrationSettings = {
  fillThreshold: 0.24,
  multiMarkMargin: 0.1,
  contrastBoost: 1.15,
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("generator");

  const [exams, setExams] = useState<ExamModel[]>(() => {
    const loaded = loadJson<ExamModel[]>(STORAGE_EXAMS_KEY, PRESET_EXAMS);
    const presetMap = new Map(PRESET_EXAMS.map((p) => [p.id, p]));
    return loaded.map((ex) => ({
      ...ex,
      examGroup:
        ex.examGroup ||
        presetMap.get(ex.id)?.examGroup ||
        ex.title ||
        `اختبار ${ex.subject}`,
    }));
  });
  const [selectedExamId, setSelectedExamId] = useState<string>(
    () => exams[0]?.id ?? PRESET_EXAMS[0].id
  );
  const [committees, setCommittees] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_COMMITTEES_KEY, DEFAULT_COMMITTEES)
  );
  const [roster, setRoster] = useState<StudentAssignment[]>(() =>
    loadJson<StudentAssignment[]>(STORAGE_ROSTER_KEY, DEFAULT_ROSTER)
  );
  const [results, setResults] = useState<ScannedResult[]>(() =>
    loadJson<ScannedResult[]>(STORAGE_RESULTS_KEY, [])
  );
  const [calibration, setCalibration] = useState<CalibrationSettings>(() =>
    loadJson<CalibrationSettings>(STORAGE_CALIBRATION_KEY, DEFAULT_CALIBRATION)
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_EXAMS_KEY, JSON.stringify(exams));
    } catch {
      // Ignore storage quota errors
    }
  }, [exams]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RESULTS_KEY, JSON.stringify(results));
    } catch {
      // Ignore storage quota errors if many annotated images exist
    }
  }, [results]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CALIBRATION_KEY, JSON.stringify(calibration));
    } catch {
      // Ignore
    }
  }, [calibration]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COMMITTEES_KEY, JSON.stringify(committees));
    } catch {
      // Ignore
    }
  }, [committees]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ROSTER_KEY, JSON.stringify(roster));
    } catch {
      // Ignore
    }
  }, [roster]);

  const handleAddExam = (exam: ExamModel) => {
    setExams((prev) => [exam, ...prev]);
  };

  const handleUpdateExam = (updated: ExamModel) => {
    setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleDeleteExam = (id: string) => {
    setExams((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (selectedExamId === id && next[0]) {
        setSelectedExamId(next[0].id);
      }
      return next;
    });
  };

  const handleSaveResult = (res: ScannedResult) => {
    setResults((prev) => {
      const exists = prev.some((r) => r.id === res.id);
      if (exists) {
        return prev.map((r) => (r.id === res.id ? res : r));
      }
      return [res, ...prev];
    });
  };

  const handleDeleteResult = (id: string) => {
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateEssayScore = (id: string, essayScore: number) => {
    setResults((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              essayScore,
              totalScore: r.autoScore + essayScore,
            }
          : r
      )
    );
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: "generator", label: "ورقة التظليل" },
    { id: "scanner", label: "الماسح الضوئي" },
    { id: "exams", label: "الاختبارات والمعايرة" },
    { id: "results", label: "لوحة النتائج" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 print:block print:min-h-0 print:bg-white">
      {/* 3-Zone Top Bar Contract */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab("generator")}
            className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            مدارس إشراق اليمن
          </button>

          {/* Zone 2: 4 single-line nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-2 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    isActive
                      ? "border-emerald-800 text-emerald-900"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  {item.label}
                  {item.id === "results" && results.length > 0
                    ? ` (${results.length})`
                    : ""}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className="rounded-md bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0"
            >
              مسح ورقة الآن
            </button>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-emerald-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 space-y-5 print:max-w-none print:p-0 print:m-0 print:space-y-0">
        {/* Quiet Context Heading */}
        <div className="no-print flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {activeTab === "generator" && "مولد أوراق التظليل والباركود (OMR)"}
              {activeTab === "scanner" && "الماسح الضوئي بالكاميرا والتصحيح الآلي"}
              {activeTab === "exams" && "إدارة الاختبارات ومفاتيح الإجابة والمعايرة"}
              {activeTab === "results" && "لوحة النتائج وتحليل أداء اللجان"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              الأستاذ إبراهيم · مدارس إشراق اليمن · التعرف الفوري بالباركود واسم اللجنة
            </p>
          </div>
        </div>

        {activeTab === "generator" && (
          <SheetGeneratorView
            exams={exams}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
            onAddExam={handleAddExam}
            committees={committees}
            onChangeCommittees={setCommittees}
            roster={roster}
            onChangeRoster={setRoster}
          />
        )}

        {activeTab === "scanner" && (
          <CameraScannerView
            exams={exams}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
            calibration={calibration}
            onSaveResult={handleSaveResult}
          />
        )}

        {activeTab === "exams" && (
          <ExamsDashboardView
            exams={exams}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
            onAddExam={handleAddExam}
            onUpdateExam={handleUpdateExam}
            onDeleteExam={handleDeleteExam}
            calibration={calibration}
            onChangeCalibration={setCalibration}
          />
        )}

        {activeTab === "results" && (
          <ResultsDashboardView
            results={results}
            onDeleteResult={handleDeleteResult}
            onUpdateEssayScore={handleUpdateEssayScore}
            onClearAll={() => setResults([])}
            onGoToScanner={() => setActiveTab("scanner")}
          />
        )}
      </main>

      <footer className="no-print border-t border-slate-200 bg-white py-4 mt-8">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>مدارس إشراق اليمن · نظام الأتمتة والتصحيح الإلكتروني</span>
          <span>إشراف الأستاذ إبراهيم</span>
        </div>
      </footer>
    </div>
  );
}
