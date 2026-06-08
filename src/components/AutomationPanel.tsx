import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle, 
  Sliders, 
  Cpu, 
  Zap, 
  Trash2, 
  Plus, 
  Clock, 
  ChevronRight, 
  Layers, 
  HelpCircle,
  Wrench,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
  X
} from 'lucide-react';
import { Seat, ResetType, SoftResetTarget, HardResetTarget } from '../types';

interface AutomationTask {
  id: string;
  type: ResetType;
  rowNumber: number;
  seatId: string; // "A"-"F" or "ALL"
  delaySeconds: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  progress?: number;
  target?: string;
}

interface AutomationPanelProps {
  cabinRows: any[];
  onTriggerReset: (params: {
    type: ResetType;
    rowNumber?: number;
    seatId?: string;
    target?: string;
  }) => Promise<void>;
  isLoading: boolean;
  onBackToDashboard: () => void;
}

export default function AutomationPanel({
  cabinRows,
  onTriggerReset,
  isLoading,
  onBackToDashboard
}: AutomationPanelProps) {
  // Task Queue
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number>(-1);
  const [executionDelayRemaining, setExecutionDelayRemaining] = useState<number>(0);
  
  // Builder form inputs
  const [resetType, setResetType] = useState<ResetType>('soft');
  const [softTarget, setSoftTarget] = useState<SoftResetTarget>('som');
  const [hardTarget, setHardTarget] = useState<HardResetTarget>('som');
  
  // Target documentation explanations to make it extremely professional
  const targetExplanations: Record<string, string> = {
    som: 'SOM (Seat Option Module): Handles in-seat peripheral power & sensor suites.',
    handset: 'Passenger Handset: Quick reboot of the client handset telephone/remote control.',
    '4kdu': '4KDU (4K Display Unit): Restarts the main seat-back touchscreen display.',
    ccu: 'CCU (Cabin Control Unit): Gateways AV/power to this specific seat cluster.',
    full: 'Full seat reset: Overwrites power lines and restarts the entire seat stack.',
  };

  const [rowSelectionMode, setRowSelectionMode] = useState<'range' | 'custom'>('range');
  const [startRow, setStartRow] = useState<number>(1);
  const [endRow, setEndRow] = useState<number>(5);
  const [customRowsInput, setCustomRowsInput] = useState<string>('12, 14, 15');
  const [seatSelectionMode, setSeatSelectionMode] = useState<'all' | 'specific' | 'side-port' | 'side-starboard'>('all');
  const [specificSeat, setSpecificSeat] = useState<string>('A');
  const [taskDelay, setTaskDelay] = useState<number>(3); // seconds to stagger

  // Timers and Refs
  const executionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const delayCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef<boolean>(false);
  isExecutingRef.current = isExecuting;

  const moveTaskUp = (index: number) => {
    if (index <= 0) return;
    setTasks(prev => {
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
      
      // Keep track of currentTaskIndex
      if (currentTaskIndex === index) {
        setCurrentTaskIndex(index - 1);
      } else if (currentTaskIndex === index - 1) {
        setCurrentTaskIndex(index);
      }
      return list;
    });
  };

  const moveTaskDown = (index: number) => {
    if (index >= tasks.length - 1) return;
    setTasks(prev => {
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;

      // Keep track of currentTaskIndex
      if (currentTaskIndex === index) {
        setCurrentTaskIndex(index + 1);
      } else if (currentTaskIndex === index + 1) {
        setCurrentTaskIndex(index);
      }
      return list;
    });
  };

  const removeTask = (id: string, index: number) => {
    setTasks(prev => {
      const list = prev.filter(t => t.id !== id);
      
      // Handle adjusting current index if running sequence
      if (currentTaskIndex === index) {
        // If current running is removed, stop executing or reset current index
        if (isExecuting) {
          stopExecution();
        }
        setCurrentTaskIndex(prevIdx => prevIdx > 0 ? prevIdx - 1 : -1);
      } else if (currentTaskIndex > index) {
        setCurrentTaskIndex(prevIdx => prevIdx - 1);
      }
      return list;
    });
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (executionTimerRef.current) clearTimeout(executionTimerRef.current);
      if (delayCountdownRef.current) clearInterval(delayCountdownRef.current);
    };
  }, []);

  // Presets templates helper
  const applyPreset = (presetType: 'eco-cascade' | 'business-sync' | 'starboard-refresh' | 'diagnostic-heal') => {
    // Stop active execution
    stopExecution();

    let newTasks: AutomationTask[] = [];

    if (presetType === 'eco-cascade') {
      // Economy Rows: 13 to 30 staggered soft resets
      for (let r = 13; r <= 20; r++) { // limit to 8 staggered steps to minimize visual spam but provide enough depth
        newTasks.push({
          id: `preset-eco-${r}`,
          type: 'soft',
          rowNumber: r,
          seatId: 'ALL',
          delaySeconds: 2,
          status: 'pending'
        });
      }
    } else if (presetType === 'business-sync') {
      // Business Rows: 6 to 12 ssb system resets
      for (let r = 6; r <= 10; r++) {
        newTasks.push({
          id: `preset-biz-${r}`,
          type: 'ssb',
          rowNumber: r,
          seatId: 'A',
          delaySeconds: 4,
          status: 'pending'
        });
      }
    } else if (presetType === 'starboard-refresh') {
      // Starboard (A, B, C) seats on rows 1 to 10
      for (let r = 1; r <= 8; r++) {
        newTasks.push({
          id: `preset-starboard-${r}-A`,
          type: 'soft',
          rowNumber: r,
          seatId: 'A',
          delaySeconds: 1,
          status: 'pending'
        });
        newTasks.push({
          id: `preset-starboard-${r}-B`,
          type: 'soft',
          rowNumber: r,
          seatId: 'B',
          delaySeconds: 1,
          status: 'pending'
        });
      }
    } else if (presetType === 'diagnostic-heal') {
      // Find hypothetical offline seats in simulated rows and rebuild automated fix
      // If none found, we generate 3 realistic offline seats for demonstration
      const offlineFound: {row: number, seat: string}[] = [];
      cabinRows.forEach(row => {
        row.seats.forEach((s: any) => {
          if (s.status === 'offline' && offlineFound.length < 5) {
            offlineFound.push({ row: s.rowNumber, seat: s.seatLetter });
          }
        });
      });

      if (offlineFound.length === 0) {
        // Mock fallback to heal row 3 seat F, row 12 seat A, row 22 seat C
        offlineFound.push({ row: 3, seat: 'F' });
        offlineFound.push({ row: 12, seat: 'A' });
        offlineFound.push({ row: 22, seat: 'C' });
      }

      offlineFound.forEach((seatNode, idx) => {
        newTasks.push({
          id: `preset-heal-${idx}`,
          type: 'hard',
          rowNumber: seatNode.row,
          seatId: seatNode.seat,
          delaySeconds: 5,
          status: 'pending'
        });
      });
    }

    setTasks(newTasks);
    setCurrentTaskIndex(-1);
    setExecutionDelayRemaining(0);
  };

  // Add individual custom task to the custom grid
  const handleAddNewTasks = (e: React.FormEvent) => {
    e.preventDefault();
    
    let targetRows: number[] = [];

    if (rowSelectionMode === 'range') {
      const minRow = Math.min(startRow, endRow);
      const maxRow = Math.max(startRow, endRow);
      for (let r = minRow; r <= maxRow; r++) {
        if (r >= 1 && r <= 30) {
          targetRows.push(r);
        }
      }
    } else {
      // Custom parser e.g. "2, 4, 15"
      const parts = customRowsInput.split(',');
      parts.forEach(part => {
        const num = parseInt(part.trim(), 10);
        if (!isNaN(num) && num >= 1 && num <= 30) {
          targetRows.push(num);
        }
      });
    }

    if (targetRows.length === 0) return;

    let newTasksToAdd: AutomationTask[] = [];

    targetRows.forEach((rowNum, rowIdx) => {
      const uniqueId = `task-${Date.now()}-${rowNum}-${Math.random().toString(36).substring(2, 6)}`;
      const currentTarget = resetType === 'soft' ? softTarget : resetType === 'hard' ? hardTarget : undefined;
      
      // Handle Seat Selection modes
      if (seatSelectionMode === 'all') {
        newTasksToAdd.push({
          id: uniqueId,
          type: resetType,
          rowNumber: rowNum,
          seatId: 'ALL',
          delaySeconds: taskDelay,
          status: 'pending',
          target: currentTarget
        });
      } else if (seatSelectionMode === 'specific') {
        newTasksToAdd.push({
          id: uniqueId,
          type: resetType,
          rowNumber: rowNum,
          seatId: specificSeat,
          delaySeconds: taskDelay,
          status: 'pending',
          target: currentTarget
        });
      } else if (seatSelectionMode === 'side-port') {
        // A, B, C Left-side
        ['A', 'B', 'C'].forEach((s, subIdx) => {
          newTasksToAdd.push({
            id: `${uniqueId}-${s}`,
            type: resetType,
            rowNumber: rowNum,
            seatId: s,
            delaySeconds: subIdx === 0 ? taskDelay : 0.5, // low lag step between immediate seats
            status: 'pending',
            target: currentTarget
          });
        });
      } else if (seatSelectionMode === 'side-starboard') {
        // D, E, F Right-side
        ['D', 'E', 'F'].forEach((s, subIdx) => {
          newTasksToAdd.push({
            id: `${uniqueId}-${s}`,
            type: resetType,
            rowNumber: rowNum,
            seatId: s,
            delaySeconds: subIdx === 0 ? taskDelay : 0.5,
            status: 'pending',
            target: currentTarget
          });
        });
      }
    });

    setTasks(prev => [...prev, ...newTasksToAdd]);
  };

  // Stop current execution thread
  const stopExecution = () => {
    setIsExecuting(false);
    if (executionTimerRef.current) {
      clearTimeout(executionTimerRef.current);
      executionTimerRef.current = null;
    }
    if (delayCountdownRef.current) {
      clearInterval(delayCountdownRef.current);
      delayCountdownRef.current = null;
    }
    setExecutionDelayRemaining(0);
  };

  // Run the sequence manager
  const startExecution = () => {
    if (tasks.length === 0) return;
    
    // Check if we are finished and need rebooting the cycle starting from first
    const anyPending = tasks.some(t => t.status === 'pending');
    let startingIndex = currentTaskIndex;

    if (!anyPending || currentTaskIndex >= tasks.length - 1) {
      // Reset all status back to pending to do fresh run
      setTasks(prev => prev.map(t => ({ ...t, status: 'pending' })));
      startingIndex = 0;
      setCurrentTaskIndex(0);
    } else if (currentTaskIndex === -1) {
      startingIndex = 0;
      setCurrentTaskIndex(0);
    }

    setIsExecuting(true);
  };

  // Master execution logic runner
  useEffect(() => {
    if (!isExecuting) return;

    const runNextTask = async () => {
      // Find next appropriate index to run
      let nextIdx = currentTaskIndex === -1 ? 0 : currentTaskIndex;
      
      // If current task is already completed (success/failed/skipped), move forward
      while (nextIdx < tasks.length && tasks[nextIdx].status !== 'pending') {
        nextIdx++;
      }

      if (nextIdx >= tasks.length) {
        // Complete execution cycle
        stopExecution();
        return;
      }

      setCurrentTaskIndex(nextIdx);
      const activeTask = tasks[nextIdx];

      // Mark running
      setTasks(prev => prev.map((t, idx) => idx === nextIdx ? { ...t, status: 'running' } : t));

      try {
        // If target is ALL seats in row, cascade loop or trigger on all seat characters
        if (activeTask.seatId === 'ALL') {
          // Trigger individual resets sequential
          const seatChars = ['A', 'B', 'C', 'D', 'E', 'F'];
          for (const char of seatChars) {
            await onTriggerReset({
              type: activeTask.type,
              rowNumber: activeTask.rowNumber,
              seatId: char,
              target: activeTask.target || 'full'
            });
          }
        } else {
          await onTriggerReset({
            type: activeTask.type,
            rowNumber: activeTask.rowNumber,
            seatId: activeTask.seatId,
            target: activeTask.target || 'full'
          });
        }

        // Complete task with success
        setTasks(prev => prev.map((t, idx) => idx === nextIdx ? { ...t, status: 'success' } : t));
      } catch (err) {
        // Mark failed
        setTasks(prev => prev.map((t, idx) => idx === nextIdx ? { ...t, status: 'failed' } : t));
      }

      // Handle Stagger Delay before running the next operation
      const delay = activeTask.delaySeconds;
      if (delay > 0 && nextIdx < tasks.length - 1) {
        setExecutionDelayRemaining(delay);
        
        // Start Countdown Ticker for UI Feedback
        if (delayCountdownRef.current) clearInterval(delayCountdownRef.current);
        delayCountdownRef.current = setInterval(() => {
          setExecutionDelayRemaining(prev => {
            if (prev <= 1) {
              if (delayCountdownRef.current) clearInterval(delayCountdownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // Schedule timeout to run next step in chain
        executionTimerRef.current = setTimeout(() => {
          if (isExecutingRef.current) {
            setCurrentTaskIndex(nextIdx + 1);
          }
        }, delay * 1000);
      } else {
        // Immediate launch next item
        setTimeout(() => {
          if (isExecutingRef.current) {
            setCurrentTaskIndex(nextIdx + 1);
          }
        }, 300);
      }
    };

    runNextTask();

  }, [isExecuting, currentTaskIndex]);

  // Statistics
  const completedTasks = tasks.filter(t => t.status === 'success').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-slide-up">
      {/* Header Bar */}
      <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold uppercase tracking-tight">
              Avionics Auto-Sequencer & Reset Automation
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
              SYSTEM CONSOLE: stagger_scheduler_v2_opt
            </p>
          </div>
        </div>
        <button
          onClick={onBackToDashboard}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 transition-colors cursor-pointer border border-slate-700/60"
        >
          🗂️ Live Dashboard View
        </button>
      </div>

      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Creator Form */}
        <div className="lg:col-span-5 space-y-6">

          {/* Sequence Builder Form */}
          <form onSubmit={handleAddNewTasks} className="border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <Sliders className="w-4.5 h-4.5 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">
                Build Custom Automation Step
              </h3>
            </div>

            {/* Reset Action */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Command Trigger Mode</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setResetType('soft')}
                  className={`py-2 text-[11px] rounded-lg cursor-pointer transition-colors font-bold border ${
                    resetType === 'soft' 
                      ? 'bg-blue-50 text-blue-700 border-blue-400' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  SOM Soft
                </button>
                <button
                  type="button"
                  onClick={() => setResetType('hard')}
                  className={`py-2 text-[11px] rounded-lg cursor-pointer transition-colors font-bold border ${
                    resetType === 'hard' 
                      ? 'bg-red-50 text-red-700 border-red-300' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Seat Hard
                </button>
                <button
                  type="button"
                  onClick={() => setResetType('ssb')}
                  className={`py-2 text-[11px] rounded-lg cursor-pointer transition-colors font-bold border ${
                    resetType === 'ssb' 
                      ? 'bg-amber-50 text-amber-705 border-amber-300' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  SSB MCU
                </button>
              </div>
            </div>

            {/* Target Selection depending on type */}
            {resetType === 'soft' && (
              <div className="flex flex-col gap-1.5 space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Soft Reset Target</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                  {(['som', 'handset', 'full'] as SoftResetTarget[]).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setSoftTarget(t)}
                      className={`py-1.5 rounded-md font-mono text-xs uppercase cursor-pointer font-bold ${
                        softTarget === t
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mt-1 flex gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>{targetExplanations[softTarget]}</span>
                </div>
              </div>
            )}

            {resetType === 'hard' && (
              <div className="flex flex-col gap-1.5 space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Hard Reset Target</label>
                <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 border border-slate-205 rounded-lg overflow-x-auto">
                  {(['som', 'handset', '4kdu', 'ccu', 'full'] as HardResetTarget[]).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setHardTarget(t)}
                      className={`py-1.5 rounded text-[10px] font-mono uppercase cursor-pointer font-bold ${
                        hardTarget === t
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mt-1 flex gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{targetExplanations[hardTarget]}</span>
                </div>
              </div>
            )}

            {/* Row Grid Pick */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Select Cabin Row(s)</label>
                <div className="flex gap-2">
                  <span 
                    onClick={() => setRowSelectionMode('range')} 
                    className={`cursor-pointer ${rowSelectionMode === 'range' ? 'text-blue-600 font-bold' : 'text-slate-400'}`}
                  >
                    Range
                  </span>
                  <span className="text-slate-305">|</span>
                  <span 
                    onClick={() => setRowSelectionMode('custom')} 
                    className={`cursor-pointer ${rowSelectionMode === 'custom' ? 'text-blue-600 font-bold' : 'text-slate-400'}`}
                  >
                    Custom List
                  </span>
                </div>
              </div>

              {rowSelectionMode === 'range' ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-slate-400">Start Row</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={startRow}
                      onChange={(e) => setStartRow(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)))}
                      className="w-full bg-white border border-slate-200 p-2 text-xs font-mono rounded-lg outline-none focus:border-blue-400"
                    />
                  </div>
                  <span className="text-slate-400 font-bold mt-4">➜</span>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-slate-400">End Row</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={endRow}
                      onChange={(e) => setEndRow(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)))}
                      className="w-full bg-white border border-slate-200 p-2 text-xs font-mono rounded-lg outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-405">Comma separated list (e.g., 2, 5, 12, 18)</span>
                  <input
                    type="text"
                    value={customRowsInput}
                    onChange={(e) => setCustomRowsInput(e.target.value)}
                    placeholder="2, 5, 12, 18"
                    className="w-full bg-white border border-slate-200 p-2 text-xs font-mono rounded-lg outline-none focus:border-blue-400"
                  />
                </div>
              )}
            </div>

            {/* Seat Position Column letters */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Target Seats</label>
              <select
                value={seatSelectionMode}
                onChange={(e) => setSeatSelectionMode(e.target.value as any)}
                className="w-full bg-white border border-slate-200 p-2 text-xs font-sans rounded-lg outline-none"
              >
                <option value="all">Complete Row (A, B, C, D, E, F Cascade)</option>
                <option value="side-port">Port Side Group only (A - B - C Left)</option>
                <option value="side-starboard">Starboard Side Group only (D - E - F Right)</option>
                <option value="specific">Specific Seat Letter Column Only</option>
              </select>

              {seatSelectionMode === 'specific' && (
                <div className="grid grid-cols-6 gap-1 mt-1">
                  {['A', 'B', 'C', 'D', 'E', 'F'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpecificSeat(s)}
                      className={`py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                        specificSeat === s
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time Stagger Delay */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase flex justify-between">
                <span>Stagger Step Delay</span>
                <span className="font-mono text-blue-600 border border-blue-100 bg-blue-50/50 px-2 py-0.5 rounded text-xs">
                  {taskDelay >= 60 
                    ? `${Math.floor(taskDelay / 60)}m ${taskDelay % 60}s` 
                    : `${taskDelay}s`}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={180}
                step={1}
                value={taskDelay}
                onChange={(e) => setTaskDelay(parseInt(e.target.value, 10))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="block text-[10px] text-slate-400 leading-normal">
                Stagger prevent concurrent power draw shocks on the main bus grid. Supports up to 3 minutes delay.
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" /> Add Steps to Queue ({rowSelectionMode === 'range' ? Math.abs(endRow - startRow) + 1 : customRowsInput.split(',').length} operations)
            </button>
          </form>

        </div>

        {/* Right Column: Active queue tracer list */}
        <div className="lg:col-span-7 flex flex-col h-full space-y-4">
          
          {/* Main Monitor HUD bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1 w-full">
              <div className="flex items-center justify-between text-xs font-bold font-sans">
                <span className="text-slate-500 uppercase">Automation Progress Bar</span>
                <span className="text-blue-600 bg-blue-50 border border-blue-100/60 px-2 py-0.5 rounded font-mono font-medium">
                  {completedTasks} / {tasks.length} Completed ({progressPercent}%)
                </span>
              </div>
              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden w-full relative">
                <motion.div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Queue Controls */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              {isExecuting ? (
                <button
                  type="button"
                  onClick={stopExecution}
                  className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs uppercase tracking-wider shadow duration-150 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Pause className="w-4 h-4" /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  disabled={tasks.length === 0}
                  onClick={startExecution}
                  className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow duration-150 transition-all flex items-center gap-1.5 cursor-pointer ${
                    tasks.length === 0
                      ? 'bg-slate-205 text-slate-400 cursor-not-allowed border border-slate-300'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Play className="w-4 h-4" /> Start Loop
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  stopExecution();
                  setTasks([]);
                  setCurrentTaskIndex(-1);
                }}
                className="p-3 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
                title="Clear complete automation sequence list"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Time delay countdown overlay if delay is active */}
          <AnimatePresence>
            {isExecuting && executionDelayRemaining > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs flex items-center justify-between"
              >
                <span className="text-amber-800 font-semibold flex items-center gap-1.5 animate-pulse">
                  <Clock className="w-4.5 h-4.5 text-amber-600" /> STAGGERING: Safely delaying stream execution sequence...
                </span>
                <span className="font-mono font-bold text-amber-700 bg-white border border-amber-200 px-2.5 py-0.5 rounded shadow-sm text-sm">
                  {executionDelayRemaining >= 60 
                    ? `${Math.floor(executionDelayRemaining / 60)}m ${executionDelayRemaining % 60}s` 
                    : `${executionDelayRemaining}s`} remaining
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tasks Stack view */}
          <div className="flex-1 bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-hidden flex flex-col border border-slate-900 shadow-inner min-h-[350px]">
            <div className="flex items-center justify-between text-[11px] uppercase text-slate-400 pb-3 border-b border-slate-800 font-bold tracking-wider">
              <span>Task List Cascade</span>
              <span>Sequence Status Console</span>
            </div>

            {/* Custom Log View Scrubber */}
            <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-2 scrollbar-thin scrollbar-thumb-slate-805">
              {tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-slate-500 gap-2">
                  <Sliders className="w-9 h-9 text-slate-700 font-normal inline" />
                  <p className="font-sans text-xs">No active automation sequences nested.</p>
                  <p className="font-sans text-[10px] text-slate-600">Customize your target cabin range and trigger details to begin.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {tasks.map((task, idx) => {
                    const isCurrent = idx === currentTaskIndex;
                    return (
                      <div
                        key={task.id}
                        className={`p-2.5 rounded border transition-all flex items-center justify-between ${
                          isCurrent
                            ? 'bg-blue-950/40 border-blue-800 text-blue-200'
                            : task.status === 'success'
                            ? 'bg-emerald-950/20 border-emerald-950/40 text-emerald-400'
                            : task.status === 'failed'
                            ? 'bg-red-950/20 border-red-950/40 text-red-400'
                            : 'bg-slate-900/40 border-slate-800/50 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-550 w-5 font-bold">
                            #{String(idx + 1).padStart(2, '0')}
                          </span>
                          
                           {/* Type Indicator */}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                            task.type === 'soft' 
                              ? 'bg-blue-900/40 text-blue-300' 
                              : task.type === 'hard' 
                              ? 'bg-red-900/40 text-red-300' 
                              : 'bg-amber-900/40 text-amber-300'
                          }`}>
                            {task.type.toUpperCase()}{task.target ? ` · ${task.target.toUpperCase()}` : ''}
                          </span>

                          <span className="font-bold text-slate-100">
                            ROW {task.rowNumber}
                          </span>

                          <span className="text-slate-400 text-[11px]">
                            {task.seatId === 'ALL' ? '(Seats A-F Cascade)' : `(Seat ${task.seatId})`}
                          </span>
                        </div>

                        {/* Status indicators and manipulation controls */}
                        <div className="flex items-center gap-3">
                          {/* Status Label badge */}
                          <div className="flex items-center gap-2">
                            {task.status === 'running' && (
                              <span className="flex items-center gap-1 bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin inline-block text-blue-400" />
                                PROCESSING...
                              </span>
                            )}
                            {task.status === 'success' && (
                              <span className="flex items-center gap-1 text-emerald-450 text-[10px] font-bold uppercase">
                                <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-400 shrink-0" />
                                Delivered
                              </span>
                            )}
                            {task.status === 'failed' && (
                              <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold uppercase">
                                <XCircle className="w-3.5 h-3.5 inline text-red-400 shrink-0" />
                                Failed
                              </span>
                            )}
                            {task.status === 'pending' && (
                              <span className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                                Queued ({task.delaySeconds >= 60 
                                  ? `${Math.floor(task.delaySeconds / 60)}m ${task.delaySeconds % 60}s` 
                                  : `${task.delaySeconds}s`} delay)
                              </span>
                            )}
                          </div>

                          {/* Reordering Action Controls & Deletion */}
                          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
                            <button
                              type="button"
                              onClick={() => moveTaskUp(idx)}
                              disabled={idx === 0 || isExecuting}
                              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-450 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-slate-900 disabled:hover:text-slate-450 transition-colors cursor-pointer"
                              title="Sıralamada Yukarı Taşı"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTaskDown(idx)}
                              disabled={idx === tasks.length - 1 || isExecuting}
                              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-450 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-slate-900 disabled:hover:text-slate-450 transition-colors cursor-pointer"
                              title="Sıralamada Aşağı Taşı"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTask(task.id, idx)}
                              disabled={isExecuting && isCurrent}
                              className="p-1 rounded bg-red-950/40 border border-red-900/40 text-red-450 hover:text-red-300 hover:bg-red-900/65 transition-colors cursor-pointer"
                              title="Adımı Kuyruktan Kaldır"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Terminal foot indicator */}
            <div className="pt-2 border-t border-slate-900 font-sans text-[10px] text-slate-605 flex justify-between items-center mt-2.5">
              <span>✈️ Avionics Link Status: Nominal IP proxy</span>
              <span>Buffer: {tasks.length} actions loaded</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
