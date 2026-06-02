import React, { useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Monitor, Compass, ShieldAlert } from 'lucide-react';
import { CabinRow, Seat, SoftResetTarget, HardResetTarget } from '../types';

interface CabinMapProps {
  rows: CabinRow[];
  selectedSeat: Seat | null;
  onSelectSeat: (seat: Seat) => void;
  onRowMcuReset: (rowNumber: number) => void;
  isLoading: boolean;
}

export default function CabinMap({
  rows,
  selectedSeat,
  onSelectSeat,
  onRowMcuReset,
  isLoading,
}: CabinMapProps) {
  const [rowOffset, setRowOffset] = useState<number>(0);
  const rowsPerPage = 6;
  
  // Columns label A, B, C | Corridor | D, E, F
  const leftColumnLetters = ['A', 'B', 'C'];
  const rightColumnLetters = ['D', 'E', 'F'];

  const displayedRows = rows.slice(rowOffset, rowOffset + rowsPerPage);
  const totalPages = Math.ceil(rows.length / rowsPerPage);
  const currentPage = Math.ceil(rowOffset / rowsPerPage) + 1;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col h-full shadow-sm relative overflow-hidden" id="cabin-map-card">
      {/* Visual Airplane Background Decor */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 opacity-90" />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 z-10">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-600" />
            Interactive Cabin Layout
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Select a seat for detailed modules or execute an SSB Row-level MCU Reset.
          </p>
        </div>
        
        {/* Row Range Navigator */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 border border-slate-200 rounded-lg self-start">
          <button
            onClick={() => setRowOffset(Math.max(0, rowOffset - rowsPerPage))}
            disabled={rowOffset === 0}
            className="px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150 disabled:opacity-40 disabled:hover:bg-transparent hover:bg-slate-200 text-slate-700 cursor-pointer disabled:cursor-not-allowed"
            id="prev-rows-btn"
          >
            ← Prev
          </button>
          <span className="text-xs font-mono px-2 text-slate-650 font-bold">
            Rows {rowOffset + 1} – {Math.min(rows.length, rowOffset + rowsPerPage)}
          </span>
          <button
            onClick={() => setRowOffset(Math.min(rows.length - rowsPerPage, rowOffset + rowsPerPage))}
            disabled={rowOffset + rowsPerPage >= rows.length}
            className="px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150 disabled:opacity-40 disabled:hover:bg-transparent hover:bg-slate-200 text-slate-700 cursor-pointer disabled:cursor-not-allowed"
            id="next-rows-btn"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Airplane Hull Graphic Shell representation */}
      <div className="flex-1 bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-center items-center relative">
        <div className="absolute inset-y-0 left-4 w-1 bg-slate-300/30 rounded-full border-r border-slate-300/10 hidden md:block" />
        <div className="absolute inset-y-0 right-4 w-1 bg-slate-300/30 rounded-full border-l border-slate-300/10 hidden md:block" />

        {/* Column Indicators Header */}
        <div className="grid grid-cols-[3.5rem_1fr] md:grid-cols-[4.5rem_1fr] w-full max-w-xl mb-4 px-2" id="seat-column-headers">
          <div className="text-center font-mono text-xs font-bold text-slate-400 uppercase">
            Row
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Left Wing Seats */}
            <div className="col-span-3 grid grid-cols-3 gap-1">
              {leftColumnLetters.map((letter) => (
                <div key={letter} className="text-center font-mono text-xs font-bold text-slate-600">
                  {letter}
                </div>
              ))}
            </div>
            
            {/* Aisle */}
            <div className="col-span-1 text-center font-mono text-[9px] text-slate-400 font-bold flex items-center justify-center uppercase tracking-widest leading-none">
              Aisle
            </div>

            {/* Right Wing Seats */}
            <div className="col-span-3 grid grid-cols-3 gap-1">
              {rightColumnLetters.map((letter) => (
                <div key={letter} className="text-center font-mono text-xs font-bold text-slate-600">
                  {letter}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows List */}
        <div className="w-full max-w-xl space-y-3 z-10" id="airplane-rows-container">
          {displayedRows.map((row) => (
            <div
              key={row.rowNumber}
              className="grid grid-cols-[3.5rem_1fr] md:grid-cols-[4.5rem_1fr] items-center"
              id={`cabin-row-${row.rowNumber}`}
            >
              {/* Row Header Button - Triggers SSB / MCU reset for the row */}
              <div className="pr-2 md:pr-4 flex justify-end">
                <button
                  onClick={() => onRowMcuReset(row.rowNumber)}
                  disabled={isLoading}
                  title={`Trigger Row ${row.rowNumber} MCU Reset (SSB)`}
                  className="group relative flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:border-blue-600 hover:bg-blue-50 hover:shadow-sm text-slate-700 hover:text-blue-700 font-mono text-xs font-bold py-1.5 px-2 md:px-2.5 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
                  id={`mcu-reset-row-${row.rowNumber}`}
                >
                  <span className="text-slate-450 group-hover:text-blue-600 text-[10px] mr-1">R</span>
                  {row.rowNumber}
                  <RefreshCw className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 group-hover:animate-spin transition-opacity duration-300" />
                </button>
              </div>

              {/* Seats Grid */}
              <div className="grid grid-cols-7 gap-1.5 bg-white p-2.5 rounded-xl border border-slate-205 shadow-sm">
                {/* Left side seats (A, B, C) */}
                <div className="col-span-3 grid grid-cols-3 gap-1.5">
                  {leftColumnLetters.map((letter) => {
                    const seat = row.seats.find((s) => s.seatLetter === letter);
                    return seat ? renderSeatButton(seat) : renderEmptySpace(letter);
                  })}
                </div>

                {/* Corridor / Aisle space */}
                <div className="col-span-1 flex items-center justify-center">
                  <div className="h-6 w-px bg-slate-200" />
                </div>

                {/* Right side seats (D, E, F) */}
                <div className="col-span-3 grid grid-cols-3 gap-1.5">
                  {rightColumnLetters.map((letter) => {
                    const seat = row.seats.find((s) => s.seatLetter === letter);
                    return seat ? renderSeatButton(seat) : renderEmptySpace(letter);
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend Block */}
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-emerald-50 border border-emerald-300/80 shadow-sm" />
          <span className="text-slate-600 font-medium">MCU Connected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-blue-50 border border-blue-300 animate-pulse shadow-sm" />
          <span className="text-slate-600 font-medium font-mono">Reboot Lines</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-200" />
          <span className="text-slate-600 font-medium">Offline/Standby</span>
        </div>
      </div>
    </div>
  );

  function renderSeatButton(seat: Seat) {
    const isSelected = selectedSeat?.id === seat.id;
    
    // Status style mappings
    let statusStyle = 'bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-350';
    if (seat.status === 'online') {
      statusStyle = isSelected
        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
        : 'bg-emerald-50/65 border-emerald-250 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100/60';
    } else if (seat.status === 'rebooting') {
      statusStyle = 'bg-blue-50 border-blue-400 text-blue-700 animate-pulse';
    }

    return (
      <button
        key={seat.id}
        onClick={() => onSelectSeat(seat)}
        disabled={isLoading || seat.status === 'rebooting'}
        className={`relative flex flex-col items-center justify-center aspect-square md:h-11 rounded-lg border font-mono text-xs transition-all duration-200 cursor-pointer select-none disabled:cursor-not-allowed ${statusStyle}`}
        id={`seat-cell-${seat.id}`}
        title={`Seat ${seat.id} (Status: ${seat.status})`}
      >
        <span className="font-bold text-[11px]">{seat.id}</span>
        {seat.status === 'rebooting' && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
          </span>
        )}
      </button>
    );
  }

  function renderEmptySpace(letter: string) {
    return (
      <div
        key={`empty-${letter}`}
        className="aspect-square md:h-11 rounded-lg border border-dashed border-slate-200"
      />
    );
  }
}
