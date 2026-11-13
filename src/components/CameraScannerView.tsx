import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Sparkles,
  RotateCcw,
  Save,
  SlidersHorizontal,
  XCircle,
  VideoOff,
  Wand2,
} from "lucide-react";
import type {
  CalibrationSettings,
  ExamModel,
  ScannedResult,
} from "../types/omr";
import {
  CornerQuad,
  decodeQRFromCanvas,
  detectFiducialCorners,
  generateSimulatedOMRPhoto,
  gradeWarpedOMRCanvas,
  QRDetectionResult,
  warpPerspectiveQuad,
} from "../utils/omrScanner";

interface CameraScannerViewProps {
  exams: ExamModel[];
  selectedExamId: string;
  onSelectExamId: (id: string) => void;
  calibration: CalibrationSettings;
  onSaveResult: (result: ScannedResult) => void;
}

export const CameraScannerView: React.FC<CameraScannerViewProps> = ({
  exams,
  selectedExamId,
  onSelectExamId,
  calibration,
  onSaveResult,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveQR, setLiveQR] = useState<QRDetectionResult | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);

  const [capturedCanvas, setCapturedCanvas] =
    useState<HTMLCanvasElement | null>(null);
  const [detectedQuad, setDetectedQuad] = useState<CornerQuad | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<
    "tl" | "tr" | "br" | "bl" | null
  >(null);

  const [studentNameInput, setStudentNameInput] = useState("");
  const [committeeInput, setCommitteeInput] = useState("");
  const [scannedResult, setScannedResult] = useState<ScannedResult | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [aiVerifying, setAiVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0],
    [exams, selectedExamId]
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setLiveQR(null);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setStatusMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 1600 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "تعذر الوصول إلى الكاميرا. تأكد من منح الصلاحية أو استخدم رفع الصورة.";
      setCameraError(msg);
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const runPipelineOnCanvas = useCallback(
    (
      srcCanvas: HTMLCanvasElement,
      method: ScannedResult["detectionMethod"],
      customQuad?: CornerQuad
    ) => {
      const qr = decodeQRFromCanvas(srcCanvas);
      let matchedExam = activeExam;
      let resolvedStudent = studentNameInput;
      let resolvedCommittee = committeeInput;

      if (qr?.parsed.valid) {
        const byId = exams.find((e) => e.id === qr.parsed.examId);
        const byModel = exams.find(
          (e) =>
            e.modelCode.toLowerCase() ===
            (qr.parsed.modelCode || "").toLowerCase()
        );
        const found = byId || byModel;
        if (found) {
          matchedExam = found;
          onSelectExamId(found.id);
        }
        if (qr.parsed.studentName) {
          resolvedStudent = qr.parsed.studentName;
          setStudentNameInput(qr.parsed.studentName);
        }
        if (qr.parsed.committeeName) {
          resolvedCommittee = qr.parsed.committeeName;
          setCommitteeInput(qr.parsed.committeeName);
        }
        setStatusMessage(
          `تمت قراءة الباركود بنجاح: نموذج ${qr.parsed.modelCode || matchedExam.modelCode}`
        );
      } else {
        setStatusMessage(
          `لم يُقرأ رمز QR تلقائياً — تم استخدام الاختبار المحدد (${matchedExam.modelCode})`
        );
      }

      const quad = customQuad ?? detectFiducialCorners(srcCanvas, qr);
      setDetectedQuad(quad);
      setCapturedCanvas(srcCanvas);

      const warped = warpPerspectiveQuad(srcCanvas, quad);
      const result = gradeWarpedOMRCanvas(
        warped,
        matchedExam,
        {
          studentName: resolvedStudent,
          committeeName: resolvedCommittee,
          detectionMethod: method,
        },
        calibration
      );
      setScannedResult(result);
      setSavedNotice(false);
    },
    [
      activeExam,
      calibration,
      committeeInput,
      exams,
      onSelectExamId,
      studentNameInput,
    ]
  );

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    runPipelineOnCanvas(c, "camera-cv");
  }, [runPipelineOnCanvas]);

  // Live QR & alignment scanning loop while camera is active
  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let stableFrames = 0;

    const timer = window.setInterval(() => {
      if (cancelled) return;
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !overlay || video.readyState < 2) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const tmp = document.createElement("canvas");
      tmp.width = vw;
      tmp.height = vh;
      const tctx = tmp.getContext("2d", { willReadFrequently: true });
      if (!tctx) return;
      tctx.drawImage(video, 0, 0);

      const qr = decodeQRFromCanvas(tmp);
      setLiveQR(qr);

      overlay.width = vw;
      overlay.height = vh;
      const octx = overlay.getContext("2d");
      if (octx) {
        octx.clearRect(0, 0, vw, vh);
        // Subtle A4 framing guide
        const padX = vw * 0.08;
        const padY = vh * 0.06;
        octx.strokeStyle = qr ? "#16a34a" : "rgba(255,255,255,0.6)";
        octx.lineWidth = qr ? 4 : 2;
        octx.setLineDash([12, 8]);
        octx.strokeRect(padX, padY, vw - padX * 2, vh - padY * 2);
        octx.setLineDash([]);

        if (qr) {
          const loc = qr.location;
          octx.strokeStyle = "#16a34a";
          octx.lineWidth = 4;
          octx.beginPath();
          octx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
          octx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
          octx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
          octx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
          octx.closePath();
          octx.stroke();

          stableFrames++;
          if (autoCapture && stableFrames >= 3) {
            stableFrames = 0;
            captureFromVideo();
            stopCamera();
          }
        } else {
          stableFrames = 0;
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [autoCapture, cameraActive, captureFromVideo, stopCamera]);

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          runPipelineOnCanvas(c, "upload-cv");
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSimulateScan = async () => {
    if (!activeExam) return;
    const pickedName = studentNameInput.trim() || "ورقة اختبار محاكاة";
    const pickedCommittee = committeeInput.trim() || "لجنة اختبار";

    const simCanvas = await generateSimulatedOMRPhoto(
      activeExam,
      pickedName,
      pickedCommittee,
      0.86
    );
    runPipelineOnCanvas(simCanvas, "simulated-cv");
  };

  const handleRegradeWithQuad = () => {
    if (!capturedCanvas || !detectedQuad) return;
    runPipelineOnCanvas(
      capturedCanvas,
      scannedResult?.detectionMethod ?? "upload-cv",
      detectedQuad
    );
  };

  const handleAIVerify = async () => {
    if (!capturedCanvas || !activeExam) return;
    setAiVerifying(true);
    try {
      const jpeg = capturedCanvas.toDataURL("image/jpeg", 0.85);
      const res = await fetch("/api/verify-omr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: jpeg,
          tfCount: activeExam.tfCount,
          mcqCount: activeExam.mcqCount,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "تعذر التحقق الذكي");
      }
      const data = await res.json();
      if (data.studentName) setStudentNameInput(data.studentName);
      if (data.committeeName) setCommitteeInput(data.committeeName);

      // Recompute grading using AI-verified answers
      const answerMap = new Map<number, number>();
      (data.answers || []).forEach((a: { num: number; marked: number }) => {
        answerMap.set(a.num, a.marked);
      });

      const allQs = [
        ...activeExam.tfQuestions.map((q) => ({ ...q, type: "tf" as const })),
        ...activeExam.mcqQuestions.map((q) => ({ ...q, type: "mcq" as const })),
      ];

      let autoScore = 0;
      let autoMaxScore = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let blankCount = 0;
      let multipleCount = 0;

      const graded = allQs.map((q) => {
        const maxPoints =
          q.type === "tf" ? activeExam.tfPoints : activeExam.mcqPoints;
        autoMaxScore += maxPoints;
        const m = answerMap.get(q.num) ?? 0;
        if (m === 0) {
          blankCount++;
          return {
            num: q.num,
            type: q.type,
            marked: null,
            markedOptions: [],
            correctAnswer: q.answer,
            status: "blank" as const,
            earnedPoints: 0,
            maxPoints,
            confidences: [],
          };
        }
        if (m === -1) {
          multipleCount++;
          return {
            num: q.num,
            type: q.type,
            marked: -1,
            markedOptions: [],
            correctAnswer: q.answer,
            status: "multiple" as const,
            earnedPoints: 0,
            maxPoints,
            confidences: [],
          };
        }
        if (m === q.answer) {
          correctCount++;
          autoScore += maxPoints;
          return {
            num: q.num,
            type: q.type,
            marked: m,
            markedOptions: [m],
            correctAnswer: q.answer,
            status: "correct" as const,
            earnedPoints: maxPoints,
            maxPoints,
            confidences: [],
          };
        }
        wrongCount++;
        return {
          num: q.num,
          type: q.type,
          marked: m,
          markedOptions: [m],
          correctAnswer: q.answer,
          status: "wrong" as const,
          earnedPoints: 0,
          maxPoints,
          confidences: [],
        };
      });

      const existingEssay = scannedResult?.essayScore ?? 0;
      const totalMaxScore = autoMaxScore + activeExam.essayPoints;
      const totalScore = autoScore + existingEssay;
      const percentage =
        totalMaxScore > 0
          ? Math.round((totalScore / totalMaxScore) * 1000) / 10
          : 0;

      setScannedResult((prev) => ({
        id: prev?.id ?? `scan_${Date.now()}`,
        timestamp: new Date().toISOString(),
        studentName:
          data.studentName || studentNameInput.trim() || "طالب غير مسمى",
        committeeName:
          data.committeeName || committeeInput.trim() || "لجنة غير محددة",
        modelCode: activeExam.modelCode,
        examId: activeExam.id,
        examTitle: activeExam.title,
        subject: activeExam.subject,
        autoScore,
        autoMaxScore,
        essayScore: prev?.essayScore ?? 0,
        essayMaxScore: activeExam.essayPoints,
        totalScore,
        totalMaxScore,
        percentage,
        correctCount,
        wrongCount,
        blankCount,
        multipleCount,
        questions: graded,
        annotatedImageUrl: prev?.annotatedImageUrl,
        detectionMethod: "ai-assisted",
      }));
      setStatusMessage("تم التحقق البصري الذكي ومطابقة الإجابات.");
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "فشل التحقق الذكي."
      );
    } finally {
      setAiVerifying(false);
    }
  };

  const handleSaveToDashboard = () => {
    if (!scannedResult) return;
    const finalized: ScannedResult = {
      ...scannedResult,
      studentName: studentNameInput.trim() || scannedResult.studentName,
      committeeName: committeeInput.trim() || scannedResult.committeeName,
    };
    onSaveResult(finalized);
    setScannedResult(finalized);
    setSavedNotice(true);
  };

  // Interactive corner dragging on captured canvas SVG overlay
  const handleCornerDrag = (
    e: React.PointerEvent<SVGSVGElement>,
    container: SVGSVGElement
  ) => {
    if (!draggingCorner || !detectedQuad || !capturedCanvas) return;
    const rect = container.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * capturedCanvas.width;
    const ry = ((e.clientY - rect.top) / rect.height) * capturedCanvas.height;
    setDetectedQuad({
      ...detectedQuad,
      [draggingCorner]: {
        x: Math.max(0, Math.min(capturedCanvas.width, rx)),
        y: Math.max(0, Math.min(capturedCanvas.height, ry)),
      },
    });
  };

  if (!activeExam) return null;

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              الاختبار الافتراضي (في حال عدم وضوح QR)
            </label>
            <select
              value={activeExam.id}
              onChange={(e) => onSelectExamId(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  نموذج {ex.modelCode} — {ex.subject}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            <span>التقاط تلقائي عند تثبيت الباركود</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!cameraActive ? (
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap"
            >
              <Camera className="w-4 h-4" />
              تشغيل الكاميرا
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 transition-colors whitespace-nowrap"
            >
              <VideoOff className="w-4 h-4" />
              إيقاف الكاميرا
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            رفع صورة ورقة
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadImage}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleSimulateScan}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-700/30 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors whitespace-nowrap"
          >
            <Wand2 className="w-4 h-4" />
            تجربة مسح ورقة مظللة
          </button>
        </div>
      </div>

      {cameraError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {statusMessage && (
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-sm text-slate-800 flex items-center justify-between gap-3">
          <span>{statusMessage}</span>
          {detectedQuad && (
            <span className="text-xs font-mono-num text-slate-500">
              دقة المحاذاة: {detectedQuad.confidence === "high" ? "عالية (4 علامات)" : detectedQuad.confidence === "medium" ? "متوسطة" : "تقديرية"}
            </span>
          )}
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Camera / Captured View (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              {cameraActive
                ? "عدسة المسح المباشر"
                : capturedCanvas
                ? "الورقة الملتقطة ومعايرة الزوايا الأربعة"
                : "منطقة المسح الضوئي"}
            </h3>
            {cameraActive && (
              <span className="text-xs font-medium text-emerald-800">
                {liveQR
                  ? `تم رصد الباركود (${liveQR.parsed.modelCode || "صالح"})`
                  : "وجّه الكاميرا نحو الورقة..."}
              </span>
            )}
          </div>

          {cameraActive ? (
            <div className="relative bg-slate-950 rounded-md overflow-hidden aspect-[3/4]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
              <div className="absolute bottom-4 inset-x-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    captureFromVideo();
                    stopCamera();
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-800 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  التقاط وتصحيح الورقة الآن
                </button>
              </div>
            </div>
          ) : capturedCanvas && detectedQuad ? (
            <div className="space-y-3">
              <div className="relative bg-slate-100 border border-slate-200 rounded-md overflow-hidden">
                <img
                  src={capturedCanvas.toDataURL("image/jpeg", 0.9)}
                  alt="الورقة الملتقطة"
                  className="w-full h-auto block"
                />
                <svg
                  viewBox={`0 0 ${capturedCanvas.width} ${capturedCanvas.height}`}
                  className="absolute inset-0 w-full h-full touch-none"
                  onPointerMove={(e) => handleCornerDrag(e, e.currentTarget)}
                  onPointerUp={() => setDraggingCorner(null)}
                  onPointerLeave={() => setDraggingCorner(null)}
                >
                  <polygon
                    points={`${detectedQuad.tl.x},${detectedQuad.tl.y} ${detectedQuad.tr.x},${detectedQuad.tr.y} ${detectedQuad.br.x},${detectedQuad.br.y} ${detectedQuad.bl.x},${detectedQuad.bl.y}`}
                    fill="rgba(16, 185, 129, 0.08)"
                    stroke="#059669"
                    strokeWidth={Math.max(3, capturedCanvas.width * 0.004)}
                  />
                  {(["tl", "tr", "br", "bl"] as const).map((key) => {
                    const pt = detectedQuad[key];
                    const r = Math.max(12, capturedCanvas.width * 0.016);
                    return (
                      <circle
                        key={key}
                        cx={pt.x}
                        cy={pt.y}
                        r={r}
                        fill="#059669"
                        fillOpacity={0.85}
                        stroke="#ffffff"
                        strokeWidth={3}
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingCorner(key);
                        }}
                      />
                    );
                  })}
                </svg>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>اسحب النقاط الخضراء إذا احتجت لضبط زوايا المعايرة يدوياً</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRegradeWithQuad}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة المسح بالزوايا
                  </button>
                  <button
                    type="button"
                    onClick={handleAIVerify}
                    disabled={aiVerifying}
                    className="inline-flex items-center gap-1.5 rounded border border-emerald-700/30 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {aiVerifying ? "جارٍ التحقق..." : "تحقق ذكي إضافي"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 rounded-md bg-slate-50 py-20 px-6 text-center space-y-3">
              <Camera className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">
                جاهز لمسح أوراق التظليل (OMR)
              </p>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                شغّل الكاميرا لتصوير الورقة مباشرة، أو ارفع صورة ورقة مظللة، أو اضغط على «تجربة مسح ورقة مظللة» لاختبار خوارزمية التعرف الفورية.
              </p>
            </div>
          )}
        </div>

        {/* Grading Result & Annotated Verification (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 space-y-5">
          {scannedResult ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    نتيجة التصحيح والمطابقة
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    نموذج {scannedResult.modelCode} · {scannedResult.subject}
                  </p>
                </div>
                <div className="text-left">
                  <div className="text-2xl font-bold font-mono-num text-emerald-800">
                    {scannedResult.totalScore} / {scannedResult.totalMaxScore}
                  </div>
                  <div className="text-xs font-mono-num text-slate-600">
                    الآلي: {scannedResult.autoScore}/{scannedResult.autoMaxScore}
                    {scannedResult.essayMaxScore > 0
                      ? ` · التعبير: ${scannedResult.essayScore}/${scannedResult.essayMaxScore}`
                      : ""}{" "}
                    · {scannedResult.percentage}%
                  </div>
                </div>
              </div>

              {/* Confirm Student, Committee & Manual Essay Score (NO Seat Number) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    اسم الطالب
                  </label>
                  <input
                    type="text"
                    value={studentNameInput}
                    onChange={(e) => setStudentNameInput(e.target.value)}
                    placeholder="تأكيد اسم الطالب..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    اسم اللجنة
                  </label>
                  <input
                    type="text"
                    value={committeeInput}
                    onChange={(e) => setCommitteeInput(e.target.value)}
                    placeholder="اسم اللجنة..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                {scannedResult.essayMaxScore > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      درجة التعبير (خلف الورقة / {scannedResult.essayMaxScore})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={scannedResult.essayMaxScore}
                      step={0.5}
                      value={scannedResult.essayScore}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.min(
                            scannedResult.essayMaxScore,
                            Number(e.target.value) || 0
                          )
                        );
                        const nextTotal = scannedResult.autoScore + val;
                        const nextPct =
                          scannedResult.totalMaxScore > 0
                            ? Math.round(
                                (nextTotal / scannedResult.totalMaxScore) * 1000
                              ) / 10
                            : 0;
                        setScannedResult({
                          ...scannedResult,
                          essayScore: val,
                          totalScore: nextTotal,
                          percentage: nextPct,
                        });
                        setSavedNotice(false);
                      }}
                      className="w-full rounded-md border border-emerald-600 bg-emerald-50/40 px-3 py-2 text-sm font-mono-num font-bold text-slate-900 focus:border-emerald-700 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Summary Strip */}
              <div className="grid grid-cols-4 gap-2 text-center border border-slate-200 rounded-md p-3 bg-slate-50">
                <div>
                  <div className="text-xs text-slate-500">صحيح</div>
                  <div className="text-base font-bold font-mono-num text-emerald-700">
                    {scannedResult.correctCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">خطأ</div>
                  <div className="text-base font-bold font-mono-num text-red-700">
                    {scannedResult.wrongCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">فارغ</div>
                  <div className="text-base font-bold font-mono-num text-slate-700">
                    {scannedResult.blankCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">مزدوج (ملغى)</div>
                  <div className="text-base font-bold font-mono-num text-amber-700">
                    {scannedResult.multipleCount}
                  </div>
                </div>
              </div>

              {/* Save Action */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleSaveToDashboard}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savedNotice ? "تم الحفظ في لوحة النتائج" : "حفظ النتيجة في لوحة الدرجات"}
                </button>
                {savedNotice && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    مسجل بنجاح
                  </span>
                )}
              </div>

              {/* Annotated Rectified Image */}
              {scannedResult.annotatedImageUrl && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-semibold">
                      نموذج المطابقة البصرية المصحّح (أخضر: صح · أحمر: خطأ · متقطع: الصواب)
                    </span>
                  </div>
                  <div className="border border-slate-200 rounded-md overflow-hidden bg-white max-h-[420px] overflow-y-auto">
                    <img
                      src={scannedResult.annotatedImageUrl}
                      alt="الورقة المصححة"
                      className="w-full h-auto block"
                    />
                  </div>
                </div>
              )}

              {/* Compact Question-by-Question Table */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">
                  تفصيل إجابات الفقرات ({scannedResult.questions.length} فقرة)
                </h4>
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">س</th>
                        <th className="py-2 px-3">إجابة الطالب</th>
                        <th className="py-2 px-3">الصحيحة</th>
                        <th className="py-2 px-3">الحالة</th>
                        <th className="py-2 px-3 text-left">الدرجة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scannedResult.questions.map((q) => {
                        const fmt = (val: number | null) => {
                          if (val === null) return "فارغ";
                          if (val === -1) return "مزدوج";
                          if (q.type === "tf") return val === 1 ? "ص" : "خ";
                          return String(val);
                        };
                        return (
                          <tr key={q.num} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-mono-num font-semibold">
                              {q.num}
                            </td>
                            <td className="py-1.5 px-3 font-mono-num">
                              {fmt(q.marked)}
                            </td>
                            <td className="py-1.5 px-3 font-mono-num font-semibold text-slate-800">
                              {fmt(q.correctAnswer)}
                            </td>
                            <td className="py-1.5 px-3">
                              {q.status === "correct" && (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> صحيح
                                </span>
                              )}
                              {q.status === "wrong" && (
                                <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                                  <XCircle className="w-3.5 h-3.5" /> خطأ
                                </span>
                              )}
                              {(q.status === "blank" || q.status === "multiple") && (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                  <AlertTriangle className="w-3.5 h-3.5" />{" "}
                                  {q.status === "blank" ? "متروك" : "مزدوج"}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-3 text-left font-mono-num">
                              {q.earnedPoints} / {q.maxPoints}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="py-20 px-6 text-center space-y-3">
              <SlidersHorizontal className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">
                لم يتم مسح أي ورقة بعد
              </p>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                عند التقاط ورقة الطالب أو رفعها، سيقوم الماسح بقراءة الباركود آلياً وتصحيح كل الفقرات وإظهار الدرجة المستحقة هنا فوراً.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
