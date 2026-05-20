const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
1. 彻底反转负面词汇：潜意识不识别"不"字。如果用户诉求包含负面词，你必须抓取其背后的核心渴望，并100%转化为绝对正向的描述。
2. 全方位多维拆解：如果用户输入的是一个具象概念，必须从多维度拆解。
3. 数量要求：严格生成 ${countRange} 条。
4. 时态要求：使用 ${tenseInstruction} 的语态结构。
5. 纯净输出格式：直接逐行输出肯定句文本。不要编号、不要加粗、不要前缀后缀、不要寒暄，每行一句。
6. 双语锚定效用：以极具感染力、震撼力的优雅中文为主，在部分句子（约30%）的最后加一句极短英文锚点。

请立即开始生成：`;
}

async function callOpenAICompatible(apiBase, apiKey, model, prompt) {
  const baseUrl = apiBase.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: 'AI request failed', detail: data, status: res.status };
  }
  const text = data.choices?.[0]?.message?.content || '';
  return { text: text.trim() };
}

async function callGemini(apiKey, model, prompt, proxyHost) {
  let url;
  if (proxyHost) {
    const protocol = proxyHost.startsWith('http') ? '' : 'https://';
    url = `${protocol}${proxyHost}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: 'Gemini request failed', detail: data, status: res.status };
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) {
    return { error: 'Gemini returned empty text', detail: data, status: 502 };
  }
  return { text };
}

async function handleGenerate(request, env) {
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

  const model = String(body.model || env.AI_MODEL || 'gemini-2.5-flash').trim();
  const prompt = buildPrompt({
    topic,
    density: body.density,
    tense: body.tense,
  });

  const aiBaseUrl = (env.AI_BASE_URL || '').trim();

  let result;
  if (aiBaseUrl) {
    // Use OpenAI-compatible API (e.g., SiliconFlow, OpenAI, etc.)
    result = await callOpenAICompatible(aiBaseUrl, providerKey, model, prompt);
  } else {
    // Use Gemini API (with optional proxy host)
    result = await callGemini(providerKey, model, prompt, env.PROXY_HOST || '');
  }

  if (result.error) {
    return json({ error: result.error, detail: result.detail }, result.status || 502);
  }

  return json({ affirmations: result.text });
}

async function handleTTS(request, env) {
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  if (!text) {
    return json({ error: 'text parameter is required' }, 400);
  }

  const truncatedText = text.substring(0, 200);

  // Preferred IP / Reverse Proxy Support for TTS
  const proxyHost = env.PROXY_HOST || '';
  let ttsUrl;
  if (proxyHost) {
    const protocol = proxyHost.startsWith('http') ? '' : 'https://';
    ttsUrl = `${protocol}${proxyHost}/translate_tts?ie=UTF-8&q=${encodeURIComponent(truncatedText)}&tl=zh-CN&client=gtx`;
  } else {
    ttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(truncatedText)}&tl=zh-CN&client=gtx`;
  }

  const response = await fetch(ttsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });

  if (!response.ok) {
    return json({ error: 'TTS request failed', detail: response.statusText }, response.status);
  }

  const arrayBuffer = await response.arrayBuffer();

  return new Response(arrayBuffer, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      return json({
        status: 'ok',
        name: 'subliminal-worker',
        version: '2.1',
        hasGeminiKey: !!env.GEMINI_API_KEY,
        aiBackend: (env.AI_BASE_URL || '').trim() ? 'openai-compatible' : 'gemini',
        hasProxyHost: !!env.PROXY_HOST,
      });
    }

    // TTS proxy
    if (path === '/api/tts') {
      return handleTTS(request, env);
    }

    // Generate affirmations
    if (path === '/api/generate-affirmations' && request.method === 'POST') {
      return handleGenerate(request, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};