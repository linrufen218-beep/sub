import React, { useState, useRef, useEffect, memo } from 'react';
import { Play, Pause, Square, Download, Plus, Trash2, Lock, Sparkles, Activity, CheckCircle2, ChevronRight, Headphones, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toTraditional } from './utils/s2t';

// --- Types & Interfaces ---
type Density = 'low' | 'mid' | 'high';
type Tense = 'progressive' | 'completed' | 'mixed';
type MatrixType = 'whisper' | 'reverse' | 'silent' | 'spatial' | 'chaos';

interface BgmTrack {
 id: string;
 source: File | string | null;
 volume: number;
}

// --- Audio Utility: Buffer to WAV (Async Chunked) ---
async function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
 const numChannels = buffer.numberOfChannels;
 const sampleRate = buffer.sampleRate;
 const format = 1; // PCM
 const bitDepth = 16;
 const bytesPerSample = bitDepth / 8;

 const dataLength = buffer.length * numChannels * bytesPerSample;
 const bufferArray = new ArrayBuffer(44 + dataLength);
 const view = new DataView(bufferArray);

 // Write standard WAV Header safely with DataView
 writeString(view, 0, 'RIFF');
 view.setUint32(4, 36 + dataLength, true);
 writeString(view, 8, 'WAVE');
 writeString(view, 12, 'fmt ');
 view.setUint32(16, 16, true);
 view.setUint16(20, format, true);
 view.setUint16(22, numChannels, true);
 view.setUint32(24, sampleRate, true);
 view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
 view.setUint16(32, numChannels * bytesPerSample, true);
 view.setUint16(34, bitDepth, true);
 writeString(view, 36, 'data');
 view.setUint32(40, dataLength, true);

 // --- Extreme Performance Optimization (Chunked) ---
 const int16View = new Int16Array(bufferArray, 44);
 const channelL = buffer.getChannelData(0);
 const channelR = numChannels === 2 ? buffer.getChannelData(1) : channelL;
 
 const length = buffer.length;
 const CHUNK_SIZE = 44100 * 5; // 5 seconds per chunk
 
 return new Promise((resolve) => {
 let offset = 0;
 let i = 0;

 function processChunk() {
 const end = Math.min(i + CHUNK_SIZE, length);
 for (; i < end; i++) {
 let sl = Math.max(-1, Math.min(1, channelL[i]));
 int16View[offset++] = sl < 0 ? sl * 0x8000 : sl * 0x7FFF;
 
 if (numChannels === 2) {
 let sr = Math.max(-1, Math.min(1, channelR[i]));
 int16View[offset++] = sr < 0 ? sr * 0x8000 : sr * 0x7FFF;
 }
 }

 if (i < length) {
 requestAnimationFrame(processChunk); // Yield to main thread
 } else {
 resolve(new Blob([bufferArray], { type: 'audio/wav' }));
 }
 }

 processChunk();
 });

 function writeString(view: DataView, offset: number, string: string) {
 for (let i = 0; i < string.length; i++) {
 view.setUint8(offset + i, string.charCodeAt(i));
 }
 }
}

// --- IndexedDB Local Storage Helper ---
interface TrackRecord {
 id: string;
 name: string;
 rawBlob: Blob;
 type: MatrixType;
}

// --- Algorithm Map ---
const MATRIX_NAMES: Record<MatrixType, string> = {
 whisper: '耳語',
 reverse: '倒放',
 silent: '超聲波',
 spatial: '立體聲',
 chaos: '混沌'
};

const MiffyMark = ({ className = '' }: { className?: string }) => (
 <span className={`relative inline-flex h-5 w-5 items-center justify-center ${className}`} aria-hidden="true">
 <span className="absolute -top-1.5 left-[4px] h-3 w-1.5 rounded-[4px] border border-slate-700 bg-white rotate-[-8deg]" />
 <span className="absolute -top-1.5 right-[4px] h-3 w-1.5 rounded-[4px] border border-slate-700 bg-white rotate-[8deg]" />
 <span className="relative h-4 w-4 rounded-[6px] border border-slate-700 bg-white">
 <span className="absolute left-[4px] top-[5px] h-0.5 w-0.5 bg-slate-900" />
 <span className="absolute right-[4px] top-[5px] h-0.5 w-0.5 bg-slate-900" />
 <span className="absolute left-[6px] top-[8px] leading-none text-slate-900">x</span>
 </span>
 </span>
);

const initDB = (): Promise<IDBDatabase> => {
 return new Promise((resolve, reject) => {
 const request = indexedDB.open('SubliminalDB', 1);
 request.onupgradeneeded = (e: any) => {
 e.target.result.createObjectStore('tracks', { keyPath: 'id' });
 };
 request.onsuccess = (e: any) => resolve(e.target.result);
 request.onerror = (e: any) => reject(e.target.error);
 });
};

const saveTrackDB = async (track: TrackRecord) => {
 const db = await initDB();
 return new Promise((resolve, reject) => {
 const tx = db.transaction('tracks', 'readwrite');
 tx.objectStore('tracks').put(track);
 tx.oncomplete = () => resolve(true);
 tx.onerror = () => reject(tx.error);
 });
};

const getTracksDB = async (): Promise<TrackRecord[]> => {
 const db = await initDB();
 return new Promise((resolve, reject) => {
 const tx = db.transaction('tracks', 'readonly');
 const req = tx.objectStore('tracks').getAll();
 req.onsuccess = () => resolve(req.result);
 req.onerror = () => reject(req.error);
 });
};

const deleteTrackDB = async (id: string) => {
 const db = await initDB();
 return new Promise((resolve, reject) => {
 const tx = db.transaction('tracks', 'readwrite');
 tx.objectStore('tracks').delete(id);
 tx.oncomplete = () => resolve(true);
 tx.onerror = () => reject(tx.error);
 });
};

const updateTrackNameDB = async (id: string, newName: string) => {
 const db = await initDB();
 return new Promise((resolve, reject) => {
 const tx = db.transaction('tracks', 'readwrite');
 const store = tx.objectStore('tracks');
 const req = store.get(id);
 req.onsuccess = () => {
 const data = req.result;
 if (data) {
 data.name = newName;
 store.put(data);
 resolve(true);
 } else {
 reject("Not found");
 }
 };
 req.onerror = () => reject(req.error);
 });
};

