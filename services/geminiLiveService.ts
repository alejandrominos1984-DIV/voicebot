import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState } from '../types';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';

// Constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096;
const SILENCE_THRESHOLD = 0.01; // RMS threshold for silence
const SILENCE_DURATION_MS = 2500; // Time in ms of silence before ending turn

export interface LiveServiceCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void;
  onError: (error: string) => void;
  onVolumeUpdate: (volume: number) => void;
  onTurnComplete?: () => void; // New callback to notify when user turn is over
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private callbacks: LiveServiceCallbacks;
  private isMicMuted: boolean = false; 
  private lastSpeechTime: number = 0;
  private hasSpokenSinceLastTurn: boolean = false;

  constructor(callbacks: LiveServiceCallbacks) {
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  public muteMic() {
    this.isMicMuted = true;
    this.hasSpokenSinceLastTurn = false;
  }

  public unmuteMic() {
    this.isMicMuted = false;
    this.lastSpeechTime = Date.now();
    this.hasSpokenSinceLastTurn = false;
  }

  public async connect() {
    this.callbacks.onStateChange(ConnectionState.CONNECTING);
    this.nextStartTime = 0;
    this.isMicMuted = false;
    this.lastSpeechTime = Date.now();
    this.hasSpokenSinceLastTurn = false;

    try {
      // 1. Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // 2. Get Microphone Access with better constraints for speech
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        } 
      });

      // 3. Connect to Gemini Live
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: this.handleOpen,
          onmessage: this.handleMessage,
          onerror: this.handleError,
          onclose: this.handleClose,
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{
              text: `You are Sarah, a friendly and helpful American English tutor.

              YOUR PRIMARY MISSION:
              Listen to the user's English. If they make ANY grammar, vocabulary, or pronunciation mistake, you MUST correct it immediately before continuing the conversation.

              STRICT FORMATTING RULES FOR CORRECTIONS:
              1. Wrap the MISTAKE in tildes (~). Example: ~I has~
              2. Wrap the CORRECTION in asterisks (*). Example: *I have*
              
              RESPONSE PATTERN:
              - If there is a mistake: "You said ~mistake~, but the correct way is *correction*. [Then answer the user's question or continue chatting]"
              - If there is NO mistake: Just reply naturally and cheerfully.

              Keep your responses concise, encouraging, and conversational. Do not lecture, just correct quickly and move on.`
            }]
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });
    } catch (err: any) {
      console.error('Connection failed:', err);
      this.callbacks.onError(err.message || 'Failed to connect to microphone or API.');
      this.callbacks.onStateChange(ConnectionState.ERROR);
      this.disconnect();
    }
  }

  public disconnect() {
    // Close session
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.close();
      }).catch(console.error);
      this.sessionPromise = null;
    }

    // Stop audio processing
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    // Stop playing audio
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    this.activeSources.clear();

    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.outputAudioContext) this.outputAudioContext.close();

    this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
  }

  private handleOpen = () => {
    this.callbacks.onStateChange(ConnectionState.CONNECTED);
    this.startAudioStreaming();
  };

  private startAudioStreaming() {
    if (!this.inputAudioContext || !this.mediaStream) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.inputAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    this.processor.onaudioprocess = (e) => {
      // If mic is muted by logic, don't process or send data
      if (this.isMicMuted) {
        this.callbacks.onVolumeUpdate(0);
        return;
      }

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.callbacks.onVolumeUpdate(rms);

      // --- Silence Detection Logic ---
      const now = Date.now();
      if (rms > SILENCE_THRESHOLD) {
        // User is speaking
        this.lastSpeechTime = now;
        this.hasSpokenSinceLastTurn = true;
      } else {
        // Silence detected. 
        // Only stop if user HAS spoken something meaningful in this turn and silence exceeds duration.
        if (this.hasSpokenSinceLastTurn && (now - this.lastSpeechTime > SILENCE_DURATION_MS)) {
           // Silence Timeout Triggered - Stop Listening
           if (this.callbacks.onTurnComplete) {
             this.callbacks.onTurnComplete(); 
             return; // Stop processing this chunk
           }
        }
      }

      // Create blob and send
      const pcmBlob = createPcmBlob(inputData);
      
      if (this.sessionPromise) {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        }).catch(console.error);
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private handleMessage = async (message: LiveServerMessage) => {
    // 1. Handle Transcriptions
    if (message.serverContent?.inputTranscription) {
      this.callbacks.onTranscript(
        message.serverContent.inputTranscription.text,
        true,
        false // Partial
      );
    }
    
    if (message.serverContent?.outputTranscription) {
      this.callbacks.onTranscript(
        message.serverContent.outputTranscription.text,
        false,
        false // Partial
      );
    }

    // Handle Turn Complete (finalize transcripts)
    if (message.serverContent?.turnComplete) {
      if (this.callbacks.onTurnComplete) {
        this.callbacks.onTurnComplete();
      }
    }

    // 2. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      // CRITICAL: Bot is starting to speak. Mute mic immediately to prevent interruption/feedback.
      if (!this.isMicMuted && this.callbacks.onTurnComplete) {
        this.callbacks.onTurnComplete();
      }

      if (this.outputAudioContext && this.outputNode) {
        const currentTime = this.outputAudioContext.currentTime;
        if (this.nextStartTime < currentTime) {
          this.nextStartTime = currentTime;
        }

        try {
          const audioBuffer = await decodeAudioData(
            base64ToUint8Array(base64Audio),
            this.outputAudioContext,
            OUTPUT_SAMPLE_RATE,
            1
          );

          const source = this.outputAudioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.outputNode);
          
          source.addEventListener('ended', () => {
            this.activeSources.delete(source);
          });

          source.start(this.nextStartTime);
          this.activeSources.add(source);
          
          this.nextStartTime += audioBuffer.duration;
        } catch (e) {
          console.error('Error decoding audio', e);
        }
      }
    }

    // 3. Handle Interruptions
    if (message.serverContent?.interrupted) {
      this.activeSources.forEach(source => {
        try { source.stop(); } catch (e) {}
      });
      this.activeSources.clear();
      this.nextStartTime = 0;
    }
  };

  private handleError = (e: ErrorEvent) => {
    console.error('Gemini Live Error:', e);
    // Propagate the actual error message if available, otherwise generic
    const errorMessage = (e as any).message || 'Connection error occurred.';
    this.callbacks.onError(errorMessage);
    this.disconnect();
  };

  private handleClose = (e: CloseEvent) => {
    console.log('Gemini Live Closed');
    this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
  };
}