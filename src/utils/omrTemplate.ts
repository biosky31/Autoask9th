export interface Point2D {
  x: number;
  y: number;
}

export interface BubbleSpec {
  questionNum: number;
  type: "tf" | "mcq" | "essay";
  optionValue: number; // 1..2 for tf, 1..4 for mcq/essay
  label: string;
  /** Absolute SVG coordinate (794 x 1123 space) */
  x: number;
  y: number;
  r: number;
  /** Normalized coordinate [0..1] inside the 4 fiducial centers */
  u: number;
  v: number;
}

export const SHEET_WIDTH = 794;
export const SHEET_HEIGHT = 1123;

/** 4 corner fiducial anchor squares around the bubble capture zone */
export const FIDUCIAL_SIZE = 24;
export const FIDUCIAL_CENTERS = {
  tl: { x: 54, y: 282 },
  tr: { x: 740, y: 282 },
  br: { x: 740, y: 1028 },
  bl: { x: 54, y: 1028 },
} as const;

export const FIDUCIAL_SPAN_W = FIDUCIAL_CENTERS.tr.x - FIDUCIAL_CENTERS.tl.x; // 686
export const FIDUCIAL_SPAN_H = FIDUCIAL_CENTERS.bl.y - FIDUCIAL_CENTERS.tl.y; // 746

/** Canonical warped canvas size (2x fiducial span for sub-pixel accuracy) */
export const WARPED_WIDTH = 1372; // 686 * 2
export const WARPED_HEIGHT = 1492; // 746 * 2

export function toNormalized(x: number, y: number): { u: number; v: number } {
  return {
    u: (x - FIDUCIAL_CENTERS.tl.x) / FIDUCIAL_SPAN_W,
    v: (y - FIDUCIAL_CENTERS.tl.y) / FIDUCIAL_SPAN_H,
  };
}

export function generateBubbleLayout(
  tfCount = 16,
  mcqCount = 30,
  includeEssay = true
): BubbleSpec[] {
  const bubbles: BubbleSpec[] = [];

  const rowY = (rowIndex: number) => 364 + rowIndex * 42;

  // Section 1: True / False (1..16) in 2 RTL columns (Col 1: 1..8, Col 2: 9..16)
  // Col 1 (Rightmost): x question label at 696, ص at 646, خ at 596
  // Col 2 (Center-Right): x question label at 544, ص at 494, خ at 444
  const maxTf = Math.min(tfCount, 16);
  for (let i = 0; i < maxTf; i++) {
    const qNum = i + 1;
    const isCol1 = i < 8;
    const rowIdx = isCol1 ? i : i - 8;
    const y = rowY(rowIdx);
    const xTrue = isCol1 ? 646 : 494;
    const xFalse = isCol1 ? 596 : 444;
    const r = 12.5;

    const normT = toNormalized(xTrue, y);
    bubbles.push({
      questionNum: qNum,
      type: "tf",
      optionValue: 1,
      label: "ص",
      x: xTrue,
      y,
      r,
      ...normT,
    });

    const normF = toNormalized(xFalse, y);
    bubbles.push({
      questionNum: qNum,
      type: "tf",
      optionValue: 2,
      label: "خ",
      x: xFalse,
      y,
      r,
      ...normF,
    });
  }

  // Section 2: MCQ (17..46) in 2 RTL columns (Col 3: 17..31, Col 4: 32..46)
  // Col 3 (Center-Left): x question label at 394, opts 1..4 at 356, 322, 288, 254
  // Col 4 (Far Left): x question label at 218, opts 1..4 at 180, 146, 112, 78
  const maxMcq = Math.min(mcqCount, 30);
  for (let i = 0; i < maxMcq; i++) {
    const qNum = maxTf + i + 1;
    const isCol3 = i < 15;
    const rowIdx = isCol3 ? i : i - 15;
    const y = rowY(rowIdx);
    const optXs = isCol3 ? [356, 322, 288, 254] : [180, 146, 112, 78];
    const r = 12;

    for (let opt = 0; opt < 4; opt++) {
      const x = optXs[opt];
      const norm = toNormalized(x, y);
      bubbles.push({
        questionNum: qNum,
        type: "mcq",
        optionValue: opt + 1,
        label: String(opt + 1),
        x,
        y,
        r,
        ...norm,
      });
    }
  }

  // Section 3: Essay grade bubble row (Q47 or maxTf + maxMcq + 1)
  if (includeEssay) {
    const essayQNum = maxTf + maxMcq + 1;
    const essayY = 768;
    const essayXs = [646, 602, 558, 514];
    for (let opt = 0; opt < 4; opt++) {
      const x = essayXs[opt];
      const norm = toNormalized(x, essayY);
      bubbles.push({
        questionNum: essayQNum,
        type: "essay",
        optionValue: opt + 1,
        label: String(opt + 1),
        x,
        y: essayY,
        r: 12,
        ...norm,
      });
    }
  }

  return bubbles;
}

/** Compact QR payload to keep QR modules large & easy for cameras to decode */
export function encodeQRPayload(data: {
  modelCode: string;
  examId: string;
  committeeName: string;
  studentName: string;
}): string {
  const safe = (v: string) => v.replace(/\|/g, " ").trim();
  return [
    "ISHRAQ1",
    safe(data.modelCode),
    safe(data.examId),
    safe(data.committeeName),
    safe(data.studentName),
  ].join("|");
}

export function decodeQRPayload(raw: string): {
  valid: boolean;
  modelCode?: string;
  examId?: string;
  committeeName?: string;
  studentName?: string;
} {
  if (!raw) return { valid: false };
  const trimmed = raw.trim();
  if (trimmed.startsWith("ISHRAQ1|")) {
    const parts = trimmed.split("|");
    return {
      valid: true,
      modelCode: parts[1] || "",
      examId: parts[2] || "",
      committeeName: parts[3] || "",
      studentName: parts[4] || "",
    };
  }
  try {
    const obj = JSON.parse(trimmed);
    if (obj && (obj.m || obj.modelCode)) {
      return {
        valid: true,
        modelCode: obj.m || obj.modelCode,
        examId: obj.e || obj.examId || "",
        committeeName: obj.c || obj.committeeName || "",
        studentName: obj.n || obj.studentName || "",
      };
    }
  } catch {
    // Fallback: raw string could be a model code directly
  }
  return { valid: false };
}
