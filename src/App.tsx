import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCcw, CheckCircle, ChevronRight, Play, Image as ImageIcon, XCircle, FileType, Check, AlertCircle, Clock, Brain, ShieldCheck, Settings, Trash2, Flashlight, FlashlightOff, Grid3x3, Scan, Search, Download } from 'lucide-react';
import Webcam from 'react-webcam';
import { Client } from '@gradio/client';
import { motion, AnimatePresence } from 'motion/react';
import { scanDocument, Scanner } from 'scanic';

type AppState = 'landing' | 'setup1' | 'setup2' | 'camera' | 'review' | 'processing' | 'result' | 'history';

interface ScoringResult {
  studentName: string;
  studentClass: string;
  total: number;
  details: { type: string; score: number; notes?: string }[];
  raw?: string;
}

interface SavedScoring {
  id: string;
  studentName: string;
  studentClass: string;
  total: number;
  details: { type: string; score: number; notes?: string }[];
  photos: string[];
  gradedAt: string;
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [answerKey, setAnswerKey] = useState('');
  const [pointRules, setPointRules] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [showGuideline, setShowGuideline] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [captureMode, setCaptureMode] = useState<'auto' | 'manual'>('auto');

  const [savedScorings, setSavedScorings] = useState<SavedScoring[]>(() => {
    const saved = localStorage.getItem('panbit_scorings');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState('Semua Kelas');
  const [searchNameFilter, setSearchNameFilter] = useState('');

  useEffect(() => {
    localStorage.setItem('panbit_scorings', JSON.stringify(savedScorings));
  }, [savedScorings]);

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
        // Just apply enhancements to the captured frame, do not autocrop
        const processImage = async () => {
          try {
            const img = new Image();
            img.src = imageSrc;
            await new Promise((resolve) => { img.onload = resolve; });
            
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = img.width;
            finalCanvas.height = img.height;
            const ctx = finalCanvas.getContext('2d');
            if (ctx) ctx.drawImage(img, 0, 0);
            
            // Enhance text visibility (Grayscale & high contrast)
            const enhancedCanvas = document.createElement('canvas');
            enhancedCanvas.width = finalCanvas.width;
            enhancedCanvas.height = finalCanvas.height;
            const eCtx = enhancedCanvas.getContext('2d');
            
            if (eCtx) {
              // Apply a softer filter to avoid washing out text while remaining clear
              eCtx.filter = 'grayscale(100%) contrast(120%) brightness(105%)';
              eCtx.drawImage(finalCanvas, 0, 0);
              // Use maximum quality
              const outputSrc = enhancedCanvas.toDataURL("image/jpeg", 1.0);
              setPhotos(prev => [...prev, outputSrc]);
            } else {
              const outputSrc = finalCanvas.toDataURL("image/jpeg", 1.0);
              setPhotos(prev => [...prev, outputSrc]);
            }
          } catch (err) {
            console.error("Processing error:", err);
            // Fallback to uncropped raw if everything else fails
            setPhotos(prev => [...prev, imageSrc]);
          }
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

      const valLower = validationText.toLowerCase();
      
      // Deteksi kata kunci positif untuk menghindari false negative
      const containsPositive = 
        valLower.includes('true') || 
        valLower.includes('yes') || 
        valLower.includes('ya') || 
        valLower.includes('benar') || 
        valLower.includes('betul') || 
        valLower.includes('kertas') || 
        valLower.includes('dokumen') || 
        valLower.includes('lembar') || 
        valLower.includes('jawaban') || 
        valLower.includes('tulis') || 
        valLower.includes('text') || 
        valLower.includes('teks') || 
        valLower.includes('work') ||
        valLower.includes('sheet');
        
      const containsNegative = 
        valLower.includes('false') || 
        valLower.includes('bukan') || 
        valLower.includes('salah') || 
        valLower.includes('tidak');

      // Valid jika ada konfirmasi positif, ATAU jika tidak secara eksplisit ditolak dengan kata kunci negatif
      const isDocument = containsPositive || !containsNegative;

      if (!isDocument) {
         throw new Error("Gambar tidak terdeteksi sebagai lembar jawaban ujian siswa. Pastikan Anda memfoto kertas lembar jawaban ujian.");
      }

      // Tahap 2: Penilaian
      const prompt = `Anda adalah asisten penilai ujian otomatis (Panbit Automated Scoring System).
Kunci Jawaban yang tersedia:
${answerKey}

Aturan Poin:
${pointRules}

Tugas Anda:
1. IDENTITAS SISWA: Cari dan baca Nama Siswa dan Kelas yang tertulis di lembar jawaban. Jika tidak ditemukan atau tidak terbaca jelas, isikan "Tidak Diketahui" untuk Nama dan tebak/pilih Kelas yang paling relevan (misal: "9A", "Umum").
2. BACA JAWABAN: Baca jawaban siswa di dokumen.
3. PENILAIAN: Cocokkan jawaban siswa dengan Kunci Jawaban. HANYA nilai bagian yang kunci jawabannya disediakan (contoh: jika di kunci jawaban hanya ada Pilihan Ganda, JANGAN berikan nilai untuk Essay). Jika teks pada gambar sama sekali tidak relevan dengan kunci jawaban, berikan skor 0.
4. HITUNG SKOR: Hitung total skor berdasarkan Aturan Poin.
5. FORMAT OUTPUT: Jawab HANYA menggunakan format JSON valid seperti berikut, tanpa teks tambahan di luar JSON.

Contoh format sukses:
{
  "studentName": "Ahmad Dani",
  "studentClass": "9A",
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
         
         const sName = parsed.studentName || 'Tidak Diketahui';
         const sClass = parsed.studentClass || 'Umum';
         
         const newResult: ScoringResult = {
           studentName: sName,
           studentClass: sClass,
           total: parsed.total ?? 0,
           details: parsed.details || []
         };
         
         setScoringResult(newResult);
         
         const newId = Date.now().toString();
         setCurrentSavedId(newId);
         
         const newSaved: SavedScoring = {
            id: newId,
            studentName: sName,
            studentClass: sClass,
            total: parsed.total ?? 0,
            details: parsed.details || [],
            photos: [...photos],
            gradedAt: new Date().toLocaleDateString('id-ID', {
               day: 'numeric',
               month: 'short',
               year: 'numeric',
               hour: '2-digit',
               minute: '2-digit'
            })
         };
         
         setSavedScorings(prev => {
           const updated = [newSaved, ...prev];
           localStorage.setItem('panbit_scorings', JSON.stringify(updated));
           return updated;
         });
         
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

  const handleUpdateCurrentStudent = (name: string, sClass: string) => {
    if (scoringResult) {
       setScoringResult(prev => prev ? { ...prev, studentName: name, studentClass: sClass } : null);
    }
    if (currentSavedId) {
       setSavedScorings(prev => prev.map(item => item.id === currentSavedId ? { ...item, studentName: name, studentClass: sClass } : item));
    }
  };

  const handleRetryScoring = (item: SavedScoring) => {
    if (item.photos && item.photos.length > 0) {
      setPhotos([...item.photos]);
      setAppState('review');
    } else {
      setPhotos([]);
      setAppState('camera');
    }
    setSavedScorings(prev => prev.filter(s => s.id !== item.id));
  };

  const handleDeleteSaved = (id: string) => {
    setSavedScorings(prev => prev.filter(item => item.id !== id));
  };

  const exportToExcel = () => {
    if (savedScorings.length === 0) {
      alert("Belum ada data penilaian untuk diekspor!");
      return;
    }
    
    // Tab-separated text which Excel opens cleanly by default
    let content = "No\tNama Siswa\tKelas\tNilai Total\tRincian Nilai\tTanggal Dinilai\n";
    savedScorings.forEach((item, index) => {
      const detailsStr = item.details.map(d => `${d.type}: ${d.score} (${d.notes || ''})`).join('; ');
      content += `${index + 1}\t${item.studentName}\t${item.studentClass}\t${item.total}\t${detailsStr}\t${item.gradedAt}\n`;
    });
    
    const blob = new Blob(["\uFEFF" + content], { type: 'text/xls;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Daftar_Penilaian_Siswa_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 lg:bg-slate-200 lg:p-6 xl:p-12 flex items-center justify-center font-sans text-slate-800">
      <div className={`w-full mx-auto bg-white min-h-screen lg:min-h-0 lg:h-[90vh] relative overflow-hidden flex flex-col shadow-none lg:shadow-2xl lg:rounded-[2rem] ${appState === 'landing' ? 'max-w-6xl' : 'max-w-7xl'}`}>
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

              <div className="px-6 md:px-12 lg:px-20 flex-1 flex flex-col justify-center mb-8 max-w-4xl mx-auto w-full">
                <div className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-xs md:text-sm font-semibold rounded-full mb-6 w-max">
                  Powered by Qwen2-VL AI
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-4">
                  Penilaian Ujian <br className="md:hidden" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Otomatis & Cerdas</span>
                </h1>
                <p className="text-slate-500 mb-10 leading-relaxed text-sm md:text-base max-w-2xl">
                  Tinggalkan cara manual. Evaluasi puluhan lembar jawaban siswa dalam hitungan detik menggunakan teknologi AI Vision tercanggih.
                </p>

                <div className="space-y-6 mb-10">
                  <div className="flex items-start md:items-center">
                    <div className="flex-shrink-0 w-12 h-12 md:w-16 md:h-16 bg-blue-50 flex items-center justify-center rounded-xl mr-4 md:mr-6">
                      <Clock className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-slate-900">Hemat Waktu Penilaian</h3>
                      <p className="text-xs md:text-sm text-slate-500 mt-1 leading-relaxed max-w-md">Periksa puluhan hasil ujian sekilas pandang tanpa harus mengecek satu per satu secara manual.</p>
                    </div>
                  </div>
                  <div className="flex items-start md:items-center">
                    <div className="flex-shrink-0 w-12 h-12 md:w-16 md:h-16 bg-indigo-50 flex items-center justify-center rounded-xl mr-4 md:mr-6">
                      <Brain className="w-6 h-6 md:w-8 md:h-8 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-slate-900">Akurat & Terstruktur</h3>
                      <p className="text-xs md:text-sm text-slate-500 mt-1 leading-relaxed max-w-md">Pilihan Ganda dan Essay dapat dinilai secara presisi langsung dari hasil jepretan kamera.</p>
                    </div>
                  </div>
                  <div className="flex items-start md:items-center">
                    <div className="flex-shrink-0 w-12 h-12 md:w-16 md:h-16 bg-emerald-50 flex items-center justify-center rounded-xl mr-4 md:mr-6">
                      <ShieldCheck className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-slate-900">Aturan Fleksibel</h3>
                      <p className="text-xs md:text-sm text-slate-500 mt-1 leading-relaxed max-w-md">Sesuaikan format nilai, bobot, dan kunci jawaban mandiri sesuai standar kurikulum Anda.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 md:px-12 lg:px-20 bg-white sticky bottom-0 z-10 border-t border-slate-100 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.05)]">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-2xl mx-auto">
                  <button
                    onClick={handleStartApp}
                    disabled={isStarting}
                    className="w-full bg-blue-600 text-white font-semibold py-4 md:py-5 rounded-xl md:rounded-2xl hover:bg-blue-700 disabled:bg-blue-400 transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-200/50 text-base md:text-lg"
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
                  {savedScorings.length > 0 && (
                    <button
                      onClick={() => setAppState('history')}
                      className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold py-4 md:py-5 rounded-xl md:rounded-2xl hover:bg-slate-200 transition flex items-center justify-center space-x-2 text-base md:text-lg"
                    >
                      <span>Lihat Riwayat ({savedScorings.length})</span>
                    </button>
                  )}
                </div>
                <p className="text-center text-xs text-slate-400 mt-5 font-medium">&copy; {new Date().getFullYear()} TU PANBIT. All rights reserved.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* APP HEADER */}
        {appState !== 'landing' && appState !== 'camera' && (
          <header className="bg-white px-6 md:px-10 lg:px-12 py-4 md:py-6 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 z-20 shrink-0 gap-3">
            <div className="flex items-center">
              <CheckCircle className="w-6 h-6 md:w-8 md:h-8 text-blue-600 mr-2 md:mr-3" />
              <h1 className="font-bold text-slate-900 text-lg md:text-xl tracking-tight">
                Panbit <span className="font-normal text-slate-500 text-sm md:text-base">Automated Scoring</span>
              </h1>
            </div>
            
            <div className="flex items-center space-x-2 self-end sm:self-auto">
              <button 
                onClick={() => setAppState('setup1')}
                className={`text-xs md:text-sm font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-xl transition ${appState === 'setup1' || appState === 'setup2' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Atur Ujian
              </button>
              <button 
                onClick={() => {
                  if (photos.length > 0) {
                    setAppState('review');
                  } else {
                    setAppState('camera');
                  }
                }}
                className={`text-xs md:text-sm font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-xl transition ${appState === 'camera' || appState === 'review' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Kamera {photos.length > 0 && `(${photos.length})`}
              </button>
              <button 
                onClick={() => setAppState('history')}
                className={`text-xs md:text-sm font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-xl transition ${appState === 'history' ? 'bg-blue-50 text-blue-600 font-bold border border-blue-100' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Daftar Penilaian
              </button>
            </div>
          </header>
        )}

        {/* SETUP PROGRESS BAR (shows during setup steps) */}
        {(appState === 'setup1' || appState === 'setup2') && (
          <div className="px-6 md:px-12 lg:px-16 pt-5 md:pt-8 pb-4 shrink-0 z-10 mx-auto w-full max-w-4xl">
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
            className="flex-1 flex flex-col p-6 md:p-12 lg:p-16 mx-auto w-full max-w-3xl lg:justify-center"
          >
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold mb-4 md:mb-6 flex items-center text-slate-800">
              <FileType className="mr-3 text-blue-500" size={28} />
              Answer Key
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-slate-500 mb-4 md:mb-6">Masukkan kunci jawaban untuk soal Pilihan Ganda (PG) dan Essay.</p>
            <textarea
              className="flex-1 min-h-[250px] lg:min-h-[350px] w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl p-4 md:p-6 text-sm md:text-base lg:text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-slate-400"
              placeholder="Contoh:&#10;PG: 1. A, 2. B, 3. C&#10;Essay: 1. Karena proses fotosintesis... "
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
            />
            <button 
              onClick={() => setAppState('setup2')}
              disabled={!answerKey.trim()}
              className="mt-6 w-full md:w-auto md:ml-auto md:px-10 bg-blue-600 text-white font-semibold py-4 md:py-4 rounded-xl disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700 transition flex items-center justify-center space-x-2 text-base md:text-lg shadow-lg shadow-blue-200/50"
            >
              <span>Lanjut ke Aturan Poin</span>
              <ChevronRight size={20} />
            </button>
          </motion.div>
        )}

        {/* SETUP 2: POINT RULES */}
        {appState === 'setup2' && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col p-6 md:p-12 lg:p-16 mx-auto w-full max-w-3xl lg:justify-center"
          >
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold mb-4 md:mb-6 flex items-center text-slate-800">
              <CheckCircle className="mr-3 text-blue-500" size={28} />
              Point Rule
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-slate-500 mb-4 md:mb-6">Tetapkan aturan poin untuk masing-masing jenis soal.</p>
            <textarea
              className="flex-1 min-h-[250px] lg:min-h-[350px] w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl p-4 md:p-6 text-sm md:text-base lg:text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-slate-400"
              placeholder="Contoh:&#10;PG: Bener = 5, Salah = 0&#10;Essay: Bobot maksimal 20 per soal"
              value={pointRules}
              onChange={(e) => setPointRules(e.target.value)}
            />
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mt-6 md:mt-8 sm:justify-end">
              <button 
                onClick={() => setAppState('setup1')}
                className="w-full sm:w-auto md:px-8 bg-slate-100 text-slate-600 font-semibold py-4 md:py-4 rounded-xl hover:bg-slate-200 transition text-base md:text-lg"
              >
                Kembali
              </button>
              <button 
                onClick={() => setAppState('camera')}
                disabled={!pointRules.trim()}
                className="w-full sm:w-auto md:px-12 bg-blue-600 text-white font-semibold py-4 md:py-4 rounded-xl disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700 transition flex items-center justify-center space-x-2 text-base md:text-lg shadow-lg shadow-blue-200/50"
              >
                <span>Mulai Kamera</span>
                <Camera size={20} className="ml-2" />
              </button>
            </div>
          </motion.div>
        )}

        {/* CAMERA VIEW */}
        {appState === 'camera' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-slate-900 z-50 flex flex-col lg:flex-row md:rounded-[2rem] overflow-hidden"
          >
            {/* Camera Area - Clamped to Document Aspect Ratio on Desktop */}
            <div className="flex-1 relative flex items-center justify-center p-0 lg:p-12 lg:bg-[#0f172a]">
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10 lg:top-8">
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

              <div className="absolute top-4 right-4 z-30 flex flex-col space-y-3 lg:hidden">
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
              
              <div className="relative w-full h-full lg:w-auto lg:h-[95%] lg:aspect-[3/4] lg:rounded-3xl overflow-hidden bg-black lg:shadow-2xl lg:border border-white/10 flex items-center justify-center">
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
                  className="absolute inset-0 w-full h-full object-cover lg:max-w-none"
                />
                <canvas ref={canvasRef} className="hidden" />

                {captureMode === 'auto' && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8 lg:p-12 pb-32 lg:pb-12 z-10 lg:items-stretch lg:justify-stretch">
                    <div 
                      ref={scannerFrameRef}
                      className="w-full h-full max-h-[60vh] lg:max-h-full border-2 border-white/40 rounded-2xl relative transition-all duration-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] flex flex-col"
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
                   <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8 pb-32 lg:p-12 lg:pb-12 z-10">
                     <div className="w-full h-full max-h-[60vh] lg:max-h-full border-2 border-white/40 border-dashed rounded-xl relative flex flex-col shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]">
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
            </div>
            
            {/* Control Sidebar (Desktop) / Bottom Bar (Mobile) */}
            <div className="absolute lg:relative bottom-0 left-0 right-0 lg:w-96 lg:h-full lg:bg-slate-900 bg-gradient-to-t from-black/90 via-black/60 to-transparent pb-10 pt-16 px-6 lg:p-10 flex flex-col justify-end lg:justify-center z-20 lg:border-l border-white/5 shrink-0">
              <div className="w-full max-w-lg mx-auto flex lg:flex-col lg:space-y-12 items-center justify-between">
                
                <div className="hidden lg:flex w-full items-center justify-center space-x-6">
                   <button 
                     onClick={toggleFlashlight}
                     className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition shadow-lg ${flashlightOn ? 'bg-amber-500 text-white border-amber-400' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'}`}
                     title="Toggle Flashlight"
                   >
                     {flashlightOn ? <Flashlight size={24} /> : <FlashlightOff size={24} />}
                   </button>
                   <button 
                     onClick={() => setShowGuideline(!showGuideline)}
                     className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition shadow-lg ${showGuideline ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'}`}
                     title="Toggles Guideline"
                   >
                     <Grid3x3 size={24} />
                   </button>
                </div>
                
                <div className="w-16 md:w-20 lg:w-full lg:flex lg:justify-center relative">
                   {/* Thumbnail Button */}
                   {photos.length > 0 ? (
                     <button 
                       onClick={() => setAppState('review')}
                       className="w-14 h-14 md:w-16 md:h-16 lg:w-28 lg:h-28 rounded-xl lg:rounded-2xl border-2 border-white/30 overflow-hidden relative group hover:scale-105 transition-transform"
                     >
                       <img src={photos[photos.length - 1]} alt="thumb" className="w-full h-full object-cover group-hover:brightness-75 transition-all" />
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-white font-bold text-sm md:text-base lg:text-2xl">{photos.length}</span>
                       </div>
                     </button>
                   ) : (
                     <div className="w-14 h-14 md:w-16 md:h-16 lg:w-28 lg:h-28 rounded-xl lg:rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                        <ImageIcon className="text-white/20" size={32} />
                     </div>
                   )}
                </div>
                
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-full border-4 border-white/30 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 lg:w-28 lg:h-28 bg-white rounded-full"></div>
                </button>
                
                <div className="w-16 md:w-20 lg:w-full flex justify-end lg:justify-center">
                   <button 
                     onClick={() => setAppState('setup1')}
                     className="w-14 h-14 md:w-16 md:h-16 lg:w-16 lg:h-16 rounded-full bg-black/40 lg:bg-white/5 border-2 border-white/30 lg:border-white/10 text-white lg:text-white/70 flex items-center justify-center backdrop-blur-md hover:bg-black/60 lg:hover:bg-white/10 lg:hover:text-white transition"
                   >
                     <Settings size={28} className="md:w-7 md:h-7 lg:w-8 lg:h-8" />
                   </button>
                </div>
              </div>
              
              {photos.length > 0 && (
                <div className="hidden lg:flex w-full mt-10">
                   <button 
                     onClick={() => setAppState('review')}
                     className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl hover:bg-blue-700 transition"
                   >
                     Mulai Penilaian ({photos.length})
                   </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* REVIEW PHOTOS */}
        {appState === 'review' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col bg-slate-50 relative z-30 overflow-hidden md:rounded-[2rem]"
          >
            <div className="bg-white border-b border-slate-100 shadow-sm z-10 shrink-0">
               <div className="p-4 md:py-6 md:px-8 flex flex-col items-center justify-center text-center max-w-4xl mx-auto w-full">
                  <span className="font-bold text-slate-800 text-lg md:text-xl">Afirmasi Dokumen</span>
                  <div className="mt-3">
                     <button 
                       onClick={() => setAppState('camera')}
                       className="text-blue-600 px-5 py-2 font-semibold text-sm md:text-base bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-100 flex items-center justify-center"
                     >
                       Tambah Foto
                     </button>
                  </div>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-sm md:text-base font-semibold text-slate-500 mb-6 flex items-center">
                   <CheckCircle className="w-5 h-5 mr-2" />
                   Foto yang siap dinilai ({photos.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative group hover:shadow-md transition">
                       <div className="absolute top-4 left-4 bg-black/70 text-white text-xs md:text-sm font-semibold px-3 py-1.5 rounded-md backdrop-blur-md z-10 border border-white/10">Hal {idx + 1}</div>
                       <button 
                         onClick={(e) => { e.stopPropagation(); handleRemovePhoto(idx); }}
                         className="absolute top-4 right-4 bg-red-500/80 hover:bg-red-600 text-white p-2 md:p-2.5 rounded-full backdrop-blur-md transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 z-10 border border-white/10"
                         title="Hapus foto ini"
                       >
                         <Trash2 size={18} className="md:w-5 md:h-5" />
                       </button>
                       <div 
                         onClick={() => setPreviewPhoto(photo)}
                         className="cursor-pointer w-full h-56 sm:h-72 relative bg-slate-100"
                       >
                         <img src={photo} alt={`Document ${idx}`} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                           <Scan className="text-white opacity-0 group-hover:opacity-100 w-10 h-10 drop-shadow-lg transition-opacity" />
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 md:p-8 bg-white border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] shrink-0">
               <button 
                  onClick={processScoring}
                  className="w-full max-w-md mx-auto bg-blue-600 text-white font-semibold py-4 md:py-5 rounded-xl md:rounded-2xl hover:bg-blue-700 transition flex justify-center items-center space-x-2 text-base md:text-lg shadow-lg shadow-blue-200"
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
            className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 mx-auto w-full max-w-2xl text-center"
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

            <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-2 md:mb-4">
              {errorMessage ? 'Penilaian Gagal' : 'Sedang memproses penilaian..'}
            </h2>
            <p className="text-slate-500 text-center text-sm md:text-base max-w-sm md:max-w-md">
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
            className="flex-1 flex flex-col bg-slate-50 md:bg-white"
          >
            <div className="bg-blue-600 text-white p-6 md:p-12 pt-10 md:pt-16 pb-8 md:pb-12 flex flex-col items-center text-center md:rounded-b-[60px] rounded-b-[40px] shadow-lg mb-6 max-w-3xl mx-auto w-full">
               <div className="w-16 h-16 md:w-20 md:h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 md:mb-6 backdrop-blur-md">
                 <Check size={32} className="text-white md:w-10 md:h-10" />
               </div>
               <p className="text-blue-100 font-medium tracking-wide text-sm md:text-base uppercase mb-1">Nilai Total</p>
               <h2 className="text-6xl md:text-8xl font-bold tracking-tight mb-2 md:mb-4">{scoringResult.total}</h2>
               <p className="text-blue-100/80 text-sm md:text-base max-w-[200px] md:max-w-[300px]">Gabungan dari seluruh jenis soal</p>
            </div>
            
            <div className="flex-1 px-6 md:px-12 pb-6 md:pb-12 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
               {/* Identitas Siswa Section */}
               <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center">
                     <Brain className="w-5 h-5 mr-2 text-indigo-600 shrink-0" />
                     Identitas Hasil Scan AI
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Nama Siswa</label>
                        <input 
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 transition outline-none"
                          value={scoringResult.studentName}
                          onChange={(e) => handleUpdateCurrentStudent(e.target.value, scoringResult.studentClass)}
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Kelas</label>
                        <input 
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 transition outline-none"
                          value={scoringResult.studentClass}
                          onChange={(e) => handleUpdateCurrentStudent(scoringResult.studentName, e.target.value)}
                        />
                     </div>
                  </div>
               </div>

               <div>
                 <h3 className="text-sm md:text-base font-semibold uppercase tracking-wider text-slate-500 mb-4 text-center md:text-left">Rincian Penilaian</h3>
                 <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
                   {scoringResult.details.map((detail, idx) => (
                     <div key={idx} className="bg-white p-5 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col">
                       <div className="flex justify-between items-center mb-2 md:mb-4">
                         <h4 className="font-bold text-slate-800 md:text-lg">{detail.type}</h4>
                         <span className="text-xl md:text-2xl font-bold text-blue-600">{detail.score}</span>
                       </div>
                       {detail.notes && (
                         <p className="text-sm md:text-base text-slate-500 bg-slate-50 p-3 md:p-4 rounded-lg md:rounded-xl border border-slate-100 flex-1">
                           {detail.notes}
                         </p>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
            </div>

            <div className="p-4 md:p-8 shrink-0 bg-white md:bg-transparent border-t border-slate-100 md:border-t-0 mt-auto flex flex-col sm:flex-row items-center justify-center gap-4 max-w-xl mx-auto w-full">
               <button 
                  onClick={() => setAppState('history')}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-4 rounded-xl transition text-center text-sm md:text-base border border-slate-200 active:scale-95"
               >
                 Lihat Daftar Penilaian
               </button>
               <button 
                  onClick={handleNextStudent}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition text-center text-sm md:text-base shadow-lg shadow-blue-200/50 active:scale-95"
               >
                 Nilai Siswa Berikutnya
               </button>
            </div>
          </motion.div>
        )}

        {/* HISTORY / ASSESSMENT DATABASE */}
        {appState === 'history' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col bg-slate-50"
          >
            {/* Centered Title */}
            <div className="py-6 shrink-0 text-center">
               <h2 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">Daftar Penilaian</h2>
               <p className="text-xs md:text-sm text-slate-400 font-medium mt-1">Kelola hasil scan lembar jawaban siswa yang dinilai</p>
            </div>

            {/* Filter Section */}
            <div className="px-6 md:px-12 max-w-4xl mx-auto w-full shrink-0 flex flex-col sm:flex-row items-center gap-4 mb-6">
               {/* Dropdown Kelas */}
               <div className="w-full sm:w-1/3">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Pilih Kelas</label>
                  <select 
                     className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer shadow-sm"
                     value={selectedClassFilter}
                     onChange={(e) => setSelectedClassFilter(e.target.value)}
                  >
                     <option value="Semua Kelas">Semua Kelas</option>
                     {Array.from(new Set(savedScorings.map(item => item.studentClass.trim()).filter(Boolean)))
                       .sort()
                       .map(cls => (
                           <option key={cls} value={cls}>{cls}</option>
                       ))
                     }
                  </select>
               </div>

               {/* Search Box */}
               <div className="w-full sm:flex-1">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Cari Nama Siswa</label>
                  <div className="relative">
                     <input 
                        type="text"
                        placeholder="Ketik nama siswa..."
                        className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                        value={searchNameFilter}
                        onChange={(e) => setSearchNameFilter(e.target.value)}
                     />
                     <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                  </div>
               </div>
            </div>

            {/* Assessment Records list container */}
            <div className="flex-1 px-6 md:px-12 pb-6 overflow-y-auto max-w-4xl mx-auto w-full">
               {savedScorings.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[250px]">
                     <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 mb-4">
                        <CheckCircle className="w-8 h-8" />
                     </div>
                     <h3 className="font-bold text-slate-800 text-lg">Belum Ada Penilaian</h3>
                     <p className="text-slate-400 text-sm max-w-sm mt-1.5 leading-relaxed">Siswa yang selesai dinilai menggunakan kamera akan otomatis tersimpan dalam daftar ini.</p>
                     <button 
                       onClick={() => {
                          setPhotos([]);
                          setAppState('camera');
                       }}
                       className="mt-5 px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition shadow-md shadow-blue-100"
                     >
                       Mulai Cari & Foto Lembar Ujian
                     </button>
                  </div>
               ) : (
                  <div className="space-y-4">
                     {(() => {
                        const filtered = savedScorings
                          .filter(item => {
                             const matchesClass = selectedClassFilter === 'Semua Kelas' || item.studentClass === selectedClassFilter;
                             const matchesSearch = item.studentName.toLowerCase().includes(searchNameFilter.toLowerCase());
                             return matchesClass && matchesSearch;
                          })
                          .sort((a, b) => a.studentName.localeCompare(b.studentName));
                        
                        if (filtered.length === 0) {
                           return (
                              <div className="bg-white/80 border border-slate-200 rounded-3xl p-10 text-center text-slate-500">
                                 Tidak ditemukan siswa dengan filter tersebut.
                              </div>
                           );
                        }

                        return filtered.map((item) => (
                          <div key={item.id} className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 hover:shadow-md transition">
                             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1">
                                   <div className="flex items-center space-x-2.5 mb-1.5 flex-wrap gap-y-1">
                                      <h4 className="font-bold text-slate-800 text-lg truncate max-w-[200px] sm:max-w-xs">{item.studentName}</h4>
                                      <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-md border border-blue-100 uppercase tracking-wide">{item.studentClass}</span>
                                   </div>
                                   
                                   <div className="space-y-1.5 mt-3">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rincian Komponen Nilai</div>
                                      <div className="flex flex-wrap gap-2.5">
                                         {item.details.map((d, dIdx) => (
                                            <span key={dIdx} className="bg-slate-50 text-slate-600 text-xs px-3 py-1.5 rounded-lg border border-slate-100 flex items-center">
                                               <span className="font-semibold text-slate-500">{d.type}:</span>
                                               <span className="ml-1 font-bold text-slate-800">{d.score}</span>
                                               {d.notes && <span className="ml-1 text-slate-400 truncate max-w-[120px]" title={d.notes}>({d.notes})</span>}
                                            </span>
                                         ))}
                                      </div>
                                   </div>
                                   <div className="text-[10px] text-slate-400 mt-3 font-medium">Dinilai pada: {item.gradedAt}</div>
                                </div>

                                <div className="flex flex-row md:flex-col items-center justify-between md:justify-center gap-3 shrink-0 pt-3 md:pt-0 border-t border-slate-100 md:border-t-0">
                                   <div className="text-left md:text-right flex items-center md:flex-col gap-1.5 md:gap-0 select-none">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Nilai</span>
                                      <span className="text-2xl md:text-3xl font-extrabold text-blue-600">{item.total}</span>
                                   </div>
                                   
                                   <div className="flex items-center space-x-2">
                                      <button 
                                        onClick={() => handleRetryScoring(item)}
                                        className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 bg-slate-50 rounded-xl transition border border-slate-100 hover:border-blue-100"
                                        title="Ulangi / Foto Ulang Nilai"
                                      >
                                        <RefreshCcw size={16} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteSaved(item.id)}
                                        className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 bg-slate-50 rounded-xl transition border border-slate-100 hover:border-red-100"
                                        title="Hapus Rekor"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                   </div>
                                </div>
                             </div>
                          </div>
                        ));
                     })()}
                  </div>
               )}
            </div>

            {/* Bottom Actions Div */}
            <div className="p-4 md:p-6 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-4 shrink-0 shadow-[0_-8px_30px_rgb(0,0,0,0.02)]">
               <button 
                 onClick={exportToExcel}
                 className="w-full sm:w-auto px-6 py-4 bg-emerald-600 hover:bg-emerald-700 font-semibold text-white rounded-xl transition flex items-center justify-center space-x-2 text-sm md:text-base shadow-md shadow-emerald-500/10 active:scale-95"
               >
                 <Download size={18} className="mr-1.5" />
                 <span>Download Excel (.xls)</span>
               </button>
               <button 
                 onClick={() => {
                   setPhotos([]);
                   setScoringResult(null);
                   setAppState('camera');
                 }}
                 className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 font-semibold text-white rounded-xl transition flex items-center justify-center space-x-2 text-sm md:text-base shadow-lg shadow-blue-500/15 active:scale-95"
               >
                 <span>Lanjutkan Penilaian Siswa Berikutnya</span>
                 <ChevronRight size={18} />
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
        
        {/* IMAGE PREVIEW MODAL */}
        <AnimatePresence>
          {previewPhoto && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
              onClick={() => setPreviewPhoto(null)}
            >
              <button 
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-4 right-4 md:top-8 md:right-8 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition backdrop-blur-md"
              >
                <XCircle size={32} />
              </button>
              <motion.img 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                src={previewPhoto} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain rounded-xl"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
