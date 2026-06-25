import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Code,
  Globe2,
  Copy,
  Check,
  Download,
  FileText,
  RefreshCw
} from 'lucide-react';
import { ResetLog } from '../types';

interface ActivityLogProps {
  logs: ResetLog[];
  onClearLogs: () => void;
  expandedLogId?: string | null;
  onExpandedLogIdChange?: (id: string | null) => void;
}

export default function ActivityLog({ 
  logs, 
  onClearLogs,
  expandedLogId: controlledExpandedLogId,
  onExpandedLogIdChange
}: ActivityLogProps) {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [search, setSearch] = useState<string>('');
  const [localExpandedLogId, setLocalExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Server-side daily logs states
  const [logTab, setLogTab] = useState<'active' | 'server'>('active');
  const [serverLogs, setServerLogs] = useState<{ filename: string; size: number; mtime: string }[]>([]);
  const [isFetchingServerLogs, setIsFetchingServerLogs] = useState<boolean>(false);

  const fetchServerLogs = async () => {
    setIsFetchingServerLogs(true);
    try {
      const res = await fetch('/api/server-logs');
      if (res.ok) {
        const data = await res.json();
        setServerLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching server logs:', err);
    } finally {
      setIsFetchingServerLogs(false);
    }
  };

  useEffect(() => {
    if (logTab === 'server') {
      fetchServerLogs();
    }
  }, [logTab]);

  const downloadServerLogFile = (filename: string) => {
    const link = document.createElement('a');
    link.href = `/api/server-logs/download/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const expandedLogId = controlledExpandedLogId !== undefined ? controlledExpandedLogId : localExpandedLogId;
  const setExpandedLogId = (id: string | null) => {
    if (onExpandedLogIdChange) {
      onExpandedLogIdChange(id);
    } else {
      setLocalExpandedLogId(id);
    }
  };

  const handleDownloadLogs = () => {
    if (logs.length === 0) return;
    
    // Create formatted data representation
    const textData = JSON.stringify(logs, null, 2);
    const blob = new Blob([textData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create temporary link element to trigger the download
    const link = document.createElement('a');
    link.href = url;
    
    // Create fine precise filename with timestamp
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString().replace(/:/g, '-');
    link.download = `tci_cabin_bus_logs_${dateStr}_${timeStr}.json`;
    
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Automatically clear filter or search if the externally focused log wouldn't be visible
  useEffect(() => {
    if (expandedLogId) {
      const targetLog = logs.find(l => l.id === expandedLogId);
      if (targetLog) {
        // If the targeting log is hidden by status filter, switch to 'all'
        if (filter !== 'all') {
          const matchesFilter =
            (filter === 'success' && targetLog.status === 'success') ||
            (filter === 'failed' && targetLog.status === 'failed');
          if (!matchesFilter) {
            setFilter('all');
          }
        }
        
        // If hidden by search filter, reset search
        if (search) {
          const searchStr = search.toLowerCase();
          const matchesSearch =
            targetLog.type.toLowerCase().includes(searchStr) ||
            JSON.stringify(targetLog.payload).toLowerCase().includes(searchStr) ||
            (targetLog.responseBody && JSON.stringify(targetLog.responseBody).toLowerCase().includes(searchStr)) ||
            (targetLog.error && targetLog.error.toLowerCase().includes(searchStr));
          if (!matchesSearch) {
            setSearch('');
          }
        }
      }
    }
  }, [expandedLogId, logs]);

  // Filter logs based on search and selected filter
  const filteredLogs = logs.filter((log) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'success' && log.status === 'success') ||
      (filter === 'failed' && log.status === 'failed');

    const searchStr = search.toLowerCase();
    const matchesSearch =
      log.type.toLowerCase().includes(searchStr) ||
      JSON.stringify(log.payload).toLowerCase().includes(searchStr) ||
      (log.responseBody && JSON.stringify(log.responseBody).toLowerCase().includes(searchStr)) ||
      (log.error && log.error.toLowerCase().includes(searchStr));

    return matchesFilter && matchesSearch;
  });

  const toggleExpand = (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };

  const copyCurl = (log: ResetLog, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (log.command) {
      navigator.clipboard.writeText(log.command);
    } else {
      // Formulate a beautiful curl representation
      let endpoint = '';
      let payloadStr = '';
      if (log.type === 'ssb') {
        endpoint = 'mcu-reset';
        payloadStr = `-d '${JSON.stringify(log.payload)}'`;
      } else if (log.type === 'soft') {
        endpoint = 'seat-reboot';
        payloadStr = `-d '${JSON.stringify(log.payload)}'`;
      } else if (log.type === 'hard') {
        endpoint = 'seat-hard-reset';
        payloadStr = `-d '${JSON.stringify(log.payload)}'`;
      } else if (log.type === 'amcu') {
        endpoint = 'full-reset';
      }

      const curlCmd = `curl -X POST "https://crewcontrol.tci.aero/api/v1/${endpoint}" \\\n  -H "Content-Type: application/json" ${payloadStr ? `\\\n  ${payloadStr}` : ''}`;
      
      navigator.clipboard.writeText(curlCmd);
    }
    
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-sm flex flex-col h-full text-slate-800" id="activity-log-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-slate-105 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-blue-600" />
            Aircraft Bus Log System
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Monitor real-time network request traffic or download archived persistent server logs.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
          {/* Tab Selector */}
          <div className="flex bg-slate-100 p-1 border border-slate-200 rounded-xl">
            <button
              onClick={() => setLogTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                logTab === 'active'
                  ? 'bg-white text-blue-750 shadow-sm border border-slate-150'
                  : 'text-slate-550 hover:text-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Active Buffer
            </button>
            <button
              onClick={() => setLogTab('server')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                logTab === 'server'
                  ? 'bg-white text-blue-750 shadow-sm border border-slate-150'
                  : 'text-slate-550 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Daily Server Logs
            </button>
          </div>

          {/* Memory Buffer Actions */}
          {logTab === 'active' && logs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleDownloadLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/50 hover:bg-blue-50 text-blue-650 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg text-xs font-bold select-none transition-colors cursor-pointer"
                id="download-logs-btn"
                title="Download full operational JSON logs"
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                Download JSON
              </button>
              <button
                onClick={onClearLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg text-xs font-bold select-none transition-colors cursor-pointer"
                id="clear-logs-btn"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                Flush Buffer
              </button>
            </div>
          )}
        </div>
      </div>

      {logTab === 'active' ? (
        <>
          {/* Query Filter and Search Controls */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search logs by seat, row, or body..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 pl-9 pr-4 py-2 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-550/20 placeholder:text-slate-400 font-medium"
                id="log-search-input"
              />
            </div>

            <div className="flex bg-slate-100 p-1 border border-slate-200 rounded-xl">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  filter === 'all' ? 'bg-white text-blue-700 shadow-sm border border-slate-150' : 'text-slate-500 hover:text-slate-705'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('success')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  filter === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150 shadow-sm' : 'text-slate-505 hover:text-slate-705'
                }`}
              >
                Success
              </button>
              <button
                onClick={() => setFilter('failed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  filter === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-150 shadow-sm' : 'text-slate-505 hover:text-slate-705'
                }`}
              >
                Failed
              </button>
            </div>
          </div>

          {/* Main Logs Output Terminal */}
          <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-y-auto max-h-[420px] divide-y divide-slate-200/80 shadow-inner" id="terminal-screen">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                <Terminal className="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                <p className="text-slate-400 text-xs font-bold font-mono">
                  [SYSTEM_STATE]: Idle. Ready for command input...
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredLogs.map((log) => {
                  const isOpen = expandedLogId === log.id;
                  const hasSuccess = log.status === 'success';

                  return (
                    <div key={log.id} id={`log-${log.id}`} className="flex flex-col bg-white transition-all duration-305">
                      {/* Summary Bar Component */}
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="flex justify-between items-center p-3.5 hover:bg-slate-50 cursor-pointer select-none transition-colors border-b last:border-0 border-slate-100/60"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}

                          {/* Status Icon */}
                          {log.status === 'pending' ? (
                            <Clock className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                          ) : hasSuccess ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}

                          {/* Log Tag / Route Label */}
                          <span className="font-mono text-[10px] font-bold uppercase shrink-0 px-2 py-0.5 rounded border leading-none bg-slate-100 text-slate-600 border-slate-200">
                            {log.type}
                          </span>

                          {/* Brief description */}
                          <span className="font-mono text-xs text-slate-600 font-bold truncate">
                            {log.type === 'ssb' && `Row ${log.payload.rowNumber} Reset`}
                            {log.type === 'soft' && `Seat ${log.payload.rowNumber}${log.payload.seatId} SOFT Reboot (${log.payload.target})`}
                            {log.type === 'hard' && `Seat ${log.payload.rowNumber}${log.payload.seatId} HARD Reset (${log.payload.target})`}
                            {log.type === 'amcu' && 'AMCU Full Aircraft Reset'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400 leading-none shrink-0 ml-3">
                          {log.isSimulated && (
                            <span className="bg-amber-50 text-amber-700 border border-amber-205 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase">
                              Sim
                            </span>
                          )}
                          <span className="font-bold">
                            {new Date(log.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Technical Details Terminal Block */}
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="bg-slate-950/60 overflow-hidden border-t border-slate-900"
                          >
                            <div className="p-4 space-y-4 text-xs font-mono text-slate-300 select-text leading-relaxed">
                              {/* Title / CURL block */}
                              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                                  <Code className="w-3.5 h-3.5 text-indigo-400" />
                                  Executable Curl Command
                                </span>
                                <button
                                  onClick={(e) => copyCurl(log, e)}
                                  className="p-1.5 hover:bg-slate-800 border border-slate-900 hover:border-slate-800 transition-all rounded text-slate-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1"
                                  title="Copy cURL Command"
                                >
                                  {copiedId === log.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-[9px] font-bold text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span className="text-[9px] font-medium text-slate-500 group-hover:text-slate-300">Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-900 text-[10px] overflow-x-auto text-indigo-300 font-mono select-all leading-normal">
                                {log.command || `curl -X POST "https://crewcontrol.tci.aero/api/v1/${
                                  log.type === 'ssb'
                                    ? 'mcu-reset'
                                    : log.type === 'soft'
                                    ? 'seat-reboot'
                                    : log.type === 'hard'
                                    ? 'seat-hard-reset'
                                    : 'full-reset'
                                }" \\\n  -H "Content-Type: application/json" ${
                                  log.type !== 'amcu'
                                    ? `\\\n  -d '${JSON.stringify(log.payload)}'`
                                    : ''
                                }`}
                              </pre>

                              {/* HTTP Response Details */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                {/* Request Details */}
                                <div className="space-y-1.5">
                                  <span className="text-[10px] text-slate-500 uppercase font-semibold">
                                    Request Details
                                  </span>
                                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[10px] text-slate-400 space-y-2.5">
                                    <div className="flex justify-between items-center border-b border-slate-900 pb-1.5">
                                      <div>
                                        <span className="text-slate-600">Method:</span> <span className="font-bold text-sky-400">POST</span>
                                      </div>
                                      <div className="truncate max-w-[180px]">
                                        <span className="text-slate-600">Host:</span> <span className="text-slate-350">crewcontrol.tci.aero</span>
                                      </div>
                                    </div>
                                    <div className="truncate">
                                      <span className="text-slate-600 text-[9px] block mb-0.5">Secure SSH Gateway:</span>
                                      <span className="text-emerald-405 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[9px]">{log.sshTarget || 'tcitest@10.18.225.250'}</span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-slate-600 text-[9px] block">Payload JSON:</span>
                                      <pre className="bg-slate-900 border border-slate-900/80 p-2 rounded text-blue-300 overflow-x-auto whitespace-pre font-mono text-[9px] max-h-[120px]">
                                        {JSON.stringify(log.payload, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                </div>

                                {/* Response Details */}
                                <div className="space-y-1.5">
                                  <span className="text-[10px] text-slate-500 uppercase font-semibold">
                                    Response Details
                                  </span>
                                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[10px] text-slate-400 space-y-2.5">
                                    <div>
                                      <span className="text-slate-600">Status Code:</span>{' '}
                                      <span className={hasSuccess ? 'text-emerald-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800' : 'text-rose-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800'}>
                                        {log.statusCode || (hasSuccess ? '200 OK' : '500 Server Error')}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-slate-600 text-[9px] block">Response Object JSON:</span>
                                      <pre className="bg-slate-900 border border-slate-900/80 p-2 rounded text-amber-300 overflow-x-auto whitespace-pre font-mono text-[9px] max-h-[160px] leading-relaxed">
                                        {log.responseBody 
                                          ? JSON.stringify(log.responseBody, null, 2) 
                                          : log.error 
                                          ? JSON.stringify({ error: log.error }, null, 2) 
                                          : JSON.stringify({ success: true, message: "Action executed successfully" }, null, 2)}
                                      </pre>
                                    </div>
                                    {log.isSimulated && (
                                      <div className="text-[9px] text-amber-500/80 italic font-mono flex items-center gap-1.5 pt-1 border-t border-slate-900/50">
                                        <Globe2 className="w-3.5 h-3.5 inline text-amber-500/80" />
                                        Defaulted to sandbox simulation because real server is offline.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-slate-500 font-medium">
              Daily persistent log files stored inside the <code className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-600 font-bold">/logs</code> folder:
            </div>
            <button
              onClick={fetchServerLogs}
              disabled={isFetchingServerLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-850 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              title="Refresh Server Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isFetchingServerLogs ? 'animate-spin' : ''}`} />
              Refresh Files
            </button>
          </div>

          <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-y-auto max-h-[420px] divide-y divide-slate-200/80 shadow-inner p-4">
            {isFetchingServerLogs ? (
              <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                <RefreshCw className="w-8 h-8 text-blue-500 mb-2 animate-spin" />
                <p className="text-slate-500 text-xs font-bold font-mono">
                  Scanning logs directory on server...
                </p>
              </div>
            ) : serverLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                <FileText className="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                <p className="text-slate-400 text-xs font-bold font-mono">
                  No daily log files found yet.
                </p>
                <p className="text-slate-500 text-[10px] mt-1 font-mono max-w-sm">
                  Log files are automatically generated here as soon as any device reset command is triggered.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {serverLogs.map((logFile) => {
                  const formattedSize = logFile.size > 1024 * 1024
                    ? `${(logFile.size / (1024 * 1024)).toFixed(2)} MB`
                    : logFile.size > 1024
                    ? `${(logFile.size / 1024).toFixed(1)} KB`
                    : `${logFile.size} Bytes`;
                    
                  return (
                    <div
                      key={logFile.filename}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 hover:border-slate-300 p-4 rounded-xl transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-50 text-blue-650 p-2.5 rounded-lg border border-blue-100">
                          <FileText className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 font-mono">
                            {logFile.filename}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-mono">
                            <span>Size: <strong className="text-slate-700">{formattedSize}</strong></span>
                            <span>•</span>
                            <span>Modified: {new Date(logFile.mtime).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => downloadServerLogFile(logFile.filename)}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-blue-500/10 cursor-pointer select-none"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download (.log)
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
