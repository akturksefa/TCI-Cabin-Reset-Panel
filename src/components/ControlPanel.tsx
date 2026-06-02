import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Cpu, 
  PowerOff, 
  Play, 
  Sparkles, 
  Sliders, 
  ChevronRight, 
  Lock, 
  Unlock,
  HelpCircle,
  CornerDownRight
} from 'lucide-react';
import { Seat, SoftResetTarget, HardResetTarget, ResetType } from '../types';

interface ControlPanelProps {
  selectedSeat: Seat | null;
  onTriggerReset: (params: {
    type: ResetType;
    rowNumber?: number;
    seatId?: string;
    target?: string;
  }) => void;
  isLoading: boolean;
  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
}

export default function ControlPanel({
  selectedSeat,
  onTriggerReset,
  isLoading,
  isSimulating,
  setIsSimulating,
}: ControlPanelProps) {
  const [resetType, setResetType] = useState<ResetType>('soft');
  
  // Form states for manual controls
  const [manualRow, setManualRow] = useState<number>(1);
  const [manualSeatLetter, setManualSeatLetter] = useState<string>('A');
  
  // Target states
  const [softTarget, setSoftTarget] = useState<SoftResetTarget>('som');
  const [hardTarget, setHardTarget] = useState<HardResetTarget>('som');

  // Slider unlock state for AMCU Full Reset
  const [isAmcuUnlocked, setIsAmcuUnlocked] = useState<boolean>(false);
  const [dragProgress, setDragProgress] = useState<number>(0);

  // Synced state on select seat
  useEffect(() => {
    if (selectedSeat) {
      setManualRow(selectedSeat.rowNumber);
      setManualSeatLetter(selectedSeat.seatLetter);
      // Automatically switch to either soft or hard reset on seat click
      if (resetType === 'amcu') {
        setResetType('soft');
      }
    }
  }, [selectedSeat]);

  // Target documentation explanations to make it extremely professional
  const targetExplanations: Record<string, string> = {
    som: 'SOM (Seat Option Module): Handles in-seat peripheral power & sensor suites.',
    handset: 'Passenger Handset: Quick reboot of the client handset telephone/remote control.',
    '4kdu': '4KDU (4K Display Unit): Restarts the main seat-back touchscreen display.',
    ccu: 'CCU (Cabin Control Unit): Gateways AV/power to this specific seat cluster.',
    full: 'Full seat reset: Overwrites power lines and restarts the entire seat stack.',
  };

  const handleManualTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    if (resetType === 'soft') {
      onTriggerReset({
        type: 'soft',
        rowNumber: manualRow,
        seatId: manualSeatLetter,
        target: softTarget,
      });
    } else if (resetType === 'hard') {
      onTriggerReset({
        type: 'hard',
        rowNumber: manualRow,
        seatId: manualSeatLetter,
        target: hardTarget,
      });
    } else if (resetType === 'ssb') {
      onTriggerReset({
        type: 'ssb',
        rowNumber: manualRow,
      });
    }
  };

  const handleAmcuReset = () => {
    if (!isAmcuUnlocked) return;
    onTriggerReset({ type: 'amcu' });
    // Relock after triggering to prevent double clicks
    setIsAmcuUnlocked(false);
    setDragProgress(0);
  };

  return (
    <div className="bg-white border border-slate-205 rounded-2xl p-6 flex flex-col h-full shadow-sm relative text-[#212529]" id="control-panel-card">
      <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          Avionics Controller Panel
        </h2>

        {/* Global simulation mode toggle */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200" title="When simulation is ON, requests fall back to mock data if the aircraft is unreachable.">
          <Sparkles className={`w-3.5 h-3.5 transition-colors ${isSimulating ? 'text-amber-500' : 'text-slate-400'}`} />
          <span className="text-[11px] font-bold text-slate-500">Simulation</span>
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
              isSimulating ? 'bg-amber-450' : 'bg-slate-300'
            }`}
            id="simulation-toggle-btn"
          >
            <div
              className={`w-3.5 h-3.5 bg-white rounded-full transition-transform duration-200 ${
                isSimulating ? 'translate-x-3.5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Mode Selection (Tabs) */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl mb-5">
        {(['soft', 'hard', 'ssb', 'amcu'] as ResetType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setResetType(tab)}
            className={`py-1.5 px-0.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer ${
              resetType === tab
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-705'
            }`}
            id={`tab-btn-${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {resetType !== 'amcu' ? (
            <motion.form
              key="manual-form"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              onSubmit={handleManualTrigger}
              className="space-y-4"
              id="mcu-action-form"
            >
              {/* Context Indicator */}
              {selectedSeat ? (
                <div className="bg-blue-50/50 border border-blue-105 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-xs text-slate-600 font-semibold">Selected Seat Target:</span>
                  </div>
                  <span className="font-mono text-sm font-bold bg-blue-600 text-white px-3 py-1 border border-blue-600 rounded-lg shadow-sm">
                    {selectedSeat.id}
                  </span>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Manual Entry Mode (No seat selected)</span>
                  <span className="text-[10px] text-slate-400 italic">Click a seat to select</span>
                </div>
              )}

              {/* Coordinates: Row and Seat Seat Letter */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-500 font-bold">Row Number</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={manualRow}
                    onChange={(e) => setManualRow(parseInt(e.target.value) || 1)}
                    disabled={isLoading}
                    className="bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 px-3 py-2 rounded-lg text-slate-800 font-mono text-sm focus:outline-none"
                    id="input-row-number"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-500 font-bold">Seat Letter</label>
                  <select
                    value={manualSeatLetter}
                    onChange={(e) => setManualSeatLetter(e.target.value)}
                    disabled={isLoading || resetType === 'ssb'}
                    className="bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 px-3 py-2 rounded-lg text-slate-800 font-mono text-sm focus:outline-none disabled:opacity-40 cursor-pointer"
                    id="select-seat-letter"
                  >
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Selection depending on type */}
              {resetType === 'soft' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-500 font-bold">Soft Reset Target</label>
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
                        id={`soft-target-btn-${t}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mt-1 flex gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span>{targetExplanations[softTarget]}</span>
                  </div>
                </div>
              )}

              {resetType === 'hard' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-500 font-bold">Hard Reset Target</label>
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
                        id={`hard-target-btn-${t}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mt-1 flex gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{targetExplanations[hardTarget]}</span>
                  </div>
                </div>
              )}

              {resetType === 'ssb' && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs leading-relaxed text-slate-600">
                  <p className="font-bold text-blue-700 mb-1 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    SSB (Seat Smart Box) Row Controller Reset
                  </p>
                  This triggers a complete row-level hardware power-cycle to the mcu of the selected row. Targets all seats on Row <span className="font-mono text-slate-800 font-bold">{manualRow}</span> (Seats A, B, C, D, E, F).
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full mt-4 flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-xl transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50 ${
                  resetType === 'hard'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white hover:shadow-rose-900/10'
                    : 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-blue-900/10'
                }`}
                id="submit-action-btn"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {resetType === 'soft' && `Trigger Soft Reboot - Seat ${manualRow}${manualSeatLetter}`}
                    {resetType === 'hard' && `Trigger Hard Reset - Seat ${manualRow}${manualSeatLetter}`}
                    {resetType === 'ssb' && `Trigger SSB MCU Reset - Row ${manualRow}`}
                  </>
                )}
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="amcu-form"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="space-y-6 flex flex-col justify-between"
              id="amcu-action-block"
            >
              {/* Warnings and details */}
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
                  <PowerOff className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-red-700 font-bold text-xs uppercase tracking-wide">
                      AMCU Master Reset Warning
                    </h3>
                    <p className="text-[11px] text-slate-600 leading-normal mt-1">
                      This action sends a full-system reset code to the onboard Access and Seat Cabin Management Unit (AMCU). This will reboot ALL in-flight entertainment software, communications, and power-grids on the plane.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Service URL:</span>
                    <span className="font-mono text-slate-700 break-all font-semibold">/api/v1/full-reset</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Headers:</span>
                    <span className="font-mono text-slate-700 font-semibold">Accept: application/json</span>
                  </div>
                </div>
              </div>

              {/* Slider Unlocking UI - Light Professional styled */}
              <div className="pt-2">
                <div className="text-center mb-3">
                  <span className="text-xs text-slate-500 font-bold">
                    {isAmcuUnlocked ? '🔓 Safety cover unlocked. Ready to trigger.' : '🔒 Swipe slider right to lift safety cover'}
                  </span>
                </div>

                <div className="relative h-14 bg-slate-150 rounded-2xl border-2 border-slate-300 flex items-center p-1 overflow-hidden" id="slider-unlock-track">
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-100 to-blue-50 transition-all duration-100 rounded-xl"
                    style={{ width: `${dragProgress * 100}%` }}
                  />

                  {/* Drag bar / handle */}
                  <div 
                    className={`absolute top-1 bottom-1 h-12 w-28 border rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-grab active:cursor-grabbing select-none transition-all ${
                      isAmcuUnlocked 
                        ? 'bg-red-600 border-red-700 text-white' 
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                    style={{ left: `calc(${dragProgress}% * (100% - 7rem))` }}
                    onMouseDown={(e) => {
                      const startX = e.clientX;
                      const rect = document.getElementById('slider-unlock-track')?.getBoundingClientRect();
                      if (!rect) return;
                      const maxDistance = rect.width - 116; // width minus handle width

                      const handleMouseMove = (mmE: MouseEvent) => {
                        const deltaX = mmE.clientX - startX;
                        const progress = Math.max(0, Math.min(1, deltaX / maxDistance));
                        setDragProgress(progress);
                        if (progress >= 0.95) {
                          setIsAmcuUnlocked(true);
                          setDragProgress(1);
                        }
                      };

                      const handleMouseUp = () => {
                        window.removeEventListener('mousemove', handleMouseMove);
                        window.removeEventListener('mouseup', handleMouseUp);
                        if (dragProgress < 0.95) {
                          setDragProgress(0);
                          setIsAmcuUnlocked(false);
                        }
                      };

                      window.addEventListener('mousemove', handleMouseMove);
                      window.addEventListener('mouseup', handleMouseUp);
                    }}
                    onTouchStart={(e) => {
                      const startX = e.touches[0].clientX;
                      const rect = document.getElementById('slider-unlock-track')?.getBoundingClientRect();
                      if (!rect) return;
                      const maxDistance = rect.width - 116;

                      const handleTouchMove = (tmE: TouchEvent) => {
                        const deltaX = tmE.touches[0].clientX - startX;
                        const progress = Math.max(0, Math.min(1, deltaX / maxDistance));
                        setDragProgress(progress);
                        if (progress >= 0.95) {
                          setIsAmcuUnlocked(true);
                          setDragProgress(1);
                        }
                      };

                      const handleTouchEnd = () => {
                        window.removeEventListener('touchmove', handleTouchMove);
                        window.removeEventListener('touchend', handleTouchEnd);
                        if (dragProgress < 0.95) {
                          setDragProgress(0);
                          setIsAmcuUnlocked(false);
                        }
                      };

                      window.addEventListener('touchmove', handleTouchMove);
                      window.addEventListener('touchend', handleTouchEnd);
                    }}
                  >
                    {isAmcuUnlocked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-white" />
                        <span className="text-xs font-bold uppercase tracking-wide text-white">Armed</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-slate-450 animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-650">Slide Right</span>
                      </>
                    )}
                  </div>

                  {/* Centered prompt line */}
                  {!isAmcuUnlocked && (
                    <div className="w-full text-center pr-2 font-mono text-[10px] uppercase font-bold text-slate-400 animate-pulse pointer-events-none flex items-center justify-end gap-1">
                      Release Cover <ChevronRight className="w-3.5 h-3.5 inline text-slate-500" />
                    </div>
                  )}
                </div>

                {/* Master action trigger button */}
                <button
                  type="button"
                  disabled={!isAmcuUnlocked || isLoading}
                  onClick={handleAmcuReset}
                  className={`w-full mt-4 flex items-center justify-center gap-2 font-bold text-sm py-3.5 rounded-xl uppercase tracking-wider transition-all duration-300 shadow-sm cursor-pointer ${
                    isAmcuUnlocked
                      ? 'bg-red-600 text-white hover:bg-red-500 shadow shadow-red-500/10'
                      : 'bg-slate-200 text-slate-405 cursor-not-allowed border border-slate-300'
                  }`}
                  id="trigger-amcu-reset-btn"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <PowerOff className="w-4 h-4" />
                      Trigger AMCU System Reset
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
