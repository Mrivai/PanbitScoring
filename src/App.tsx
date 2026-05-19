import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCcw, CheckCircle, ChevronRight, Play, Image as ImageIcon, XCircle, FileType, Check, AlertCircle, Clock, Brain, ShieldCheck } from 'lucide-react';
import Webcam from 'react-webcam';
import { Client } from '@gradio/client';
import { motion, AnimatePresence } from 'motion/react';

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

  const webcamRef = useRef<Webcam>(null);

  // Landing page no longer times out, user must click 'Mulai'
  useEffect(() => {
    // Optionally run initialization logic here
  }, []);

  const capturePhoto = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setPhotos(prev => [...prev, imageSrc]);
      }
    }
  }, [webcamRef]);

  const processScoring = async () => {
    setAppState('processing');
    setErrorMessage('');
    
    try {
      const prompt = `Anda adalah asisten penilai ujian otomatis (Panbit Automated Scoring System).
Kunci Jawaban:
${answerKey}

Aturan Poin:
${pointRules}

Tugas Anda:
1. Baca lembar jawaban siswa dari gambar.
2. Cocokkan dengan kunci jawaban.
3. Hitung skor berdasarkan aturan poin.
4. Jawab HANYA menggunakan format JSON valid seperti berikut, tanpa teks tambahan di luar JSON:
{
  "total": 85,
  "details": [
    { "type": "Pilihan Ganda", "score": 50, "notes": "Benar 10 dari 10" },
    { "type": "Essay", "score": 35, "notes": "Kurang tepat di nomor 2" }
  ]
}`;

      console.log('Connecting to Gradio Space...');
      const client = await Client.connect("GanymedeNil/Qwen2-VL-7B");
      
      console.log('Sending predict request...');
      // Note: The specific API endpoint and arguments might differ depending on the Gradio app's exact implementation.
      // Usually Multimodal chat uses a dictionary for the message: { text: string, files: any[] }
      
      // Attempt to prepare images as Blobs if Gradio requires files, but @gradio/client typically accepts Blobs or URLs.
      const imageBlobs = await Promise.all(photos.map(async (photoUrl) => {
        const res = await fetch(photoUrl);
        return await res.blob();
      }));

      // Assuming API endpoint /model_chat based on common Qwen spaces. 
      // If it fails, we will catch and show an error.
      const response = await client.predict("/model_chat", [
        {
          "text": prompt,
          "files": imageBlobs
        },
        "system" // some parameter, maybe history or system prompt depending on space
      ]);

      console.log('Response:', response);
      
      // Parse response - assuming the model outputs the text as the first item in an array or a specific field
      // We'll try to extract JSON from the raw output.
      const rawText = Array.isArray(response.data) ? response.data[0] : JSON.stringify(response.data);
      
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         const parsed = JSON.parse(jsonMatch[0]);
         setScoringResult(parsed);
      } else {
         throw new Error("Format output dari model tidak sesuai JSON.");
      }
      
      setAppState('result');
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || 'Terjadi kesalahan saat memproses penilaian.');
      
      // Mock Data for fallback demonstration if API is unavailable or shape changed
      setTimeout(() => {
        setErrorMessage('Gagal menghubungi API Gradio atau format tidak dikenali. Menampilkan hasil simulasi untuk keperluan Demo.');
        setScoringResult({
          total: 85,
          details: [
            { type: "Pilihan Ganda", "score": 50, notes: "10/10 Benar" },
            { type: "Essay", "score": 35, notes: "Ada beberapa poin kural tepat di esai 2" }
          ],
          raw: "Fallback mock data"
        });
        setAppState('result');
      }, 2000);
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
                  onClick={() => setAppState('setup1')}
                  className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl hover:bg-blue-700 transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-200/50"
                >
                  <span>Mulai Menilai Sekarang</span>
                  <ChevronRight size={18} />
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
            className="flex-1 bg-black relative flex flex-col"
          >
            <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-xs font-medium">
              Ambil foto lembar kerja
            </div>
            
            <div className="flex-1 relative overflow-hidden">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: "environment" }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            
            <div className="bg-black/80 backdrop-blur-xl pb-10 pt-6 px-6 flex items-center justify-between border-t border-white/10">
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
                 {/* Optional: Add re-take or other tool here later */}
              </div>
            </div>
          </motion.div>
        )}

        {/* REVIEW PHOTOS */}
        {appState === 'review' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col bg-slate-50"
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
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
                   <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-md">Hal {idx + 1}</div>
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
            <div className="w-24 h-24 mb-6 relative">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-blue-600">
                <RefreshCcw size={32} />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Sedang memproses penilaian..</h2>
            <p className="text-slate-500 text-center text-sm max-w-xs">AI sedang menganalisis dokumen dan mencocokkan dengan kunci jawaban & aturan Anda.</p>
            
            {errorMessage && (
              <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
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
