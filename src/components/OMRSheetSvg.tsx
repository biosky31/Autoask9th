import React, { useEffect, useId, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { ExamModel } from "../types/omr";
import {
  encodeQRPayload,
  FIDUCIAL_CENTERS,
  FIDUCIAL_SIZE,
  generateBubbleLayout,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from "../utils/omrTemplate";

interface OMRSheetSvgProps {
  exam: ExamModel;
  studentName: string;
  committeeName: string;
  showAnswerKey?: boolean;
  className?: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export const OMRSheetSvg: React.FC<OMRSheetSvgProps> = ({
  exam,
  studentName,
  committeeName,
  showAnswerKey = false,
  className = "",
  svgRef,
}) => {
  const uid = useId().replace(/:/g, "");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const qrPayload = useMemo(
    () =>
      encodeQRPayload({
        modelCode: exam.modelCode,
        examId: exam.id,
        committeeName,
        studentName,
      }),
    [exam.modelCode, exam.id, committeeName, studentName]
  );

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrPayload, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [qrPayload]);

  const bubbles = useMemo(
    () =>
      generateBubbleLayout(
        exam.tfCount,
        exam.mcqCount,
        exam.essayPoints > 0
      ),
    [exam.tfCount, exam.mcqCount, exam.essayPoints]
  );

  const answerKeyMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!showAnswerKey) return map;
    exam.tfQuestions.forEach((q) => map.set(q.num, q.answer));
    exam.mcqQuestions.forEach((q) => map.set(q.num, q.answer));
    return map;
  }, [exam, showAnswerKey]);

  // Deterministic visual 1D barcode bars derived from modelCode + committee
  const barcodeBars = useMemo(() => {
    const seed = `${exam.modelCode}|${committeeName}|${studentName}`;
    const bars: { x: number; w: number }[] = [];
    let cursor = 46;
    for (let i = 0; i < seed.length && cursor < 174; i++) {
      const code = seed.charCodeAt(i);
      const w1 = (code % 3) + 1.2;
      const gap = ((code >> 2) % 2) + 1.5;
      const w2 = ((code >> 4) % 2) + 1;
      bars.push({ x: cursor, w: w1 });
      cursor += w1 + gap;
      if (cursor + w2 < 176) {
        bars.push({ x: cursor, w: w2 });
        cursor += w2 + 1.6;
      }
    }
    // Start & end guard bars
    bars.unshift({ x: 42, w: 2 });
    bars.push({ x: 178, w: 2 });
    return bars;
  }, [exam.modelCode, committeeName, studentName]);

  const rowY = (idx: number) => 364 + idx * 42;
  const maxTf = Math.min(exam.tfCount, 16);
  const maxMcq = Math.min(exam.mcqCount, 30);
  const halfFid = FIDUCIAL_SIZE / 2;

  const displayName = studentName.trim()
    ? studentName.trim()
    : "..........................................................................";
  const nameFontSize =
    displayName.length > 36 ? 13 : displayName.length > 26 ? 14.5 : 16;
  const displayCommittee = committeeName.trim()
    ? committeeName.trim()
    : ".....................................................";
  const committeeFontSize =
    displayCommittee.length > 36 ? 13 : displayCommittee.length > 26 ? 14 : 15.5;
  const modelFontSize = exam.modelCode.length > 7 ? 15.5 : 20;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      direction="rtl"
      className={`bg-white select-none ${className}`}
      style={{ direction: "rtl" }}
    >
      <defs>
        <clipPath id={`omr-clip-student-${uid}`}>
          <rect x={374} y={110} width={376} height={54} />
        </clipPath>
        <clipPath id={`omr-clip-committee-${uid}`}>
          <rect x={374} y={172} width={376} height={60} />
        </clipPath>
        <clipPath id={`omr-clip-model-${uid}`}>
          <rect x={202} y={110} width={152} height={54} />
        </clipPath>
        <clipPath id={`omr-clip-totals-${uid}`}>
          <rect x={202} y={172} width={152} height={60} />
        </clipPath>
        <clipPath id={`omr-clip-header-left-${uid}`}>
          <rect x={206} y={36} width={220} height={64} />
        </clipPath>
        <clipPath id={`omr-clip-header-right-${uid}`}>
          <rect x={420} y={36} width={280} height={64} />
        </clipPath>
      </defs>
      {/* Clean Paper Background */}
      <rect x={0} y={0} width={SHEET_WIDTH} height={SHEET_HEIGHT} fill="#ffffff" />

      {/* Outer Subtle Framing */}
      <rect
        x={18}
        y={18}
        width={SHEET_WIDTH - 36}
        height={SHEET_HEIGHT - 36}
        fill="none"
        stroke="#0f172a"
        strokeWidth={1.5}
        rx={4}
      />

      {/* HEADER SECTION (y: 26..248) */}
      <rect
        x={28}
        y={28}
        width={SHEET_WIDTH - 56}
        height={216}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={1.5}
        rx={3}
      />

      {/* Top-Left: QR Code & Visual Barcode Tag (x: 38..186) */}
      <rect
        x={38}
        y={36}
        width={148}
        height={196}
        fill="#ffffff"
        stroke="#cbd5e1"
        strokeWidth={1}
        rx={3}
      />
      {qrDataUrl && (
        <image
          href={qrDataUrl}
          x={42}
          y={40}
          width={140}
          height={140}
          preserveAspectRatio="none"
        />
      )}
      {/* 1D Barcode Strip underneath QR */}
      <g>
        {barcodeBars.map((b, idx) => (
          <rect
            key={idx}
            x={b.x}
            y={188}
            width={b.w}
            height={24}
            fill="#0f172a"
          />
        ))}
        <text
          x={112}
          y={226}
          textAnchor="middle"
          fill="#334155"
          fontSize="10.5"
          fontFamily="IBM Plex Mono, monospace"
          fontWeight="600"
        >
          {exam.modelCode} · OMR-QR
        </text>
      </g>

      {/* Top-Right & Center: School Crest & Teacher Branding */}
      <rect
        x={198}
        y={36}
        width={558}
        height={64}
        fill="#0f172a"
        rx={3}
      />
      {/* Emblem Icon */}
      <g transform="translate(706, 46)">
        <circle cx={22} cy={22} r={20} fill="#ffffff" fillOpacity={0.12} stroke="#ffffff" strokeWidth={1.2} />
        <path
          d="M22 10 L32 16 L22 22 L12 16 Z M14 19 L14 28 C14 31 30 31 30 28 L30 19"
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text
        x={692}
        y={64}
        textAnchor="start"
        direction="rtl"
        clipPath={`url(#omr-clip-header-right-${uid})`}
        fill="#ffffff"
        fontSize="21"
        fontWeight="700"
        fontFamily="Cairo, IBM Plex Sans Arabic, sans-serif"
      >
        مدارس إشراق اليمن
      </text>
      <text
        x={692}
        y={88}
        textAnchor="start"
        direction="rtl"
        clipPath={`url(#omr-clip-header-right-${uid})`}
        fill="#cbd5e1"
        fontSize="13"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        إشراف: {exam.teacher || "الأستاذ إبراهيم"} — ورقة التظليل الإلكترونية
      </text>

      <text
        x={212}
        y={64}
        textAnchor="end"
        direction="rtl"
        clipPath={`url(#omr-clip-header-left-${uid})`}
        fill="#ffffff"
        fontSize="13"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        {exam.subject}
      </text>
      <text
        x={212}
        y={85}
        textAnchor="end"
        direction="rtl"
        clipPath={`url(#omr-clip-header-left-${uid})`}
        fill="#94a3b8"
        fontSize="11.5"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        {exam.grade}
      </text>

      {/* Student Metadata Grid (NO Seat Number / دون رقم الجلوس) */}
      {/* Row 1: Student Name + Model Number */}
      <rect x={368} y={110} width={388} height={54} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} rx={2} />
      <text
        x={744}
        y={129}
        textAnchor="start"
        direction="rtl"
        fill="#475569"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        اسم الطالب الثلاثي / الرباعي:
      </text>
      <text
        x={744}
        y={153}
        textAnchor="start"
        direction="rtl"
        clipPath={`url(#omr-clip-student-${uid})`}
        fill="#0f172a"
        fontSize={nameFontSize}
        fontWeight="700"
        fontFamily="Cairo, IBM Plex Sans Arabic, sans-serif"
      >
        {displayName}
      </text>

      <rect x={198} y={110} width={160} height={54} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} rx={2} />
      <text
        x={348}
        y={129}
        textAnchor="start"
        direction="rtl"
        fill="#475569"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        رقم النموذج:
      </text>
      <text
        x={278}
        y={154}
        textAnchor="middle"
        direction="rtl"
        clipPath={`url(#omr-clip-model-${uid})`}
        fill="#0f172a"
        fontSize={modelFontSize}
        fontWeight="700"
        fontFamily="IBM Plex Mono, Cairo, monospace"
      >
        {exam.modelCode}
      </text>

      {/* Row 2: Committee Name + Auto Questions Summary (NO Seat Number) */}
      <rect x={368} y={172} width={388} height={60} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} rx={2} />
      <text
        x={744}
        y={192}
        textAnchor="start"
        direction="rtl"
        fill="#475569"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        اسم اللجنة:
      </text>
      <text
        x={744}
        y={218}
        textAnchor="start"
        direction="rtl"
        clipPath={`url(#omr-clip-committee-${uid})`}
        fill="#0f172a"
        fontSize={committeeFontSize}
        fontWeight="700"
        fontFamily="Cairo, IBM Plex Sans Arabic, sans-serif"
      >
        {displayCommittee}
      </text>

      <rect x={198} y={172} width={160} height={60} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} rx={2} />
      <text
        x={348}
        y={192}
        textAnchor="start"
        direction="rtl"
        fill="#475569"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        إجمالي الأسئلة والدرجة:
      </text>
      <text
        x={278}
        y={217}
        textAnchor="middle"
        direction="rtl"
        clipPath={`url(#omr-clip-totals-${uid})`}
        fill="#0f172a"
        fontSize="13"
        fontWeight="700"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        {exam.tfCount + exam.mcqCount} فقرة ({exam.tfCount * exam.tfPoints + exam.mcqCount * exam.mcqPoints} درجة)
      </text>

      {/* 4 CORNER FIDUCIAL MARKERS (Clear quiet zone around each) */}
      {Object.entries(FIDUCIAL_CENTERS).map(([key, pt]) => (
        <g key={key}>
          <rect
            x={pt.x - halfFid - 6}
            y={pt.y - halfFid - 6}
            width={FIDUCIAL_SIZE + 12}
            height={FIDUCIAL_SIZE + 12}
            fill="#ffffff"
          />
          <rect
            x={pt.x - halfFid}
            y={pt.y - halfFid}
            width={FIDUCIAL_SIZE}
            height={FIDUCIAL_SIZE}
            fill="#000000"
          />
        </g>
      ))}

      {/* Subtle corner alignment guide lines inside fiducials (away from fiducial squares) */}
      <line x1={90} y1={282} x2={704} y2={282} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={90} y1={1028} x2={704} y2={1028} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 4" />

      {/* SECTION TITLES */}
      <rect x={432} y={294} width={286} height={24} fill="#f1f5f9" rx={3} />
      <text
        x={575}
        y={310}
        textAnchor="middle"
        fill="#0f172a"
        fontSize="12"
        fontWeight="700"
        fontFamily="Cairo, sans-serif"
      >
        أولاً: أسئلة الصواب والخطأ (ص / خ)
      </text>

      <rect x={70} y={294} width={342} height={24} fill="#f1f5f9" rx={3} />
      <text
        x={241}
        y={310}
        textAnchor="middle"
        fill="#0f172a"
        fontSize="12"
        fontWeight="700"
        fontFamily="Cairo, sans-serif"
      >
        ثانياً: أسئلة الاختيار من متعدد (1 - 2 - 3 - 4)
      </text>

      {/* COLUMN HEADERS */}
      {/* Col 1 Header (1..8) */}
      <g fontFamily="IBM Plex Sans Arabic, sans-serif" fontSize="12" fontWeight="700" fill="#334155">
        <text x={696} y={336} textAnchor="middle">س</text>
        <text x={646} y={336} textAnchor="middle">ص</text>
        <text x={596} y={336} textAnchor="middle">خ</text>
        <line x1={576} y1={343} x2={714} y2={343} stroke="#94a3b8" strokeWidth={1} />
      </g>

      {/* Col 2 Header (9..16) */}
      {maxTf > 8 && (
        <g fontFamily="IBM Plex Sans Arabic, sans-serif" fontSize="12" fontWeight="700" fill="#334155">
          <text x={544} y={336} textAnchor="middle">س</text>
          <text x={494} y={336} textAnchor="middle">ص</text>
          <text x={444} y={336} textAnchor="middle">خ</text>
          <line x1={426} y1={343} x2={562} y2={343} stroke="#94a3b8" strokeWidth={1} />
        </g>
      )}

      {/* Col 3 Header (17..31) */}
      <g fontFamily="IBM Plex Sans Arabic, sans-serif" fontSize="12" fontWeight="700" fill="#334155">
        <text x={394} y={336} textAnchor="middle">س</text>
        <text x={356} y={336} textAnchor="middle">1</text>
        <text x={322} y={336} textAnchor="middle">2</text>
        <text x={288} y={336} textAnchor="middle">3</text>
        <text x={254} y={336} textAnchor="middle">4</text>
        <line x1={238} y1={343} x2={410} y2={343} stroke="#94a3b8" strokeWidth={1} />
      </g>

      {/* Col 4 Header (32..46) */}
      {maxMcq > 15 && (
        <g fontFamily="IBM Plex Sans Arabic, sans-serif" fontSize="12" fontWeight="700" fill="#334155">
          <text x={218} y={336} textAnchor="middle">س</text>
          <text x={180} y={336} textAnchor="middle">1</text>
          <text x={146} y={336} textAnchor="middle">2</text>
          <text x={112} y={336} textAnchor="middle">3</text>
          <text x={78} y={336} textAnchor="middle">4</text>
          <line x1={62} y1={343} x2={232} y2={343} stroke="#94a3b8" strokeWidth={1} />
        </g>
      )}

      {/* Subtle Alternating Row Stripes for Human Tracking */}
      {Array.from({ length: Math.min(maxMcq, 15) }).map((_, idx) => {
        const y = rowY(idx);
        return idx % 2 === 1 ? (
          <rect
            key={`stripe-${idx}`}
            x={64}
            y={y - 17}
            width={346}
            height={34}
            fill="#f8fafc"
            rx={4}
          />
        ) : null;
      })}
      {Array.from({ length: Math.min(maxTf, 8) }).map((_, idx) => {
        const y = rowY(idx);
        return idx % 2 === 1 ? (
          <rect
            key={`tfstripe-${idx}`}
            x={426}
            y={y - 17}
            width={288}
            height={34}
            fill="#f8fafc"
            rx={4}
          />
        ) : null;
      })}

      {/* QUESTION NUMBERS */}
      {Array.from({ length: maxTf }).map((_, i) => {
        const qNum = i + 1;
        const isCol1 = i < 8;
        const y = rowY(isCol1 ? i : i - 8);
        const x = isCol1 ? 696 : 544;
        return (
          <text
            key={`qnum-tf-${qNum}`}
            x={x}
            y={y + 4}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="13"
            fontWeight="700"
            fontFamily="IBM Plex Mono, monospace"
          >
            {qNum}
          </text>
        );
      })}

      {Array.from({ length: maxMcq }).map((_, i) => {
        const qNum = maxTf + i + 1;
        const isCol3 = i < 15;
        const y = rowY(isCol3 ? i : i - 15);
        const x = isCol3 ? 394 : 218;
        return (
          <text
            key={`qnum-mcq-${qNum}`}
            x={x}
            y={y + 4}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="13"
            fontWeight="700"
            fontFamily="IBM Plex Mono, monospace"
          >
            {qNum}
          </text>
        );
      })}

      {/* ESSAY BOX (Below T/F columns) */}
      {exam.essayPoints > 0 && (
        <g>
          <rect
            x={434}
            y={704}
            width={280}
            height={98}
            fill="#ffffff"
            stroke="#94a3b8"
            strokeWidth={1.2}
            rx={4}
          />
          <rect x={434} y={704} width={280} height={26} fill="#f1f5f9" rx={3} />
          <text
            x={574}
            y={721}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="12"
            fontWeight="700"
            fontFamily="Cairo, sans-serif"
          >
            خاص بدرجة التعبير (للمصحح فقط - سؤال {maxTf + maxMcq + 1})
          </text>
          <text
            x={692}
            y={772}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="13"
            fontWeight="700"
            fontFamily="IBM Plex Mono, monospace"
          >
            {maxTf + maxMcq + 1}
          </text>
          <text
            x={468}
            y={772}
            textAnchor="middle"
            fill="#64748b"
            fontSize="11"
            fontFamily="IBM Plex Sans Arabic, sans-serif"
          >
            درجة
          </text>
        </g>
      )}

      {/* SHADING INSTRUCTIONS BOX (Below Essay Box, matching Yemeni PDF OMR sheet) */}
      <g>
        <rect
          x={434}
          y={822}
          width={280}
          height={176}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth={1.2}
          rx={4}
        />
        <text
          x={702}
          y={844}
          textAnchor="start"
          direction="rtl"
          fill="#0f172a"
          fontSize="11.5"
          fontWeight="700"
          fontFamily="Cairo, sans-serif"
        >
          تعليمات التظليل المعتمدة في الماسح الضوئي:
        </text>
        <text
          x={702}
          y={866}
          textAnchor="start"
          direction="rtl"
          fill="#334155"
          fontSize="10"
          fontFamily="IBM Plex Sans Arabic, sans-serif"
        >
          1. ظلّل الدائرة بالكامل بقلم جاف أزرق أو أسود غامق.
        </text>
        <text
          x={702}
          y={885}
          textAnchor="start"
          direction="rtl"
          fill="#334155"
          fontSize="10"
          fontFamily="IBM Plex Sans Arabic, sans-serif"
        >
          2. يمنع تظليل أكثر من دائرة للسؤال الواحد (تُلغى الدرجة).
        </text>
        <text
          x={702}
          y={904}
          textAnchor="start"
          direction="rtl"
          fill="#334155"
          fontSize="10"
          fontFamily="IBM Plex Sans Arabic, sans-serif"
        >
          3. حافظ على نظافة المربعات السوداء الأربعة ورمز الباركود.
        </text>

        {/* Visual Valid vs Invalid Examples */}
        <g transform="translate(450, 924)">
          <rect x={0} y={0} width={248} height={60} fill="#ffffff" stroke="#e2e8f0" rx={3} />
          {/* Valid */}
          <text x={212} y={18} textAnchor="middle" fill="#15803d" fontSize="10.5" fontWeight="700" fontFamily="IBM Plex Sans Arabic, sans-serif">
            التظليل المعتمد
          </text>
          <circle cx={212} cy={39} r={11} fill="#0f172a" stroke="#0f172a" strokeWidth={1.5} />

          <line x1={174} y1={8} x2={174} y2={52} stroke="#e2e8f0" strokeWidth={1} />

          {/* Invalid */}
          <text x={88} y={18} textAnchor="middle" fill="#b91c1c" fontSize="10.5" fontWeight="700" fontFamily="IBM Plex Sans Arabic, sans-serif">
            أشكال غير معتمدة
          </text>
          {/* X */}
          <circle cx={142} cy={39} r={10} fill="none" stroke="#334155" strokeWidth={1.2} />
          <path d="M136 33 L148 45 M148 33 L136 45" stroke="#0f172a" strokeWidth={1.8} />
          {/* Check */}
          <circle cx={106} cy={39} r={10} fill="none" stroke="#334155" strokeWidth={1.2} />
          <path d="M100 39 L105 44 L113 33" fill="none" stroke="#0f172a" strokeWidth={1.8} />
          {/* Half */}
          <circle cx={70} cy={39} r={10} fill="none" stroke="#334155" strokeWidth={1.2} />
          <path d="M70 29 A10 10 0 0 1 70 49 Z" fill="#0f172a" />
          {/* Dot */}
          <circle cx={34} cy={39} r={10} fill="none" stroke="#334155" strokeWidth={1.2} />
          <circle cx={34} cy={39} r={3.5} fill="#0f172a" />
        </g>
      </g>

      {/* ALL BUBBLES (Exact shared coordinates from omrTemplate.ts) */}
      {bubbles.map((b) => {
        const isKeyFilled =
          showAnswerKey &&
          b.type !== "essay" &&
          answerKeyMap.get(b.questionNum) === b.optionValue;

        return (
          <g key={`b-${b.questionNum}-${b.optionValue}`}>
            <circle
              cx={b.x}
              cy={b.y}
              r={b.r}
              fill={isKeyFilled ? "#0f172a" : "#ffffff"}
              stroke="#0f172a"
              strokeWidth={1.6}
            />
            <text
              x={b.x}
              y={b.y + 4}
              textAnchor="middle"
              fill={isKeyFilled ? "#ffffff" : "#334155"}
              fontSize="11.5"
              fontWeight="600"
              fontFamily="IBM Plex Sans Arabic, sans-serif"
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* FOOTER NOTE */}
      <text
        x={SHEET_WIDTH / 2}
        y={1074}
        textAnchor="middle"
        fill="#475569"
        fontSize="11"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        مدارس إشراق اليمن · نظام التصحيح الإلكتروني الذكي · إشراف {exam.teacher || "الأستاذ إبراهيم"} · نموذج {exam.modelCode}
      </text>
    </svg>
  );
};
