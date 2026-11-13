import jsQR from "jsqr";
import QRCode from "qrcode";
import type {
  CalibrationSettings,
  ExamModel,
  GradedQuestionResult,
  ScannedResult,
} from "../types/omr";
import {
  decodeQRPayload,
  encodeQRPayload,
  FIDUCIAL_CENTERS,
  FIDUCIAL_SIZE,
  generateBubbleLayout,
  Point2D,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  WARPED_HEIGHT,
  WARPED_WIDTH,
} from "./omrTemplate";

export interface QRDetectionResult {
  raw: string;
  parsed: ReturnType<typeof decodeQRPayload>;
  location: {
    topLeftCorner: Point2D;
    topRightCorner: Point2D;
    bottomRightCorner: Point2D;
    bottomLeftCorner: Point2D;
  };
}

export interface CornerQuad {
  tl: Point2D;
  tr: Point2D;
  br: Point2D;
  bl: Point2D;
  confidence: "high" | "medium" | "estimated";
}

export function decodeQRFromCanvas(
  canvas: HTMLCanvasElement
): QRDetectionResult | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);

  let code = jsQR(imgData.data, w, h, { inversionAttempts: "dontInvert" });

  // Second pass: boost contrast on downscaled frame if needed
  if (!code && (w > 1000 || h > 1000)) {
    const scale = 960 / Math.max(w, h);
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    if (tctx) {
      tctx.drawImage(canvas, 0, 0, sw, sh);
      const smallData = tctx.getImageData(0, 0, sw, sh);
      const smallCode = jsQR(smallData.data, sw, sh, {
        inversionAttempts: "attemptBoth",
      });
      if (smallCode) {
        const inv = 1 / scale;
        return {
          raw: smallCode.data,
          parsed: decodeQRPayload(smallCode.data),
          location: {
            topLeftCorner: {
              x: smallCode.location.topLeftCorner.x * inv,
              y: smallCode.location.topLeftCorner.y * inv,
            },
            topRightCorner: {
              x: smallCode.location.topRightCorner.x * inv,
              y: smallCode.location.topRightCorner.y * inv,
            },
            bottomRightCorner: {
              x: smallCode.location.bottomRightCorner.x * inv,
              y: smallCode.location.bottomRightCorner.y * inv,
            },
            bottomLeftCorner: {
              x: smallCode.location.bottomLeftCorner.x * inv,
              y: smallCode.location.bottomLeftCorner.y * inv,
            },
          },
        };
      }
    }
  }

  if (!code) return null;
  return {
    raw: code.data,
    parsed: decodeQRPayload(code.data),
    location: {
      topLeftCorner: code.location.topLeftCorner,
      topRightCorner: code.location.topRightCorner,
      bottomRightCorner: code.location.bottomRightCorner,
      bottomLeftCorner: code.location.bottomLeftCorner,
    },
  };
}

interface BlobCandidate {
  cx: number;
  cy: number;
  area: number;
  w: number;
  h: number;
  fillRatio: number;
}

