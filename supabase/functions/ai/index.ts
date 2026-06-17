// AI-функция на бесплатном ключе Google Gemini.
// Вызов с фронта: supabase.functions.invoke('ai', { body: { prompt, system } })
//
// Запуск (один раз):
//   1) Возьми бесплатный ключ: https://aistudio.google.com/apikey
//   2) Положи его в секрет:  npm run ai:secret -- GEMINI_API_KEY=твой_ключ
//   3) Задеплой функцию:     npm run ai:deploy
//
// Модель можно поменять. gemini-2.5-flash — актуальная быстрая Flash-модель.
// Для картинок используется Gemini image generation (Nano Banana).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-3.1-flash-image';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Нет GEMINI_API_KEY. Поставь секрет: npm run ai:secret -- GEMINI_API_KEY=...');
    }
    const { prompt, system, mode } = await req.json();
    if (!prompt) throw new Error('Нужно поле prompt');
    const isImageMode = mode === 'image';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${isImageMode ? IMAGE_MODEL : MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: isImageMode
            ? {
              temperature: 0.72,
              responseModalities: ['TEXT', 'IMAGE'],
            }
            : {
              temperature: 0.45,
              maxOutputTokens: 32768,
            },
        }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      const message = data?.error?.message ?? `Gemini error: ${res.status}`;
      throw new Error(message);
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    if (isImageMode) {
      const imagePart = parts.find((part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData?.data);
      const textPart = parts.find((part: { text?: string }) => part.text);
      const base64 = imagePart?.inlineData?.data;
      const mimeType = imagePart?.inlineData?.mimeType ?? 'image/png';
      if (!base64) throw new Error('Gemini не вернул изображение');

      return new Response(JSON.stringify({
        text: textPart?.text ?? '',
        imageDataUrl: `data:${mimeType};base64,${base64}`,
        mimeType,
      }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const text = parts.find((part: { text?: string }) => part.text)?.text ?? '';
    if (!text) {
      throw new Error('Gemini вернул пустой ответ');
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
