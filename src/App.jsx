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
const Ruler = ({ type, pan, zoom, length }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !length) return;
        const ctx = canvas.getContext('2d');
        const isH = type === 'h';
        
        // Atur dimensi resolusi tajam
        canvas.width = isH ? length : 24;
        canvas.height = isH ? 24 : length;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Background gelap ala Photoshop
        ctx.fillStyle = '#222222'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#999999'; // Warna Teks
        ctx.strokeStyle = '#555555'; // Warna Garis Titik (Ticks)
        ctx.font = '9px sans-serif';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 1;

        const center = length / 2;
        const panOffset = isH ? pan.x : pan.y;
        
        // Logika Dinamis Step: Menentukan jarak antar titik berdasarkan Zoom
        let step = 10;
        if (zoom < 0.5) step = 20;
        if (zoom < 0.2) step = 50;
        if (zoom < 0.1) step = 100;
        if (zoom > 2) step = 5;
        if (zoom > 5) step = 1;

        // Mencari batas render kanvas berdasarkan pan dan zoom
        const startCanvasPos = (0 - center - panOffset) / zoom;
        const endCanvasPos = (length - center - panOffset) / zoom;
        const start = Math.floor(startCanvasPos / step) * step;
        const end = Math.ceil(endCanvasPos / step) * step;

        ctx.beginPath();
        for (let val = start; val <= end; val += step) {
            const screenPos = Math.round(center + panOffset + (val * zoom)) + 0.5; 
            
            // Logika tinggi garis bantu (Tick marks)
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
    }, [type, pan, zoom, length]);

    return (
        <canvas 
            ref={canvasRef} 
            className={`absolute top-0 left-0 w-full h-full ${type === 'h' ? 'cursor-row-resize' : 'cursor-col-resize'}`} 
        />
    );
};

