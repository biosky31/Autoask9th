import type { IncomingMessage, ServerResponse } from "node:http";
import { getServerAccessSecret, sendJson } from "../server/auth.ts";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  sendJson(res, 200, {
    ok: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    serverProtected: Boolean(getServerAccessSecret()),
  });
}
