import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const COOKIE_NAME = "ishraq_omr_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days for installed PWA convenience
const MIN_SECRET_LENGTH = 16;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const failedAttempts = new Map<string, AttemptRecord>();

export function getServerAccessSecret(): string | null {
  const val = process.env.APP_ACCESS_SECRET?.trim();
  return val && val.length > 0 ? val : null;
}

function getSigningKey(accessSecret: string): Buffer {
  const explicit = process.env.SESSION_SIGNING_SECRET?.trim();
  const base = explicit && explicit.length >= 16 ? explicit : accessSecret;
  return crypto
    .createHmac("sha256", base)
    .update("ishraq-omr-session-signing-key-v1")
    .digest();
}

function sha256Buffer(input: string): Buffer {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

export function verifyAccessPassphrase(candidate: string): boolean {
  const secret = getServerAccessSecret();
  if (!secret) return false;
  const a = sha256Buffer(candidate);
  const b = sha256Buffer(secret);
  return crypto.timingSafeEqual(a, b);
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function createSessionToken(accessSecret: string): string {
  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    n: crypto.randomBytes(12).toString("hex"),
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningKey(accessSecret))
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined,
  accessSecret: string
): boolean {
  if (!token) return false;
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return false;
  const encodedPayload = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  if (!encodedPayload || !providedSig) return false;

  const expectedSig = crypto
    .createHmac("sha256", getSigningKey(accessSecret))
    .update(encodedPayload)
    .digest("base64url");

  const bufA = Buffer.from(providedSig, "utf8");
  const bufB = Buffer.from(expectedSig, "utf8");
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as { exp?: number };
    if (typeof parsed.exp !== "number") return false;
    return parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isRequestAuthenticated(req: IncomingMessage): boolean {
  const secret = getServerAccessSecret();
  if (!secret) return true; // No server-side secret configured; client-side vault handles lock
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME], secret);
}

export function isHttpsRequest(req: IncomingMessage): boolean {
  const proto = req.headers["x-forwarded-proto"];
  if (typeof proto === "string" && proto.includes("https")) return true;
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(req: IncomingMessage, res: ServerResponse, token: string): void {
  const secureFlag = isHttpsRequest(req) ? "; Secure" : "";
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secureFlag}`;
  res.setHeader("Set-Cookie", cookie);
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  const secureFlag = isHttpsRequest(req) ? "; Secure" : "";
  const cookie = `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag}`;
  res.setHeader("Set-Cookie", cookie);
}

export function getClientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const rec = failedAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (rec.count >= 8) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const rec = failedAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    rec.count += 1;
  }
}

export function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

export function getAuthStatusPayload(req: IncomingMessage) {
  const secret = getServerAccessSecret();
  return {
    serverProtected: Boolean(secret),
    authenticated: isRequestAuthenticated(req),
    minLength: MIN_SECRET_LENGTH,
  };
}

export async function readJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage & { body?: unknown }
): Promise<T> {
  if (req.body && typeof req.body === "object") {
    return req.body as T;
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}") as T;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
