
export interface Track {
  id: string;
  file: File;
  title: string;
  artist: string;
  album: string;
  duration: number;
  url: string;
  coverArt?: string;
  insight?: AIInsight; // Store insight per track for filtering
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrackIndex: number;
  volume: number;
  currentTime: number;
  repeatMode: 'none' | 'all' | 'one';
  isShuffle: boolean;
}

export interface AIInsight {
  mood: string;
  fact: string;
  vibe: string;
}

export interface SmartPlaylist {
  id: string;
  name: string;
  criteria: {
    mood?: string;
  };
}
