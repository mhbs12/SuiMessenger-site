import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Download, Repeat } from 'lucide-react';

interface CustomVideoPlayerProps {
    src: string;
    className?: string;
    autoPlay?: boolean;
}

export function CustomVideoPlayer({ src, className = '', autoPlay = false }: CustomVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [shouldAutoplay, setShouldAutoplay] = useState(autoPlay);
    const prevSrcRef = useRef(src);

    // Reset state when src changes
    useEffect(() => {
        if (prevSrcRef.current !== src) {
            prevSrcRef.current = src;
            setProgress(0);
            setDuration(0);
            setIsPlaying(shouldAutoplay);

            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                if (shouldAutoplay) {
                    videoRef.current.play().catch(e => {
                        console.warn("Auto-play failed:", e);
                        setIsPlaying(false);
                    });
                } else {
                    videoRef.current.pause();
                }
            }
        }
    }, [src, shouldAutoplay]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (autoPlay) {
            video.play().catch(e => {
                console.warn("Auto-play failed:", e);
                setIsPlaying(false);
            });
        }

        const updateProgress = () => {
            setProgress((video.currentTime / video.duration) * 100);
        };

        const updateDuration = () => {
            setDuration(video.duration);
        };

        const onEnded = () => {
            setIsPlaying(false);
        };

        video.addEventListener('timeupdate', updateProgress);
        video.addEventListener('loadedmetadata', updateDuration);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('timeupdate', updateProgress);
            video.removeEventListener('loadedmetadata', updateDuration);
            video.removeEventListener('ended', onEnded);
        };
    }, []);

    const togglePlay = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const value = parseFloat(e.target.value);
        if (videoRef.current) {
            const time = (value / 100) * videoRef.current.duration;
            videoRef.current.currentTime = time;
            setProgress(value);
        }
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const value = parseFloat(e.target.value);
        if (videoRef.current) {
            videoRef.current.volume = value;
            setVolume(value);
            setIsMuted(value === 0);
        }
    };

    const toggleFullscreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!playerRef.current) return;

        if (!document.fullscreenElement) {
            playerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const a = document.createElement('a');
        a.href = src;
        a.download = `video-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div
            ref={playerRef}
            className={`relative group overflow-hidden rounded-xl ${className}`}
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
            onClick={togglePlay}
        >
            <video
                ref={videoRef}
                src={src}
                className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : 'max-h-[400px]'}`}
            // Click on video bubbles up to container to toggle play/pause
            />

            {/* Center Play Button Overlay */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[2px] transition-all z-20 rounded-xl">
                    <button
                        onClick={togglePlay}
                        className="p-5 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md border border-white/30 shadow-2xl transition-all hover:scale-110 group-hover:bg-black/50 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                    >
                        <Play size={40} className="text-white fill-white drop-shadow-lg" />
                    </button>
                </div>
            )}

            {/* Controls Bar */}
            <div className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-all duration-300 ${isPlaying && showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>

                {/* Progress Bar */}
                <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress}
                        onChange={handleSeek}
                        className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="text-white hover:text-[var(--sui-blue)] transition-colors">
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>

                        <div className="flex items-center gap-1 group/vol">
                            <button onClick={toggleMute} className="text-white hover:text-[var(--sui-blue)] transition-colors">
                                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                            <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 ease-out">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeChange}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-16 h-1 ml-2 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                                />
                            </div>
                        </div>

                        <span className="text-xs text-white/90 font-medium tabular-nums">
                            {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownload}
                            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                            title="Download"
                        >
                            <Download size={18} />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                            title="Fullscreen"
                        >
                            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShouldAutoplay(!shouldAutoplay);
                            }}
                            className={`p-1.5 rounded-lg transition-all ${shouldAutoplay ? 'text-[var(--sui-blue)] bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                            title={`Autoplay: ${shouldAutoplay ? 'On' : 'Off'}`}
                        >
                            <Repeat size={18} className={shouldAutoplay ? "" : "opacity-50"} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
