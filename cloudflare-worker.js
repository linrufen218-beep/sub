const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-provider-api-key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function buildPrompt({ topic, density, tense }) {
  let countRange = '10 to 15';
  if (density === 'low') countRange = '3 to 5';
  if (density === 'high') countRange = '15 to 30';

  let tenseInstruction = "mixed (50% progressive 'I am becoming' and 50% completed 'I already am')";
  if (tense === 'progressive') tenseInstruction = "progressive ('I am constantly becoming...', 'My ... is rapidly improving')";
  if (tense === 'completed') tenseInstruction = "completed ('I am...', 'I have already completely...')";

  return `你是一个世界顶级的潜意识重塑专家、心理学专家和高级催眠师。请深入分析用户的诉求，并为他们生成极其强大、直达灵魂的潜意识肯定句（Affirmations）。

用户输入的原始需求（可能包含烦恼、缺点或渴望的目标）：
"${topic}"

【核心生成法则 - 绝不可违反】：
1. 彻底反转负面词汇：潜意识不识别“不”字。如果用户诉求包含负面词，你必须抓取其背后的核心渴望，并100%转化为绝对正向的描述。
2. 全方位多维拆解：如果用户输入的是一个具象概念，必须从多维度拆解。
3. 数量要求：严格生成 ${countRange} 条。
4. 时态要求：使用 ${tenseInstruction} 的语态结构。
5. 纯净输出格式：直接逐行输出肯定句文本。不要编号、不要加粗、不要前缀后缀、不要寒暄，每行一句。
6. 双语锚定效用：以极具感染力、震撼力的优雅中文为主，在部分句子（约30%）的最后加一句极短英文锚点。

请立即开始生成：`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const clientKey = request.headers.get('x-api-key') || authHeader.replace(/^Bearer\s+/i, '');
    if (env.CLIENT_API_KEY && clientKey !== env.CLIENT_API_KEY) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const topic = String(body.topic || '').trim();
    if (!topic) {
      return json({ error: 'topic is required' }, 400);
    }

    const providerKey = request.headers.get('x-provider-api-key') || env.GEMINI_API_KEY;
    if (!providerKey) {
      return json({ error: 'Missing GEMINI_API_KEY secret' }, 500);
    }

    const model = String(body.model || env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    const prompt = buildPrompt({
      topic,
      density: body.density,
      tense: body.tense,
    });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': providerKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      return json({ error: 'Gemini request failed', detail: geminiData }, geminiRes.status);
    }

    const affirmations = geminiData.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!affirmations) {
      return json({ error: 'Gemini returned empty text', detail: geminiData }, 502);
    }

    return json({ affirmations });
  },
};
