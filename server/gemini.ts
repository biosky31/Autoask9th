import { GoogleGenAI, Type } from "@google/genai";

export function getGeminiClient() {
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

export async function parseExamWithGemini(params: {
  fileBase64: string;
  mimeType: string;
  fileName?: string;
}) {
  const ai = getGeminiClient();
  if (!ai) {
    throw Object.assign(
      new Error(
        "مفتاح Gemini API غير مهيأ على الخادم حالياً. يمكنك إعداد مفتاح الإجابة يدوياً من لوحة الاختبارات."
      ),
      { statusCode: 503 }
    );
  }

  const cleanBase64 = params.fileBase64.includes(",")
    ? params.fileBase64.split(",")[1]
    : params.fileBase64;

  const prompt = `أنت خبير مناهج واختبارات أتمتة يمنية. حلّل ملف الاختبار المرفق (${params.fileName || "اختبار"}) بدقة تامة:
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
            mimeType: params.mimeType,
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
  return JSON.parse(raw);
}

export async function verifyOmrWithGemini(params: {
  imageBase64: string;
  tfCount?: number;
  mcqCount?: number;
}) {
  const ai = getGeminiClient();
  if (!ai) {
    throw Object.assign(
      new Error("خدمة التحقق الذكي غير متاحة حالياً."),
      { statusCode: 503 }
    );
  }

  const cleanBase64 = params.imageBase64.includes(",")
    ? params.imageBase64.split(",")[1]
    : params.imageBase64;

  const tf = params.tfCount || 16;
  const mcq = params.mcqCount || 30;
  const prompt = `هذه صورة ورقة تظليل (OMR) لإجابة طالب في مدارس إشراق اليمن.
- الأسئلة من 1 إلى ${tf} هي أسئلة صح (ص = 1) وخطأ (خ = 2).
- الأسئلة من ${tf + 1} إلى ${tf + mcq} هي أسئلة اختيار من متعدد (1، 2، 3، 4).
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

  return JSON.parse((response.text ?? "{}").trim());
}