function findSquareCandidates(
  canvas: HTMLCanvasElement
): { blobs: BlobCandidate[]; scale: number } {
  const maxWorkW = 720;
  const scale = canvas.width > maxWorkW ? maxWorkW / canvas.width : 1;
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) return { blobs: [], scale };
  wctx.drawImage(canvas, 0, 0, w, h);

  const rgba = wctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    gray[p] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }

  // Integral image for fast local adaptive thresholding
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const rowOff = y * w;
    const intRow = (y + 1) * (w + 1);
    const prevIntRow = y * (w + 1);
    for (let x = 0; x < w; x++) {
      rowSum += gray[rowOff + x];
      integral[intRow + x + 1] = integral[prevIntRow + x + 1] + rowSum;
    }
  }

  const win = Math.max(12, Math.round(w * 0.04));
  const binary = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - win);
    const y1 = Math.min(h - 1, y + win);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - win);
      const x1 = Math.min(w - 1, x + win);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const localMean = sum / count;
      const g = gray[y * w + x];
      if (g < localMean * 0.68 && g < 155) {
        binary[y * w + x] = 1;
      }
    }
  }

  // Connected components via BFS
  const visited = new Uint8Array(w * h);
  const blobs: BlobCandidate[] = [];
  const minArea = Math.max(36, Math.round(w * h * 0.00018));
  const maxArea = Math.round(w * h * 0.012);
  const queue = new Int32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    if (binary[i] === 0 || visited[i]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;

    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % w;
      const y = (idx / w) | 0;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && binary[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        queue[tail++] = idx - 1;
      }
      if (x + 1 < w && binary[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && binary[idx - w] && !visited[idx - w]) {
        visited[idx - w] = 1;
        queue[tail++] = idx - w;
      }
      if (y + 1 < h && binary[idx + w] && !visited[idx + w]) {
        visited[idx + w] = 1;
        queue[tail++] = idx + w;
      }
    }

    if (area < minArea || area > maxArea) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const aspect = bw / bh;
    if (aspect < 0.62 || aspect > 1.6) continue;
    const fillRatio = area / (bw * bh);
    if (fillRatio < 0.68) continue;

    // Quiet-zone check around perimeter
    const pad = Math.max(3, Math.round(Math.max(bw, bh) * 0.25));
    let borderBright = 0;
    let borderTotal = 0;
    for (
      let bx = Math.max(0, minX - pad);
      bx <= Math.min(w - 1, maxX + pad);
      bx += 2
    ) {
      if (minY - pad >= 0) {
        borderTotal++;
        if (gray[(minY - pad) * w + bx] > 140) borderBright++;
      }
      if (maxY + pad < h) {
        borderTotal++;
        if (gray[(maxY + pad) * w + bx] > 140) borderBright++;
      }
    }
    if (borderTotal > 0 && borderBright / borderTotal < 0.6) continue;

    blobs.push({
      cx: sumX / area / scale,
      cy: sumY / area / scale,
      area: area / (scale * scale),
      w: bw / scale,
      h: bh / scale,
      fillRatio,
    });
  }

  return { blobs, scale };
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Uses QR location if available to project exact Sheet->Image affine map and snap
 * to the 4 solid black corner fiducial markers. Falls back to quadrant search if no QR.
 */
