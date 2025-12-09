import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate, useAnimation, AnimatePresence } from 'framer-motion';
import { 
    RotateCcw, 
    RotateCw,
    Target, 
    Settings, 
    Activity, 
    History, 
    Zap, 
    ChevronRight,
    RefreshCw,
    Crosshair
} from 'lucide-react';

// --- Configuration & Constants ---
const WHEEL_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// Physics constants (Tunable)
const BALL_DECELERATION_RATE = 0.0002; 
const ROTOR_DECELERATION_RATE = 0.000005; 
const CUTOFF_TIME_PER_REV = 1300; 
const DEFAULT_SCATTER_OFFSET = 9; 

// Theme Colors
const COLORS = {
    red: '#FFFFFF',    
    black: '#171717',  
    green: '#10B981',  
    gold: '#F59E0B',
    slate: '#0f172a',
    text: '#e2e8f0'
};

const getPocketColor = (num) => {
    if (num === 0) return 'green';
    const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    return RED_NUMBERS.includes(num) ? 'red' : 'black';
};

const normalizeIndex = (idx) => {
    const len = WHEEL_LAYOUT.length;
    return ((idx % len) + len) % len;
};

// --- Sub-Components ---

const Header = () => (
    <div className="flex justify-between items-center p-4 z-10 relative bg-gradient-to-b from-slate-900 to-transparent">
        <div className="flex items-center gap-2">
            <div className="bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20">
                <Crosshair size={20} className="text-yellow-500" />
            </div>
            <div>
                <h1 className="text-lg font-bold text-white leading-none tracking-tight">V-Ballistics</h1>
                <p className="text-xs text-slate-500 font-mono tracking-wider">PRO EDITION</p>
            </div>
        </div>
        <div className="flex items-center gap-3">
             <div className="bg-slate-800/80 backdrop-blur border border-slate-700 px-3 py-1.5 rounded-full flex items-center gap-2">
                <Settings size={14} className="text-slate-400" />
                <span className="text-xs font-mono font-bold text-slate-400">
                    STD MODE
                </span>
            </div>
        </div>
    </div>
);

