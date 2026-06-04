import React, { useState, useEffect } from 'react';
import { 
  Plane, 
  Wifi, 
  WifiOff, 
  Clock, 
  Compass, 
  Thermometer, 
  Database, 
  ShieldAlert, 
  CheckCircle, 
  Cpu, 
  Wrench,
  HelpCircle,
  Lightbulb
} from 'lucide-react';
import CabinMap from './components/CabinMap';
import ControlPanel from './components/ControlPanel';
import ActivityLog from './components/ActivityLog';
import AutomationPanel from './components/AutomationPanel';
import { CabinRow, Seat, ResetLog, ResetType } from './types';

// Helper to generate 30 Aircraft Rows with seats A, B, C, D, E, F
const generateInitialCabin = (): CabinRow[] => {
  const rows: CabinRow[] = [];
  const seatLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  
  for (let r = 1; r <= 30; r++) {
    const seats: Seat[] = seatLetters.map((letter) => ({
      id: `${r}${letter}`,
      rowNumber: r,
      seatLetter: letter,
      status: 'online',
    }));
    rows.push({
      rowNumber: r,
      seats,
    });
  }
  return rows;
};

export default function App() {
  const [cabinRows, setCabinRows] = useState<CabinRow[]>(generateInitialCabin());
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [logs, setLogs] = useState<ResetLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [sshConfig, setSshConfig] = useState<{ host: string; username: string; status: string } | null>({
    host: '10.18.225.250',
    username: 'tcitest',
    status: 'nominal'
  });

  const [activeToast, setActiveToast] = useState<{
    id: string;
    logId?: string;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    remainingSeconds?: number;
  } | null>(null);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'automation'>('dashboard');

  // Smoothly focus and scroll to the target log item
  const handleToastClick = (logId?: string) => {
    if (!logId) return;

    // 1. Set expand focus in logger
    setExpandedLogId(logId);

    // 2. Smoothly scroll target element to center of terminal screen
    setTimeout(() => {
      const element = document.getElementById(`log-${logId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight flash effect
        element.classList.add('bg-blue-50/85', 'ring-2', 'ring-blue-500/20');
        setTimeout(() => {
          element.classList.remove('bg-blue-50/85', 'ring-2', 'ring-blue-500/20');
        }, 3000);
      }
    }, 150);
  };

  // Toast automatic dismiss and cooldown ticks
  useEffect(() => {
    if (!activeToast) return;

    let timer: NodeJS.Timeout;

    if (activeToast.remainingSeconds && activeToast.remainingSeconds > 0) {
      // Tick down active avionics module cooldown duration once per second
      timer = setInterval(() => {
        setActiveToast((prev) => {
          if (!prev) return null;
          if (prev.remainingSeconds && prev.remainingSeconds > 1) {
            return {
              ...prev,
              remainingSeconds: prev.remainingSeconds - 1,
            };
          }
          return null; // Close when cooldown duration expires
        });
      }, 1000);
    } else {
      // Standard notification close after 6 seconds auto-dismissal
      timer = setTimeout(() => {
        setActiveToast(null);
      }, 6000);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(timer);
    };
  }, [activeToast]);

  
  // Dashboard indicators
  const [utcTime, setUtcTime] = useState<string>('');
  const [cabinTemp, setCabinTemp] = useState<number>(22.5);
  const [altitude, setAltitude] = useState<number>(36000);

  // Load gateway config from backend
  useEffect(() => {
    fetch('/api/proxy/ssh-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.host) {
          setSshConfig(data);
        }
      })
      .catch((err) => console.warn('Coult not load live SSH config from server:', err));
  }, []);

  // UTC clock update at interval
  useEffect(() => {
    const updateStats = () => {
      setUtcTime(new Date().toUTCString().replace('GMT', 'UTC'));
      // Slight fluctuation of altitude and temp to increase realism
      setAltitude((prev) => prev + (Math.random() > 0.5 ? 10 : -10));
      setCabinTemp((prev) => parseFloat((prev + (Math.random() > 0.5 ? 0.1 : -0.1)).toFixed(1)));
    };
    updateStats();
    const interval = setInterval(updateStats, 3000);
    return () => clearInterval(interval);
  }, []);

  // Update specific seat status
  const updateSeatStatus = (rowNumber: number, seatLetter: string, status: 'online' | 'rebooting' | 'offline', lastResetTime?: string) => {
    setCabinRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowNumber === rowNumber) {
          return {
            ...row,
            seats: row.seats.map((seat) => {
              if (seat.seatLetter === seatLetter) {
                return {
                  ...seat,
                  status,
                  ...(lastResetTime ? { lastResetTime } : {}),
                };
              }
              return seat;
            }),
          };
        }
        return row;
      })
    );
  };

  // Update entire row status
  const updateRowStatus = (rowNumber: number, status: 'online' | 'rebooting' | 'offline') => {
    setCabinRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowNumber === rowNumber) {
          return {
            ...row,
            seats: row.seats.map((seat) => ({ ...seat, status })),
          };
        }
        return row;
      })
    );
  };

  // Update all cabin seats
  const updateAllCabinStatus = (status: 'online' | 'rebooting' | 'offline') => {
    setCabinRows((prevRows) =>
      prevRows.map((row) => ({
        ...row,
        seats: row.seats.map((seat) => ({ ...seat, status })),
      }))
    );
  };

  // Trigger command action core dispatcher
  const handleTriggerReset = async (params: {
    type: ResetType;
    rowNumber?: number;
    seatId?: string; // seat letter e.g., "A"
    target?: string; // target peripheral "som" | "handset" etc.
  }) => {
    setIsLoading(true);
    const { type, rowNumber, seatId, target } = params;
    
    // Create new log entry state placeholder
    const logId = Math.random().toString(36).substring(2, 9).toUpperCase();
    const newLog: ResetLog = {
      id: logId,
      type,
      timestamp: new Date().toISOString(),
      payload: {
        ...(rowNumber ? { rowNumber } : {}),
        ...(seatId ? { seatId } : {}),
        ...(target ? { target } : {}),
      },
      status: 'pending',
    };

    setLogs((prev) => [newLog, ...prev]);

    // Visually update seat state map to "rebooting"
    if (type === 'soft' || type === 'hard') {
      if (rowNumber && seatId) {
        updateSeatStatus(rowNumber, seatId, 'rebooting');
      }
    } else if (type === 'ssb') {
      if (rowNumber) {
        updateRowStatus(rowNumber, 'rebooting');
      }
    } else if (type === 'amcu') {
      updateAllCabinStatus('rebooting');
    }

    try {
      // Map to Express Proxy Endpoints
      let endpoint = '';
      let reqBody: any = { simulate: isSimulating };

      if (type === 'soft') {
        endpoint = '/api/proxy/v1/seat-reboot';
        reqBody = { ...reqBody, seatId, rowNumber, target };
      } else if (type === 'hard') {
        endpoint = '/api/proxy/v1/seat-hard-reset';
        reqBody = { ...reqBody, seatId, rowNumber, target };
      } else if (type === 'ssb') {
        endpoint = '/api/proxy/v1/mcu-reset';
        reqBody = { ...reqBody, rowNumber, seatId };
      } else if (type === 'amcu') {
        endpoint = '/api/proxy/v1/full-reset';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(reqBody).length > 0 ? JSON.stringify(reqBody) : undefined,
      });

      const responseData = await response.json();

      // Finalize log payload success
      setLogs((prev) =>
        prev.map((log) => {
          if (log.id === logId) {
            return {
              ...log,
              status: responseData.success ? 'success' : 'failed',
              statusCode: responseData.remoteStatus || response.status,
              responseBody: responseData.data || responseData,
              isSimulated: responseData.isSimulated || false,
              command: responseData.command,
              sshTarget: responseData.sshTarget,
              error: responseData.error,
            };
          }
          return log;
        })
      );

      // Determine feedback details for custom popup/toast
      const isSuccessful = !!responseData.success;
      const innerData = responseData.data || {};
      const displayMessage = innerData.message || responseData.message || (isSuccessful ? "Command successfully delivered." : "Command delivery failed.");
      const mcuCooldown = innerData.remainingSeconds || null;

      setActiveToast({
        id: Math.random().toString(),
        logId: logId,
        title: isSuccessful ? 'Command Executed' : 'Execution Denied (Cooldown)',
        message: displayMessage,
        type: isSuccessful ? 'success' : 'error',
        remainingSeconds: mcuCooldown || undefined,
      });

      // Start the temporary physical reboot process on the map only if execution was successful
      if (responseData.success) {
        const rebootDuration = type === 'amcu' ? 6000 : 4000;
        setTimeout(() => {
          const timeStr = new Date().toLocaleTimeString();
          if (type === 'soft' || type === 'hard') {
            if (rowNumber && seatId) {
              updateSeatStatus(rowNumber, seatId, 'online', timeStr);
              // Sync with selectedSeat view so it refreshes right away
              if (selectedSeat?.id === `${rowNumber}${seatId}`) {
                setSelectedSeat((prev) => prev ? { ...prev, status: 'online', lastResetTime: timeStr } : null);
              }
            }
          } else if (type === 'ssb') {
            if (rowNumber) {
              updateRowStatus(rowNumber, 'online');
            }
          } else if (type === 'amcu') {
            updateAllCabinStatus('online');
          }
        }, rebootDuration);
      } else {
        // Revert state change immediately so the GUI reflects execution failure (e.g., cooldown)
        if (type === 'soft' || type === 'hard') {
          if (rowNumber && seatId) {
            updateSeatStatus(rowNumber, seatId, 'online');
            if (selectedSeat?.id === `${rowNumber}${seatId}`) {
              setSelectedSeat((prev) => prev ? { ...prev, status: 'online' } : null);
            }
          }
        } else if (type === 'ssb') {
          if (rowNumber) {
            updateRowStatus(rowNumber, 'online');
          }
        } else if (type === 'amcu') {
          updateAllCabinStatus('online');
        }
      }

    } catch (err: any) {
      console.error('API execution failed:', err);
      // Fail log gracefully
      setLogs((prev) =>
        prev.map((log) => {
          if (log.id === logId) {
            return {
              ...log,
              status: 'failed',
              error: err.message || 'Network timeout connecting to bus.',
            };
          }
          return log;
        })
      );

      // Trigger the Toast Popup on network connection failure as well
      setActiveToast({
        id: Math.random().toString(),
        logId: logId,
        title: 'Connection Lost',
        message: err.message || 'The Avionics Reset Suite was unable to connect to the SSH cockpit target.',
        type: 'error',
      });

      // Reset seat statuses back to online on connectivity error
      if (type === 'soft' || type === 'hard') {
        if (rowNumber && seatId) updateSeatStatus(rowNumber, seatId, 'online');
      } else if (type === 'ssb') {
        if (rowNumber) updateRowStatus(rowNumber, 'online');
      } else if (type === 'amcu') {
        updateAllCabinStatus('online');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Select seat handler
  const handleSelectSeat = (seat: Seat) => {
    setSelectedSeat(seat);
  };

  // Row MCU reset shorthand trigger
  const handleRowMcuReset = (rowNumber: number) => {
    handleTriggerReset({
      type: 'ssb',
      rowNumber,
    });
  };

  // Stats Counters
  const totalRebooting = cabinRows.reduce(
    (acc, row) => acc + row.seats.filter((s) => s.status === 'rebooting').length,
    0
  );
  
  const successLogsCount = logs.filter((l) => l.status === 'success').length;
  const failedLogsCount = logs.filter((l) => l.status === 'failed').length;

  return (
    <div className="min-h-screen bg-[#F1F3F5] text-[#212529] flex flex-col selection:bg-blue-500/10 selection:text-blue-900">
      
      {/* 1. Header Navigation Bar of Flight Terminal - Professional Polish Theme */}
      <header className="bg-[#1B2B4E] text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-xs text-white shadow-sm ring-2 ring-blue-400/20">
              TCI
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-blue-300 font-bold">
                  CREWCONTROL v2.0.4
                </span>
                <span className="text-slate-400 text-[10px]">•</span>
                <span className="text-[10px] uppercase tracking-wide text-slate-300 font-semibold">
                  Flight TK-1923 | B777-300ER
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-1.5 uppercase">
                Cabin Crew Controller <span className="text-xs font-normal text-blue-200 capitalize">(Avionics Reset Suite)</span>
              </h1>
            </div>
          </div>

          {/* Airplane Telemetry & Clock Dashboard Elements */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:self-center">
            
            {/* UTC CLOCK */}
            <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/20 flex items-center gap-2 text-slate-100">
              <Clock className="w-3.5 h-3.5 text-blue-300" />
              <div>
                <div className="text-[9px] text-blue-200/70 uppercase font-semibold">UTC Time</div>
                <div className="font-mono text-white text-[11px] font-medium leading-none">
                  {utcTime ? utcTime.split(',')[1]?.trim() || utcTime : 'Updating...'}
                </div>
              </div>
            </div>

            {/* CRUISE HEIGHT */}
            <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/20 flex items-center gap-2 text-slate-100">
              <Compass className="w-3.5 h-3.5 text-blue-300" />
              <div>
                <div className="text-[9px] text-blue-200/70 uppercase font-semibold">Alt / Level</div>
                <div className="font-mono text-white text-[11px] font-medium leading-none">{altitude.toLocaleString()} FT</div>
              </div>
            </div>

            {/* CABIN TEMPERATURE */}
            <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/20 flex items-center gap-2 text-slate-100">
              <Thermometer className="w-3.5 h-3.5 text-blue-300" />
              <div>
                <div className="text-[9px] text-blue-200/70 uppercase font-semibold">Cabin Temp</div>
                <div className="font-mono text-white text-[11px] font-medium leading-none">{cabinTemp}°C</div>
              </div>
            </div>

            {/* AVIONICS BUS CONNECTED */}
            <div className={`p-2 rounded-lg border flex items-center gap-2 ${
              isSimulating 
                ? 'bg-amber-950/40 border-amber-805/20 text-slate-100' 
                : 'bg-emerald-950/40 border-emerald-805/20 text-slate-100'
            }`}>
              {isSimulating ? (
                <Wifi className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-300" />
              )}
              <div>
                <div className="text-[9px] text-slate-300 uppercase font-semibold">System Link</div>
                <div className={`font-mono text-[11px] font-bold leading-none ${isSimulating ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {isSimulating ? 'SIMULATED' : 'NOMINAL'}
                </div>
              </div>
            </div>

          </div>

        </div>
      </header>

      {/* SSH Connection Stats & Target Server Info Band */}
      <div className="bg-slate-900 border-b border-slate-800 text-xs px-4 sm:px-6 lg:px-8 py-2 md:flex md:items-center justify-between gap-4 font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-slate-400 font-bold">SSH GATEWAY:</span>
          <span className="text-white font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
            {sshConfig?.username || 'tcitest'}@{sshConfig?.host || '10.18.225.250'}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Target Cabin Web API:</span>
          <span className="text-sky-400">crewcontrol.tci.aero</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 md:mt-0 text-[11px] text-slate-400">
          <span>Transport Mode:</span>
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-2.5 py-0.5 rounded font-bold cursor-pointer transition-colors border select-none ${
              isSimulating
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/25'
            }`}
          >
            {isSimulating ? 'SIMULATION PLAYGROUND' : 'DIRECT SSH PROXY'}
          </button>
        </div>
      </div>

      {/* 2. Primary Layout Grid Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Sleek View Multi-Tab Selector Container */}
        <div className="flex bg-slate-205 p-1 rounded-xl max-w-md border border-slate-300/40">
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer ${
              activeView === 'dashboard'
                ? 'bg-white text-[#1B2B4E] shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-300/10'
            }`}
          >
            💺 Cabin Live View
          </button>
          <button
            onClick={() => setActiveView('automation')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer ${
              activeView === 'automation'
                ? 'bg-blue-600 text-white shadow shadow-blue-500/10 font-extrabold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-300/10'
            }`}
          >
            ⚡ Automation Sequencer
          </button>
        </div>

        {/* Core Quick Stats & Info Card Row - Professional Polish Styles */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats-ribbon">
          
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className="bg-slate-100 text-slate-800 px-3 py-2 rounded-lg font-bold font-mono text-base border border-slate-200">
              30
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Rows</span>
              <p className="text-xs text-slate-700 font-semibold">Managed Hardware grids</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className="bg-slate-100 text-slate-800 px-3 py-2 rounded-lg font-bold font-mono text-base border border-slate-200">
              180
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">In-Seat IFEs</span>
              <p className="text-xs text-slate-700 font-semibold">Active monitor stations</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className={`px-3 py-2 rounded-lg font-bold font-mono text-base border transition-colors ${
              totalRebooting > 0 
                ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' 
                : 'bg-slate-100 text-slate-450 border-slate-200'
            }`}>
              {totalRebooting}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Pending Reboots</span>
              <p className="text-xs text-slate-700 font-semibold font-mono">In-progress power lines</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg font-bold font-mono text-base border border-blue-100">
              {logs.length}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Session Logs</span>
              <p className="text-xs text-slate-700 font-semibold">
                <span className="text-emerald-600 font-mono font-bold">{successLogsCount} OK</span>
                {' / '}
                <span className="text-rose-600 font-mono font-bold">{failedLogsCount} Err</span>
              </p>
            </div>
          </div>

        </section>

        {/* Informational Guidance Alert with Light Backdrop */}
        <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-4 text-xs text-slate-600 leading-normal flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">System Integration & Simulation Platform</p>
            <p>
              This console proxies reset queries directly to the onboard hardware server at <strong className="font-mono text-slate-800">https://crewcontrol.tci.aero/api/v1</strong>. When <strong className="text-blue-700 font-semibold">Simulation Mode</strong> is armed, the system responds with local avionics states to prevent mock request timeouts. Lift the safety covers to initiate real commands on connected assets.
            </p>
          </div>
        </div>

        {/* Dashboard grid layout (Cabin on the left, Control form on the right / or Automation Panel) */}
        {activeView === 'dashboard' ? (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
            <div className="lg:col-span-7 xl:col-span-8">
              <CabinMap
                rows={cabinRows}
                selectedSeat={selectedSeat}
                onSelectSeat={handleSelectSeat}
                onRowMcuReset={handleRowMcuReset}
                isLoading={isLoading}
              />
            </div>

            <div className="lg:col-span-5 xl:col-span-4 h-full">
              <ControlPanel
                selectedSeat={selectedSeat}
                onTriggerReset={handleTriggerReset}
                isLoading={isLoading}
                isSimulating={isSimulating}
                setIsSimulating={setIsSimulating}
              />
            </div>
          </section>
        ) : (
          <AutomationPanel
            cabinRows={cabinRows}
            onTriggerReset={handleTriggerReset}
            isLoading={isLoading}
            onBackToDashboard={() => setActiveView('dashboard')}
          />
        )}

        {/* Logs console representation */}
        <section>
          <ActivityLog
            logs={logs}
            onClearLogs={() => setLogs([])}
            expandedLogId={expandedLogId}
            onExpandedLogIdChange={setExpandedLogId}
          />
        </section>

      </main>

      {/* 3. Humble Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
          <p className="font-mono text-slate-400">
            [TCI_CABIN_CONTROLLER_FW // V2.0.4-STABLE]
          </p>
          <p>
            © 2026 TCI Cabin Interior & Avionics. Authorized Flight Crew Personnel Only | System ID: MC4401-X
          </p>
        </div>
      </footer>

      {/* Dynamic Avionics Status Alert Toast Overlay */}
      {activeToast && (
        <div 
          onClick={() => {
            if (activeToast.logId) {
              handleToastClick(activeToast.logId);
            }
            setActiveToast(null);
          }}
          className={`fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-xl shadow-2xl border border-slate-200/80 overflow-hidden animate-slide-up-custom pointer-events-auto transition-all duration-200 group/toast ${
            activeToast.logId 
              ? 'cursor-pointer hover:bg-slate-50 hover:border-blue-400 hover:shadow-blue-105/20 active:scale-[0.985]' 
              : 'cursor-pointer hover:bg-slate-50 active:scale-[0.985]'
          }`}
          title={activeToast.logId ? "Click to view logs" : "Click to dismiss"}
        >
          {/* Top visual accent color line */}
          <div className={`h-1.5 w-full ${
            activeToast.type === 'success' 
              ? 'bg-emerald-500' 
              : 'bg-rose-500 animate-pulse'
          }`} />
          
          <div className="p-4 flex gap-3.5">
            {/* Round Icon container */}
            <div className="shrink-0 mt-0.5">
              {activeToast.type === 'success' ? (
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 group-hover/toast:bg-emerald-100 transition-colors">
                  <CheckCircle className="w-4.5 h-4.5 text-emerald-600" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100 group-hover/toast:bg-rose-100 transition-colors">
                  <ShieldAlert className="w-4.5 h-4.5 text-rose-600" />
                </div>
              )}
            </div>

            {/* Content text */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">
                  {activeToast.title}
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveToast(null);
                  }} 
                  className="text-slate-400 hover:text-slate-600 font-mono text-xs font-bold transition-colors cursor-pointer px-1 relative z-10"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed font-sans">
                {activeToast.message}
              </p>

              {/* Action Hint Trigger for Quick Log Deep-Link */}
              {activeToast.logId && (
                <span className="mt-2.5 pt-2 border-t border-slate-100/80 block text-[10px] text-blue-600 font-bold group-hover/toast:text-blue-700 font-sans transition-colors">
                  ➜ Click to focus request payload & HTTP details
                </span>
              )}

              {/* Countdown counter for real hardware cooldown restrictions */}
              {activeToast.remainingSeconds && activeToast.remainingSeconds > 0 ? (
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400 flex items-center gap-1 font-sans font-bold">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                    LOCK OUT TIMER
                  </span>
                  <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded leading-none">
                    {Math.floor(activeToast.remainingSeconds / 60)}m {activeToast.remainingSeconds % 60}s
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
