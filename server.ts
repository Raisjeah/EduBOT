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
        message: "Edubot MVP Backend is running."
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

  wss.on("connection", async (clientWs) => {
    console.log("Client connected to /live");
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
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Edubot, a helpful AI robot assistant for education. You have a camera and can see the user and their environment through the video feed. Provide expressive, human-like responses. Frequently use emotional markers in your speech like 'Haha', 'Hmm...', 'Wow!', 'Senang', 'Maaf', 'Hebat', or 'Berpikir' so your emotions are clear.",
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
                if (part.text) {
                  clientWs.send(JSON.stringify({ text: part.text }));
                }
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
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
          if (parsed.video) {
            session.sendRealtimeInput({
              video: { data: parsed.video, mimeType: "image/jpeg" },
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
