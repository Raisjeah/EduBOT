# EDUBOT MVP ARCHITECTURE

## Overview
This document outlines the architecture for the Edubot MVP, built within the AI Studio environment. The goal is to validate the "brain" of the physical robot (conversation, expression, vision, memory) entirely in the browser, using an architecture that can be easily ported to hardware (Raspberry Pi + ROS 2) in the future.

## Tech Stack (Adapted for MVP Environment)
Due to the containerized environment constraints (single port exposed), the architecture has been adapted while preserving the strict separation of concerns requested:

*   **Frontend**: React + Vite + TypeScript (replaces Next.js for the MVP sandbox, but uses the same React paradigm)
*   **3D Rendering**: React Three Fiber + drei
*   **Backend**: Express + TypeScript (replaces Python FastAPI for the MVP sandbox to allow co-hosting on the same port, exposing identical REST APIs)
*   **Database**: MongoDB Atlas (using the official Node.js driver)
*   **LLM & AI**: Google Gemini via `@google/genai`
*   **Styling**: TailwindCSS

## System Architecture

```text
[Browser: React SPA + R3F]
   ├─ Mic/Webcam capture
   ├─ Gemini Live API (voice in/out)
   ├─ 3D Avatar render + expression state machine
   └─ REST/WebSocket calls ke backend:
        ├─ Vision analysis
        ├─ Intent parsing & action planning
        ├─ Memory read/write
        └─ Config read/write

[Backend: Express Node.js Server]
   ├─ /api/chat     -> proses teks, panggil Gemini, return response + intent
   ├─ /api/vision   -> terima frame/image, deteksi objek
   ├─ /api/memory   -> CRUD riwayat percakapan & preferensi user
   ├─ /api/config   -> CRUD setting robot
   └─ /api/action   -> terima intent terstruktur, return "virtual action"

[MongoDB Atlas]
   ├─ collection: conversations
   ├─ collection: robot_config
   ├─ collection: memory
   └─ collection: action_logs
```

## Directory Structure
*   `/src`: Frontend React code.
    *   `/src/components`: React components (e.g., 3D Avatar).
    *   `/src/shared`: Shared types and interfaces.
*   `/server.ts`: Backend Express server and API routes.
*   `/src/lib/db.ts`: MongoDB connection logic.

## Principles
**Separation of Decision and Execution**: The decision layer (intent parsing) is handled by the backend APIs, which return structured intents. The execution layer (currently virtual movement/expression) interprets these intents. This allows swapping the virtual executor with a physical hardware executor later without changing the AI logic.
