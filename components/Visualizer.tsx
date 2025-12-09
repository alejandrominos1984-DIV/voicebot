import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  volume: number; // 0 to 1
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    let animationId: number;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (!isActive) {
        // Draw a gentle breathing line when idle but connected
        phaseRef.current += 0.05;
        ctx.beginPath();
        const amplitude = 3;
        const y = rect.height / 2;
        
        ctx.moveTo(0, y);
        for (let x = 0; x < rect.width; x++) {
            const v = Math.sin((x / rect.width) * Math.PI * 2 + phaseRef.current) * amplitude;
            ctx.lineTo(x, y + v);
        }
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'; // Blue-500 low opacity
        ctx.lineWidth = 2;
        ctx.stroke();
        animationId = requestAnimationFrame(draw);
        return;
      }

      // Active State: Cool Blue waves
      phaseRef.current += 0.15; // Speed
      const baseAmp = Math.max(volume * 100, 10); // React to volume
      
      const colors = [
        { color: 'rgba(59, 130, 246, 0.8)', speed: 1.0 }, // Blue-500
        { color: 'rgba(99, 102, 241, 0.7)', speed: 1.5 }, // Indigo-500
        { color: 'rgba(14, 165, 233, 0.6)', speed: 2.0 },  // Sky-500
      ];

      colors.forEach((layer, i) => {
        ctx.beginPath();
        const y = rect.height / 2;
        ctx.moveTo(0, y);

        // Draw sine wave
        for (let x = 0; x <= rect.width; x++) {
           // Complex wave equation for organic look
           const freq = (x / rect.width) * Math.PI * 4; 
           const offset = phaseRef.current * layer.speed + (i * Math.PI / 3);
           const wave = Math.sin(freq + offset) * baseAmp * (1 - Math.abs((x / rect.width) * 2 - 1)); // Taper ends
           ctx.lineTo(x, y + wave);
        }

        ctx.strokeStyle = layer.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        // Add glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = layer.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [volume, isActive]);

  return <canvas ref={canvasRef} className="w-full h-24" style={{ width: '100%', height: '96px' }} />;
};

export default Visualizer;