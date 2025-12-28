
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Track, PlayerState, AIInsight, SmartPlaylist } from './types';
import Visualizer from './components/Visualizer';
import { getTrackInsight } from './services/geminiService';

const MOOD_OPTIONS = ['Energetic', 'Chill', 'Melancholic', 'Focus', 'Happy', 'Dark'];

const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTrackIndex: -1,
    volume: 0.7,
    currentTime: 0,
    repeatMode: 'none',
    isShuffle: false,
  });
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylist[]>([]);
  const [activeSmartPlaylistId, setActiveSmartPlaylistId] = useState<string | null>(null);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [showCreateSmart, setShowCreateSmart] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Derived state: filtered tracks based on active smart playlist
  const displayedTracks = useMemo(() => {
    if (!activeSmartPlaylistId) return tracks;
    const playlist = smartPlaylists.find(p => p.id === activeSmartPlaylistId);
    if (!playlist) return tracks;
    return tracks.filter(t => t.insight?.mood.toLowerCase() === playlist.criteria.mood?.toLowerCase());
  }, [tracks, activeSmartPlaylistId, smartPlaylists]);

  const currentTrack = displayedTracks[playerState.currentTrackIndex] || null;

  // AI Insight (vibe color) for the currently playing track
  const activeVibe = currentTrack?.insight?.vibe || '#3b82f6';

  // Initialize Web Audio API
  useEffect(() => {
    if (!audioRef.current || audioContextRef.current) return;
    const initAudio = () => {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      const source = context.createMediaElementSource(audioRef.current!);
      source.connect(analyser);
      analyser.connect(context.destination);
      analyser.fftSize = 256;
      audioContextRef.current = context;
      analyserRef.current = analyser;
    };
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  // Sync current time and audio end
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime }));
    audio.addEventListener('timeupdate', updateTime);
    const handleEnded = () => nextTrack();
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [playerState.currentTrackIndex, playerState.repeatMode, displayedTracks]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = playerState.volume;
  }, [playerState.volume]);

  // Background Analysis for new tracks
  useEffect(() => {
    const analyzeUnprocessed = async () => {
      const unprocessed = tracks.find(t => !t.insight);
      if (unprocessed && !isInsightLoading) {
        setIsInsightLoading(true);
        const insight = await getTrackInsight(unprocessed.title, unprocessed.artist);
        if (insight) {
          setTracks(prev => prev.map(t => t.id === unprocessed.id ? { ...t, insight } : t));
        }
        setIsInsightLoading(false);
      }
    };
    analyzeUnprocessed();
  }, [tracks, isInsightLoading]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newTracks: Track[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Local Artist",
      album: "Local Storage",
      duration: 0,
      url: URL.createObjectURL(file),
      coverArt: `https://picsum.photos/seed/${file.name}/400/400`
    }));
    setTracks(prev => [...prev, ...newTracks]);
    if (playerState.currentTrackIndex === -1 && newTracks.length > 0) {
      playTrack(0);
    }
  };

  const playTrack = (index: number) => {
    if (index < 0 || index >= displayedTracks.length) return;
    setPlayerState(prev => ({ ...prev, currentTrackIndex: index, isPlaying: true }));
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
  };

  const togglePlay = () => {
    if (playerState.currentTrackIndex === -1 && displayedTracks.length > 0) {
      playTrack(0);
      return;
    }
    setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  useEffect(() => {
    if (audioRef.current) {
      if (playerState.isPlaying) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [playerState.isPlaying, playerState.currentTrackIndex]);

  const nextTrack = () => {
    if (playerState.repeatMode === 'one') {
      if (audioRef.current) audioRef.current.currentTime = 0;
      audioRef.current?.play();
      return;
    }
    let nextIndex = playerState.currentTrackIndex + 1;
    if (nextIndex >= displayedTracks.length) {
      nextIndex = playerState.repeatMode === 'all' ? 0 : playerState.currentTrackIndex;
    }
    playTrack(nextIndex);
  };

  const prevTrack = () => {
    let prevIndex = playerState.currentTrackIndex - 1;
    if (prevIndex < 0) {
      prevIndex = playerState.repeatMode === 'all' ? displayedTracks.length - 1 : 0;
    }
    playTrack(prevIndex);
  };

  const createSmartPlaylist = (mood: string) => {
    const newPlaylist: SmartPlaylist = {
      id: Math.random().toString(36).substr(2, 9),
      name: `${mood} Vibes`,
      criteria: { mood }
    };
    setSmartPlaylists(prev => [...prev, newPlaylist]);
    setShowCreateSmart(false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = time;
    setPlayerState(prev => ({ ...prev, currentTime: time }));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setPlayerState(prev => ({ ...prev, volume: vol }));
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-900 overflow-hidden relative shadow-2xl text-slate-100">
      {/* Dynamic Background Glow */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none transition-colors duration-1000"
        style={{ background: `radial-gradient(circle at top, ${activeVibe} 0%, transparent 70%)` }}
      />

      {/* Header */}
      <header className="p-6 flex justify-between items-center z-10 bg-slate-900/40 backdrop-blur-lg border-b border-white/5">
        <button onClick={() => setShowPlaylist(true)} className="text-slate-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="text-center">
            <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">SKY - SCS</h1>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-white transition-all bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/5 active:scale-95">
          <span className="text-[9px] font-black uppercase tracking-widest">Load</span>
          <input type="file" multiple accept="audio/mp3" onChange={handleFileUpload} className="hidden" />
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </label>
      </header>

      {/* Main View: Music List instead of Large Photo */}
      <main className="flex-1 flex flex-col z-10 overflow-hidden">
        
        {/* Scrollable Music List */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 custom-scrollbar">
          <div className="space-y-2 mb-6">
            {displayedTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-slate-600 opacity-50">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm font-bold uppercase tracking-widest">No Tracks Found</p>
                <p className="text-xs">Click the Load + icon to add MP3 files</p>
              </div>
            ) : (
              displayedTracks.map((track, idx) => (
                <button 
                  key={track.id} 
                  onClick={() => playTrack(idx)}
                  className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all relative overflow-hidden group ${idx === playerState.currentTrackIndex ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5 active:scale-[0.98]'}`}
                >
                  {/* Active Background Glow */}
                  {idx === playerState.currentTrackIndex && (
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundColor: activeVibe }} />
                  )}
                  
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <img src={track.coverArt} className={`w-full h-full rounded-xl object-cover shadow-lg transition-transform duration-500 ${idx === playerState.currentTrackIndex && playerState.isPlaying ? 'scale-105' : 'scale-100'}`} alt="" />
                    {idx === playerState.currentTrackIndex && playerState.isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                        <div className="flex gap-0.5 items-end h-3">
                          <div className="w-0.5 bg-white animate-[bounce_0.6s_infinite] h-1" style={{ animationDelay: '0s' }}></div>
                          <div className="w-0.5 bg-white animate-[bounce_0.6s_infinite] h-1" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-0.5 bg-white animate-[bounce_0.6s_infinite] h-1" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <p className={`text-sm font-bold truncate ${idx === playerState.currentTrackIndex ? 'text-white' : 'text-slate-300'}`}>{track.title}</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-2">
                      {track.artist}
                      {track.insight && (
                        <>
                          <span className="inline-block w-1 h-1 rounded-full bg-slate-700" />
                          <span className="uppercase text-[9px] text-blue-400 font-bold">{track.insight?.mood}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono">
                    {track.duration ? formatTime(track.duration) : "--:--"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* AI Insight & Info (Condensed for List view) */}
        <div className="px-6 pb-2">
           <div className={`w-full p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md transition-all duration-700 ${currentTrack?.insight ? 'opacity-100 translate-y-0' : 'opacity-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: activeVibe }} />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Gemini Insight</span>
              </div>
              {isInsightLoading && <div className="w-3 h-3 border border-white/20 border-t-white rounded-full animate-spin" />}
            </div>
            <p className="text-[11px] text-slate-300 italic line-clamp-1 leading-relaxed">
              {currentTrack?.insight?.fact || (isInsightLoading ? 'Generating smart analysis...' : 'Select a track to see vibes')}
            </p>
          </div>
        </div>

        {/* Mini Visualizer */}
        <div className="w-full h-12 flex-shrink-0">
           <Visualizer analyser={analyserRef.current} isPlaying={playerState.isPlaying} accentColor={activeVibe} />
        </div>
      </main>

      {/* Audio Element */}
      <audio 
        ref={audioRef}
        src={currentTrack?.url}
        onLoadedMetadata={(e) => {
            const audio = e.currentTarget;
            setTracks(prev => prev.map(t => t.id === currentTrack?.id ? { ...t, duration: audio.duration } : t));
        }}
      />

      {/* Bottom Controls */}
      <footer className="bg-slate-900/80 backdrop-blur-3xl border-t border-white/5 p-6 z-20 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        
        {/* Current Track Small Title */}
        <div className="flex items-center gap-3 mb-4 animate-in fade-in duration-500">
           {currentTrack && (
             <>
               <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/10 shadow-lg">
                 <img src={currentTrack.coverArt} className="w-full h-full object-cover" alt="" />
               </div>
               <div className="flex-1 min-w-0">
                 <h3 className="text-xs font-bold text-white truncate">{currentTrack.title}</h3>
                 <p className="text-[10px] text-slate-500 font-medium truncate">{currentTrack.artist}</p>
               </div>
             </>
           )}
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-2 tabular-nums opacity-60">
            <span>{formatTime(playerState.currentTime)}</span>
            <span>{formatTime(currentTrack?.duration || 0)}</span>
          </div>
          <input 
            type="range" min="0" max={currentTrack?.duration || 0} step="0.1"
            value={playerState.currentTime} onChange={handleSeek}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, ${activeVibe} ${(playerState.currentTime / (currentTrack?.duration || 1)) * 100}%, #1e293b 0%)` }}
          />
        </div>

        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setPlayerState(p => ({ ...p, isShuffle: !p.isShuffle }))} className={`transition-colors ${playerState.isShuffle ? 'text-blue-500' : 'text-slate-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
          </button>
          <button onClick={prevTrack} className="text-white hover:text-blue-400 p-2"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg></button>
          <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-slate-900 shadow-xl active:scale-90 transition-transform">
            {playerState.isPlaying ? <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="w-7 h-7 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
          </button>
          <button onClick={nextTrack} className="text-white hover:text-blue-400 p-2"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg></button>
          <button onClick={() => {
                 const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
                 setPlayerState(p => ({ ...p, repeatMode: modes[(modes.indexOf(p.repeatMode) + 1) % modes.length] }));
             }} className={`transition-colors relative ${playerState.repeatMode !== 'none' ? 'text-blue-500' : 'text-slate-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {playerState.repeatMode === 'one' && <span className="absolute -top-1 -right-1 text-[8px] font-black">1</span>}
          </button>
        </div>

        <div className="flex items-center gap-4 px-4 opacity-40 hover:opacity-100 transition-opacity">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
          <input type="range" min="0" max="1" step="0.01" value={playerState.volume} onChange={handleVolumeChange} className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${activeVibe} ${playerState.volume * 100}%, #1e293b 0%)` }} />
        </div>
      </footer>

      {/* Library Overlay (Management & Smart Playlists) */}
      {showPlaylist && (
        <div className="absolute inset-0 bg-slate-900 z-50 flex flex-col animate-slide-up">
            <header className="p-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button onClick={() => setShowPlaylist(false)} className="p-2 -ml-2 text-slate-400 hover:text-white">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <h2 className="text-xl font-black">Playlists</h2>
                </div>
                <button onClick={() => setShowCreateSmart(true)} className="px-3 py-1.5 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-lg border border-blue-500/30 flex items-center gap-2 hover:bg-blue-600 hover:text-white transition-all">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Smart Mix
                </button>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Smart Playlist Section */}
                <div className="px-6 py-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">AI Curated Filters</h3>
                  <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar scroll-smooth">
                    <button 
                      onClick={() => setActiveSmartPlaylistId(null)}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${!activeSmartPlaylistId ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                      All Tracks
                    </button>
                    {smartPlaylists.map(sp => (
                      <button 
                        key={sp.id}
                        onClick={() => setActiveSmartPlaylistId(sp.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${activeSmartPlaylistId === sp.id ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                      >
                        {sp.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-4">
                   <p className="text-xs text-slate-500 font-medium">Tracks in library: {tracks.length}</p>
                   {isInsightLoading && (
                      <div className="mt-4 flex items-center gap-3 px-4 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">AI Scanning Tracks...</p>
                      </div>
                   )}
                </div>
            </div>

            <div className="p-6 bg-slate-900 border-t border-slate-800">
                 <label className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-200 active:scale-95 transition-all">
                    <input type="file" multiple accept="audio/mp3" onChange={handleFileUpload} className="hidden" />
                    <span>Import MP3s</span>
                 </label>
            </div>
        </div>
      )}

      {/* Create Smart Playlist Modal */}
      {showCreateSmart && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl z-[60] flex items-center justify-center p-8 animate-fade-in">
          <div className="bg-slate-900 w-full rounded-[2.5rem] border border-slate-800 p-8 shadow-3xl animate-slide-up">
            <h2 className="text-xl font-black mb-1">Smart Mix Builder</h2>
            <p className="text-slate-500 text-xs mb-8">Choose a mood and AI will group similar tracks.</p>
            
            <div className="grid grid-cols-2 gap-3 mb-8">
              {MOOD_OPTIONS.map(mood => (
                <button 
                  key={mood}
                  onClick={() => createSmartPlaylist(mood)}
                  className="p-4 rounded-2xl bg-slate-800 border border-slate-700 hover:border-blue-500 hover:bg-blue-600/10 text-xs font-bold transition-all text-center group"
                >
                  <span className="block mb-1 opacity-50 group-hover:opacity-100 transition-opacity">Spark ✨</span>
                  {mood}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setShowCreateSmart(false)}
              className="w-full py-4 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%, 100% { height: 4px; } 50% { height: 12px; } }
        .animate-slide-up { animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .custom-scrollbar::-webkit-scrollbar { height: 3px; width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default App;
