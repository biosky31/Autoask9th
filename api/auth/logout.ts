import type { IncomingMessage, ServerResponse } from "node:http";
import { clearSessionCookie, sendJson } from "../../server/auth.ts";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  clearSessionCookie(req, res);
  sendJson(res, 200, { ok: true });
}