// --- INTERACTIVE WHEEL COMPONENT ---
const RealisticWheel = ({ targetNumber, neighbors = 3 }) => {
    const radius = 140;
    const center = 150;
    const innerRadius = 90;
    
    // Physics State
    const rotation = useMotionValue(0);
    const containerRef = useRef(null);
    const isDragging = useRef(false);
    const previousAngle = useRef(0);

    // Calculate Highlight Indices
    const targetIndex = targetNumber !== null ? WHEEL_LAYOUT.indexOf(targetNumber) : -1;
    const highlightedIndices = [];
    if (targetNumber !== null) {
        for (let i = -neighbors; i <= neighbors; i++) {
            highlightedIndices.push(normalizeIndex(targetIndex + i));
        }
    }

    // --- SPIN LOGIC: Effect to handle Target Lock ---
    useEffect(() => {
        if (targetNumber !== null) {
            // Stop any existing inertia
            rotation.stop();

            // 1. Calculate Target Angle (Target needs to be at -90deg / Top)
            // Each pocket is 360/37 degrees.
            // Target Index * DegreesPerPocket = Angle from 0.
            // We want (CurrentRotation + Delta) such that (CurrentRotation + Delta) % 360 results in the target at top.
            
            const degreesPerPocket = 360 / 37;
            const currentRot = rotation.get();
            
            // The angle where the target index IS currently (visual position)
            // VisualAngle = CurrentRot + (Index * DegPerPocket)
            // We want VisualAngle to be -90 (Top)
            // So: TargetRot + (Index * Deg) = -90
            // TargetRot = -90 - (Index * Deg)
            
            const desiredAngle = -90 - (targetIndex * degreesPerPocket);
            
            // Find shortest path or continue momentum? 
            // Let's continue momentum to make it look like it settled there.
            // We want the result to be `desiredAngle` modulo 360.
            
            // Normalize current rotation to remove full spins for calculation
            // const currentMod = currentRot % 360;
            
            // Calculate gap
            // const gap = desiredAngle - currentMod;
            
            // Force a few extra spins (e.g., 2 full spins - 720deg) relative to current
            // We need to sync the phases.
            
            // Easier way: 
            const spins = 2; // Minimum spins
            const baseTarget = currentRot - (360 * spins); // Spin backwards (CCW usually) or CW depending on sign
            
            // Adjust baseTarget so it aligns with desiredAngle
            const currentAtBase = baseTarget % 360;
            const desiredMod = desiredAngle % 360;
            let correction = desiredMod - currentAtBase;
            
            // Normalize correction to -180 to 180
            if (correction > 180) correction -= 360;
            if (correction < -180) correction += 360;

            const finalRotation = baseTarget + correction - 360; // Add extra spin

            animate(rotation, finalRotation, {
                duration: 4,
                ease: [0.1, 0.25, 0.1, 1], // Cubic-bezier for realistic friction stop
            });
        }
    }, [targetNumber, targetIndex, rotation]);


    // --- GESTURE LOGIC: Manual Spin ---
    const handlePointerDown = (e) => {
        if (targetNumber !== null) return; // Locked when predicted
        isDragging.current = true;
        rotation.stop(); // Stop animations
        
        // Calculate starting angle relative to center
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        
        previousAngle.current = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    };

    const handlePointerMove = (e) => {
        if (!isDragging.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        
        const currentAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
        const delta = currentAngle - previousAngle.current;
        
        // Handle wrapping (prevent jumping when crossing -180/180)
        let safeDelta = delta;
        if (safeDelta > 180) safeDelta -= 360;
        if (safeDelta < -180) safeDelta += 360;

        rotation.set(rotation.get() + safeDelta);
        previousAngle.current = currentAngle;
    };

    const handlePointerUp = () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        
        // Apply Inertia (Fling)
        const velocity = rotation.getVelocity();
        animate(rotation, rotation.get() + velocity * 0.5, {
            type: "inertia",
            velocity: velocity,
            power: 0.8,
            timeConstant: 300,
            restDelta: 0.5
        });
    };


    return (
        <div 
            ref={containerRef}
            className="relative w-[300px] h-[300px] mx-auto my-4 filter drop-shadow-2xl cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {/* Outer Static Ring (The Bowl) */}
            <div className="absolute inset-0 rounded-full border-[8px] border-slate-800 bg-slate-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] pointer-events-none" />
            
            {/* The Diamond (Reference Point) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-4 h-6 bg-yellow-500 z-30 [clip-path:polygon(50%_100%,_100%_0%,_0%_0%)] shadow-lg drop-shadow-[0_0_10px_rgba(234,179,8,0.8)] pointer-events-none" />

            {/* Rotatable Rotor */}
            <motion.svg 
                width="300" 
                height="300" 
                viewBox="0 0 300 300" 
                className="absolute inset-0"
                style={{ rotate: rotation }}
            >
                <defs>
                    <radialGradient id="metal-gradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#475569" />
                        <stop offset="90%" stopColor="#1e293b" />
                        <stop offset="100%" stopColor="#0f172a" />
                    </radialGradient>
                    <filter id="inner-shadow">
                       <feOffset dx="0" dy="0"/>
                       <feGaussianBlur stdDeviation="5" result="offset-blur"/>
                       <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
                       <feFlood floodColor="black" floodOpacity="0.75" result="color"/>
                       <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
                       <feComposite operator="over" in="shadow" in2="SourceGraphic"/> 
                    </filter>
                </defs>

                {/* Rotor Base */}
                <circle cx={center} cy={center} r={radius} fill="url(#metal-gradient)" stroke="#334155" strokeWidth="2" />

                {/* Pockets */}
                {WHEEL_LAYOUT.map((num, i) => {
                    const anglePerSlice = 360 / 37;
                    const startAngle = i * anglePerSlice;
                    const endAngle = (i + 1) * anglePerSlice;
                    
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;
                    
                    const x1 = center + radius * Math.cos(startRad);
                    const y1 = center + radius * Math.sin(startRad);
                    const x2 = center + radius * Math.cos(endRad);
                    const y2 = center + radius * Math.sin(endRad);
                    
                    const x1_in = center + innerRadius * Math.cos(startRad);
                    const y1_in = center + innerRadius * Math.sin(startRad);
                    const x2_in = center + innerRadius * Math.cos(endRad);
                    const y2_in = center + innerRadius * Math.sin(endRad);

                    const colorKey = getPocketColor(num);
                    const fill = COLORS[colorKey];
                    const textColor = colorKey === 'red' ? 'black' : 'white'; 
                    const isHighlighted = highlightedIndices.includes(i);
                    const isTarget = num === targetNumber;

                    return (
                        <g key={num}>
                            {/* Pocket Wedge */}
                            <path 
                                d={`M ${x1_in} ${y1_in} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${x2_in} ${y2_in} A ${innerRadius} ${innerRadius} 0 0 0 ${x1_in} ${y1_in}`}
                                fill={fill}
                                stroke="#1e293b"
                                strokeWidth="1"
                                className="transition-opacity duration-300"
                                style={{ opacity: targetNumber !== null ? (isHighlighted ? 1 : 0.3) : 1 }}
                            />
                            
                            {/* Inner Border Highlight (Target Only) */}
                            {isTarget && (
                                <path 
                                    d={`M ${x1_in} ${y1_in} A ${innerRadius} ${innerRadius} 0 0 1 ${x2_in} ${y2_in}`}
                                    fill="none"
                                    stroke="#F59E0B"
                                    strokeWidth="6"
                                    strokeLinecap="butt"
                                    className="drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"
                                />
                            )}

                            {/* Number Text */}
                            <text
                                x={center + (radius - 25) * Math.cos(startRad + (anglePerSlice * Math.PI / 180) / 2)}
                                y={center + (radius - 25) * Math.sin(startRad + (anglePerSlice * Math.PI / 180) / 2)}
                                fill={textColor}
                                fontSize="10"
                                fontWeight="bold"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                transform={`rotate(${startAngle + anglePerSlice/2 + 90}, ${center + (radius - 25) * Math.cos(startRad + (anglePerSlice * Math.PI / 180) / 2)}, ${center + (radius - 25) * Math.sin(startRad + (anglePerSlice * Math.PI / 180) / 2)})`}
                                style={{ opacity: targetNumber !== null ? (isHighlighted ? 1 : 0.2) : 1 }}
                            >
                                {num}
                            </text>
                        </g>
                    );
                })}
            </motion.svg>
            
            {/* Highlight Ring Overlay */}
            {targetNumber !== null && (
                <motion.div 
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 rounded-full border-4 border-yellow-400/50 pointer-events-none z-20"
                />
            )}
        </div>
    );
};

