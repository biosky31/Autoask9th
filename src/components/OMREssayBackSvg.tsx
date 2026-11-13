import React, { useId } from "react";
import type { ExamModel } from "../types/omr";
import { SHEET_HEIGHT, SHEET_WIDTH } from "../utils/omrTemplate";

interface OMREssayBackSvgProps {
  exam: ExamModel;
  studentName: string;
  committeeName: string;
  className?: string;
}

export const OMREssayBackSvg: React.FC<OMREssayBackSvgProps> = ({
  exam,
  studentName,
  committeeName,
  className = "",
}) => {
  const uid = useId().replace(/:/g, "");
  const essayQuestionNum = exam.tfCount + exam.mcqCount + 1;
  const displayName = studentName.trim()
    ? studentName.trim()
    : "..........................................................................";
  const displayCommittee = committeeName.trim()
    ? committeeName.trim()
    : ".....................................................";

  const lines = Array.from({ length: 20 });

  return (
    <svg
      viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      direction="rtl"
      className={`bg-white select-none ${className}`}
      style={{ direction: "rtl" }}
    >
      <defs>
        <clipPath id={`back-clip-name-${uid}`}>
          <rect x={230} y={96} width={520} height={46} />
        </clipPath>
        <clipPath id={`back-clip-comm-${uid}`}>
          <rect x={230} y={148} width={520} height={46} />
        </clipPath>
      </defs>

      <rect x={0} y={0} width={SHEET_WIDTH} height={SHEET_HEIGHT} fill="#ffffff" />

      <rect
        x={24}
        y={24}
        width={SHEET_WIDTH - 48}
        height={SHEET_HEIGHT - 48}
        fill="none"
        stroke="#0f172a"
        strokeWidth={1.5}
        rx={4}
      />

      {/* Top Banner */}
      <rect x={36} y={36} width={SHEET_WIDTH - 72} height={52} fill="#0f172a" rx={3} />
      <text
        x={742}
        y={60}
        textAnchor="start"
        direction="rtl"
        fill="#ffffff"
        fontSize="17"
        fontWeight="700"
        fontFamily="Cairo, IBM Plex Sans Arabic, sans-serif"
      >
        مدارس إشراق اليمن · ظهر ورقة التظليل (إجابة سؤال التعبير)
      </text>
      <text
        x={742}
        y={79}
        textAnchor="start"
        direction="rtl"
        fill="#cbd5e1"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        إشراف: {exam.teacher || "الأستاذ إبراهيم"} · {exam.subject} ({exam.grade})
      </text>
      <text
        x={52}
        y={67}
        textAnchor="end"
        direction="rtl"
        fill="#ffffff"
        fontSize="14"
        fontWeight="700"
        fontFamily="IBM Plex Mono, Cairo, monospace"
      >
        نموذج {exam.modelCode}
      </text>

      {/* Metadata Row: Student + Essay Score Box */}
      <rect x={224} y={98} width={534} height={44} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} rx={2} />
      <text
        x={746}
        y={116}
        textAnchor="start"
        direction="rtl"
        fill="#475569"
        fontSize="11"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        اسم الطالب:
      </text>
      <text
        x={746}
        y={136}
        textAnchor="start"
        direction="rtl"
        clipPath={`url(#back-clip-name-${uid})`}
        fill="#0f172a"
        fontSize="14.5"
        fontWeight="700"
        fontFamily="Cairo, IBM Plex Sans Arabic, sans-serif"
      >
        {displayName}
      </text>

      <rect x={224} y={148} width={534} height={44} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} rx={2} />
      <text
        x={746}
        y={166}
        textAnchor="start"
        direction="rtl"
        fill="#475569"
        fontSize="11"
        fontWeight="600"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        اسم اللجنة:
      </text>
      <text
        x={746}
        y={186}
        textAnchor="start"
        direction="rtl"
        clipPath={`url(#back-clip-comm-${uid})`}
        fill="#0f172a"
        fontSize="14"
        fontWeight="700"
        fontFamily="Cairo, IBM Plex Sans Arabic, sans-serif"
      >
        {displayCommittee}
      </text>

      {/* Manual Essay Score Box */}
      <rect x={36} y={98} width={178} height={94} fill="#f8fafc" stroke="#0f172a" strokeWidth={1.2} rx={3} />
      <text
        x={125}
        y={119}
        textAnchor="middle"
        direction="rtl"
        fill="#0f172a"
        fontSize="12"
        fontWeight="700"
        fontFamily="Cairo, sans-serif"
      >
        درجة التعبير (سؤال {essayQuestionNum})
      </text>
      <text
        x={125}
        y={152}
        textAnchor="middle"
        direction="rtl"
        fill="#0f172a"
        fontSize="16"
        fontWeight="700"
        fontFamily="IBM Plex Mono, Cairo, monospace"
      >
        ........ / {exam.essayPoints}
      </text>
      <text
        x={125}
        y={179}
        textAnchor="middle"
        direction="rtl"
        fill="#475569"
        fontSize="10.5"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        توقيع المصحح: ................
      </text>

      {/* Writing Section Header */}
      <rect x={36} y={206} width={SHEET_WIDTH - 72} height={28} fill="#f1f5f9" stroke="#cbd5e1" rx={3} />
      <text
        x={746}
        y={224}
        textAnchor="start"
        direction="rtl"
        fill="#0f172a"
        fontSize="12"
        fontWeight="700"
        fontFamily="Cairo, sans-serif"
      >
        مساحة كتابة إجابة سؤال التعبير (سؤال {essayQuestionNum} — تُحتسب يدوياً من {exam.essayPoints} درجات لتضاف إلى {exam.tfCount * exam.tfPoints + exam.mcqCount * exam.mcqPoints} درجة آلية)
      </text>

      {/* 20 Ruled Lines */}
      {lines.map((_, idx) => {
        const y = 278 + idx * 38;
        return (
          <line
            key={idx}
            x1={46}
            y1={y}
            x2={SHEET_WIDTH - 46}
            y2={y}
            stroke="#cbd5e1"
            strokeWidth={1.1}
          />
        );
      })}

      {/* Footer */}
      <text
        x={SHEET_WIDTH / 2}
        y={1078}
        textAnchor="middle"
        direction="rtl"
        fill="#64748b"
        fontSize="11"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        مدارس إشراق اليمن · ظهر ورقة التظليل · إشراف {exam.teacher || "الأستاذ إبراهيم"} · المجموع الكلي للاختبار {exam.tfCount * exam.tfPoints + exam.mcqCount * exam.mcqPoints + exam.essayPoints} درجة
      </text>
    </svg>
  );
};