// --- Custom Track Player Component ---
const TrackPlayerCard: React.FC<{ track: {id: string, name: string, url: string, type: MatrixType}, onDelete: (id: string) => void, onRename: (id: string, newName: string) => void }> = ({ track, onDelete, onRename }) => {
 const audioRef = useRef<HTMLAudioElement>(null);
 const [isEditing, setIsEditing] = useState(false);
 const [editName, setEditName] = useState(track.name);
 const [isLooping, setIsLooping] = useState(true);
 const [timerMinutes, setTimerMinutes] = useState<number>(0);

 useEffect(() => {
 if (timerMinutes <= 0) return;
 const timeout = setTimeout(() => {
 if (audioRef.current) {
 audioRef.current.pause();
 audioRef.current.currentTime = 0;
 }
 setTimerMinutes(0);
 }, timerMinutes * 60 * 1000);
 return () => clearTimeout(timeout);
 }, [timerMinutes, isLooping]);

 const handleRenameSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (editName.trim() && editName !== track.name) {
 onRename(track.id, editName.trim());
 }
 setIsEditing(false);
 };

 return (
 <div className="bg-white border border-[#b9c0c8] rounded-lg p-3 flex flex-col gap-2 relative group shadow-sm sketch-border paper-dots">
 <div className="flex items-center gap-2 absolute top-2 right-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition truncate max-w-[60%]">
 <span className="px-2 py-0.5 bg-white text-[#005599] border border-[#005599] rounded-md uppercase shrink-0 sketch-border inline-flex items-center">
 {MATRIX_NAMES[track.type] || 'UNKNOWN'}
 </span>
 <button onClick={() => onDelete(track.id)} className="text-slate-400 hover:text-red-500 transition p-1 bg-white border border-[#c8ced6] rounded-md sketch-border">
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 </div>
 <div className="flex items-start justify-between gap-3 pr-2">
 <div className="w-9 h-9 rounded-lg bg-white border border-[#005599] flex items-center justify-center shrink-0 sketch-border">
 <MiffyMark />
 </div>
 <div className="flex-1 min-w-0">
 {isEditing ? (
 <form onSubmit={handleRenameSubmit} className="flex gap-2">
 <input 
 autoFocus
 type="text" 
 value={editName}
 onChange={e => setEditName(toTraditional(e.target.value))}
 onBlur={handleRenameSubmit}
 className="w-full bg-white border border-blue-300 text-slate-800 px-2 py-1 rounded-lg outline-none paper-stripes"
 />
 </form>
 ) : (
 <div 
 className="truncate text-slate-800 cursor-pointer hover:text-blue-600 select-none pb-0.5 border-b border-transparent hover:border-blue-200 inline-block"
 onDoubleClick={() => setIsEditing(true)}
 title="雙擊重新命名"
 >
 {track.name}
 </div>
 )}
 <div className="flex items-center gap-2 mt-1">
 <span className="text-blue-600">READY</span>
 <button 
 onClick={() => setIsLooping(!isLooping)}
 className={`px-2 py-0.5 rounded-md border sketch-border ${isLooping ? 'border-[#005599] text-[#005599] bg-white' : 'border-slate-300 text-slate-500 hover:text-slate-700 bg-white'}`}
 title="切換循環播放"
 >
 {isLooping ? '循環: 關 開' : '循環: 關 開'}
 </button>
 <select 
 value={timerMinutes}
 onChange={(e) => setTimerMinutes(parseInt(e.target.value))}
 className="bg-white border border-[#b9c0c8] rounded-md text-slate-500 outline-none px-1"
 >
 <option value={0}>不定時</option>
 <option value={10}>10分鐘後停</option>
 <option value={30}>30分鐘後停</option>
 <option value={60}>1小時後停</option>
 </select>
 </div>
 </div>
 </div>
 <audio ref={audioRef} controls src={track.url} loop={isLooping} className="w-full h-8 outline-none mt-1" />
 </div>
 );
}

