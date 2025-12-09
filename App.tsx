import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import { ConnectionState, ChatMessage } from './types';
import Visualizer from './components/Visualizer';
import Transcript from './components/Transcript';

const TUTOR_AVATAR_URL = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1888&auto=format&fit=crop";

// --- Icons ---

const MicIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const TapIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
    </svg>
);

// --- Helpers ---

const cleanTranscriptText = (text: string): string => {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/[\(\[]\s*(noise|silence|unintelligible|background noise|background)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\b(noise|silence|background)\b/gi, '');
  cleaned = cleaned.replace(/\*[^*]+\*/g, '');
  cleaned = cleaned.replace(/[<>]/g, '');
  cleaned = cleaned.replace(/[^\x20-\x7E\xA0-\xFF\u2000-\u206F]/g, '');
  return cleaned.replace(/\s+/g, ' ');
};

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isMicOn, setIsMicOn] = useState(false);
  const [volume, setVolume] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]); 

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleTurnComplete = useCallback(() => {
    if (serviceRef.current) {
        serviceRef.current.muteMic();
        setIsMicOn(false);
        setVolume(0); // Reset visualizer immediately
    }
  }, []);

  const toggleConnection = async () => {
    if (connectionState === ConnectionState.DISCONNECTED || connectionState === ConnectionState.ERROR) {
      setError(null);
      const service = new GeminiLiveService({
        onStateChange: (state) => {
            setConnectionState(state);
            if (state === ConnectionState.CONNECTED) {
                setIsMicOn(true);
            }
        },
        onVolumeUpdate: setVolume,
        onError: setError,
        onTurnComplete: handleTurnComplete,
        onTranscript: (text, isUser, isFinal) => {
             const cleanText = cleanTranscriptText(text);
             if (!cleanText.trim() && !isFinal) return; 
             setMessages(prev => {
                 const newMessages = [...prev];
                 const lastMessage = newMessages[newMessages.length - 1];
                 const role = isUser ? 'user' : 'model';
                 if (lastMessage && lastMessage.role === role) {
                     lastMessage.text += cleanText;
                     return newMessages;
                 } else {
                     if (!cleanText.trim()) return prev;
                     return [...newMessages, {
                         id: Date.now().toString(),
                         role,
                         text: cleanText.trimStart(),
                         isFinal,
                         timestamp: Date.now()
                     }];
                 }
             })
        }
      });
      serviceRef.current = service;
      await service.connect();
    } else {
        serviceRef.current?.disconnect();
        setConnectionState(ConnectionState.DISCONNECTED);
        setVolume(0);
        setIsMicOn(false);
    }
  };

  const handleMicToggle = () => {
      if (serviceRef.current && connectionState === ConnectionState.CONNECTED) {
          if (isMicOn) {
              serviceRef.current.muteMic();
              setIsMicOn(false);
          } else {
              serviceRef.current.unmuteMic();
              setIsMicOn(true);
          }
      }
  };

  const clearChat = () => {
    setMessages([]);
  };

  useEffect(() => {
    return () => {
      serviceRef.current?.disconnect();
    };
  }, []);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    // Background: Blue/Cool Gradient
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50 flex items-center justify-center p-4 font-sans text-gray-900">
      
      {/* Main Card - Increased Height to 85vh / 750px */}
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-[0_10px_40px_-10px_rgba(59,130,246,0.15)] overflow-hidden flex flex-col h-[85vh] sm:h-[750px] border border-blue-100 relative">
        
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center bg-white/80 backdrop-blur-md z-20 border-b border-blue-50 sticky top-0">
          <div className="flex items-center gap-3">
             <div className="relative">
                <img 
                    src={TUTOR_AVATAR_URL} 
                    alt="Sarah Tutor" 
                    className="w-12 h-12 rounded-full object-cover border-2 border-blue-100"
                />
                <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}></span>
             </div>
             <div>
                 <h1 className="text-xl font-bold tracking-tight text-gray-800">Sarah</h1>
                 <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">
                    {isConnected ? 'Online • Ready' : 'English Tutor'}
                 </p>
             </div>
          </div>
          
          <button 
            onClick={clearChat}
            className="w-10 h-10 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
            title="Clear Chat"
          >
            <TrashIcon />
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-red-50 border-b border-red-100 text-red-600 px-6 py-3 text-sm font-medium animate-fade-in flex items-center justify-center">
            {error}
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden relative bg-white">
            <Transcript messages={messages} />
        </div>

        {/* Dynamic Visualizer Area */}
        <div className="relative w-full h-24 shrink-0 bg-gradient-to-t from-white via-white to-transparent flex items-end justify-center z-10 pointer-events-none">
            {isConnected && <Visualizer volume={volume} isActive={isConnected && isMicOn} />}
        </div>

        {/* Control Center */}
        <div className="px-6 pb-6 pt-2 bg-white z-20 flex flex-col gap-3 items-center">
          
          {/* Main Interaction Button */}
          {isConnected ? (
             <button
                onClick={handleMicToggle}
                className={`w-full h-16 rounded-[24px] flex items-center justify-center gap-3 transition-all duration-300 transform active:scale-[0.98] shadow-lg ${
                    isMicOn 
                    ? 'bg-blue-50 text-blue-600 border-2 border-blue-200 animate-pulse' // Listening
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-300/50 hover:shadow-blue-400/60' // Action
                }`}
             >
                {isMicOn ? (
                    <>
                         <span className="font-bold text-lg">Listening...</span>
                    </>
                ) : (
                    <>
                        <TapIcon />
                        <span className="font-bold text-xl">Tap to Speak</span>
                    </>
                )}
             </button>
          ) : (
            // Start Session Button - Shiny Blue Gradient
            <button
                onClick={toggleConnection}
                disabled={isConnecting}
                className="w-full h-16 rounded-[24px] bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:via-blue-400 hover:to-cyan-400 text-white font-bold text-lg flex items-center justify-center gap-3 shadow-[0_4px_20px_rgba(59,130,246,0.4)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.5)] transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:shadow-none"
            >
                {isConnecting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Connecting...</span>
                    </>
                ) : (
                    <>
                      <MicIcon />
                      <span>Start Learning</span>
                    </>
                )}
            </button>
          )}

          {/* Secondary Action (End Session) - only when connected */}
          {isConnected && (
              <button 
                onClick={toggleConnection}
                className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1.5 py-1 px-3 rounded-full hover:bg-gray-50"
              >
                  <StopIcon /> End Session
              </button>
          )}

        </div>
      </div>
    </div>
  );
}