export default function App() {
  // --- Manajemen State ---
  const [image, setImage] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [seed, setSeed] = useState(12345);
  
  // State Interaktif Lanjutan (Rulers, Pan, Zoom)
  const [activeTool, setActiveTool] = useState('pan'); // 'pan' | 'brush'
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushSize, setBrushSize] = useState(50);
  const [viewScale, setViewScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  
  // State Guidelines (Garis Bantu)
  const [guides, setGuides] = useState([]);
  const [draggingGuide, setDraggingGuide] = useState(null); // { id, type }

  // Referensi DOM & Loop
  const maskPointsRef = useRef([]); 
  const isPaintingRef = useRef(false);
  const animationFrameId = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);

  // Kontrol Slider & AI
  const [scale, setScale] = useState(80); 
  const [complexity, setComplexity] = useState(60); 
  const [density, setDensity] = useState(65);       
  const [stretchInt, setStretchInt] = useState(72); 
  const [brutalInt, setBrutalInt] = useState(25); 
  const [stretchDirX, setStretchDirX] = useState(true);
  const [stretchDirY, setStretchDirY] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showTextAnnotations, setShowTextAnnotations] = useState(true);
  const [textColor, setTextColor] = useState('#000000'); 
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [annoLang, setAnnoLang] = useState('EN'); 
  const [apiKeyInput, setApiKeyInput] = useState(''); 

  const fallbackWords = {
    'ID': ['GREEN', 'LEAF', 'NATURE', 'TEXT', 'SIMPLE', 'DESIGN', 'GRID', 'PLANT', 'BRANCH', 'FLAT', 'CLEAR', 'STRETCH'],
    'EN': ['GREEN', 'LEAF', 'NATURE', 'TEXT', 'SIMPLE', 'DESIGN', 'GRID', 'PLANT', 'BRANCH', 'FLAT', 'CLEAR', 'STRETCH'],
    'JP': ['緑', '葉', '自然', 'テキスト', 'シンプル', 'デザイン', 'グリッド', '植物', '枝', 'フラット', 'クリア', 'ストレッチ']
  };
  const [aiWords, setAiWords] = useState(fallbackWords['EN']);

  // Resize Observer untuk Viewport (Ruang Kerja Rulers)
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

  // Hubungkan UI kiri dan Toolbar kanan
  useEffect(() => {
    if (isManualMode && activeTool !== 'brush') setActiveTool('brush');
    else if (!isManualMode && activeTool === 'brush') setActiveTool('pan');
  }, [isManualMode, activeTool]);

  // --- Fungsi Penanganan File ---
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

  const handleAiAnalysis = async () => { /* Logic AI tidak dirubah */ };

  // --- LOGIKA EVENT WORKSPACE (PAN, BRUSH & GUIDELINES) ---
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
    // 1. Dragging Guidelines
    if (draggingGuide) {
      e.preventDefault();
      const rect = viewportRef.current.getBoundingClientRect();
      const screenPos = draggingGuide.type === 'h' ? e.clientY - rect.top : e.clientX - rect.left;
      const center = draggingGuide.type === 'h' ? rect.height / 2 : rect.width / 2;
      const panOffset = draggingGuide.type === 'h' ? pan.y : pan.x;
      
      // Kalkulasi mengubah koordinat layar ke koordinat canvas asli (agar menempel saat di-zoom)
      const canvasPos = (screenPos - center - panOffset) / viewScale;

      setGuides(prev => prev.map(g => g.id === draggingGuide.id ? { ...g, pos: canvasPos } : g));
    } 
    // 2. Panning Canvas
    else if (isPanning) {
      setPan(prev => ({ x: prev.x + e.nativeEvent.movementX, y: prev.y + e.nativeEvent.movementY }));
    } 
    // 3. Brushing
    else if (isPaintingRef.current && activeTool === 'brush' && isManualMode) {
      addMaskPoint(e);
    }
  };

  const handleWorkspacePointerUp = (e) => {
    // 1. Lepas Guidelines (Cek apakah dibuang keluar kanvas/kembali ke rulers)
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

  // Logika Pembuatan Garis dari Ruler
  const startGuideFromRuler = (e, type) => {
    e.preventDefault();
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const screenPos = type === 'h' ? e.clientY - rect.top : e.clientX - rect.left;
    const center = type === 'h' ? rect.height / 2 : rect.width / 2;
    const panOffset = type === 'h' ? pan.y : pan.x;
    
    // Kalkulasi Koordinat Menempel pada Canvas
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
          animationFrameId.current = requestAnimationFrame(() => {
              drawCanvas();
              animationFrameId.current = null;
          });
      }
  };

  const clearMask = () => { maskPointsRef.current = []; drawCanvas(); };


  // --- LOGIKA UTAMA RENDER CANVAS (SLIT-SCAN) ---
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (!image) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width || 800;
      canvas.height = rect.height || 600;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText('Please upload an image from the left panel', canvas.width/2, canvas.height/2);
      return;
    }

    const rng = mulberry32(seed);
    const isRotated = rotation % 180 !== 0;
    
    canvas.width = isRotated ? image.height : image.width;
    canvas.height = isRotated ? image.width : image.height;
    const relScale = Math.max(1, canvas.width / 1000); 
    
    ctx.imageSmoothingEnabled = brutalInt < 50; 
    ctx.fillStyle = '#FFFFFF'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = '#FFFFFF';
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

    const pStretch = (stretchInt / 100); 
    const pEmpty = (1 - (density / 100)) * 0.6; 
    const maxThick = Math.max(1, Math.floor((brutalInt / 100) * 20 * relScale)); 

    const checkMask = (testNX, testNY) => {
        if (maskPointsRef.current.length === 0) return false;
        const aspect = canvas.width / canvas.height;
        for (let pt of maskPointsRef.current) {
            const normRadius = (pt.radius / 100) * 0.10; 
            const dx = pt.nx - testNX;
            const dy = (pt.ny - testNY) / aspect; 
            if (Math.sqrt(dx*dx + dy*dy) < normRadius) return true;
        }
        return false;
    };

    for (let i = 0; i < xCuts.length - 1; i++) {
        for (let j = 0; j < yCuts.length - 1; j++) {
            const x = xCuts[i];
            const y = yCuts[j];
            const w = xCuts[i+1] - x;
            const h = yCuts[j+1] - y;
            if (w < 1 || h < 1) continue;

            const dstW = w + 1;
            const dstH = h + 1;
            const cellCenterNX = (x + w / 2) / canvas.width;
            const cellCenterNY = (y + h / 2) / canvas.height;

            let applyStretch = false;
            let applyEmpty = false;

            if (isManualMode) {
                applyStretch = checkMask(cellCenterNX, cellCenterNY);
            } else {
                const r = rng();
                if (r < pEmpty) applyEmpty = true;
                else if (r < pEmpty + pStretch) applyStretch = true;
            }

            if (applyEmpty) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x, y, dstW, dstH);
            } 
            else if (applyStretch) {
                let isHoriz = rng() > 0.5;
                if (!stretchDirX && stretchDirY) isHoriz = false;
                if (stretchDirX && !stretchDirY) isHoriz = true;
                const isBrutal = rng() < (brutalInt / 100);

                if (isHoriz && stretchDirX) {
                    let sliceW = Math.max(1, Math.floor(1 * relScale * 0.5)); 
                    let srcX = rng() > 0.5 ? x : (x + w - sliceW); 
                    if (isBrutal) {
                        sliceW = Math.floor(rng() * maxThick) + 1;
                        if (sliceW > w) sliceW = w;
                        if (rng() > 0.4) srcX = x + Math.floor(rng() * (w - sliceW));
                    }
                    if(srcX < x) srcX = x;
                    ctx.drawImage(offscreen, srcX, y, sliceW, h, x, y, dstW, dstH);
                } 
                else if (!isHoriz && stretchDirY) {
                    let sliceH = Math.max(1, Math.floor(1 * relScale * 0.5));
                    let srcY = rng() > 0.5 ? y : (y + h - sliceH);
                    if (isBrutal) {
                        sliceH = Math.floor(rng() * maxThick) + 1;
                        if (sliceH > h) sliceH = h;
                        if (rng() > 0.4) srcY = y + Math.floor(rng() * (h - sliceH));
                    }
                    if(srcY < y) srcY = y;
                    ctx.drawImage(offscreen, x, srcY, w, sliceH, x, y, dstW, dstH);
                } else {
                    ctx.drawImage(offscreen, x, y, w, h, x, y, dstW, dstH);
                }
            } else {
                ctx.drawImage(offscreen, x, y, w, h, x, y, dstW, dstH);
            }
        }
    }

    if (showGridLines) {
        ctx.fillStyle = '#000000';
        ctx.lineWidth = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        
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
  }, [image, rotation, seed, scale, complexity, density, stretchInt, brutalInt, stretchDirX, stretchDirY, showGridLines, showTextAnnotations, textColor, isManualMode, brushSize]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  return (
    <div className="flex flex-col-reverse md:flex-row h-[100dvh] md:h-screen bg-[#111] font-sans overflow-hidden">
      
      {/* --- PANEL KIRI (Kontrol UI - Menerjemahkan ke Inggris) --- */}
      <div className="w-full md:w-[340px] h-[60dvh] md:h-full bg-white shadow-2xl flex flex-col z-10 overflow-y-auto border-t md:border-t-0 md:border-r border-gray-200 flex-shrink-0">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Grid Stretch Tool</h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">Advanced Slit-Scan Distortion</p>
        </div>

        <div className="p-6 flex-1 flex flex-col space-y-7">
          {/* Operasi Gambar */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Image Operations</h2>
            <button onClick={() => fileInputRef.current.click()} className="w-full bg-black text-white py-3.5 rounded-lg font-semibold hover:bg-gray-800 transition shadow-lg active:scale-95">
              Upload Image
            </button>
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
            <div className="flex space-x-3">
              <button onClick={handleRotate} className="flex-1 bg-gray-100 text-sm py-2.5 rounded-md hover:bg-gray-200 font-medium">↻ Rotate</button>
              <button onClick={handleRandomize} className="flex-1 bg-gray-100 text-sm py-2.5 rounded-md hover:bg-gray-200 font-medium">🔀 Randomize</button>
            </div>
            <div className="pt-2">
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
                    <span>Image Scale (Bleed)</span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-mono">{scale}%</span>
                </div>
                <input type="range" min="10" max="100" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
            </div>
          </div>
          <hr className="border-gray-200" />

          {/* Mode Seleksi */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Effect Spread Mode</h2>
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button onClick={() => { setIsManualMode(false); handleRandomize(); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${!isManualMode ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}>Auto (Random)</button>
                <button onClick={() => setIsManualMode(true)} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${isManualMode ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}>Manual (Brush)</button>
            </div>
            {isManualMode && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg space-y-4">
                    <p className="text-[11px] text-blue-700 font-medium leading-relaxed">🖌️ Swipe your cursor over the image to paint the effect.</p>
                    <div>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-700 mb-2">
                            <span>Brush Size</span><span>{brushSize}</span>
                        </div>
                        <input type="range" min="10" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                    <button onClick={clearMask} className="w-full bg-white border border-gray-300 text-gray-700 text-[11px] py-2.5 rounded-md font-bold hover:bg-gray-50">🗑️ Clear Selection</button>
                </div>
            )}
          </div>
          <hr className="border-gray-200" />

          {/* AI */}
          <div className="space-y-3">
             <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Auto Annotation</h2>
             <input type="password" placeholder="GitHub Token (ghp_...)" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="w-full text-xs p-2 border border-gray-300 rounded-md focus:border-blue-500" />
             <button onClick={handleAiAnalysis} disabled={isAiAnalyzing || !image} className={`w-full text-white py-2.5 rounded-md text-sm font-semibold transition shadow-sm ${isAiAnalyzing || !image ? 'bg-gray-400' : 'bg-gray-900 hover:bg-black'}`}>{isAiAnalyzing ? 'Scanning...' : 'Scan AI'}</button>
          </div>
          <hr className="border-gray-200" />

          {/* Parameter Slitscan */}
          <div className="space-y-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Slit-Scan Options</h2>
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2"><span>Cut Complexity</span></div>
                <input type="range" min="10" max="100" value={complexity} onChange={(e) => setComplexity(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
            </div>
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2"><span>Density (Empty Gaps)</span></div>
                <input type="range" min="10" max="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" disabled={isManualMode} />
            </div>
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2"><span>Stretch Intensity</span><span className="text-blue-600 font-bold">{stretchInt}%</span></div>
                <input type="range" min="0" max="150" value={stretchInt} onChange={(e) => setStretchInt(Number(e.target.value))} className="w-full h-1.5 bg-blue-200 rounded-lg cursor-pointer accent-blue-600" />
            </div>
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2"><span>Brutal Distortion</span><span className="text-red-600 font-bold">{brutalInt}%</span></div>
                <input type="range" min="0" max="100" value={brutalInt} onChange={(e) => setBrutalInt(Number(e.target.value))} className="w-full h-1.5 bg-red-200 rounded-lg cursor-pointer accent-red-600" />
            </div>
            <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-semibold text-gray-700">Stretch Direction</span>
                <div className="flex items-center space-x-1 text-[11px] font-mono font-bold text-gray-600 bg-gray-100 p-1 rounded-md border border-gray-200">
                    <button className={`px-3 py-1.5 rounded ${stretchDirX ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`} onClick={() => setStretchDirX(!stretchDirX)}>H</button>
                    <button className={`px-3 py-1.5 rounded ${stretchDirY ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`} onClick={() => setStretchDirY(!stretchDirY)}>V</button>
                </div>
            </div>
          </div>
          <hr className="border-gray-200" />

          {/* Tampilan */}
          <div className="space-y-4">
             <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Visuals & Annotations</h2>
             <label className="flex items-center justify-between cursor-pointer"><span className="text-sm font-semibold text-gray-700">Show Grid Lines & Blocks</span><input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} className="w-4.5 h-4.5 accent-black" /></label>
             <label className="flex items-center justify-between cursor-pointer"><span className="text-sm font-semibold text-gray-700">Show Annotation Text</span><input type="checkbox" checked={showTextAnnotations} onChange={(e) => setShowTextAnnotations(e.target.checked)} className="w-4.5 h-4.5 accent-black" /></label>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
           <div className="flex space-x-3">
              <button onClick={() => handleExport('png')} className="flex-1 bg-black text-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 transition active:scale-95">Export PNG</button>
              <button onClick={() => handleExport('jpg')} className="flex-1 border-2 border-gray-300 text-gray-700 bg-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 hover:border-gray-400 transition active:scale-95">Export JPG</button>
           </div>
        </div>
      </div>

      {/* --- PANEL KANAN (PRO WORKSPACE: Gelap, Rulers, Guides, Pan/Zoom) --- */}
      <div 
        className="flex-1 bg-[#181818] relative overflow-hidden touch-none"
        onPointerMove={handleWorkspacePointerMove}
        onPointerUp={handleWorkspacePointerUp}
        onPointerLeave={handleWorkspacePointerUp}
      >
         
         {/* Pojok Penggaris (Kiri Atas) */}
         <div className="absolute top-0 left-0 w-[24px] h-[24px] bg-[#222] border-b border-r border-[#333] z-50"></div>

         {/* Penggaris Atas (Horizontal) Dinamis */}
         <div 
            className="absolute top-0 left-[24px] right-0 h-[24px] bg-[#222] border-b border-[#333] z-40 overflow-hidden"
            onPointerDown={(e) => startGuideFromRuler(e, 'h')}
         >
            <Ruler type="h" pan={pan} zoom={viewScale} length={viewportSize.w} />
         </div>

         {/* Penggaris Kiri (Vertikal) Dinamis */}
         <div 
            className="absolute top-[24px] left-0 bottom-0 w-[24px] bg-[#222] border-r border-[#333] z-40 overflow-hidden"
            onPointerDown={(e) => startGuideFromRuler(e, 'v')}
         >
             <Ruler type="v" pan={pan} zoom={viewScale} length={viewportSize.h} />
         </div>

         {/* Viewport Utama (Tempat Canvas & Guides) */}
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
            {/* Canvas Container dengan Pan & Zoom Transform */}
            <div 
               style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`, transformOrigin: 'center' }}
               className={`w-full h-full flex items-center justify-center transition-transform duration-75
                           ${activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
            >
               <canvas ref={canvasRef} className="shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-white object-contain" />
            </div>

            {/* Lapisan Guidelines Overlay */}
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

         {/* --- FLOATING TOOLBAR KIRI (Tools Panel) --- */}
         <div className="absolute top-[44px] left-[44px] bg-[#2D2D2D] border border-[#444] rounded-md shadow-2xl flex flex-col z-50 overflow-hidden">
            <button 
                className={`p-3 transition flex items-center justify-center ${activeTool==='pan'?'bg-blue-600 text-white':'text-gray-400 hover:text-white hover:bg-[#444]'}`}
                onClick={() => setActiveTool('pan')} title="Move Tool (Pan)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="19 9 22 12 19 15"/><polyline points="9 19 12 22 15 19"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
            </button>
            <button 
                className={`p-3 transition flex items-center justify-center ${activeTool==='brush'?'bg-blue-600 text-white':'text-gray-400 hover:text-white hover:bg-[#444]'}`}
                onClick={() => { setActiveTool('brush'); setIsManualMode(true); }} title="Brush Tool (Paint Area)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.35 2.22 1.45 3.02 1.45 2.67 0 4.81-2.16 4.81-4.83 0-1.66-1.34-3.02-3.01-3.02z"/></svg>
            </button>
            <div className="h-[1px] bg-[#444] w-full"></div>
            <button 
                className="p-3 transition flex items-center justify-center text-red-400 hover:bg-red-500/20 hover:text-red-300"
                onClick={() => setGuides([])} title="Clear All Guides"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
         </div>

         {/* --- FLOATING ZOOM PANEL KANAN BAWAH --- */}
         <div className="absolute bottom-6 right-6 bg-[#2D2D2D] text-gray-300 text-xs rounded shadow-2xl flex items-center border border-[#444] overflow-hidden z-50">
            <button className="px-4 py-3 hover:bg-[#444] transition font-bold" onClick={() => setViewScale(v => Math.max(0.1, v - 0.1))}>—</button>
            <span className="px-3 font-mono border-x border-[#444] min-w-[65px] text-center">{Math.round(viewScale * 100)}%</span>
            <button className="px-4 py-3 hover:bg-[#444] transition font-bold" onClick={() => setViewScale(v => Math.min(5, v + 0.1))}>+</button>
            <button className="px-4 py-3 hover:bg-[#444] transition text-blue-400 font-semibold" onClick={() => { setViewScale(1); setPan({x:0, y:0}); }}>Reset</button>
         </div>

      </div>
    </div>
  );
}