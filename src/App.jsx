import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Generator Angka Acak Konsisten (Seeded RNG) ---
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
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
        
        ctx.fillStyle = isDarkMode ? '#141414' : '#F3F4F6'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = isDarkMode ? '#888888' : '#6B7280'; 
        ctx.strokeStyle = isDarkMode ? '#333333' : '#D1D5DB'; 
        ctx.font = '9px monospace';
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
  const [brushTarget, setBrushTarget] = useState('card'); // 'stretch' | 'card'
  const [brushSize, setBrushSize] = useState(60);
  const [viewScale, setViewScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  
  const [guides, setGuides] = useState([]);
  const [draggingGuide, setDraggingGuide] = useState(null); 

  // Mask terpisah untuk Brush Stretch dan Brush Kartu Cutout Solid
  const stretchMaskPointsRef = useRef([]); 
  const cardMaskPointsRef = useRef([]); 
  const isPaintingRef = useRef(false);
  const animationFrameId = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);

  // Slit-scan parameter dasar
  const [scale, setScale] = useState(80); 
  const [complexity, setComplexity] = useState(55); 
  const [density, setDensity] = useState(65);       
  const [stretchInt, setStretchInt] = useState(72); 
  const [brutalInt, setBrutalInt] = useState(25); 
  const [stretchDirX, setStretchDirX] = useState(true);
  const [stretchDirY, setStretchDirY] = useState(true);

  // --- KOTAK PEMBINGKAI SCRATCH & VARIASI UKURAN ---
  const [showScratchBoxes, setShowScratchBoxes] = useState(true);
  const [boxBorderWidth, setBoxBorderWidth] = useState(1);
  const [boxBorderColor, setBoxBorderColor] = useState('auto'); // 'auto', '#000000', '#ffffff', '#10B981', '#00FFFF', custom
  const [boxSizeVariety, setBoxSizeVariety] = useState('varied'); // 'balanced', 'varied', 'editorial', 'bento'

  // --- KARTU CUTOUT SOLID DENGAN PILIHAN WARNA LEBIH BERVARIASI & TRANSPARANSI ---
  const [showCutoutCards, setShowCutoutCards] = useState(true);
  const [cutoutCardColor, setCutoutCardColor] = useState('#FFFFFF'); // '#FFFFFF', '#F8F7F2', '#FEF08A', '#BAE6FD', '#BBF7D0', '#FBCFE8', '#18181B'
  const [cutoutCardOpacity, setCutoutCardOpacity] = useState(100); // 30% s.d. 100%
  const [cutoutCardDensity, setCutoutCardDensity] = useState(16); // persentase kartu cutout auto

  // --- TIPOGRAFI KOLOM KOTAK & PEMILIHAN FONT ---
  const [showBoxTypography, setShowBoxTypography] = useState(true);
  const [boxFontFamily, setBoxFontFamily] = useState('sans'); // 'sans', 'mono', 'serif', 'grotesk', 'condensed'
  const [boxNumberFormat, setBoxNumberFormat] = useState('plus'); // 'plus' (1+), 'standard' (1), 'pad' (01)
  const [boxFontSize, setBoxFontSize] = useState(100); // skala font (60% - 160%)
  
  // Visual & legacy overlays
  const [showGridLines, setShowGridLines] = useState(false);
  const [showTextAnnotations, setShowTextAnnotations] = useState(false);
  const [textColor, setTextColor] = useState('#00FFFF'); 
  
  const [renderStyle, setRenderStyle] = useState('classic'); 
  const [canvasFormat, setCanvasFormat] = useState('original');
  const [exportMultiplier, setExportMultiplier] = useState(1);

  // AI State
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [annoLang, setAnnoLang] = useState('EN'); 
  const [apiKeyInput, setApiKeyInput] = useState(''); 

  // Accordion state
  const [accordions, setAccordions] = useState({
      presets: true,
      ops: true,
      cards: true,  // Seksi Kartu Cutout & Warna
      boxes: true,  // Seksi Kotak & Variasi Ukuran
      typo: true,   // Seksi Tipografi & Pilihan Font
      mode: false,  // Seksi Kuas Brush Manual
      slit: false,
      style: false,
      ai: false,
      visuals: false
  });
  const toggleAccordion = (key) => setAccordions(prev => ({ ...prev, [key]: !prev[key] }));

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringWorkspace, setIsHoveringWorkspace] = useState(false);

  // Kosakata estetika desain & poster kontemporer
  const fallbackWords = {
    'ID': ['RETRO', 'DIGITAL', 'GRID', 'STRUKTUR', 'ESTETIKA', 'MODERN', 'VIBE', 'STUDIO', 'FUTUR', 'KREATIF', 'VISUAL', 'FOKUS'],
    'EN': ['RETRO', 'DIGITAL', 'GRID', 'STRUCTURE', 'AESTHETIC', 'MODERN', 'VIBE', 'STAY', 'WEIRD', 'CRINGE', 'SWAG', 'FUTURE', 'STUDIO', 'SYSTEM', 'TYPO', 'MOTION'],
    'JP': ['レトロ', 'デジタル', 'グリッド', '構造', '美学', 'モダン', '未来', 'スタジオ', 'システム', 'タイポ', 'モーション', 'デザイン']
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

  useEffect(() => {
      const savedKey = localStorage.getItem('geminiApiKey');
      if (savedKey) setApiKeyInput(savedKey);
  }, []);

  // Keyboard shortcut Spacebar untuk pan tool
  useEffect(() => {
      const handleKeyDown = (e) => {
          if (e.code === 'Space') {
              if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
              e.preventDefault();
              setIsSpacePressed(true);
              if (isPaintingRef.current) isPaintingRef.current = false; 
          }
      };
      const handleKeyUp = (e) => {
          if (e.code === 'Space') {
              if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
              e.preventDefault();
              setIsSpacePressed(false);
              setIsPanning(false); 
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  const processFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          setSeed(Math.random() * 10000); 
          stretchMaskPointsRef.current = []; 
          cardMaskPointsRef.current = []; 
          setViewScale(1);
          setPan({ x: 0, y: 0 });
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = (e) => processFile(e.target.files[0]);
  const handleRotate = () => { 
    setRotation((prev) => (prev + 90) % 360); 
    stretchMaskPointsRef.current = []; 
    cardMaskPointsRef.current = []; 
  };
  const handleRandomize = () => setSeed(Math.random() * 10000);

  // --- PRESET SYSTEM (1-Klik Tampilan Siap Pakai) ---
  const applyPreset = (presetName) => {
    if (presetName === 'editorial') {
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('auto');
      setBoxSizeVariety('editorial');
      setBoxFontFamily('sans');
      setBoxNumberFormat('plus');
      setRenderStyle('classic');
      setStretchInt(70);
      setComplexity(50);
      setDensity(70);
      setShowGridLines(false);
      setShowTextAnnotations(false);
    } else if (presetName === 'cyber') {
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowCutoutCards(false);
      setBoxBorderWidth(1);
      setBoxBorderColor('#00FFFF');
      setBoxSizeVariety('varied');
      setBoxFontFamily('mono');
      setBoxNumberFormat('pad');
      setRenderStyle('glitch');
      setStretchInt(85);
      setTextColor('#00FFFF');
    } else if (presetName === 'zine') {
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#F8F7F2');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(2);
      setBoxBorderColor('#000000');
      setBoxSizeVariety('bento');
      setBoxFontFamily('grotesk');
      setBoxNumberFormat('standard');
      setRenderStyle('zine');
      setBrutalInt(45);
    } else if (presetName === 'minimal') {
      setShowScratchBoxes(false);
      setShowBoxTypography(false);
      setShowCutoutCards(false);
      setRenderStyle('classic');
      setStretchInt(60);
    }
  };
  
  const handleExport = (format) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (exportMultiplier === 1) {
      const link = document.createElement('a');
      link.download = `grid-stretch-${Date.now()}.${format}`;
      link.href = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
      link.click();
    } else {
      const hiResCanvas = document.createElement('canvas');
      hiResCanvas.width = canvas.width * exportMultiplier;
      hiResCanvas.height = canvas.height * exportMultiplier;
      const hCtx = hiResCanvas.getContext('2d');
      hCtx.imageSmoothingEnabled = true;
      hCtx.imageSmoothingQuality = 'high';
      hCtx.drawImage(canvas, 0, 0, hiResCanvas.width, hiResCanvas.height);
      const link = document.createElement('a');
      link.download = `grid-stretch-hires-${exportMultiplier}x-${Date.now()}.${format}`;
      link.href = hiResCanvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
      link.click();
    }
  };

  const handleAiAnalysis = async () => {
    if (!image) return; 
    if (!apiKeyInput || apiKeyInput.trim() === '') { alert("Masukkan Token API Gemini Anda terlebih dahulu."); return; }
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
        
        const base64DataRaw = tempCanvas.toDataURL('image/jpeg', 0.5).split(',')[1]; 
        const apiKey = apiKeyInput.trim(); 
        const langMap = { 'ID': 'Indonesian', 'EN': 'English', 'JP': 'Japanese' };
        const promptText = `Analyze this image and provide exactly 16 single-word aesthetic keywords describing its main subjects, visual elements, colors, or vibe (suitable for Swiss-style graphic design posters). The words MUST be translated to ${langMap[annoLang]}. Return ONLY a comma-separated list of these words, in ALL CAPS.`;
        
        const candidateModels = [
            'gemini-3.6-flash',
            'gemini-3.1-flash-lite',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-2.5-flash'
        ];

        let success = false;
        let lastErrorMessage = '';

        for (const modelName of candidateModels) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                        generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
                    })
                });

                const data = await response.json();
                
                if (!response.ok) {
                    lastErrorMessage = data.error?.message || `API Error: ${response.status}`;
                    continue;
                }
                
                let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    text = text.replace(/`/g, '').replace(/csv/g, '').trim();
                    const words = text.split(',').map(w => w.trim().toUpperCase()).filter(w => w);
                    if (words.length > 0) { 
                        setAiWords(words); 
                        localStorage.setItem('geminiApiKey', apiKey);
                        alert(`Gemini AI Analysis Successful (${modelName})!\nExtracted ${words.length} design keywords.`); 
                        success = true;
                        break;
                    }
                }
            } catch (err) {
                lastErrorMessage = err.message;
            }
        }

        if (!success) {
            throw new Error(lastErrorMessage || "Gagal mendapatkan respons dari Gemini AI.");
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

  const currentTool = isSpacePressed ? 'pan' : activeTool;

  const handleWorkspacePointerDown = (e) => {
    if (!image) return;
    if (currentTool === 'pan') {
      setIsPanning(true);
      e.target.setPointerCapture(e.pointerId);
    } else if (currentTool === 'brush' && isManualMode) {
      isPaintingRef.current = true;
      e.target.setPointerCapture(e.pointerId);
      addMaskPoint(e);
    }
  };

  const handleWorkspacePointerMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });

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
    else if (isPaintingRef.current && currentTool === 'brush' && isManualMode) {
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

  // Tambah titik lukis kuas (mendukung target Stretch atau Kartu Cutout Solid)
  const addMaskPoint = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;

      const point = { nx, ny, radius: brushSize };

      if (brushTarget === 'card') {
          cardMaskPointsRef.current.push(point);
      } else {
          stretchMaskPointsRef.current.push(point);
      }

      if (!animationFrameId.current) {
          animationFrameId.current = requestAnimationFrame(() => { drawCanvas(); animationFrameId.current = null; });
      }
  };

  const clearStretchMask = () => { stretchMaskPointsRef.current = []; drawCanvas(); };
  const clearCardMask = () => { cardMaskPointsRef.current = []; drawCanvas(); };
  const clearAllMasks = () => { stretchMaskPointsRef.current = []; cardMaskPointsRef.current = []; drawCanvas(); };

  // Helper konversi warna hex ke RGBA
  const hexToRgba = (hex, opacityPercent) => {
    if (!hex) return '#FFFFFF';
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substring(0, 2), 16) || 255;
    const g = parseInt(c.substring(2, 4), 16) || 255;
    const b = parseInt(c.substring(4, 6), 16) || 255;
    const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Helper kontras teks otomatis berdasarkan kecerahan background kartu
  const getContrastTextColor = (hex) => {
    if (!hex) return '#000000';
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substring(0, 2), 16) || 255;
    const g = parseInt(c.substring(2, 4), 16) || 255;
    const b = parseInt(c.substring(4, 6), 16) || 255;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#000000' : '#FFFFFF';
  };

  // Peta Font Family
  const fontFamilies = {
    'sans': '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'mono': '"JetBrains Mono", "SF Mono", "Courier New", Courier, monospace',
    'serif': '"Playfair Display", "Times New Roman", Georgia, serif',
    'grotesk': '"Arial Black", Impact, "Helvetica Neue", sans-serif',
    'condensed': '"Arial Narrow", "Trebuchet MS", sans-serif'
  };

  // --- LOGIKA UTAMA PENGGAMBARAN KANVAS ---
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (!image) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width || 800; canvas.height = rect.height || 600;
      ctx.fillStyle = isDarkMode ? '#080808' : '#F9FAFB'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 15px sans-serif'; 
      ctx.fillStyle = isDarkMode ? '#666' : '#9CA3AF';
      ctx.fillText('Silakan unggah gambar dari panel kiri untuk mulai membuat desain poster grid', canvas.width/2, canvas.height/2);
      return;
    }

    const rng = mulberry32(seed);
    const isRotated = rotation % 180 !== 0;
    
    // Format ukuran kanvas
    const formats = {
        'original': { w: image.width, h: image.height },
        'square': { w: 1080, h: 1080 },
        'portrait': { w: 1080, h: 1350 },
        'landscape': { w: 1920, h: 1080 },
        'story': { w: 1080, h: 1920 },
        'a4': { w: 1240, h: 1754 }
    };

    let baseW = formats[canvasFormat].w;
    let baseH = formats[canvasFormat].h;

    canvas.width = isRotated ? baseH : baseW;
    canvas.height = isRotated ? baseW : baseH;
    const relScale = Math.max(1, canvas.width / 1000); 
    
    ctx.imageSmoothingEnabled = brutalInt < 50; 
    
    // Latar belakang kanvas dasar
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

    // Pembuatan Garis Potong (Cuts) dengan variasi ukuran kotak yang lebih bervariasi
    const numCols = Math.floor(6 + (complexity / 100) * 55);
    const numRows = Math.floor(6 + (complexity / 100) * 55);
    
    let xCuts = [0, canvas.width];
    let yCuts = [0, canvas.height];

    if (boxSizeVariety === 'varied') {
        // Campuran dinamis: kotak besar, sedang, dan kecil
        const majorCols = Math.floor(numCols * 0.35);
        for(let i = 0; i < majorCols; i++) xCuts.push(Math.floor(rng() * canvas.width));
        for(let i = 0; i < numCols - majorCols; i++) {
            const anchor = xCuts[Math.floor(rng() * xCuts.length)];
            const offset = (rng() - 0.5) * (canvas.width * 0.3);
            const val = Math.max(10, Math.min(canvas.width - 10, Math.floor(anchor + offset)));
            xCuts.push(val);
        }
        const majorRows = Math.floor(numRows * 0.35);
        for(let i = 0; i < majorRows; i++) yCuts.push(Math.floor(rng() * canvas.height));
        for(let i = 0; i < numRows - majorRows; i++) {
            const anchor = yCuts[Math.floor(rng() * yCuts.length)];
            const offset = (rng() - 0.5) * (canvas.height * 0.3);
            const val = Math.max(10, Math.min(canvas.height - 10, Math.floor(anchor + offset)));
            yCuts.push(val);
        }
    } else if (boxSizeVariety === 'editorial') {
        // Struktur editorial: beberapa blok hero lebar + strip slit ramping
        const divisionsX = [0.15, 0.35, 0.58, 0.78, 0.90];
        divisionsX.forEach(ratio => {
            if (rng() > 0.25) xCuts.push(Math.floor(canvas.width * (ratio + (rng() - 0.5) * 0.08)));
        });
        const divisionsY = [0.12, 0.30, 0.50, 0.72, 0.88];
        divisionsY.forEach(ratio => {
            if (rng() > 0.25) yCuts.push(Math.floor(canvas.height * (ratio + (rng() - 0.5) * 0.08)));
        });
        for(let i = 0; i < Math.floor(numCols * 0.6); i++) xCuts.push(Math.floor(rng() * canvas.width));
        for(let i = 0; i < Math.floor(numRows * 0.6); i++) yCuts.push(Math.floor(rng() * canvas.height));
    } else if (boxSizeVariety === 'bento') {
        // Layout bento kuadran
        const stepX = canvas.width / 4;
        const stepY = canvas.height / 4;
        for(let s = 1; s < 4; s++) {
            xCuts.push(Math.floor(s * stepX + (rng() - 0.5) * (stepX * 0.35)));
            yCuts.push(Math.floor(s * stepY + (rng() - 0.5) * (stepY * 0.35)));
        }
        for(let i = 0; i < Math.floor(numCols * 0.45); i++) xCuts.push(Math.floor(rng() * canvas.width));
        for(let i = 0; i < Math.floor(numRows * 0.45); i++) yCuts.push(Math.floor(rng() * canvas.height));
    } else {
        // Balanced (standar acak seragam)
        for(let i = 0; i < numCols; i++) xCuts.push(Math.floor(rng() * canvas.width));
        for(let i = 0; i < numRows; i++) yCuts.push(Math.floor(rng() * canvas.height));
    }

    xCuts = Array.from(new Set(xCuts)).sort((a,b) => a - b);
    yCuts = Array.from(new Set(yCuts)).sort((a,b) => a - b);

    const stretchProb = Math.min(stretchInt, 100) / 100; 
    const stretchMultiplier = stretchInt > 100 ? 1 + ((stretchInt - 100) / 50) * 15 : 1;
    const pCardCutout = showCutoutCards ? (cutoutCardDensity / 100) * 0.4 : 0;
    const maxThick = Math.max(1, Math.floor((brutalInt / 100) * 20 * relScale)); 

    // Helper uji titik mask kuas
    const checkMask = (testNX, testNY, maskArray) => {
        if (!maskArray || maskArray.length === 0) return false;
        const aspect = canvas.width / canvas.height;
        for (let pt of maskArray) {
            const normRadius = (pt.radius / 100) * 0.10; 
            const dx = pt.nx - testNX; 
            const dy = (pt.ny - testNY) / aspect; 
            if (Math.sqrt(dx*dx + dy*dy) < normRadius) return true;
        }
        return false;
    };

    const normalPass = [];
    const stretchPass = [];
    const cutoutCardPass = [];

    // Partisi sel ke dalam kategori: stretch, card, normal
    for (let i = 0; i < xCuts.length - 1; i++) {
        for (let j = 0; j < yCuts.length - 1; j++) {
            const x = xCuts[i]; const y = yCuts[j];
            const w = xCuts[i+1] - x; const h = yCuts[j+1] - y;
            if (w < 1 || h < 1) continue;

            const dstW = w + 1; const dstH = h + 1;
            const cellCenterNX = (x + w / 2) / canvas.width;
            const cellCenterNY = (y + h / 2) / canvas.height;

            let applyStretch = false;
            let applyCard = false;

            if (isManualMode) {
                // Di mode Manual Brush: Kuas dapat melukis Kartu Cutout Solid atau Stretch!
                applyCard = checkMask(cellCenterNX, cellCenterNY, cardMaskPointsRef.current);
                applyStretch = checkMask(cellCenterNX, cellCenterNY, stretchMaskPointsRef.current);
            } else {
                const r = rng();
                if (showCutoutCards && r < pCardCutout && w >= 28 * relScale && h >= 20 * relScale) {
                    applyCard = true;
                } else if (r < pCardCutout + stretchProb) {
                    applyStretch = true;
                }
            }

            if (applyCard) {
                cutoutCardPass.push({ x, y, w, h, dstW, dstH });
            } else if (applyStretch) {
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
                // Sel normal: menampilkan gambar asli tanpa kotak hitam yang mengganggu!
                normalPass.push({ type: 'normal', x, y, w, h, dstW, dstH });
            }
        }
    }

    if (renderStyle === 'zine') {
        ctx.filter = 'grayscale(80%) contrast(150%) brightness(90%)';
    }

    // Pass 1: Gambar Normal (selalu menampilkan gambar asli dengan bersih)
    normalPass.forEach(op => {
        ctx.drawImage(offscreen, op.x, op.y, op.w, op.h, op.x, op.y, op.dstW, op.dstH);
    });

    // Pass 2: Gambar Slit-Scan Streaks
    stretchPass.forEach(op => {
        let srcX = op.x; let srcY = op.y;
        let srcW = op.w; let srcH = op.h;
        let dstX = op.x; let dstY = op.y;
        let dstW = op.dstW; let dstH = op.dstH;

        if (op.isHoriz && stretchDirX) {
            srcX = op.srcX; srcW = op.sliceW;
            dstW = op.dstW * stretchMultiplier;
        } else if (!op.isHoriz && stretchDirY) {
            srcY = op.srcY; srcH = op.sliceH;
            dstH = op.dstH * stretchMultiplier;
        }

        if (renderStyle === 'liquid') {
            if (op.isHoriz && stretchDirX) {
                dstY += Math.sin(op.x * 0.05 + seed) * 15 * relScale;
            } else if (!op.isHoriz && stretchDirY) {
                dstX += Math.cos(op.y * 0.05 + seed) * 15 * relScale;
            }
        }

        const drawOp = (xOff = 0, yOff = 0) => {
            ctx.drawImage(offscreen, srcX, srcY, srcW, srcH, dstX + xOff, dstY + yOff, dstW, dstH);
        };

        if (renderStyle === 'glitch') {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.6;
            
            ctx.filter = 'sepia(100%) hue-rotate(180deg) saturate(400%)';
            drawOp(-4 * relScale, 0);
            
            ctx.filter = 'sepia(100%) hue-rotate(300deg) saturate(400%)';
            drawOp(4 * relScale, 0);
            
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            drawOp(0, 0);
            
            ctx.restore();
        } else {
            drawOp(0, 0);
        }
    });

    ctx.filter = 'none';

    // Pass 3: Kartu Cutout Solid dengan Pilihan Warna Bervariasi & Transparansi
    if (cutoutCardPass.length > 0) {
        ctx.save();
        const cardFillStyle = hexToRgba(cutoutCardColor, cutoutCardOpacity);
        ctx.fillStyle = cardFillStyle;

        cutoutCardPass.forEach(card => {
            ctx.fillRect(card.x, card.y, card.w, card.h);
        });
        ctx.restore();
    }

    // Pass 4: Tekstur Zine Grain (jika zine aktif)
    if (renderStyle === 'zine') {
        const noiseCnv = document.createElement('canvas');
        noiseCnv.width = 100; noiseCnv.height = 100;
        const nCtx = noiseCnv.getContext('2d');
        const imgData = nCtx.createImageData(100, 100);
        const data32 = new Uint32Array(imgData.data.buffer);
        for(let k=0; k<data32.length; k++) {
            const v = (rng() * 255) | 0; 
            data32[k] = 0xFF000000 | v<<16 | v<<8 | v;
        }
        nCtx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = ctx.createPattern(noiseCnv, 'repeat');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // --- FITUR KOTAK BINGKAI SCRATCH & KARTU CUTOUT ---
    if (showScratchBoxes) {
        ctx.save();
        const strokeW = Math.max(1, Math.floor(boxBorderWidth * relScale));
        ctx.lineWidth = strokeW;

        const boxesToStroke = [...stretchPass, ...cutoutCardPass];

        boxesToStroke.forEach(box => {
            if (boxBorderColor === 'auto') {
                if (cutoutCardPass.includes(box)) {
                    // Jika warna kartu terang gunakan border gelap, jika gelap gunakan terang
                    ctx.strokeStyle = getContrastTextColor(cutoutCardColor) === '#000000' 
                        ? 'rgba(0,0,0,0.85)' 
                        : 'rgba(255,255,255,0.85)';
                } else {
                    ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.75)';
                }
            } else {
                ctx.strokeStyle = boxBorderColor;
            }

            ctx.strokeRect(Math.floor(box.x) + 0.5, Math.floor(box.y) + 0.5, Math.floor(box.w), Math.floor(box.h));
        });

        ctx.restore();
    }

    // --- TIPOGRAFI KOLOM KOTAK DENGAN PEMILIHAN FONT FLEKSIBEL ---
    if (showBoxTypography) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const labeledBoxes = [];
        cutoutCardPass.forEach(card => labeledBoxes.push({ ...card, isCard: true }));
        stretchPass.forEach(box => {
            if (box.w >= 32 * relScale && box.h >= 22 * relScale) {
                labeledBoxes.push({ ...box, isCard: false });
            }
        });

        labeledBoxes.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 40 * relScale) return a.y - b.y;
            return a.x - b.x;
        });

        const fontScale = boxFontSize / 100;
        const mainFontSize = Math.max(8, Math.floor(12 * relScale * fontScale));
        const subFontSize = Math.max(7, Math.floor(9.5 * relScale * fontScale));
        const padX = Math.max(3, Math.floor(4 * relScale));
        const padY = Math.max(2, Math.floor(3 * relScale));
        const currentFontFamily = fontFamilies[boxFontFamily] || fontFamilies['sans'];

        let indexCounter = 1;

        labeledBoxes.forEach((box, idx) => {
            const word = aiWords[idx % aiWords.length] || 'GRID';
            
            let numDisplay;
            if (boxNumberFormat === 'plus') {
                numDisplay = indexCounter === 1 ? '1' : `${indexCounter}+`;
            } else if (boxNumberFormat === 'pad') {
                numDisplay = String(indexCounter).padStart(2, '0');
            } else {
                numDisplay = `${indexCounter}`;
            }

            let textFill;
            if (box.isCard) {
                // Teks pada kartu solid otomatis kontras tinggi dengan warna latar kartu yang dipilih
                textFill = getContrastTextColor(cutoutCardColor);
            } else {
                textFill = isDarkMode ? '#FFFFFF' : '#000000';
            }

            ctx.fillStyle = textFill;

            // Baris 1: Kata Deskriptif dengan Font Pilihan
            ctx.font = `800 ${mainFontSize}px ${currentFontFamily}`;
            const maxTextW = box.w - padX * 2;
            let renderWord = word;
            if (ctx.measureText(renderWord).width > maxTextW && renderWord.length > 4) {
                renderWord = renderWord.substring(0, Math.max(3, Math.floor(maxTextW / (mainFontSize * 0.65)))) + '.';
            }
            ctx.fillText(renderWord, Math.floor(box.x + padX), Math.floor(box.y + padY));

            // Baris 2: Indeks Angka di bawah kata
            if (box.h >= (mainFontSize + subFontSize + padY * 2)) {
                ctx.font = `700 ${subFontSize}px ${currentFontFamily}`;
                ctx.fillText(numDisplay, Math.floor(box.x + padX), Math.floor(box.y + padY + mainFontSize + Math.floor(2 * relScale)));
            }

            indexCounter += (idx % 3 === 0 ? 1 : (idx % 2 === 0 ? 2 : 3));
        });

        ctx.restore();
    }

    // --- VISUAL GRID LINES (Hanya garis bersih tanpa blok hitam acak) ---
    if (showGridLines) {
        ctx.save();
        ctx.fillStyle = isDarkMode ? '#10B981' : '#000000';
        ctx.lineWidth = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.strokeStyle = isDarkMode ? 'rgba(16,185,129,0.3)' : 'rgba(0,0,0,0.3)';
        
        xCuts.forEach(x => {
           if(rng() > 0.8) { 
               ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); 
           }
        });
        yCuts.forEach(y => {
           if(rng() > 0.8) { 
               ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); 
           }
        });
        ctx.restore();
    }

    if (showTextAnnotations) {
        ctx.save();
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
                
                const word = aiWords[Math.floor(rng() * aiWords.length)];
                const num = Math.floor(rng() * 50) + 1;
                
                ctx.fillStyle = textColor;
                ctx.font = `900 ${mainFont}px sans-serif`;
                ctx.fillText(word, x, y - spacing1);
                ctx.font = `${subFont}px sans-serif`;
                ctx.fillText(`${num}+`, x, y + spacing2);
                ctx.fillRect(x, y + spacing3, barWidth, barHeight);
                count++;
            }
        }
        ctx.restore();
    }
  }, [
    image, rotation, seed, scale, complexity, density, stretchInt, brutalInt, stretchDirX, stretchDirY,
    showScratchBoxes, showBoxTypography, showCutoutCards, boxBorderWidth, boxBorderColor, boxSizeVariety,
    cutoutCardColor, cutoutCardOpacity, cutoutCardDensity, boxFontFamily, boxNumberFormat, boxFontSize,
    showGridLines, showTextAnnotations, textColor, isManualMode, brushTarget, brushSize, aiWords, isDarkMode, renderStyle, canvasFormat
  ]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  return (
    <div className={`flex flex-col-reverse md:flex-row h-[100dvh] md:h-screen font-sans overflow-hidden transition-colors ${isDarkMode ? 'bg-[#080808] text-[#e5e5e5]' : 'bg-[#F3F4F6] text-gray-900'}`}>
      
      {/* --- SIDEBAR PANEL KONTROL KIRI --- */}
      <div className={`w-full md:w-[370px] h-[60dvh] md:h-full shadow-2xl flex flex-col z-10 overflow-y-auto border-t md:border-t-0 md:border-r flex-shrink-0 transition-colors duration-200 
                      ${isDarkMode ? 'bg-[#0e0e0e] border-[#1e1e1e]' : 'bg-white border-gray-200'}`}>
        
        {/* HEADER BRAND & MODE TOGGLE */}
        <div className={`p-5 border-b flex justify-between items-center transition-colors duration-200 ${isDarkMode ? 'bg-[#121212] border-[#1e1e1e]' : 'bg-gray-50 border-gray-100'}`}>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className={`text-lg font-black tracking-tight font-mono ${isDarkMode ? 'text-[#10B981]' : 'text-gray-900'}`}>GRID STUDIO</h1>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-[#1a1a1a] text-[#00FFFF] border border-[#333]' : 'bg-gray-200 text-gray-700'}`}>PRO</span>
            </div>
            <p className={`text-[11px] mt-0.5 font-medium ${isDarkMode ? 'text-[#777]' : 'text-gray-500'}`}>Generative Slit-Scan & Box Engine</p>
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className={`p-2 rounded-lg transition-all ${isDarkMode ? 'bg-[#1e1e1e] hover:bg-[#282828] text-yellow-400 border border-[#333]' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'}`} 
            title={isDarkMode ? "Ganti ke Light Mode" : "Ganti ke Dark Mode"}
          >
             {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* PRESET CEPAT 1-KLIK */}
        <div className={`p-4 border-b ${isDarkMode ? 'bg-[#0f0f0f] border-[#1e1e1e]' : 'bg-gray-50/80 border-gray-100'}`}>
           <div className="flex items-center justify-between mb-2">
             <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#666]' : 'text-gray-400'}`}>Presets Siap Pakai</span>
           </div>
           <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'editorial', label: '📰 Editorial Grid', desc: 'Kartu Solid & Typo' },
                { id: 'cyber', label: '⚡ Cyber Slit', desc: 'Glitch & Neon' },
                { id: 'zine', label: '📄 Brutal Zine', desc: 'High Contrast' },
                { id: 'minimal', label: '🎛️ Raw Slit', desc: 'Tanpa Kotak' }
              ].map(p => (
                 <button
                   key={p.id}
                   onClick={() => applyPreset(p.id)}
                   className={`p-2 text-left rounded-md transition-all border ${isDarkMode ? 'bg-[#161616] border-[#262626] hover:border-[#10B981] text-gray-300' : 'bg-white border-gray-200 hover:border-black text-gray-800 shadow-sm'}`}
                 >
                   <div className="text-[11px] font-bold">{p.label}</div>
                   <div className={`text-[9px] ${isDarkMode ? 'text-[#777]' : 'text-gray-500'}`}>{p.desc}</div>
                 </button>
              ))}
           </div>
        </div>

        {/* CONTAINER KONTROL ACCORDION */}
        <div className="p-5 flex-1 flex flex-col space-y-6">
          
          {/* 1. KARTU CUTOUT SOLID & WARNA LEBIH BERVARIASI */}
          <div className="space-y-3">
            <button onClick={() => toggleAccordion('cards')} className="w-full flex items-center justify-between focus:outline-none">
              <div className="flex items-center space-x-2">
                <span className="text-amber-400">🗂️</span>
                <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#aaa]' : 'text-gray-800'}`}>Kartu Cutout Solid</h2>
              </div>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${showCutoutCards ? (isDarkMode ? 'bg-amber-400/20 text-amber-400' : 'bg-amber-100 text-amber-800') : 'text-gray-500'}`}>
                {showCutoutCards ? 'ON' : 'OFF'}
              </span>
            </button>
            
            {accordions.cards && (
              <div className="space-y-3.5 pt-1 animate-in fade-in duration-200">
                {/* Switch Utama Kartu Cutout */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                   <div>
                      <div className="text-xs font-bold">Aktifkan Kartu Cutout</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Blok kartu berlatar warna dengan label kontras</div>
                   </div>
                   <input 
                     type="checkbox" 
                     checked={showCutoutCards} 
                     onChange={(e) => setShowCutoutCards(e.target.checked)} 
                     className="w-4.5 h-4.5 accent-amber-500 cursor-pointer" 
                   />
                </div>

                {showCutoutCards && (
                  <div className={`p-3 rounded-lg border space-y-3.5 ${isDarkMode ? 'bg-[#111] border-[#252525]' : 'bg-white border-gray-200'}`}>
                    
                    {/* Pilihan Warna Kartu Bervariasi */}
                    <div>
                      <div className={`text-[11px] font-semibold mb-2 ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>Pilihan Warna Kartu</div>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                         {[
                           { hex: '#FFFFFF', label: 'White' },
                           { hex: '#F8F7F2', label: 'Warm' },
                           { hex: '#FEF08A', label: 'Yellow' },
                           { hex: '#BAE6FD', label: 'Sky' },
                           { hex: '#BBF7D0', label: 'Mint' },
                           { hex: '#FBCFE8', label: 'Pink' },
                           { hex: '#18181B', label: 'Dark' }
                         ].map(item => (
                            <button
                              key={item.hex}
                              onClick={() => setCutoutCardColor(item.hex)}
                              className={`h-8 rounded flex items-center justify-center text-[9px] font-bold border transition-all ${cutoutCardColor.toUpperCase() === item.hex ? 'ring-2 ring-emerald-500 scale-105 shadow-md' : 'opacity-85 hover:opacity-100'}`}
                              style={{ backgroundColor: item.hex, color: getContrastTextColor(item.hex), borderColor: isDarkMode ? '#444' : '#ccc' }}
                            >
                              {item.label}
                            </button>
                         ))}
                         {/* Custom Color Input */}
                         <label className={`h-8 rounded flex items-center justify-center text-[9px] font-bold border cursor-pointer relative overflow-hidden ${isDarkMode ? 'bg-[#1a1a1a] border-[#333] text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                            <span>Custom</span>
                            <input 
                              type="color" 
                              value={cutoutCardColor} 
                              onChange={(e) => setCutoutCardColor(e.target.value)} 
                              className="absolute opacity-0 inset-0 w-full h-full cursor-pointer" 
                            />
                         </label>
                      </div>
                    </div>

                    {/* Transparansi Kartu */}
                    <div>
                      <div className={`flex justify-between text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>
                         <span>Opasitas Kartu (Solid / Frosted)</span>
                         <span className="font-mono text-amber-500">{cutoutCardOpacity}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="30" 
                        max="100" 
                        value={cutoutCardOpacity} 
                        onChange={(e) => setCutoutCardOpacity(Number(e.target.value))} 
                        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-500 ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} 
                      />
                    </div>

                    {/* Kepadatan Kartu (Auto Mode) */}
                    {!isManualMode && (
                      <div>
                        <div className={`flex justify-between text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>
                           <span>Kepadatan Kartu Otomatis</span>
                           <span className="font-mono text-amber-500">{cutoutCardDensity}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="40" 
                          value={cutoutCardDensity} 
                          onChange={(e) => setCutoutCardDensity(Number(e.target.value))} 
                          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-500 ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} 
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 2. KOTAK PEMBINGKAI SCRATCH & VARIASI UKURAN */}
          <div className="space-y-3">
            <button onClick={() => toggleAccordion('boxes')} className="w-full flex items-center justify-between focus:outline-none">
              <div className="flex items-center space-x-2">
                <span className="text-emerald-500">◻</span>
                <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#aaa]' : 'text-gray-800'}`}>Kotak Pembingkai Scratch</h2>
              </div>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${showScratchBoxes ? (isDarkMode ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-emerald-100 text-emerald-800') : 'text-gray-500'}`}>
                {showScratchBoxes ? 'ON' : 'OFF'}
              </span>
            </button>
            
            {accordions.boxes && (
              <div className="space-y-3.5 pt-1 animate-in fade-in duration-200">
                <div className={`p-3 rounded-lg border flex items-center justify-between ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                   <div>
                      <div className="text-xs font-bold">Garis Bingkai Kotak</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Outline pembatas di sekeliling sel stretch & kartu</div>
                   </div>
                   <input 
                     type="checkbox" 
                     checked={showScratchBoxes} 
                     onChange={(e) => setShowScratchBoxes(e.target.checked)} 
                     className="w-4.5 h-4.5 accent-[#10B981] cursor-pointer" 
                   />
                </div>

                {/* Variasi Ukuran Kotak yang Lebih Variatif */}
                <div className={`p-3 rounded-lg border space-y-3 ${isDarkMode ? 'bg-[#111] border-[#252525]' : 'bg-white border-gray-200'}`}>
                   <div>
                     <div className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>Variasi Ukuran Kotak</div>
                     <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'varied', label: 'Dynamic Mix', desc: 'Campuran besar & kecil' },
                          { id: 'editorial', label: 'Editorial Hero', desc: 'Hero block & slim slit' },
                          { id: 'bento', label: 'Bento Grid', desc: 'Kuadran asimetris' },
                          { id: 'balanced', label: 'Balanced', desc: 'Ukuran reguler' }
                        ].map(v => (
                           <button
                             key={v.id}
                             onClick={() => setBoxSizeVariety(v.id)}
                             className={`p-2 text-left rounded border transition-all ${boxSizeVariety === v.id ? (isDarkMode ? 'bg-[#1a1a1a] border-[#10B981] text-emerald-400' : 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold') : (isDarkMode ? 'bg-[#161616] border-[#2a2a2a] text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-700')}`}
                           >
                             <div className="text-[10px] font-bold">{v.label}</div>
                             <div className="text-[8px] opacity-70">{v.desc}</div>
                           </button>
                        ))}
                     </div>
                   </div>

                   {showScratchBoxes && (
                     <>
                        <div className="flex items-center justify-between pt-1">
                           <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>Ketebalan Garis Border</span>
                           <div className="flex space-x-1">
                              {[1, 2, 3].map(w => (
                                 <button
                                   key={w}
                                   onClick={() => setBoxBorderWidth(w)}
                                   className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded ${boxBorderWidth === w ? (isDarkMode ? 'bg-[#10B981] text-black' : 'bg-black text-white') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-100 text-gray-600')}`}
                                 >
                                   {w}px
                                 </button>
                              ))}
                           </div>
                        </div>

                        <div className="flex items-center justify-between">
                           <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>Warna Garis Border</span>
                           <div className="flex space-x-1">
                              {[
                                { id: 'auto', label: 'Auto' },
                                { id: '#000000', label: 'Hitam' },
                                { id: '#ffffff', label: 'Putih' },
                                { id: '#00FFFF', label: 'Cyan' }
                              ].map(c => (
                                 <button
                                   key={c.id}
                                   onClick={() => setBoxBorderColor(c.id)}
                                   className={`px-2 py-1 text-[10px] font-mono rounded ${boxBorderColor === c.id ? (isDarkMode ? 'bg-[#10B981] text-black font-bold' : 'bg-black text-white font-bold') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-100 text-gray-600')}`}
                                 >
                                   {c.label}
                                 </button>
                              ))}
                           </div>
                        </div>
                     </>
                   )}
                </div>
              </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 3. TIPOGRAFI KOLOM KOTAK & PEMILIHAN FONT */}
          <div className="space-y-3">
            <button onClick={() => toggleAccordion('typo')} className="w-full flex items-center justify-between focus:outline-none">
              <div className="flex items-center space-x-2">
                <span className="text-cyan-400">Aa</span>
                <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#aaa]' : 'text-gray-800'}`}>Tipografi Kolom Kotak</h2>
              </div>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${showBoxTypography ? (isDarkMode ? 'bg-cyan-400/20 text-cyan-400' : 'bg-cyan-100 text-cyan-800') : 'text-gray-500'}`}>
                {showBoxTypography ? 'ON' : 'OFF'}
              </span>
            </button>
            
            {accordions.typo && (
              <div className="space-y-3.5 pt-1 animate-in fade-in duration-200">
                <div className={`p-3 rounded-lg border flex items-center justify-between ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                   <div>
                      <div className="text-xs font-bold">Aktifkan Tipografi Kolom</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Kata kapital tebal + indeks angka di sudut kotak</div>
                   </div>
                   <input 
                     type="checkbox" 
                     checked={showBoxTypography} 
                     onChange={(e) => setShowBoxTypography(e.target.checked)} 
                     className="w-4.5 h-4.5 accent-cyan-400 cursor-pointer" 
                   />
                </div>

                {showBoxTypography && (
                  <div className={`p-3 rounded-lg border space-y-3.5 ${isDarkMode ? 'bg-[#111] border-[#252525]' : 'bg-white border-gray-200'}`}>
                    
                    {/* Opsi Pemilihan Font */}
                    <div>
                      <div className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>Pilihan Font Family</div>
                      <div className="grid grid-cols-2 gap-1.5">
                         {[
                           { id: 'sans', label: 'Modern Sans', preview: 'Inter / Swiss' },
                           { id: 'mono', label: 'Tech Mono', preview: 'Monospace' },
                           { id: 'serif', label: 'Editorial Serif', preview: 'Playfair / Times' },
                           { id: 'grotesk', label: 'Heavy Grotesk', preview: 'Impact / Black' },
                           { id: 'condensed', label: 'Condensed', preview: 'Poster Narrow' }
                         ].map(f => (
                            <button
                              key={f.id}
                              onClick={() => setBoxFontFamily(f.id)}
                              className={`p-2 text-left rounded border transition-all ${boxFontFamily === f.id ? (isDarkMode ? 'bg-[#1a1a1a] border-cyan-400 text-cyan-400' : 'bg-cyan-50 border-cyan-600 text-cyan-900 font-bold') : (isDarkMode ? 'bg-[#161616] border-[#2a2a2a] text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-700')}`}
                            >
                              <div className="text-[10px] font-bold">{f.label}</div>
                              <div className="text-[8px] opacity-70">{f.preview}</div>
                            </button>
                         ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                       <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>Format Angka Indeks</span>
                       <div className="flex space-x-1">
                          {[
                            { id: 'plus', label: '1, 3+' },
                            { id: 'standard', label: '1, 2, 3' },
                            { id: 'pad', label: '01, 02' }
                          ].map(fmt => (
                             <button
                               key={fmt.id}
                               onClick={() => setBoxNumberFormat(fmt.id)}
                               className={`px-2 py-1 text-[10px] font-mono rounded ${boxNumberFormat === fmt.id ? (isDarkMode ? 'bg-cyan-400 text-black font-bold' : 'bg-black text-white font-bold') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-100 text-gray-600')}`}
                             >
                               {fmt.label}
                             </button>
                          ))}
                       </div>
                    </div>

                    <div>
                      <div className={`flex justify-between text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#aaa]' : 'text-gray-700'}`}>
                         <span>Skala Ukuran Teks</span>
                         <span className="font-mono text-cyan-400">{boxFontSize}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="60" 
                        max="160" 
                        value={boxFontSize} 
                        onChange={(e) => setBoxFontSize(Number(e.target.value))} 
                        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400 ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} 
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 4. MODE KUAS MANUAL (BRUSH: BISA LUKIS KARTU CUTOUT & STRETCH) */}
          <div className="space-y-4">
            <button onClick={() => toggleAccordion('mode')} className="w-full flex items-center justify-between focus:outline-none">
              <div className="flex items-center space-x-2">
                <span className="text-pink-400">🖌️</span>
                <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#aaa]' : 'text-gray-800'}`}>Effect Spread & Brush Mode</h2>
              </div>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${isManualMode ? (isDarkMode ? 'bg-pink-400/20 text-pink-400' : 'bg-pink-100 text-pink-800') : 'text-gray-500'}`}>
                {isManualMode ? 'BRUSH' : 'AUTO'}
              </span>
            </button>
            {accordions.mode && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className={`flex p-1 rounded-lg border ${isDarkMode ? 'bg-[#141414] border-[#2a2a2a]' : 'bg-gray-100 border-gray-200'}`}>
                    <button onClick={() => { setIsManualMode(false); setActiveTool('pan'); handleRandomize(); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${!isManualMode ? (isDarkMode ? 'bg-[#222] text-[#10B981] shadow-sm border border-[#333]' : 'bg-white shadow-sm text-black') : 'text-gray-500'}`}>Auto (Random)</button>
                    <button onClick={() => { setIsManualMode(true); setActiveTool('brush'); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${isManualMode ? (isDarkMode ? 'bg-[#222] text-[#10B981] shadow-sm border border-[#333]' : 'bg-white shadow-sm text-black') : 'text-gray-500'}`}>Manual (Brush)</button>
                </div>
                
                {isManualMode && (
                    <div className={`p-3.5 border rounded-lg space-y-3 ${isDarkMode ? 'bg-[#101010] border-pink-500/30' : 'bg-pink-50/50 border-pink-200'}`}>
                        <div>
                          <div className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-pink-300' : 'text-pink-800'}`}>Target Kuas (Pilih yang ingin dilukis):</div>
                          <div className="flex space-x-1.5">
                             <button 
                               onClick={() => setBrushTarget('card')}
                               className={`flex-1 py-2 rounded text-[11px] font-bold border transition-all ${brushTarget === 'card' ? (isDarkMode ? 'bg-amber-400 text-black border-amber-400 shadow' : 'bg-amber-500 text-white border-amber-600 shadow') : (isDarkMode ? 'bg-[#181818] border-[#333] text-gray-400' : 'bg-white border-gray-300 text-gray-700')}`}
                             >
                               🗂️ Lukis Kartu Solid
                             </button>
                             <button 
                               onClick={() => setBrushTarget('stretch')}
                               className={`flex-1 py-2 rounded text-[11px] font-bold border transition-all ${brushTarget === 'stretch' ? (isDarkMode ? 'bg-[#00FFFF] text-black border-[#00FFFF] shadow' : 'bg-blue-600 text-white border-blue-700 shadow') : (isDarkMode ? 'bg-[#181818] border-[#333] text-gray-400' : 'bg-white border-gray-300 text-gray-700')}`}
                             >
                               🌊 Lukis Stretch
                             </button>
                          </div>
                          <p className={`text-[10px] mt-1.5 leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {brushTarget === 'card' ? 'Sapukan kuas untuk menaruh kartu cutout solid berlabel tepat di area yang Anda inginkan.' : 'Sapukan kuas untuk melukis efek slit-scan stretch pada bagian gambar yang dipilih.'}
                          </p>
                        </div>

                        <div>
                            <div className={`flex justify-between text-[10px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>
                                <span>Ukuran Kuas (Brush Size)</span><span className="font-mono text-pink-400">{brushSize}px</span>
                            </div>
                            <input type="range" min="10" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-pink-400 ${isDarkMode ? 'bg-[#222]' : 'bg-pink-200'}`} />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                           <button onClick={clearCardMask} className={`text-[10px] py-1.5 rounded font-semibold transition border ${isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-amber-400 hover:bg-[#252525]' : 'bg-white border-gray-300 text-amber-700 hover:bg-gray-50'}`}>Hapus Mask Kartu</button>
                           <button onClick={clearStretchMask} className={`text-[10px] py-1.5 rounded font-semibold transition border ${isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-cyan-400 hover:bg-[#252525]' : 'bg-white border-gray-300 text-blue-700 hover:bg-gray-50'}`}>Hapus Mask Stretch</button>
                        </div>
                        <button onClick={clearAllMasks} className={`w-full text-[10px] py-1.5 rounded font-bold transition border ${isDarkMode ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>Hapus Semua Goresan Kuas</button>
                    </div>
                )}
              </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 5. IMAGE OPERATIONS & FORMAT */}
          <div className="space-y-4">
            <button onClick={() => toggleAccordion('ops')} className="w-full flex items-center justify-between focus:outline-none">
              <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Image Operations</h2>
              <svg className={`w-4 h-4 transition-transform duration-300 ${accordions.ops ? 'rotate-180' : ''} ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {accordions.ops && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <button onClick={() => fileInputRef.current.click()} className={`w-full py-3 rounded-lg font-bold text-xs transition shadow active:scale-95 ${isDarkMode ? 'bg-[#10B981] text-black hover:bg-[#059669]' : 'bg-black text-white hover:bg-gray-800'}`}>
                  Upload Image
                </button>
                <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
                
                <div className="flex space-x-2">
                  <button onClick={handleRotate} className={`flex-1 text-xs py-2 rounded-md font-medium transition ${isDarkMode ? 'bg-[#1a1a1a] text-[#ccc] hover:bg-[#252525] border border-[#2a2a2a]' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>↻ Rotate 90°</button>
                  <button onClick={handleRandomize} className={`flex-1 text-xs py-2 rounded-md font-medium transition ${isDarkMode ? 'bg-[#1a1a1a] text-[#ccc] hover:bg-[#252525] border border-[#2a2a2a]' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>🔀 Randomize</button>
                </div>
                
                <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>
                        <span>Canvas Format</span>
                    </div>
                    <select 
                        value={canvasFormat} 
                        onChange={(e) => setCanvasFormat(e.target.value)}
                        className={`w-full text-xs p-2.5 border rounded-md focus:outline-none appearance-none cursor-pointer ${isDarkMode ? 'bg-[#141414] border-[#2a2a2a] text-white focus:border-[#10B981]' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
                    >
                        <option value="original">Original Image Aspect</option>
                        <option value="square">Square (1080 x 1080) - Feed</option>
                        <option value="portrait">Portrait (1080 x 1350) - IG</option>
                        <option value="landscape">Landscape (1920 x 1080) - Video</option>
                        <option value="story">Story / Reels (1080 x 1920)</option>
                        <option value="a4">A4 Zine Poster (1240 x 1754)</option>
                    </select>
                </div>

                <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>
                        <span>Image Scale (Bleed)</span>
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${isDarkMode ? 'bg-[#222] text-[#00FFFF]' : 'bg-gray-100 text-gray-600'}`}>{scale}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={scale} onChange={(e) => setScale(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#10B981] ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} />
                </div>
              </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 6. SLIT-SCAN DISTORTION PARAMETERS */}
          <div className="space-y-4">
            <button onClick={() => toggleAccordion('slit')} className="w-full flex items-center justify-between focus:outline-none">
              <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Slit-Scan Parameters</h2>
              <svg className={`w-4 h-4 transition-transform duration-300 ${accordions.slit ? 'rotate-180' : ''} ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {accordions.slit && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Cut Complexity</span><span className="text-[#10B981] font-mono text-[11px]">{complexity}%</span></div>
                    <input type="range" min="10" max="100" value={complexity} onChange={(e) => setComplexity(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#10B981] ${isDarkMode ? 'bg-[#222]' : 'bg-gray-200'}`} />
                </div>
                <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Stretch Intensity (Streak)</span><span className={`font-bold font-mono text-[11px] ${isDarkMode ? 'text-[#00FFFF]' : 'text-blue-500'}`}>{stretchInt}%</span></div>
                    <input type="range" min="0" max="150" value={stretchInt} onChange={(e) => setStretchInt(Number(e.target.value))} className={`w-full h-1.5 rounded-lg cursor-pointer accent-[#00FFFF] ${isDarkMode ? 'bg-[#222]' : 'bg-blue-200'}`} />
                </div>
                <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}><span>Brutal Distortion</span><span className="font-bold font-mono text-red-500 text-[11px]">{brutalInt}%</span></div>
                    <input type="range" min="0" max="100" value={brutalInt} onChange={(e) => setBrutalInt(Number(e.target.value))} className={`w-full h-1.5 rounded-lg cursor-pointer accent-red-500 ${isDarkMode ? 'bg-[#222]' : 'bg-red-200'}`} />
                </div>
                <div className="flex items-center justify-between pt-1">
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Arah Stretch</span>
                    <div className={`flex items-center space-x-1 text-[11px] font-mono font-bold p-1 rounded-md border ${isDarkMode ? 'bg-[#141414] border-[#2a2a2a]' : 'bg-gray-100 border-gray-200'}`}>
                        <button className={`px-3 py-1 rounded ${stretchDirX ? (isDarkMode ? 'bg-[#222] text-[#00FFFF] border border-[#444]' : 'bg-white text-black shadow-sm') : 'text-gray-500'}`} onClick={() => setStretchDirX(!stretchDirX)}>Horizontal</button>
                        <button className={`px-3 py-1 rounded ${stretchDirY ? (isDarkMode ? 'bg-[#222] text-[#00FFFF] border border-[#444]' : 'bg-white text-black shadow-sm') : 'text-gray-500'}`} onClick={() => setStretchDirY(!stretchDirY)}>Vertical</button>
                    </div>
                </div>
              </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 7. RENDER STYLES */}
          <div className="space-y-4">
            <button onClick={() => toggleAccordion('style')} className="w-full flex items-center justify-between focus:outline-none">
                <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Render Style</h2>
                <svg className={`w-4 h-4 transition-transform duration-300 ${accordions.style ? 'rotate-180' : ''} ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {accordions.style && (
                <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                    {[
                        { id: 'classic', label: 'Classic' },
                        { id: 'glitch', label: 'Glitch' },
                        { id: 'liquid', label: 'Liquid' },
                        { id: 'zine', label: 'Zine' }
                    ].map(style => (
                        <button
                            key={style.id}
                            onClick={() => setRenderStyle(style.id)}
                            className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded transition-all
                                ${renderStyle === style.id
                                    ? (isDarkMode ? 'bg-[#10B981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-black text-white shadow-md')
                                    : (isDarkMode ? 'bg-[#141414] text-[#888] border border-[#2a2a2a] hover:text-[#ccc]' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-700')
                                }`}
                        >
                            {style.label}
                        </button>
                    ))}
                </div>
            )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 8. AI AUTO ANNOTATION (GEMINI) */}
          <div className="space-y-3">
             <button onClick={() => toggleAccordion('ai')} className="w-full flex items-center justify-between focus:outline-none mb-1">
                 <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>AI Auto Annotation</h2>
                 <svg className={`w-4 h-4 transition-transform duration-300 ${accordions.ai ? 'rotate-180' : ''} ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
             </button>
             {accordions.ai && (
               <div className="space-y-3 animate-in fade-in duration-200">
                 <div className="flex items-center justify-between">
                     <span className={`text-xs font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Language</span>
                     <div className={`flex p-0.5 rounded-md border ${isDarkMode ? 'bg-[#141414] border-[#2a2a2a]' : 'bg-gray-100 border-gray-200'}`}>
                         {['EN', 'JP', 'ID'].map(lang => (
                             <button key={lang} onClick={() => setAnnoLang(lang)} className={`text-[10px] font-bold px-2 py-0.5 rounded ${annoLang === lang ? (isDarkMode ? 'bg-[#222] text-[#00FFFF] border border-[#333]' : 'bg-white text-black shadow-sm') : 'text-gray-400'}`}>{lang}</button>
                         ))}
                     </div>
                 </div>
                 <div>
                     <input type="password" placeholder="Gemini API Key (AI Studio)" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className={`w-full text-xs p-2.5 border rounded-md focus:outline-none ${isDarkMode ? 'bg-[#141414] border-[#2a2a2a] text-white focus:border-[#10B981]' : 'bg-white border-gray-300 text-gray-900'}`} />
                     <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className={`text-[10px] mt-1 inline-block font-medium hover:underline ${isDarkMode ? 'text-[#00FFFF]' : 'text-blue-600'}`}>Dapatkan Gemini API Token gratis</a>
                 </div>
                 <div className="flex items-center gap-2 pt-1">
                     <button onClick={handleAiAnalysis} disabled={isAiAnalyzing || !image} className={`w-full py-2.5 rounded-lg text-xs font-bold transition shadow flex items-center justify-center space-x-1.5 ${isAiAnalyzing || !image ? (isDarkMode ? 'bg-[#1e1e1e] text-[#555] cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed') : (isDarkMode ? 'bg-[#10B981] text-black hover:bg-[#059669]' : 'bg-gray-900 text-white hover:bg-black')}`}>
                         <span>✨</span>
                         <span>{isAiAnalyzing ? 'Menganalisis Subjek...' : 'Pindai Kata Kunci AI'}</span>
                     </button>
                 </div>
                 <p className={`text-[10px] font-medium ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Kata kunci saat ini: <span className="font-bold text-[#10B981]">{aiWords.length} kata</span> ({annoLang})</p>
               </div>
             )}
          </div>
          <hr className={`border-t ${isDarkMode ? 'border-[#1e1e1e]' : 'border-gray-200'}`} />

          {/* 9. LEGACY VISUALS & OVERLAYS */}
          <div className="space-y-4">
             <button onClick={() => toggleAccordion('visuals')} className="w-full flex items-center justify-between focus:outline-none mb-1">
               <h2 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`}>Legacy Visuals & Guides</h2>
               <svg className={`w-4 h-4 transition-transform duration-300 ${accordions.visuals ? 'rotate-180' : ''} ${isDarkMode ? 'text-[#555]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
             </button>
             {accordions.visuals && (
               <div className="space-y-3 animate-in fade-in duration-200">
                 <label className="flex items-center justify-between cursor-pointer">
                     <span className={`text-xs font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Show Random Grid Lines</span>
                     <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} className="w-4 h-4 accent-[#10B981]" />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer">
                     <span className={`text-xs font-semibold ${isDarkMode ? 'text-[#ccc]' : 'text-gray-700'}`}>Show Floating Annotations</span>
                     <input type="checkbox" checked={showTextAnnotations} onChange={(e) => setShowTextAnnotations(e.target.checked)} className="w-4 h-4 accent-[#00FFFF]" />
                 </label>
                 {showTextAnnotations && (
                     <div className={`flex items-center justify-between pl-3 border-l-2 ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
                         <span className={`text-xs font-medium ${isDarkMode ? 'text-[#888]' : 'text-gray-500'}`}>Warna Teks</span>
                         <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent" />
                     </div>
                 )}
               </div>
             )}
          </div>
        </div>

        {/* BOTTOM EXPORT PANEL */}
        <div className={`p-5 border-t transition-colors duration-200 ${isDarkMode ? 'bg-[#121212] border-[#1e1e1e]' : 'bg-gray-50 border-gray-200'}`}>
           <div className="flex items-center justify-between mb-3 text-[11px]">
              <span className={`font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Resolusi Ekspor</span>
              <div className="flex space-x-1">
                 {[1, 2].map(m => (
                    <button
                      key={m}
                      onClick={() => setExportMultiplier(m)}
                      className={`px-2 py-0.5 font-mono text-[10px] font-bold rounded ${exportMultiplier === m ? (isDarkMode ? 'bg-[#00FFFF] text-black' : 'bg-black text-white') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-200 text-gray-700')}`}
                    >
                      {m}x {m === 2 ? '(Hi-Res)' : ''}
                    </button>
                 ))}
              </div>
           </div>
           <div className="flex space-x-2">
              <button onClick={() => handleExport('png')} className={`flex-1 py-3 rounded-lg font-bold text-xs transition active:scale-95 ${isDarkMode ? 'bg-[#00FFFF] text-black hover:bg-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.25)]' : 'bg-black text-white hover:bg-gray-800'}`}>Export PNG</button>
              <button onClick={() => handleExport('jpg')} className={`flex-1 border py-3 rounded-lg font-bold text-xs transition active:scale-95 ${isDarkMode ? 'border-[#333] bg-[#1a1a1a] text-[#ccc] hover:bg-[#252525]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>Export JPG</button>
           </div>
        </div>
      </div>

      {/* --- WORKSPACE KANVAS KANAN --- */}
      <div 
        className={`flex-1 relative overflow-hidden touch-none transition-colors duration-200 ${isDarkMode ? 'bg-[#080808]' : 'bg-[#E5E7EB]'}`}
        onPointerEnter={() => setIsHoveringWorkspace(true)}
        onPointerLeave={(e) => {
            setIsHoveringWorkspace(false);
            handleWorkspacePointerUp(e);
        }}
        onPointerMove={handleWorkspacePointerMove}
        onPointerDown={handleWorkspacePointerDown}
        onPointerUp={handleWorkspacePointerUp}
      >
         
         {/* Titik Sudut Rulers */}
         <div className={`absolute top-0 left-0 w-[24px] h-[24px] border-b border-r z-50 transition-colors ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-[#1F2937] border-[#374151]'}`}></div>

         {/* Ruler Horizontal */}
         <div 
            className={`absolute top-0 left-[24px] right-0 h-[24px] border-b z-40 overflow-hidden transition-colors ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-[#1F2937] border-[#374151]'}`}
            onPointerDown={(e) => startGuideFromRuler(e, 'h')}
            title="Tarik dari penggaris untuk membuat Garis Panduan Horizontal"
         >
            <Ruler type="h" pan={pan} zoom={viewScale} length={viewportSize.w} isDarkMode={isDarkMode} />
         </div>

         {/* Ruler Vertikal */}
         <div 
            className={`absolute top-[24px] left-0 bottom-0 w-[24px] border-r z-40 overflow-hidden transition-colors ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-[#1F2937] border-[#374151]'}`}
            onPointerDown={(e) => startGuideFromRuler(e, 'v')}
            title="Tarik dari penggaris untuk membuat Garis Panduan Vertikal"
         >
             <Ruler type="v" pan={pan} zoom={viewScale} length={viewportSize.h} isDarkMode={isDarkMode} />
         </div>

         {/* Viewport & Canvas Area */}
         <div 
            className="absolute top-[24px] left-[24px] right-0 bottom-0 overflow-hidden"
            ref={viewportRef}
            onWheel={(e) => {
                e.preventDefault();
                if (e.deltaY < 0) setViewScale(v => Math.min(v + 0.1, 5));
                else setViewScale(v => Math.max(v - 0.1, 0.1));
            }}
         >
            <div 
               style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`, transformOrigin: 'center' }}
               className={`w-full h-full flex items-center justify-center transition-transform duration-75
                           ${currentTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : (currentTool === 'brush' && isManualMode ? 'cursor-none' : 'cursor-crosshair')}`}
            >
               <canvas ref={canvasRef} className={`shadow-[0_0_50px_rgba(0,0,0,0.6)] object-contain ${isDarkMode ? 'bg-[#050505]' : 'bg-white'}`} />
            </div>

            {/* Draggable Guides */}
            {guides.map(g => (
               <div 
                  key={g.id}
                  style={{ [g.type === 'h' ? 'top' : 'left']: (g.type === 'h' ? viewportSize.h/2 + pan.y + g.pos * viewScale : viewportSize.w/2 + pan.x + g.pos * viewScale) + 'px' }}
                  className={`absolute z-30 flex items-center justify-center
                             ${g.type === 'h' ? 'left-0 right-0 h-[7px] -mt-[3px] cursor-ns-resize' : 'top-0 bottom-0 w-[7px] -ml-[3px] cursor-ew-resize'}`}
                  onPointerDown={(e) => { e.stopPropagation(); setDraggingGuide({id: g.id, type: g.type}); }}
               >
                  <div className={`bg-[#00FFFF] shadow-[0_0_3px_#00FFFF] ${g.type === 'h' ? 'w-full h-[1px]' : 'h-full w-[1px]'}`}></div>
               </div>
            ))}
         </div>

         {/* Feedback Visual Kursor Brush di Kanvas */}
         {isHoveringWorkspace && currentTool === 'brush' && isManualMode && (
            <div
                className="fixed rounded-full pointer-events-none z-[9999] flex items-center justify-center"
                style={{
                    left: mousePos.x,
                    top: mousePos.y,
                    width: brushSize,
                    height: brushSize,
                    transform: 'translate(-50%, -50%)',
                    border: brushTarget === 'card' ? '2px solid #FACC15' : '2px solid #00FFFF', 
                    backgroundColor: brushTarget === 'card' ? 'rgba(250, 204, 21, 0.2)' : 'rgba(0, 255, 255, 0.15)'
                }}
            >
               <span className="text-[9px] font-bold px-1 rounded shadow" style={{ backgroundColor: brushTarget === 'card' ? '#FACC15' : '#00FFFF', color: '#000000' }}>
                 {brushTarget === 'card' ? 'CARD' : 'STRETCH'}
               </span>
            </div>
         )}

         {/* FLOATING TOOLS PALETTE */}
         <div className={`absolute top-[40px] left-[40px] backdrop-blur-md border rounded-lg shadow-2xl flex flex-col z-50 overflow-hidden ${isDarkMode ? 'bg-[#121212]/90 border-[#262626]' : 'bg-white/95 border-gray-300'}`}>
            <button 
                className={`p-2.5 transition flex items-center justify-center ${activeTool==='pan' ? (isDarkMode ? 'bg-[#10B981] text-black shadow-sm' : 'bg-black text-white') : (isDarkMode ? 'text-[#888] hover:text-white hover:bg-[#222]' : 'text-gray-500 hover:text-black hover:bg-gray-100')}`}
                onClick={() => setActiveTool('pan')} title="Hand Tool (Pan Kanvas) - Shortcut: Spacebar"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="19 9 22 12 19 15"/><polyline points="9 19 12 22 15 19"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
            </button>
            <button 
                className={`p-2.5 transition flex items-center justify-center ${activeTool==='brush' && isManualMode ? (brushTarget === 'card' ? 'bg-amber-400 text-black shadow-sm' : 'bg-[#10B981] text-black shadow-sm') : (isDarkMode ? 'text-[#888] hover:text-white hover:bg-[#222]' : 'text-gray-500 hover:text-black hover:bg-gray-100')}`}
                onClick={() => { setActiveTool('brush'); setIsManualMode(true); }} title="Brush Tool (Lukis Kartu / Stretch)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.35 2.22 1.45 3.02 1.45 2.67 0 4.81-2.16 4.81-4.83 0-1.66-1.34-3.02-3.01-3.02z"/></svg>
            </button>
            <div className={`h-[1px] w-full ${isDarkMode ? 'bg-[#262626]' : 'bg-gray-200'}`}></div>
            <button 
                className="p-2.5 transition flex items-center justify-center text-red-500 hover:bg-red-500/20 hover:text-red-400"
                onClick={() => setGuides([])} title="Hapus Semua Garis Panduan (Clear Guides)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
         </div>

         {/* ZOOM CONTROLS WIDGET */}
         <div className={`absolute bottom-6 right-6 backdrop-blur-md text-xs rounded-lg shadow-2xl flex items-center border overflow-hidden z-50 ${isDarkMode ? 'bg-[#121212]/90 text-[#ccc] border-[#262626]' : 'bg-white/95 text-gray-700 border-gray-300'}`}>
            <button className={`px-3 py-2 transition font-bold ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100'}`} onClick={() => setViewScale(v => Math.max(0.1, v - 0.1))}>—</button>
            <span className={`px-2.5 font-mono text-[11px] border-x min-w-[55px] text-center font-bold ${isDarkMode ? 'border-[#262626] text-[#00FFFF]' : 'border-gray-200'}`}>{Math.round(viewScale * 100)}%</span>
            <button className={`px-3 py-2 transition font-bold ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100'}`} onClick={() => setViewScale(v => Math.min(5, v + 0.1))}>+</button>
            <button className={`px-3 py-2 transition font-bold ${isDarkMode ? 'hover:bg-[#222] text-[#10B981]' : 'hover:bg-gray-100 text-emerald-600'}`} onClick={() => { setViewScale(1); setPan({x:0, y:0}); }}>Reset</button>
         </div>

      </div>
    </div>
  );
}