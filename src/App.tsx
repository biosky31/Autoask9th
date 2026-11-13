import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck, Loader2 } from "lucide-react";
import { PRESET_EXAMS } from "./data/presetExams";
import type {
  CalibrationSettings,
  ExamModel,
  ScannedResult,
  StudentAssignment,
} from "./types/omr";
import {
  ActiveVaultSession,
  DEFAULT_CALIBRATION,
  saveVaultWithSession,
  VaultPayload,
} from "./utils/secureVault";
import { SheetGeneratorView } from "./components/SheetGeneratorView";
import { CameraScannerView } from "./components/CameraScannerView";
import { ExamsDashboardView } from "./components/ExamsDashboardView";
import { ResultsDashboardView } from "./components/ResultsDashboardView";
import { PasscodeLockScreen } from "./components/PasscodeLockScreen";
import { SecuritySettingsModal } from "./components/SecuritySettingsModal";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { OfflineIndicator } from "./components/OfflineIndicator";

type ActiveTab = "generator" | "scanner" | "exams" | "results";

const INACTIVITY_LOCK_MS = 15 * 60 * 1000; // 15 minutes

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("generator");

  // Auth & Vault Lock State (App never renders sensitive data while locked)
  const [authChecking, setAuthChecking] = useState(true);
  const [serverProtected, setServerProtected] = useState(false);
  const [serverAuthenticated, setServerAuthenticated] = useState(false);
  const [vaultSession, setVaultSession] = useState<ActiveVaultSession | null>(
    null
  );
  const [securityModalOpen, setSecurityModalOpen] = useState(false);

  // Decrypted sensitive state (only populated in memory while unlocked)
  const [exams, setExams] = useState<ExamModel[]>(PRESET_EXAMS);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    PRESET_EXAMS[0].id
  );
  const [committees, setCommittees] = useState<string[]>([]);
  const [roster, setRoster] = useState<StudentAssignment[]>([]);
  const [results, setResults] = useState<ScannedResult[]>([]);
  const [calibration, setCalibration] =
    useState<CalibrationSettings>(DEFAULT_CALIBRATION);

  const isUnlocked = Boolean(vaultSession);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: { serverProtected?: boolean; authenticated?: boolean } | null
        ) => {
          if (!active) return;
          if (data) {
            setServerProtected(Boolean(data.serverProtected));
            setServerAuthenticated(Boolean(data.authenticated));
          }
        }
      )
      .catch(() => {
        // Offline PWA fallback: local AES-256-GCM vault still protects access
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleUnlocked = useCallback(
    (session: ActiveVaultSession, payload: VaultPayload) => {
      const normalizedExams =
        payload.exams && payload.exams.length > 0 ? payload.exams : PRESET_EXAMS;
      setExams(normalizedExams);
      setSelectedExamId(normalizedExams[0]?.id ?? PRESET_EXAMS[0].id);
      setCommittees(Array.isArray(payload.committees) ? payload.committees : []);
      setRoster(Array.isArray(payload.roster) ? payload.roster : []);
      setResults(Array.isArray(payload.results) ? payload.results : []);
      setCalibration(payload.calibration ?? DEFAULT_CALIBRATION);
      setVaultSession(session);
      setServerAuthenticated(true);
    },
    []
  );

  const handleLockNow = useCallback(async () => {
    setSecurityModalOpen(false);
    setVaultSession(null);
    setServerAuthenticated(false);
    // Wipe sensitive lists from React state immediately
    setRoster([]);
    setCommittees([]);
    setResults([]);
    setExams(PRESET_EXAMS);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors if offline
    }
  }, []);

  // Persist encrypted vault whenever sensitive state updates while unlocked
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!vaultSession) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      saveVaultWithSession(vaultSession, {
        exams,
        committees,
        roster,
        results,
        calibration,
      }).catch(() => {
        // Ignore storage quota errors
      });
    }, 150);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [vaultSession, exams, committees, roster, results, calibration]);

  // Auto-lock after inactivity
  useEffect(() => {
    if (!isUnlocked) return;
    let timer = window.setTimeout(() => {
      handleLockNow();
    }, INACTIVITY_LOCK_MS);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        handleLockNow();
      }, INACTIVITY_LOCK_MS);
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [isUnlocked, handleLockNow]);

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

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-800" />
          <span>جارٍ التحقق من أمان الجلسة...</span>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <>
        <PasscodeLockScreen
          serverProtected={serverProtected}
          serverAuthenticated={serverAuthenticated}
          onUnlocked={handleUnlocked}
        />
        <OfflineIndicator />
      </>
    );
  }

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
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
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

          {/* Zone 3: Install, Lock & Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => setSecurityModalOpen(true)}
              title="إعدادات الرمز السري والأمان"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden sm:inline">الأمان</span>
            </button>
            <button
              type="button"
              onClick={handleLockNow}
              title="قفل التطبيق فوراً"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">قفل</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className="rounded-md bg-emerald-800 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0"
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
          <span>مدارس إشراق اليمن · نظام الأتمتة والتصحيح الإلكتروني الخاص</span>
          <span>إشراف الأستاذ إبراهيم</span>
        </div>
      </footer>

      <SecuritySettingsModal
        isOpen={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
        serverProtected={serverProtected}
        currentPayload={{
          exams,
          committees,
          roster,
          results,
          calibration,
        }}
        onVaultRotated={(nextSession) => setVaultSession(nextSession)}
        onLockNow={handleLockNow}
      />

      <OfflineIndicator />
    </div>
  );
}
