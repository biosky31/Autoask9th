import type { IncomingMessage, ServerResponse } from "node:http";
import {
  checkRateLimit,
  clearFailedAttempts,
  createSessionToken,
  getClientIp,
  getServerAccessSecret,
  readJsonBody,
  recordFailedAttempt,
  sendJson,
  setSessionCookie,
  verifyAccessPassphrase,
} from "../../server/auth.ts";

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const secret = getServerAccessSecret();
  if (!secret) {
    sendJson(res, 200, { ok: true, serverProtected: false });
    return;
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    sendJson(res, 429, {
      error: `تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار ${rate.retryAfterSec} ثانية.`,
    });
    return;
  }

  try {
    const body = await readJsonBody<{ passphrase?: string }>(req);
    const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";
    if (!verifyAccessPassphrase(passphrase)) {
      recordFailedAttempt(ip);
      sendJson(res, 401, { error: "الرمز السري غير صحيح." });
      return;
    }

    clearFailedAttempts(ip);
    const token = createSessionToken(secret);
    setSessionCookie(req, res, token);
    sendJson(res, 200, { ok: true, serverProtected: true });
  } catch {
    sendJson(res, 400, { error: "طلب غير صالح." });
  }
}
