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

export default function App() {
  // --- Manajemen State ---
  const [image, setImage] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [seed, setSeed] = useState(12345);
  const [isDragging, setIsDragging] = useState(false);
  
  // Kontrol Slider
  const [scale, setScale] = useState(80); // Logika Video: 100 = Penuh, <100 = Mengecil di tengah (Bleed)
  const [complexity, setComplexity] = useState(60); 
  const [density, setDensity] = useState(65);       
  const [stretchInt, setStretchInt] = useState(72); 
  const [brutalInt, setBrutalInt] = useState(25); // Tingkat tebal tarikan
  const [stretchDirX, setStretchDirX] = useState(true);
  const [stretchDirY, setStretchDirY] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showTextAnnotations, setShowTextAnnotations] = useState(true);
  const [textColor, setTextColor] = useState('#000000'); 

  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [annoLang, setAnnoLang] = useState('EN'); 
  const [apiKeyInput, setApiKeyInput] = useState(''); 

  const fallbackWords = {
    'ID': ['HIJAU', 'DAUN', 'ALAM', 'TEKS', 'SEDERHANA', 'DESAIN', 'KISI', 'TANAMAN', 'CABANG', 'DATAR', 'JELAS', 'REGANG'],
    'EN': ['GREEN', 'LEAF', 'NATURE', 'TEXT', 'SIMPLE', 'DESIGN', 'GRID', 'PLANT', 'BRANCH', 'FLAT', 'CLEAR', 'STRETCH'],
    'JP': ['緑', '葉', '自然', 'テキスト', 'シンプル', 'デザイン', 'グリッド', '植物', '枝', 'フラット', 'クリア', 'ストレッチ']
  };
  
  const [aiWords, setAiWords] = useState(fallbackWords['EN']);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- Fungsi Penanganan File ---
  const processFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          setSeed(Math.random() * 10000); 
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = (e) => processFile(e.target.files[0]);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleRandomize = () => setSeed(Math.random() * 10000);
  
  const handleExport = (format) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `regang-kisi-${Date.now()}.${format}`;
    link.href = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
    link.click();
  };

  const handleAiAnalysis = async () => {
    if (!image) return; 
    
    if (!apiKeyInput || apiKeyInput.trim() === '') {
        alert("Silakan masukkan API Key (Token) GitHub Anda terlebih dahulu.");
        return;
    }

    setIsAiAnalyzing(true);
    
    try {
        const tempCanvas = document.createElement('canvas');
        const MAX_SIZE = 600;
        let w = image.width;
        let h = image.height;
        if (w > MAX_SIZE || h > MAX_SIZE) {
            const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
            w *= ratio;
            h *= ratio;
        }
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, w, h);
        
        const base64Data = `data:image/jpeg;base64,${tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1]}`;
        const apiKey = apiKeyInput.trim(); 
        const langMap = { 'ID': 'Indonesian', 'EN': 'English', 'JP': 'Japanese' };
        const promptText = `Analyze this image and provide exactly 12 single-word aesthetic keywords describing its main subjects, colors, or vibe. The words MUST be translated to ${langMap[annoLang]}. Return ONLY a comma-separated list of these words, in ALL CAPS (if applicable). No intro, no outro, no markdown.`;
        
        const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", 
                messages: [
                    { role: "user", content: [ { type: "text", text: promptText }, { type: "image_url", image_url: { url: base64Data } } ] }
                ]
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error?.message || `API Error: ${response.status}`);
        
        let text = data.choices?.[0]?.message?.content;
        if (text) {
            text = text.replace(/`/g, '').replace(/csv/g, '').trim();
            const words = text.split(',').map(w => w.trim().toUpperCase()).filter(w => w);
            if (words.length > 0) {
                setAiWords(words);
                alert("Analisis AI GitHub Berhasil!");
            }
        } else {
             throw new Error("Respons AI dari GitHub kosong atau tidak sesuai format.");
        }
    } catch (err) {
        console.error("AI API Error:", err);
        alert(`Gagal menganalisis gambar via GitHub Models.\n\nEror: ${err.message}`);
        setAiWords(fallbackWords[annoLang]);
    } finally {
        setIsAiAnalyzing(false);
        handleRandomize(); 
    }
  };

  useEffect(() => {
     setAiWords(fallbackWords[annoLang]);
     handleRandomize();
  }, [annoLang]);

  // --- LOGIKA UTAMA (TRUE SLIT-SCAN BERBASIS KISI) ---
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Default fallback
    if (!image) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width || 800;
      canvas.height = rect.height || 600;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '30px sans-serif';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText('Silakan unggah atau tarik gambar ke sini', canvas.width/2, canvas.height/2);
      return;
    }

    const rng = mulberry32(seed);
    const isRotated = rotation % 180 !== 0;
    
    // --- 1. RESOLUSI ASLI GAMBAR (Untuk Ekspor Super Jernih) ---
    // Kanvas output akan sama persis ukurannya dengan ukuran file asli gambar
    canvas.width = isRotated ? image.height : image.width;
    canvas.height = isRotated ? image.width : image.height;
    
    const relScale = Math.max(1, canvas.width / 1000); // Rasio agar tebal garis/font tetap proporsional
    
    ctx.imageSmoothingEnabled = brutalInt < 50; 
    ctx.fillStyle = '#FFFFFF'; // Background dasar (di video menggunakan latar putih bersih)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // --- 2. KANVAS SUMBER (LOGIKA "SHRINK & BLEED" DARI VIDEO) ---
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offCtx = offscreen.getContext('2d');
    
    // Background dibiarkan transparan atau putih agar potongan kosong tidak menarik gambar lama
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Logika Video: Skala (10-100%) mengecilkan gambar di TENGAH, menyisakan ruang kosong di pinggir
    const scaleFactor = scale / 100; 
    const drawW = Math.floor(image.width * scaleFactor);
    const drawH = Math.floor(image.height * scaleFactor);

    offCtx.save();
    offCtx.translate(centerX, centerY);
    offCtx.rotate((rotation * Math.PI) / 180);
    // Draw tepat di tengah berdasarkan dimensi gambar yang diperkecil
    offCtx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    offCtx.restore();

    // --- 3. PEMBUATAN MATRIKS KISI ---
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
    
    // Karena kanvas ini beresolusi sangat tinggi, kita scale brutalInt
    const maxThick = Math.max(1, Math.floor((brutalInt / 100) * 20 * relScale)); 

    // --- 4. RENDER EFEK SLIT-SCAN (Menarik Tepi Gambar) ---
    for (let i = 0; i < xCuts.length - 1; i++) {
        for (let j = 0; j < yCuts.length - 1; j++) {
            const x = xCuts[i];
            const y = yCuts[j];
            const w = xCuts[i+1] - x;
            const h = yCuts[j+1] - y;
            
            if (w < 1 || h < 1) continue;

            const dstW = w + 1;
            const dstH = h + 1;
            const r = rng();

            if (r < pEmpty) {
                // CELAH PUTIH
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x, y, dstW, dstH);
            } 
            else if (r < pEmpty + pStretch) {
                // SLIT-SCAN (Karena gambar di tengah mengecil, tarikan ini akan melebar ke ujung kanvas)
                let isHoriz = rng() > 0.5;
                if (!stretchDirX && stretchDirY) isHoriz = false;
                if (stretchDirX && !stretchDirY) isHoriz = true;
                const isBrutal = rng() < (brutalInt / 100);

                if (isHoriz && stretchDirX) {
                    let sliceW = Math.max(1, Math.floor(1 * relScale * 0.5)); // Slice setipis mungkin untuk pure pixel stretch
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
            } 
            else {
                ctx.drawImage(offscreen, x, y, w, h, x, y, dstW, dstH);
            }
        }
    }

    // --- 5. DEKORASI (Garis & Font yang dikalibrasi ke Resolusi Asli) ---
    if (showGridLines) {
        ctx.fillStyle = '#000000';
        ctx.lineWidth = Math.max(1, Math.floor(1 * relScale * 0.5));
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        
        xCuts.forEach(x => {
           if(rng() > 0.8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
        });
        yCuts.forEach(y => {
           if(rng() > 0.8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
        });

        // Balok Hitam Dekoratif
        for (let i = 0; i < 5; i++) {
            const bx = xCuts[Math.floor(rng() * (xCuts.length - 2))];
            const by = yCuts[Math.floor(rng() * (yCuts.length - 2))];
            const bw = ((rng() > 0.5) ? (rng() * 100 + 20) : (xCuts[xCuts.indexOf(bx) + 1] - bx));
            const bh = ((rng() > 0.5) ? (rng() * 100 + 20) : (yCuts[yCuts.indexOf(by) + 1] - by));
            if (rng() > 0.3) ctx.fillRect(bx, by, bw, bh);
        }
    }

    if (showTextAnnotations) {
        ctx.textAlign = 'left';
        const maxAnnotations = Math.floor(15 * (density/100));
        let count = 0;

        // Auto Scaling Font Size berdasarkan lebar kanvas asli gambar
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
                
                ctx.font = `900 ${mainFont}px monospace`;
                ctx.fillText(word, x, y - spacing1);
                
                ctx.font = `${subFont}px monospace`;
                ctx.fillText(`${num}+`, x, y + spacing2);
                
                ctx.fillRect(x, y + spacing3, barWidth, barHeight);
                count++;
            }
        }
    }
  }, [image, rotation, seed, scale, complexity, density, stretchInt, brutalInt, stretchDirX, stretchDirY, showGridLines, showTextAnnotations, textColor]);

  useEffect(() => {
    drawCanvas();
    window.addEventListener('resize', drawCanvas);
    return () => window.removeEventListener('resize', drawCanvas);
  }, [drawCanvas]);


  return (
    <div 
      className="flex flex-col-reverse md:flex-row h-[100dvh] md:h-screen bg-gray-100 font-sans overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* PANEL KIRI (Kontrol UI) */}
      <div className="w-full md:w-[340px] h-[60dvh] md:h-full bg-white shadow-2xl flex flex-col z-10 overflow-y-auto border-t md:border-t-0 md:border-r border-gray-200 flex-shrink-0">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Alat Regang Kisi</h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">Slit-Scan Distorsi Lanjutan</p>
        </div>

        <div className="p-6 flex-1 flex flex-col space-y-7">
          
          {/* Operasi Gambar */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Operasi Gambar</h2>
            <button 
              onClick={() => fileInputRef.current.click()}
              className="w-full bg-black text-white py-3.5 rounded-lg font-semibold hover:bg-gray-800 transition shadow-lg active:scale-95"
            >
              Unggah Gambar
            </button>
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
            
            <div className="flex space-x-3">
              <button onClick={handleRotate} className="flex-1 bg-gray-100 text-sm py-2.5 rounded-md hover:bg-gray-200 transition text-gray-800 font-medium flex items-center justify-center gap-2">
                <span>↻</span> Putar 90°
              </button>
              <button onClick={handleRandomize} className="flex-1 bg-gray-100 text-sm py-2.5 rounded-md hover:bg-gray-200 transition text-gray-800 font-medium flex items-center justify-center gap-2">
                <span>🔀</span> Acak Tata Letak
              </button>
            </div>

            <div className="pt-2">
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
                    <span>Skala Gambar (Zoom)</span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-mono">{scale}%</span>
                </div>
                {/* Skala dirubah menjadi 10-100% untuk efek shrinking seperti di video */}
                <input type="range" min="10" max="100" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Mode AI */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mode Anotasi AI</h2>
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-md">
                {['EN', 'JP', 'ID'].map(lang => (
                    <button 
                      key={lang}
                      onClick={() => setAnnoLang(lang)}
                      className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${annoLang === lang ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {lang}
                    </button>
                ))}
              </div>
            </div>

            {/* Input API Key GitHub */}
            <div className="mb-3">
                <input 
                  type="password" 
                  placeholder="Masukkan Token GitHub (ghp_...)" 
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <a href="https://github.com/marketplace/models" target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline mt-1 inline-block">Dapatkan API Token GitHub di sini</a>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex-1 border border-gray-200 rounded-lg p-2.5 flex justify-between items-center bg-gray-50 shadow-sm">
                    <span className="text-sm font-semibold text-gray-700">Analisis Otomatis</span>
                    <span className="bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded-full">GITHUB MODELS</span>
                </div>
                <button 
                    onClick={handleAiAnalysis}
                    disabled={isAiAnalyzing || !image}
                    className={`text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-md flex items-center justify-center ${isAiAnalyzing || !image ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'}`}
                >
                    {isAiAnalyzing ? 'Memindai...' : 'Scan AI'}
                </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2 font-medium">Teks yang dihasilkan: <span className="text-blue-600 font-bold">{aiWords.length} kata</span> ({annoLang}).</p>
          </div>

          <hr className="border-gray-200" />

          {/* Parameter Kisi */}
          <div className="space-y-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Parameter Kisi (Grid)</h2>
            
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
                    <span>Kompleksitas Potongan (Cuts)</span>
                </div>
                <input type="range" min="10" max="100" value={complexity} onChange={(e) => setComplexity(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
            </div>

            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
                    <span>Kepadatan (Sedikit Celah Putih)</span>
                </div>
                <input type="range" min="10" max="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Opsi Regang Lanjutan */}
          <div className="space-y-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Opsi Peregangan (Slit-Scan)</h2>
            
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
                    <span>Intensitas Peregangan</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{stretchInt}%</span>
                </div>
                <input type="range" min="0" max="150" value={stretchInt} onChange={(e) => setStretchInt(Number(e.target.value))} className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>

            {/* TINGKAT BRUTAL */}
            <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
                    <span>Tingkat Distorsi (Brutal)</span>
                    <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">{brutalInt}%</span>
                </div>
                <input type="range" min="0" max="100" value={brutalInt} onChange={(e) => setBrutalInt(Number(e.target.value))} className="w-full h-1.5 bg-red-200 rounded-lg appearance-none cursor-pointer accent-red-600" />
                <p className="text-[10px] text-gray-400 mt-1">Mengontrol ketebalan tarikan & efek glitch.</p>
            </div>

            <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-semibold text-gray-700">Arah Regangan (Sumbu)</span>
                <div className="flex items-center space-x-1 text-[11px] font-mono font-bold text-gray-600 bg-gray-100 p-1 rounded-md border border-gray-200">
                    <button 
                        className={`px-3 py-1.5 rounded transition-all ${stretchDirX ? 'bg-white shadow-sm border border-gray-300 text-black' : 'text-gray-400 hover:bg-gray-200'}`}
                        onClick={() => setStretchDirX(!stretchDirX)}
                    >42H</button>
                    <span className="text-gray-300">/</span>
                    <button 
                        className={`px-3 py-1.5 rounded transition-all ${stretchDirY ? 'bg-white shadow-sm border border-gray-300 text-black' : 'text-gray-400 hover:bg-gray-200'}`}
                        onClick={() => setStretchDirY(!stretchDirY)}
                    >58V</button>
                </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Pengaturan Tampilan */}
          <div className="space-y-4">
             <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pengaturan Tampilan</h2>
             
             <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-semibold text-gray-700 group-hover:text-black transition">Tampilkan Garis Kisi & Balok</span>
                <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} className="w-4.5 h-4.5 accent-black cursor-pointer rounded" />
             </label>

             <div className="space-y-2">
                 <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-black transition">Tampilkan Teks (Anotasi)</span>
                    <input type="checkbox" checked={showTextAnnotations} onChange={(e) => setShowTextAnnotations(e.target.checked)} className="w-4.5 h-4.5 accent-black cursor-pointer rounded" />
                 </label>
                 
                 {/* Color Picker untuk Teks Anotasi */}
                 {showTextAnnotations && (
                     <div className="flex items-center justify-between pl-2 border-l-2 border-gray-200 ml-1">
                         <span className="text-xs font-medium text-gray-500">Warna Teks</span>
                         <input 
                            type="color" 
                            value={textColor} 
                            onChange={(e) => setTextColor(e.target.value)} 
                            className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                         />
                     </div>
                 )}
             </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
           <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Simpan & Ekspor</h2>
           <div className="flex space-x-3">
              <button onClick={() => handleExport('png')} className="flex-1 bg-black text-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 transition shadow-lg active:scale-95">Ekspor PNG</button>
              <button onClick={() => handleExport('jpg')} className="flex-1 border-2 border-gray-300 text-gray-700 bg-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 hover:border-gray-400 transition active:scale-95">Ekspor JPG</button>
           </div>
        </div>
      </div>

      {/* PANEL KANAN (Kanvas Workspace) */}
      <div className="flex-1 w-full h-[40dvh] md:h-full p-4 md:p-8 flex items-center justify-center bg-[#F3F4F6] relative overflow-hidden">
         
         {/* Overlay saat drag and drop */}
         {isDragging && (
           <div className="absolute inset-0 bg-blue-500 bg-opacity-20 z-50 flex items-center justify-center border-4 border-dashed border-blue-500 m-8 rounded-3xl pointer-events-none transition-all duration-200 backdrop-blur-sm">
             <div className="bg-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center transform scale-110">
               <span className="text-5xl mb-4">📥</span>
               <span className="text-2xl font-black text-gray-800">Lepaskan Gambar Di Sini</span>
               <span className="text-sm text-gray-500 mt-2 font-medium">Gambar akan langsung diproses</span>
             </div>
           </div>
         )}
         
         {/* Canvas Container: Mempertahankan responsivitas layar sekaligus menjaga gambar beresolusi super tinggi */}
         <div className="w-full h-full flex items-center justify-center">
            <canvas 
                ref={canvasRef} 
                className="shadow-2xl rounded-sm ring-1 ring-gray-900/5 transition-transform"
                style={{ 
                    maxWidth: '100%', 
                    maxHeight: '100%', 
                    width: 'auto', 
                    height: 'auto', 
                    objectFit: 'contain', 
                    imageRendering: brutalInt > 50 ? 'pixelated' : 'auto' 
                }}
            />
         </div>
      </div>
    </div>
  );
}