import { useState, useRef } from 'react';

export type RobotState = 'idle' | 'listening' | 'thinking' | 'talking' | 'off';
export type Emotion = 'default' | 'happy' | 'sad' | 'angry' | 'thinking';

export function useRobotState() {
  const [robotState, setRobotState] = useState<RobotState>('off');
  const [emotion, setEmotion] = useState<Emotion>('default');
  const talkingTimeoutRef = useRef<number | null>(null);

  const startListening = () => {
    if (talkingTimeoutRef.current) {
      window.clearTimeout(talkingTimeoutRef.current);
    }
    setRobotState('listening');
    setEmotion('default');
  };
  
  const stopListening = () => {
    setRobotState('thinking');
    setEmotion('thinking');
  };
  
  const setIdle = () => {
    if (talkingTimeoutRef.current) {
      window.clearTimeout(talkingTimeoutRef.current);
    }
    setRobotState('idle');
    setEmotion('default');
  };

  const turnOff = () => {
    if (talkingTimeoutRef.current) {
      window.clearTimeout(talkingTimeoutRef.current);
    }
    setRobotState('off');
    setEmotion('default');
  };

  const turnOn = () => {
    setRobotState('idle');
    setEmotion('default');
  };
  
  const handleAudioPlaying = (durationMs: number) => {
    setRobotState('talking');
    if (talkingTimeoutRef.current) {
      window.clearTimeout(talkingTimeoutRef.current);
    }
    talkingTimeoutRef.current = window.setTimeout(() => {
      setRobotState(current => current === 'talking' ? 'idle' : current);
      setEmotion('default');
    }, durationMs);
  };
  
  const analyzeTextForEmotion = (text: string) => {
    const lowerText = text.toLowerCase();
    if (lowerText.match(/(marah|kesal|bodoh|jangan|stop|berhenti)/)) {
      setEmotion('angry');
    } else if (lowerText.match(/(haha|hehe|hihi|senang|ceria|bagus|hebat|terima kasih|wow|keren)/)) {
      setEmotion('happy');
    } else if (lowerText.match(/(maaf|sedih|sayang sekali|gagal)/)) {
      setEmotion('sad');
    } else if (lowerText.match(/(\?|bagaimana|apa|kenapa|mengapa|hmm)/)) {
      setEmotion('thinking');
    }
  };

  return { 
    robotState, 
    emotion,
    startListening, 
    stopListening, 
    setIdle, 
    turnOn,
    turnOff,
    handleAudioPlaying,
    analyzeTextForEmotion
  };
}

