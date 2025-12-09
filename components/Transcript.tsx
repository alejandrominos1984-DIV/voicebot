import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { GoogleGenAI } from '@google/genai';

// --- Assets ---
const TUTOR_AVATAR_URL = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1888&auto=format&fit=crop";

// --- Icons ---

const TranslateIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
  </svg>
);

// --- Utils ---

const translateText = async (text: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Translate the following text to Spanish accurately and naturally. Do not translate the parts inside ~tildes~ or *asterisks* literally if they are grammar corrections, but translate the meaning.\n\nText: "${text}"`,
    });
    return response.text || "Translation unavailable.";
  } catch (e) {
    console.error("Translation failed", e);
    return "Error translating text.";
  }
};

// --- Parsers ---

// Regex Parser for Colors
// ~error~  -> Red
// *correct* -> Green
const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  // Regex looks for ~...~ OR *...*
  const parts = text.split(/([~*].*?[~*])/g);

  return (
    <span>
      {parts.map((part, index) => {
        // Red (Error)
        if (part.startsWith('~') && part.endsWith('~')) {
          return (
            <span key={index} className="text-red-500 font-bold decoration-2 underline-offset-2 mx-1">
              {part.slice(1, -1)}
            </span>
          );
        }
        // Green (Correction) - Lighter/Brighter Green (green-400)
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <span key={index} className="text-green-400 font-extrabold mx-1 drop-shadow-sm tracking-wide">
              {part.slice(1, -1)}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

// --- Components ---

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    if (translation) {
      setTranslation(null); // Toggle off
      return;
    }
    
    setLoading(true);
    const cleanSource = msg.text.replace(/[~*]/g, '');
    const result = await translateText(cleanSource);
    setTranslation(result);
    setLoading(false);
  };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group animate-fade-in-up mb-6`}>
      <div className={`flex max-w-[95%] sm:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
        
        {/* Avatar - Fixed shrinking issue with flex-shrink-0 */}
        {isUser ? (
             <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold shadow-sm flex-shrink-0">
                 ME
             </div>
        ) : (
            <div className="relative flex-shrink-0">
                <img 
                    src={TUTOR_AVATAR_URL} 
                    alt="Tutor" 
                    className="w-10 h-10 rounded-full object-cover shadow-md border-2 border-white"
                />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></span>
            </div>
        )}

        {/* Bubble */}
        <div
          className={`relative px-5 py-3.5 text-[16px] leading-relaxed transition-all duration-200 shadow-sm ${
            isUser
              ? 'bg-blue-600 text-white rounded-[24px] rounded-br-[4px] shadow-blue-200'
              : 'bg-white text-gray-800 border border-blue-50 rounded-[24px] rounded-bl-[4px]'
          }`}
        >
          {/* Main Text */}
          <p className="whitespace-pre-wrap font-medium">
             <FormattedText text={msg.text} />
          </p>
          
          {/* Translation Area */}
          {(loading || translation) && (
            <div className={`mt-2 pt-2 border-t ${isUser ? 'border-white/20' : 'border-blue-50'}`}>
              {loading ? (
                <div className="flex items-center space-x-1.5 text-xs opacity-70">
                  <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <p className={`text-[14px] leading-snug animate-fade-in ${isUser ? 'text-blue-100' : 'text-blue-600'}`}>
                  {translation}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Button (Translate) - Always visible now */}
        {!isUser && (
            <button 
            onClick={handleTranslate}
            className="mb-2 p-1.5 text-blue-300 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
            title="Translate"
            >
              <TranslateIcon />
            </button>
        )}

      </div>
    </div>
  );
};

interface TranscriptProps {
  messages: ChatMessage[];
}

const Transcript: React.FC<TranscriptProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="relative mb-6">
            <div className="absolute inset-0 bg-blue-200 rounded-full blur-xl opacity-30 animate-pulse"></div>
            <img 
                src={TUTOR_AVATAR_URL}
                alt="Sarah" 
                className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl relative z-10"
            />
            <div className="absolute bottom-2 right-2 bg-white rounded-full p-2 shadow-lg z-20 text-xl">
                👋
            </div>
        </div>
        <div className="max-w-xs space-y-2">
            <h3 className="text-gray-800 font-bold text-2xl">Hi, I'm Sarah!</h3>
            <p className="text-gray-500 font-medium">
                I'm excited to help you learn English! Tap the button below to start chatting.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 scrollbar-hide">
      <div className="space-y-4 pb-4">
        {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>
      <div ref={bottomRef} className="h-2" />
    </div>
  );
};

export default Transcript;