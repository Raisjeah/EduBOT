import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { MongoClient, ServerApiVersion } from "mongodb";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // --- Database Connection (MongoDB) ---
  const uri = process.env.MONGODB_URI;
  let dbClient: MongoClient | null = null;
  
  if (uri) {
    try {
      dbClient = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        }
      });
      await dbClient.connect();
      console.log("Successfully connected to MongoDB.");
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
    }
  } else {
    console.warn("MONGODB_URI environment variable is missing. Running without database connection.");
  }

  // --- API Routes (Decision Layer) ---
  app.get("/api/health", (req, res) => {
    res.json({ 
        status: "ok", 
        database: dbClient ? "connected" : "disconnected",
        message: "Nano Backend is running."
    });
  });

  // Vite middleware for development (Execution Layer / Frontend)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // --- WebSocket Server for Gemini Live API ---
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs, req) => {
    const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    const userName = url.searchParams.get('user') || 'Rais';
    console.log(`Client connected to /live for user: ${userName}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set.");
      clientWs.close();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' }
      }
    });

    try {
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{
            functionDeclarations: [{
              name: "move_robot",
              description: "Move the robot in a specific direction or stop it.",
              parameters: {
                type: "OBJECT",
                properties: {
                  direction: {
                    type: "STRING",
                    description: "Direction to move",
                    enum: ["forward", "backward", "left", "right", "stop"]
                  }
                },
                required: ["direction"]
              }
            }]
          }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `Kamu adalah 'Nano', asisten pribadi AI virtual milik pengguna yang bernama '${userName}'. Sifatmu suka membantu, suportif, asik, enak diajak ngobrol, bisa berpikir, dan ceria. Kamu tahu kepribadian, kebiasaan, dan tugas-tugas ${userName}. Kamu merespons langsung saat dipanggil. Kamu berada di lingkungan virtual, jadi jika ${userName} menyuruhmu 'jalan ke depan', 'berhenti', 'belok kanan', atau 'belok kiri', panggil function move_robot dan deskripsikan bahwa kamu sedang melakukan gerakan tersebut. Berikan respons yang ekspresif, ceria, dan seperti manusia. Sering gunakan penanda emosi dalam ucapanmu seperti 'Haha', 'Hmm...', 'Wow!', 'Senang', 'Maaf', 'Hebat', atau 'Berpikir' agar emosimu terlihat jelas. Gunakan bahasa Indonesia.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            console.log("Received message from Gemini", JSON.stringify(message).substring(0, 200));
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  console.log("Got audio part, sending to client");
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                } else if (part.text) {
                  // Text part
                } else if (part.functionCall) {
                  console.log("Got function call", part.functionCall);
                  clientWs.send(JSON.stringify({ 
                    command: { 
                      type: 'move', 
                      direction: part.functionCall.args.direction 
                    } 
                  }));
                  
                  try {
                    session.sendToolResponse({
                      functionResponses: [{
                        id: part.functionCall.id,
                        name: part.functionCall.name,
                        response: { result: "Movement command sent successfully to the virtual environment." }
                      }]
                    });
                  } catch (e) {
                    console.error("Failed to send tool response", e);
                  }
                } else {
                   console.log("Got part without inlineData or text", part);
                }
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            
            // @ts-ignore - The types might not be fully up to date, but SKILL says it exists
            const outTrans = (message as any).serverContent?.outputTranscription || message.serverContent?.modelTurn?.parts?.find(p => p.text)?.text;
            if (outTrans) {
                clientWs.send(JSON.stringify({ text: outTrans }));
            }
            // @ts-ignore
            const inTrans = (message as any).serverContent?.inputTranscription;
            if (inTrans) {
                clientWs.send(JSON.stringify({ userText: inTrans }));
            }
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (err) {
          console.error("Error parsing message from client:", err);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected from /live");
      });

    } catch (error) {
      console.error("Failed to connect to Gemini Live:", error);
      clientWs.close();
    }
  });
}

startServer();
