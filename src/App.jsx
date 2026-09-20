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

// --- Generator Sel Grid Spesimen (Bento Space Partitioning Engine) ---
function createGridCells({
  bX, bY, bW, bH,
  complexity = 55,
  gridPartitionStyle = 'bento',
  stretchBalance = 55,
  cutoutCardDensity = 16,
  heroBreakoutThreshold = 35,
  intactCellRatio = 20,
  seed = 12345,
  words = []
}) {
  const rng = mulberry32(seed);
  const numDivs = Math.max(3, Math.floor(4 + (complexity / 100) * 12));
  
  let xCuts = [bX, bX + bW];
  let yCuts = [bY, bY + bH];

  if (gridPartitionStyle === 'bento') {
    const majorStepsX = 3 + Math.floor(rng() * 2);
    const majorStepsY = 3 + Math.floor(rng() * 2);
    for (let s = 1; s < majorStepsX; s++) {
      xCuts.push(Math.floor(bX + (s / majorStepsX) * bW + (rng() - 0.5) * (bW / majorStepsX * 0.4)));
    }
    for (let s = 1; s < majorStepsY; s++) {
      yCuts.push(Math.floor(bY + (s / majorStepsY) * bH + (rng() - 0.5) * (bH / majorStepsY * 0.4)));
    }
    const numSubX = Math.floor(numDivs * 0.5);
    const numSubY = Math.floor(numDivs * 0.5);
    for (let i = 0; i < numSubX; i++) {
      const anchor = xCuts[Math.floor(rng() * xCuts.length)];
      xCuts.push(Math.max(bX + 8, Math.min(bX + bW - 8, Math.floor(anchor + (rng() - 0.5) * (bW * 0.2)))));
    }
    for (let i = 0; i < numSubY; i++) {
      const anchor = yCuts[Math.floor(rng() * yCuts.length)];
      yCuts.push(Math.max(bY + 8, Math.min(bY + bH - 8, Math.floor(anchor + (rng() - 0.5) * (bH * 0.2)))));
    }
  } else if (gridPartitionStyle === 'mondrian') {
    [0.2, 0.382, 0.5, 0.618, 0.8].forEach(r => {
      if (rng() > 0.2) xCuts.push(Math.floor(bX + bW * (r + (rng() - 0.5) * 0.05)));
      if (rng() > 0.2) yCuts.push(Math.floor(bY + bH * (r + (rng() - 0.5) * 0.05)));
    });
    for (let i = 0; i < numDivs * 0.6; i++) {
      xCuts.push(Math.floor(bX + rng() * bW));
      yCuts.push(Math.floor(bY + rng() * bH));
    }
  } else if (gridPartitionStyle === 'stripes') {
    for (let i = 0; i < numDivs * 1.2; i++) xCuts.push(Math.floor(bX + rng() * bW));
    for (let i = 0; i < numDivs * 1.2; i++) yCuts.push(Math.floor(bY + rng() * bH));
  } else {
    for (let i = 1; i <= numDivs; i++) {
      xCuts.push(Math.floor(bX + (i / (numDivs + 1)) * bW));
      yCuts.push(Math.floor(bY + (i / (numDivs + 1)) * bH));
    }
  }

  xCuts = Array.from(new Set(xCuts)).sort((a,b) => a - b);
  yCuts = Array.from(new Set(yCuts)).sort((a,b) => a - b);

  const cells = [];
  let boxCounter = 1;
  const numX = xCuts.length - 1;
  const numY = yCuts.length - 1;

  for (let i = 0; i < numX; i++) {
    for (let j = 0; j < numY; j++) {
      const x = xCuts[i];
      const y = yCuts[j];
      const w = xCuts[i+1] - x;
      const h = yCuts[j+1] - y;
      if (w < 4 || h < 4) continue;

      const relCX = ((x + w / 2) - bX) / bW;
      const relCY = ((y + h / 2) - bY) / bH;
      const distFromCenter = Math.hypot(relCX - 0.5, relCY - 0.5) * 2;
      const isPerimeter = (i === 0 || i === numX - 1 || j === 0 || j === numY - 1);
      const isCorner = (i <= 1 || i >= numX - 2) && (j <= 1 || j >= numY - 2);

      let mode = 'slit_v';
      let isHero = false;

      // 1. Hero Breakout
      const breakoutProb = (heroBreakoutThreshold / 100) * (isCorner ? 0.9 : isPerimeter ? 0.55 : 0.12);
      if (rng() < breakoutProb) {
        mode = 'breakout';
        isHero = true;
      } else {
        // 2. Specimen Card
        const cardProb = (cutoutCardDensity / 100) * (isPerimeter ? 1.4 : 0.6);
        if (rng() < cardProb) {
          mode = 'card';
        } else {
          // 3. Intact Photo
          const intactProb = (intactCellRatio / 100) * (distFromCenter < 0.6 ? 1.5 : 0.4);
          if (rng() < intactProb) {
            mode = 'intact';
          } else {
            // 4. Slit scan: aspect ratio + stretchBalance
            const aspect = w / h;
            if (aspect < 0.75) {
              mode = 'slit_v';
            } else if (aspect > 1.35) {
              mode = 'slit_h';
            } else {
              mode = (rng() * 100 < stretchBalance) ? 'slit_h' : 'slit_v';
            }
          }
        }
      }

      const word = words && words.length > 0 ? words[(boxCounter - 1) % words.length] : 'SPECIMEN';
      const num = boxCounter;
      if (mode !== 'breakout') {
        boxCounter++;
      }

      cells.push({
        id: `cell_${i}_${j}`,
        col: i,
        row: j,
        x, y, w, h,
        mode,
        word,
        num,
        sampleOffset: 0.5,
        isHero,
        cardColor: null
      });
    }
  }

  return cells;
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

  // --- MESIN PEMROSESAN GRID SPESIMEN (CELL-BASED PROCESSING ENGINE) ---
  const [engineMode, setEngineMode] = useState('auto'); // 'auto' (generatif cerdas) | 'manual' (interaktif sel & kuas)
  const [gridPartitionStyle, setGridPartitionStyle] = useState('bento'); // 'bento', 'mondrian', 'stripes', 'regular'
  const [gridCells, setGridCells] = useState([]); // Array objek sel
  const [selectedCellId, setSelectedCellId] = useState(null); // Sel terpilih di kanvas
  const [hoveredCellId, setHoveredCellId] = useState(null); // Sel hover di kanvas
  const [manualBrushRole, setManualBrushRole] = useState('slit_v'); // 'slit_v', 'slit_h', 'card', 'intact', 'breakout'
  const [heroBreakoutThreshold, setHeroBreakoutThreshold] = useState(35); // 0 s/d 100%
  const [intactCellRatio, setIntactCellRatio] = useState(20); // 0 s/d 50%
  const [showDirectionArrows, setShowDirectionArrows] = useState(true); // Panah ↓ / →
  const [showIntactBoxBorders, setShowIntactBoxBorders] = useState(true); // Garis & label pada sel utuh

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
  const [apiKeyInput, setApiKeyInput] = useState(''); 
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

  useEffect(() => {
     setAiWords(fallbackWords[annoLang]);
     handleRandomize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annoLang]);

  useEffect(() => {
      const savedKey = localStorage.getItem('geminiApiKey');
      if (savedKey) setApiKeyInput(savedKey);
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
              applyPreset('specimen_bento');
          } else if (e.key === '2') {
              applyPreset('specimen_axial');
          } else if (e.key === '3') {
              applyPreset('specimen_ribbon');
          } else if (e.key === '4') {
              applyPreset('editorial');
          } else if (e.key === '5') {
              applyPreset('cyber');
          } else if (e.key === '6') {
              applyPreset('zine');
          } else if (e.key === '7') {
              applyPreset('minimal');
          } else if (e.key === 'm' || e.key === 'M') {
              setEngineMode(prev => prev === 'auto' ? 'manual' : 'auto');
              showToast(`Ganti Mode Operasi`);
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
    stretchMaskPointsRef.current = []; 
    cardMaskPointsRef.current = []; 
    showToast('Kanvas Diputar 90°');
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
    if (presetName === 'specimen_bento') {
      setEngineMode('auto');
      setGridPartitionStyle('bento');
      setStretchBalance(55);
      setHeroBreakoutThreshold(40);
      setCutoutCardDensity(16);
      setIntactCellRatio(25);
      setComplexity(55);
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setIsDarkMode(false);
      showToast('Preset: 🍱 Swiss Specimen Bento diterapkan');
    } else if (presetName === 'specimen_axial') {
      setEngineMode('auto');
      setGridPartitionStyle('mondrian');
      setStretchBalance(70);
      setHeroBreakoutThreshold(30);
      setCutoutCardDensity(20);
      setIntactCellRatio(30);
      setComplexity(50);
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setIsDarkMode(false);
      showToast('Preset: 🔬 Swiss Specimen Aksial diterapkan');
    } else if (presetName === 'specimen_ribbon') {
      setEngineMode('auto');
      setGridPartitionStyle('stripes');
      setStretchBalance(40);
      setHeroBreakoutThreshold(45);
      setCutoutCardDensity(15);
      setIntactCellRatio(15);
      setComplexity(65);
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('#000000');
      setBoxFontFamily('sans');
      setBoxNumberFormat('arrows');
      setIsDarkMode(false);
      showToast('Preset: 🌊 Swiss Specimen Ribbon diterapkan');
    } else if (presetName === 'editorial') {
      setEngineMode('auto');
      setGridPartitionStyle('bento');
      setStretchBalance(75);
      setHeroBreakoutThreshold(0);
      setCutoutCardDensity(10);
      setIntactCellRatio(15);
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(false);
      setShowCutoutCards(true);
      setCutoutCardColor('#FFFFFF');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(1);
      setBoxBorderColor('auto');
      setBoxFontFamily('sans');
      setBoxNumberFormat('plus');
      setStretchInt(70);
      setComplexity(50);
      showToast('Preset: 📰 Editorial Grid diterapkan');
    } else if (presetName === 'cyber') {
      setEngineMode('auto');
      setGridPartitionStyle('stripes');
      setStretchBalance(85);
      setHeroBreakoutThreshold(10);
      setCutoutCardDensity(0);
      setIntactCellRatio(10);
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowDirectionArrows(false);
      setShowCutoutCards(false);
      setBoxBorderWidth(1);
      setBoxBorderColor('#00FFFF');
      setBoxFontFamily('mono');
      setBoxNumberFormat('pad');
      setRenderStyle('glitch');
      setStretchInt(85);
      setTextColor('#00FFFF');
      showToast('Preset: ⚡ Cyber Slit diterapkan');
    } else if (presetName === 'zine') {
      setEngineMode('auto');
      setGridPartitionStyle('bento');
      setStretchBalance(50);
      setHeroBreakoutThreshold(15);
      setCutoutCardDensity(20);
      setIntactCellRatio(20);
      setShowScratchBoxes(true);
      setShowBoxTypography(true);
      setShowCutoutCards(true);
      setCutoutCardColor('#F8F7F2');
      setCutoutCardOpacity(100);
      setBoxBorderWidth(2);
      setBoxBorderColor('#000000');
      setBoxFontFamily('grotesk');
      setBoxNumberFormat('standard');
      setRenderStyle('zine');
      setBrutalInt(45);
      showToast('Preset: 📄 Brutal Zine diterapkan');
    } else if (presetName === 'minimal') {
      setEngineMode('auto');
      setGridPartitionStyle('regular');
      setStretchBalance(50);
      setHeroBreakoutThreshold(0);
      setCutoutCardDensity(0);
      setIntactCellRatio(0);
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
                        showToast(`AI Berhasil! Menemukan ${words.length} kata kunci.`);
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
        alert(`Gagal memindai gambar via Gemini API: ${err.message}`);
        setAiWords(fallbackWords[annoLang]);
    } finally { 
        setIsAiAnalyzing(false); 
        handleRandomize(); 
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

  const getCanvasCoords = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const applyBrushAtPoint = (e) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const brushRadiusCanvas = (brushSize / 100) * (canvas.width * 0.08);
    setGridCells(prev => {
      let hasChanges = false;
      const updated = prev.map(c => {
        const closestX = Math.max(c.x, Math.min(coords.x, c.x + c.w));
        const closestY = Math.max(c.y, Math.min(coords.y, c.y + c.h));
        const distSq = (coords.x - closestX)**2 + (coords.y - closestY)**2;
        if (distSq <= brushRadiusCanvas**2 && c.mode !== manualBrushRole) {
          hasChanges = true;
          return { ...c, mode: manualBrushRole };
        }
        return c;
      });
      return hasChanges ? updated : prev;
    });
  };

  const handleWorkspacePointerDown = (e) => {
    if (!image) return;
    if (currentTool === 'pan') {
      setIsPanning(true);
      e.target.setPointerCapture(e.pointerId);
    } else if (currentTool === 'brush' && engineMode === 'manual') {
      isPaintingRef.current = true;
      e.target.setPointerCapture(e.pointerId);
      applyBrushAtPoint(e);
    } else if (engineMode === 'manual') {
      // Klik sel langsung untuk memilih atau mengganti mode
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (coords) {
        const clicked = gridCells.find(c => coords.x >= c.x && coords.x <= c.x + c.w && coords.y >= c.y && coords.y <= c.y + c.h);
        if (clicked) {
          if (selectedCellId === clicked.id) {
            const cycleOrder = ['slit_v', 'slit_h', 'intact', 'card', 'breakout'];
            const nextMode = cycleOrder[(cycleOrder.indexOf(clicked.mode) + 1) % cycleOrder.length];
            setGridCells(prev => prev.map(c => c.id === clicked.id ? { ...c, mode: nextMode } : c));
          } else {
            setSelectedCellId(clicked.id);
          }
        } else {
          setSelectedCellId(null);
        }
      }
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
    else if (isPaintingRef.current && currentTool === 'brush' && engineMode === 'manual') {
      applyBrushAtPoint(e);
    } else if (engineMode === 'manual') {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (coords) {
        const hovered = gridCells.find(c => coords.x >= c.x && coords.x <= c.x + c.w && coords.y >= c.y && coords.y <= c.y + c.h);
        setHoveredCellId(hovered ? hovered.id : null);
      } else {
        if (hoveredCellId) setHoveredCellId(null);
      }
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

  const generateAutomaticGrid = useCallback((customSeed = seed) => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

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
    const canvasW = isRotated ? baseH : baseW;
    const canvasH = isRotated ? baseW : baseH;

    const centerX = canvasW / 2;
    const centerY = canvasH / 2;
    const scaleFactor = scale / 100; 
    const drawW = Math.floor(image.width * scaleFactor);
    const drawH = Math.floor(image.height * scaleFactor);
    const effectiveImgW = isRotated ? drawH : drawW;
    const effectiveImgH = isRotated ? drawW : drawH;
    const imgX = Math.floor(centerX - effectiveImgW / 2 + imageOffsetX);
    const imgY = Math.floor(centerY - effectiveImgH / 2 + imageOffsetY);
    const imgW = effectiveImgW;
    const imgH = effectiveImgH;

    const isImageLocked = gridBoundsMode === 'image';
    const bX = isImageLocked ? imgX : 0;
    const bY = isImageLocked ? imgY : 0;
    const bW = isImageLocked ? imgW : canvasW;
    const bH = isImageLocked ? imgH : canvasH;

    const newCells = createGridCells({
      bX, bY, bW, bH,
      complexity,
      gridPartitionStyle,
      stretchBalance,
      cutoutCardDensity,
      heroBreakoutThreshold,
      intactCellRatio,
      seed: customSeed,
      words: aiWords
    });

    setGridCells(newCells);
  }, [
    image, rotation, canvasFormat, scale, imageOffsetX, imageOffsetY, gridBoundsMode,
    complexity, gridPartitionStyle, stretchBalance, cutoutCardDensity,
    heroBreakoutThreshold, intactCellRatio, seed, aiWords
  ]);

  useEffect(() => {
    if (image && engineMode === 'auto') {
      generateAutomaticGrid();
    }
  }, [
    image, scale, rotation, canvasFormat, gridBoundsMode, complexity, gridPartitionStyle,
    stretchBalance, cutoutCardDensity, heroBreakoutThreshold, intactCellRatio,
    seed, aiWords, imageOffsetX, imageOffsetY, engineMode, generateAutomaticGrid
  ]);

  const handleRandomize = () => {
    const nextSeed = Math.random() * 10000;
    setSeed(nextSeed);
    if (engineMode === 'auto') {
      generateAutomaticGrid(nextSeed);
    }
    showToast('Struktur Grid Diacak 🔀');
  };

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

  // --- LOGIKA UTAMA PENGGAMBARAN KANVAS (CELL-BASED PROCESSING ENGINE) ---
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

    // Offscreen buffer for original untransformed image
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

    // Actual image bounds
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

    // Draw base image onto canvas
    if (isImageLocked) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bX, bY, bW, bH);
      ctx.clip();
      ctx.drawImage(offscreen, bX, bY, bW, bH, bX, bY, bW, bH);
      ctx.restore();
    } else {
      ctx.drawImage(offscreen, 0, 0);
    }

    if (renderStyle === 'zine') {
      ctx.filter = 'grayscale(80%) contrast(150%) brightness(90%)';
    }

    // Typography metrics
    const strokeW = Math.max(1, Math.floor(boxBorderWidth * relScale));
    const fontScale = boxFontSize / 100;
    const mainFontSize = Math.max(8, Math.floor(12 * relScale * fontScale));
    const subFontSize = Math.max(7, Math.floor(9.5 * relScale * fontScale));
    const padX = Math.max(3, Math.floor(4 * relScale));
    const padY = Math.max(2, Math.floor(3 * relScale));
    const currentFontFamily = fontFamilies[boxFontFamily] || fontFamilies['sans'];

    // Render cells from gridCells
    gridCells.forEach(cell => {
      // 1. Content Rendering
      if (cell.mode === 'breakout') {
        // Pristine base image shows through cleanly without borders or slit
        return;
      }

      if (cell.mode === 'intact') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.w, cell.h);
        ctx.clip();
        ctx.drawImage(offscreen, cell.x, cell.y, cell.w, cell.h, cell.x, cell.y, cell.w, cell.h);
        ctx.restore();
      } else if (cell.mode === 'slit_v') {
        const sampleOffset = cell.sampleOffset != null ? cell.sampleOffset : 0.5;
        const sampleY = Math.floor(cell.y + cell.h * sampleOffset);
        const sliceH = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.w, cell.h);
        ctx.clip();
        ctx.drawImage(offscreen, cell.x, sampleY, cell.w, sliceH, cell.x, cell.y, cell.w, cell.h);
        ctx.restore();
      } else if (cell.mode === 'slit_h') {
        const sampleOffset = cell.sampleOffset != null ? cell.sampleOffset : 0.5;
        const sampleX = Math.floor(cell.x + cell.w * sampleOffset);
        const sliceW = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.w, cell.h);
        ctx.clip();
        ctx.drawImage(offscreen, sampleX, cell.y, sliceW, cell.h, cell.x, cell.y, cell.w, cell.h);
        ctx.restore();
      } else if (cell.mode === 'card') {
        ctx.save();
        const cardFill = hexToRgba(cell.cardColor || cutoutCardColor, cutoutCardOpacity);
        ctx.fillStyle = cardFill;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        ctx.restore();
      }

      // 2. Wireframe Border
      if (showScratchBoxes) {
        ctx.save();
        ctx.lineWidth = strokeW;
        if (boxBorderColor === 'auto') {
          if (cell.mode === 'card') {
            ctx.strokeStyle = getContrastTextColor(cell.cardColor || cutoutCardColor) === '#000000'
              ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
          } else {
            ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.75)';
          }
        } else {
          ctx.strokeStyle = boxBorderColor;
        }
        ctx.strokeRect(Math.floor(cell.x) + 0.5, Math.floor(cell.y) + 0.5, Math.floor(cell.w), Math.floor(cell.h));
        ctx.restore();
      }

      // 3. Typography & Arrows
      if (showBoxTypography && cell.w >= 22 * relScale && cell.h >= 13 * relScale) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let arrowChar = '';
        if (showDirectionArrows || boxNumberFormat === 'arrows') {
          if (cell.mode === 'slit_v') arrowChar = '↓';
          else if (cell.mode === 'slit_h') arrowChar = '→';
        }

        let numDisplay = `${cell.num}${arrowChar}`;
        if (boxNumberFormat === 'pad') numDisplay = `${cell.num < 10 ? '0' : ''}${cell.num}${arrowChar}`;
        else if (boxNumberFormat === 'plus') numDisplay = `${cell.num}+`;

        let textFill = (cell.mode === 'card')
          ? getContrastTextColor(cell.cardColor || cutoutCardColor)
          : (isDarkMode ? '#FFFFFF' : '#000000');

        ctx.fillStyle = textFill;
        ctx.font = `800 ${mainFontSize}px ${currentFontFamily}`;

        let renderWord = cell.word || 'SPECIMEN';
        const maxTextW = cell.w - padX * 2;
        if (ctx.measureText(renderWord).width > maxTextW && renderWord.length > 4) {
          renderWord = renderWord.substring(0, Math.max(3, Math.floor(maxTextW / (mainFontSize * 0.65)))) + '.';
        }
        ctx.fillText(renderWord, Math.floor(cell.x + padX), Math.floor(cell.y + padY));

        if (cell.h >= (mainFontSize + subFontSize + padY * 2)) {
          ctx.font = `700 ${subFontSize}px ${currentFontFamily}`;
          ctx.fillText(numDisplay, Math.floor(cell.x + padX), Math.floor(cell.y + padY + mainFontSize + Math.floor(2 * relScale)));
        }
        ctx.restore();
      }
    });

    // 4. Interactive Selection & Hover Highlights (Manual Mode)
    if (engineMode === 'manual') {
      if (hoveredCellId) {
        const hoveredCell = gridCells.find(c => c.id === hoveredCellId);
        if (hoveredCell) {
          ctx.save();
          ctx.strokeStyle = '#00FFFF';
          ctx.lineWidth = Math.max(1.5, 1.5 * relScale);
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(hoveredCell.x + 0.5, hoveredCell.y + 0.5, hoveredCell.w, hoveredCell.h);
          ctx.restore();
        }
      }
      if (selectedCellId) {
        const selCell = gridCells.find(c => c.id === selectedCellId);
        if (selCell) {
          ctx.save();
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = Math.max(2, 2 * relScale);
          ctx.strokeRect(selCell.x + 0.5, selCell.y + 0.5, selCell.w, selCell.h);
          // Corner handles
          ctx.fillStyle = '#10B981';
          const hs = 6;
          ctx.fillRect(selCell.x - hs/2, selCell.y - hs/2, hs, hs);
          ctx.fillRect(selCell.x + selCell.w - hs/2, selCell.y - hs/2, hs, hs);
          ctx.fillRect(selCell.x - hs/2, selCell.y + selCell.h - hs/2, hs, hs);
          ctx.fillRect(selCell.x + selCell.w - hs/2, selCell.y + selCell.h - hs/2, hs, hs);
          ctx.restore();
        }
      }
    }

    ctx.filter = 'none';
  }, [
    image, rotation, canvasFormat, brutalInt, isDarkMode, scale, imageOffsetX, imageOffsetY,
    gridBoundsMode, renderStyle, boxBorderWidth, boxBorderColor, showScratchBoxes, showBoxTypography,
    boxFontSize, boxFontFamily, showDirectionArrows, boxNumberFormat, cutoutCardColor, cutoutCardOpacity,
    gridCells, hoveredCellId, selectedCellId, engineMode
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

        {/* Quick Presets & Engine Mode Bar (Tengah) */}
        <div className="hidden lg:flex items-center space-x-2 p-1 rounded-xl border bg-opacity-60 backdrop-blur-sm" style={{ backgroundColor: isDarkMode ? '#141414' : '#f3f4f6', borderColor: isDarkMode ? '#242424' : '#e5e7eb' }}>
          {/* Mode Switcher */}
          <div className="flex items-center space-x-1 pr-1.5 border-r" style={{ borderColor: isDarkMode ? '#262626' : '#e0e0e0' }}>
            <button
              onClick={() => setEngineMode('auto')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${engineMode === 'auto' ? (isDarkMode ? 'bg-emerald-500 text-black shadow' : 'bg-white text-emerald-800 shadow') : (isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black')}`}
            >
              <span>🤖</span>
              <span>Otomatis</span>
            </button>
            <button
              onClick={() => { setEngineMode('manual'); setActiveTool('brush'); }}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${engineMode === 'manual' ? (isDarkMode ? 'bg-cyan-400 text-black shadow' : 'bg-white text-cyan-800 shadow') : (isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black')}`}
            >
              <span>✍️</span>
              <span>Manual</span>
            </button>
          </div>

          {/* Jika Mode Otomatis: Tampilkan Preset Cepat & Tombol Re-generate */}
          {engineMode === 'auto' ? (
            <div className="flex items-center space-x-1">
              {[
                { id: 'specimen_bento', label: '🍱 Bento', shortcut: '1' },
                { id: 'specimen_axial', label: '🔬 Aksial', shortcut: '2' },
                { id: 'specimen_ribbon', label: '🌊 Ribbon', shortcut: '3' },
                { id: 'editorial', label: '📰 Edit', shortcut: '4' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-2 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1 cursor-pointer ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-[#222]' : 'text-gray-700 hover:text-black hover:bg-white hover:shadow-sm'}`}
                  title={`Preset ${p.label} (Shortcut: ${p.shortcut})`}
                >
                  <span>{p.label}</span>
                  <span className={`text-[9px] font-mono px-1 rounded ${isDarkMode ? 'bg-[#222] text-gray-500' : 'bg-gray-200 text-gray-500'}`}>{p.shortcut}</span>
                </button>
              ))}
            </div>
          ) : (
            /* Jika Mode Manual: Tampilkan Kuas Cepat */
            <div className="flex items-center space-x-1">
              <span className={`text-[9.5px] font-bold uppercase tracking-wider px-1 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>Kuas:</span>
              {[
                { role: 'slit_v', label: '↓ Slit V' },
                { role: 'slit_h', label: '→ Slit H' },
                { role: 'card', label: '🗂️ Card' },
                { role: 'intact', label: '🖼️ Intact' },
                { role: 'breakout', label: '✂️ Break' }
              ].map(b => (
                <button
                  key={b.role}
                  onClick={() => { setManualBrushRole(b.role); setActiveTool('brush'); }}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${manualBrushRole === b.role ? (isDarkMode ? 'bg-cyan-400 text-black shadow' : 'bg-cyan-700 text-white shadow') : (isDarkMode ? 'text-gray-400 hover:text-white hover:bg-[#222]' : 'text-gray-600 hover:text-black hover:bg-white')}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
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
                
                {/* 0. MESIN PEMROSESAN GRID SPESIMEN (AUTO & MANUAL) */}
                <div className={`p-3.5 rounded-xl border space-y-3.5 ${isDarkMode ? 'bg-[#141414] border-[#222]' : 'bg-gray-50 border-gray-200'}`}>
                  <div>
                    <div className="text-xs font-bold flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span>🔬</span>
                        <span>Mesin Pemrosesan Grid Spesimen</span>
                      </div>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${engineMode === 'auto' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'}`}>
                        {engineMode === 'auto' ? '🤖 Otomatis' : '✍️ Manual'}
                      </span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Logika partisi bento asimetris & peran pemrosesan sel mandiri
                    </div>
                  </div>

                  {/* Mode Operasi Toggle */}
                  <div className="flex p-1 rounded-lg border" style={{ backgroundColor: isDarkMode ? '#1a1a1a' : '#e5e7eb', borderColor: isDarkMode ? '#282828' : '#d1d5db' }}>
                    <button
                      onClick={() => setEngineMode('auto')}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${engineMode === 'auto' ? (isDarkMode ? 'bg-emerald-500 text-black shadow' : 'bg-white text-emerald-800 shadow') : (isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black')}`}
                    >
                      <span>🤖</span>
                      <span>Mode Otomatis</span>
                    </button>
                    <button
                      onClick={() => { setEngineMode('manual'); setActiveTool('brush'); }}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${engineMode === 'manual' ? (isDarkMode ? 'bg-cyan-400 text-black shadow' : 'bg-white text-cyan-800 shadow') : (isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black')}`}
                    >
                      <span>✍️</span>
                      <span>Mode Manual</span>
                    </button>
                  </div>

                  {/* --- KONTROL MODE OTOMATIS --- */}
                  {engineMode === 'auto' && (
                    <div className="space-y-3 pt-1 border-t border-dashed" style={{ borderColor: isDarkMode ? '#262626' : '#e5e7eb' }}>
                      {/* Gaya Partisi Bento */}
                      <div>
                        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Algoritma Partisi Ruang:
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'bento', label: '🍱 Bento Asimetris', desc: 'Kuadran hierarkis' },
                            { id: 'mondrian', label: '📐 Mondrian Aksial', desc: 'Rasio emas & cross' },
                            { id: 'stripes', label: '🌊 Strip Aliran', desc: 'Irisan pita dinamis' },
                            { id: 'regular', label: '▦ Grid Reguler', desc: 'Kisi proporsional' }
                          ].map(style => (
                            <button
                              key={style.id}
                              onClick={() => setGridPartitionStyle(style.id)}
                              className={`p-2 text-left rounded-lg border transition-all cursor-pointer ${gridPartitionStyle === style.id ? (isDarkMode ? 'bg-emerald-500/10 border-emerald-400 text-emerald-400 font-bold ring-1 ring-emerald-400/40 shadow-sm' : 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold shadow-sm') : (isDarkMode ? 'bg-[#181818] border-[#282828] text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}`}
                            >
                              <div className="text-[10px] font-bold">{style.label}</div>
                              <div className="text-[8px] opacity-70">{style.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Slider Keseimbangan Aliran Slit (H ↔ V) */}
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span>Keseimbangan Aliran Slit (H ↔ V)</span>
                          <span className="font-mono text-cyan-400">{stretchBalance}H / {100 - stretchBalance}V</span>
                        </div>
                        <input
                          type="range" min="0" max="100" value={stretchBalance}
                          onChange={(e) => setStretchBalance(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>

                      {/* Slider Ambang Breakout Subjek */}
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span>Ambang Breakout Subjek (Wajah/Ujung Bebas)</span>
                          <span className="font-mono text-emerald-400">{heroBreakoutThreshold}%</span>
                        </div>
                        <input
                          type="range" min="0" max="100" value={heroBreakoutThreshold}
                          onChange={(e) => setHeroBreakoutThreshold(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                      </div>

                      {/* Slider Kepadatan Kartu Spesimen Solid */}
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span>Kepadatan Kartu Spesimen Solid</span>
                          <span className="font-mono text-amber-400">{cutoutCardDensity}%</span>
                        </div>
                        <input
                          type="range" min="0" max="50" value={cutoutCardDensity}
                          onChange={(e) => setCutoutCardDensity(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      {/* Slider Rasio Sel Foto Utuh (Intact Photo) */}
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span>Rasio Sel Foto Asli Utuh</span>
                          <span className="font-mono text-emerald-400">{intactCellRatio}%</span>
                        </div>
                        <input
                          type="range" min="0" max="50" value={intactCellRatio}
                          onChange={(e) => setIntactCellRatio(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                      </div>

                      {/* Tombol Acak / Re-generate */}
                      <button
                        onClick={handleRandomize}
                        className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center space-x-2 shadow-md transition-all active:scale-98 cursor-pointer"
                      >
                        <span>🔀</span>
                        <span>Buat Variasi Struktur Baru (Re-generate)</span>
                      </button>
                    </div>
                  )}

                  {/* --- KONTROL MODE MANUAL --- */}
                  {engineMode === 'manual' && (
                    <div className="space-y-3 pt-1 border-t border-dashed" style={{ borderColor: isDarkMode ? '#262626' : '#e5e7eb' }}>
                      <div>
                        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Pilih Peran Kuas (Klik/Usap Sel di Kanvas):
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { role: 'slit_v', label: '↓ Slit Vertikal', desc: 'Tarik garis vertikal', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
                            { role: 'slit_h', label: '→ Slit Horizontal', desc: 'Tarik garis horizontal', color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
                            { role: 'card', label: '🗂️ Kartu Solid', desc: 'Kartu putih spesimen', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
                            { role: 'intact', label: '🖼️ Foto Utuh', desc: 'Foto asli berbingkai', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
                            { role: 'breakout', label: '✂️ Breakout (Hapus)', desc: 'Bebas tembus kanvas', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10' }
                          ].map(item => (
                            <button
                              key={item.role}
                              onClick={() => { setManualBrushRole(item.role); setActiveTool('brush'); }}
                              className={`p-2 text-left rounded-lg border transition-all cursor-pointer ${manualBrushRole === item.role ? `${item.color} font-bold ring-1 shadow-sm` : (isDarkMode ? 'bg-[#181818] border-[#282828] text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}`}
                            >
                              <div className="text-[10px] font-bold">{item.label}</div>
                              <div className="text-[8px] opacity-70">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Slider Ukuran Kuas */}
                      <div>
                        <div className={`flex justify-between text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span>Radius Usapan Kuas</span>
                          <span className="font-mono text-cyan-400">{brushSize}px</span>
                        </div>
                        <input
                          type="range" min="15" max="150" value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>

                      {/* Editor Sel Terpilih */}
                      {selectedCellId && (() => {
                        const sel = gridCells.find(c => c.id === selectedCellId);
                        if (!sel) return null;
                        return (
                          <div className={`p-2.5 rounded-lg border space-y-2 ${isDarkMode ? 'bg-[#1a1a1a] border-emerald-500/40' : 'bg-emerald-50/50 border-emerald-300'}`}>
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-emerald-400">Sel #{sel.num} Terpilih</span>
                              <button onClick={() => setSelectedCellId(null)} className="text-gray-400 hover:text-white text-xs">✕</button>
                            </div>
                            <div className="flex space-x-1">
                              {[
                                { id: 'slit_v', label: '↓ V' },
                                { id: 'slit_h', label: '→ H' },
                                { id: 'card', label: '🗂️' },
                                { id: 'intact', label: '🖼️' },
                                { id: 'breakout', label: '✂️' }
                              ].map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => setGridCells(prev => prev.map(c => c.id === sel.id ? { ...c, mode: m.id } : c))}
                                  className={`flex-1 py-1 text-[9.5px] font-bold rounded border ${sel.mode === m.id ? 'bg-emerald-500 text-black border-emerald-400' : (isDarkMode ? 'bg-[#222] text-gray-300 border-[#333]' : 'bg-white text-gray-700 border-gray-300')}`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold text-gray-400 mb-0.5">Edit Kata Label:</div>
                              <input
                                type="text"
                                value={sel.word || ''}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  setGridCells(prev => prev.map(c => c.id === sel.id ? { ...c, word: val } : c));
                                }}
                                className={`w-full px-2 py-1 text-xs font-mono font-bold rounded border uppercase ${isDarkMode ? 'bg-[#121212] border-[#333] text-white' : 'bg-white border-gray-300 text-black'}`}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Tombol Aksi Cepat Massal */}
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        <button
                          onClick={() => { setGridCells(prev => prev.map(c => ({ ...c, mode: 'intact' }))); showToast('Semua sel diubah ke Foto Utuh'); }}
                          className={`py-1.5 px-2 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${isDarkMode ? 'bg-[#181818] border-[#2a2a2a] text-gray-300 hover:text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                        >
                          Semua Foto Utuh 🖼️
                        </button>
                        <button
                          onClick={() => { setGridCells(prev => prev.map(c => ({ ...c, mode: c.w > c.h ? 'slit_h' : 'slit_v' }))); showToast('Semua sel diubah ke Slit-Scan'); }}
                          className={`py-1.5 px-2 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${isDarkMode ? 'bg-[#181818] border-[#2a2a2a] text-gray-300 hover:text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                        >
                          Semua Slit-Scan 🌊
                        </button>
                        <button
                          onClick={() => {
                            setGridCells(prev => prev.map(c => {
                              const isEdge = c.col === 0 || c.row === 0;
                              return isEdge ? { ...c, mode: 'card' } : c;
                            }));
                            showToast('Tepi luar diubah ke Kartu Putih');
                          }}
                          className={`py-1.5 px-2 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${isDarkMode ? 'bg-[#181818] border-[#2a2a2a] text-gray-300 hover:text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                        >
                          Tepi Jadi Kartu 🗂️
                        </button>
                        <button
                          onClick={() => { setGridCells(prev => prev.map(c => ({ ...c, mode: 'breakout' }))); showToast('Grid dikosongkan (Breakout)'); }}
                          className={`py-1.5 px-2 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${isDarkMode ? 'bg-[#181818] border-[#2a2a2a] text-rose-400 hover:text-rose-300' : 'bg-white border-gray-200 text-rose-700 hover:bg-rose-50'}`}
                        >
                          Kosongkan Grid ✂️
                        </button>
                      </div>
                    </div>
                  )}
                </div>

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

                  <div>
                    <input 
                      type="password" 
                      placeholder="Masukkan Gemini API Token (AI Studio)" 
                      value={apiKeyInput} 
                      onChange={(e) => setApiKeyInput(e.target.value)} 
                      className={`w-full text-xs p-2.5 border rounded-lg focus:outline-none ${isDarkMode ? 'bg-[#1a1a1a] border-[#2a2a2a] text-white focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900'}`} 
                    />
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] mt-1 inline-block text-cyan-400 hover:underline">
                      Dapatkan Token Gemini API gratis di sini →
                    </a>
                  </div>

                  <button 
                    onClick={handleAiAnalysis} 
                    disabled={isAiAnalyzing || !image} 
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition shadow flex items-center justify-center space-x-2 ${isAiAnalyzing || !image ? 'opacity-50 cursor-not-allowed bg-gray-600 text-gray-300' : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black active:scale-95'}`}
                  >
                    <span>✨</span>
                    <span>{isAiAnalyzing ? 'Sedang Menganalisis Gambar...' : 'Pindai Kata Kunci AI (Gemini 3.6)'}</span>
                  </button>
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
                            ${activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : (activeTool === 'brush' ? 'cursor-crosshair' : 'cursor-default')}`}
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
                className={`p-2 rounded-xl transition flex items-center justify-center ${activeTool === 'brush' ? 'bg-cyan-400 text-black shadow' : (isDarkMode ? 'hover:bg-[#222]' : 'hover:bg-gray-100')}`}
                onClick={() => { 
                  setActiveTool('brush'); 
                  setEngineMode('manual'); 
                  setIsManualMode(true); 
                  setActiveTab('grid'); 
                  showToast(`Brush aktif: mode ${manualBrushRole.toUpperCase()}`);
                }} 
                title="Brush Lukis Sel [Shortcut: B]"
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