// --- Embed Player Component (Memoized to prevent re-renders interrupting playback) ---
const getEmbedHtml = (link: string) => {
 if (!link.trim()) return '';
 if (link.includes('<iframe')) return link; // User pasted raw iframe

 // Direct Audio File (.mp3, .wav, etc.)
 if (link.match(/\.(mp3|wav|flac|ogg|m4a)(\?.*)?$/i)) {
 return `<div class="flex flex-col w-full h-[86px] items-center justify-center p-3 bg-white border border-[#b9c0c8] rounded-lg"><div class="text-emerald-600 mb-2 uppercase border border-emerald-200 bg-white px-2 py-0.5 rounded-md">直接音頻連結解析成功</div><audio controls src="${link}" class="w-full h-8 outline-none"></audio></div>`;
 }

 // Bilibili
 const bvMatch = link.match(/BV[1-9A-HJ-NP-Za-km-z]+/i);
 if (bvMatch) {
 return `<iframe src="//player.bilibili.com/player.html?bvid=${bvMatch[0]}&page=1&high_quality=1&danmaku=0" allowfullscreen="allowfullscreen" width="100%" height="280" scrolling="no" frameborder="0" sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts"></iframe>`;
 }

 // Attempt to parse Netease Cloud Music share link (use MetingJS to bypass official limitations)
 const neteasePlaylistMatch = link.match(/music\.163\.com.*playlist\?id=(\d+)/i) || link.match(/music\.163\.com.*playlist\/(\d+)/i);
 if (neteasePlaylistMatch) {
 return `<div class="w-full text-left"><meting-js server="netease" type="playlist" id="${neteasePlaylistMatch[1]}" list-folded="false" theme="#3b82f6"></meting-js></div>`;
 }

 const neteaseSongMatch = link.match(/music\.163\.com.*song\?id=(\d+)/i) || link.match(/y\.music\.163\.com.*\/song\/(\d+)/i);
 if (neteaseSongMatch) {
 return `<div class="w-full text-left"><meting-js server="netease" type="song" id="${neteaseSongMatch[1]}" theme="#3b82f6"></meting-js></div>`;
 }
 
 // Attempt to parse Spotify share link
 const spotifyMatch = link.match(/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/i);
 if (spotifyMatch) {
 const type = spotifyMatch[1];
 const id = spotifyMatch[2];
 return `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
 }

 // Default fallback
 return `<div class="text-slate-500 p-3 text-center border border-[#b9c0c8] rounded-lg bg-white w-full h-[86px] flex items-center justify-center">未支援的連結格式</div>`;
};

const EmbedPlayer = memo(({ link }: { link: string }) => {
 const containerRef = useRef<HTMLDivElement>(null);
 useEffect(() => {
 if (containerRef.current) {
 containerRef.current.innerHTML = getEmbedHtml(link);
 }
 }, [link]);
 return <div ref={containerRef} className="w-full flex justify-center scale-[0.98] origin-center" />;
});

// --- Main Application ---
type Tab = 'create' | 'engine' | 'player';
type PlayerPanel = 'recordings' | 'playlist';

export default function App() {
 // Navigation State for Mobile View
 const [activeTab, setActiveTab] = useState<Tab>('create');
 const [isSettingsOpen, setIsSettingsOpen] = useState(false);

 // SOP State
 const [activeStep, setActiveStep] = useState<number>(1);
 
 // Step 1 State
 const [topic, setTopic] = useState(() => localStorage.getItem('subliminal_topic') || '');
 const [density, setDensity] = useState<Density>('mid');
 const [tense, setTense] = useState<Tense>('mixed');
 const [isGenerating, setIsGenerating] = useState(false);
 const [aiEndpoint, setAiEndpoint] = useState(() => localStorage.getItem('subliminal_ai_endpoint') || (import.meta as any).env?.VITE_WORKER_URL || '');
 const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('subliminal_ai_api_key') || '');
 const [aiModel, setAiModel] = useState(() => localStorage.getItem('subliminal_ai_model') || 'gemini-2.5-flash');
 
 // Step 2 State
 const [affirmations, setAffirmations] = useState(() => localStorage.getItem('subliminal_affirmations') || '');
 
 // Step 3 State
 const [matrixType, setMatrixType] = useState<MatrixType>('chaos');
 const [speed, setSpeed] = useState<number>(1.2);
 const [voiceVolume, setVoiceVolume] = useState<number>(100);
 const [brainwaveOn, setBrainwaveOn] = useState<boolean>(true);
 const [chaosIncludeSilent, setChaosIncludeSilent] = useState<boolean>(false);
 const [maskingNoiseLevel, setMaskingNoiseLevel] = useState<number>(50); // Brown noise mix
 const [carrierFreq, setCarrierFreq] = useState<number>(15000); // 15kHz default
 const [bgmFile, setBgmFile] = useState<File | null>(null);
 const [bgmSync, setBgmSync] = useState<boolean>(true);
 const [whiteNoiseType, setWhiteNoiseType] = useState<string>('none');
 const [whiteNoiseVolume, setWhiteNoiseVolume] = useState<number>(30);

 const createBrownNoiseBuffer = (ctx: BaseAudioContext) => {
 const bufferSize = ctx.sampleRate * 5; // 5 seconds loop
 const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
 const output = buffer.getChannelData(0);
 let lastOut = 0;
 for (let i = 0; i < bufferSize; i++) {
 const white = Math.random() * 2 - 1;
 output[i] = (lastOut + (0.02 * white)) / 1.02;
 lastOut = output[i];
 output[i] *= 3.5; 
 }
 return buffer;
 };

 
 // Step 4 State & Engine
 const [isRendering, setIsRendering] = useState(false);
 const [isPlaying, setIsPlaying] = useState(false);
 const [progress, setProgress] = useState(0);
 const [masterBlobUrl, setMasterBlobUrl] = useState<string | null>(null);

 // Player Space State
 const [externalMusicLink, setExternalMusicLink] = useState(() => localStorage.getItem('subliminal_music_link') || '');
 const [exportedLibrary, setExportedLibrary] = useState<Array<{id: string, name: string, url: string, type: MatrixType}>>([]);
 const [playerPanel, setPlayerPanel] = useState<PlayerPanel>('recordings');
 
 const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
 const activeSourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
 const rtContextRef = useRef<AudioContext | null>(null);
 const globalDuckingGainRef = useRef<GainNode | null>(null);

 // Persist State
 useEffect(() => {
 localStorage.setItem('subliminal_topic', topic);
 }, [topic]);

 useEffect(() => {
 localStorage.setItem('subliminal_affirmations', affirmations);
 }, [affirmations]);

 useEffect(() => {
 localStorage.setItem('subliminal_music_link', externalMusicLink);
 }, [externalMusicLink]);

 useEffect(() => {
 localStorage.setItem('subliminal_ai_endpoint', aiEndpoint.trim());
 }, [aiEndpoint]);

 useEffect(() => {
 localStorage.setItem('subliminal_ai_api_key', aiApiKey.trim());
 }, [aiApiKey]);

 useEffect(() => {
 localStorage.setItem('subliminal_ai_model', aiModel.trim());
 }, [aiModel]);

 useEffect(() => {
 // Load persisted tracks on mount
 getTracksDB().then(records => {
 const loaded = records.map((r: any) => ({
 id: r.id,
 name: r.name,
 url: URL.createObjectURL(r.rawBlob),
 type: r.type || 'chaos'
 }));
 setExportedLibrary(loaded);
 }).catch(err => console.error("Failed to load tracks", err));
 }, []);

 const handleClear = () => {
 setTopic('');
 setAffirmations('');
 setExternalMusicLink('');
 localStorage.removeItem('subliminal_topic');
 localStorage.removeItem('subliminal_affirmations');
 localStorage.removeItem('subliminal_music_link');
 };

 const handleDeleteTrack = async (id: string) => {
 await deleteTrackDB(id);
 setExportedLibrary(prev => {
 const item = prev.find(t => t.id === id);
 if (item) URL.revokeObjectURL(item.url); // tidy up
 return prev.filter(t => t.id !== id);
 });
 };

 const handleRenameTrack = async (id: string, newName: string) => {
 try {
 await updateTrackNameDB(id, newName);
 setExportedLibrary(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
 } catch (err) {
 console.error("Failed to rename track:", err);
 alert("重新命名失敗");
 }
 };

 // Initialize Media Session for background play
 useEffect(() => {
 if ('mediaSession' in navigator) {
 navigator.mediaSession.metadata = new MediaMetadata({
 title: '潛意識重塑·能量母帶',
 artist: 'Subliminal Matrix System',
 album: 'Cyber-Spiritual Evolution',
 artwork: [
 { src: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=512&auto=format&fit=crop', sizes: '512x512', type: 'image/jpeg' }
 ]
 });

 navigator.mediaSession.setActionHandler('play', () => {
 if (backgroundAudioRef.current) {
 backgroundAudioRef.current.play();
 setIsPlaying(true);
 }
 });
 navigator.mediaSession.setActionHandler('pause', () => {
 if (backgroundAudioRef.current) {
 backgroundAudioRef.current.pause();
 setIsPlaying(false);
 }
 });
 }
 }, []);

 // Time formatting
 const formatTime = (seconds: number) => {
 const mins = Math.floor(seconds / 60);
 const secs = Math.floor(seconds % 60);
 return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
 };

 // --------------------------------------------------------
 // LOGIC: Affirmation Generation
 // --------------------------------------------------------
 const handleGenerate = async () => {
 let safeTopic = topic.trim();
 if (!safeTopic) {
 safeTopic = "建立自信富足磁場，徹底消融職場焦慮";
 setTopic(safeTopic);
 }

 setIsGenerating(true);
 try {
 const customEndpoint = aiEndpoint.trim();
 const targetUrl = customEndpoint || '/api/generate-affirmations';
 const headers: Record<string, string> = { 'Content-Type': 'application/json' };
 if (customEndpoint && aiApiKey.trim()) {
 headers.Authorization = `Bearer ${aiApiKey.trim()}`;
 headers['x-api-key'] = aiApiKey.trim();
 }

 const res = await fetch(targetUrl, {
 method: 'POST',
 headers,
 body: JSON.stringify({ topic: safeTopic, density, tense, model: aiModel.trim() || undefined })
 });
 
 if (!res.ok) {
 throw new Error('API Error');
 }
 
 const data = await res.json();
 const generatedText = data.affirmations || data.text || data.output;
 if (!generatedText) {
 throw new Error('Empty AI response');
 }
 setAffirmations(toTraditional(String(generatedText).trim()));
 setActiveStep(2);
 } catch (err) {
 console.error('Server generation failed:', err);
 alert('AI 潛意識指令生成中失敗，請檢查網路或稍後重試');
 } finally {
 setIsGenerating(false);
 }
 };

 // --------------------------------------------------------
 // LOGIC: Web Audio Engine (Offline & Realtime)
 // --------------------------------------------------------
 
 // TTS Fallback / Acoustic Signature Generator (Ensure it NEVER fails)
 const textToAudioBuffer = async (text: string, rate: number, ctx: BaseAudioContext): Promise<AudioBuffer> => {
 // Attempt to use our backend proxy for TTS to bypass CORS
 try {
 const baseUrl = aiEndpoint.trim() ? aiEndpoint.trim().replace(/\/+$/, '') : '';
const url = `${baseUrl}/api/tts?text=${encodeURIComponent(text.substring(0, 200))}`;
const response = await fetch(url);
 if (!response.ok) throw new Error("TTS Network error");
 const arrayBuf = await response.arrayBuffer();
 return await ctx.decodeAudioData(arrayBuf);
 } catch (e) {
 console.warn("TTS Fetch failed, synthesizing acoustic neural signature fallback...", e);
 // Fallback: Generate a "Subliminal Frequency Signature" based on text hash
 const duration = Math.min(10, text.length * 0.1 / rate); 
 const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
 const data = buffer.getChannelData(0);
 
 let phase = 0;
 for (let i = 0; i < data.length; i++) {
 const t = i / ctx.sampleRate;
 const charIdx = Math.floor((t / duration) * text.length);
 const charCode = text.charCodeAt(charIdx % text.length) || 400;
 const baseFreq = 200 + (charCode % 500); // 200Hz - 700Hz
 
 // Complex waveform mix
 const wave = Math.sin(phase) * 0.5 + Math.sin(phase * 2.5) * 0.25;
 // Envelope mapping
 const env = Math.sin(Math.PI * (t / duration)); 
 
 data[i] = wave * env * 0.5;
 phase += (2 * Math.PI * baseFreq) / ctx.sampleRate;
 }
 return buffer;
 }
 };

 const decodeBgm = async (track: BgmTrack, ctx: BaseAudioContext): Promise<AudioBuffer | null> => {
 if (!track.source) return null;
 try {
 if (track.source instanceof File) {
 const ab = await track.source.arrayBuffer();
 return await ctx.decodeAudioData(ab);
 } else if (typeof track.source === 'string') {
 const res = await fetch(track.source);
 const ab = await res.arrayBuffer();
 return await ctx.decodeAudioData(ab);
 }
 } catch (e) {
 console.error("Failed to decode BGM track", e);
 }
 return null;
 };

 const buildAudioGraph = async (ctx: BaseAudioContext, targetDuration: number, isPreview = false) => {
 // 4. Soft Clipper / Peak Limiter Master Bus to prevent harsh pumping
 const masterRoute = ctx.createDynamicsCompressor();
 masterRoute.threshold.value = -3;
 masterRoute.knee.value = 5;
 masterRoute.ratio.value = 10;
 masterRoute.attack.value = 0.005;
 masterRoute.release.value = 0.1;
 
 let outNode: AudioNode = masterRoute;
 let duckingGainNode: GainNode | null = null;
 if (isPreview) {
 duckingGainNode = ctx.createGain();
 duckingGainNode.gain.value = 1.0;
 masterRoute.connect(duckingGainNode);
 outNode = duckingGainNode;
 }
 
 outNode.connect(ctx.destination);

 const activeSources: AudioBufferSourceNode[] = [];

 // Background Brown Noise Masking
 if (maskingNoiseLevel > 0) {
 const noiseBuffer = createBrownNoiseBuffer(ctx);
 const noiseSrc = ctx.createBufferSource();
 noiseSrc.buffer = noiseBuffer;
 noiseSrc.loop = true;
 
 const noiseGain = ctx.createGain();
 noiseGain.gain.value = (maskingNoiseLevel / 100) * 0.12; // Modest volume to hide subliminals

 noiseSrc.connect(noiseGain).connect(masterRoute);
 noiseSrc.start(0);
 
 if (!isPreview) {
 noiseSrc.stop(targetDuration);
 }
 activeSources.push(noiseSrc);
 }

 // Brainwave Injection (Theta 6Hz)
 if (brainwaveOn) {
 const oscL = ctx.createOscillator();
 const oscR = ctx.createOscillator();
 oscL.frequency.value = 400;
 oscR.frequency.value = 406;
 
 const pannerL = ctx.createStereoPanner();
 const pannerR = ctx.createStereoPanner();
 pannerL.pan.value = -1;
 pannerR.pan.value = 1;
 
 const outGain = ctx.createGain();
 outGain.gain.value = 0.15; // Low volume for brainwaves
 
 oscL.connect(pannerL).connect(outGain);
 oscR.connect(pannerR).connect(outGain);
 outGain.connect(masterRoute);
 
 oscL.start(0);
 oscR.start(0);
 if (!isPreview) {
 oscL.stop(targetDuration);
 oscR.stop(targetDuration);
 }
 }

 // Process Sidechain Dynamic Sync BGM
 let dynamicModulator: AudioNode | null = null;
 if (bgmFile) {
 const decodedBgm = await decodeBgm({ id: 'bgm', source: bgmFile, volume: 1 }, ctx);
 if (decodedBgm) {
 const bgmSrc = ctx.createBufferSource();
 bgmSrc.buffer = decodedBgm;
 bgmSrc.loop = true;
 
 // Music plays directly to destination (uncompressed by the subliminal limiter)
 const bgmGain = ctx.createGain();
 bgmGain.gain.value = 0.8;
 bgmSrc.connect(bgmGain).connect(ctx.destination);
 
 if (bgmSync) {
 // Envelope Follower
 const rectifier = ctx.createWaveShaper();
 const curve = new Float32Array(4096);
 for (let i = 0; i < 4096; i++) {
 const x = (i * 2) / 4096 - 1;
 curve[i] = Math.abs(x);
 }
 rectifier.curve = curve;
 
 const lpFilter = ctx.createBiquadFilter();
 lpFilter.type = 'lowpass';
 lpFilter.frequency.value = 1.5; // Very slow reaction ~ 0.6s
 
 const depthGain = ctx.createGain();
 depthGain.gain.value = 5.0; // Dynamic Range expand factor
 
 bgmSrc.connect(rectifier).connect(lpFilter).connect(depthGain);
 dynamicModulator = depthGain;
 }
 
 bgmSrc.start(0);
 if (!isPreview) {
 bgmSrc.stop(targetDuration);
 }
 activeSources.push(bgmSrc);
 }
 }

 // Process Voice Matrix
 if (affirmations.trim()) {
 const lines = affirmations.split('\n').filter(l => l.trim().length > 0);
 const voiceBuffers: AudioBuffer[] = [];
 
 // Batch fetch TTS buffers (parallelize to avoid slow sequential fetching)
 const fetchCount = Math.min(lines.length, 4);
 const ttPromises = [];
 for (let i = 0; i < fetchCount; i++) {
 ttPromises.push(textToAudioBuffer(lines[i], speed, ctx));
 }
 
 const results = await Promise.all(ttPromises);
 voiceBuffers.push(...results);

 if (voiceBuffers.length === 0) return { activeSources, duckingGainNode };

 const createSubliminalChain = (modType: MatrixType, buffer: AudioBuffer, delay: number) => {
 const voiceSrc = ctx.createBufferSource();
 
 let processedBuffer = buffer;
 if (modType === 'reverse' || modType === 'chaos') {
 // Reverse requires flipping Float32Array in place
 processedBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
 for (let c = 0; c < buffer.numberOfChannels; c++) {
 const data = buffer.getChannelData(c);
 const cloneData = processedBuffer.getChannelData(c);
 for (let i = 0; i < data.length; i++) cloneData[i] = data[data.length - 1 - i];
 }
 }
 
 voiceSrc.buffer = processedBuffer;
 voiceSrc.playbackRate.value = speed;
 voiceSrc.loop = true; 

 let lastNode: AudioNode = voiceSrc;

 if (modType === 'whisper') {
 const wGain = ctx.createGain();
 wGain.gain.value = 0.05; // 4-5% volume threshold
 lastNode.connect(wGain);
 lastNode = wGain;
 } 
 else if (modType === 'silent') {
 // Carrier AM Modulation (DSB-SC structure via GainNode)
 const carrier = ctx.createOscillator();
 carrier.frequency.value = carrierFreq;
 
 const amGain = ctx.createGain();
 amGain.gain.value = 0; // Carrier Suppressed! completely removes idle hum.
 
 // Lowpass filter voice to limit sideband spread and remove hum
 const vLP = ctx.createBiquadFilter();
 vLP.type = 'lowpass';
 vLP.frequency.value = 4000;
 
 lastNode.connect(vLP).connect(amGain.gain);
 carrier.connect(amGain);
 
 carrier.start(0);
 lastNode = amGain;
 }
 else if (modType === 'spatial' || modType === 'chaos') {
 const panner = ctx.createStereoPanner();
 const lfo = ctx.createOscillator();
 lfo.frequency.value = 0.1; // Slow sweep
 
 lfo.connect(panner.pan);
 lastNode.connect(panner);
 
 lfo.start(0);
 lastNode = panner;
 }

 const finalVoiceGain = ctx.createGain();
 const baseVol = modType === 'silent' ? 1.0 : 0.8;
 const mappedVolume = Math.pow(voiceVolume / 100, 2); // Exponential volume curve for realistic perception
 
 if (dynamicModulator) {
 // Dynamic Expansion: Base volume is 15% of target, the rest 85% is added by BGM envelope
 finalVoiceGain.gain.value = baseVol * mappedVolume * 0.15;
 
 const scaledDepthGain = ctx.createGain();
 scaledDepthGain.gain.value = baseVol * mappedVolume * 0.85; 
 dynamicModulator.connect(scaledDepthGain);
 scaledDepthGain.connect(finalVoiceGain.gain);
 
 lastNode.connect(finalVoiceGain).connect(masterRoute);
 } else {
 finalVoiceGain.gain.value = baseVol * mappedVolume;
 lastNode.connect(finalVoiceGain).connect(masterRoute);
 }
 
 voiceSrc.start(delay);
 activeSources.push(voiceSrc);
 };

 if (matrixType === 'chaos') {
 // Multi-core Hyper Chaos: Distribute buffers across all matrices with staggered starts
 const types: MatrixType[] = ['whisper', 'reverse', 'spatial'];
 if (chaosIncludeSilent) types.push('silent');
 voiceBuffers.forEach((buf, i) => {
 createSubliminalChain(types[i % types.length], buf, i * 2.5); // Stagger by 2.5s
 });
 } else {
 // Single mode apply to all
 voiceBuffers.forEach((buf, i) => {
 createSubliminalChain(matrixType, buf, i * 1.5);
 });
 }
 }

 return { activeSources, duckingGainNode };
 };

 const handleRenderOrPlay = async (mode: 'preview' | 'export') => {
 setIsRendering(true);
 try {
 const TARGET_DURATION = 300; // 5 mins

 if (mode === 'export') {
 const offlineCtx = new OfflineAudioContext(2, 44100 * TARGET_DURATION, 44100);
 await buildAudioGraph(offlineCtx, TARGET_DURATION, false);
 
 const renderedBuffer = await offlineCtx.startRendering();
 const wavBlob = await audioBufferToWav(renderedBuffer);
 const url = URL.createObjectURL(wavBlob);
 setMasterBlobUrl(url);

 // Auto download
 const a = document.createElement('a');
 a.style.display = 'none';
 a.href = url;
 const fileName = `Subliminal_Master_${Date.now()}.wav`;
 a.download = fileName;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);

 const id = Date.now().toString();
 await saveTrackDB({ id, name: fileName, rawBlob: wavBlob, type: matrixType });
 setExportedLibrary(prev => [...prev, { id, name: fileName, url, type: matrixType }]);

 } else if (mode === 'preview') {
 stopPlayback(); 
 
 const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
 const rtCtx = new AudioContextClass();
 rtContextRef.current = rtCtx;
 
 const { activeSources: sources, duckingGainNode } = await buildAudioGraph(rtCtx, TARGET_DURATION, true);
 activeSourceNodesRef.current = sources;
 globalDuckingGainRef.current = duckingGainNode;
 
 setIsPlaying(true);
 setActiveStep(4);
 }
 } catch (err) {
 console.error(err);
 alert("聲學引擎渲染發生錯誤");
 } finally {
 setIsRendering(false);
 }
 };

 const stopPlayback = () => {
 if (rtContextRef.current) {
 rtContextRef.current.close().catch(console.error);
 rtContextRef.current = null;
 }
 if (backgroundAudioRef.current) {
 backgroundAudioRef.current.pause();
 }
 setIsPlaying(false);
 setProgress(0);
 activeSourceNodesRef.current = [];
 };

 // Progress Simulation for Preview 
 useEffect(() => {
 let interval: any;
 let duckingInterval: any;
 if (isPlaying) {
 interval = setInterval(() => {
 setProgress(p => {
 if (p >= 300) { stopPlayback(); return 300; }
 return p + 1;
 });
 }, 1000);
 
 // Auto-Ducking for external web players
 duckingInterval = setInterval(() => {
 if (!globalDuckingGainRef.current || !rtContextRef.current) return;
 
 // Find all audio elements, including possible Shadow DOM from meting-js
 const audios: HTMLAudioElement[] = Array.from(document.querySelectorAll('audio'));
 document.querySelectorAll('meting-js').forEach(m => {
 if (m.shadowRoot) {
 audios.push(...Array.from(m.shadowRoot.querySelectorAll('audio')));
 }
 });
 
 // Also check if any external embedded iframe is present. If there are no audios found but an iframe is, we cannot precise-duck.
 // But if audios exist, we use them.
 let shouldDuck = false;
 
 if (audios.length > 0) {
 let hasSafePlayingAudio = false;
 audios.forEach(a => {
 if (!a.paused && !a.muted && a.readyState >= 3) {
 const t = a.currentTime;
 const d = a.duration;
 if (!isNaN(t) && !isNaN(d) && d > 0) {
 // Safe zone: after 5s from start, before 5s to end
 if (t >= 5 && (d - t) >= 5) {
 hasSafePlayingAudio = true;
 }
 }
 }
 });
 // Duck if no audio is playing in the safe zone (e.g. paused, buffering, gap, or edges)
 shouldDuck = !hasSafePlayingAudio;
 } else {
 // No direct audio elements found. If they use iframe, we can't sync, so we just let it play or duck it if no music at all.
 // But we don't know if music is playing in iframe.
 shouldDuck = false;
 }
 
 // Apply ducking to master subliminal layer (0.001 volume vs 1.0)
 // using linear ramp to avoid clicks
 const currentGain = globalDuckingGainRef.current.gain.value;
 const targetGain = shouldDuck ? 0.001 : 1.0;
 
 if (Math.abs(currentGain - targetGain) > 0.01) {
 globalDuckingGainRef.current.gain.setTargetAtTime(
 targetGain, 
 rtContextRef.current.currentTime, 
 0.5 // time constant for smooth transition ~1.5s
 );
 }
 }, 500);

 } else {
 clearInterval(interval);
 clearInterval(duckingInterval);
 }
 return () => {
 clearInterval(interval);
 clearInterval(duckingInterval);
 };
 }, [isPlaying]);

 return (
 <div className="fixed inset-0 bg-white text-slate-800 selection:bg-blue-200/60 overflow-hidden select-none flex flex-col paper-bg">
 {/* Top Bar: Industrial Navigation */}
 <header className="h-14 shrink-0 border-b border-[#b9c0c8] bg-white/95 backdrop-blur flex items-center justify-center px-4 z-10 relative">
 <div className="flex items-center gap-2">
 <span className="w-10 h-10 rounded-lg bg-white border border-[#b9c0c8] flex items-center justify-center overflow-hidden sketch-border">
 <img
 src="/logo.png"
 alt="潛意識音頻"
 className="h-full w-full object-cover"
 draggable="false"
 />
 </span>
 <h1 className="text-lg md:text-xl text-[#005599]">Subliminal</h1>
 </div>
 <button
 onClick={() => setIsSettingsOpen(true)}
 className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-white border border-[#b9c0c8] text-slate-700 hover:text-[#005599] shadow-[1.5px_1.5px_0_rgba(31,41,55,0.09)]"
 aria-label="打開設定"
 title="設定"
 >
 <Settings2 className="w-4 h-4" />
 </button>
 </header>

 {isSettingsOpen && (
 <div className="fixed inset-0 z-40 bg-white/70 backdrop-blur-sm flex items-center justify-center p-4">
 <div className="w-full max-w-md bg-white border border-[#b9c0c8] rounded-lg sketch-border paper-dots p-5 space-y-4">
 <div className="flex items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <span className="w-8 h-8 rounded-lg bg-white border border-[#b9c0c8] flex items-center justify-center overflow-hidden sketch-border">
 <img src="/logo.png" alt="" className="h-full w-full object-cover" draggable="false" />
 </span>
 <div>
 <h2 className="text-slate-900 leading-none">AI 設定</h2>
 <p className="text-slate-500 mt-1">Cloudflare Worker 自訂介面</p>
 </div>
 </div>
 <button
 onClick={() => setIsSettingsOpen(false)}
 className="w-8 h-8 rounded-lg border border-[#b9c0c8] bg-white text-slate-500 hover:text-red-500 sketch-border"
 aria-label="關閉設定"
 >
 ×
 </button>
 </div>

 <label className="block space-y-1.5">
 <span className="text-slate-700 flex items-center">Worker 連結</span>
 <input
 value={aiEndpoint}
 onChange={(e) => setAiEndpoint(e.target.value)}
 className="w-full h-10 px-3 input-box outline-none focus:border-[#005599]"
 placeholder="https://your-worker.yourname.workers.dev"
 />
 </label>

 <label className="block space-y-1.5">
 <span className="text-slate-700 flex items-center">API Key</span>
 <input
 value={aiApiKey}
 onChange={(e) => setAiApiKey(e.target.value)}
 className="w-full h-10 px-3 input-box outline-none focus:border-[#005599]"
 placeholder="Worker 存取密鑰"
 type="password"
 />
 </label>

 <label className="block space-y-1.5">
 <span className="text-slate-700 flex items-center">模型名稱</span>
 <input
 value={aiModel}
 onChange={(e) => setAiModel(e.target.value)}
 className="w-full h-10 px-3 input-box outline-none focus:border-[#005599]"
 placeholder="gemini-2.5-flash"
 />
 </label>

 <div className="text-slate-500 leading-relaxed paper-stripes border border-[#b9c0c8] rounded-lg p-3">
 留空 Worker 連結時會使用本地介面。填寫後，請確保 Worker 返回 JSON：<span className="text-[#005599]">{"{ affirmations: \"...\" }"}</span>
 </div>

 <div className="grid grid-cols-2 gap-2">
 <button
 onClick={() => {
 setAiEndpoint('');
 setAiApiKey('');
 setAiModel('gemini-2.5-flash');
 }}
 className="h-10 rounded-lg bg-white border border-[#b9c0c8] text-slate-600 sketch-border"
 >
 重置
 </button>
 <button
 onClick={() => setIsSettingsOpen(false)}
 className="h-10 rounded-lg bg-white border border-[#005599] text-[#005599] sketch-border"
 >
 儲存
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Main Workspace Grid */}
 <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-4 bg-white overflow-hidden min-h-0 relative lg:p-4 paper-bg">
 
 {/* Left Col: Intent & Content (Steps 1 & 2) */}
 <section className={`lg:col-span-4 bg-white p-4 lg:p-5 lg:overflow-hidden min-h-0 relative z-10 lg:rounded-lg lg:border lg:border-[#b9c0c8] lg:shadow-sm lg:sketch-border ${activeTab === 'create' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'} gap-3`}>
 <div>
 <textarea 
 value={topic}
 onChange={(e) => setTopic(toTraditional(e.target.value))}
 className="w-full h-24 lg:h-32 p-3 input-box focus:border-blue-400 outline-none resize-none text-left leading-relaxed"
 placeholder="輸入內容..."
 />
 <div className="grid grid-cols-2 gap-2 mt-2">
 <select 
 value={density} 
 onChange={(e) => setDensity(e.target.value as Density)}
 className="h-10 px-2.5 py-0 input-box appearance-none cursor-pointer text-center"
 >
 <option value="low">密度: 核心植入 (3-5句)</option>
 <option value="mid">密度: 系統覆蓋 (10-15句)</option>
 <option value="high">密度: 飽和打擊 (15-30句)</option>
 </select>
 <select 
 value={tense} 
 onChange={(e) => setTense(e.target.value as Tense)}
 className="h-10 px-2.5 py-0 input-box appearance-none cursor-pointer text-center"
 >
 <option value="mixed">時態: 混合交織 (推薦)</option>
 <option value="progressive">時態: 漸進顯化 (進行中)</option>
 <option value="completed">時態: 終極重塑 (完成態)</option>
 </select>
 </div>
 <div className="flex gap-2 mt-3">
 <button onClick={handleClear} className="px-4 py-2.5 bg-white hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors rounded-lg border border-[#b9c0c8] sketch-border flex items-center justify-center">清空</button>
 <button 
 onClick={handleGenerate}
 disabled={(activeStep > 1 && !affirmations) || isGenerating}
 className="flex-1 py-3 bg-white hover:bg-[#fff8d8] text-[#005599] border border-[#005599] transition-colors rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 sketch-border"
 >
 {isGenerating ? <Activity className="w-4 h-4 animate-spin" /> : null}
 {isGenerating ? '正在透過 AI 深層拆解重塑...' : '生成中'}
 </button>
 </div>
 </div>

 <div className={`flex-1 flex flex-col ${activeStep < 2 ? 'step-lock' : 'active-step'} min-h-0`}>
 <div className="flex-1 relative flex flex-col">
 <textarea 
 value={affirmations}
 onChange={(e) => setAffirmations(toTraditional(e.target.value))}
 className="w-full flex-1 min-h-0 p-4 input-box leading-relaxed resize-none focus:outline-none focus:border-blue-400 text-left"
 spellCheck="false"
 />
 <div className="absolute top-2 right-2 flex gap-1">
 <span className={`px-2 py-0.5 rounded-md border sketch-border inline-flex items-center ${activeStep >= 3 ? 'bg-[#fff8d8] text-[#005599] border-[#ffc809]' : 'bg-red-50 text-red-500 border-red-100'}`}>
 {activeStep >= 3 ? '已鎖定' : '編輯中'}
 </span>
 </div>
 <button 
 onClick={() => setActiveStep(activeStep >= 3 ? 2 : 3)}
 className="w-full py-2.5 mt-2 bg-white border border-[#8c96a3] hover:bg-slate-50 text-slate-800 transition-all rounded-lg sketch-border block text-center"
 >
 {activeStep >= 3 ? '已解鎖 - 點擊重新鎖定' : '確認並鎖定底層矩陣'}
 </button>
 </div>
 </div>
 </section>

 {/* Mid Col: Engine & Master (Step 3 & 4) */}
 <section className={`lg:col-span-4 bg-white p-4 lg:p-5 lg:overflow-hidden min-h-0 lg:rounded-lg lg:border lg:border-[#b9c0c8] lg:shadow-sm lg:sketch-border active-step ${activeTab === 'engine' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'} gap-3`}>
 <div className="space-y-2.5 flex-1 flex flex-col min-h-0">
 <div className="px-4 py-3 glass rounded-lg shrink-0 h-[46px] flex items-center sketch-border">
 <select 
 value={matrixType} 
 onChange={(e) => setMatrixType(e.target.value as MatrixType)}
 className="w-full h-full bg-transparent border-none text-slate-700 outline-none cursor-pointer text-left leading-none"
 >
 <option value="chaos">多核混沌矩陣</option>
 <option value="whisper">超低頻耳語矩陣</option>
 <option value="reverse">逆向邏輯倒放矩陣</option>
 <option value="silent">超聲波 潛意識</option>
 <option value="spatial">立體聲 軌道環繞</option>
 </select>
 </div>

 <div className="grid grid-cols-2 gap-2.5 shrink-0">
 <div className="px-3 py-3 glass rounded-lg flex items-center justify-between select-none h-[46px] sketch-border" onClick={() => setBrainwaveOn(!brainwaveOn)}>
 <div>
 <span className="text-slate-600 leading-tight text-[15px]">立體聲雙耳節拍</span>
 </div>
 <div className={`w-9 h-5 border rounded-full flex items-center px-1 transition-colors ${brainwaveOn ? 'bg-blue-100 border-blue-300' : 'bg-slate-100 border-slate-300'}`}>
 <div className={`w-3 h-3 rounded-full transition-transform ${brainwaveOn ? 'bg-blue-600 translate-x-4' : 'bg-slate-400'}`} />
 </div>
 </div>
 {matrixType === 'chaos' && (
 <div className="px-3 py-3 glass rounded-lg flex items-center justify-between select-none h-[46px] sketch-border" onClick={() => setChaosIncludeSilent(!chaosIncludeSilent)}>
 <div>
 <span className="text-slate-600 leading-tight">超聲波高頻</span>
 </div>
 <div className={`w-9 h-5 border rounded-full flex items-center px-1 transition-colors ${chaosIncludeSilent ? 'bg-emerald-100 border-emerald-300' : 'bg-slate-100 border-slate-300'}`}>
 <div className={`w-3 h-3 rounded-full transition-transform ${chaosIncludeSilent ? 'bg-emerald-600 translate-x-4' : 'bg-slate-400'}`} />
 </div>
 </div>
 )}
 </div>

 <div className="space-y-2.5 shrink-0 bg-white border border-[#b9c0c8] rounded-lg p-4 shadow-sm sketch-border paper-stripes">
 <div>
 <div className="flex justify-between mb-1.5">
 <span className="text-slate-600 leading-tight">潛意識人聲倍速</span>
 <span className="text-[#005599]">{speed.toFixed(1)}x</span>
 </div>
 <input 
 type="range" min="0.8" max="2.5" step="0.1" value={speed} 
 onChange={(e) => setSpeed(parseFloat(e.target.value))}
 className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none outline-none" 
 />
 </div>

 <div>
 <div className="flex justify-between mb-1.5 mt-2.5">
 <span className="text-slate-600 leading-tight">潛意識人聲音量</span>
 <span className="text-[#005599]">{voiceVolume}%</span>
 </div>
 <input 
 type="range" min="0" max="200" step="5" value={voiceVolume} 
 onChange={(e) => setVoiceVolume(parseInt(e.target.value))}
 className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none outline-none" 
 />
 </div>

 {(matrixType === 'silent' || (matrixType === 'chaos' && chaosIncludeSilent)) && (
 <div>
 <div className="flex justify-between mb-1.5 mt-2.5 text-[#01712a]">
 <span>無聲載波頻率微調</span>
 <span>{carrierFreq} Hz</span>
 </div>
 <input 
 type="range" min="14000" max="22000" step="100" value={carrierFreq} 
 onChange={(e) => setCarrierFreq(parseInt(e.target.value))}
 className="w-full accent-[#01712a] h-1 bg-slate-200 rounded-full appearance-none outline-none" 
 />
 </div>
 )}

 {/* Advanced BGM & White Noise Section */}
 <div className="mt-2.5 grid grid-cols-2 gap-2.5">
 <div className="px-3 py-2 glass rounded-lg h-[44px] flex items-center sketch-border">
 <div className="flex items-center gap-2">
 <input 
 type="file" 
 accept="audio/*" 
 id="bgm-upload" 
 className="hidden" 
 onChange={(e) => {
 const file = e.target.files?.[0];
 if (file) setBgmFile(file);
 }}
 />
 <label 
 htmlFor="bgm-upload" 
 className="text-slate-600 cursor-pointer hover:text-[#005599] truncate inline-flex items-center h-full"
 >
 {bgmFile ? bgmFile.name : '混合本地BGM'}
 </label>
 {bgmFile && (
 <button 
 onClick={() => setBgmFile(null)}
 className="text-red-500 hover:underline"
 >
 ×
 </button>
 )}
 </div>
 </div>

 <div className="px-3 py-2 glass rounded-lg h-[44px] flex items-center gap-3 sketch-border">
 <select 
 value={whiteNoiseType}
 onChange={(e) => setWhiteNoiseType(e.target.value)}
 className="h-full bg-transparent border-none text-slate-600 outline-none cursor-pointer leading-none min-w-0"
 >
 <option value="none">無白噪音</option>
 <option value="rain">雨聲</option>
 <option value="fire">篝火</option>
 <option value="ocean">海浪</option>
 <option value="forest">森林</option>
 <option value="wind">風聲</option>
 </select>
 {whiteNoiseType !== 'none' && (
 <input 
 type="range" 
 min="0" max="100" 
 value={whiteNoiseVolume}
 onChange={(e) => setWhiteNoiseVolume(parseInt(e.target.value))}
 className="w-16 accent-slate-500 h-1 bg-slate-200 rounded-full appearance-none outline-none"
 />
 )}
 </div>
 </div>

 </div>

 <hr className="border-[#c8ced6]" />

 <div className="flex-1 flex flex-col gap-3">
 <button 
 onClick={() => isPlaying ? stopPlayback() : handleRenderOrPlay('preview')}
 disabled={isRendering || activeStep < 3}
 className={`w-full h-12 rounded-lg shrink-0 flex items-center justify-center gap-2 transition text-sm ${
 isPlaying 
 ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 sketch-border' 
 : 'bg-white hover:bg-[#fff8d8] text-[#005599] border border-[#005599] sketch-border'
 } disabled:opacity-50 disabled:cursor-not-allowed`}
 >
 {isPlaying ? (
 <>
 <Square className="w-4 h-4 fill-current"/>
 停止試聽
 </>
 ) : (
 <>
 <Play className="w-5 h-5 fill-current"/>
 開始生成中
 </>
 )}
 </button>

 <div className="space-y-3 shrink-0">
 <div className="grid grid-cols-2 gap-2">
 <button 
 onClick={stopPlayback}
 className="py-2.5 bg-white border border-[#b9c0c8] text-slate-600 hover:bg-slate-50 transition rounded-lg sketch-border"
 >
 重置引擎
 </button>
 <button 
 onClick={() => handleRenderOrPlay('export')}
 disabled={isRendering || activeStep < 3}
 className="py-2.5 bg-white border border-[#005599] flex items-center justify-center gap-2 text-[#005599] hover:bg-[#fff8d8] transition rounded-lg disabled:opacity-50 sketch-border"
 >
 {isRendering ? <Activity className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3" />}
 匯出 WAV 母帶
 </button>
 </div>
 </div>
 </div>
 </div>
 </section>

 {/* Right Col: Personal Music Space */}
 <section className={`lg:col-span-4 bg-white p-4 lg:p-5 lg:overflow-hidden min-h-0 relative z-10 lg:rounded-lg lg:border lg:border-[#b9c0c8] lg:shadow-sm lg:sketch-border ${activeTab === 'player' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'} gap-3`}>
 <div className="flex-1 flex flex-col gap-3 min-h-0">
 <div className="shrink-0 bg-white border border-[#b9c0c8] rounded-lg p-1 grid grid-cols-2 gap-1 shadow-sm sketch-border paper-dots">
 <button
 onClick={() => setPlayerPanel('recordings')}
 className={`h-11 rounded-md flex items-center justify-center gap-2 transition focus:outline-none ${
 playerPanel === 'recordings'
 ? 'bg-white text-[#005599] border border-[#005599] sketch-border'
 : 'text-slate-500 hover:text-slate-700 border border-transparent'
 }`}
 >
 <MiffyMark />
 錄音檔 <span className="text-slate-400">{exportedLibrary.length}</span>
 </button>
 <button
 onClick={() => setPlayerPanel('playlist')}
 className={`h-11 rounded-md flex items-center justify-center gap-2 transition focus:outline-none ${
 playerPanel === 'playlist'
 ? 'bg-white text-[#01712a] border border-[#01712a] sketch-border'
 : 'text-slate-500 hover:text-slate-700 border border-transparent'
 }`}
 >
 <Sparkles className="w-4 h-4" />
 外部歌單
 </button>
 </div>

 {playerPanel === 'recordings' ? (
 <div className="flex-1 flex flex-col bg-white border border-[#b9c0c8] rounded-lg p-4 overflow-hidden min-h-0 shadow-sm sketch-border">
 <div className="shrink-0 flex items-center justify-between gap-3 mb-3">
 <span className="text-slate-700 flex items-center gap-1.5">
 <MiffyMark className="scale-75" />
 我的潛意識音頻
 </span>
 <span className="text-[#005599] bg-white border border-[#005599] px-2 py-1 rounded-md sketch-border inline-flex items-center">
 Local Archive
 </span>
 </div>
 <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
 {exportedLibrary.length === 0 ? (
 <div className="h-full min-h-[180px] text-slate-400 border border-dashed border-[#b9c0c8] rounded-lg flex items-center justify-center text-center paper-stripes">
 暫無錄音檔
 </div>
 ) : (
 exportedLibrary.map(track => (
 <TrackPlayerCard
 key={track.id}
 track={track}
 onDelete={handleDeleteTrack}
 onRename={handleRenameTrack}
 />
 ))
 )}
 </div>
 </div>
 ) : (
 <div className="flex-1 flex flex-col bg-white border border-[#b9c0c8] rounded-lg p-4 overflow-hidden min-h-0 shadow-sm sketch-border">
 <div className="shrink-0 flex items-start justify-between gap-3 mb-3">
 <span className="text-slate-700 block leading-5">外部環境音樂/歌單</span>
 <span className="text-[#01712a] bg-white border border-[#01712a] px-2 py-1 rounded-md flex items-center gap-1 leading-none sketch-border">
 <Sparkles className="w-2.5 h-2.5" />
 Auto-Ducking
 </span>
 </div>
 <textarea
 value={externalMusicLink}
 onChange={(e) => setExternalMusicLink(e.target.value)}
 className="shrink-0 w-full h-20 bg-white border border-[#b9c0c8] text-slate-700 p-3 rounded-lg outline-none focus:border-emerald-400 resize-none mb-3 break-all paper-stripes"
 placeholder="貼上網易雲、Spotify 或直接音頻連結..."
 />
 <div className="flex-1 min-h-[180px] w-full relative flex items-center justify-center rounded-lg overflow-y-auto custom-scrollbar bg-white border border-[#b9c0c8] paper-dots">
 {externalMusicLink.trim() ? (
 <EmbedPlayer link={externalMusicLink} />
 ) : (
 <div className="text-slate-400 w-full h-full min-h-[180px] flex items-center justify-center text-center">
 輸入連結以載入播放器
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 </section>
 </main>

 {/* Bottom Navigation for Mobile */}
 <nav className="lg:hidden shrink-0 border-t border-[#b9c0c8] bg-white flex justify-around pb-safe z-20 items-center h-14 shadow-[0_-8px_24px_rgba(31,41,55,0.04)]">
 <button onClick={() => setActiveTab('create')} className={`flex items-center justify-center flex-1 h-full focus:outline-none ${activeTab === 'create' ? 'text-[#005599]' : 'text-slate-400 hover:text-slate-600'}`}>
 <Sparkles className="w-5 h-5" />
 </button>
 <button onClick={() => setActiveTab('engine')} className={`flex items-center justify-center flex-1 h-full focus:outline-none ${activeTab === 'engine' ? 'text-[#005599]' : 'text-slate-400 hover:text-slate-600'}`}>
 <Settings2 className="w-5 h-5" />
 </button>
 <button onClick={() => setActiveTab('player')} className={`flex items-center justify-center flex-1 h-full focus:outline-none ${activeTab === 'player' ? 'text-[#005599]' : 'text-slate-400 hover:text-slate-600'}`}>
 <Headphones className="w-5 h-5" />
 </button>
 </nav>
 </div>
 );
}