export function detectFiducialCorners(
  canvas: HTMLCanvasElement,
  qr: QRDetectionResult | null
): CornerQuad {
  const w = canvas.width;
  const h = canvas.height;
  const { blobs } = findSquareCandidates(canvas);

  if (qr) {
    // On canonical sheet (794 x 1123), QR is drawn at x: 42..182, y: 40..180 (140x140).
    // Note: jsQR includes quiet-zone trimmed finder corners inside (42..182, 40..180)
    // specifically QR modules sit inside a ~10px padding if generated with margin=1 -> ~126px wide
    // Let's use the exact 4 QR corner points to solve an affine transform from QR-sheet coords to Image coords.
    const qrTopLeftSheet = { x: 47, y: 45 };
    const qrTopRightSheet = { x: 177, y: 45 };
    const qrBottomLeftSheet = { x: 47, y: 175 };

    const src = qr.location;
    const vxX = src.topRightCorner.x - src.topLeftCorner.x;
    const vxY = src.topRightCorner.y - src.topLeftCorner.y;
    const vyX = src.bottomLeftCorner.x - src.topLeftCorner.x;
    const vyY = src.bottomLeftCorner.y - src.topLeftCorner.y;
    const qrSpanSheet = qrTopRightSheet.x - qrTopLeftSheet.x; // 130
    const qrHeightSheet = qrBottomLeftSheet.y - qrTopLeftSheet.y; // 130

    const projectFromQR = (sx: number, sy: number): Point2D => {
      const u = (sx - qrTopLeftSheet.x) / qrSpanSheet;
      const v = (sy - qrTopLeftSheet.y) / qrHeightSheet;
      return {
        x: src.topLeftCorner.x + u * vxX + v * vyX,
        y: src.topLeftCorner.y + u * vxY + v * vyY,
      };
    };

    const predTL = projectFromQR(FIDUCIAL_CENTERS.tl.x, FIDUCIAL_CENTERS.tl.y);
    const predTR = projectFromQR(FIDUCIAL_CENTERS.tr.x, FIDUCIAL_CENTERS.tr.y);
    const predBR = projectFromQR(FIDUCIAL_CENTERS.br.x, FIDUCIAL_CENTERS.br.y);
    const predBL = projectFromQR(FIDUCIAL_CENTERS.bl.x, FIDUCIAL_CENTERS.bl.y);

    const qrWidthPx = Math.hypot(vxX, vxY);
    const searchRadius = Math.max(48, qrWidthPx * 0.65);

    const snap = (pred: Point2D): { pt: Point2D; snapped: boolean } => {
      let best: BlobCandidate | null = null;
      let bestD = searchRadius;
      for (const b of blobs) {
        const d = dist(pred, { x: b.cx, y: b.cy });
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best
        ? { pt: { x: best.cx, y: best.cy }, snapped: true }
        : { pt: pred, snapped: false };
    };

    const sTL = snap(predTL);
    const sTR = snap(predTR);
    const sBR = snap(predBR);
    const sBL = snap(predBL);
    const snappedCount =
      Number(sTL.snapped) +
      Number(sTR.snapped) +
      Number(sBR.snapped) +
      Number(sBL.snapped);

    return {
      tl: sTL.pt,
      tr: sTR.pt,
      br: sBR.pt,
      bl: sBL.pt,
      confidence: snappedCount >= 3 ? "high" : snappedCount >= 1 ? "medium" : "estimated",
    };
  }

  // Fallback without QR: search 4 outer corner zones of the image (skipping top 18% where QR sits if full sheet)
  const expectedTL = { x: w * 0.08, y: h * 0.25 };
  const expectedTR = { x: w * 0.92, y: h * 0.25 };
  const expectedBR = { x: w * 0.92, y: h * 0.92 };
  const expectedBL = { x: w * 0.08, y: h * 0.92 };

  const nearestBlob = (target: Point2D, maxR: number): Point2D | null => {
    let best: BlobCandidate | null = null;
    let bestD = maxR;
    for (const b of blobs) {
      const d = dist(target, { x: b.cx, y: b.cy });
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best ? { x: best.cx, y: best.cy } : null;
  };

  const r = Math.min(w, h) * 0.28;
  const tl = nearestBlob(expectedTL, r);
  const tr = nearestBlob(expectedTR, r);
  const br = nearestBlob(expectedBR, r);
  const bl = nearestBlob(expectedBL, r);

  if (tl && tr && br && bl) {
    return { tl, tr, br, bl, confidence: "medium" };
  }

  // Last resort: canonical proportions of full A4 sheet
  return {
    tl: {
      x: (FIDUCIAL_CENTERS.tl.x / SHEET_WIDTH) * w,
      y: (FIDUCIAL_CENTERS.tl.y / SHEET_HEIGHT) * h,
    },
    tr: {
      x: (FIDUCIAL_CENTERS.tr.x / SHEET_WIDTH) * w,
      y: (FIDUCIAL_CENTERS.tr.y / SHEET_HEIGHT) * h,
    },
    br: {
      x: (FIDUCIAL_CENTERS.br.x / SHEET_WIDTH) * w,
      y: (FIDUCIAL_CENTERS.br.y / SHEET_HEIGHT) * h,
    },
    bl: {
      x: (FIDUCIAL_CENTERS.bl.x / SHEET_WIDTH) * w,
      y: (FIDUCIAL_CENTERS.bl.y / SHEET_HEIGHT) * h,
    },
    confidence: "estimated",
  };
}

/**
 * Solves 8x8 linear system for projective homography mapping dst(x,y) -> src(x,y)
 */
function computeHomography(
  dstPts: [Point2D, Point2D, Point2D, Point2D],
  srcPts: [Point2D, Point2D, Point2D, Point2D]
): number[] {
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = dstPts[i].x;
    const y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) {
        maxRow = row;
      }
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];
    [B[col], B[maxRow]] = [B[maxRow], B[col]];

    const pivot = A[col][col] || 1e-12;
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      for (let k = col; k < n; k++) {
        A[row][k] -= factor * A[col][k];
      }
      B[row] -= factor * B[col];
    }
  }

  const h = new Array<number>(9).fill(1);
  for (let row = n - 1; row >= 0; row--) {
    let sum = B[row];
    for (let col = row + 1; col < n; col++) {
      sum -= A[row][col] * h[col];
    }
    h[row] = sum / (A[row][row] || 1e-12);
  }
  return h;
}