// --- Main Application ---

export default function App() {
    const [step, setStep] = useState('IDLE');
    const [timestamps, setTimestamps] = useState([]);
    const [prediction, setPrediction] = useState(null);
    const [ballDirection, setBallDirection] = useState('CW'); 
    
    // Physics Engine
    const calculatePhysics = useCallback(() => {
        if (timestamps.length !== 4) return; 

        const [t_r1, t_r2, t_b1, t_b2] = timestamps;

        // --- 1. Raw Measured Rev Times ---
        const rawRotorRevTime = t_r2 - t_r1;
        const rawBallRevTime = t_b2 - t_b1;

        // --- ERROR GUARD ---
        if (rawBallRevTime >= rawRotorRevTime || rawRotorRevTime <= 0 || rawBallRevTime <= 0) {
            alert("Invalid timing: Ball must be faster than Rotor.");
            setTimestamps([]); 
            setStep('IDLE');
            return;
        }

        // --- 2. Calculate Instantaneous Velocities ---
        const k = BALL_DECELERATION_RATE;
        const instBallRevTime = (Math.exp(k * rawBallRevTime) - 1) / k;
        const instRotorRevTime = rawRotorRevTime * (1 + ROTOR_DECELERATION_RATE * rawRotorRevTime);

        // --- 3. Project Future Path ---
        const timeRemaining = (1 / k) * Math.log(CUTOFF_TIME_PER_REV / instBallRevTime);
        
        if (timeRemaining <= 0) {
             alert("Ball is already too slow!");
             setTimestamps([]); 
             setStep('IDLE');
             return;
        }

        // --- 4. Integrate Positions (Relative Magnitude) ---
        const rotorVelocityStart = 1 / instRotorRevTime;
        const rotorVelocityEnd = rotorVelocityStart * (1 - ROTOR_DECELERATION_RATE * timeRemaining); 
        const avgRotorVelocity = (rotorVelocityStart + rotorVelocityEnd) / 2;
        const rotorRotations = avgRotorVelocity * timeRemaining;
        const rotorDegrees = (rotorRotations % 1) * 360;
        
        const ballRotations = (1 / (k * instBallRevTime)) * (1 - Math.exp(-k * timeRemaining));
        const ballDegrees = (ballRotations % 1) * 360;

        // Total Shift Magnitude
        const totalShiftDegrees = (rotorDegrees + ballDegrees) % 360;
        const pocketSize = 360 / 37;
        const rawShiftPockets = Math.round(totalShiftDegrees / pocketSize);
        
        // --- 5. Determine Final Index based on Direction ---
        let finalIndex;
        
        if (ballDirection === 'CW') {
            finalIndex = normalizeIndex(0 + rawShiftPockets + DEFAULT_SCATTER_OFFSET);
        } else {
            finalIndex = normalizeIndex(0 - (rawShiftPockets + DEFAULT_SCATTER_OFFSET));
        }

        setPrediction({
            targetIndex: finalIndex,
            targetNumber: WHEEL_LAYOUT[finalIndex],
            rawIndex: rawShiftPockets,
            rotorRPM: Math.round(60000 / instRotorRevTime),
            ballMs: Math.round(instBallRevTime) 
        });
        setStep('PREDICTED');
    }, [timestamps, ballDirection]);

    // --- EFFECT: Trigger Calculation Immediately on 4th Tap ---
    useEffect(() => {
        if (timestamps.length === 4) {
            calculatePhysics();
        }
    }, [timestamps, calculatePhysics]);

    const handleTap = () => {
        if (step === 'PREDICTED') return;
        const now = performance.now();
        setTimestamps(prev => [...prev, now]); 
    };

    const handleReset = () => {
        setTimestamps([]);
        setPrediction(null);
        setStep('IDLE');
    };

    const toggleDirection = () => {
        setBallDirection(prev => prev === 'CW' ? 'CCW' : 'CW');
    };

    const getButtonState = () => {
        switch(timestamps.length) {
            case 0: return { label: "ZERO", sub: "Tap on Diamond", color: "from-green-600 to-emerald-800" };
            case 1: return { label: "ZERO", sub: "1 Full Rev", color: "from-green-600 to-emerald-800" };
            case 2: return { label: "BALL", sub: "Tap on Diamond", color: "from-rose-600 to-red-800" };
            case 3: return { label: "BALL", sub: "1 Full Rev", color: "from-rose-600 to-red-800" };
            default: return { label: "...", sub: "Computing", color: "from-slate-700 to-slate-800" };
        }
    };

    const btnState = getButtonState();

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col selection:bg-yellow-500/30">
            {/* Background Ambience */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_#1e293b_0%,_#000000_60%)] pointer-events-none" />
            <div className="fixed top-0 left-0 right-0 h-32 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

            <Header />

            <main className="flex-1 flex flex-col relative z-10 px-4 max-w-lg mx-auto w-full">
                
                {/* 1. The Wheel Visualization */}
                <div className="flex-shrink-0 relative">
                     <AnimatePresence mode='wait'>
                        <motion.div 
                            key="wheel"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="relative"
                        >
                            <RealisticWheel 
                                targetNumber={prediction ? prediction.targetNumber : null} 
                                neighbors={3}
                            />
                            
                            {/* Overlay Target Text (Only when predicted) */}
                            {prediction && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-40 drop-shadow-md">
                                    <span className="text-xs font-mono text-yellow-500 uppercase tracking-widest bg-black/40 backdrop-blur px-2 py-1 rounded">Target</span>
                                    <div className={`text-6xl font-black ${getPocketColor(prediction.targetNumber) === 'red' ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : getPocketColor(prediction.targetNumber) === 'green' ? 'text-green-500' : 'text-white'}`}>
                                        {prediction.targetNumber}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* 2. Interactive Area */}
                <div className="flex-1 flex flex-col justify-end pb-8">
                    
                    {step !== 'PREDICTED' ? (
                        <div className="flex flex-col items-center gap-6">
                            
                            {/* Stats Display (Live) */}
                            <div className="flex gap-4 w-full justify-center opacity-70">
                                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex items-center gap-3 w-32">
                                    <RefreshCw size={18} className="text-blue-400" />
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Rotor</div>
                                        <div className="text-sm font-mono text-slate-300">
                                            {timestamps[1] ? ((60000/(timestamps[1]-timestamps[0])).toFixed(0) + ' RPM') : '--'}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex items-center gap-3 w-32">
                                    <Activity size={18} className="text-red-400" />
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Ball</div>
                                        <div className="text-sm font-mono text-slate-300">
                                            {timestamps[3] ? ((1000/(timestamps[3]-timestamps[2])).toFixed(0) + ' ms') : '--'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* THE BUTTON */}
                            <button
                                onClick={handleTap}
                                className="group relative w-32 h-32 touch-manipulation focus:outline-none"
                            >
                                <div className="absolute inset-0 bg-white/5 rounded-full animate-ping opacity-20" />
                                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${btnState.color} shadow-[0_0_40px_rgba(0,0,0,0.6)] border-4 border-slate-900 transition-colors duration-300 group-active:scale-95`} />
                                
                                <div className="absolute inset-2 rounded-full border border-white/10 bg-black/20 backdrop-blur-sm flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black tracking-tighter text-white drop-shadow-lg">
                                        {btnState.label}
                                    </span>
                                    <span className="text-[10px] font-mono uppercase text-white/60 mt-1">
                                        {btnState.sub}
                                    </span>
                                </div>

                                <svg className="absolute inset-[-10px] w-[calc(100%+20px)] h-[calc(100%+20px)] -rotate-90 pointer-events-none">
                                    <circle cx="50%" cy="50%" r="48%" stroke="#334155" strokeWidth="3" fill="none" />
                                    <circle 
                                        cx="50%" cy="50%" r="48%" 
                                        stroke="#fbbf24" strokeWidth="3" fill="none"
                                        strokeDasharray="300"
                                        strokeDashoffset={300 - (300 * (timestamps.length / 4))}
                                        className="transition-all duration-300 ease-out"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </button>

                        </div>
                    ) : (
                        // RESULT MODE
                        <motion.div 
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-6 rounded-3xl shadow-2xl space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-2">
                                <div>
                                    <h3 className="text-white font-bold text-lg">Prediction Ready</h3>
                                    <p className="text-slate-400 text-xs">Direction: {ballDirection}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-slate-500 uppercase">Ball Speed</div>
                                    <div className="font-mono text-yellow-500">{prediction.ballMs} ms/rev</div>
                                </div>
                            </div>

                            <button onClick={handleReset} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg uppercase tracking-wider transition-all transform active:scale-95 shadow-lg shadow-yellow-500/20">
                                New Spin
                            </button>
                        </motion.div>
                    )}

                    {/* PERSISTENT TOGGLES */}
                    <div className="mt-8 flex justify-center pb-4">
                        <button 
                            onClick={toggleDirection}
                            className="flex items-center gap-3 bg-slate-900/80 backdrop-blur border border-slate-800 px-6 py-3 rounded-full text-sm font-bold text-slate-400 hover:text-white hover:border-slate-600 transition-all shadow-lg active:scale-95"
                        >
                            <span className="uppercase tracking-wider text-[10px]">Ball Direction</span>
                            {ballDirection === 'CW' ? (
                                <span className="flex items-center gap-1 text-yellow-500">
                                    <RotateCw size={16} /> CW
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-yellow-500">
                                    <RotateCcw size={16} /> CCW
                                </span>
                            )}
                        </button>
                    </div>

                </div>
            </main>
        </div>
    );
}