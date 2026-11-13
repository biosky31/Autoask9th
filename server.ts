import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkRateLimit,
  clearFailedAttempts,
  clearSessionCookie,
  createSessionToken,
  getAuthStatusPayload,
  getClientIp,
  getServerAccessSecret,
  isRequestAuthenticated,
  recordFailedAttempt,
  setSessionCookie,
  verifyAccessPassphrase,
} from "./server/auth.ts";
import { parseExamWithGemini, verifyOmrWithGemini } from "./server/gemini.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: "25mb" }));

  // Private app security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      serverProtected: Boolean(getServerAccessSecret()),
    });
  });

  app.get("/api/auth/status", (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getAuthStatusPayload(req));
  });

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const secret = getServerAccessSecret();
    if (!secret) {
      res.json({ ok: true, serverProtected: false });
      return;
    }

    const ip = getClientIp(req);
    const rate = checkRateLimit(ip);
    if (!rate.allowed) {
      res.status(429).json({
        error: `تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار ${rate.retryAfterSec} ثانية.`,
      });
      return;
    }

    const passphrase =
      typeof (req.body as { passphrase?: unknown })?.passphrase === "string"
        ? ((req.body as { passphrase: string }).passphrase)
        : "";

    if (!verifyAccessPassphrase(passphrase)) {
      recordFailedAttempt(ip);
      res.status(401).json({ error: "الرمز السري غير صحيح." });
      return;
    }

    clearFailedAttempts(ip);
    const token = createSessionToken(secret);
    setSessionCookie(req, res, token);
    res.json({ ok: true, serverProtected: true });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post("/api/parse-exam", async (req: Request, res: Response) => {
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({ error: "غير مصرح: يرجى إدخال الرمز السري أولاً." });
      return;
    }
    try {
      const { fileBase64, mimeType, fileName } = req.body as {
        fileBase64?: string;
        mimeType?: string;
        fileName?: string;
      };

      if (!fileBase64 || !mimeType) {
        res.status(400).json({ error: "يرجى إرفاق ملف الاختبار (PDF أو صورة)." });
        return;
      }

      const parsed = await parseExamWithGemini({ fileBase64, mimeType, fileName });
      res.json({ exam: parsed });
    } catch (error) {
      console.error("Error in /api/parse-exam:", error);
      const status =
        typeof (error as { statusCode?: number }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : 500;
      const message =
        error instanceof Error ? error.message : "فشل تحليل ملف الاختبار";
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/verify-omr", async (req: Request, res: Response) => {
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({ error: "غير مصرح: يرجى إدخال الرمز السري أولاً." });
      return;
    }
    try {
      const { imageBase64, tfCount, mcqCount } = req.body as {
        imageBase64?: string;
        tfCount?: number;
        mcqCount?: number;
      };

      if (!imageBase64) {
        res.status(400).json({ error: "لم يتم إرسال صورة الورقة." });
        return;
      }

      const parsed = await verifyOmrWithGemini({ imageBase64, tfCount, mcqCount });
      res.json(parsed);
    } catch (error) {
      console.error("Error in /api/verify-omr:", error);
      const status =
        typeof (error as { statusCode?: number }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : 500;
      res.status(status).json({ error: "تعذر التحقق الذكي من الصورة." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const disableHmr = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
