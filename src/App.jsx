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
        
        ctx.fillStyle = isDarkMode ? '#121212' : '#F3F4F6'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = isDarkMode ? '#777777' : '#6B7280'; 
        ctx.strokeStyle = isDarkMode ? '#282828' : '#D1D5DB'; 
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
  
  // Navigation & Workspace Tools
  const [activeTool, setActiveTool] = useState('pan'); // 'pan' | 'brush'
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushTarget, setBrushTarget] = useState('card'); // 'card' | 'stretch'
  const [brushSize, setBrushSize] = useState(65);
  const [viewScale, setViewScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  
  // UI Tabs & Modal States
  const [activeTab, setActiveTab] = useState('boxes'); // 'boxes', 'slit', 'brush', 'ai', 'canvas'
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Dynamic Guides
  const [guides, setGuides] = useState([]);
  const [draggingGuide, setDraggingGuide] = useState(null); 

  // Masking Refs untuk Kuas
  const stretchMaskPointsRef = useRef([]); 
  const cardMaskPointsRef = useRef([]); 
  const isPaintingRef = useRef(false);
  const animationFrameId = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);

  // Slit-scan Core Parameters
  const [scale, setScale] = useState(85); 
  const [complexity, setComplexity] = useState(55); 
  const [density, setDensity] = useState(65);       
  const [stretchInt, setStretchInt] = useState(72); 
  const [brutalInt, setBrutalInt] = useState(25); 
  const [stretchDirX, setStretchDirX] = useState(true);
  const [stretchDirY, setStretchDirY] = useState(true);
  const [stretchBalance, setStretchBalance] = useState(75); // 0 (100% V) s/d 100 (100% H), default 75

  // Mode Batas Grid & Posisi Gambar (Sinkronisasi Gerak & Batas)
  const [gridBoundsMode, setGridBoundsMode] = useState('image'); // 'image' (terkunci rapat ke gambar) | 'canvas' (penuh kanvas)
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);

  // Kotak Pembingkai Scratch & Variasi Ukuran
  const [showScratchBoxes, setShowScratchBoxes] = useState(true);
  const [boxBorderWidth, setBoxBorderWidth] = useState(1);
  const [boxBorderColor, setBoxBorderColor] = useState('auto'); // 'auto', '#000000', '#ffffff', '#10B981', '#00FFFF'
  const [boxSizeVariety, setBoxSizeVariety] = useState('editorial'); // 'balanced', 'varied', 'editorial', 'bento'

  const [showIntactBoxBorders, setShowIntactBoxBorders] = useState(false); // Beri garis & label pada kotak normal utuh
  const [showDirectionArrows, setShowDirectionArrows] = useState(true); // Tampilkan panah ↓ / → pada angka sesuai arah slit

  // Kartu Cutout Solid
  const [showCutoutCards, setShowCutoutCards] = useState(true);
  const [cutoutCardColor, setCutoutCardColor] = useState('#FFFFFF');
  const [cutoutCardOpacity, setCutoutCardOpacity] = useState(100);
  const [cutoutCardDensity, setCutoutCardDensity] = useState(16);

  // Tipografi Kolom Kotak
  const [showBoxTypography, setShowBoxTypography] = useState(true);
  const [boxFontFamily, setBoxFontFamily] = useState('sans'); // 'sans', 'mono', 'serif', 'grotesk', 'condensed'
  const [boxNumberFormat, setBoxNumberFormat] = useState('arrows'); // 'arrows', 'plus', 'standard', 'pad'
  const [boxFontSize, setBoxFontSize] = useState(100);
  
  // Visual Overlays & Legacy
  const [showGridLines, setShowGridLines] = useState(false);
  const [showTextAnnotations, setShowTextAnnotations] = useState(false);
  const [textColor, setTextColor] = useState('#00FFFF'); 
  
  const [renderStyle, setRenderStyle] = useState('classic'); 
  const [canvasFormat, setCanvasFormat] = useState('original');
  const [exportMultiplier, setExportMultiplier] = useState(1);

  // AI State
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [annoLang, setAnnoLang] = useState('EN'); 
  // Helper untuk memuat kunci API aman (Local Storage > Env > Default Token)
