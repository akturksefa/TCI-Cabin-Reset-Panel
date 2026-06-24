import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  Gauge, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  HelpCircle,
  Database,
  Cpu,
  CornerDownRight,
  ListRestart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CabinRow, Seat, ResetType, SoftResetTarget, HardResetTarget } from '../types';

interface StressTestLog {
  id: string;
  timestamp: string;
  iteration: number;
  type: ResetType;
  target?: string;
  status: 'success' | 'failed';
  message: string;
  responseTimeMs: number;
}

interface StressTestPanelProps {
  cabinRows: CabinRow[];
  onTriggerReset: (params: {
    type: ResetType;
    rowNumber?: number;
    seatId?: string;
    target?: string;
  }) => Promise<any>;
  isLoading: boolean;
  onBackToDashboard: () => void;
}

export default function StressTestPanel({ 
  cabinRows, 
  onTriggerReset, 
  isLoading: isParentLoading,
  onBackToDashboard 
}: StressTestPanelProps) {
  // Input settings
  const [resetType, setResetType] = useState<ResetType>('soft');
  const [softTarget, setSoftTarget] = useState<SoftResetTarget>('som');
  const [hardTarget, setHardTarget] = useState<HardResetTarget>('som');
  
  const [targetRow, setTargetRow] = useState<number>(15);
  const [targetSeat, setTargetSeat] = useState<string>('A'); // or 'ALL'
  
  const [loopCount, setLoopCount] = useState<number>(500);
  const [intervalMs, setIntervalMs] = useState<number>(2000); // interval between resets in ms

  // Running State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentIteration, setCurrentIteration] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [testLogs, setTestLogs] = useState<StressTestLog[]>([]);
  const [avgResponseTime, setAvgResponseTime] = useState<number>(0);

  // Refs for tracking mutable states in timing loops
  const isRunningRef = useRef(isRunning);
  const isPausedRef = useRef(isPaused);
  const currentIterationRef = useRef(currentIteration);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    currentIterationRef.current = currentIteration;
  }, [currentIteration]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const targetExplanations: Record<string, string> = {
    som: 'SOM (Seat Option Module): Handles in-seat peripheral power & sensor suites.',
    handset: 'Passenger Handset: Quick reboot of the client handset telephone/remote control.',
    '4kdu': '4KDU (4K Display Unit): Restarts the main seat-back touchscreen display.',
    ccu: 'CCU (Cabin Control Unit): Gateways AV/power to this specific seat cluster.',
    full: 'Full seat reset: Overwrites power lines and restarts the entire seat stack.',
  };

  const getSubTarget = () => {
    if (resetType === 'soft') return softTarget;
    if (resetType === 'hard') return hardTarget;
    return undefined;
  };

  // Execution flow
  const startStressTest = () => {
    if (isRunning) return;

    // Reset statistics
    setCurrentIteration(0);
    setSuccessCount(0);
    setFailedCount(0);
    setTestLogs([]);
    setAvgResponseTime(0);
    setIsRunning(true);
    setIsPaused(false);

    // Schedule first step
    timerRef.current = setTimeout(() => runNextStep(1), 100);
  };

  const runNextStep = async (iterationStep: number) => {
    if (!isRunningRef.current) return;
    
    // If paused, wait and check again shortly
    if (isPausedRef.current) {
      timerRef.current = setTimeout(() => runNextStep(iterationStep), 500);
      return;
    }

    if (iterationStep > loopCount) {
      // Completed successfully!
      setIsRunning(false);
      setIsPaused(false);
      return;
    }

    setCurrentIteration(iterationStep);
    const startTime = Date.now();
    const currentTarget = getSubTarget();

    const logId = `test-log-${Date.now()}-${iterationStep}`;
    let stepSuccess = false;
    let stepMessage = '';

    try {
      // Trigger reset through proxy
      const result = await onTriggerReset({
        type: resetType,
        rowNumber: targetRow,
        seatId: targetSeat === 'ALL' ? undefined : targetSeat,
        target: currentTarget
      });

      // Handle return result
      const isOk = result && (result.success || result.status === 'success');
      stepSuccess = !!isOk;
      stepMessage = result?.message || (isOk ? 'Command successfully delivered' : 'Command denied or cooldown active');
    } catch (err: any) {
      stepSuccess = false;
      stepMessage = err.message || 'Network communication timeout on avionics bus';
    }

    const duration = Date.now() - startTime;

    // Update stats
    if (stepSuccess) {
      setSuccessCount(prev => prev + 1);
    } else {
      setFailedCount(prev => prev + 1);
    }

    // Add local log entry
    const newLogEntry: StressTestLog = {
      id: logId,
      timestamp: new Date().toLocaleTimeString(),
      iteration: iterationStep,
      type: resetType,
      target: currentTarget,
      status: stepSuccess ? 'success' : 'failed',
      message: stepMessage,
      responseTimeMs: duration
    };

    setTestLogs(prev => [newLogEntry, ...prev].slice(0, 500)); // Limit view buffer to 500 lines

    // Calculate dynamic average response time
    setAvgResponseTime(prev => {
      if (prev === 0) return duration;
      return Math.round((prev * 4 + duration) / 5); // moving average
    });

    // Schedule next iteration if still running
    if (isRunningRef.current) {
      timerRef.current = setTimeout(() => {
        runNextStep(iterationStep + 1);
      }, intervalMs);
    }
  };

  const pauseStressTest = () => {
    setIsPaused(prev => !prev);
  };

  const stopStressTest = () => {
    setIsRunning(false);
    setIsPaused(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const successRate = currentIteration > 0 
    ? ((successCount / currentIteration) * 100).toFixed(1) 
    : '100.0';

  const progressPercent = loopCount > 0 
    ? Math.round((currentIteration / loopCount) * 100) 
    : 0;

  return (
    <div className="bg-[#EBEFF2] border border-slate-300 rounded-2xl shadow-xl p-5 flex flex-col lg:flex-row gap-6 min-h-[600px] animate-fade-in font-sans">
      
      {/* LEFT COLUMN: Controls & Configurations */}
      <div className="flex-1 max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ListRestart className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Loop Reset Stress Tester</h2>
          </div>
          <button 
            onClick={onBackToDashboard}
            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-bold cursor-pointer"
          >
            ← Back to Map
          </button>
        </div>

        {/* Target Device Picker */}
        <div className="space-y-3.5">
          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">1. Select Target Hardware</h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Target Row</label>
              <select
                value={targetRow}
                onChange={(e) => setTargetRow(parseInt(e.target.value, 10))}
                disabled={isRunning}
                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-sans rounded-lg outline-none font-bold text-slate-700 focus:bg-white disabled:opacity-60"
              >
                {Array.from({ length: 30 }, (_, i) => i + 1).map(r => (
                  <option key={r} value={r}>Row {r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Target Seat</label>
              <select
                value={targetSeat}
                onChange={(e) => setTargetSeat(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-sans rounded-lg outline-none font-bold text-slate-700 focus:bg-white disabled:opacity-60"
              >
                <option value="ALL">ALL (Whole Row)</option>
                {['A', 'B', 'C', 'D', 'E', 'F'].map(s => (
                  <option key={s} value={s}>Seat {s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Reset Command Type */}
        <div className="space-y-3.5">
          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">2. Reset Type & Target Module</h3>
          
          <div className="flex gap-2 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            {(['soft', 'hard', 'ssb'] as ResetType[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setResetType(t)}
                disabled={isRunning}
                className={`flex-1 py-1.5 rounded-md font-mono text-xs uppercase cursor-pointer font-bold transition-all disabled:opacity-50 ${
                  resetType === t
                    ? t === 'hard'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : t === 'ssb'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Sub-targets */}
          {resetType === 'soft' && (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Soft Reset Target</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-55 border border-slate-200 rounded-lg">
                {(['som', 'handset', 'full'] as SoftResetTarget[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setSoftTarget(t)}
                    disabled={isRunning}
                    className={`py-1 rounded-md font-mono text-[11px] uppercase cursor-pointer font-bold ${
                      softTarget === t
                        ? 'bg-white text-blue-750 shadow-sm border border-slate-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-150">
                {targetExplanations[softTarget]}
              </p>
            </div>
          )}

          {resetType === 'hard' && (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Hard Reset Target</label>
              <div className="grid grid-cols-5 gap-1 p-1 bg-slate-55 border border-slate-200 rounded-lg overflow-x-auto">
                {(['som', 'handset', '4kdu', 'ccu', 'full'] as HardResetTarget[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setHardTarget(t)}
                    disabled={isRunning}
                    className={`py-1 rounded text-[10px] font-mono uppercase cursor-pointer font-bold ${
                      hardTarget === t
                        ? 'bg-white text-rose-750 border border-slate-200 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-150">
                {targetExplanations[hardTarget]}
              </p>
            </div>
          )}

          {resetType === 'ssb' && (
            <div className="text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex gap-2">
              <Cpu className="w-4 h-4 text-amber-500 shrink-0" />
              <span>SSB (Smart Switch Board): Reboots the overall power lines for Row {targetRow} completely.</span>
            </div>
          )}
        </div>

        {/* Iterations & Timers */}
        <div className="space-y-3.5 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">3. Loop Settings</h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Iterations</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={loopCount}
                onChange={(e) => setLoopCount(Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                disabled={isRunning}
                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-mono rounded-lg outline-none font-bold text-slate-750 focus:bg-white disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Interval (Sec)</label>
              <input
                type="number"
                min="0.5"
                max="60"
                step="0.5"
                value={(intervalMs / 1000).toFixed(1)}
                onChange={(e) => setIntervalMs(Math.max(500, Math.round(parseFloat(e.target.value) * 1000) || 1000))}
                disabled={isRunning}
                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-mono rounded-lg outline-none font-bold text-slate-750 focus:bg-white disabled:opacity-60"
              />
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5 items-center justify-between text-[11px] text-slate-500">
            <span>Presets:</span>
            <div className="flex gap-1">
              {[5, 50, 100, 500].map(qty => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setLoopCount(qty)}
                  disabled={isRunning}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-mono font-bold text-[10px] cursor-pointer disabled:opacity-50"
                >
                  {qty}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action controllers */}
        <div className="pt-3 border-t border-slate-100 flex gap-2">
          {!isRunning ? (
            <button
              onClick={startStressTest}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Start Stress Test
            </button>
          ) : (
            <>
              <button
                onClick={pauseStressTest}
                className={`flex-1 py-3 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all border cursor-pointer ${
                  isPaused 
                    ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                    : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                )}
              </button>
              <button
                onClick={stopStressTest}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-500/10 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Test
              </button>
            </>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Live Telemetry, Counters and Log Console */}
      <div className="flex-1 bg-slate-950 text-slate-200 rounded-2xl p-5 font-mono text-xs overflow-hidden flex flex-col border border-slate-900 shadow-2xl min-h-[500px]">
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Avionics Test Loop Telemetry</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">TARGET:</span>
            <span className="text-white font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {targetRow}{targetSeat !== 'ALL' ? targetSeat : ' (ALL)'} · {resetType.toUpperCase()}{getSubTarget() ? ` (${getSubTarget()?.toUpperCase()})` : ''}
            </span>
          </div>
        </div>

        {/* Dashboard grid for counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          
          {/* STAT 1: Progress */}
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850/50 flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> PROGRESS
            </span>
            <div>
              <div className="text-lg font-bold text-white flex items-baseline gap-1">
                <span>{currentIteration}</span>
                <span className="text-slate-500 text-xs font-normal">/ {loopCount}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* STAT 2: Success Count */}
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850/50 flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> SUCCESSES
            </span>
            <div>
              <div className="text-lg font-bold text-emerald-400">{successCount}</div>
              <span className="text-[10px] text-slate-500 mt-1 block">Successfully executed</span>
            </div>
          </div>

          {/* STAT 3: Failed Count */}
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850/50 flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-rose-400" /> FAILURES
            </span>
            <div>
              <div className="text-lg font-bold text-rose-400">{failedCount}</div>
              <span className="text-[10px] text-slate-500 mt-1 block">Denied or timed out</span>
            </div>
          </div>

          {/* STAT 4: Success Rate & Latency */}
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850/50 flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-amber-400" /> RELIABILITY
            </span>
            <div>
              <div className="text-lg font-bold text-amber-400">{successRate}%</div>
              <span className="text-[10px] text-slate-500 mt-1 block">Avg Ping: <strong className="text-slate-350">{avgResponseTime}ms</strong></span>
            </div>
          </div>

        </div>

        {/* Live Logs Stream Console */}
        <div className="flex-1 flex flex-col min-h-[250px]">
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-2">
            <span>Real-time Command Pipeline Logs</span>
            <span>Showing last 500 loops</span>
          </div>

          <div className="flex-1 bg-black/60 rounded-xl p-3 border border-slate-900 overflow-y-auto max-h-[280px] font-mono space-y-1.5 scrollbar-thin select-text">
            {testLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-10 text-slate-600 gap-2 font-sans">
                <Gauge className="w-8 h-8 text-slate-800 animate-pulse" />
                <p className="text-xs">Testing loop is currently offline.</p>
                <p className="text-[10px] text-slate-700">Configure parameters on the left and click "Start Stress Test" to begin continuous automated resets.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {testLogs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start justify-between text-[11px] py-1 border-b border-slate-900/40 hover:bg-slate-900/40 px-1 rounded transition-colors"
                  >
                    <div className="flex items-start gap-2 max-w-[80%]">
                      <span className="text-slate-500 font-bold text-[10px]">[{log.timestamp}]</span>
                      <span className="text-slate-400 font-bold">L#{String(log.iteration).padStart(3, '0')}</span>
                      
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                            log.status === 'success' 
                              ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/40' 
                              : 'bg-rose-950/50 text-rose-400 border border-rose-900/40'
                          }`}>
                            {log.status.toUpperCase()}
                          </span>
                          <span className="text-slate-300 font-semibold">{log.message}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
                      <span>ping: <strong className="text-slate-400 font-bold">{log.responseTimeMs}ms</strong></span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Safety caution note */}
        <div className="mt-4 pt-3 border-t border-slate-900 text-[10px] text-slate-500 flex items-start gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-900/80">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong>CAUTION:</strong> Running high loop frequencies (e.g. 500 resets) back-to-back can generate significant bus queues. It is recommended to use an interval of &gt; 1.5 seconds in simulation or live hardware environments to prevent bus congestion.
          </span>
        </div>

      </div>

    </div>
  );
}
