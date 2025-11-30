import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';

interface CustomAudioPlayerProps {
    src: string;
    className?: string;
    isSender?: boolean;
}

export function CustomAudioPlayer({ src, className = '', isSender = false }: CustomAudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const requestRef = useRef<number>();
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    // Generate random bar heights for the waveform visualization
    const waveformBars = useMemo(() => {
        return Array.from({ length: 40 }, () => Math.floor(Math.random() * 70) + 30);
    }, []);

    const animate = () => {
        const audio = audioRef.current;
        if (audio) {
            setCurrentTime(audio.currentTime);
            setProgress((audio.currentTime / audio.duration) * 100);
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        }
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [isPlaying]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateDuration = () => {
            setDuration(audio.duration);
            audio.playbackRate = playbackRate; // Set initial playback rate
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };

        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', onEnded);
        };
    }, [playbackRate]); // Re-run if playbackRate changes to update audio.playbackRate

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

    const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (!audioRef.current) return;

        const container = e.currentTarget;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, x / width));

        const time = percentage * audioRef.current.duration;
        audioRef.current.currentTime = time;
        setProgress(percentage * 100);
        setCurrentTime(time);
    };

    const toggleSpeed = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;

        const newRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
        audioRef.current.playbackRate = newRate;
        setPlaybackRate(newRate);
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`flex items-center gap-2 p-1 pr-3 min-w-[240px] select-none ${className}`}>
            <audio ref={audioRef} src={src} preload="metadata" />

            <button
                onClick={togglePlay}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shrink-0 hover:scale-105 active:scale-95 ${isSender
                    ? 'bg-white text-[var(--sui-blue)]'
                    : 'bg-[var(--sui-text)] text-[var(--sui-bg)]'
                    }`}
            >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>

            <div
                className="flex-1 h-8 flex items-center gap-[2px] cursor-pointer group"
                onClick={handleWaveformClick}
            >
                {waveformBars.map((height, index) => {
                    const barProgress = (index / waveformBars.length) * 100;
                    const isPlayed = barProgress <= progress;

                    return (
                        <div
                            key={index}
                            className={`w-1 rounded-full transition-all duration-200 ${isPlayed
                                ? (isSender ? 'bg-white' : 'bg-[var(--sui-text)]')
                                : (isSender ? 'bg-white/40' : 'bg-[var(--sui-text)] opacity-40')
                                }`}
                            style={{
                                height: `${height}%`,
                                minHeight: '15%'
                            }}
                        />
                    );
                })}
            </div>

            <div className="flex flex-col items-end justify-center min-w-[45px] gap-0.5">
                <span className={`text-[10px] font-medium tabular-nums ${isSender ? 'text-white' : 'text-[var(--sui-text-secondary)]'
                    }`}>
                    {formatTime(currentTime || duration)}
                </span>
                <button
                    onClick={toggleSpeed}
                    className={`text-[9px] font-bold transition-colors hover:underline ${isSender
                        ? 'text-white/90 hover:text-white'
                        : 'text-[var(--sui-text-tertiary)] hover:text-[var(--sui-text-secondary)]'
                        }`}
                >
                    {playbackRate}x
                </button>
            </div>
        </div>
    );
}
