import type { IncomingMessage, ServerResponse } from "node:http";
import { isRequestAuthenticated, readJsonBody, sendJson } from "../server/auth.ts";
import { parseExamWithGemini } from "../server/gemini.ts";

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!isRequestAuthenticated(req)) {
    sendJson(res, 401, { error: "غير مصرح: يرجى إدخال الرمز السري أولاً." });
    return;
  }

  try {
    const body = await readJsonBody<{
      fileBase64?: string;
      mimeType?: string;
      fileName?: string;
    }>(req);

    if (!body.fileBase64 || !body.mimeType) {
      sendJson(res, 400, { error: "يرجى إرفاق ملف الاختبار (PDF أو صورة)." });
      return;
    }

    const parsed = await parseExamWithGemini({
      fileBase64: body.fileBase64,
      mimeType: body.mimeType,
      fileName: body.fileName,
    });
    sendJson(res, 200, { exam: parsed });
  } catch (error) {
    const status =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const message =
      error instanceof Error ? error.message : "فشل تحليل ملف الاختبار";
    sendJson(res, status, { error: message });
  }
}
