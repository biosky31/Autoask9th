import React, { useMemo, useRef, useState } from "react";
import {
  FileUp,
  Plus,
  Trash2,
  Check,
  Sliders,
  BookOpen,
  Loader2,
  AlertCircle,
  CopyPlus,
  Shuffle,
} from "lucide-react";
import type { CalibrationSettings, ExamModel } from "../types/omr";

interface ExamsDashboardViewProps {
  exams: ExamModel[];
  selectedExamId: string;
  onSelectExamId: (id: string) => void;
  onAddExam: (exam: ExamModel) => void;
  onUpdateExam: (exam: ExamModel) => void;
  onDeleteExam: (id: string) => void;
  calibration: CalibrationSettings;
  onChangeCalibration: (next: CalibrationSettings) => void;
}

export const ExamsDashboardView: React.FC<ExamsDashboardViewProps> = ({
  exams,
  selectedExamId,
  onSelectExamId,
  onAddExam,
  onUpdateExam,
  onDeleteExam,
  calibration,
  onChangeCalibration,
}) => {
  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0],
    [exams, selectedExamId]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);

  const handleUploadExamFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);
    setParseSuccess(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/parse-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: file.type || "application/pdf",
          fileName: file.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "تعذر تحليل ملف الاختبار");
      }

      const ex = data.exam;
      const tfList = Array.isArray(ex.tfQuestions) ? ex.tfQuestions : [];
      const mcqList = Array.isArray(ex.mcqQuestions) ? ex.mcqQuestions : [];

      const tfCount = Math.min(16, tfList.length || 16);
      const mcqCount = Math.min(30, mcqList.length || 30);

      const normalizedTf = Array.from({ length: tfCount }, (_, idx) => ({
        num: idx + 1,
        answer: tfList[idx]?.answer === 2 ? 2 : 1,
        text: tfList[idx]?.text || "",
      }));

      const normalizedMcq = Array.from({ length: mcqCount }, (_, idx) => {
        const ans = Number(mcqList[idx]?.answer);
        return {
          num: tfCount + idx + 1,
          answer: ans >= 1 && ans <= 4 ? ans : 1,
          text: mcqList[idx]?.text || "",
        };
      });

      const groupName =
        ex.examGroup || ex.title || `اختبار ${ex.subject || "اللغة العربية"}`;
      const newExam: ExamModel = {
        id: `exam_${Date.now()}`,
        examGroup: groupName,
        modelCode: ex.modelCode || `M.${exams.length + 1}`,
        title: ex.title || `اختبار مستخرج (${file.name})`,
        subject: ex.subject || "اللغة العربية",
        grade: ex.grade || "الصف التاسع الأساسي",
        teacher: "الأستاذ إبراهيم",
        school: "مدارس إشراق اليمن",
        tfCount,
        mcqCount,
        tfPoints: Number(ex.tfPoints) || 1,
        mcqPoints: Number(ex.mcqPoints) || 2,
        essayPoints:
          typeof ex.essayPoints === "number" ? ex.essayPoints : 4,
        tfQuestions: normalizedTf,
        mcqQuestions: normalizedMcq,
        createdAt: new Date().toISOString(),
        source: "ai-extracted",
      };

      onAddExam(newExam);
      onSelectExamId(newExam.id);
      setParseSuccess(
        `تم تحليل ملف الاختبار واستخراج نموذج ${newExam.modelCode} (${tfCount} ص/خ + ${mcqCount} اختيار) بنجاح.`
      );
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "حدث خطأ أثناء تحليل الملف."
      );
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const handleCreateManualExam = () => {
    const code = `E.${exams.length + 1}`;
    const tfQuestions = Array.from({ length: 16 }, (_, idx) => ({
      num: idx + 1,
      answer: 1,
    }));
    const mcqQuestions = Array.from({ length: 30 }, (_, idx) => ({
      num: 17 + idx,
      answer: 1,
    }));
    const newExam: ExamModel = {
      id: `exam_${Date.now()}`,
      examGroup: `اختبار مخصص جديد (${code})`,
      modelCode: code,
      title: `اختبار مخصص جديد (${code})`,
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
      createdAt: new Date().toISOString(),
      source: "manual",
    };
    onAddExam(newExam);
    onSelectExamId(newExam.id);
  };

  const handleAddVariantForSameExam = () => {
    if (!activeExam) return;
    const groupName =
      activeExam.examGroup || activeExam.title || `اختبار ${activeExam.subject}`;
    const siblings = exams.filter(
      (e) => (e.examGroup || e.title) === groupName
    );
    const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
    const nextCode =
      siblings.length < letters.length
        ? `نموذج ${letters[siblings.length]}`
        : `${activeExam.modelCode}.${siblings.length + 1}`;
    const variantExam: ExamModel = {
      ...activeExam,
      id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      examGroup: groupName,
      modelCode: nextCode,
      title: `${groupName} (${nextCode})`,
      tfQuestions: activeExam.tfQuestions.map((q) => ({ ...q })),
      mcqQuestions: activeExam.mcqQuestions.map((q) => ({ ...q })),
      createdAt: new Date().toISOString(),
      source: "manual",
    };
    if (!activeExam.examGroup) {
      onUpdateExam({ ...activeExam, examGroup: groupName });
    }
    onAddExam(variantExam);
    onSelectExamId(variantExam.id);
  };

  const handleShuffleActiveKey = () => {
    if (!activeExam) return;
    onUpdateExam({
      ...activeExam,
      tfQuestions: activeExam.tfQuestions.map((q) => ({
        ...q,
        answer: Math.random() < 0.5 ? 1 : 2,
      })),
      mcqQuestions: activeExam.mcqQuestions.map((q) => ({
        ...q,
        answer: Math.floor(Math.random() * 4) + 1,
      })),
    });
  };

  const updateTfAnswer = (qNum: number, ans: number) => {
    if (!activeExam) return;
    onUpdateExam({
      ...activeExam,
      tfQuestions: activeExam.tfQuestions.map((q) =>
        q.num === qNum ? { ...q, answer: ans } : q
      ),
    });
  };

  const updateMcqAnswer = (qNum: number, ans: number) => {
    if (!activeExam) return;
    onUpdateExam({
      ...activeExam,
      mcqQuestions: activeExam.mcqQuestions.map((q) =>
        q.num === qNum ? { ...q, answer: ans } : q
      ),
    });
  };

  if (!activeExam) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Sidebar: Exam Models List + Attach Exam File + Calibration */}
      <div className="lg:col-span-4 space-y-5">
        {/* Upload / Attach Exam Box */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3.5">
          <h2 className="text-base font-bold text-slate-900">
            إرفاق اختبار وضبط آلية التصحيح
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            ارفع ملف الاختبار (PDF أو صورة) ليقوم النظام باستخراج رقم النموذج ومفتاح الإجابات تلقائياً، أو أنشئ نموذجاً جديداً يدوياً.
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={parsing}
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors disabled:opacity-60"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جارٍ تحليل الاختبار واستخراج الإجابات...
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4" />
                  إرفاق ملف اختبار (PDF / صورة)
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              onChange={handleUploadExamFile}
              className="hidden"
            />

            <button
              type="button"
              onClick={handleCreateManualExam}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إنشاء نموذج جديد يدوياً
            </button>

            <button
              type="button"
              onClick={handleAddVariantForSameExam}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-emerald-700 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
            >
              <CopyPlus className="w-4 h-4" />
              إضافة نموذج رديف لنفس الاختبار
            </button>
          </div>

          {parseError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}
          {parseSuccess && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2.5 flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseSuccess}</span>
            </div>
          )}
        </div>

        {/* Saved Exam Models */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              النماذج المسجلة ({exams.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {exams.map((ex) => {
              const isSelected = ex.id === activeExam.id;
              return (
                <div
                  key={ex.id}
                  onClick={() => onSelectExamId(ex.id)}
                  className={`py-2.5 px-3 rounded-md cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? "bg-emerald-50 text-emerald-950"
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <span className="font-mono-num">{ex.modelCode}</span>
                      <span className="text-slate-400">·</span>
                      <span className="truncate">{ex.subject}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 truncate mt-0.5">
                      {ex.examGroup || ex.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ex.tfCount} ص/خ · {ex.mcqCount} اختيار ·{" "}
                      {ex.source === "pdf-preset"
                        ? "من الملف المرفق"
                        : ex.source === "ai-extracted"
                        ? "مستخرج آلياً"
                        : "يدوي"}
                    </div>
                  </div>
                  {exams.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteExam(ex.id);
                      }}
                      title="حذف النموذج"
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calibration Settings */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sliders className="w-4 h-4 text-emerald-700" />
              <span>ضبط حساسية الماسح الضوئي</span>
            </div>
            <button
              type="button"
              onClick={() =>
                onChangeCalibration({
                  fillThreshold: 0.24,
                  multiMarkMargin: 0.1,
                  contrastBoost: 1.15,
                })
              }
              className="text-xs text-emerald-700 hover:underline"
            >
              الافتراضي
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>عتبة التظليل (Fill Threshold)</span>
                <span className="font-mono-num">
                  {Math.round(calibration.fillThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.14}
                max={0.45}
                step={0.02}
                value={calibration.fillThreshold}
                onChange={(e) =>
                  onChangeCalibration({
                    ...calibration,
                    fillThreshold: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>هامش كشف التظليل المزدوج</span>
                <span className="font-mono-num">
                  {Math.round(calibration.multiMarkMargin * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.04}
                max={0.25}
                step={0.01}
                value={calibration.multiMarkMargin}
                onChange={(e) =>
                  onChangeCalibration({
                    ...calibration,
                    multiMarkMargin: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>تعزيز التباين للإضاءة الضعيفة</span>
                <span className="font-mono-num">
                  {calibration.contrastBoost.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={1.8}
                step={0.05}
                value={calibration.contrastBoost}
                onChange={(e) =>
                  onChangeCalibration({
                    ...calibration,
                    contrastBoost: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-700"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor: Model Metadata & Interactive Answer Key Grid */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-emerald-700" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                مفتاح التصحيح الإلكتروني — نموذج {activeExam.modelCode}
              </h2>
              <p className="text-xs text-slate-500">
                انقر على الدائرة الصحيحة لضبط مفتاح الإجابة الذي يطابقه الماسح الضوئي
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleShuffleActiveKey}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" />
              توليد مفتاح عشوائي
            </button>
            <div className="text-sm font-mono-num font-bold text-slate-800">
              الإجمالي:{" "}
              {activeExam.tfCount * activeExam.tfPoints +
                activeExam.mcqCount * activeExam.mcqPoints +
                activeExam.essayPoints}{" "}
              درجة{" "}
              <span className="text-xs font-normal text-slate-500">
                ({activeExam.tfCount * activeExam.tfPoints + activeExam.mcqCount * activeExam.mcqPoints} آلي + {activeExam.essayPoints} تعبير)
              </span>
            </div>
          </div>
        </div>

        {/* Editable Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اسم الاختبار الموحد
            </label>
            <input
              type="text"
              value={activeExam.examGroup ?? activeExam.title}
              onChange={(e) =>
                onUpdateExam({ ...activeExam, examGroup: e.target.value })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              رقم النموذج
            </label>
            <input
              type="text"
              value={activeExam.modelCode}
              onChange={(e) =>
                onUpdateExam({ ...activeExam, modelCode: e.target.value })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono-num font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              المادة
            </label>
            <input
              type="text"
              value={activeExam.subject}
              onChange={(e) =>
                onUpdateExam({ ...activeExam, subject: e.target.value })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              الصف الدراسي
            </label>
            <input
              type="text"
              value={activeExam.grade}
              onChange={(e) =>
                onUpdateExam({ ...activeExam, grade: e.target.value })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Weights */}
        <div className="grid grid-cols-3 gap-4 bg-slate-50 border border-slate-200 rounded-md p-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              درجة كل فقرة (ص/خ)
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={activeExam.tfPoints}
              onChange={(e) =>
                onUpdateExam({
                  ...activeExam,
                  tfPoints: Math.max(0.5, Number(e.target.value)),
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              درجة كل فقرة (اختيار)
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={activeExam.mcqPoints}
              onChange={(e) =>
                onUpdateExam({
                  ...activeExam,
                  mcqPoints: Math.max(0.5, Number(e.target.value)),
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              درجة التعبير (اختياري)
            </label>
            <input
              type="number"
              min={0}
              max={10}
              step={1}
              value={activeExam.essayPoints}
              onChange={(e) =>
                onUpdateExam({
                  ...activeExam,
                  essayPoints: Math.max(0, Number(e.target.value)),
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono-num"
            />
          </div>
        </div>

        {/* Section 1: True / False Answer Key */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-bold text-slate-900">
            أولاً: مفتاح الصواب والخطأ (1 – {activeExam.tfCount})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {activeExam.tfQuestions.map((q) => (
              <div
                key={q.num}
                className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50/70"
              >
                <span className="font-mono-num text-sm font-bold text-slate-700">
                  {q.num}
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { val: 1, label: "ص" },
                    { val: 2, label: "خ" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => updateTfAnswer(q.num, opt.val)}
                      className={`w-8 h-8 rounded-full text-xs font-bold border transition-colors ${
                        q.answer === opt.val
                          ? "bg-emerald-800 text-white border-emerald-800"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: MCQ Answer Key */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-bold text-slate-900">
            ثانياً: مفتاح الاختيار من متعدد ({activeExam.tfCount + 1} –{" "}
            {activeExam.tfCount + activeExam.mcqCount})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {activeExam.mcqQuestions.map((q) => (
              <div
                key={q.num}
                className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50/70"
              >
                <span className="font-mono-num text-sm font-bold text-slate-700">
                  {q.num}
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateMcqAnswer(q.num, opt)}
                      className={`w-7 h-7 rounded-full text-xs font-mono-num font-bold border transition-colors ${
                        q.answer === opt
                          ? "bg-emerald-800 text-white border-emerald-800"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
