import type { IncomingMessage, ServerResponse } from "node:http";
import { isRequestAuthenticated, readJsonBody, sendJson } from "../server/auth.ts";
import { verifyOmrWithGemini } from "../server/gemini.ts";

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
      imageBase64?: string;
      tfCount?: number;
      mcqCount?: number;
    }>(req);

    if (!body.imageBase64) {
      sendJson(res, 400, { error: "لم يتم إرسال صورة الورقة." });
      return;
    }

    const parsed = await verifyOmrWithGemini({
      imageBase64: body.imageBase64,
      tfCount: body.tfCount,
      mcqCount: body.mcqCount,
    });
    sendJson(res, 200, parsed);
  } catch (error) {
    const status =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const message =
      error instanceof Error ? error.message : "تعذر التحقق الذكي من الصورة.";
    sendJson(res, status, { error: message });
  }
}
