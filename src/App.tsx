import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCcw, CheckCircle, ChevronRight, Play, Image as ImageIcon, XCircle, FileType, Check, AlertCircle, Clock, Brain, ShieldCheck, Settings, Trash2, Flashlight, FlashlightOff, Grid3x3, Scan } from 'lucide-react';
import Webcam from 'react-webcam';
import { Client } from '@gradio/client';
import { motion, AnimatePresence } from 'motion/react';
import { scanDocument, Scanner } from 'scanic';

type AppState = 'landing' | 'setup1' | 'setup2' | 'camera' | 'review' | 'processing' | 'result';

interface ScoringResult {
  total: number;
  details: { type: string; score: number; notes?: string }[];
  raw?: string;
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [answerKey, setAnswerKey] = useState('');
  const [pointRules, setPointRules] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [showGuideline, setShowGuideline] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [captureMode, setCaptureMode] = useState<'auto' | 'manual'>('auto');

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableCountRef = useRef(0);
  const animationFrameRef = useRef<number>();
  const progressRef = useRef<HTMLDivElement>(null);
  const scannerFrameRef = useRef<HTMLDivElement>(null);
  const lastCaptureTimeRef = useRef(0);
  const capturePhotoRef = useRef<() => void>();

  const capturePhoto = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        // Prepare to autocrop
        const processImage = async () => {
          try {
            const img = new Image();
            img.src = imageSrc;
            await new Promise((resolve) => { img.onload = resolve; });
            
            const result = await scanDocument(img, { 
              mode: 'extract',
              output: 'canvas',
              maxProcessingDimension: 1920
            });
            
            if (result.success && result.output) {
              const canvas = result.output as HTMLCanvasElement;
              
              // Enhance text visibility (Grayscale & high contrast)
              const enhancedCanvas = document.createElement('canvas');
              enhancedCanvas.width = canvas.width;
              enhancedCanvas.height = canvas.height;
              const ctx = enhancedCanvas.getContext('2d');
              
              if (ctx) {
                // Apply a softer filter to avoid washing out text while remaining clear
                ctx.filter = 'grayscale(100%) contrast(120%) brightness(105%)';
                ctx.drawImage(canvas, 0, 0);
                // Use maximum quality
                const croppedSrc = enhancedCanvas.toDataURL("image/jpeg", 1.0);
                setPhotos(prev => [...prev, croppedSrc]);
              } else {
                const croppedSrc = canvas.toDataURL("image/jpeg", 1.0);
                setPhotos(prev => [...prev, croppedSrc]);
              }
              return;
            }
          } catch (err) {
            console.error("Autocrop error:", err);
          }
          // Fallback to uncropped
          setPhotos(prev => [...prev, imageSrc]);
        };
        
