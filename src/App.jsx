import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Generator Angka Acak Konsisten (Seeded RNG) ---
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// --- Komponen Penggaris Dinamis (Dynamic Ruler) ---
const Ruler = ({ type, pan, zoom, length, isDarkMode }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !length) return;
        const ctx = canvas.getContext('2d');
        const isH = type === 'h';
        
        canvas.width = isH ? length : 24;
        canvas.height = isH ? 24 : length;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = isDarkMode ? '#222222' : '#F9FAFB'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = isDarkMode ? '#999999' : '#6B7280'; 
        ctx.strokeStyle = isDarkMode ? '#555555' : '#D1D5DB'; 
        ctx.font = '9px sans-serif';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 1;

        const center = length / 2;
        const panOffset = isH ? pan.x : pan.y;
        
        let step = 10;
        if (zoom < 0.5) step = 20;
        if (zoom < 0.2) step = 50;
        if (zoom < 0.1) step = 100;
        if (zoom > 2) step = 5;
        if (zoom > 5) step = 1;

        const startCanvasPos = (0 - center - panOffset) / zoom;
        const endCanvasPos = (length - center - panOffset) / zoom;
        const start = Math.floor(startCanvasPos / step) * step;
        const end = Math.ceil(endCanvasPos / step) * step;

        ctx.beginPath();
        for (let val = start; val <= end; val += step) {
            const screenPos = Math.round(center + panOffset + (val * zoom)) + 0.5; 
            
            let tickLen = 4;
            const isMajor = Math.abs(val) % (step * 10) === 0 || val === 0;
            const isMid = Math.abs(val) % (step * 5) === 0;

            if (isMajor) tickLen = 12;
            else if (isMid) tickLen = 8;

            const x = isH ? screenPos : 24 - tickLen;
            const y = isH ? 24 - tickLen : screenPos;
            const ex = isH ? screenPos : 24;
            const ey = isH ? 24 : screenPos;

            ctx.moveTo(x, y);
            ctx.lineTo(ex, ey);

            if (isMajor) {
                ctx.save();
                if (isH) {
                    ctx.fillText(val.toString(), screenPos + 3, 2);
                } else {
                    ctx.translate(2, screenPos - 3);
                    ctx.rotate(-Math.PI / 2);
                    ctx.fillText(val.toString(), 0, 0);
                }
                ctx.restore();
            }
        }
        ctx.stroke();
    }, [type, pan, zoom, length, isDarkMode]);

    return (
        <canvas 
            ref={canvasRef} 
            className={`absolute top-0 left-0 w-full h-full ${type === 'h' ? 'cursor-row-resize' : 'cursor-col-resize'}`} 
        />
    );
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [image, setImage] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [seed, setSeed] = useState(12345);
  
  const [activeTool, setActiveTool] = useState('pan'); 
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushSize, setBrushSize] = useState(50);
  const [viewScale, setViewScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  
  const [guides, setGuides] = useState([]);
  const [draggingGuide, setDraggingGuide] = useState(null); 

  const maskPointsRef = useRef([]); 
  const isPaintingRef = useRef(false);
  const animationFrameId = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);

  const [scale, setScale] = useState(80); 
  const [complexity, setComplexity] = useState(60); 
  const [density, setDensity] = useState(65);       
  const [stretchInt, setStretchInt] = useState(72); 
  const [brutalInt, setBrutalInt] = useState(25); 
  const [stretchDirX, setStretchDirX] = useState(true);
  const [stretchDirY, setStretchDirY] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showTextAnnotations, setShowTextAnnotations] = useState(true);
  const [textColor, setTextColor] = useState('#00FFFF'); 
  
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [annoLang, setAnnoLang] = useState('EN'); 
  const [apiKeyInput, setApiKeyInput] = useState(''); 

  const fallbackWords = {
    'ID': ['GREEN', 'LEAF', 'NATURE', 'TEXT', 'SIMPLE', 'DESIGN', 'GRID', 'PLANT', 'BRANCH', 'FLAT', 'CLEAR', 'STRETCH'],
    'EN': ['GREEN', 'LEAF', 'NATURE', 'TEXT', 'SIMPLE', 'DESIGN', 'GRID', 'PLANT', 'BRANCH', 'FLAT', 'CLEAR', 'STRETCH'],
    'JP': ['緑', '葉', '自然', 'テキスト', 'シンプル', 'デザイン', 'グリッド', '植物', '枝', 'フラット', 'クリア', 'ストレッチ']
  };
  const [aiWords, setAiWords] = useState(fallbackWords['EN']);

  useEffect(() => {
    const updateSize = () => {
        if (viewportRef.current) {
            setViewportSize({ w: viewportRef.current.clientWidth, h: viewportRef.current.clientHeight });
        }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
  }, []);

  useEffect(() => {
     setAiWords(fallbackWords[annoLang]);
     handleRandomize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annoLang]);

  const processFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          setSeed(Math.random() * 10000); 
          maskPointsRef.current = []; 
          setViewScale(1);
          setPan({ x: 0, y: 0 });
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = (e) => processFile(e.target.files[0]);
  const handleRotate = () => { setRotation((prev) => (prev + 90) % 360); maskPointsRef.current = []; };
  const handleRandomize = () => setSeed(Math.random() * 10000);
  
  const handleExport = (format) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `grid-stretch-${Date.now()}.${format}`;
    link.href = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
    link.click();
  };

  // --- LOGIKA AI YANG SUDAH DIGANTI KE GEMINI 1.5 FLASH (TANPA MENGUBAH UI) ---
  const handleAiAnalysis = async () => {
    if (!image) return; 
    if (!apiKeyInput || apiKeyInput.trim() === '') { alert("Please enter your Gemini API Key first."); return; }
    setIsAiAnalyzing(true);
    
    try {
        const tempCanvas = document.createElement('canvas');
        const MAX_SIZE = 500; 
        let w = image.width; let h = image.height;
        if (w > MAX_SIZE || h > MAX_SIZE) { 
            const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h); 
            w *= ratio; h *= ratio; 
        }
        tempCanvas.width = w; tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, w, h);
        
        // Gemini membutuhkan raw base64 tanpa prefix "data:image/jpeg;base64,"
        const base64DataRaw = tempCanvas.toDataURL('image/jpeg', 0.5).split(',')[1]; 
        const apiKey = apiKeyInput.trim(); 
        const langMap = { 'ID': 'Indonesian', 'EN': 'English', 'JP': 'Japanese' };
        const promptText = `Analyze this image and provide exactly 12 single-word aesthetic keywords describing its main subjects, colors, or vibe. The words MUST be translated to ${langMap[annoLang]}. Return ONLY a comma-separated list of these words, in ALL CAPS.`;
        
        // Memanggil API Gemini versi terbaru (v1beta) dengan model 2.5-flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                contents: [
                    {
                        parts: [
                            { text: promptText },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: base64DataRaw
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    maxOutputTokens: 150,
                    temperature: 0.7
                }
            })
        });

        const data = await response.json();
        
        // Menangkap Eror Spesifik dari Google
        if (!response.ok) {
            throw new Error(data.error?.message || `API Error: ${response.status}`);
        }
        
        // Parsing Format Jawaban Gemini
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
            text = text.replace(/`/g, '').replace(/csv/g, '').trim();
            const words = text.split(',').map(w => w.trim().toUpperCase()).filter(w => w);
            if (words.length > 0) { 
                setAiWords(words); 
                alert("Gemini AI Analysis Successful!"); 
            }
        } else {
            throw new Error("Empty response from AI.");
        }
    } catch (err) {
        console.error("AI API Error:", err);
        alert(`Failed to analyze image via Gemini API.\n\nError: ${err.message}`);
        setAiWords(fallbackWords[annoLang]);
    } finally { 
        setIsAiAnalyzing(false); 
        handleRandomize(); 
    }
  };

  const handleWorkspacePointerDown = (e) => {
    if (!image) return;
    if (activeTool === 'pan') {
      setIsPanning(true);
      e.target.setPointerCapture(e.pointerId);
    } else if (activeTool === 'brush' && isManualMode) {
      isPaintingRef.current = true;
      e.target.setPointerCapture(e.pointerId);
      addMaskPoint(e);
    }
  };

  const handleWorkspacePointerMove = (e) => {
    if (draggingGuide) {
      e.preventDefault();
      const rect = viewportRef.current.getBoundingClientRect();
      const screenPos = draggingGuide.type === 'h' ? e.clientY - rect.top : e.clientX - rect.left;
      const center = draggingGuide.type === 'h' ? rect.height / 2 : rect.width / 2;
      const panOffset = draggingGuide.type === 'h' ? pan.y : pan.x;
      const canvasPos = (screenPos - center - panOffset) / viewScale;
      setGuides(prev => prev.map(g => g.id === draggingGuide.id ? { ...g, pos: canvasPos } : g));
    } 
    else if (isPanning) {
      setPan(prev => ({ x: prev.x + e.nativeEvent.movementX, y: prev.y + e.nativeEvent.movementY }));
    } 
    else if (isPaintingRef.current && activeTool === 'brush' && isManualMode) {
      addMaskPoint(e);
    }
  };

  const handleWorkspacePointerUp = (e) => {
    if (draggingGuide) {
      const rect = viewportRef.current.getBoundingClientRect();
      const screenPos = draggingGuide.type === 'h' ? e.clientY - rect.top : e.clientX - rect.left;
      if (screenPos < 0 || (draggingGuide.type === 'h' ? screenPos > rect.height : screenPos > rect.width)) {
          setGuides(prev => prev.filter(g => g.id !== draggingGuide.id));
      }
      setDraggingGuide(null);
    }
    if (isPanning) setIsPanning(false);
    if (isPaintingRef.current) isPaintingRef.current = false;
    e.target.releasePointerCapture(e.pointerId);
  };

  const startGuideFromRuler = (e, type) => {
    e.preventDefault();
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const screenPos = type === 'h' ? e.clientY - rect.top : e.clientX - rect.left;
    const center = type === 'h' ? rect.height / 2 : rect.width / 2;
    const panOffset = type === 'h' ? pan.y : pan.x;
    const canvasPos = (screenPos - center - panOffset) / viewScale;
    
    const newId = Date.now().toString();
    setGuides(prev => [...prev, { id: newId, type, pos: canvasPos }]);
    setDraggingGuide({ id: newId, type });
  };

  const addMaskPoint = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      maskPointsRef.current.push({ nx, ny, radius: brushSize });
      if (!animationFrameId.current) {
          animationFrameId.current = requestAnimationFrame(() => { drawCanvas(); animationFrameId.current = null; });
      }
  };

  const clearMask = () => { maskPointsRef.current = []; drawCanvas(); };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (!image) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width || 800; canvas.height = rect.height || 600;
      ctx.fillStyle = isDarkMode ? '#050505' : '#FFFFFF'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '24px sans-serif'; 
      ctx.fillStyle = isDarkMode ? '#555' : '#9CA3AF';
      ctx.fillText('Please upload an image from the left panel', canvas.width/2, canvas.height/2);
      return;
    }

    const rng = mulberry32(seed);
    const isRotated = rotation % 180 !== 0;
    
    canvas.width = isRotated ? image.height : image.width;
    canvas.height = isRotated ? image.width : image.height;
    const relScale = Math.max(1, canvas.width / 1000); 
    
    ctx.imageSmoothingEnabled = brutalInt < 50; 
    ctx.fillStyle = isDarkMode ? '#000000' : '#FFFFFF'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width; offscreen.height = canvas.height;
    const offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = isDarkMode ? '#000000' : '#FFFFFF'; 
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scaleFactor = scale / 100; 
    const drawW = Math.floor(image.width * scaleFactor);
    const drawH = Math.floor(image.height * scaleFactor);

    offCtx.save();
    offCtx.translate(centerX, centerY);
    offCtx.rotate((rotation * Math.PI) / 180);
    offCtx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    offCtx.restore();

    const numCols = Math.floor(10 + (complexity / 100) * 80);
    const numRows = Math.floor(10 + (complexity / 100) * 80);
    
    let xCuts = [0, canvas.width];
    for(let i = 0; i < numCols; i++) xCuts.push(Math.floor(rng() * canvas.width));
    xCuts.sort((a,b) => a - b);
    
    let yCuts = [0, canvas.height];
    for(let i = 0; i < numRows; i++) yCuts.push(Math.floor(rng() * canvas.height));
    yCuts.sort((a,b) => a - b);

    // SISTEM MULTIPLIER REGANGAN
    const stretchProb = Math.min(stretchInt, 100) / 100; 
    const stretchMultiplier = stretchInt > 100 ? 1 + ((stretchInt - 100) / 50) * 15 : 1;
    const pEmpty = (1 - (density / 100)) * 0.6; 
    const maxThick = Math.max(1, Math.floor((brutalInt / 100) * 20 * relScale)); 

    const checkMask = (testNX, testNY) => {
        if (maskPointsRef.current.length === 0) return false;
        const aspect = canvas.width / canvas.height;
        for (let pt of maskPointsRef.current) {
            const normRadius = (pt.radius / 100) * 0.10; 
            const dx = pt.nx - testNX; const dy = (pt.ny - testNY) / aspect; 
            if (Math.sqrt(dx*dx + dy*dy) < normRadius) return true;
        }
        return false;
    };

    // SISTEM RENDERING 2 LAPIS
    const normalPass = [];
    const stretchPass = [];

    for (let i = 0; i < xCuts.length - 1; i++) {
        for (let j = 0; j < yCuts.length - 1; j++) {
            const x = xCuts[i]; const y = yCuts[j];
            const w = xCuts[i+1] - x; const h = yCuts[j+1] - y;
            if (w < 1 || h < 1) continue;

            const dstW = w + 1; const dstH = h + 1;
            const cellCenterNX = (x + w / 2) / canvas.width;
            const cellCenterNY = (y + h / 2) / canvas.height;

            let applyStretch = false;
            let applyEmpty = false;

            if (isManualMode) {
                applyStretch = checkMask(cellCenterNX, cellCenterNY);
            } else {
                const r = rng();
                if (r < pEmpty) applyEmpty = true;
                else if (r < pEmpty + stretchProb) applyStretch = true;
            }

            if (applyEmpty) {
                normalPass.push({ type: 'empty', x, y, dstW, dstH });
            } 
            else if (applyStretch) {
                let isHoriz = rng() > 0.5;
                if (!stretchDirX && stretchDirY) isHoriz = false;
                if (stretchDirX && !stretchDirY) isHoriz = true;
                const isBrutal = rng() < (brutalInt / 100);

                let sliceW = Math.max(1, Math.floor(1 * relScale * 0.5)); 
                let sliceH = Math.max(1, Math.floor(1 * relScale * 0.5)); 
                let srcX = rng() > 0.5 ? x : (x + w - sliceW); 
                let srcY = rng() > 0.5 ? y : (y + h - sliceH); 

                if (isBrutal) {
                    if (isHoriz) {
                        sliceW = Math.floor(rng() * maxThick) + 1;
                        if (sliceW > w) sliceW = w;
                        if (rng() > 0.4) srcX = x + Math.floor(rng() * (w - sliceW));
                    } else {
                        sliceH = Math.floor(rng() * maxThick) + 1;
                        if (sliceH > h) sliceH = h;
                        if (rng() > 0.4) srcY = y + Math.floor(rng() * (h - sliceH));
                    }
                }
                if(srcX < x) srcX = x;
                if(srcY < y) srcY = y;

                stretchPass.push({ isHoriz, srcX, srcY, sliceW, sliceH, x, y, w, h, dstW, dstH });
            } else {
                normalPass.push({ type: 'normal', x, y, w, h, dstW, dstH });
            }
        }
    }

    normalPass.forEach(op => {
        if (op.type === 'empty') {
            ctx.fillStyle = isDarkMode ? '#000000' : '#FFFFFF';
            ctx.fillRect(op.x, op.y, op.dstW, op.dstH);
        } else {
            ctx.drawImage(offscreen, op.x, op.y, op.w, op.h, op.x, op.y, op.dstW, op.dstH);
        }
    });

    stretchPass.forEach(op => {
        if (op.isHoriz && stretchDirX) {
            const extendedW = op.dstW * stretchMultiplier;
            ctx.drawImage(offscreen, op.srcX, op.y, op.sliceW, op.h, op.x, op.y, extendedW, op.dstH);
        } else if (!op.isHoriz && stretchDirY) {
            const extendedH = op.dstH * stretchMultiplier;
            ctx.drawImage(offscreen, op.x, op.srcY, op.w, op.sliceH, op.x, op.y, op.dstW, extendedH);
        } else {
            ctx.drawImage(offscreen, op.x, op.y, op.w, op.h, op.x, op.y, op.dstW, op.dstH);
        }
    });

    if (showGridLines) {
        ctx.fillStyle = isDarkMode ? '#10B981' : '#000000';
        ctx.lineWidth = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.strokeStyle = isDarkMode ? 'rgba(16,185,129,0.3)' : 'rgba(0,0,0,0.3)';
        
        xCuts.forEach(x => {
           if(rng() > 0.8) { 
               if(isManualMode && !checkMask(x/canvas.width, 0.5)) return;
               ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); 
           }
        });
        yCuts.forEach(y => {
           if(rng() > 0.8) { 
               if(isManualMode && !checkMask(0.5, y/canvas.height)) return;
               ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); 
           }
        });

        for (let i = 0; i < 5; i++) {
            const bx = xCuts[Math.floor(rng() * (xCuts.length - 2))];
            const by = yCuts[Math.floor(rng() * (yCuts.length - 2))];
            if (isManualMode && !checkMask(bx/canvas.width, by/canvas.height)) continue;
            const bw = ((rng() > 0.5) ? (rng() * 100 + 20) : (xCuts[xCuts.indexOf(bx) + 1] - bx));
            const bh = ((rng() > 0.5) ? (rng() * 100 + 20) : (yCuts[yCuts.indexOf(by) + 1] - by));
            if (rng() > 0.3) ctx.fillRect(bx, by, bw, bh);
        }
    }

    if (showTextAnnotations) {
        ctx.textAlign = 'left';
        const maxAnnotations = Math.floor(15 * (density/100));
        let count = 0;
        const mainFont = Math.max(12, Math.floor(18 * relScale * 0.8));
        const subFont = Math.max(8, Math.floor(12 * relScale * 0.8));
        const spacing1 = Math.floor(10 * relScale * 0.8);
        const spacing2 = Math.floor(5 * relScale * 0.8);
        const spacing3 = Math.floor(8 * relScale * 0.8);
        const barWidth = Math.floor(45 * relScale * 0.8);
        const barHeight = Math.max(1, Math.floor(2 * relScale * 0.8));

        for (let j = 5; j < yCuts.length - 5; j+=2) {
            if (count >= maxAnnotations) break;
            if (rng() > 0.7) {
                const y = yCuts[j];
                const x = xCuts[Math.floor(rng() * (xCuts.length - 5)) + 2];
                if (isManualMode && !checkMask(x/canvas.width, y/canvas.height)) continue;
                
                const word = aiWords[Math.floor(rng() * aiWords.length)];
                const num = Math.floor(rng() * 50) + 1;
                
                ctx.fillStyle = textColor;
                ctx.font = `900 ${mainFont}px monospace`;
                ctx.fillText(word, x, y - spacing1);
                ctx.font = `${subFont}px monospace`;
                ctx.fillText(`${num}+`, x, y + spacing2);
                ctx.fillRect(x, y + spacing3, barWidth, barHeight);
                count++;
            }
        }
    }
  }, [image, rotation, seed, scale, complexity, density, stretchInt, brutalInt, stretchDirX, stretchDirY, showGridLines, showTextAnnotations, textColor, isManualMode, brushSize, aiWords, isDarkMode]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  return (
    <div className={`flex flex-col-reverse md:flex-row h-[100dvh] md:h-screen font-sans overflow-hidden transition-colors ${isDarkMode ? 'bg-[#050505] text-[#e5e5e5]' : 'bg-gray-100 text-gray-900'}`}>
      
      {/* --- PANEL KIRI --- */}
      <div className={`w-full md:w-[340px] h-[60dvh] md:h-full shadow-2xl flex flex-col z-10 overflow-y-auto border-t md:border-t-0 md:border-r flex-shrink-0 transition-colors duration-200 
                      ${isDarkMode ? 'bg-[#0a0a0a] border-[#222]' : 'bg-white border-gray-200'}`}>
        
        <div className={`p-6 border-b flex justify-between items-start transition-colors duration-200 ${isDarkMode ? 'bg-[#111] border-[#222]' : 'bg-gray-50 border-gray-100'}`}>
          <div>
            <h1 className={`text-xl font-bold tracking-tight font-mono ${isDarkMode ? 'text-[#10B981]' : 'text-gray-900'}`}>GRID STUDIO</h1>
            <p className={`text-xs mt-1 font-medium ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Generative Distortion Engine</p>
          </div>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-md transition-colors ${isDarkMode ? 'bg-[#333] hover:bg-[#444] text-yellow-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`} title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
             {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="p-6 flex-1 flex flex-col space-y-7">
          <div className="space-y-4">
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Image Operations</h2>
            <button onClick={() => fileInputRef.current.click()} className={`w-full py-3.5 rounded-lg font-bold transition shadow-lg active:scale-95 ${isDarkMode ? 'bg-[#10B981] text-black hover:bg-[#059669] shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-black text-white hover:bg-gray-800'}`}>
              Upload Image
            </button>
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
            <div className="flex space-x-3">
              <button onClick={handleRotate} className={`flex-1 text-sm py-2.5 rounded-md font-medium transition ${isDarkMode ? 'bg-[#222] text-[#ccc] hover:bg-[#333] border border-[#333]' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>↻ Rotate</button>
              <button onClick={handleRandomize} className={`flex-1 text-sm py-2.5 rounded-md font-medium transition ${isDarkMode ? 'bg-[#222] text-[#ccc] hover:bg-[#333] border border-[#333]' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>🔀 Randomize</button>
            </div>
            <div className="pt-2">
                <div className={`flex justify-between text-xs font-semibold mb-2 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>
                    <span>Image Scale (Bleed)</span>
                    <span className={`px-2 py-0.5 rounded font-mono ${isDarkMode ? 'bg-[#222] text-[#00FFFF]' : 'bg-gray-100 text-gray-600'}`}>{scale}%</span>
                </div>
                <input type="range" min="10" max="100" value={scale} onChange={(e) => setScale(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#10B981] ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} />
            </div>
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#222]' : 'border-gray-200'}`} />

          <div className="space-y-4">
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Effect Spread Mode</h2>
            <div className={`flex p-1 rounded-lg border ${isDarkMode ? 'bg-[#111] border-[#222]' : 'bg-gray-100 border-gray-100'}`}>
                <button onClick={() => { setIsManualMode(false); setActiveTool('pan'); handleRandomize(); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${!isManualMode ? (isDarkMode ? 'bg-[#222] text-[#10B981] shadow-sm border border-[#333]' : 'bg-white shadow-sm text-black') : (isDarkMode ? 'text-[#888] hover:text-[#ccc]' : 'text-gray-500 hover:text-gray-700')}`}>Auto (Random)</button>
                <button onClick={() => { setIsManualMode(true); setActiveTool('brush'); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${isManualMode ? (isDarkMode ? 'bg-[#222] text-[#10B981] shadow-sm border border-[#333]' : 'bg-white shadow-sm text-black') : (isDarkMode ? 'text-[#888] hover:text-[#ccc]' : 'text-gray-500 hover:text-gray-700')}`}>Manual (Brush)</button>
            </div>
            {isManualMode && (
                <div className={`p-4 border rounded-lg space-y-4 ${isDarkMode ? 'bg-[#0a0a0a] border-[#00FFFF]/30' : 'bg-blue-50 border-blue-100'}`}>
                    <p className={`text-[11px] font-medium leading-relaxed ${isDarkMode ? 'text-[#00FFFF]' : 'text-blue-700'}`}>🖌️ Swipe your cursor over the image to paint the effect.</p>
                    <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-2 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>
                            <span>Brush Size</span><span className={`${isDarkMode ? 'text-[#00FFFF] font-mono' : ''}`}>{brushSize}</span>
                        </div>
                        <input type="range" min="10" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#00FFFF] ${isDarkMode ? 'bg-[#222]' : 'bg-blue-200'}`} />
                    </div>
                    <button onClick={clearMask} className={`w-full text-[11px] py-2.5 rounded-md font-bold transition ${isDarkMode ? 'bg-[#222] border border-[#333] text-[#ccc] hover:bg-[#333]' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>🗑️ Clear Selection</button>
                </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#222]' : 'border-gray-200'}`} />

          <div className="space-y-3">
             <div className="flex items-center justify-between mb-2">
                 <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Auto Annotation</h2>
                 <div className={`flex p-1 rounded-md border ${isDarkMode ? 'bg-[#111] border-[#222]' : 'bg-gray-100 border-gray-100'}`}>
                     {['EN', 'JP', 'ID'].map(lang => (
                         <button key={lang} onClick={() => setAnnoLang(lang)} className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${annoLang === lang ? (isDarkMode ? 'bg-[#222] text-[#00FFFF] shadow-sm border border-[#333]' : 'bg-white shadow-sm text-black') : (isDarkMode ? 'text-[#888] hover:text-[#ccc]' : 'text-gray-400 hover:text-gray-600')}`}>{lang}</button>
                     ))}
                 </div>
             </div>
             <div>
                 <input type="password" placeholder="Gemini API Key (AQ...)" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className={`w-full text-xs p-2.5 border rounded-md focus:outline-none ${isDarkMode ? 'bg-[#111] border-[#333] text-white focus:border-[#10B981]' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'}`} />
                 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className={`text-[10px] mt-1.5 inline-block font-medium hover:underline ${isDarkMode ? 'text-[#00FFFF]' : 'text-blue-600'}`}>Get Free Gemini API Key here</a>
             </div>
             <div className="flex items-center gap-3 pt-1">
                 <div className={`flex-1 border rounded-lg p-2.5 flex justify-between items-center shadow-sm ${isDarkMode ? 'bg-[#111] border-[#333]' : 'bg-gray-50 border-gray-200'}`}>
                     <span className={`text-sm font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Auto Analysis</span>
                     <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${isDarkMode ? 'bg-[#222] text-[#10B981] border-[#10B981]/30' : 'bg-gray-800 text-white border-transparent'}`}>GEMINI</span>
                 </div>
                 <button onClick={handleAiAnalysis} disabled={isAiAnalyzing || !image} className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm flex items-center justify-center ${isAiAnalyzing || !image ? (isDarkMode ? 'bg-[#222] text-[#555] border border-[#333] cursor-not-allowed' : 'bg-gray-400 text-white cursor-not-allowed') : (isDarkMode ? 'bg-[#10B981] text-black hover:bg-[#059669] active:scale-95 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-gray-900 text-white hover:bg-black active:scale-95')}`}>
                     {isAiAnalyzing ? 'Scanning...' : 'Scan AI'}
                 </button>
             </div>
             <p className={`text-[11px] font-medium mt-1 ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Generated texts: <span className={`font-bold ${isDarkMode ? 'text-[#00FFFF]' : 'text-blue-500'}`}>{aiWords.length} words</span> ({annoLang}).</p>
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#222]' : 'border-gray-200'}`} />

          <div className="space-y-5">
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Slit-Scan Options</h2>
            <div>
                <div className={`flex justify-between text-xs font-semibold mb-2 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Cut Complexity</span><span className={`${isDarkMode ? 'text-[#10B981] font-mono' : ''}`}>{complexity}%</span></div>
                <input type="range" min="10" max="100" value={complexity} onChange={(e) => setComplexity(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#10B981] ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} />
            </div>
            <div>
                <div className={`flex justify-between text-xs font-semibold mb-2 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Density (Empty Gaps)</span><span className={`${isDarkMode ? 'text-[#10B981] font-mono' : ''}`}>{density}%</span></div>
                <input type="range" min="10" max="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#10B981] ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} disabled={isManualMode} />
            </div>
            <div>
                <div className={`flex justify-between text-xs font-semibold mb-2 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Stretch Intensity (Overshoot)</span><span className={`font-bold ${isDarkMode ? 'text-[#00FFFF] font-mono' : 'text-blue-500'}`}>{stretchInt}%</span></div>
                <input type="range" min="0" max="150" value={stretchInt} onChange={(e) => setStretchInt(Number(e.target.value))} className={`w-full h-1.5 rounded-lg cursor-pointer accent-[#00FFFF] ${isDarkMode ? 'bg-[#222]' : 'bg-blue-200'}`} />
            </div>
            <div>
                <div className={`flex justify-between text-xs font-semibold mb-2 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Brutal Distortion</span><span className={`font-bold ${isDarkMode ? 'text-red-500 font-mono' : 'text-red-500'}`}>{brutalInt}%</span></div>
                <input type="range" min="0" max="100" value={brutalInt} onChange={(e) => setBrutalInt(Number(e.target.value))} className={`w-full h-1.5 rounded-lg cursor-pointer accent-red-500 ${isDarkMode ? 'bg-[#222]' : 'bg-red-200'}`} />
            </div>
            <div className="flex items-center justify-between pt-2">
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Stretch Direction</span>
                <div className={`flex items-center space-x-1 text-[11px] font-mono font-bold p-1 rounded-md border ${isDarkMode ? 'bg-[#111] border-[#333]' : 'bg-gray-100 border-gray-200'}`}>
                    <button className={`px-3 py-1.5 rounded ${stretchDirX ? (isDarkMode ? 'bg-[#222] text-[#00FFFF] shadow-sm border border-[#444]' : 'bg-white shadow-sm text-black') : (isDarkMode ? 'text-[#888]' : 'text-gray-400')}`} onClick={() => setStretchDirX(!stretchDirX)}>H</button>
                    <button className={`px-3 py-1.5 rounded ${stretchDirY ? (isDarkMode ? 'bg-[#222] text-[#00FFFF] shadow-sm border border-[#444]' : 'bg-white shadow-sm text-black') : (isDarkMode ? 'text-[#888]' : 'text-gray-400')}`} onClick={() => setStretchDirY(!stretchDirY)}>V</button>
                </div>
            </div>
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#222]' : 'border-gray-200'}`} />

          <div className="space-y-4">
             <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Visuals & Annotations</h2>
             <label className="flex items-center justify-between cursor-pointer">
                 <span className={`text-sm font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Show Grid Lines & Blocks</span>
                 <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} className={`w-4.5 h-4.5 ${isDarkMode ? 'accent-[#10B981]' : 'accent-blue-600'}`} />
             </label>
             <div className="space-y-3">
                 <label className="flex items-center justify-between cursor-pointer">
                     <span className={`text-sm font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Show Annotation Text</span>
                     <input type="checkbox" checked={showTextAnnotations} onChange={(e) => setShowTextAnnotations(e.target.checked)} className={`w-4.5 h-4.5 ${isDarkMode ? 'accent-[#00FFFF]' : 'accent-blue-600'}`} />
                 </label>
                 {showTextAnnotations && (
                     <div className={`flex items-center justify-between pl-3 border-l-2 ml-1 ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
                         <span className={`text-xs font-medium ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Text Color</span>
                         <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-7 h-7 p-0 border-0 rounded cursor-pointer bg-transparent" />
                     </div>
                 )}
             </div>
          </div>
        </div>

        <div className={`p-6 border-t transition-colors duration-200 ${isDarkMode ? 'bg-[#111] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
           <div className="flex space-x-3">
              <button onClick={() => handleExport('png')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition active:scale-95 ${isDarkMode ? 'bg-[#00FFFF] text-black hover:bg-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.3)]' : 'bg-black text-white hover:bg-gray-800'}`}>Export PNG</button>
              <button onClick={() => handleExport('jpg')} className={`flex-1 border py-3 rounded-lg font-bold text-sm transition active:scale-95 ${isDarkMode ? 'border-[#333] bg-[#222] text-[#ccc] hover:bg-[#333]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>Export JPG</button>
           </div>
        </div>
      </div>

      {/* --- PANEL KANAN --- */}
      <div 
        className={`flex-1 relative overflow-hidden touch-none transition-colors duration-200 ${isDarkMode ? 'bg-[#050505]' : 'bg-[#E5E7EB]'}`}
        onPointerMove={handleWorkspacePointerMove}
        onPointerUp={handleWorkspacePointerUp}
        onPointerLeave={handleWorkspacePointerUp}
      >
         
         <div className={`absolute top-0 left-0 w-[24px] h-[24px] border-b border-r z-50 transition-colors ${isDarkMode ? 'bg-[#0a0a0a] border-[#222]' : 'bg-[#222] border-[#333]'}`}></div>

         <div 
            className={`absolute top-0 left-[24px] right-0 h-[24px] border-b z-40 overflow-hidden transition-colors ${isDarkMode ? 'bg-[#0a0a0a] border-[#222]' : 'bg-[#222] border-[#333]'}`}
            onPointerDown={(e) => startGuideFromRuler(e, 'h')}
         >
            <Ruler type="h" pan={pan} zoom={viewScale} length={viewportSize.w} isDarkMode={isDarkMode} />
         </div>

         <div 
            className={`absolute top-[24px] left-0 bottom-0 w-[24px] border-r z-40 overflow-hidden transition-colors ${isDarkMode ? 'bg-[#0a0a0a] border-[#222]' : 'bg-[#222] border-[#333]'}`}
            onPointerDown={(e) => startGuideFromRuler(e, 'v')}
         >
             <Ruler type="v" pan={pan} zoom={viewScale} length={viewportSize.h} isDarkMode={isDarkMode} />
         </div>

         <div 
            className="absolute top-[24px] left-[24px] right-0 bottom-0 overflow-hidden"
            ref={viewportRef}
            onPointerDown={handleWorkspacePointerDown}
            onWheel={(e) => {
                e.preventDefault();
                if (e.deltaY < 0) setViewScale(v => Math.min(v + 0.1, 5));
                else setViewScale(v => Math.max(v - 0.1, 0.1));
            }}
         >
            <div 
               style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`, transformOrigin: 'center' }}
               className={`w-full h-full flex items-center justify-center transition-transform duration-75
                           ${activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
            >
               <canvas ref={canvasRef} className={`shadow-[0_0_50px_rgba(0,0,0,0.8)] object-contain ${isDarkMode ? 'bg-[#050505]' : 'bg-white'}`} />
            </div>

            {guides.map(g => (
               <div 
                  key={g.id}
                  style={{ [g.type === 'h' ? 'top' : 'left']: (g.type === 'h' ? viewportSize.h/2 + pan.y + g.pos * viewScale : viewportSize.w/2 + pan.x + g.pos * viewScale) + 'px' }}
                  className={`absolute z-30 flex items-center justify-center
                             ${g.type === 'h' ? 'left-0 right-0 h-[7px] -mt-[3px] cursor-ns-resize' : 'top-0 bottom-0 w-[7px] -ml-[3px] cursor-ew-resize'}`}
                  onPointerDown={(e) => { e.stopPropagation(); setDraggingGuide({id: g.id, type: g.type}); }}
               >
                  <div className={`bg-[#00FFFF] shadow-[0_0_2px_#00FFFF] ${g.type === 'h' ? 'w-full h-[1px]' : 'h-full w-[1px]'}`}></div>
               </div>
            ))}
         </div>

         <div className={`absolute top-[44px] left-[44px] backdrop-blur-md border rounded-md shadow-2xl flex flex-col z-50 overflow-hidden ${isDarkMode ? 'bg-[#0a0a0a]/90 border-[#222]' : 'bg-[#2D2D2D]/95 border-[#444]'}`}>
            <button 
                className={`p-3 transition flex items-center justify-center ${activeTool==='pan' ? (isDarkMode ? 'bg-[#10B981] text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-[#888] hover:text-white hover:bg-[#222]' : 'text-gray-400 hover:text-white hover:bg-[#444]')}`}
                onClick={() => setActiveTool('pan')} title="Hand Tool (Pan Canvas)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="19 9 22 12 19 15"/><polyline points="9 19 12 22 15 19"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
            </button>
            <button 
                className={`p-3 transition flex items-center justify-center ${activeTool==='brush' ? (isDarkMode ? 'bg-[#10B981] text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-[#888] hover:text-white hover:bg-[#222]' : 'text-gray-400 hover:text-white hover:bg-[#444]')}`}
                onClick={() => { setActiveTool('brush'); setIsManualMode(true); }} title="Brush Tool (Paint Effect Area)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.35 2.22 1.45 3.02 1.45 2.67 0 4.81-2.16 4.81-4.83 0-1.66-1.34-3.02-3.01-3.02z"/></svg>
            </button>
            <div className={`h-[1px] w-full ${isDarkMode ? 'bg-[#222]' : 'bg-[#444]'}`}></div>
            <button 
                className="p-3 transition flex items-center justify-center text-red-500 hover:bg-red-500/20 hover:text-red-400"
                onClick={() => setGuides([])} title="Clear All Guides"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
         </div>

         <div className={`absolute bottom-6 right-6 backdrop-blur-md text-xs rounded shadow-2xl flex items-center border overflow-hidden z-50 ${isDarkMode ? 'bg-[#0a0a0a]/90 text-[#ccc] border-[#222]' : 'bg-[#2D2D2D]/95 text-gray-300 border-[#444]'}`}>
            <button className={`px-4 py-3 transition font-bold ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-[#444]'}`} onClick={() => setViewScale(v => Math.max(0.1, v - 0.1))}>—</button>
            <span className={`px-3 font-mono border-x min-w-[65px] text-center ${isDarkMode ? 'border-[#222] text-[#00FFFF]' : 'border-[#444]'}`}>{Math.round(viewScale * 100)}%</span>
            <button className={`px-4 py-3 transition font-bold ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-[#444]'}`} onClick={() => setViewScale(v => Math.min(5, v + 0.1))}>+</button>
            <button className={`px-4 py-3 transition font-semibold ${isDarkMode ? 'hover:bg-[#222] text-[#10B981]' : 'hover:bg-[#444] text-blue-400'}`} onClick={() => { setViewScale(1); setPan({x:0, y:0}); }}>Reset</button>
         </div>

      </div>
    </div>
  );
}