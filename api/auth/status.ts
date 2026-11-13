import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthStatusPayload, sendJson } from "../../server/auth.ts";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  sendJson(res, 200, getAuthStatusPayload(req));
}