        processImage();
      }
    }
  }, [webcamRef]);

  useEffect(() => {
    capturePhotoRef.current = capturePhoto;
  }, [capturePhoto]);

  useEffect(() => {
    let fastScanner: any = null;
    let isActive = true;

    const initScanner = async () => {
       try {
          fastScanner = new Scanner();
          await fastScanner.initialize();
       } catch (e) {
          console.error("Scanner init error", e);
       }
    };

    if (appState === 'camera' && captureMode === 'auto') {
      initScanner();
      
      const checkStability = async () => {
        if (!isActive) return;

        const now = Date.now();
        if (now - lastCaptureTimeRef.current < 2500) {
          stableCountRef.current = 0;
          if (progressRef.current) progressRef.current.style.width = '0%';
          if (scannerFrameRef.current) {
             scannerFrameRef.current.style.borderColor = 'rgba(255,255,255,0.3)';
             scannerFrameRef.current.style.transform = 'scale(1)';
             scannerFrameRef.current.style.backgroundColor = 'transparent';
          }
          animationFrameRef.current = window.setTimeout(checkStability, 100) as unknown as number;
          return;
        }

        if (!webcamRef.current || !webcamRef.current.video || !canvasRef.current) {
          animationFrameRef.current = window.setTimeout(checkStability, 100) as unknown as number;
          return;
        }

        const video = webcamRef.current.video;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        let shouldScheduleNext = true;

        if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(video, 0, 0, 320, 240);
          
          let paperDetected = false;
          
          if (fastScanner) {
             try {
                const result = await fastScanner.scan(canvas, { mode: 'detect', maxProcessingDimension: 320 });
                if (result.success) {
                  paperDetected = true;
                }
             } catch (e) {
                // Ignore scanner errors during processing
             }
          } else {
             // Fallback
             paperDetected = true;
          }

          if (!isActive) return;

          const imageData = ctx.getImageData(0, 0, 320, 240);
          const data = imageData.data;
          
          if (prevFrameRef.current && paperDetected) {
            let diff = 0;
            const step = 16; 
            for (let i = 0; i < data.length; i += step) {
              diff += Math.abs(data[i] - prevFrameRef.current[i]) + 
                      Math.abs(data[i+1] - prevFrameRef.current[i+1]) + 
                      Math.abs(data[i+2] - prevFrameRef.current[i+2]);
            }
            
            const avgDiff = diff / (data.length / step);
            // Lower difference = more stable
            if (avgDiff < 50) { 
              stableCountRef.current += 1;
            } else {
              stableCountRef.current = Math.max(0, stableCountRef.current - 5);
            }
          } else if (!paperDetected) {
             stableCountRef.current = Math.max(0, stableCountRef.current - 10);
          }
          
          prevFrameRef.current = new Uint8ClampedArray(data);

          // Update UI
          const maxFrames = 15; 
          const progress = Math.min(stableCountRef.current / maxFrames, 1);

          if (progressRef.current) {
             progressRef.current.style.width = `${progress * 100}%`;
          }
          if (scannerFrameRef.current) {
             if (progress > 0.6) {
                scannerFrameRef.current.style.borderColor = 'rgba(34, 197, 94, 0.9)'; // Green
                scannerFrameRef.current.style.transform = 'scale(0.96)';
                scannerFrameRef.current.style.backgroundColor = 'rgba(34, 197, 94, 0.05)';
             } else if (paperDetected) {
                scannerFrameRef.current.style.borderColor = 'rgba(59, 130, 246, 0.8)'; // Blue when paper detected
                scannerFrameRef.current.style.transform = 'scale(1)';
                scannerFrameRef.current.style.backgroundColor = 'transparent';
             } else {
                scannerFrameRef.current.style.borderColor = 'rgba(255,255,255,0.4)';
                scannerFrameRef.current.style.transform = 'scale(1)';
                scannerFrameRef.current.style.backgroundColor = 'transparent';
             }
          }

          if (progress >= 1) {
            if (capturePhotoRef.current) {
               capturePhotoRef.current();
            }
            lastCaptureTimeRef.current = Date.now();
            stableCountRef.current = 0;
            // Wait slightly longer after capture
            animationFrameRef.current = window.setTimeout(checkStability, 1000) as unknown as number;
            shouldScheduleNext = false;
          }
        }
        
        if (shouldScheduleNext && isActive) {
            animationFrameRef.current = window.setTimeout(checkStability, 100) as unknown as number;
        }
      };
      
      checkStability();
    } else {
      stableCountRef.current = 0;
      if (progressRef.current) progressRef.current.style.width = '0%';
      if (scannerFrameRef.current) {
         scannerFrameRef.current.style.borderColor = 'rgba(255,255,255,0.4)';
         scannerFrameRef.current.style.transform = 'scale(1)';
         scannerFrameRef.current.style.backgroundColor = 'transparent';
      }
    }

    return () => {
      isActive = false;
      if (animationFrameRef.current) clearTimeout(animationFrameRef.current);
    };
  }, [appState, captureMode]);
  const toggleFlashlight = async () => {
    if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.srcObject) {
      const stream = webcamRef.current.video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities && track.getCapabilities();
          if (capabilities && (capabilities as any).torch) {
            await track.applyConstraints({
              advanced: [{ torch: !flashlightOn }]
            } as any);
            setFlashlightOn(!flashlightOn);
          } else {
             alert('Fitur senter (Flashlight) tidak didukung pada browser/perangkat ini.');
          }
        } catch (err) {
          console.error("Flashlight error", err);
          alert('Gagal menyalakan senter.');
        }
      }
    }
  };

  const handleStartApp = async () => {
    setIsStarting(true);
    try {
      // Meminta izin kamera sesegera mungkin di landing page
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        // Segera hentikan akses kamera setelah izin didapat untuk sementara
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (error) {
      console.error('Camera permission error:', error);
      alert('Izin kamera diperlukan untuk memindai lembar jawaban. Mohon izinkan akses kamera pada browser Anda agar aplikasi dapat berfungsi optimal.');
    } finally {
      setIsStarting(false);
      setAppState('setup1');
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotos(prev => {
      const newPhotos = prev.filter((_, index) => index !== indexToRemove);
      if (newPhotos.length === 0) {
        setAppState('camera');
      }
      return newPhotos;
    });
  };

  const processScoring = async () => {
    setAppState('processing');
    setErrorMessage('');
    
    try {
      console.log('Connecting to Gradio Space...');
      const client = await Client.connect("GanymedeNil/Qwen2-VL-7B");
      
      const res = await fetch(photos[0]);
      const imageBlob = await res.blob();

      // Tahap 1: Validasi Gambar
      const validationPrompt = "identifikasi foto ini, apakah benar foto lembar kerja siswa atau bukan. balas true jika benar dan false jika salah";
      
      console.log('Sending validation request...');
      const validationResponse = await client.predict("/run_example", [
        imageBlob,
        validationPrompt,
        "Qwen/Qwen2-VL-7B-Instruct"
      ]);

      const validationText = Array.isArray(validationResponse.data) ? validationResponse.data[0] : String(validationResponse.data);
      console.log('Validation Response:', validationText);

      if (!validationText.toLowerCase().includes('true')) {
         throw new Error("Gambar tidak terdeteksi sebagai lembar jawaban ujian siswa. Pastikan Anda memfoto kertas lembar jawaban ujian.");
      }

      // Tahap 2: Penilaian
      const prompt = `Anda adalah asisten penilai ujian otomatis (Panbit Automated Scoring System).
Kunci Jawaban yang tersedia:
${answerKey}

Aturan Poin:
${pointRules}

Tugas Anda:
1. BACA JAWABAN: Jika gambar dianggap valid, baca jawaban siswa.
2. PENILAIAN: Cocokkan jawaban siswa dengan Kunci Jawaban. HANYA nilai bagian yang kunci jawabannya disediakan (contoh: jika di kunci jawaban hanya ada Pilihan Ganda, JANGAN berikan nilai untuk Essay). Jika teks pada gambar sama sekali tidak relevan dengan kunci jawaban, berikan skor 0.
3. HITUNG SKOR: Hitung total skor berdasarkan Aturan Poin.
4. FORMAT OUTPUT: Jawab HANYA menggunakan format JSON valid seperti berikut, tanpa teks tambahan di luar JSON.

Contoh format sukses:
{
  "total": 85,
  "details": [
    { "type": "Pilihan Ganda", "score": 85, "notes": "Benar 17 dari 20" }
  ]
}`;

      console.log('Sending predict request...');
      
      const response = await client.predict("/run_example", [
        imageBlob, // image
        prompt, // text_input
        "Qwen/Qwen2-VL-7B-Instruct" // model_id
      ]);

      console.log('Response:', response);
      
      const rawText = Array.isArray(response.data) ? response.data[0] : JSON.stringify(response.data);
      
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         const parsed = JSON.parse(jsonMatch[0]);
         if (parsed.error) {
           throw new Error(parsed.error);
         }
         setScoringResult(parsed);
         setAppState('result');
      } else {
         throw new Error("Format output dari AI tidak sesuai (tidak ada JSON yang terdeteksi). AI mungkin gagal memproses gambar.");
      }
      
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || 'Terjadi kesalahan saat memproses penilaian.');
    }
  };

  const handleNextStudent = () => {
    setPhotos([]);
    setScoringResult(null);
    setAppState('camera');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-800">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative overflow-hidden flex flex-col">
        {/* LANDING PAGE */}
        <AnimatePresence>
          {appState === 'landing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 bg-white flex flex-col z-50 overflow-y-auto"
            >
              <div className="p-6 pb-2">
                <div className="flex items-center space-x-2 text-blue-600 font-bold text-xl mb-4">
                  <CheckCircle className="w-6 h-6" />
                  <span>Panbit</span>
                </div>
              </div>

              <div className="px-6 flex-1 flex flex-col justify-center mb-8">
                <div className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full mb-6 w-max">
                  Powered by Qwen2-VL AI
                </div>
                <h1 className="text-4xl font-extrabold text-slate-900 leading-tight mb-4">
                  Penilaian Ujian <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Otomatis & Cerdas</span>
                </h1>
                <p className="text-slate-500 mb-10 leading-relaxed text-sm">
                  Tinggalkan cara manual. Evaluasi puluhan lembar jawaban siswa dalam hitungan detik menggunakan teknologi AI Vision tercanggih.
                </p>

                <div className="space-y-6 mb-10">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-50 flex items-center justify-center rounded-xl mr-4">
                      <Clock className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Hemat Waktu Penilaian</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">Periksa puluhan hasil ujian sekilas pandang tanpa harus mengecek satu per satu secara manual.</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 flex items-center justify-center rounded-xl mr-4">
                      <Brain className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Akurat & Terstruktur</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">Pilihan Ganda dan Essay dapat dinilai secara presisi langsung dari hasil jepretan kamera.</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-12 h-12 bg-emerald-50 flex items-center justify-center rounded-xl mr-4">
                      <ShieldCheck className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Aturan Fleksibel</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">Sesuaikan format nilai, bobot, dan kunci jawaban mandiri sesuai standar kurikulum Anda.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white sticky bottom-0 z-10 border-t border-slate-100 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.05)]">
                <button
                  onClick={handleStartApp}
                  disabled={isStarting}
                  className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-200/50"
                >
                  {isStarting ? (
                    <RefreshCcw className="animate-spin w-5 h-5 mx-auto" />
                  ) : (
                    <>
                      <span>Mulai Menilai Sekarang</span>
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-slate-400 mt-5 font-medium">&copy; {new Date().getFullYear()} TU PANBIT. All rights reserved.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* APP HEADER */}
        {appState !== 'landing' && appState !== 'camera' && (
          <header className="bg-white px-6 py-4 flex items-center border-b border-slate-100 z-20 shrink-0">
            <CheckCircle className="w-6 h-6 text-blue-600 mr-2" />
            <h1 className="font-bold text-slate-900 text-lg tracking-tight flex-1">
              Panbit <span className="font-normal text-slate-500 text-sm">Automated Scoring</span>
            </h1>
          </header>
        )}

        {/* SETUP PROGRESS BAR (shows during setup steps) */}
        {(appState === 'setup1' || appState === 'setup2') && (
          <div className="px-6 pt-5 pb-4 bg-white border-b border-slate-100 shrink-0 z-10">
             <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Persiapan Penilaian</span>
                <span className="text-xs font-medium text-blue-600">Langkah {appState === 'setup1' ? '1' : '2'} / 2</span>
             </div>
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: appState === 'setup1' ? '0%' : '50%' }}
                  animate={{ width: appState === 'setup1' ? '50%' : '100%' }}
                  transition={{ duration: 0.3 }}
                  className="bg-blue-600 h-full"
                ></motion.div>
             </div>
          </div>
        )}

        {/* SETUP 1: ANSWER KEY */}
        {appState === 'setup1' && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col p-6"
          >
            <h2 className="text-xl font-bold mb-4 flex items-center text-slate-800">
              <FileType className="mr-2 text-blue-500" size={24} />
              Answer Key
            </h2>
            <p className="text-sm text-slate-500 mb-4">Masukkan kunci jawaban untuk soal Pilihan Ganda (PG) dan Essay.</p>
            <textarea
              className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-slate-400"
              placeholder="Contoh:&#10;PG: 1. A, 2. B, 3. C&#10;Essay: 1. Karena proses fotosintesis... "
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
            />
            <button 
              onClick={() => setAppState('setup2')}
              disabled={!answerKey.trim()}
              className="mt-6 w-full bg-blue-600 text-white font-medium py-3.5 rounded-xl disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700 transition flex items-center justify-center space-x-2"
            >
              <span>Lanjut ke Aturan Poin</span>
              <ChevronRight size={18} />
            </button>
          </motion.div>
        )}

        {/* SETUP 2: POINT RULES */}
        {appState === 'setup2' && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col p-6"
          >
            <h2 className="text-xl font-bold mb-4 flex items-center text-slate-800">
              <CheckCircle className="mr-2 text-blue-500" size={24} />
              Point Rule
            </h2>
            <p className="text-sm text-slate-500 mb-4">Tetapkan aturan poin untuk masing-masing jenis soal.</p>
            <textarea
              className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-slate-400"
              placeholder="Contoh:&#10;PG: Bener = 5, Salah = 0&#10;Essay: Bobot maksimal 20 per soal"
              value={pointRules}
              onChange={(e) => setPointRules(e.target.value)}
            />
            <div className="flex space-x-3 mt-6">
              <button 
                onClick={() => setAppState('setup1')}
                className="w-1/3 bg-slate-100 text-slate-600 font-medium py-3.5 rounded-xl hover:bg-slate-200 transition"
              >
                Kembali
              </button>
              <button 
                onClick={() => setAppState('camera')}
                disabled={!pointRules.trim()}
                className="w-2/3 bg-blue-600 text-white font-medium py-3.5 rounded-xl disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700 transition flex items-center justify-center space-x-2"
              >
                <span>Mulai Kamera</span>
                <Camera size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {/* CAMERA VIEW */}
        {appState === 'camera' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black z-50 flex flex-col"
          >
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10">
              <button 
                onClick={() => setCaptureMode('manual')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${captureMode === 'manual' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
              >
                Manual
              </button>
              <button 
                onClick={() => setCaptureMode('auto')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${captureMode === 'auto' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'}`}
              >
                Auto Scan
              </button>
            </div>

            <div className="absolute top-4 right-4 z-20 flex flex-col space-y-3">
              <button 
                onClick={() => setShowGuideline(!showGuideline)}
                className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 transition shadow-lg ${showGuideline ? 'bg-blue-600 text-white' : 'bg-black/50 text-white/80'}`}
                title="Toggles Guideline"
              >
                <Grid3x3 size={20} />
              </button>
              <button 
                onClick={toggleFlashlight}
                className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 transition shadow-lg ${flashlightOn ? 'bg-amber-500 text-white border-amber-400' : 'bg-black/50 text-white/80'}`}
                title="Toggle Flashlight"
              >
                {flashlightOn ? <Flashlight size={20} /> : <FlashlightOff size={20} />}
              </button>
            </div>
            
            <div className="absolute inset-0 overflow-hidden">
              {/* @ts-ignore - react-webcam types are sometimes strict */}
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                screenshotQuality={1}
                forceScreenshotSourceSize={true}
                videoConstraints={{ 
                  facingMode: "environment",
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                }}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {captureMode === 'auto' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8 pb-32 z-10">
                  <div 
                    ref={scannerFrameRef}
                    className="w-full h-full max-h-[60vh] border-2 border-white/40 rounded-2xl relative transition-all duration-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] flex flex-col"
                  >
                     <div className="absolute top-3 left-3 text-white/90 text-xs font-semibold bg-black/50 px-2.5 py-1 rounded-md backdrop-blur-md flex items-center space-x-1.5 border border-white/10">
                       <Scan size={14} />
                       <span>Mencari Dokumen...</span>
                     </div>
                     <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl"></div>
                     <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl"></div>
                     <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl"></div>
                     <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl"></div>
                     
                     <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-40 h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                       <div ref={progressRef} className="h-full w-0 bg-emerald-500 transition-all duration-75"></div>
                     </div>
                  </div>
                </div>
              )}

              {showGuideline && (
                 <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8 pb-32 z-10">
                   <div className="w-full h-full max-h-[60vh] border-2 border-white/40 border-dashed rounded-xl relative flex flex-col shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]">
                     {/* 3x3 Grid Lines */}
                     <div className="flex-1 border-b border-white/20"></div>
                     <div className="flex-1 border-b border-white/20"></div>
                     <div className="flex-1"></div>
                     
                     <div className="absolute inset-0 flex">
                       <div className="flex-1 border-r border-white/20"></div>
                       <div className="flex-1 border-r border-white/20"></div>
                       <div className="flex-1"></div>
                     </div>
                     
                     <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white/50 text-xs font-semibold tracking-widest uppercase bg-black/40 px-3 py-1 rounded backdrop-blur-sm">Sejajarkan Dokumen</span>
                     </div>
                   </div>
                 </div>
              )}
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pb-10 pt-16 px-6 flex items-center justify-between z-20">
              <div className="w-16 relative">
                 {/* Thumbnail Button */}
                 {photos.length > 0 ? (
                   <button 
                     onClick={() => setAppState('review')}
                     className="w-14 h-14 rounded-full border-2 border-white/30 overflow-hidden relative"
                   >
                     <img src={photos[photos.length - 1]} alt="thumb" className="w-full h-full object-cover" />
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{photos.length}</span>
                     </div>
                   </button>
                 ) : (
                   <div className="w-14 h-14" />
                 )}
              </div>
              
              <button 
                onClick={capturePhoto}
                className="w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 bg-white rounded-full"></div>
              </button>
              
              <div className="w-16 flex justify-end">
                 <button 
                   onClick={() => setAppState('setup1')}
                   className="w-14 h-14 rounded-full bg-black/40 border-2 border-white/30 text-white flex items-center justify-center backdrop-blur-md"
                 >
                   <Settings size={24} />
                 </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* REVIEW PHOTOS */}
        {appState === 'review' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col bg-slate-50 relative z-30"
          >
            <div className="p-4 bg-white flex items-center justify-between border-b border-slate-100 shadow-sm z-10">
              <button 
                onClick={() => setAppState('camera')}
                className="text-blue-600 px-2 py-1 font-medium text-sm"
              >
                Tambah Foto
              </button>
              <span className="font-semibold text-slate-800">Afirmasi Dokumen</span>
              <div className="w-[85px]"></div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <h3 className="text-sm font-medium text-slate-500 mb-2">Foto yang diambil ({photos.length})</h3>
              {photos.map((photo, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative group">
                   <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-md">Hal {idx + 1}</div>
                   <button 
                     onClick={() => handleRemovePhoto(idx)}
                     className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full backdrop-blur-md transition"
                     title="Hapus foto ini"
                   >
                     <Trash2 size={16} />
                   </button>
                   <img src={photo} alt={`Document ${idx}`} className="w-full h-auto object-contain max-h-[300px] bg-slate-100" />
                </div>
              ))}
            </div>

            <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
               <button 
                  onClick={processScoring}
                  className="w-full bg-blue-600 text-white font-medium py-4 rounded-xl hover:bg-blue-700 transition flex justify-center items-center space-x-2 text-lg shadow-lg shadow-blue-200"
               >
                 <span>Nilai Sekarang</span>
                 <Play size={20} className="fill-white" />
               </button>
            </div>
          </motion.div>
        )}

        {/* PROCESSING STATUS */}
        {appState === 'processing' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50"
          >
            {!errorMessage ? (
              <div className="w-24 h-24 mb-6 relative">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-blue-600">
                  <RefreshCcw size={32} />
                </div>
              </div>
            ) : (
              <div className="w-24 h-24 mb-6 relative flex items-center justify-center text-amber-500">
                <XCircle size={64} />
              </div>
            )}

            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {errorMessage ? 'Penilaian Gagal' : 'Sedang memproses penilaian..'}
            </h2>
            <p className="text-slate-500 text-center text-sm max-w-xs">
              {errorMessage ? 'Silakan periksa kembali foto yang Anda ambil dan coba lagi.' : 'AI sedang menganalisis dokumen dan mencocokkan dengan kunci jawaban & aturan Anda.'}
            </p>
            
            {errorMessage && (
              <div className="w-full max-w-sm flex flex-col mt-8">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-start space-x-3 mb-6">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{errorMessage}</p>
                </div>
                <button 
                  onClick={() => {
                    setPhotos([]);
                    setAppState('camera');
                  }}
                  className="w-full bg-slate-800 text-white font-medium py-3.5 rounded-xl hover:bg-slate-900 transition shadow-lg flex items-center justify-center space-x-2"
                >
                  <span>Kembali ke Kamera</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* SCORING RESULT */}
        {appState === 'result' && scoringResult && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col bg-slate-50"
          >
            <div className="bg-blue-600 text-white p-6 pt-10 pb-8 flex flex-col items-center text-center rounded-b-[40px] shadow-lg mb-6">
               <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-md">
                 <Check size={32} className="text-white" />
               </div>
               <p className="text-blue-100 font-medium tracking-wide text-sm uppercase mb-1">Nilai Total</p>
               <h2 className="text-6xl font-bold tracking-tight mb-2">{scoringResult.total}</h2>
               <p className="text-blue-100/80 text-sm max-w-[200px]">Gabungan dari seluruh jenis soal</p>
            </div>
            
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
               <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Rincian Penilaian</h3>
               <div className="space-y-4">
                 {scoringResult.details.map((detail, idx) => (
                   <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                     <div className="flex justify-between items-center mb-2">
                       <h4 className="font-bold text-slate-800">{detail.type}</h4>
                       <span className="text-xl font-bold text-blue-600">{detail.score}</span>
                     </div>
                     {detail.notes && (
                       <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 mt-3">
                         {detail.notes}
                       </p>
                     )}
                   </div>
                 ))}
               </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-100 mt-auto">
               <button 
                  onClick={handleNextStudent}
                  className="w-full bg-slate-800 text-white font-medium py-4 rounded-xl hover:bg-slate-900 transition shadow-lg shadow-slate-200/50"
               >
                 Nilai Siswa Berikutnya
               </button>
            </div>
          </motion.div>
        )}

        {/* GLOBAL APP FOOTER */}
        {appState !== 'landing' && appState !== 'camera' && (
          <footer className="bg-slate-50 py-4 shrink-0 border-t border-slate-200 z-10 mt-auto">
            <p className="text-center text-xs text-slate-400 font-medium">&copy; {new Date().getFullYear()} TU PANBIT. All rights reserved.</p>
          </footer>
        )}
      </div>
    </div>
  );
}