export function warpPerspectiveQuad(
  sourceCanvas: HTMLCanvasElement,
  quad: CornerQuad
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = WARPED_WIDTH;
  out.height = WARPED_HEIGHT;

  const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const dctx = out.getContext("2d", { willReadFrequently: true });
  if (!sctx || !dctx) return out;

  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const srcData = sctx.getImageData(0, 0, sw, sh).data;
  const dstImg = dctx.createImageData(WARPED_WIDTH, WARPED_HEIGHT);
  const dstData = dstImg.data;

  const H = computeHomography(
    [
      { x: 0, y: 0 },
      { x: WARPED_WIDTH, y: 0 },
      { x: WARPED_WIDTH, y: WARPED_HEIGHT },
      { x: 0, y: WARPED_HEIGHT },
    ],
    [quad.tl, quad.tr, quad.br, quad.bl]
  );

  const h0 = H[0],
    h1 = H[1],
    h2 = H[2],
    h3 = H[3],
    h4 = H[4],
    h5 = H[5],
    h6 = H[6],
    h7 = H[7];

  for (let y = 0; y < WARPED_HEIGHT; y++) {
    const rowOut = y * WARPED_WIDTH;
    for (let x = 0; x < WARPED_WIDTH; x++) {
      const denom = h6 * x + h7 * y + 1;
      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;

      const idxOut = (rowOut + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        dstData[idxOut] = 255;
        dstData[idxOut + 1] = 255;
        dstData[idxOut + 2] = 255;
        dstData[idxOut + 3] = 255;
        continue;
      }

      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const invFx = 1 - fx;
      const invFy = 1 - fy;

      const p00 = (y0 * sw + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + sw * 4;
      const p11 = p01 + 4;

      const w00 = invFx * invFy;
      const w10 = fx * invFy;
      const w01 = invFx * fy;
      const w11 = fx * fy;

      dstData[idxOut] =
        srcData[p00] * w00 +
        srcData[p10] * w10 +
        srcData[p01] * w01 +
        srcData[p11] * w11;
      dstData[idxOut + 1] =
        srcData[p00 + 1] * w00 +
        srcData[p10 + 1] * w10 +
        srcData[p01 + 1] * w01 +
        srcData[p11 + 1] * w11;
      dstData[idxOut + 2] =
        srcData[p00 + 2] * w00 +
        srcData[p10 + 2] * w10 +
        srcData[p01 + 2] * w01 +
        srcData[p11 + 2] * w11;
      dstData[idxOut + 3] = 255;
    }
  }

  dctx.putImageData(dstImg, 0, 0);
  return out;
}

export function gradeWarpedOMRCanvas(
  warpedCanvas: HTMLCanvasElement,
  exam: ExamModel,
  meta: {
    studentName: string;
    committeeName: string;
    detectionMethod: ScannedResult["detectionMethod"];
  },
  calibration: CalibrationSettings
): ScannedResult {
  const ctx = warpedCanvas.getContext("2d", { willReadFrequently: true })!;
  const w = warpedCanvas.width;
  const h = warpedCanvas.height;
  const rgba = ctx.getImageData(0, 0, w, h).data;

  const bubbles = generateBubbleLayout(
    exam.tfCount,
    exam.mcqCount,
    exam.essayPoints > 0
  );

  // Measure fill darkness of a bubble relative to its surrounding white paper ring
  const measureBubbleFill = (cx: number, cy: number, rScaled: number): number => {
    const innerR = rScaled * 0.68;
    const outerR1 = rScaled * 1.25;
    const outerR2 = rScaled * 1.65;

    let innerSum = 0;
    let innerCount = 0;
    let paperSum = 0;
    let paperCount = 0;

    const minX = Math.max(0, Math.floor(cx - outerR2));
    const maxX = Math.min(w - 1, Math.ceil(cx + outerR2));
    const minY = Math.max(0, Math.floor(cy - outerR2));
    const maxY = Math.min(h - 1, Math.ceil(cy + outerR2));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const d = Math.hypot(dx, dy);
        const idx = (y * w + x) * 4;
        const lum = rgba[idx] * 0.299 + rgba[idx + 1] * 0.587 + rgba[idx + 2] * 0.114;

        if (d <= innerR) {
          innerSum += lum;
          innerCount++;
        } else if (d >= outerR1 && d <= outerR2) {
          paperSum += lum;
          paperCount++;
        }
      }
    }

    const innerMean = innerCount > 0 ? innerSum / innerCount : 255;
    const paperMean = paperCount > 0 ? paperSum / paperCount : 240;
    const rawDelta = Math.max(0, paperMean - innerMean) / Math.max(paperMean, 45);
    return Math.min(1, rawDelta * calibration.contrastBoost);
  };

  // Group bubbles by question number
  const byQuestion = new Map<number, typeof bubbles>();
  for (const b of bubbles) {
    const list = byQuestion.get(b.questionNum) ?? [];
    list.push(b);
    byQuestion.set(b.questionNum, list);
  }

  const gradedQuestions: GradedQuestionResult[] = [];
  let autoScore = 0;
  let autoMaxScore = 0;
  let essayScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let multipleCount = 0;

  // Draw annotations onto a copy of warpedCanvas
  const annotated = document.createElement("canvas");
  annotated.width = w;
  annotated.height = h;
  const actx = annotated.getContext("2d")!;
  actx.drawImage(warpedCanvas, 0, 0);

  const allQuestions = [
    ...exam.tfQuestions.map((q) => ({ ...q, type: "tf" as const })),
    ...exam.mcqQuestions.map((q) => ({ ...q, type: "mcq" as const })),
  ];

  for (const q of allQuestions) {
    const qBubbles = (byQuestion.get(q.num) ?? []).sort(
      (a, b) => a.optionValue - b.optionValue
    );
    const maxPoints = q.type === "tf" ? exam.tfPoints : exam.mcqPoints;
    autoMaxScore += maxPoints;

    const confidences = qBubbles.map((b) =>
      measureBubbleFill(b.u * w, b.v * h, b.r * 2)
    );
    const maxConf = Math.max(...confidences, 0);

    const markedIndices: number[] = [];
    confidences.forEach((conf, idx) => {
      if (conf >= calibration.fillThreshold) {
        // Ignore faint noise if another bubble is drastically darker
        if (maxConf - conf <= calibration.multiMarkMargin || conf >= calibration.fillThreshold + 0.14) {
          markedIndices.push(qBubbles[idx].optionValue);
        }
      }
    });

    let marked: number | null = null;
    let status: GradedQuestionResult["status"] = "blank";
    let earnedPoints = 0;

    if (markedIndices.length === 0) {
      marked = null;
      status = "blank";
      blankCount++;
    } else if (markedIndices.length > 1) {
      marked = -1;
      status = "multiple";
      multipleCount++;
    } else {
      marked = markedIndices[0];
      if (marked === q.answer) {
        status = "correct";
        earnedPoints = maxPoints;
        autoScore += maxPoints;
        correctCount++;
      } else {
        status = "wrong";
        wrongCount++;
      }
    }

    // Annotate visual rings on warped sheet
    for (const b of qBubbles) {
      const bx = b.u * w;
      const by = b.v * h;
      const br = b.r * 2 + 5;
      const isMarked = markedIndices.includes(b.optionValue);
      const isCorrectOpt = b.optionValue === q.answer;

      if (isMarked && status === "correct") {
        actx.strokeStyle = "#16a34a";
        actx.lineWidth = 5;
        actx.beginPath();
        actx.arc(bx, by, br, 0, Math.PI * 2);
        actx.stroke();
      } else if (isMarked && status === "wrong") {
        actx.strokeStyle = "#dc2626";
        actx.lineWidth = 5;
        actx.beginPath();
        actx.arc(bx, by, br, 0, Math.PI * 2);
        actx.stroke();
      } else if (isMarked && status === "multiple") {
        actx.strokeStyle = "#d97706";
        actx.lineWidth = 5;
        actx.beginPath();
        actx.arc(bx, by, br, 0, Math.PI * 2);
        actx.stroke();
      } else if (!isMarked && isCorrectOpt && status !== "correct") {
        actx.save();
        actx.setLineDash([6, 4]);
        actx.strokeStyle = "#0d9488";
        actx.lineWidth = 4;
        actx.beginPath();
        actx.arc(bx, by, br, 0, Math.PI * 2);
        actx.stroke();
        actx.restore();
      }
    }

    gradedQuestions.push({
      num: q.num,
      type: q.type,
      marked,
      markedOptions: markedIndices,
      correctAnswer: q.answer,
      status,
      earnedPoints,
      maxPoints,
      confidences,
    });
  }

  // Optional Essay bubble row
  if (exam.essayPoints > 0) {
    const essayQNum = exam.tfCount + exam.mcqCount + 1;
    const essayBubbles = (byQuestion.get(essayQNum) ?? []).sort(
      (a, b) => a.optionValue - b.optionValue
    );
    if (essayBubbles.length > 0) {
      const confs = essayBubbles.map((b) =>
        measureBubbleFill(b.u * w, b.v * h, b.r * 2)
      );
      const markedEssay = essayBubbles
        .filter((_, idx) => confs[idx] >= calibration.fillThreshold)
        .map((b) => b.optionValue);
      if (markedEssay.length === 1) {
        essayScore = Math.min(exam.essayPoints, markedEssay[0]);
        const eb = essayBubbles.find((b) => b.optionValue === markedEssay[0]);
        if (eb) {
          actx.strokeStyle = "#0284c7";
          actx.lineWidth = 5;
          actx.beginPath();
          actx.arc(eb.u * w, eb.v * h, eb.r * 2 + 5, 0, Math.PI * 2);
          actx.stroke();
        }
      }
    }
  }

  const totalScore = autoScore + essayScore;
  const totalMaxScore = autoMaxScore + exam.essayPoints;
  const percentage =
    totalMaxScore > 0
      ? Math.round((totalScore / totalMaxScore) * 1000) / 10
      : 0;

  return {
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    studentName: meta.studentName.trim() || "طالب غير مسمى",
    committeeName: meta.committeeName.trim() || "لجنة غير محددة",
    modelCode: exam.modelCode,
    examId: exam.id,
    examTitle: exam.title,
    subject: exam.subject,
    autoScore,
    autoMaxScore,
    essayScore,
    essayMaxScore: exam.essayPoints,
    totalScore,
    totalMaxScore,
    percentage,
    correctCount,
    wrongCount,
    blankCount,
    multipleCount,
    questions: gradedQuestions,
    annotatedImageUrl: annotated.toDataURL("image/jpeg", 0.85),
    detectionMethod: meta.detectionMethod,
  };
}

