import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface CustomAudioPlayerProps {
    src: string;
    className?: string;
    isSender?: boolean;
}

export function CustomAudioPlayer({ src, className = '', isSender = false }: CustomAudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateProgress = () => {
            setCurrentTime(audio.currentTime);
            setProgress((audio.currentTime / audio.duration) * 100);
        };

        const updateDuration = () => {
            setDuration(audio.duration);
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', onEnded);
        };
    }, []);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const value = parseFloat(e.target.value);
        if (audioRef.current) {
            const time = (value / 100) * audioRef.current.duration;
            audioRef.current.currentTime = time;
            setProgress(value);
            setCurrentTime(time);
        }
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`flex items-center gap-3 p-3 rounded-2xl min-w-[260px] transition-all ${isSender
            ? 'bg-[var(--sui-blue)]/20 border border-[var(--sui-blue)]/30'
            : 'bg-[var(--sui-bg-secondary)] border border-[var(--sui-border)] shadow-sm'
            } ${className}`}>
            <audio ref={audioRef} src={src} preload="metadata" />

            <button
                onClick={togglePlay}
                className={`p-3 rounded-full transition-all shrink-0 shadow-sm hover:scale-105 active:scale-95 ${isSender
                    ? 'bg-[var(--sui-blue)] text-white'
                    : 'bg-[var(--sui-text)] text-[var(--sui-bg)]'
                    }`}
            >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>

            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress || 0}
                    onChange={handleSeek}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm transition-all ${isSender
                        ? 'bg-white/30 [&::-webkit-slider-thumb]:bg-white'
                        : 'bg-[var(--sui-border)] [&::-webkit-slider-thumb]:bg-[var(--sui-text)]'
                        }`}
                />
                <div className={`flex justify-between text-[11px] font-medium tabular-nums ${isSender ? 'text-white/90' : 'text-[var(--sui-text-secondary)]'
                    }`}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    );
}
