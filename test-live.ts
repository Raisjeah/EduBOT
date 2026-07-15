import { GoogleGenAI, Modality } from "@google/genai";
async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const session = await ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    config: {
      responseModalities: [Modality.AUDIO]
    },
    callbacks: {
      onmessage: () => {},
      onerror: (...args) => console.log("error:", args),
      onclose: (e) => console.log("closed", e)
    }
  });
  console.log("Connected");
  await new Promise(resolve => setTimeout(resolve, 3000));
  process.exit(0);
}
run().catch(console.error);