/**
 * Generates a realistic synthetic camera-captured OMR photo (tilted + soft lighting + pen fills)
 * so the teacher can verify the CV + QR pipeline in 1 click without needing a physical printer.
 */
export async function generateSimulatedOMRPhoto(
  exam: ExamModel,
  studentName: string,
  committeeName: string,
  accuracyRate = 0.88
): Promise<HTMLCanvasElement> {
  // 1. Render crisp sheet onto canonical 794 x 1123 canvas
  const sheet = document.createElement("canvas");
  sheet.width = SHEET_WIDTH;
  sheet.height = SHEET_HEIGHT;
  const ctx = sheet.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  // Header border
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, SHEET_WIDTH - 48, 224);

  // Header text
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "right";
  ctx.font = "bold 22px Cairo, sans-serif";
  ctx.fillText("مدارس إشراق اليمن - ورقة التظليل الإلكترونية", 750, 68);
  ctx.font = "bold 17px Cairo, sans-serif";
  ctx.fillText(`إشراف: ${exam.teacher} | المادة: ${exam.subject}`, 750, 102);
  ctx.font = "16px Cairo, sans-serif";
  ctx.fillText(`اسم الطالب: ${studentName}`, 750, 145);
  ctx.fillText(`اسم اللجنة: ${committeeName}`, 750, 180);
  ctx.fillText(`رقم النموذج: ${exam.modelCode}`, 750, 215);

  // QR Code at x: 42..182, y: 40..180
  const qrPayload = encodeQRPayload({
    modelCode: exam.modelCode,
    examId: exam.id,
    committeeName,
    studentName,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 140,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 42, 40, 140, 140);
      resolve();
    };
    img.src = qrDataUrl;
  });

  // 4 Fiducial Black Squares
  ctx.fillStyle = "#000000";
  const half = FIDUCIAL_SIZE / 2;
  for (const pt of Object.values(FIDUCIAL_CENTERS)) {
    ctx.fillRect(pt.x - half, pt.y - half, FIDUCIAL_SIZE, FIDUCIAL_SIZE);
  }

  // Draw bubbles + realistic student pen shading
  const bubbles = generateBubbleLayout(
    exam.tfCount,
    exam.mcqCount,
    exam.essayPoints > 0
  );
  const answerMap = new Map<number, number>();
  exam.tfQuestions.forEach((q) => answerMap.set(q.num, q.answer));
  exam.mcqQuestions.forEach((q) => answerMap.set(q.num, q.answer));

  // Decide student's chosen answer per question
  const studentChoice = new Map<number, number>();
  for (const [qNum, correctAns] of answerMap.entries()) {
    const r = Math.random();
    if (r < accuracyRate) {
      studentChoice.set(qNum, correctAns);
    } else if (r < accuracyRate + 0.09) {
      const maxOpt = qNum <= exam.tfCount ? 2 : 4;
      const wrong = (correctAns % maxOpt) + 1;
      studentChoice.set(qNum, wrong);
    }
    // else leave blank (~3%)
  }
  if (exam.essayPoints > 0) {
    studentChoice.set(exam.tfCount + exam.mcqCount + 1, 4);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 12px IBM Plex Sans Arabic, sans-serif";

  for (const b of bubbles) {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#334155";
    ctx.fillText(b.label, b.x, b.y + 1);

    if (studentChoice.get(b.questionNum) === b.optionValue) {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Place sheet onto a desk-like camera frame with slight rotation & lighting gradient
  const camW = 1040;
  const camH = 1320;
  const cam = document.createElement("canvas");
  cam.width = camW;
  cam.height = camH;
  const cctx = cam.getContext("2d")!;

  cctx.fillStyle = "#cbd5e1";
  cctx.fillRect(0, 0, camW, camH);

  cctx.save();
  cctx.translate(camW / 2, camH / 2);
  const angle = ((Math.random() * 5 - 2.5) * Math.PI) / 180;
  cctx.rotate(angle);
  cctx.shadowColor = "rgba(15, 23, 42, 0.25)";
  cctx.shadowBlur = 24;
  cctx.drawImage(sheet, -SHEET_WIDTH / 2, -SHEET_HEIGHT / 2);
  cctx.restore();

  // Subtle uneven ambient light gradient
  const grad = cctx.createLinearGradient(0, 0, camW, camH);
  grad.addColorStop(0, "rgba(255,255,255,0.06)");
  grad.addColorStop(1, "rgba(15,23,42,0.08)");
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, camW, camH);

  return cam;
}
