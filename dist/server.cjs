var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.post("/api/generate-affirmations", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is missing.");
      }
      const ai = new import_genai.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const { topic, density, tense } = req.body;
      let countRange = "10 to 15";
      if (density === "low") countRange = "3 to 5";
      if (density === "high") countRange = "15 to 30";
      let tenseInstruction = "mixed (50% progressive 'I am becoming' and 50% completed 'I already am')";
      if (tense === "progressive") tenseInstruction = "progressive ('I am constantly becoming...', 'My ... is rapidly improving')";
      if (tense === "completed") tenseInstruction = "completed ('I am...', 'I have already completely...')";
      const prompt = `\u4F60\u662F\u4E00\u4E2A\u4E16\u754C\u9876\u7EA7\u7684\u6F5C\u610F\u8BC6\u91CD\u5851\u4E13\u5BB6\u3001\u5FC3\u7406\u5B66\u4E13\u5BB6\u548C\u9AD8\u7EA7\u50AC\u7720\u5E08\u3002\u8BF7\u6DF1\u5165\u5206\u6790\u7528\u6237\u7684\u8BC9\u6C42\uFF0C\u5E76\u4E3A\u4ED6\u4EEC\u751F\u6210\u6781\u5176\u5F3A\u5927\u3001\u76F4\u8FBE\u7075\u9B42\u7684\u6F5C\u610F\u8BC6\u80AF\u5B9A\u53E5\uFF08Affirmations\uFF09\u3002

\u7528\u6237\u8F93\u5165\u7684\u539F\u59CB\u9700\u6C42\uFF08\u53EF\u80FD\u5305\u542B\u70E6\u607C\u3001\u7F3A\u70B9\u6216\u6E34\u671B\u7684\u76EE\u6807\uFF09\uFF1A
"${topic}"

\u3010\u6838\u5FC3\u751F\u6210\u6CD5\u5219 - \u7EDD\u4E0D\u53EF\u8FDD\u53CD\u3011\uFF1A
1. \u5F7B\u5E95\u53CD\u8F6C\u8D1F\u9762\u8BCD\u6C47\uFF1A\u6F5C\u610F\u8BC6\u4E0D\u8BC6\u522B\u201C\u4E0D\u201D\u5B57\u3002\u5982\u679C\u7528\u6237\u8BC9\u6C42\u5305\u542B\u8D1F\u9762\u8BCD\uFF08\u5982\u201C\u7126\u8651\u201D\u3001\u201C\u62D6\u5EF6\u201D\u3001\u201C\u6CA1\u94B1\u201D\u3001\u201C\u4E11\u201D\u3001\u201C\u4E0D\u8981\u80D6\u201D\uFF09\uFF0C\u4F60\u5FC5\u987B\u6293\u53D6\u5176\u80CC\u540E\u7684\u6838\u5FC3\u6E34\u671B\uFF0C\u5E76100%\u8F6C\u5316\u4E3A\u7EDD\u5BF9\u6B63\u5411\u7684\u63CF\u8FF0\u3002
   \uFF08\u9519\u8BEF\u793A\u8303\uFF1A\u201C\u6211\u4E0D\u518D\u7126\u8651\u201D -> \u6B63\u786E\u793A\u8303\uFF1A\u201C\u6211\u65E0\u8BBA\u4F55\u65F6\u90FD\u611F\u5230\u7EDD\u5BF9\u7684\u5E73\u9759\u4E0E\u5B89\u5168\u201D\uFF09
2. \u5168\u65B9\u4F4D\u591A\u7EF4\u62C6\u89E3\uFF1A\u5982\u679C\u7528\u6237\u8F93\u5165\u7684\u662F\u4E00\u4E2A\u5177\u8C61\u6982\u5FF5\uFF08\u5982\u201C\u50CF\u82AD\u6BD4\u4E00\u6837\u201D\u3001\u201C\u9876\u7EA7\u603B\u88C1\u201D\uFF09\uFF0C\u5FC5\u987B\u4ECE\u591A\u7EF4\u5EA6\u62C6\u89E3\u3002
   \uFF08\u4F8B\u5982\uFF1A\u201C\u50CF\u82AD\u6BD4\u4E00\u6837\u201D\u8981\u62C6\u89E3\u4E3A\u201C\u4E94\u5B98\u7CBE\u81F4\u6BD4\u4F8B\u5B8C\u7F8E\u201D\u3001\u201C\u76AE\u80A4\u767D\u7699\u900F\u4EAE\u201D\u3001\u201C\u9AA8\u9ABC\u67B6\u6784\u9876\u7EA7\u201D\u3001\u201C\u4ECE\u5BB9\u81EA\u4FE1\u7684\u5343\u91D1\u6C14\u573A\u201D\u7B49\u5177\u4F53\u8BCD\u6761\uFF09\u3002
3. \u6570\u91CF\u8981\u6C42\uFF1A\u4E25\u683C\u751F\u6210 ${countRange} \u6761\u3002
4. \u65F6\u6001\u8981\u6C42\uFF1A\u4F7F\u7528 ${tenseInstruction} \u7684\u8BED\u6001\u7ED3\u6784\u3002
5. \u7EAF\u51C0\u8F93\u51FA\u683C\u5F0F\uFF1A\u76F4\u63A5\u9010\u884C\u8F93\u51FA\u80AF\u5B9A\u53E5\u6587\u672C\u3002\u5343\u4E07\u4E0D\u8981\u7F16\u53F7\u3001\u4E0D\u8981\u52A0\u7C97\u3001\u4E0D\u8981\u53D1\u524D\u7F00\u540E\u7F00\u3001\u4E0D\u8981\u5BD2\u6684\uFF0C\u6BCF\u884C\u4E00\u53E5\u3002
6. \u53CC\u8BED\u951A\u5B9A\u6548\u7528\uFF1A\u4EE5\u6781\u5177\u611F\u67D3\u529B\u3001\u9707\u64BC\u529B\u7684\u4F18\u96C5\u4E2D\u6587\u4E3A\u4E3B\uFF0C\u5728\u90E8\u5206\u53E5\u5B50\uFF08\u7EA630%\uFF09\u7684\u6700\u540E\u52A0\u4E0A\u4E00\u53E5\u6781\u5176\u7B80\u77ED\u5F3A\u529B\u7684\u82F1\u6587\u951A\u70B9\uFF08\u5982 "Absolute perfection." / "I am magnetic." / "Unstoppable."\uFF09\u3002

\u8BF7\u7ACB\u5373\u5F00\u59CB\u751F\u6210\uFF1A`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      res.json({ affirmations: response.text });
    } catch (error) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ error: "Failed to generate affirmations" });
    }
  });
  app.get("/api/tts", async (req, res) => {
    try {
      const text = req.query.text;
      if (!text) return res.status(400).send("Text required");
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=zh-CN&client=gtx`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      if (!response.ok) throw new Error(`Google TTS failed: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("TTS Proxy Error:", error);
      res.status(500).json({ error: "TTS Synthesis failed" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
