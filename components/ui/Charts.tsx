
import React from 'react';
import { cn } from '../../lib/utils.ts';

// --- Types ---
export interface ChartDataPoint {
    label: string;
    value: number;
    tooltip?: string;
}

interface BaseChartProps {
    data: ChartDataPoint[];
    height?: number;
    className?: string;
    color?: string;
}

// --- Line Chart ---
export const SimpleLineChart: React.FC<BaseChartProps> = ({ data, height = 200, className, color = 'stroke-accent' }) => {
    if (data.length < 2) return null;

    const maxVal = Math.max(...data.map(d => d.value)) * 1.1; // 10% headroom
    const minVal = 0;
    
    // SVG Dimensions (Internal coordinate system)
    const width = 100;
    const chartHeight = 50; 
    
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = chartHeight - ((d.value - minVal) / (maxVal - minVal)) * chartHeight;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className={cn("w-full flex flex-col", className)}>
            <div className="relative w-full overflow-hidden" style={{ height: `${height}px` }}>
                <svg viewBox={`0 0 ${width} ${chartHeight}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    {/* Gradient Fill */}
                    <defs>
                        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" className="text-white" />
                            <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-white" />
                        </linearGradient>
                    </defs>
                    
                    {/* Area under curve */}
                    <path 
                        d={`M0,${chartHeight} ${points} L${width},${chartHeight} Z`} 
                        fill={`url(#gradient-${color})`} 
                        className="opacity-50"
                    />
                    
                    {/* The Line */}
                    <polyline 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="1.5" 
                        points={points} 
                        className={color}
                        vectorEffect="non-scaling-stroke"
                    />
                    
                    {/* Data Points (Dots) */}
                    {data.map((d, i) => {
                        const x = (i / (data.length - 1)) * width;
                        const y = chartHeight - ((d.value - minVal) / (maxVal - minVal)) * chartHeight;
                        return (
                            <circle 
                                key={i} 
                                cx={x} 
                                cy={y} 
                                r="1.5" 
                                className="fill-white stroke-slate-900 stroke-[0.5]" 
                                vectorEffect="non-scaling-stroke"
                            />
                        );
                    })}
                </svg>
            </div>
            {/* X-Axis Labels */}
            <div className="flex justify-between mt-2 text-[10px] text-slate-400 px-1">
                {data.filter((_, i) => i % Math.ceil(data.length / 5) === 0).map((d, i) => (
                    <span key={i}>{d.label}</span>
                ))}
            </div>
        </div>
    );
};

// --- Bar Chart ---
export const SimpleBarChart: React.FC<BaseChartProps> = ({ data, height = 200, className, color = 'bg-primary' }) => {
    const maxVal = Math.max(...data.map(d => d.value)) * 1.1;

    return (
        <div className={cn("w-full flex flex-col", className)}>
            <div className="flex items-end justify-between gap-1 w-full" style={{ height: `${height}px` }}>
                {data.map((d, i) => {
                    const barHeight = (d.value / maxVal) * 100;
                    return (
                        <div key={i} className="flex flex-col items-center flex-1 group relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10">
                                {d.value.toLocaleString()}
                            </div>
                            
                            <div 
                                className={cn("w-full rounded-t-sm transition-all duration-500 hover:opacity-80", color)} 
                                style={{ height: `${barHeight}%` }}
                            />
                        </div>
                    );
                })}
            </div>
            {/* X-Axis Labels (Only show every nth label to avoid crowding) */}
            <div className="flex justify-between mt-2 text-[10px] text-slate-400 px-1">
                 {data.filter((_, i) => i % Math.ceil(data.length / 5) === 0).map((d, i) => (
                    <span key={i}>{d.label}</span>
                ))}
            </div>
        </div>
    );
};

// --- Horizontal Bar Chart (For Rankings) ---
export const HorizontalBarChart: React.FC<BaseChartProps> = ({ data, className, color = 'bg-accent' }) => {
    const maxVal = Math.max(...data.map(d => d.value));

    return (
        <div className={cn("w-full flex flex-col gap-3", className)}>
            {data.map((d, i) => (
                <div key={i} className="flex items-center gap-4">
                    <div className="w-32 text-right text-xs text-slate-400 truncate" title={d.label}>
                        {d.label}
                    </div>
                    <div className="flex-grow h-4 bg-slate-800/50 rounded-full overflow-hidden relative group">
                         {/* Tooltip */}
                         <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-white/10 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-20 shadow-lg">
                            {d.value.toLocaleString()}
                        </div>
                        <div
                            className={cn("h-full rounded-full transition-all duration-1000 ease-out", color)}
                            style={{ width: `${(d.value / maxVal) * 100}%` }}
                        />
                    </div>
                    <div className="w-12 text-right text-xs font-bold text-slate-300">
                        {d.value.toLocaleString()}
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- Donut Chart ---
export const SimpleDonutChart: React.FC<{ data: { label: string; value: number; color: string }[], size?: number }> = ({ data, size = 160 }) => {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);
    let currentAngle = 0;

    return (
        <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
                    {data.map((slice, i) => {
                        const sliceAngle = (slice.value / total) * 360;
                        const radius = 40;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDasharray = `${(sliceAngle / 360) * circumference} ${circumference}`;
                        const strokeDashoffset = -((currentAngle / 360) * circumference);
                        
                        currentAngle += sliceAngle;

                        return (
                            <circle
                                key={i}
                                cx="50"
                                cy="50"
                                r={radius}
                                fill="transparent"
                                stroke={slice.color}
                                strokeWidth="15"
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-300 hover:opacity-80"
                            />
                        );
                    })}
                </svg>
                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-white">{total.toLocaleString()}</span>
                    <span className="text-xs text-white/50">Total</span>
                </div>
            </div>
            
            {/* Legend */}
            <div className="flex flex-col gap-2">
                {data.map((slice, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: slice.color }} />
                        <span className="text-white/70">{slice.label}</span>
                        <span className="font-bold text-white ml-auto">{Math.round((slice.value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
