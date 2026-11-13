import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Printer,
  QrCode,
  Users,
  User,
  CopyPlus,
  Plus,
  Trash2,
  Eye,
  Shuffle,
  Layers,
  ClipboardPaste,
} from "lucide-react";
import type { ExamModel, StudentAssignment } from "../types/omr";
import { OMRSheetSvg } from "./OMRSheetSvg";
import { OMREssayBackSvg } from "./OMREssayBackSvg";
import { SHEET_HEIGHT, SHEET_WIDTH } from "../utils/omrTemplate";

interface SheetGeneratorViewProps {
  exams: ExamModel[];
  selectedExamId: string;
  onSelectExamId: (id: string) => void;
  onAddExam: (exam: ExamModel) => void;
  committees: string[];
  onChangeCommittees: (next: string[]) => void;
  roster: StudentAssignment[];
  onChangeRoster: (next: StudentAssignment[]) => void;
}

export const SheetGeneratorView: React.FC<SheetGeneratorViewProps> = ({
  exams,
  selectedExamId,
  onSelectExamId,
  onAddExam,
  committees,
  onChangeCommittees,
  roster,
  onChangeRoster,
}) => {
  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0],
    [exams, selectedExamId]
  );

  // Default to "batch" so the teacher immediately sees paste + committee distribution + multi-model
  const [mode, setMode] = useState<"batch" | "single">("batch");

  // Single sheet mode state
  const [singleStudentName, setSingleStudentName] = useState("");
  const [singleCommitteeName, setSingleCommitteeName] = useState(
    committees[0] || ""
  );

  // Paste area & committee management state
  const [pasteText, setPasteText] = useState("");
  const [defaultPasteCommittee, setDefaultPasteCommittee] = useState(
    committees[0] || ""
  );
  const [newCommitteeInput, setNewCommitteeInput] = useState("");

  // Multi-model activation for the same exam
  const [multiModelEnabled, setMultiModelEnabled] = useState(true);
  const [enabledModelIds, setEnabledModelIds] = useState<string[]>([]);

  // Preview & print filters
  const [previewStudentId, setPreviewStudentId] = useState<string | null>(
    roster[0]?.id ?? null
  );
  const [printCommitteeFilter, setPrintCommitteeFilter] = useState<string>("all");
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [includeEssayBackPage, setIncludeEssayBackPage] = useState(true);
  const [previewSide, setPreviewSide] = useState<"front" | "back">("front");
  const [downloading, setDownloading] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Group exams by examGroup (fallback to title)
  const examGroups = useMemo(() => {
    const groups = new Map<string, ExamModel[]>();
    for (const ex of exams) {
      const key = (ex.examGroup || ex.title || ex.subject).trim();
      const arr = groups.get(key) || [];
      arr.push(ex);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([groupName, models]) => ({
      groupName,
      models,
    }));
  }, [exams]);

  const activeGroupName = useMemo(
    () =>
      (
        activeExam?.examGroup ||
        activeExam?.title ||
        activeExam?.subject ||
        ""
      ).trim(),
    [activeExam]
  );

  const groupModels = useMemo(() => {
    const found = examGroups.find((g) => g.groupName === activeGroupName);
    return found ? found.models : activeExam ? [activeExam] : [];
  }, [examGroups, activeGroupName, activeExam]);

  // Keep enabledModelIds synced with models in the active exam group
  useEffect(() => {
    const validIds = groupModels.map((m) => m.id);
    setEnabledModelIds((prev) => {
      const kept = prev.filter((id) => validIds.includes(id));
      if (kept.length > 0) return kept;
      // Enable up to first 2 models by default so multi-model works out-of-the-box
      return validIds.slice(0, Math.min(2, validIds.length));
    });
  }, [groupModels]);

  // Keep defaultPasteCommittee valid if committees list changes
  useEffect(() => {
    if (committees.length > 0 && !committees.includes(defaultPasteCommittee)) {
      setDefaultPasteCommittee(committees[0]);
    }
    if (committees.length > 0 && !committees.includes(singleCommitteeName)) {
      setSingleCommitteeName(committees[0]);
    }
  }, [committees, defaultPasteCommittee, singleCommitteeName]);

  const activeModelsForDistribution = useMemo(() => {
    if (!multiModelEnabled) {
      return activeExam ? [activeExam] : [];
    }
    const chosen = groupModels.filter((m) => enabledModelIds.includes(m.id));
    return chosen.length > 0 ? chosen : activeExam ? [activeExam] : [];
  }, [multiModelEnabled, groupModels, enabledModelIds, activeExam]);

  const handleSelectGroup = (groupName: string) => {
    const group = examGroups.find((g) => g.groupName === groupName);
    if (!group || group.models.length === 0) return;
    onSelectExamId(group.models[0].id);
    const defaultIds = group.models.slice(0, Math.min(2, group.models.length)).map((m) => m.id);
    setEnabledModelIds(defaultIds);
  };

  const handleToggleModelActive = (modelId: string) => {
    setEnabledModelIds((prev) => {
      const exists = prev.includes(modelId);
      if (exists) {
        if (prev.length <= 1) return prev; // keep at least 1 active model
        return prev.filter((id) => id !== modelId);
      }
      return [...prev, modelId];
    });
  };

  const handleQuickAddVariantModel = () => {
    if (!activeExam) return;
    const groupName = activeGroupName || activeExam.title;
    const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
    const nextCode =
      groupModels.length < letters.length
        ? `نموذج ${letters[groupModels.length]}`
        : `${activeExam.modelCode}.${groupModels.length + 1}`;
    const newVariant: ExamModel = {
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
    onAddExam(newVariant);
    setMultiModelEnabled(true);
    setEnabledModelIds((prev) => [...prev, newVariant.id]);
  };

  // Parse pasted student names (supports "name" per line OR "name\tcommittee")
  const parsePastedStudents = (replaceExisting: boolean) => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const pool = activeModelsForDistribution;
    const baseIndex = replaceExisting ? 0 : roster.length;
    const newCommittees = [...committees];

    const parsed: StudentAssignment[] = lines.map((line, i) => {
      const parts = line.split(/\t|،|,|\|/).map((p) => p.trim()).filter(Boolean);
      const studentName = parts[0] || line;
      let assignedCommittee = defaultPasteCommittee || committees[0] || "";
      if (parts[1]) {
        assignedCommittee = parts[1];
        if (!newCommittees.includes(assignedCommittee)) {
          newCommittees.push(assignedCommittee);
        }
      }
      const model = pool[(baseIndex + i) % pool.length] ?? activeExam;
      return {
        id: `stu_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        studentName,
        committeeName: assignedCommittee,
        examId: model.id,
      };
    });

    if (newCommittees.length !== committees.length) {
      onChangeCommittees(newCommittees);
    }

    const nextRoster = replaceExisting ? parsed : [...roster, ...parsed];
    onChangeRoster(nextRoster);
    if (nextRoster[0] && (!previewStudentId || replaceExisting)) {
      setPreviewStudentId(nextRoster[0].id);
    }
    setPasteText("");
  };

  const handleAddCommittee = () => {
    const trimmed = newCommitteeInput.trim();
    if (!trimmed) return;
    if (!committees.includes(trimmed)) {
      onChangeCommittees([...committees, trimmed]);
    }
    setDefaultPasteCommittee(trimmed);
    setNewCommitteeInput("");
  };

  const handleRemoveCommittee = (name: string) => {
    const remaining = committees.filter((c) => c !== name);
    onChangeCommittees(remaining);
    onChangeRoster(
      roster.map((s) =>
        s.committeeName === name
          ? { ...s, committeeName: remaining[0] || "" }
          : s
      )
    );
  };

  const handleUpdateStudent = (
    id: string,
    patch: Partial<StudentAssignment>
  ) => {
    onChangeRoster(
      roster.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const handleDeleteStudent = (id: string) => {
    const next = roster.filter((s) => s.id !== id);
    onChangeRoster(next);
    if (previewStudentId === id) {
      setPreviewStudentId(next[0]?.id ?? null);
    }
  };

  const handleDistributeModelsAlternating = () => {
    const pool = activeModelsForDistribution;
    if (pool.length === 0 || roster.length === 0) return;

    // Track alternating index separately inside each committee so neighboring students get different models
    const committeeCounter = new Map<string, number>();
    const updated = roster.map((s) => {
      const idx = committeeCounter.get(s.committeeName) ?? 0;
      committeeCounter.set(s.committeeName, idx + 1);
      const chosenModel = pool[idx % pool.length];
      return { ...s, examId: chosenModel.id };
    });
    onChangeRoster(updated);
  };

  const handleDistributeCommitteesRandomly = () => {
    if (committees.length === 0 || roster.length === 0) return;
    const shuffledIndices = roster.map((_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndices[i], shuffledIndices[j]] = [
        shuffledIndices[j],
        shuffledIndices[i],
      ];
    }
    const updated = roster.map((s, idx) => {
      const cIdx = shuffledIndices[idx] % committees.length;
      return { ...s, committeeName: committees[cIdx] };
    });
    onChangeRoster(updated);
  };

  const resolveExamForStudent = (examId: string): ExamModel => {
    if (!multiModelEnabled) return activeExam;
    return (
      exams.find((e) => e.id === examId) ??
      activeModelsForDistribution[0] ??
      activeExam
    );
  };

  const sheetsToPrint = useMemo(() => {
    if (mode === "single") {
      return [
        {
          id: "single",
          studentName: singleStudentName,
          committeeName: singleCommitteeName,
          exam: activeExam,
        },
      ];
    }
    const filtered =
      printCommitteeFilter === "all"
        ? roster
        : roster.filter((s) => s.committeeName === printCommitteeFilter);
    return filtered.map((s) => ({
      id: s.id,
      studentName: s.studentName,
      committeeName: s.committeeName,
      exam: resolveExamForStudent(s.examId),
    }));
  }, [
    mode,
    singleStudentName,
    singleCommitteeName,
    activeExam,
    roster,
    printCommitteeFilter,
    multiModelEnabled,
    exams,
    activeModelsForDistribution,
  ]);

  const previewTarget = useMemo(() => {
    if (mode === "single") {
      return {
        studentName: singleStudentName,
        committeeName: singleCommitteeName,
        exam: activeExam,
      };
    }
    const stu =
      roster.find((s) => s.id === previewStudentId) ?? roster[0] ?? null;
    if (!stu) {
      return {
        studentName: "",
        committeeName: committees[0] || "",
        exam: activeExam,
      };
    }
    return {
      studentName: stu.studentName,
      committeeName: stu.committeeName,
      exam: resolveExamForStudent(stu.examId),
    };
  }, [
    mode,
    singleStudentName,
    singleCommitteeName,
    activeExam,
    roster,
    previewStudentId,
    committees,
    multiModelEnabled,
    exams,
    activeModelsForDistribution,
  ]);

  const committeeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of committees) map.set(c, 0);
    for (const s of roster) {
      map.set(s.committeeName, (map.get(s.committeeName) ?? 0) + 1);
    }
    return map;
  }, [committees, roster]);

  const handleDownloadPng = async () => {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgRef.current);
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = SHEET_WIDTH * scale;
        canvas.height = SHEET_HEIGHT * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `OMR_${previewTarget.exam.modelCode}_${
            previewTarget.studentName || "نموذج_فارغ"
          }.png`;
          a.click();
        }
        URL.revokeObjectURL(url);
        setDownloading(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setDownloading(false);
      };
      img.src = url;
    } catch {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!activeExam) return null;

  return (
    <>
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls & Distribution Column (6 cols in batch, 4 cols in single) */}
        <div
          className={`${
            mode === "batch" ? "lg:col-span-7" : "lg:col-span-4"
          } space-y-5`}
        >
          {/* Mode Switcher + Exam & Multi-Model Configuration */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  إعداد أوراق التظليل وتوزيع اللجان والنماذج
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  مدارس إشراق اليمن · إشراف {activeExam.teacher || "الأستاذ إبراهيم"} · دون رقم جلوس
                </p>
              </div>

              {/* Segmented Mode Control */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("batch")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    mode === "batch"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  توزيع الطلاب واللجان
                </button>
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    mode === "single"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  ورقة طالب واحد
                </button>
              </div>
            </div>

            {/* Unified Exam & Multi-Model Activation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  الاختبار الموحد
                </label>
                <select
                  value={activeGroupName}
                  onChange={(e) => handleSelectGroup(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                >
                  {examGroups.map((g) => (
                    <option key={g.groupName} value={g.groupName}>
                      {g.groupName} ({g.models.length}{" "}
                      {g.models.length === 1 ? "نموذج" : "نماذج"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  {multiModelEnabled
                    ? "النموذج الافتراضي / المعاينة"
                    : "النموذج المعتمد للورقة"}
                </label>
                <select
                  value={activeExam.id}
                  onChange={(e) => onSelectExamId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                >
                  {groupModels.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.modelCode} — {ex.subject} ({ex.tfCount + ex.mcqCount}{" "}
                      فقرة)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Multi-Model Toggle & Active Models Selector */}
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiModelEnabled}
                    onChange={(e) => setMultiModelEnabled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  <span className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-700" />
                    تفعيل أكثر من نموذج لنفس الاختبار
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleQuickAddVariantModel}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 transition-colors whitespace-nowrap"
                >
                  <CopyPlus className="w-3.5 h-3.5" />
                  إضافة نموذج رديف جديد
                </button>
              </div>

              {multiModelEnabled ? (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600">
                    اختر النماذج المفعّلة للتوزيع على طلاب هذا الاختبار (يميز الماسح الضوئي كل نموذج تلقائياً من الباركود):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {groupModels.map((m) => {
                      const isEnabled = enabledModelIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleToggleModelActive(m.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                            isEnabled
                              ? "bg-emerald-800 text-white border-emerald-800"
                              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          <span className="font-mono-num">{m.modelCode}</span>
                          {isEnabled ? " ✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  الوضع الفردي مفعّل: سيتم اعتماد نموذج{" "}
                  <span className="font-mono-num font-bold">
                    {activeExam.modelCode}
                  </span>{" "}
                  لجميع الطلاب.
                </p>
              )}
            </div>
          </div>

          {mode === "batch" ? (
            <>
              {/* Step 1: One-Time Paste + Committee Manager */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Paste Students Box (7 cols) */}
                <div className="md:col-span-7 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                      <ClipboardPaste className="w-4 h-4 text-emerald-700" />
                      لصق أسماء الطلاب مرة واحدة
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      اسم في كل سطر
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="الصق قائمة أسماء الطلاب هنا دفعة واحدة (اسم في كل سطر، أو: الاسم [Tab] اللجنة)..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={defaultPasteCommittee}
                      onChange={(e) => setDefaultPasteCommittee(e.target.value)}
                      className="flex-1 min-w-[140px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      <option value="">بدون لجنة افتراضية (تحديد لاحقاً)</option>
                      {committees.map((c) => (
                        <option key={c} value={c}>
                          الافتراضي: {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!pasteText.trim()}
                      onClick={() => parsePastedStudents(false)}
                      className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      إضافة للقائمة
                    </button>
                    <button
                      type="button"
                      disabled={!pasteText.trim()}
                      onClick={() => parsePastedStudents(true)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      استبدال القائمة
                    </button>
                  </div>
                </div>

                {/* Committees Setup Box (5 cols) */}
                <div className="md:col-span-5 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      إدارة اللجان ({committees.length})
                    </h3>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newCommitteeInput}
                      onChange={(e) => setNewCommitteeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCommittee();
                        }
                      }}
                      placeholder="اسم لجنة جديدة..."
                      className="flex-1 min-w-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCommittee}
                      className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-md">
                    {committees.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">
                        أضف أسماء اللجان أعلاه (مثال: لجنة 1) لتحديدها للطلاب.
                      </div>
                    ) : (
                      committees.map((c) => (
                        <div
                          key={c}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                        >
                          <span className="truncate font-medium text-slate-800">
                            {c}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-num text-slate-500">
                              {committeeCounts.get(c) ?? 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCommittee(c)}
                              className="text-slate-400 hover:text-red-600"
                              title="حذف اللجنة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2: Manual Committee & Model Assignment Table */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      جدول توزيع الطلاب على اللجان والنماذج ({roster.length} طالب)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      حدد لجنة كل طالب يدوياً من القائمة المنسدلة، واختر أو وزّع النماذج بالتناوب.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {multiModelEnabled && activeModelsForDistribution.length > 1 && (
                      <button
                        type="button"
                        onClick={handleDistributeModelsAlternating}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        توزيع النماذج بالتناوب داخل كل لجنة
                      </button>
                    )}
                    {committees.length > 0 && roster.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDistributeCommitteesRandomly}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        توزيع عشوائي على اللجان
                      </button>
                    )}
                    {roster.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onChangeRoster([]);
                          setPreviewStudentId(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        مسح القائمة
                      </button>
                    )}
                  </div>
                </div>

                {roster.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    لا يوجد طلاب في القائمة حالياً. الصق أسماء الطلاب في الصندوق أعلاه للبدء.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-slate-200 rounded-md">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-2.5 font-semibold w-10">#</th>
                          <th className="py-2 px-2.5 font-semibold">اسم الطالب</th>
                          <th className="py-2 px-2.5 font-semibold w-48">
                            اللجنة (تحديد يدوي)
                          </th>
                          <th className="py-2 px-2.5 font-semibold w-36">
                            النموذج
                          </th>
                          <th className="py-2 px-2.5 font-semibold w-20 text-center">
                            معاينة / حذف
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {roster.map((stu, idx) => {
                          const assignedExam = resolveExamForStudent(stu.examId);
                          const isPreviewing = previewStudentId === stu.id;
                          return (
                            <tr
                              key={stu.id}
                              className={
                                isPreviewing
                                  ? "bg-emerald-50/60"
                                  : "hover:bg-slate-50"
                              }
                            >
                              <td className="py-1.5 px-2.5 font-mono-num text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2">
                                <input
                                  type="text"
                                  value={stu.studentName}
                                  onChange={(e) =>
                                    handleUpdateStudent(stu.id, {
                                      studentName: e.target.value,
                                    })
                                  }
                                  className="w-full rounded border border-transparent hover:border-slate-300 focus:border-emerald-700 focus:bg-white bg-transparent px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 px-2">
                                <select
                                  value={stu.committeeName}
                                  onChange={(e) =>
                                    handleUpdateStudent(stu.id, {
                                      committeeName: e.target.value,
                                    })
                                  }
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-emerald-700 focus:outline-none"
                                >
                                  <option value="">— اختر اللجنة —</option>
                                  {stu.committeeName &&
                                    !committees.includes(stu.committeeName) && (
                                      <option value={stu.committeeName}>
                                        {stu.committeeName}
                                      </option>
                                    )}
                                  {committees.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-1.5 px-2">
                                {multiModelEnabled ? (
                                  <select
                                    value={assignedExam.id}
                                    onChange={(e) =>
                                      handleUpdateStudent(stu.id, {
                                        examId: e.target.value,
                                      })
                                    }
                                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono-num font-semibold text-slate-800 focus:border-emerald-700 focus:outline-none"
                                  >
                                    {activeModelsForDistribution.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.modelCode}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="font-mono-num font-semibold text-slate-700 px-2">
                                    {activeExam.modelCode}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewStudentId(stu.id)}
                                    title="معاينة ورقة الطالب"
                                    className={`p-1 rounded ${
                                      isPreviewing
                                        ? "text-emerald-800 bg-emerald-100"
                                        : "text-slate-500 hover:text-emerald-800"
                                    }`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStudent(stu.id)}
                                    title="حذف الطالب"
                                    className="p-1 rounded text-slate-400 hover:text-red-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Print Filter & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      نطاق الطباعة:
                    </label>
                    <select
                      value={printCommitteeFilter}
                      onChange={(e) => setPrintCommitteeFilter(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      <option value="all">
                        جميع اللجان ({roster.length} ورقة)
                      </option>
                      {committees.map((c) => (
                        <option key={c} value={c}>
                          {c} ({committeeCounts.get(c) ?? 0})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {activeExam.essayPoints > 0 && (
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeEssayBackPage}
                          onChange={(e) =>
                            setIncludeEssayBackPage(e.target.checked)
                          }
                          className="h-3.5 w-3.5 accent-emerald-700"
                        />
                        ظهر الورقة للتعبير
                      </label>
                    )}
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer ml-1">
                      <input
                        type="checkbox"
                        checked={showAnswerKey}
                        onChange={(e) => setShowAnswerKey(e.target.checked)}
                        className="h-3.5 w-3.5 accent-emerald-700"
                      />
                      مفتاح المعلم
                    </label>
                    <button
                      type="button"
                      disabled={sheetsToPrint.length === 0}
                      onClick={handlePrint}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <Printer className="w-4 h-4" />
                      طباعة ({sheetsToPrint.length}) أوراق A4
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPng}
                      disabled={downloading}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      PNG للمعاينة
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Single Student Mode Controls */
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-800">
                  اسم اللجنة
                </label>
                <input
                  type="text"
                  list="single-committee-options"
                  value={singleCommitteeName}
                  onChange={(e) => setSingleCommitteeName(e.target.value)}
                  placeholder="اكتب اسم اللجنة أو اختر من القائمة..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
                <datalist id="single-committee-options">
                  {committees.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-800">
                    اسم الطالب
                  </label>
                  <button
                    type="button"
                    onClick={() => setSingleStudentName("")}
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    تركه فارغاً للكتابة يدوياً
                  </button>
                </div>
                <input
                  type="text"
                  value={singleStudentName}
                  onChange={(e) => setSingleStudentName(e.target.value)}
                  placeholder="اكتب اسم الطالب أو اتركه فارغاً..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <label className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-md border border-slate-200 bg-slate-50 cursor-pointer">
                <span className="text-sm font-medium text-slate-800">
                  معاينة مفتاح الإجابة المظلل (للمعلم)
                </span>
                <input
                  type="checkbox"
                  checked={showAnswerKey}
                  onChange={(e) => setShowAnswerKey(e.target.checked)}
                  className="h-4 w-4 accent-emerald-700"
                />
              </label>

              {activeExam.essayPoints > 0 && (
                <label className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-md border border-slate-200 bg-slate-50 cursor-pointer">
                  <span className="text-sm font-medium text-slate-800">
                    تضمين ظهر الورقة المسطّر للتعبير (خلف الورقة)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeEssayBackPage}
                    onChange={(e) => setIncludeEssayBackPage(e.target.checked)}
                    className="h-4 w-4 accent-emerald-700"
                  />
                </label>
              )}

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span>بيانات الباركود المدمج في الورقة</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  يتم تشفير رقم النموذج (
                  <span className="font-mono-num font-semibold">
                    {activeExam.modelCode}
                  </span>
                  ) واسم اللجنة واسم الطالب داخل رمز QR لالتقاطها تلقائياً بالكاميرا.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap"
                >
                  <Printer className="w-4 h-4" />
                  طباعة الورقة (A4)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  disabled={downloading}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {downloading ? "جارٍ التصدير..." : "حفظ PNG"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Sheet Preview */}
        <div
          className={`${
            mode === "batch" ? "lg:col-span-5" : "lg:col-span-8"
          } bg-slate-200/70 border border-slate-200 rounded-lg p-4 sm:p-5 flex flex-col items-center sticky top-20`}
        >
          <div className="w-full max-w-[680px] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 mb-3">
            <span className="font-semibold text-slate-800 truncate">
              معاينة: {previewTarget.studentName || "نموذج فارغ"} ·{" "}
              {previewTarget.committeeName || "بدون لجنة"}
            </span>
            <div className="flex items-center gap-2">
              {previewTarget.exam.essayPoints > 0 && (
                <div className="inline-flex rounded bg-white border border-slate-300 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewSide("front")}
                    className={`px-2 py-0.5 rounded font-semibold ${
                      previewSide === "front"
                        ? "bg-emerald-800 text-white"
                        : "text-slate-700"
                    }`}
                  >
                    الوجه (التظليل)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewSide("back")}
                    className={`px-2 py-0.5 rounded font-semibold ${
                      previewSide === "back"
                        ? "bg-emerald-800 text-white"
                        : "text-slate-700"
                    }`}
                  >
                    الظهر (التعبير)
                  </button>
                </div>
              )}
              <span className="font-mono-num font-bold text-emerald-800">
                نموذج {previewTarget.exam.modelCode}
              </span>
            </div>
          </div>
          <div className="w-full max-w-[680px] bg-white shadow-md border border-slate-300 rounded-sm overflow-hidden">
            {previewSide === "back" && previewTarget.exam.essayPoints > 0 ? (
              <OMREssayBackSvg
                exam={previewTarget.exam}
                studentName={previewTarget.studentName}
                committeeName={previewTarget.committeeName}
                className="w-full h-auto block"
              />
            ) : (
              <OMRSheetSvg
                svgRef={svgRef}
                exam={previewTarget.exam}
                studentName={previewTarget.studentName}
                committeeName={previewTarget.committeeName}
                showAnswerKey={showAnswerKey}
                className="w-full h-auto block"
              />
            )}
          </div>
        </div>
      </div>

      {/* Print-only A4 Sheets Container */}
      <div className="hidden print:block print:m-0 print:p-0">
        {sheetsToPrint.map((item) => (
          <React.Fragment key={item.id}>
            <div className="print-only-sheet">
              <OMRSheetSvg
                exam={item.exam}
                studentName={item.studentName}
                committeeName={item.committeeName}
                showAnswerKey={showAnswerKey}
                className="w-full h-full block"
              />
            </div>
            {includeEssayBackPage && item.exam.essayPoints > 0 && (
              <div className="print-only-sheet">
                <OMREssayBackSvg
                  exam={item.exam}
                  studentName={item.studentName}
                  committeeName={item.committeeName}
                  className="w-full h-full block"
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </>
  );
};
