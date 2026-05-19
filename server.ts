import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post('/api/generate-affirmations', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is missing.");
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      const { topic, density, tense } = req.body;
      
      let countRange = "10 to 15";
      if (density === 'low') countRange = "3 to 5";
      if (density === 'high') countRange = "15 to 30";

      let tenseInstruction = "mixed (50% progressive 'I am becoming' and 50% completed 'I already am')";
      if (tense === 'progressive') tenseInstruction = "progressive ('I am constantly becoming...', 'My ... is rapidly improving')";
      if (tense === 'completed') tenseInstruction = "completed ('I am...', 'I have already completely...')";

      const prompt = `你是一个世界顶级的潜意识重塑专家、心理学专家和高级催眠师。请深入分析用户的诉求，并为他们生成极其强大、直达灵魂的潜意识肯定句（Affirmations）。

用户输入的原始需求（可能包含烦恼、缺点或渴望的目标）：
"${topic}"

【核心生成法则 - 绝不可违反】：
1. 彻底反转负面词汇：潜意识不识别“不”字。如果用户诉求包含负面词（如“焦虑”、“拖延”、“没钱”、“丑”、“不要胖”），你必须抓取其背后的核心渴望，并100%转化为绝对正向的描述。
   （错误示范：“我不再焦虑” -> 正确示范：“我无论何时都感到绝对的平静与安全”）
2. 全方位多维拆解：如果用户输入的是一个具象概念（如“像芭比一样”、“顶级总裁”），必须从多维度拆解。
   （例如：“像芭比一样”要拆解为“五官精致比例完美”、“皮肤白皙透亮”、“骨骼架构顶级”、“从容自信的千金气场”等具体词条）。
3. 数量要求：严格生成 ${countRange} 条。
4. 时态要求：使用 ${tenseInstruction} 的语态结构。
5. 纯净输出格式：直接逐行输出肯定句文本。千万不要编号、不要加粗、不要发前缀后缀、不要寒暄，每行一句。
6. 双语锚定效用：以极具感染力、震撼力的优雅中文为主，在部分句子（约30%）的最后加上一句极其简短强力的英文锚点（如 "Absolute perfection." / "I am magnetic." / "Unstoppable."）。

请立即开始生成：`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      res.json({ affirmations: response.text });
    } catch (error) {
      console.error('AI Generation Error:', error);
      res.status(500).json({ error: 'Failed to generate affirmations' });
    }
  });

  // Proxy for Google Translate TTS to bypass CORS
  app.get('/api/tts', async (req, res) => {
    try {
      const text = req.query.text as string;
      if (!text) return res.status(400).send('Text required');
      
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=zh-CN&client=gtx`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) throw new Error(`Google TTS failed: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error('TTS Proxy Error:', error);
      res.status(500).json({ error: 'TTS Synthesis failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
