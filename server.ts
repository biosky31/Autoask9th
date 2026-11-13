import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post("/api/parse-exam", async (req: Request, res: Response) => {
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

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "مفتاح Gemini API غير مهيأ على الخادم حالياً. يمكنك إعداد مفتاح الإجابة يدوياً من لوحة الاختبارات.",
        });
        return;
      }

      const cleanBase64 = fileBase64.includes(",")
        ? fileBase64.split(",")[1]
        : fileBase64;

      const prompt = `أنت خبير مناهج واختبارات أتمتة يمنية. حلّل ملف الاختبار المرفق (${fileName || "اختبار"}) بدقة تامة:
1. استخرج رمز النموذج (مثل P.83 أو غيره، وإن لم يوجد فاقترح رمزاً قصيراً واضحاً مثل M.1).
2. استخرج اسم المادة والصف الدراسي والفصل/العام الدراسي إن وجدت.
3. إذا كان الملف يحتوي على ورقة إجابة/نموذج تصحيح إلكتروني أو أسئلة اختبار:
   - استخرج أسئلة الصواب والخطأ (عادةً 1 إلى 16): حيث 1 = صح (ص)، و2 = خطأ (خ).
   - استخرج أسئلة الاختيار من متعدد (عادةً 17 إلى 46، أو أي ترقيم تالٍ): حيث الإجابة رقم من 1 إلى 4.
   - إذا كانت ورقة أسئلة بدون نموذج تصحيح مطبوع، فقم بحل كل سؤال بدقة علمية تامة وأعد رقم الإجابة الصحيحة، مع نص موجز للسؤال في حقل text.
   - إذا وجد سؤال تعبير (مثل رقم 47) فأعد درجته في essayPoints (مثلاً 4، أو 0 إذا لم يوجد).
   - حدد الدرجة لكل سؤال صح/خطأ (tfPoints، غالباً 1) ولكل سؤال اختيار متعدد (mcqPoints، غالباً 2).`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              modelCode: {
                type: Type.STRING,
                description: "رمز نموذج الاختبار مثل P.83 أو A1",
              },
              title: {
                type: Type.STRING,
                description: "عنوان الاختبار الكامل",
              },
              subject: {
                type: Type.STRING,
                description: "اسم المادة مثل اللغة العربية",
              },
              grade: {
                type: Type.STRING,
                description: "الصف الدراسي مثل الصف التاسع الأساسي",
              },
              tfPoints: {
                type: Type.NUMBER,
                description: "درجة كل سؤال صواب وخطأ",
              },
              mcqPoints: {
                type: Type.NUMBER,
                description: "درجة كل سؤال اختيار من متعدد",
              },
              essayPoints: {
                type: Type.NUMBER,
                description: "درجة سؤال التعبير أو المقال إن وجد، وإلا 0",
              },
              tfQuestions: {
                type: Type.ARRAY,
                description: "قائمة أسئلة الصح والخطأ مرتبة",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    num: { type: Type.INTEGER },
                    answer: {
                      type: Type.INTEGER,
                      description: "1 for صح (ص), 2 for خطأ (خ)",
                    },
                    text: { type: Type.STRING },
                  },
                },
              },
              mcqQuestions: {
                type: Type.ARRAY,
                description: "قائمة أسئلة الاختيار من متعدد مرتبة",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    num: { type: Type.INTEGER },
                    answer: {
                      type: Type.INTEGER,
                      description: "رقم الخيار الصحيح من 1 إلى 4",
                    },
                    text: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const raw = (response.text ?? "{}").trim();
      const parsed = JSON.parse(raw);
      res.json({ exam: parsed });
    } catch (error) {
      console.error("Error in /api/parse-exam:", error);
      const message =
        error instanceof Error ? error.message : "فشل تحليل ملف الاختبار";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/verify-omr", async (req: Request, res: Response) => {
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

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: "خدمة التحقق الذكي غير متاحة حالياً." });
        return;
      }

      const cleanBase64 = imageBase64.includes(",")
        ? imageBase64.split(",")[1]
        : imageBase64;

      const prompt = `هذه صورة ورقة تظليل (OMR) لإجابة طالب في مدارس إشراق اليمن.
- الأسئلة من 1 إلى ${tfCount || 16} هي أسئلة صح (ص = 1) وخطأ (خ = 2).
- الأسئلة من ${(tfCount || 16) + 1} إلى ${(tfCount || 16) + (mcqCount || 30)} هي أسئلة اختيار من متعدد (1، 2، 3، 4).
- استخرج الإجابة المظللة لكل رقم سؤال (0 إذا كان فارغاً، -1 إذا كان مزدوج التظليل)، وأيضاً اسم الطالب واسم اللجنة ورقم النموذج إن كانت واضحة في الورقة.`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studentName: { type: Type.STRING },
              committeeName: { type: Type.STRING },
              modelCode: { type: Type.STRING },
              answers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    num: { type: Type.INTEGER },
                    marked: { type: Type.INTEGER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json(parsed);
    } catch (error) {
      console.error("Error in /api/verify-omr:", error);
      res.status(500).json({ error: "تعذر التحقق الذكي من الصورة." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
