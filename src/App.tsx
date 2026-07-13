/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import RobotPlaceholder from './components/RobotPlaceholder';
import { pcmToBase64, base64ToFloat32 } from './lib/audio';
import { useRobotState } from './hooks/useRobotState';

export default function App() {
  const [health, setHealth] = useState<any>(null);
  const { robotState, emotion, startListening, stopListening, handleAudioPlaying, setIdle, analyzeTextForEmotion } = useRobotState();
  
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [robotConfig, setRobotConfig] = useState({
    name: 'Edubot V1',
    mode: 'Voice',
    ledColor: '#22d3ee'
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<number | null>(null);

  const [sessionLogs, setSessionLogs] = useState<{time: string, label: string, text: string, color: string}[]>([
    { time: '14:20:01', label: '[SYS]', text: 'INITIALIZED_SUCCESS', color: 'text-emerald-400/80' },
    { time: '14:20:05', label: '[SYS]', text: 'AWAITING_INPUT', color: 'text-[#D1D5DB]' }
  ]);

  const addLog = (label: string, text: string, color: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setSessionLogs(prev => [...prev, { time, label, text, color }]);
  };

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(err => console.error("Failed to fetch API:", err));

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/live`);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('[SYS]', 'LIVE_WS_CONNECTED', 'text-cyan-400');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          playAudioChunk(msg.audio);
        }
        if (msg.text) {
          addLog('[BOT]', msg.text, 'text-cyan-400');
          analyzeTextForEmotion(msg.text);
        }
        if (msg.interrupted) {
           nextStartTimeRef.current = 0;
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => {
      addLog('[SYS]', 'LIVE_WS_ERROR', 'text-red-400');
    }

    return () => {
      ws.close();
    };
  }, []);

  const playAudioChunk = (base64Audio: string) => {
    if (!outputAudioCtxRef.current) {
      outputAudioCtxRef.current = new window.AudioContext({ sampleRate: 24000 });
    }
    const ctx = outputAudioCtxRef.current;
    const float32Array = base64ToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32Array.length, 24000);
    buffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.05;
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
    
    // Update robot state to talking for the duration of this chunk
    handleAudioPlaying(buffer.duration * 1000);
  };

  const startRecording = async () => {
    startListening();
    addLog('[USER]', 'AUDIO_CAPTURE_STARTED', 'text-[#D1D5DB]');
    if (!inputAudioCtxRef.current) {
      inputAudioCtxRef.current = new window.AudioContext({ sampleRate: 16000 });
    }
    const ctx = inputAudioCtxRef.current;
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      videoIntervalRef.current = window.setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN && videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              const base64 = dataUrl.split(',')[1];
              wsRef.current.send(JSON.stringify({ video: base64 }));
            }
          }
        }
      }, 1000);

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const pcmData = e.inputBuffer.getChannelData(0);
          const base64 = pcmToBase64(pcmData);
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        }
      };
      
      (mediaStreamRef.current as any).processor = processor;
      (mediaStreamRef.current as any).source = source;
    } catch (err) {
      console.error(err);
      addLog('[ERR]', 'MIC_ACCESS_DENIED', 'text-red-500');
      setIdle();
    }
  };

  const stopRecording = () => {
    stopListening();
    addLog('[USER]', 'AUDIO_CAPTURE_STOPPED', 'text-[#5A5E67]');
    if (videoIntervalRef.current !== null) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      const source = (mediaStreamRef.current as any).source;
      const processor = (mediaStreamRef.current as any).processor;
      if (processor && source) {
        source.disconnect();
        processor.disconnect();
      }
      mediaStreamRef.current = null;
    }
  };

  return (
    <div className="w-full h-screen bg-[#0A0B0E] text-[#D1D5DB] font-sans overflow-hidden flex flex-col select-none">
      <header className="h-14 border-b border-[#2D2F36] flex items-center justify-between px-6 bg-[#111218]">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
          <h1 className="text-xs font-mono tracking-widest text-[#8E9299] uppercase">System.{robotConfig.name.replace(/\s+/g, '_')}</h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-[#5A5E67] uppercase font-bold tracking-tighter italic">Connectivity</span>
            <span className="text-[11px] font-mono text-emerald-400">LATENCY: 42ms</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-[#5A5E67] uppercase font-bold tracking-tighter italic">Logic Engine</span>
            <span className="text-[11px] font-mono text-[#D1D5DB]">GEMINI 1.5 PRO</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 relative bg-[#0F1016] overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>
          
          <div className="absolute inset-0 z-10">
            <Canvas camera={{ position: [0, 2, 5], fov: 45 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <Environment preset="city" />
              
              <RobotPlaceholder robotState={robotState} emotion={emotion} ledColor={robotConfig.ledColor} />
              
              <OrbitControls 
                enablePan={false} 
                minPolarAngle={Math.PI / 4} 
                maxPolarAngle={Math.PI / 2} 
                minDistance={2}
                maxDistance={10}
              />
            </Canvas>
          </div>

          <div className="absolute bottom-8 left-8 p-4 bg-black/40 backdrop-blur-md border border-[#2D2F36] rounded-lg z-20 pointer-events-none">
            <div className="flex gap-3 items-center mb-2">
              <div className={`w-2 h-2 rounded-full ${robotState !== 'idle' ? 'bg-red-500 animate-pulse' : 'bg-[#5A5E67]'}`}></div>
              <span className="text-[10px] font-mono uppercase tracking-widest">Vision Feed</span>
            </div>
            <div className="w-40 h-24 bg-[#151619] border border-[#2D2F36] flex items-center justify-center overflow-hidden relative">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              {!mediaStreamRef.current && (
                <div className="text-[10px] text-[#5A5E67] text-center font-mono relative z-10">
                  CAMERA_OFFLINE<br/>AWAITING_SIGNAL
                </div>
              )}
            </div>
          </div>

          <div className="absolute top-8 right-8 text-right z-20 pointer-events-none">
            <div className="text-[10px] text-[#5A5E67] font-mono uppercase">Coord_System</div>
            <div className="text-xs font-mono text-[#8E9299]">X: 104.2 | Y: 0.00 | Z: -12.4</div>
          </div>
        </section>

        <aside className="w-80 border-l border-[#2D2F36] bg-[#111218] flex flex-col z-20">
          <div className="p-4 border-b border-[#2D2F36]">
            <h2 className="text-[10px] font-mono text-[#5A5E67] uppercase tracking-[0.2em] mb-4 font-bold">Brain Activity</h2>
            <div className="space-y-3">
              <div className="p-2 bg-[#1A1C23] border border-[#2D2F36] rounded">
                <div className="text-[9px] text-cyan-400 mb-1 font-mono uppercase">System.Health</div>
                <p className="text-[11px] leading-relaxed italic text-[#D1D5DB]">API: {health ? health.status : "connecting..."} | DB: {health ? health.database : "connecting..."}</p>
              </div>
              <div className="p-2 bg-[#1A1C23] border border-[#2D2F36] rounded">
                <div className="text-[9px] text-[#5A5E67] mb-1 font-mono uppercase">Memory.Read</div>
                <p className="text-[11px] leading-relaxed text-[#8E9299]">Awaiting conversation context.</p>
              </div>
              <div className="p-2 bg-[#1A1C23] border border-[#2D2F36] rounded">
                <div className="text-[9px] text-emerald-400 mb-1 font-mono uppercase">Robot.State</div>
                <p className="text-[11px] leading-relaxed font-bold uppercase tracking-wider text-[#D1D5DB]">{robotState}</p>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-hidden">
            <h2 className="text-[10px] font-mono text-[#5A5E67] uppercase tracking-[0.2em] mb-4 font-bold">Session Log</h2>
            <div className="space-y-4 font-mono text-[10px] h-full overflow-y-auto pb-8 flex flex-col gap-2">
              {sessionLogs.map((log, i) => (
                <div key={i} className={`flex gap-2 ${log.color}`}>
                  <span className="opacity-50 shrink-0">{log.time}</span>
                  <span className="break-all">{log.label} {log.text}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="h-24 bg-[#0A0B0E] border-t border-[#2D2F36] flex items-center px-8 gap-12 z-20 relative">
        <div className="flex gap-4">
          <button className="w-14 h-14 rounded-full bg-[#1A1C23] border border-[#3A3D4A] flex items-center justify-center hover:bg-[#2D2F36] transition-colors cursor-pointer">
             <div className="w-6 h-6 border-2 border-cyan-400 rounded-sm"></div>
          </button>
          <button 
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`px-8 h-14 rounded-full border flex items-center gap-3 transition-all group cursor-pointer ${
              robotState === 'listening' 
                ? 'bg-cyan-500/30 border-cyan-400/60 text-white' 
                : 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/20'
            }`}
          >
            <div className={`w-3 h-3 rounded-full transition-transform ${robotState === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-cyan-400 group-hover:scale-110'}`}></div>
            <span className="text-xs font-mono uppercase tracking-widest font-bold">Hold to Speak</span>
          </button>
        </div>
        
        <div className="flex-1 flex gap-8 items-center justify-end">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[#5A5E67] uppercase font-bold tracking-widest">Current Mode</span>
            <div className="flex gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] rounded uppercase">Voice</span>
              <span className="px-2 py-0.5 bg-[#1A1C23] text-[#5A5E67] border border-[#2D2F36] text-[9px] rounded uppercase">Manual</span>
              <span className="px-2 py-0.5 bg-[#1A1C23] text-[#5A5E67] border border-[#2D2F36] text-[9px] rounded uppercase">Tasks</span>
            </div>
          </div>
          <div className="h-10 w-[1px] bg-[#2D2F36]"></div>
          <button 
            onClick={() => setIsConfigOpen(true)}
            className="text-[10px] font-mono text-[#5A5E67] uppercase hover:text-[#D1D5DB] transition-colors cursor-pointer">
            Open Config Panel _
          </button>
        </div>
      </footer>

      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111218] border border-[#2D2F36] shadow-2xl p-6 relative">
            <button 
              onClick={() => setIsConfigOpen(false)}
              className="absolute top-4 right-4 text-[#5A5E67] hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-sm font-mono text-white uppercase tracking-widest mb-6">System Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#8E9299] font-mono uppercase mb-2">Robot Name</label>
                <input 
                  type="text" 
                  value={robotConfig.name}
                  onChange={(e) => setRobotConfig({...robotConfig, name: e.target.value})}
                  className="w-full bg-[#1A1C23] border border-[#3A3D4A] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#8E9299] font-mono uppercase mb-2">Operating Mode</label>
                <select 
                  value={robotConfig.mode}
                  onChange={(e) => setRobotConfig({...robotConfig, mode: e.target.value})}
                  className="w-full bg-[#1A1C23] border border-[#3A3D4A] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors appearance-none"
                >
                  <option value="Standby">Standby</option>
                  <option value="Voice">Voice Control</option>
                  <option value="Manual">Manual Override</option>
                  <option value="Tasks">Task Execution</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-[#8E9299] font-mono uppercase mb-2">Primary LED Accent</label>
                <div className="flex gap-3">
                  {['#22d3ee', '#10b981', '#f43f5e', '#a855f7', '#eab308'].map(color => (
                    <button 
                      key={color}
                      onClick={() => setRobotConfig({...robotConfig, ledColor: color})}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${robotConfig.ledColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setIsConfigOpen(false)}
                className="px-6 py-2 bg-cyan-500/20 text-cyan-400 font-mono text-xs uppercase tracking-wider hover:bg-cyan-500/30 transition-colors cursor-pointer"
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