const getInitialApiKey = () => {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('geminiApiKey');
      if (saved && saved.trim()) return saved.trim();
    }
    const envKey = import.meta.env?.VITE_GEMINI_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
    return atob('QVEuQWI4Uk42SWg0Tk4yc000dHpzc0RIZTd1dHY0dkF3WU5YMU1GR2lFYkZUdG1KQ3NfUEE=');
  } catch (e) {
    return '';
  }
};
  const [apiKeyInput, setApiKeyInput] = useState(() => {
    return getInitialApiKey();
  }); 
  const [newKeywordInput, setNewKeywordInput] = useState('');

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringWorkspace, setIsHoveringWorkspace] = useState(false);

  // Kosakata Desain Kontemporer & Taksonomi Spesimen Ilmiah (Swiss Archive)
  const fallbackWords = {
    'ID': [
      'GOLDFISH', 'STRUKTUR', 'ANATOMI', 'WARNA-CERAH', 'FOKUS-TAJAM', 'SIRIP-TRANSPARAN', 
      'SISIK-HALUS', 'BENTUK-ORGANIK', 'FOTOGRAFI-MAKRO', 'LATAR-BERSIH', 'ISOLASI', 
      'MINIMALIS', 'PROFIL', 'TEKSTUR', 'KERANGKA', 'SIMETRI', 'BIOLOGIS', 'METAMORFOSIS', 'KONTRAST'
    ],
    'EN': [
      'ANATOMY', 'MACRO-PHOTOGRAPHY', 'VIBRANT-ORANGE', 'TRANSLUCENT-FINS', 'DELICATE-SCALES', 
      'SHARP-FOCUS', 'AQUATIC-LIFE', 'FLOWING-TAIL', 'SURPRISED-EXPRESSION', 'ORGANIC-SHAPES', 
      'QUIRKY-CHARACTER', 'STUDIO-SHOOT', 'MINIMALIST', 'ISOLATED', 'PURE-WHITE-BACKGROUND', 
      'FLAMINGO', 'CORAL', 'GRACEFUL', 'EXOTIC', 'AVIAN-FORM', 'TROPICAL', 'S-CURVE', 
      'PLUMAGE', 'PROFILE', 'LONG-LEGGED', 'SALMON', 'BEAK', 'TEXTURE', 'ELEGANT', 'WILDLIFE', 
      'FISH', 'SKELETON', 'BONE', 'SPINE', 'RIBS', 'SKULL', 'FRAGILE', 'INTRICATE', 'STRUCTURAL', 
      'SCIENTIFIC', 'MARINE', 'REMAINS', 'BIOLOGICAL', 'SYMMETRY', 'STARK', 'CATERPILLAR', 
      'SWALLOWTAIL', 'LARVA', 'STRIPED', 'SPOTTED', 'DORSAL', 'LATERAL', 'LEPIDOPTERA', 
      'YELLOW', 'METAMORPHOSIS', 'CONTRAST', 'VIVID', 'VENTRAL', 'SEGMENTED'
    ],
    'JP': [
      '解剖学', '構造', 'マクロ写真', '標本', '骨格', '幾何学', 'ミニマリズム', 
      '対称性', '生物学', '輪郭', '透明感', 'ディテール', 'レトロ', 'デジタル', '美学', 'モダン'
    ]
  };
  const [aiWords, setAiWords] = useState(fallbackWords['EN']);
  const [scanResult, setScanResult] = useState(null);
  const [showScanResultModal, setShowScanResultModal] = useState(false);
  const [copiedWordsNotice, setCopiedWordsNotice] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

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

  const applyKeywordsToCells = useCallback((wordsToApply) => {
    if (!wordsToApply || wordsToApply.length === 0) return;
    setAiWords(wordsToApply);
  }, []);

  useEffect(() => {
     const words = fallbackWords[annoLang] || fallbackWords['EN'];
     applyKeywordsToCells(words);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annoLang]);

  useEffect(() => {
      const savedKey = localStorage.getItem('geminiApiKey');
      if (savedKey) {
        setApiKeyInput(savedKey);
      } else {
        localStorage.setItem('geminiApiKey', getInitialApiKey());
        setApiKeyInput(getInitialApiKey());
      }
  }, []);

  // Keyboard Shortcuts Global
  useEffect(() => {
      const handleKeyDown = (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
          
          if (e.code === 'Space') {
              e.preventDefault();
              setIsSpacePressed(true);
              if (isPaintingRef.current) isPaintingRef.current = false; 
          } else if (e.key === 'b' || e.key === 'B') {
              setActiveTool('brush');
              setIsManualMode(true);
              showToast('Kuas Aktif (Mode Manual)');
          } else if (e.key === 'h' || e.key === 'H') {
              setActiveTool('pan');
              showToast('Hand Tool (Pan)');
          } else if (e.key === 'r' || e.key === 'R') {
              handleRandomize();
              showToast('Seed Diacak 🔀');
          } else if (e.key === '1') {
              applyPreset('cat_diagonal');
          } else if (e.key === '2') {
              applyPreset('goldfish_axial');
          } else if (e.key === '3') {
              applyPreset('flamingo_column');
          } else if (e.key === '4') {
              applyPreset('fish_skeleton');
          } else if (e.key === '5') {
              applyPreset('editorial');
          } else if (e.key === '6') {
              applyPreset('cyber');
          } else if (e.key === '7') {
              applyPreset('zine');
          } else if (e.key === '8') {
              applyPreset('minimal');
          } else if (e.key === '?') {
              setShowShortcutsModal(prev => !prev);
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
          showToast('Gambar berhasil dimuat!');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = (e) => processFile(e.target.files[0]);
  const handleRotate = () => { 
    setRotation((prev) => (prev + 90) % 360); 
    if (stretchMaskPointsRef.current && stretchMaskPointsRef.current.length > 0) {
      stretchMaskPointsRef.current = stretchMaskPointsRef.current.map(pt => ({
        ...pt,
        nx: 1 - pt.ny,
        ny: pt.nx
      }));
    }
    if (cardMaskPointsRef.current && cardMaskPointsRef.current.length > 0) {
      cardMaskPointsRef.current = cardMaskPointsRef.current.map(pt => ({
        ...pt,
        nx: 1 - pt.ny,
        ny: pt.nx
      }));
    }
    showToast('Kanvas Diputar 90°');
  };
  const handleRandomize = () => {
    setSeed(Math.random() * 10000);
  };

  // --- SAMPEL ESTETIK BAWAAN (Untuk Pengujian Instan 1-Klik) ---
  const loadAestheticSample = () => {
    const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#090d16"/>
          <stop offset="35%" stop-color="#181534"/>
          <stop offset="65%" stop-color="#4c1d95"/>
          <stop offset="100%" stop-color="#be185d"/>
        </linearGradient>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fde047"/>
          <stop offset="45%" stop-color="#f97316"/>
          <stop offset="100%" stop-color="#e11d48"/>
        </radialGradient>
        <linearGradient id="mountain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#047857"/>
          <stop offset="100%" stop-color="#06251b"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1080" fill="url(#sky)"/>
      <circle cx="540" cy="450" r="230" fill="url(#sun)"/>
      <polygon points="0,880 260,570 540,830 820,510 1080,790 1080,1080 0,1080" fill="url(#mountain)" opacity="0.95"/>
      <polygon points="0,940 370,720 730,970 1080,750 1080,1080 0,1080" fill="#031a13"/>
      <text x="540" y="320" font-family="'Helvetica Neue', Arial, sans-serif" font-size="82" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="14">GRID STUDIO</text>
      <text x="540" y="390" font-family="'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="700" fill="#38bdf8" text-anchor="middle" letter-spacing="8">VISUAL SLIT SCAN</text>
    </svg>`;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setSeed(4821);
      stretchMaskPointsRef.current = [];
      cardMaskPointsRef.current = [];
      setViewScale(1);
      setPan({ x: 0, y: 0 });
      applyPreset('editorial');
      showToast('Gambar sampel estetik berhasil dimuat!');
    };
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgData);
  };

  // --- PRESET SYSTEM (1-Klik Tampilan Siap Pakai) ---
  const applyPreset = (presetName) => {
    if (presetName === 'cat_diagonal') {
      setShowScratchBoxes(true);
      setShowIntactBoxBorders(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxSizeVariety('bento');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setRenderStyle('classic');
      setStretchBalance(55);
      setStretchInt(75);
      setComplexity(50);
      setIsDarkMode(false);
      setShowGridLines(false);
      setShowTextAnnotations(false);
      showToast('Preset: 🐱 Stepped Diagonal (Cat) diterapkan');
    } else if (presetName === 'goldfish_axial') {
      setShowScratchBoxes(true);
      setShowIntactBoxBorders(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxSizeVariety('editorial');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setRenderStyle('classic');
      setStretchBalance(70);
      setStretchInt(80);
      setComplexity(55);
      setIsDarkMode(false);
      setShowGridLines(false);
      setShowTextAnnotations(false);
      showToast('Preset: 🐠 Axial Cross (Goldfish) diterapkan');
    } else if (presetName === 'flamingo_column') {
      setShowScratchBoxes(true);
      setShowIntactBoxBorders(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxSizeVariety('editorial');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setRenderStyle('classic');
      setStretchBalance(35);
      setStretchInt(75);
      setComplexity(45);
      setIsDarkMode(false);
      setShowGridLines(false);
      setShowTextAnnotations(false);
      showToast('Preset: 🦩 Columnar T-Frame (Flamingo) diterapkan');
    } else if (presetName === 'fish_skeleton') {
      setShowScratchBoxes(true);
      setShowIntactBoxBorders(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxSizeVariety('bento');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setRenderStyle('classic');
      setStretchBalance(50);
      setStretchInt(70);
      setComplexity(58);
      setIsDarkMode(false);
      setShowGridLines(false);
      setShowTextAnnotations(false);
      showToast('Preset: 🦴 Anatomy Spine (Fish) diterapkan');
    } else if (presetName === 'editorial') {
      setShowIntactBoxBorders(false);
      setShowDirectionArrows(false);
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
      showToast('Preset: 📰 Editorial Grid diterapkan');
    } else if (presetName === 'cyber') {
      setShowIntactBoxBorders(false);
      setShowDirectionArrows(false);
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
      showToast('Preset: ⚡ Cyber Slit diterapkan');
    } else if (presetName === 'zine') {
      setShowIntactBoxBorders(false);
      setShowDirectionArrows(false);
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
      showToast('Preset: 📄 Brutal Zine diterapkan');
    } else if (presetName === 'minimal') {
      setShowIntactBoxBorders(false);
      setShowDirectionArrows(false);
      setShowScratchBoxes(false);
      setShowBoxTypography(false);
      setShowCutoutCards(false);
      setRenderStyle('classic');
      setStretchInt(60);
      showToast('Preset: 🎛️ Raw Slit diterapkan');
    }
  };
  
  const handleExport = (format, multiplier = exportMultiplier) => {
    setShowExportMenu(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (multiplier === 1) {
      const link = document.createElement('a');
      link.download = `grid-studio-${Date.now()}.${format}`;
      link.href = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
      link.click();
      showToast(`Ekspor Berhasil (${format.toUpperCase()} 1x)`);
    } else {
      const hiResCanvas = document.createElement('canvas');
      hiResCanvas.width = canvas.width * multiplier;
      hiResCanvas.height = canvas.height * multiplier;
      const hCtx = hiResCanvas.getContext('2d');
      hCtx.imageSmoothingEnabled = true;
      hCtx.imageSmoothingQuality = 'high';
      hCtx.drawImage(canvas, 0, 0, hiResCanvas.width, hiResCanvas.height);
      const link = document.createElement('a');
      link.download = `grid-studio-hires-${multiplier}x-${Date.now()}.${format}`;
      link.href = hiResCanvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
      link.click();
      showToast(`Ekspor Berhasil (${format.toUpperCase()} ${multiplier}x Hi-Res)`);
    }
  };

  // --- Analisis Visual Cerdas Lokal (Bebas Token & Instan) ---
  const analyzeImageVisually = (img, lang = 'EN') => {
    try {
      const canvas = document.createElement('canvas');
      const sampleSize = 120;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

      let rTotal = 0, gTotal = 0, bTotal = 0, lumTotal = 0;
      let minLum = 255, maxLum = 0;
      const totalPixels = sampleSize * sampleSize;

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        rTotal += r;
        gTotal += g;
        bTotal += b;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lumTotal += lum;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
      }

      const avgR = rTotal / totalPixels;
      const avgG = gTotal / totalPixels;
      const avgB = bTotal / totalPixels;
      const avgLum = lumTotal / totalPixels;
      const contrast = maxLum - minLum;

      const isWarm = avgR > avgB + 18 || (avgR > 140 && avgG > 100 && avgB < 100);
      const isCool = avgB > avgR + 15 || avgB > 140;
      const isGreen = avgG > avgR + 12 && avgG > avgB + 12;
      const isMono = Math.abs(avgR - avgG) < 14 && Math.abs(avgG - avgB) < 14;
      const isHighKey = avgLum > 175;
      const isLowKey = avgLum < 85;
      const isHighContrast = contrast > 180;

      const vocabularies = {
        ID: {
          base: ['SPESIMEN', 'ANATOMI', 'STRUKTUR', 'TAKSONOMI', 'GEOMETRI', 'SIMETRI', 'ARSIP-LAB', 'BIOLOGIS'],
          warm: ['ORANYE-CORAL', 'PIGMEN-HANGAT', 'VIBRAN-SPEKTRUM', 'RADIASI-TERMAL'],
          cool: ['SIANO-AQUATIK', 'REFLEKSI-DINGIN', 'KEDALAMAN-BIRU', 'SPEKTRUM-ES'],
          green: ['KLOROFIL-FLORA', 'BOTANIKAL', 'ORGANIK-SELULAR', 'STRUKTUR-DAUN'],
          mono: ['MONOKROMATIK', 'KONTRAST-MUTLAK', 'SILUET-TAJAM', 'SKALA-ABU'],
          highKey: ['ISOLASI-PUTIH', 'LATAR-BERSIH', 'LUMINESENSI', 'TRANSPARAN'],
          lowKey: ['OBSKUR-NOIR', 'BAYANGAN-DALAM', 'TEKSTUR-GELAP', 'MISTERI'],
          highContrast: ['GARIS-TEGAS', 'DINAMIKA-OPTIK', 'INTENSITAS-TAJAM', 'FOKUS-MAKRO'],
          standard: ['MINIMALIS', 'MODULAR-SWISS', 'PROFIL-ELEGAN', 'RITME-VISUAL']
        },
        EN: {
          base: ['SPECIMEN', 'ANATOMY', 'STRUCTURE', 'TAXONOMY', 'GEOMETRY', 'SYMMETRY', 'ARCHIVE', 'BIOLOGICAL'],
          warm: ['VIBRANT-CORAL', 'WARM-SPECTRUM', 'AMBER-PIGMENT', 'THERMAL-HUE'],
          cool: ['AQUATIC-CYAN', 'COOL-REFLECTION', 'DEEP-CHROMA', 'AZURE-TINT'],
          green: ['BOTANICAL', 'ORGANIC-CHLORO', 'FLORA-FORM', 'CELLULAR-NODE'],
          mono: ['MONOCHROME', 'STARK-CONTRAST', 'SHADOW-SILHOUETTE', 'GRAYSCALE'],
          highKey: ['ISOLATED-WHITE', 'CLEAN-FIELD', 'TRANSLUCENT', 'HIGH-KEY-LIGHT'],
          lowKey: ['OBSCURA-NOIR', 'DEEP-SHADOW', 'DARK-SURFACE', 'LOW-KEY-TONE'],
          highContrast: ['SHARP-FOCUS', 'OPTICAL-EDGE', 'DYNAMIC-RHYTHM', 'MACRO-DETAIL'],
          standard: ['MINIMALIST', 'SWISS-MODULAR', 'ELEGANT-PROFILE', 'STUDIO-ISOLATION']
        },
        JP: {
          base: ['標本', '解剖学', '構造', '分類学', '幾何学', '対称性', 'アーカイブ', '生物学'],
          warm: ['珊瑚色', '温色スペクトル', '琥珀色素', '熱放射'],
          cool: ['水性シアン', '寒冷反射', '深色クロマ', '青空色彩'],
          green: ['葉緑素', '植物学的', '有機細胞', '葉状構造'],
          mono: ['単色モノクロ', '強烈コントラスト', '影シルエット', '階調グレー'],
          highKey: ['白背景単離', '明瞭フィールド', '半透明光', '高輝度ライト'],
          lowKey: ['暗黒ノワール', '深奥シャドウ', '暗面テクスチャ', '深層トーン'],
          highContrast: ['精密フォーカス', '光学エッジ', '動的リズム', '拡大マクロ'],
          standard: ['ミニマリズム', 'スイスモジュラー', '優美プロファイル', 'スタジオアイソレーション']
        }
      };

      const set = vocabularies[lang] || vocabularies['EN'];
      const pool = [...set.base];

      if (isMono) pool.push(...set.mono);
      else if (isGreen) pool.push(...set.green);
      else if (isWarm) pool.push(...set.warm);
      else if (isCool) pool.push(...set.cool);
      else pool.push(...set.standard);

      if (isHighKey) pool.push(...set.highKey);
      else if (isLowKey) pool.push(...set.lowKey);
      else pool.push(...set.standard);

      if (isHighContrast) pool.push(...set.highContrast);

      const unique = Array.from(new Set(pool));
      while (unique.length < 16) {
        const filler = set.standard[unique.length % set.standard.length];
        unique.push(`${filler}-${unique.length + 1}`);
      }
      return unique.slice(0, 16);
    } catch (e) {
      console.warn("Local visual analysis fallback:", e);
      return (fallbackWords[lang] || fallbackWords['EN']).slice(0, 16);
    }
  };

  const handleAiAnalysis = async (forceLocal = false) => {
    if (!image) {
      showToast('Harap unggah gambar terlebih dahulu');
      return;
    }

    setIsAiAnalyzing(true);

    try {
      const apiKey = (apiKeyInput || '').trim() || getInitialApiKey();
      let words = [];
      let sourceName = '';

      const isManualLocal = forceLocal === true;

      if (apiKey && !isManualLocal) {
        const tempCanvas = document.createElement('canvas');
        const MAX_SIZE = 600;
        let w = image.width;
        let h = image.height;
        if (w > MAX_SIZE || h > MAX_SIZE) {
          const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
          w = Math.floor(w * ratio);
          h = Math.floor(h * ratio);
        }
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, w, h);

        const base64DataRaw = tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        const langMap = { 'ID': 'Indonesian', 'EN': 'English', 'JP': 'Japanese' };
        const targetLang = langMap[annoLang] || 'English';

        const promptText = `Analyze this image in detail and extract exactly 16 single-word or short hyphenated aesthetic keywords describing its subjects, anatomy, dominant colors, and vibe (tailored for Swiss-style graphic design specimen posters). Words MUST be in ${targetLang}. Return ONLY a comma-separated list in ALL CAPS, without numbering or explanations.`;

        // 1. Dukungan Model Resmi Aktif 2026 (Diurutkan dari model teruji paling responsif)
        const candidateModels2026 = [
          'gemini-flash-latest',
          'gemini-flash-lite-latest',
          'gemini-3.5-flash-lite',
          'gemini-3.6-flash',
          'gemini-3.7-flash',
          'gemini-3.8-flash'
        ];

        let modelsToTry = [...candidateModels2026];

        // 2. Pencarian Model Otomatis (Dynamic Discovery) via Google models.list API
        try {
          const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, { headers: { 'x-goog-api-key': apiKey } });
          if (listResp.ok) {
            const listData = await listResp.json();
            if (listData.models && Array.isArray(listData.models)) {
              const activeGoogleModels = listData.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''))
                .filter(name => !name.includes('embedding') && !name.includes('aqa') && !name.includes('1.5') && !name.includes('2.0'));

              const matched2026 = candidateModels2026.filter(m => activeGoogleModels.includes(m));
              const others = activeGoogleModels.filter(m => !candidateModels2026.includes(m));
              const combined = [...matched2026, ...candidateModels2026, ...others];
              modelsToTry = Array.from(new Set(combined));
            }
          }
        } catch (e) {
          console.warn("Dynamic model discovery fallback:", e);
        }

        let lastErr = null;
        for (const modelName of modelsToTry) {
          try {
            const resp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        { text: promptText },
                        {
                          inline_data: {
                            mime_type: 'image/jpeg',
                            data: base64DataRaw
                          }
                        }
                      ]
                    }
                  ],
                  generationConfig: { maxOutputTokens: 250, temperature: 0.7 }
                })
              }
            );

            const data = await resp.json();
            if (resp.ok) {
              let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                text = text.replace(/`/g, '').replace(/csv/g, '').trim();
                const parsed = text
                  .split(/[,\n]/)
                  .map(w => w.trim().replace(/^[^a-zA-Z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]+/, '').toUpperCase())
                  .filter(w => w && w.length > 1);

                if (parsed.length >= 8) {
                  words = parsed.slice(0, 16);
                  const cleanModelName = modelName
                    .replace('gemini-', 'Google Gemini ')
                    .replace('-latest', ' (Terbaru)')
                    .replace('-flash', ' Flash')
                    .replace('-pro', ' Pro')
                    .replace('-lite', ' Lite');
                  sourceName = cleanModelName;
                  localStorage.setItem('geminiApiKey', apiKey);
                  break;
                }
              }
            } else {
              lastErr = data.error?.message || `HTTP ${resp.status}`;
            }
          } catch (err) {
            lastErr = err.message;
          }
        }

        if (words.length === 0) {
          console.warn("Gemini API fallback to local smart visual analysis:", lastErr);
          words = analyzeImageVisually(image, annoLang);
          sourceName = `Analisis Visual Cerdas (Fallback: Gemini ${lastErr ? lastErr.substring(0, 25) : 'Offline'})`;
          showToast('Beralih ke Analisis Visual Cerdas');
        }
      } else {
        words = analyzeImageVisually(image, annoLang);
        sourceName = 'Analisis Visual Cerdas (Bebas Token)';
      }

      if (words.length > 0) {
        setAiWords(words);
        applyKeywordsToCells(words);
        setScanResult({
          words,
          source: sourceName,
          lang: annoLang,
          count: words.length,
          timestamp: new Date().toLocaleTimeString()
        });
        setShowScanResultModal(true);
        showToast(`Hasil Pindai Sukses! ${words.length} kata kunci aktif.`);
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
      const fallback = (fallbackWords[annoLang] || fallbackWords['EN']).slice(0, 16);
      setAiWords(fallback);
      applyKeywordsToCells(fallback);
      setScanResult({
        words: fallback,
        source: 'Koleksi Kosakata Standar Swiss',
        lang: annoLang,
        count: fallback.length,
        timestamp: new Date().toLocaleTimeString()
      });
      setShowScanResultModal(true);
      showToast('Kata kunci default diterapkan');
    } finally {
      setIsAiAnalyzing(false);
      // PENTING: handleRandomize() DIHAPUS TOTAL agar layout grid & slit scan 100% aman dan tidak teracak
    }
  };

  const addCustomKeyword = (e) => {
    e.preventDefault();
    if (!newKeywordInput.trim()) return;
    const cleanWord = newKeywordInput.trim().toUpperCase();
    if (!aiWords.includes(cleanWord)) {
      setAiWords(prev => [cleanWord, ...prev]);
      showToast(`Kata "${cleanWord}" ditambahkan!`);
    }
    setNewKeywordInput('');
  };

  const removeKeyword = (wordToRemove) => {
    setAiWords(prev => prev.filter(w => w !== wordToRemove));
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

  const clearStretchMask = () => { stretchMaskPointsRef.current = []; drawCanvas(); showToast('Mask Stretch Dihapus'); };
  const clearCardMask = () => { cardMaskPointsRef.current = []; drawCanvas(); showToast('Mask Kartu Dihapus'); };
  const clearAllMasks = () => { stretchMaskPointsRef.current = []; cardMaskPointsRef.current = []; drawCanvas(); showToast('Semua Mask Kuas Dihapus'); };

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
      canvas.width = rect.width || 900; canvas.height = rect.height || 650;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const rng = mulberry32(seed);
    const isRotated = rotation % 180 !== 0;
    
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
    offCtx.translate(centerX + imageOffsetX, centerY + imageOffsetY);
    offCtx.rotate((rotation * Math.PI) / 180);
    offCtx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    offCtx.restore();

    // Hitung Bounding Box Gambar Aktual di atas Kanvas
    const effectiveImgW = isRotated ? drawH : drawW;
    const effectiveImgH = isRotated ? drawW : drawH;
    const imgX = Math.floor(centerX - effectiveImgW / 2 + imageOffsetX);
    const imgY = Math.floor(centerY - effectiveImgH / 2 + imageOffsetY);
    const imgW = effectiveImgW;
    const imgH = effectiveImgH;

    const isImageLocked = gridBoundsMode === 'image';
    const bX = isImageLocked ? imgX : 0;
    const bY = isImageLocked ? imgY : 0;
    const bW = isImageLocked ? imgW : canvas.width;
    const bH = isImageLocked ? imgH : canvas.height;

    // Pembuatan Garis Potong (Cuts) Terikat pada Batas (bX, bY, bW, bH)
    const numCols = Math.floor(6 + (complexity / 100) * 55);
    const numRows = Math.floor(6 + (complexity / 100) * 55);
    
    let xCuts = [bX, bX + bW];
    let yCuts = [bY, bY + bH];

    if (boxSizeVariety === 'varied') {
        const majorCols = Math.floor(numCols * 0.35);
        for(let i = 0; i < majorCols; i++) xCuts.push(Math.floor(bX + rng() * bW));
        for(let i = 0; i < numCols - majorCols; i++) {
            const anchor = xCuts[Math.floor(rng() * xCuts.length)];
            const offset = (rng() - 0.5) * (bW * 0.3);
            const val = Math.max(bX + 5, Math.min(bX + bW - 5, Math.floor(anchor + offset)));
            xCuts.push(val);
        }
        const majorRows = Math.floor(numRows * 0.35);
        for(let i = 0; i < majorRows; i++) yCuts.push(Math.floor(bY + rng() * bH));
        for(let i = 0; i < numRows - majorRows; i++) {
            const anchor = yCuts[Math.floor(rng() * yCuts.length)];
            const offset = (rng() - 0.5) * (bH * 0.3);
            const val = Math.max(bY + 5, Math.min(bY + bH - 5, Math.floor(anchor + offset)));
            yCuts.push(val);
        }
    } else if (boxSizeVariety === 'editorial') {
        const divisionsX = [0.15, 0.35, 0.58, 0.78, 0.90];
        divisionsX.forEach(ratio => {
            if (rng() > 0.25) xCuts.push(Math.floor(bX + bW * (ratio + (rng() - 0.5) * 0.08)));
        });
        const divisionsY = [0.12, 0.30, 0.50, 0.72, 0.88];
        divisionsY.forEach(ratio => {
            if (rng() > 0.25) yCuts.push(Math.floor(bY + bH * (ratio + (rng() - 0.5) * 0.08)));
        });
        for(let i = 0; i < Math.floor(numCols * 0.6); i++) xCuts.push(Math.floor(bX + rng() * bW));
        for(let i = 0; i < Math.floor(numRows * 0.6); i++) yCuts.push(Math.floor(bY + rng() * bH));
    } else if (boxSizeVariety === 'bento') {
        const stepX = bW / 4;
        const stepY = bH / 4;
        for(let s = 1; s < 4; s++) {
            xCuts.push(Math.floor(bX + s * stepX + (rng() - 0.5) * (stepX * 0.35)));
            yCuts.push(Math.floor(bY + s * stepY + (rng() - 0.5) * (stepY * 0.35)));
        }
        for(let i = 0; i < Math.floor(numCols * 0.45); i++) xCuts.push(Math.floor(bX + rng() * bW));
        for(let i = 0; i < Math.floor(numRows * 0.45); i++) yCuts.push(Math.floor(bY + rng() * bH));
    } else {
        for(let i = 0; i < numCols; i++) xCuts.push(Math.floor(bX + rng() * bW));
        for(let i = 0; i < numRows; i++) yCuts.push(Math.floor(bY + rng() * bH));
    }

    xCuts = Array.from(new Set(xCuts)).sort((a,b) => a - b);
    yCuts = Array.from(new Set(yCuts)).sort((a,b) => a - b);

    const stretchProb = Math.min(stretchInt, 100) / 100; 
    const stretchMultiplier = stretchInt > 100 ? 1 + ((stretchInt - 100) / 50) * 15 : 1;
    const pCardCutout = showCutoutCards ? (cutoutCardDensity / 100) * 0.4 : 0;
    const maxThick = Math.max(1, Math.floor((brutalInt / 100) * 20 * relScale)); 

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

    for (let i = 0; i < xCuts.length - 1; i++) {
        for (let j = 0; j < yCuts.length - 1; j++) {
            const x = xCuts[i]; const y = yCuts[j];
            const w = xCuts[i+1] - x; const h = yCuts[j+1] - y;
            if (w < 1 || h < 1) continue;

            const dstW = w + 1; const dstH = h + 1;
            const cellCenterNX = (x + w / 2) / canvas.width;
            const cellCenterNY = (y + h / 2) / canvas.height;
            const relCX = ((x + w / 2) - bX) / bW;
            const relCY = ((y + h / 2) - bY) / bH;

            let inCluster = true;
            let isHeroZone = false;
            let isPerimeterCard = false;
            let cardArrow = '';

            let applyStretch = false;
            let applyCard = isPerimeterCard;

            if (isManualMode) {
                applyCard = checkMask(cellCenterNX, cellCenterNY, cardMaskPointsRef.current);
                applyStretch = checkMask(cellCenterNX, cellCenterNY, stretchMaskPointsRef.current);
            } else if (!isPerimeterCard && !isHeroZone) {
                const r = rng();
                if (showCutoutCards && r < pCardCutout && w >= 28 * relScale && h >= 20 * relScale) {
                    applyCard = true;
                } else if (r < pCardCutout + stretchProb) {
                    applyStretch = true;
                }
            }

            if (applyCard) {
                cutoutCardPass.push({ type: 'card', x, y, w, h, dstW, dstH, cardArrow: cardArrow || (rng() > 0.6 ? (rng() > 0.5 ? '→' : '↓') : ''), inCluster: true });
            } else if (applyStretch) {
                let isHoriz = rng() < (stretchBalance / 100);
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

                stretchPass.push({ 
                    type: isHoriz ? 'slit_h' : 'slit_v',
                    isHoriz, srcX, srcY, sliceW, sliceH, 
                    x, y, w, h, dstW, dstH, inCluster: true 
                });
            } else {
                normalPass.push({ type: isHeroZone ? 'hero' : 'intact', x, y, w, h, dstW, dstH, inCluster: true });
            }
        }
    }

    if (renderStyle === 'zine') {
        ctx.filter = 'grayscale(80%) contrast(150%) brightness(90%)';
    }

    // Aktifkan Kliping Batas Gambar (mencegah slit-scan streak atau garis meluap ke luar gambar)
    if (isImageLocked) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bX, bY, bW, bH);
        ctx.clip();
        // Gambar dasar gambar agar tidak ada celah garis mikro
        ctx.drawImage(offscreen, bX, bY, bW, bH, bX, bY, bW, bH);
    }

    // Pass 1: Gambar Normal
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

    // Pass 3: Kartu Cutout Solid
    if (cutoutCardPass.length > 0) {
        ctx.save();
        const cardFillStyle = hexToRgba(cutoutCardColor, cutoutCardOpacity);
        ctx.fillStyle = cardFillStyle;

        cutoutCardPass.forEach(card => {
            ctx.fillRect(card.x, card.y, card.w, card.h);
        });

        ctx.restore();
    }

    // Pass 4: Tekstur Zine Grain
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

    // Kotak Bingkai
    if (showScratchBoxes) {
        ctx.save();
        const strokeW = Math.max(1, Math.floor(boxBorderWidth * relScale));
        ctx.lineWidth = strokeW;

        let boxesToStroke = [...stretchPass, ...cutoutCardPass];
        if (showIntactBoxBorders) {
            const intactInCluster = normalPass.filter(op => op.inCluster && (op.type === 'intact' || op.type === 'hero'));
            boxesToStroke = [...boxesToStroke, ...intactInCluster];
        }

        boxesToStroke.forEach(box => {
            if (boxBorderColor === 'auto') {
                if (cutoutCardPass.includes(box)) {
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

    // Tipografi Kolom Kotak
    if (showBoxTypography) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const labeledBoxes = [];
        cutoutCardPass.forEach(card => labeledBoxes.push({ ...card, isCard: true }));
        stretchPass.forEach(box => {
            if (box.w >= 26 * relScale && box.h >= 16 * relScale) {
                labeledBoxes.push({ ...box, isCard: false });
            }
        });
        if (showIntactBoxBorders) {
            normalPass.forEach(box => {
                if (box.inCluster && (box.type === 'intact' || box.type === 'hero') && box.w >= 26 * relScale && box.h >= 16 * relScale) {
                    labeledBoxes.push({ ...box, isCard: false, isIntact: true });
                }
            });
        }

        labeledBoxes.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 30 * relScale) return a.y - b.y;
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
            
            let arrowChar = '';
            if (showDirectionArrows || boxNumberFormat === 'arrows') {
                if (box.type === 'slit_v' || box.isHoriz === false) arrowChar = '↓';
                else if (box.type === 'slit_h' || box.isHoriz === true) arrowChar = '→';
                else if (box.cardArrow) arrowChar = box.cardArrow;
                else if (box.isCard && (idx % 3 === 0)) arrowChar = (idx % 2 === 0 ? '→' : '↓');
            }

            let numDisplay;
            if (boxNumberFormat === 'arrows') {
                numDisplay = `${indexCounter}${arrowChar}`;
            } else if (boxNumberFormat === 'plus') {
                numDisplay = indexCounter === 1 ? '1' : `${indexCounter}+`;
            } else if (boxNumberFormat === 'pad') {
                numDisplay = String(indexCounter).padStart(2, '0');
            } else {
                numDisplay = `${indexCounter}${arrowChar}`;
            }

            let textFill;
            if (box.isCard) {
                textFill = getContrastTextColor(cutoutCardColor);
            } else {
                textFill = isDarkMode ? '#FFFFFF' : '#000000';
            }

            ctx.fillStyle = textFill;

            ctx.font = `800 ${mainFontSize}px ${currentFontFamily}`;
            const maxTextW = box.w - padX * 2;
            let renderWord = word;
            if (ctx.measureText(renderWord).width > maxTextW && renderWord.length > 4) {
                renderWord = renderWord.substring(0, Math.max(3, Math.floor(maxTextW / (mainFontSize * 0.65)))) + '.';
            }
            ctx.fillText(renderWord, Math.floor(box.x + padX), Math.floor(box.y + padY));

            if (box.h >= (mainFontSize + subFontSize + padY * 2)) {
                ctx.font = `700 ${subFontSize}px ${currentFontFamily}`;
                ctx.fillText(numDisplay, Math.floor(box.x + padX), Math.floor(box.y + padY + mainFontSize + Math.floor(2 * relScale)));
            }

            indexCounter += (idx % 3 === 0 ? 1 : (idx % 2 === 0 ? 2 : 3));
        });

        ctx.restore();
    }

    if (showGridLines) {
        ctx.save();
        ctx.fillStyle = isDarkMode ? '#10B981' : '#000000';
        ctx.lineWidth = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.strokeStyle = isDarkMode ? 'rgba(16,185,129,0.3)' : 'rgba(0,0,0,0.3)';
        
        xCuts.forEach(x => {
           if(rng() > 0.8) { 
               ctx.beginPath(); ctx.moveTo(x, bY); ctx.lineTo(x, bY + bH); ctx.stroke(); 
           }
        });
        yCuts.forEach(y => {
           if(rng() > 0.8) { 
               ctx.beginPath(); ctx.moveTo(bX, y); ctx.lineTo(bX + bW, y); ctx.stroke(); 
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

    if (isImageLocked) {
        ctx.restore();
    }
  }, [
    image, rotation, seed, scale, complexity, density, stretchInt, brutalInt, stretchDirX, stretchDirY,
    showScratchBoxes, showBoxTypography, showCutoutCards, boxBorderWidth, boxBorderColor, boxSizeVariety,
    cutoutCardColor, cutoutCardOpacity, cutoutCardDensity, boxFontFamily, boxNumberFormat, boxFontSize,
    showGridLines, showTextAnnotations, textColor, isManualMode, brushTarget, brushSize, aiWords, isDarkMode, renderStyle, canvasFormat,
    gridBoundsMode, imageOffsetX, imageOffsetY, stretchBalance,
    showIntactBoxBorders, showDirectionArrows
  ]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  return (
    <div 
      className={`flex flex-col h-screen w-screen font-sans overflow-hidden select-none transition-colors ${isDarkMode ? 'bg-[#0a0a0a] text-[#e5e5e5]' : 'bg-[#F9FAFB] text-gray-900'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processFile(e.dataTransfer.files[0]);
        }
      }}
    >
      
      {/* --- TOP APPLICATION BAR --- */}
      <header className={`h-14 border-b px-4 flex items-center justify-between z-30 flex-shrink-0 transition-colors ${isDarkMode ? 'bg-[#121212] border-[#202020]' : 'bg-white border-gray-200'}`}>
        
        {/* Logo & Meta Info */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-black text-black text-xs shadow-md">
              G
            </div>
            <span className="font-mono font-black text-sm tracking-wider">GRID<span className="text-emerald-500">STUDIO</span></span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-[#181818] text-emerald-400 border-[#2a2a2a]' : 'bg-gray-100 text-emerald-800 border-gray-200'}`}>
            PRO v2.5
          </span>
          {image && (
            <span className={`hidden md:inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded ${isDarkMode ? 'bg-[#181818] text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
              {image.width} × {image.height}px • {canvasFormat.toUpperCase()}
            </span>
          )}
        </div>

        {/* Quick Presets Bar (Tengah) */}
        <div className="hidden lg:flex items-center space-x-1.5 p-1 rounded-xl border bg-opacity-60 backdrop-blur-sm" style={{ backgroundColor: isDarkMode ? '#141414' : '#f3f4f6', borderColor: isDarkMode ? '#242424' : '#e5e7eb' }}>
          {/* Kelompok Swiss Specimen */}
          <div className="flex items-center space-x-1 pr-1.5 border-r" style={{ borderColor: isDarkMode ? '#262626' : '#e0e0e0' }}>
            <span className={`text-[9.5px] font-extrabold uppercase tracking-wider px-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>🔬 Specimen:</span>
            {[
              { id: 'cat_diagonal', label: '🐱 Cat', shortcut: '1' },
              { id: 'goldfish_axial', label: '🐠 Fish', shortcut: '2' },
              { id: 'flamingo_column', label: '🦩 Flamingo', shortcut: '3' },
              { id: 'fish_skeleton', label: '🦴 Spine', shortcut: '4' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1 ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-[#222]' : 'text-gray-700 hover:text-black hover:bg-white hover:shadow-sm'}`}
                title={`Preset Spesimen Anatomi: ${p.label} (Tombol ${p.shortcut})`}
              >
                <span>{p.label}</span>
                <span className={`text-[9px] font-mono px-1 rounded ${isDarkMode ? 'bg-[#222] text-gray-500' : 'bg-gray-200 text-gray-500'}`}>{p.shortcut}</span>
              </button>
            ))}
          </div>

          {/* Kelompok Klasik */}
          <div className="flex items-center space-x-1 pl-0.5">
            {[
              { id: 'editorial', label: '📰 Edit', shortcut: '5' },
              { id: 'cyber', label: '⚡ Cyber', shortcut: '6' },
              { id: 'zine', label: '📄 Zine', shortcut: '7' },
              { id: 'minimal', label: '🎛️ Raw', shortcut: '8' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1 ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-[#222]' : 'text-gray-700 hover:text-black hover:bg-white hover:shadow-sm'}`}
                title={`Preset Klasik: ${p.label} (Tombol ${p.shortcut})`}
              >
                <span>{p.label}</span>
                <span className={`text-[9px] font-mono px-1 rounded ${isDarkMode ? 'bg-[#222] text-gray-500' : 'bg-gray-200 text-gray-500'}`}>{p.shortcut}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Controls Kanan */}
        <div className="flex items-center space-x-2">
          
          {/* Tombol Acak / Randomize */}
          <button
            onClick={handleRandomize}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center space-x-1.5 active:scale-95 ${isDarkMode ? 'bg-[#1a1a1a] border-[#2e2e2e] text-gray-300 hover:text-white hover:border-[#10B981]' : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-white shadow-sm'}`}
            title="Acak Pola Slit-Scan (Shortcut: R)"
          >
            <span className="text-emerald-500">🔀</span>
            <span className="hidden sm:inline">Randomize</span>
            <span className={`text-[9px] font-mono px-1 rounded ${isDarkMode ? 'bg-[#252525] text-gray-400' : 'bg-gray-200 text-gray-600'}`}>{Math.round(seed) % 1000}</span>
          </button>

          {/* Theme Toggle */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className={`p-1.5 rounded-lg border transition-all ${isDarkMode ? 'bg-[#1a1a1a] border-[#2e2e2e] text-yellow-400 hover:bg-[#222]' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
            title="Ganti Tema (Dark / Light)"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>

          {/* Export Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
            >
              <span>Export</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
            </button>

            {showExportMenu && (
              <div 
                className={`absolute right-0 mt-2 w-52 rounded-xl shadow-2xl border p-1.5 z-50 animate-in fade-in duration-150 ${isDarkMode ? 'bg-[#181818] border-[#2e2e2e] text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <div className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Standar (1x Canvas)
                </div>
                <button onClick={() => handleExport('png', 1)} className={`w-full text-left px-2.5 py-2 text-xs font-medium rounded-lg flex items-center justify-between ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-50'}`}>
                  <span>Export PNG</span>
                  <span className="text-[10px] opacity-60 font-mono">Web / Social</span>
                </button>
                <button onClick={() => handleExport('jpg', 1)} className={`w-full text-left px-2.5 py-2 text-xs font-medium rounded-lg flex items-center justify-between ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-50'}`}>
                  <span>Export JPG</span>
                  <span className="text-[10px] opacity-60 font-mono">Small Size</span>
                </button>

                <div className={`my-1 border-t ${isDarkMode ? 'border-[#282828]' : 'border-gray-100'}`}></div>

                <div className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500`}>
                  Cetak / Print (2x Hi-Res)
                </div>
                <button onClick={() => handleExport('png', 2)} className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg flex items-center justify-between ${isDarkMode ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}>
                  <span>Export 2x Hi-Res PNG</span>
                  <span className="text-[10px] font-mono">Poster Ready</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* --- MAIN WORKSPACE BODY (TABBED SIDEBAR + CANVAS) --- */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* --- TABBED STUDIO INSPECTOR (SIDEBAR KIRI) --- */}
        <aside className={`w-full md:w-[380px] h-[50dvh] md:h-full flex flex-col border-r z-20 flex-shrink-0 transition-colors ${isDarkMode ? 'bg-[#0f0f0f] border-[#1c1c1c]' : 'bg-white border-gray-200'}`}>
          
          {/* TAB BAR HEADER */}
          <div className={`flex border-b overflow-x-auto no-scrollbar transition-colors ${isDarkMode ? 'bg-[#121212] border-[#1e1e1e]' : 'bg-gray-50 border-gray-200'}`}>
            {[
              { id: 'boxes', label: 'Kotak & Typo', icon: '🗂️' },
              { id: 'slit', label: 'Distorsi FX', icon: '🌊' },
              { id: 'brush', label: 'Kuas', icon: '🖌️' },
              { id: 'ai', label: 'Gemini AI', icon: '✨' },
              { id: 'canvas', label: 'Kanvas', icon: '📐' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[70px] py-3 text-center border-b-2 font-bold text-xs transition-all flex flex-col items-center space-y-1 cursor-pointer ${activeTab === tab.id ? (isDarkMode ? 'border-emerald-400 text-emerald-400 bg-[#161616]' : 'border-black text-black bg-white') : (isDarkMode ? 'border-transparent text-gray-500 hover:text-gray-300' : 'border-transparent text-gray-400 hover:text-gray-700')}`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="text-[10px] tracking-tight">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* TAB CONTENT CONTAINER */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            
            {/* ================= TAB 1: KOTAK & TYPO ================= */}
            {activeTab === 'boxes' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                
                {/* 1. KARTU CUTOUT SOLID */}
                <div className={`p-3.5 rounded-xl border space-y-3 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold flex items-center space-x-1.5">
                        <span>🗂️</span>
                        <span>Kartu Cutout Solid</span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Kartu berwarna dengan label kontras</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={showCutoutCards} 
                      onChange={(e) => setShowCutoutCards(e.target.checked)} 
                      className="w-4.5 h-4.5 accent-amber-400 cursor-pointer" 
                    />
                  </div>

                  {showCutoutCards && (
                    <div className="space-y-3 pt-1 border-t border-dashed" style={{ borderColor: isDarkMode ? '#262626' : '#e5e7eb' }}>
                      {/* Palet Warna Kartu */}
                      <div>
                        <div className={`text-[11px] font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Warna Latar Kartu:</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { hex: '#FFFFFF', label: 'Putih' },
                            { hex: '#F8F7F2', label: 'Krem' },
                            { hex: '#FEF08A', label: 'Kuning' },
                            { hex: '#BAE6FD', label: 'Biru' },
                            { hex: '#BBF7D0', label: 'Mint' },
                            { hex: '#FBCFE8', label: 'Pink' },
                            { hex: '#18181B', label: 'Hitam' }
                          ].map(item => (
                            <button
                              key={item.hex}
                              onClick={() => setCutoutCardColor(item.hex)}
                              className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold border transition-all ${cutoutCardColor.toUpperCase() === item.hex ? 'ring-2 ring-emerald-500 scale-105 shadow-md' : 'opacity-85 hover:opacity-100'}`}
                              style={{ backgroundColor: item.hex, color: getContrastTextColor(item.hex), borderColor: isDarkMode ? '#444' : '#ccc' }}
                            >
                              {item.label}
                            </button>
                          ))}
                          <label className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold border cursor-pointer relative overflow-hidden ${isDarkMode ? 'bg-[#1f1f1f] border-[#333] text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-700'}`}>
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

                      {/* Opasitas */}
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span>Opasitas Kartu (Solid / Glass)</span>
                          <span className="font-mono text-amber-400">{cutoutCardOpacity}%</span>
                        </div>
                        <input 
                          type="range" min="30" max="100" value={cutoutCardOpacity} 
                          onChange={(e) => setCutoutCardOpacity(Number(e.target.value))} 
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-400" 
                        />
                      </div>

                      {/* Kepadatan Kartu Auto */}
                      {!isManualMode && (
                        <div>
                          <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            <span>Kepadatan Kartu Otomatis</span>
                            <span className="font-mono text-amber-400">{cutoutCardDensity}%</span>
                          </div>
                          <input 
                            type="range" min="5" max="40" value={cutoutCardDensity} 
                            onChange={(e) => setCutoutCardDensity(Number(e.target.value))} 
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-400" 
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. KOTAK BINGKAI & VARIASI UKURAN */}
                <div className={`p-3.5 rounded-xl border space-y-3 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold flex items-center space-x-1.5">
                        <span>◻</span>
                        <span>Kotak Pembingkai Scratch</span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Garis bingkai pembatas persegi panjang</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={showScratchBoxes} 
                      onChange={(e) => setShowScratchBoxes(e.target.checked)} 
                      className="w-4.5 h-4.5 accent-emerald-500 cursor-pointer" 
                    />
                  </div>

                  {/* Variasi Ukuran */}
                  <div>
                    <div className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Variasi Ukuran Kotak:</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'editorial', label: 'Editorial Hero', desc: 'Hero block & slim slit' },
                        { id: 'varied', label: 'Dynamic Mix', desc: 'Campuran besar & kecil' },
                        { id: 'bento', label: 'Bento Grid', desc: 'Kuadran asimetris' },
                        { id: 'balanced', label: 'Balanced', desc: 'Proporsional reguler' }
                      ].map(v => (
                        <button
                          key={v.id}
                          onClick={() => setBoxSizeVariety(v.id)}
                          className={`p-2 text-left rounded-lg border transition-all ${boxSizeVariety === v.id ? (isDarkMode ? 'bg-[#1a1a1a] border-emerald-400 text-emerald-400' : 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold') : (isDarkMode ? 'bg-[#181818] border-[#2c2c2c] text-gray-400' : 'bg-white border-gray-200 text-gray-700')}`}
                        >
                          <div className="text-[10px] font-bold">{v.label}</div>
                          <div className="text-[8px] opacity-70">{v.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {showScratchBoxes && (
                    <div className="space-y-2.5 pt-1 border-t border-dashed" style={{ borderColor: isDarkMode ? '#262626' : '#e5e7eb' }}>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tebal Garis:</div>
                          <div className="flex space-x-1">
                            {[1, 2, 3].map(w => (
                              <button
                                key={w}
                                onClick={() => setBoxBorderWidth(w)}
                                className={`flex-1 py-1 text-[10px] font-mono font-bold rounded ${boxBorderWidth === w ? (isDarkMode ? 'bg-emerald-400 text-black' : 'bg-black text-white') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-200 text-gray-700')}`}
                              >
                                {w}px
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className={`text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Warna Garis:</div>
                          <div className="flex space-x-1">
                            {[
                              { id: 'auto', label: 'Auto' },
                              { id: '#000000', label: 'Dark' },
                              { id: '#ffffff', label: 'Light' }
                            ].map(c => (
                              <button
                                key={c.id}
                                onClick={() => setBoxBorderColor(c.id)}
                                className={`flex-1 py-1 text-[10px] font-mono rounded ${boxBorderColor === c.id ? (isDarkMode ? 'bg-emerald-400 text-black font-bold' : 'bg-black text-white font-bold') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-200 text-gray-700')}`}
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Toggle Bingkai pada Sel Normal */}
                      <label className="flex items-center justify-between cursor-pointer pt-1 border-t" style={{ borderColor: isDarkMode ? '#222' : '#f0f0f0' }}>
                        <div>
                          <div className={`text-[10px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Bingkai Sel Utuh (Normal Image)</div>
                          <div className={`text-[8.5px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Beri bingkai pada foto asli di dalam klaster (Gaya Anatomi)</div>
                        </div>
                        <input type="checkbox" checked={showIntactBoxBorders} onChange={(e) => setShowIntactBoxBorders(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                      </label>
                    </div>
                  )}
                </div>

                {/* 3. TIPOGRAFI KOLOM KOTAK */}
                <div className={`p-3.5 rounded-xl border space-y-3 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold flex items-center space-x-1.5">
                        <span>Aa</span>
                        <span>Tipografi Kolom Kotak</span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Kata tebal kapital + indeks angka di sudut kotak</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={showBoxTypography} 
                      onChange={(e) => setShowBoxTypography(e.target.checked)} 
                      className="w-4.5 h-4.5 accent-cyan-400 cursor-pointer" 
                    />
                  </div>

                  {showBoxTypography && (
                    <div className="space-y-3 pt-1 border-t border-dashed" style={{ borderColor: isDarkMode ? '#262626' : '#e5e7eb' }}>
                      {/* Font Family Selector */}
                      <div>
                        <div className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Pilihan Font Family:</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'sans', label: 'Modern Sans', preview: 'Inter / Swiss' },
                            { id: 'mono', label: 'Tech Mono', preview: 'Monospace' },
                            { id: 'serif', label: 'Editorial Serif', preview: 'Playfair' },
                            { id: 'grotesk', label: 'Heavy Grotesk', preview: 'Impact' },
                            { id: 'condensed', label: 'Condensed', preview: 'Narrow' }
                          ].map(f => (
                            <button
                              key={f.id}
                              onClick={() => setBoxFontFamily(f.id)}
                              className={`p-2 text-left rounded-lg border transition-all ${boxFontFamily === f.id ? (isDarkMode ? 'bg-[#1a1a1a] border-cyan-400 text-cyan-400' : 'bg-cyan-50 border-cyan-600 text-cyan-900 font-bold') : (isDarkMode ? 'bg-[#181818] border-[#2c2c2c] text-gray-400' : 'bg-white border-gray-200 text-gray-700')}`}
                            >
                              <div className="text-[10px] font-bold">{f.label}</div>
                              <div className="text-[8px] opacity-70">{f.preview}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Number Format & Font Size */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className={`text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Format Angka:</div>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { id: 'arrows', label: '1, 2↓, 3→' },
                              { id: 'plus', label: '1, 3+' },
                              { id: 'standard', label: '1, 2' },
                              { id: 'pad', label: '01' }
                            ].map(fmt => (
                              <button
                                key={fmt.id}
                                onClick={() => setBoxNumberFormat(fmt.id)}
                                className={`py-1 text-[9px] font-mono rounded text-center ${boxNumberFormat === fmt.id ? (isDarkMode ? 'bg-cyan-400 text-black font-bold' : 'bg-black text-white font-bold') : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-200 text-gray-700')}`}
                              >
                                {fmt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            <span>Ukuran Teks</span>
                            <span className="font-mono text-cyan-400">{boxFontSize}%</span>
                          </div>
                          <input 
                            type="range" min="60" max="160" value={boxFontSize} 
                            onChange={(e) => setBoxFontSize(Number(e.target.value))} 
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400" 
                          />
                          
                          {/* Toggle Panah Arah Slit */}
                          <label className="flex items-center justify-between cursor-pointer mt-2 pt-1 border-t" style={{ borderColor: isDarkMode ? '#222' : '#f0f0f0' }}>
                            <span className={`text-[9.5px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Panah Arah Slit (↓ / →)</span>
                            <input type="checkbox" checked={showDirectionArrows} onChange={(e) => setShowDirectionArrows(e.target.checked)} className="w-3.5 h-3.5 accent-cyan-400" />
                          </label>
                        </div>
                      </div>

                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ================= TAB 2: SLIT-SCAN FX ================= */}
            {activeTab === 'slit' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className={`p-3.5 rounded-xl border space-y-4 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span>Cut Complexity (Kerapatan Garis)</span>
                      <span className="text-emerald-400 font-mono text-[11px]">{complexity}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={complexity} onChange={(e) => setComplexity(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  </div>

                  <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span>Stretch Intensity (Panjang Streak)</span>
                      <span className="text-cyan-400 font-mono text-[11px]">{stretchInt}%</span>
                    </div>
                    <input type="range" min="0" max="150" value={stretchInt} onChange={(e) => setStretchInt(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                  </div>

                  <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span>Brutal Distortion</span>
                      <span className="text-red-400 font-mono text-[11px]">{brutalInt}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={brutalInt} onChange={(e) => setBrutalInt(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-red-500" />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: isDarkMode ? '#242424' : '#e5e7eb' }}>
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Arah Stretch</span>
                    <div className="flex space-x-1">
                      <button 
                        onClick={() => setStretchDirX(!stretchDirX)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${stretchDirX ? 'bg-cyan-500 text-black' : (isDarkMode ? 'bg-[#222] text-gray-500' : 'bg-gray-200 text-gray-500')}`}
                      >
                        Horizontal
                      </button>
                      <button 
                        onClick={() => setStretchDirY(!stretchDirY)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${stretchDirY ? 'bg-cyan-500 text-black' : (isDarkMode ? 'bg-[#222] text-gray-500' : 'bg-gray-200 text-gray-500')}`}
                      >
                        Vertical
                      </button>
                    </div>
                  </div>

                  {/* Keseimbangan Stretch (H ↔ V) */}
                  <div className="pt-2 border-t" style={{ borderColor: isDarkMode ? '#242424' : '#e5e7eb' }}>
                    <div className={`flex justify-between text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span>Keseimbangan Stretch (H ↔ V)</span>
                      <span className="text-cyan-400 font-mono text-[11px] font-bold">
                        {stretchBalance}H / {100 - stretchBalance}V
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={stretchBalance} 
                      onChange={(e) => setStretchBalance(Number(e.target.value))} 
                      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400" 
                    />
                    <div className="flex justify-between text-[9px] text-gray-500 mt-1 font-mono">
                      <span>100% Vertikal</span>
                      <span>50:50</span>
                      <span>100% Horizontal</span>
                    </div>
                  </div>
                </div>

                {/* Render Style */}
                <div className={`p-3.5 rounded-xl border space-y-2.5 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>Render Style & Filter:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'classic', label: 'Classic', desc: 'Bersih & Tajam' },
                      { id: 'glitch', label: 'Glitch RGB', desc: 'Chromatic Aberration' },
                      { id: 'liquid', label: 'Liquid Wave', desc: 'Gelombang Organik' },
                      { id: 'zine', label: 'Zine Print', desc: 'Grain & High Contrast' }
                    ].map(style => (
                      <button
                        key={style.id}
                        onClick={() => setRenderStyle(style.id)}
                        className={`p-2.5 text-left rounded-lg border transition-all ${renderStyle === style.id ? (isDarkMode ? 'bg-[#1e1e1e] border-emerald-400 text-emerald-400 shadow-md' : 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold') : (isDarkMode ? 'bg-[#181818] border-[#2a2a2a] text-gray-400' : 'bg-white border-gray-200 text-gray-700')}`}
                      >
                        <div className="text-xs font-bold">{style.label}</div>
                        <div className="text-[9px] opacity-70">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 3: KUAS MANUAL ================= */}
            {activeTab === 'brush' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className={`p-3.5 rounded-xl border space-y-3.5 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`flex p-1 rounded-lg border ${isDarkMode ? 'bg-[#1a1a1a] border-[#2a2a2a]' : 'bg-gray-100 border-gray-200'}`}>
                    <button onClick={() => { setIsManualMode(false); setActiveTool('pan'); handleRandomize(); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${!isManualMode ? (isDarkMode ? 'bg-[#262626] text-emerald-400 shadow' : 'bg-white shadow text-black') : 'text-gray-500'}`}>Auto (Random)</button>
                    <button onClick={() => { setIsManualMode(true); setActiveTool('brush'); }} className={`flex-1 text-xs py-2 font-semibold rounded-md transition-all ${isManualMode ? (isDarkMode ? 'bg-[#262626] text-emerald-400 shadow' : 'bg-white shadow text-black') : 'text-gray-500'}`}>Manual (Brush)</button>
                  </div>

                  {isManualMode ? (
                    <div className="space-y-3.5 pt-1">
                      <div>
                        <div className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Pilih Target yang Ingin Dilukis:</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => setBrushTarget('card')}
                            className={`p-2.5 text-center rounded-lg border transition-all font-bold text-xs flex flex-col items-center space-y-1 ${brushTarget === 'card' ? 'bg-amber-400 text-black border-amber-500 shadow-md ring-2 ring-amber-400/40' : (isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-gray-400' : 'bg-white border-gray-200 text-gray-700')}`}
                          >
                            <span className="text-base">🗂️</span>
                            <span>Lukis Kartu Cutout</span>
                          </button>
                          <button 
                            onClick={() => setBrushTarget('stretch')}
                            className={`p-2.5 text-center rounded-lg border transition-all font-bold text-xs flex flex-col items-center space-y-1 ${brushTarget === 'stretch' ? 'bg-cyan-400 text-black border-cyan-500 shadow-md ring-2 ring-cyan-400/40' : (isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-gray-400' : 'bg-white border-gray-200 text-gray-700')}`}
                          >
                            <span className="text-base">🌊</span>
                            <span>Lukis Stretch</span>
                          </button>
                        </div>
                        <p className={`text-[10px] mt-2 leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {brushTarget === 'card' 
                            ? 'Sapukan kursor kuas ke atas kanvas untuk menaruh kartu solid berlabel di koordinat yang Anda inginkan.' 
                            : 'Sapukan kursor kuas ke atas gambar untuk membatasi efek slit-scan stretch hanya pada area yang disapu.'}
                        </p>
                      </div>

                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span>Ukuran Kuas (Brush Radius)</span>
                          <span className="font-mono text-emerald-400">{brushSize}px</span>
                        </div>
                        <input type="range" min="15" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-400" />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-2">
                        <button onClick={clearCardMask} className={`text-[10px] py-2 rounded-lg font-bold transition border ${isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-amber-400 hover:bg-[#252525]' : 'bg-white border-gray-200 text-amber-800 hover:bg-gray-50'}`}>Hapus Mask Kartu</button>
                        <button onClick={clearStretchMask} className={`text-[10px] py-2 rounded-lg font-bold transition border ${isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-cyan-400 hover:bg-[#252525]' : 'bg-white border-gray-200 text-blue-800 hover:bg-gray-50'}`}>Hapus Mask Stretch</button>
                      </div>
                      <button onClick={clearAllMasks} className={`w-full text-[10px] py-2 rounded-lg font-bold transition border ${isDarkMode ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                        Hapus Semua Goresan Kuas
                      </button>
                    </div>
                  ) : (
                    <p className={`text-[11px] p-2 rounded-lg leading-relaxed ${isDarkMode ? 'bg-[#1c1c1c] text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                      Di mode <strong>Auto</strong>, generator secara cerdas menyebarkan kartu dan distorsi secara otomatis. Klik <strong>Manual (Brush)</strong> jika Anda ingin mengontrol posisi kartu secara bebas dengan kuas.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 4: GEMINI AI ================= */}
            {activeTab === 'ai' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className={`p-3.5 rounded-xl border space-y-3.5 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>Bahasa Kata Kunci:</span>
                    <div className="flex space-x-1">
                      {['EN', 'JP', 'ID'].map(lang => (
                        <button 
                          key={lang} 
                          onClick={() => setAnnoLang(lang)} 
                          className={`px-2 py-0.5 text-xs font-bold rounded ${annoLang === lang ? 'bg-cyan-500 text-black' : (isDarkMode ? 'bg-[#222] text-gray-400' : 'bg-gray-200 text-gray-600')}`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Token Google API:</span>
                      {apiKeyInput ? (
                        <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                          <span>Terhubung ({apiKeyInput.slice(0, 7)}...{apiKeyInput.slice(-4)})</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-amber-400">Belum Ada Token</span>
                      )}
                    </div>
                    <input 
                      type="password" 
                      placeholder="Masukkan Gemini API Token (AQ...)" 
                      value={apiKeyInput} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setApiKeyInput(val);
                        localStorage.setItem('geminiApiKey', val);
                      }} 
                      className={`w-full text-xs p-2.5 border rounded-lg focus:outline-none font-mono ${isDarkMode ? 'bg-[#1a1a1a] border-[#2a2a2a] text-emerald-300 focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900'}`} 
                    />
                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">
                        Dapatkan Token Gemini API di sini →
                      </a>
                      <button 
                        onClick={() => {
                          setApiKeyInput(getInitialApiKey());
                          localStorage.setItem('geminiApiKey', getInitialApiKey());
                          showToast('Token bawaan Google dipulihkan ✓');
                        }}
                        className="text-gray-400 hover:text-emerald-400 underline cursor-pointer"
                      >
                        Gunakan Token Saya
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleAiAnalysis()} 
                    disabled={isAiAnalyzing || !image} 
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition shadow flex items-center justify-center space-x-2 ${isAiAnalyzing || !image ? 'opacity-50 cursor-not-allowed bg-gray-600 text-gray-300' : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black active:scale-95'}`}
                  >
                    <span>✨</span>
                    <span>{isAiAnalyzing ? 'Sedang Menganalisis Gambar...' : 'Pindai Kata Kunci AI (Google Gemini 2026)'}</span>
                  </button>

                  {scanResult && (
                    <button
                      onClick={() => setShowScanResultModal(true)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-between cursor-pointer ${isDarkMode ? 'bg-[#1a1a1a] border-[#2e2e2e] text-emerald-400 hover:bg-[#222]' : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'}`}
                    >
                      <span className="flex items-center space-x-1.5">
                        <span>📋</span>
                        <span>Lihat Hasil Pindai Terakhir</span>
                      </span>
                      <span className="text-[10px] font-mono opacity-80">{scanResult.timestamp}</span>
                    </button>
                  )}
                </div>

                {/* Interactive Tag Cloud Kata Kunci */}
                <div className={`p-3.5 rounded-xl border space-y-3 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>Kata Kunci Aktif ({aiWords.length}):</span>
                    <button onClick={() => setAiWords(fallbackWords[annoLang])} className="text-[10px] text-gray-400 hover:text-white underline">Reset Default</button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {aiWords.map((word, idx) => (
                      <span 
                        key={idx} 
                        className={`inline-flex items-center space-x-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${isDarkMode ? 'bg-[#1a1a1a] border-[#2e2e2e] text-cyan-300' : 'bg-gray-100 border-gray-200 text-cyan-900'}`}
                      >
                        <span>{word}</span>
                        <button onClick={() => removeKeyword(word)} className="text-gray-500 hover:text-red-400 ml-1">×</button>
                      </span>
                    ))}
                  </div>

                  {/* Tambah Kata Kunci Kustom */}
                  <form onSubmit={addCustomKeyword} className="flex space-x-1.5 pt-1">
                    <input 
                      type="text" 
                      placeholder="Tambah kata kustom..." 
                      value={newKeywordInput} 
                      onChange={(e) => setNewKeywordInput(e.target.value)} 
                      className={`flex-1 text-xs px-2.5 py-1.5 border rounded-lg focus:outline-none ${isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-white' : 'bg-white border-gray-300 text-gray-900'}`} 
                    />
                    <button type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 cursor-pointer">
                      +
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ================= TAB 5: KANVAS & FORMAT ================= */}
            {activeTab === 'canvas' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Mode Batas Grid */}
                <div className={`p-3.5 rounded-xl border space-y-3 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div>
                    <div className="text-xs font-bold flex items-center space-x-1.5">
                      <span>🎯</span>
                      <span>Mode Batas Grid (Grid Bounds)</span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Pilih apakah grid terkunci pada batas gambar atau memenuhi seluruh kanvas</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setGridBoundsMode('image')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        gridBoundsMode === 'image'
                          ? (isDarkMode ? 'bg-emerald-500/10 border-emerald-400 text-emerald-400 font-bold ring-1 ring-emerald-400/40 shadow-sm' : 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold shadow-sm')
                          : (isDarkMode ? 'bg-[#1a1a1a] border-[#2c2c2c] text-gray-400' : 'bg-white border-gray-200 text-gray-700')
                      }`}
                    >
                      <div className="text-[11px] font-bold flex items-center space-x-1">
                        <span>🖼️</span>
                        <span>Terkunci Gambar</span>
                      </div>
                      <div className="text-[8.5px] opacity-75 mt-1 leading-snug">Grid & garis presisi terkunci pada batas gambar (Bawaan)</div>
                    </button>

                    <button
                      onClick={() => setGridBoundsMode('canvas')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        gridBoundsMode === 'canvas'
                          ? (isDarkMode ? 'bg-cyan-500/10 border-cyan-400 text-cyan-400 font-bold ring-1 ring-cyan-400/40 shadow-sm' : 'bg-cyan-50 border-cyan-600 text-cyan-900 font-bold shadow-sm')
                          : (isDarkMode ? 'bg-[#1a1a1a] border-[#2c2c2c] text-gray-400' : 'bg-white border-gray-200 text-gray-700')
                      }`}
                    >
                      <div className="text-[11px] font-bold flex items-center space-x-1">
                        <span>📐</span>
                        <span>Penuh Kanvas</span>
                      </div>
                      <div className="text-[8.5px] opacity-75 mt-1 leading-snug">Garis & slit-scan melebar melintasi seluruh area kanvas</div>
                    </button>
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border space-y-3.5 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div>
                    <div className={`text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Ukuran & Format Kanvas:</div>
                    <select 
                      value={canvasFormat} 
                      onChange={(e) => setCanvasFormat(e.target.value)}
                      className={`w-full text-xs p-2.5 border rounded-lg focus:outline-none cursor-pointer ${isDarkMode ? 'bg-[#1a1a1a] border-[#2a2a2a] text-white focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="original">Original Aspect Ratio</option>
                      <option value="square">Square 1:1 (1080 × 1080) - IG Feed</option>
                      <option value="portrait">Portrait 4:5 (1080 × 1350) - Post</option>
                      <option value="story">Story 9:16 (1080 × 1920) - Reels/TikTok</option>
                      <option value="landscape">Landscape 16:9 (1920 × 1080) - Screen</option>
                      <option value="a4">A4 Zine Poster (1240 × 1754)</option>
                    </select>
                  </div>

                  <div>
                    <div className={`flex justify-between text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span>Skala Gambar (Image Scale)</span>
                      <span className="font-mono text-cyan-400">{scale}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-400" />
                    <div className={`text-[9px] mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {gridBoundsMode === 'image' ? '✨ Grid & garis bergerak serentak mengikuti skala gambar' : 'Mode penuh kanvas aktif'}
                    </div>
                  </div>

                  {/* Offset Posisi Gambar */}
                  <div className="pt-2 border-t space-y-2.5" style={{ borderColor: isDarkMode ? '#242424' : '#e5e7eb' }}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Offset Posisi Gambar:
                      </span>
                      {(imageOffsetX !== 0 || imageOffsetY !== 0) && (
                        <button
                          onClick={() => { setImageOffsetX(0); setImageOffsetY(0); }}
                          className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                        >
                          Reset Tengah (0, 0)
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span>Posisi X</span>
                          <span className="font-mono text-cyan-400">{imageOffsetX > 0 ? `+${imageOffsetX}` : imageOffsetX}px</span>
                        </div>
                        <input
                          type="range"
                          min="-400"
                          max="400"
                          value={imageOffsetX}
                          onChange={(e) => setImageOffsetX(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span>Posisi Y</span>
                          <span className="font-mono text-cyan-400">{imageOffsetY > 0 ? `+${imageOffsetY}` : imageOffsetY}px</span>
                        </div>
                        <input
                          type="range"
                          min="-400"
                          max="400"
                          value={imageOffsetY}
                          onChange={(e) => setImageOffsetY(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2 pt-1">
                    <button onClick={handleRotate} className={`flex-1 text-xs py-2 font-bold rounded-lg border transition-all ${isDarkMode ? 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#242424]' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'}`}>
                      ↻ Putar 90°
                    </button>
                    <button onClick={() => fileInputRef.current.click()} className={`flex-1 text-xs py-2 font-bold rounded-lg border transition-all ${isDarkMode ? 'bg-[#1a1a1a] border-[#2a2a2a] text-emerald-400 hover:bg-[#242424]' : 'bg-white border-gray-200 text-emerald-700 hover:bg-gray-50'}`}>
                      Ganti Gambar
                    </button>
                  </div>
                </div>

                {/* Legacy Visual Overlays */}
                <div className={`p-3.5 rounded-xl border space-y-2.5 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>Overlay Grafis Tambahan:</div>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Garis Kisi Acak (Random Lines)</span>
                    <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Teks Mengambang (Floating Anno)</span>
                    <input type="checkbox" checked={showTextAnnotations} onChange={(e) => setShowTextAnnotations(e.target.checked)} className="w-4 h-4 accent-cyan-500" />
                  </label>
                </div>
              </div>
            )}

          </div>

          <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
        </aside>

        {/* --- WORKSPACE KANVAS (KANAN) --- */}
        <main 
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
          
          {/* Rulers Penggaris */}
          <div className={`absolute top-0 left-0 w-[24px] h-[24px] border-b border-r z-30 transition-colors ${isDarkMode ? 'bg-[#121212] border-[#222]' : 'bg-[#1F2937] border-[#374151]'}`}></div>
          <div 
            className={`absolute top-0 left-[24px] right-0 h-[24px] border-b z-20 overflow-hidden transition-colors ${isDarkMode ? 'bg-[#121212] border-[#222]' : 'bg-[#1F2937] border-[#374151]'}`}
            onPointerDown={(e) => startGuideFromRuler(e, 'h')}
            title="Tarik dari penggaris untuk membuat Garis Panduan Horizontal"
          >
            <Ruler type="h" pan={pan} zoom={viewScale} length={viewportSize.w} isDarkMode={isDarkMode} />
          </div>
          <div 
            className={`absolute top-[24px] left-0 bottom-0 w-[24px] border-r z-20 overflow-hidden transition-colors ${isDarkMode ? 'bg-[#121212] border-[#222]' : 'bg-[#1F2937] border-[#374151]'}`}
            onPointerDown={(e) => startGuideFromRuler(e, 'v')}
            title="Tarik dari penggaris untuk membuat Garis Panduan Vertikal"
          >
            <Ruler type="v" pan={pan} zoom={viewScale} length={viewportSize.h} isDarkMode={isDarkMode} />
          </div>

          {/* Viewport & Canvas Container */}
          <div 
            className="absolute top-[24px] left-[24px] right-0 bottom-0 overflow-hidden"
            ref={viewportRef}
            onWheel={(e) => {
                e.preventDefault();
                if (e.deltaY < 0) setViewScale(v => Math.min(v + 0.1, 5));
                else setViewScale(v => Math.max(v - 0.1, 0.1));
            }}
          >
            {/* JIKA GAMBAR BELUM DIUNGGAH (COLD-START HERO DROPZONE) */}
            {!image ? (
              <div className="w-full h-full flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className={`max-w-md w-full border-2 border-dashed rounded-3xl p-8 text-center transition-all ${isDraggingOver ? 'border-emerald-500 scale-102 bg-emerald-500/10' : (isDarkMode ? 'border-[#282828] bg-[#111]' : 'border-gray-300 bg-white shadow-xl')}`}>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 mx-auto flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/20 mb-4">
                    🖼️
                  </div>
                  <h2 className="text-xl font-black tracking-tight mb-2">Tarik & Lepas Gambar ke Sini</h2>
                  <p className={`text-xs leading-relaxed mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Unggah foto untuk menerapkan efek generative slit-scan, bingkai grid terstruktur, kartu cutout, dan tipografi modern secara instan.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2.5 justify-center mb-6">
                    <button 
                      onClick={() => fileInputRef.current.click()}
                      className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/25 active:scale-95 transition-all cursor-pointer"
                    >
                      Pilih File dari Laptop
                    </button>
                    <button 
                      onClick={loadAestheticSample}
                      className={`px-5 py-3 rounded-xl font-bold text-xs border active:scale-95 transition-all cursor-pointer ${isDarkMode ? 'bg-[#1c1c1c] border-[#333] text-gray-200 hover:bg-[#252525]' : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'}`}
                    >
                      ✨ Coba Gambar Sampel
                    </button>
                  </div>

                  <div className={`flex items-center justify-center space-x-3 text-[10px] font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    <span>PNG / JPG / WEBP</span>
                    <span>•</span>
                    <span>Multi-Format</span>
                    <span>•</span>
                    <span>Resolusi Tinggi</span>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`, transformOrigin: 'center' }}
                className={`w-full h-full flex items-center justify-center transition-transform duration-75
                            ${currentTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : (currentTool === 'brush' && isManualMode ? 'cursor-none' : 'cursor-crosshair')}`}
              >
                <canvas ref={canvasRef} className={`shadow-[0_0_60px_rgba(0,0,0,0.6)] object-contain ${isDarkMode ? 'bg-[#050505]' : 'bg-white'}`} />
              </div>
            )}

            {/* Draggable Guides */}
            {guides.map(g => (
               <div 
                  key={g.id}
                  style={{ [g.type === 'h' ? 'top' : 'left']: (g.type === 'h' ? viewportSize.h/2 + pan.y + g.pos * viewScale : viewportSize.w/2 + pan.x + g.pos * viewScale) + 'px' }}
                  className={`absolute z-20 flex items-center justify-center
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

          {/* --- FLOATING CANVAS DOCK (CANVA / FIGMA STYLE BOTTOM CENTER) --- */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40">
            <div className={`backdrop-blur-xl border rounded-2xl shadow-2xl p-1.5 flex items-center space-x-1.5 transition-colors ${isDarkMode ? 'bg-[#121212]/90 border-[#282828] text-gray-300' : 'bg-white/95 border-gray-200 text-gray-700'}`}>
              
              {/* Tool: Pan */}
              <button 
                className={`p-2 rounded-xl transition flex items-center justify-center ${activeTool === 'pan' ? (isDarkMode ? 'bg-emerald-500 text-black shadow' : 'bg-black text-white shadow') : (isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100')}`}
                onClick={() => setActiveTool('pan')} 
                title="Hand Tool (Pan Kanvas) [Shortcut: Spasi / H]"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="19 9 22 12 19 15"/><polyline points="9 19 12 22 15 19"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
              </button>

              {/* Tool: Brush */}
              <button 
                className={`p-2 rounded-xl transition flex items-center justify-center ${activeTool === 'brush' && isManualMode ? (brushTarget === 'card' ? 'bg-amber-400 text-black shadow' : 'bg-cyan-400 text-black shadow') : (isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100')}`}
                onClick={() => { setActiveTool('brush'); setIsManualMode(true); setActiveTab('brush'); }} 
                title="Brush Tool (Lukis Kartu / Stretch) [Shortcut: B]"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.35 2.22 1.45 3.02 1.45 2.67 0 4.81-2.16 4.81-4.83 0-1.66-1.34-3.02-3.01-3.02z"/></svg>
              </button>

              <div className={`h-5 w-[1px] ${isDarkMode ? 'bg-[#2a2a2a]' : 'bg-gray-200'}`}></div>

              {/* Zoom Controls */}
              <button className={`px-2.5 py-1.5 rounded-lg transition font-bold ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100'}`} onClick={() => setViewScale(v => Math.max(0.1, v - 0.1))}>—</button>
              <span className={`px-1.5 font-mono text-[11px] font-bold min-w-[50px] text-center ${isDarkMode ? 'text-cyan-400' : 'text-gray-900'}`}>{Math.round(viewScale * 100)}%</span>
              <button className={`px-2.5 py-1.5 rounded-lg transition font-bold ${isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100'}`} onClick={() => setViewScale(v => Math.min(5, v + 0.1))}>+</button>
              <button className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${isDarkMode ? 'hover:bg-[#222] text-emerald-400' : 'hover:bg-gray-100 text-emerald-700'}`} onClick={() => { setViewScale(1); setPan({x:0, y:0}); }}>Fit</button>

              <div className={`h-5 w-[1px] ${isDarkMode ? 'bg-[#2a2a2a]' : 'bg-gray-200'}`}></div>

              {/* Clear Guides */}
              <button 
                className="p-2 rounded-xl transition text-red-500 hover:bg-red-500/10"
                onClick={() => { setGuides([]); showToast('Garis panduan dibersihkan'); }}
                title="Hapus Semua Garis Panduan"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>

              {/* Shortcuts Help */}
              <button 
                className={`p-2 rounded-xl transition font-mono font-bold text-xs ${isDarkMode ? 'hover:bg-[#222] text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                onClick={() => setShowShortcutsModal(true)}
                title="Pintasan Keyboard [?]"
              >
                ?
              </button>

            </div>
          </div>

        </main>
      </div>

      {/* --- TOAST NOTIFICATION BANNER --- */}
      {toastMessage && (
        <div className="fixed top-16 right-5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="bg-emerald-500 text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2">
            <span>✓</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* --- MODAL POP-UP HASIL PINDAI KATA KUNCI AI (INTERAKTIF) --- */}
      {showScanResultModal && scanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className={`max-w-lg w-full rounded-2xl border p-6 shadow-2xl space-y-4 ${isDarkMode ? 'bg-[#141414] border-[#2e2e2e] text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
            
            {/* Header Status */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-400 to-cyan-400 flex items-center justify-center text-black text-xl font-bold shadow-lg shadow-emerald-500/20">
                  ✓
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-white">Hasil Pindai Kata Kunci AI</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/30">
                      SUKSES
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {scanResult.count} kata kunci spesimen berhasil diekstrak dan disematkan ke tata letak poster
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowScanResultModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition text-lg cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Informasi Metadata */}
            <div className={`p-2.5 rounded-xl border flex flex-wrap items-center gap-2 text-[10.5px] ${isDarkMode ? 'bg-[#1a1a1a] border-[#262626]' : 'bg-gray-50 border-gray-200'}`}>
              <span className="text-gray-400">Mesin:</span>
              <span className="font-mono text-cyan-300 font-bold">{scanResult.source}</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-400">Bahasa:</span>
              <span className="font-mono text-amber-300 font-bold">{scanResult.lang}</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-400 font-mono">{scanResult.timestamp}</span>
            </div>

            {/* Daftar 16 Kata Kunci Spesimen */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-gray-300 flex justify-between items-center">
                <span>Daftar 16 Kata Kunci Spesimen:</span>
                <span className="text-[10px] text-emerald-400 font-mono font-semibold">Status: Aktif di Poster</span>
              </div>
              <div className={`p-3 rounded-xl border max-h-56 overflow-y-auto grid grid-cols-2 gap-1.5 ${isDarkMode ? 'bg-[#101010] border-[#202020]' : 'bg-gray-100 border-gray-200'}`}>
                {scanResult.words.map((word, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition ${isDarkMode ? 'bg-[#181818] border-[#282828] text-emerald-300' : 'bg-white border-gray-200 text-emerald-800'}`}
                  >
                    <span className="text-[9px] text-gray-500 font-mono">#{String(idx + 1).padStart(2, '0')}</span>
                    <span className="truncate">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tombol Aksi Cepat */}
            <div className="flex space-x-2 pt-1">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(scanResult.words.join(', '));
                  setCopiedWordsNotice(true);
                  setTimeout(() => setCopiedWordsNotice(false), 2000);
                  showToast('Semua 16 kata kunci disalin ke clipboard 📋');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1.5 cursor-pointer ${isDarkMode ? 'bg-[#1e1e1e] border-[#303030] hover:bg-[#252525] text-gray-300' : 'bg-gray-100 border-gray-300 hover:bg-gray-200 text-gray-800'}`}
              >
                <span>{copiedWordsNotice ? '✓ Tersalin!' : '📋 Salin Kata'}</span>
              </button>
              <button 
                onClick={() => {
                  applyKeywordsToCells(scanResult.words);
                  showToast('✓ 16 Kata kunci diterapkan ke poster');
                  setShowScanResultModal(false);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black shadow-lg transition active:scale-95 cursor-pointer"
              >
                Terapkan & Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- KEYBOARD SHORTCUTS MODAL --- */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`max-w-sm w-full rounded-2xl border p-5 shadow-2xl ${isDarkMode ? 'bg-[#161616] border-[#2e2e2e] text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">Pintasan Keyboard</h3>
              <button onClick={() => setShowShortcutsModal(false)} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { key: 'Spasi + Geser', desc: 'Geser Kanvas (Pan)' },
                { key: 'Scroll Roda', desc: 'Perbesar / Perkecil (Zoom)' },
                { key: 'B', desc: 'Pilih Alat Kuas (Brush)' },
                { key: 'H', desc: 'Pilih Alat Tangan (Pan)' },
                { key: 'R', desc: 'Acak Pola Slit-Scan (Randomize)' },
                { key: '1 - 4', desc: 'Preset Spesimen (Cat, Fish, Flamingo, Spine)' },
                { key: '5 - 8', desc: 'Preset Klasik (Editorial, Cyber, Zine, Raw)' },
                { key: '?', desc: 'Buka / Tutup Bantuan' }
              ].map((s, idx) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-500/10">
                  <span className={`font-mono font-bold px-2 py-0.5 rounded ${isDarkMode ? 'bg-[#222] text-cyan-400' : 'bg-gray-100 text-cyan-800'}`}>{s.key}</span>
                  <span className="opacity-80">{s.desc}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setShowShortcutsModal(false)} 
              className="mt-5 w-full py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

    </div>
  );
}