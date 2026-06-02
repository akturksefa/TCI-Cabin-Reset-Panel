export type ResetType = 'ssb' | 'soft' | 'hard' | 'amcu';

export type SoftResetTarget = 'som' | 'handset' | 'full';

export type HardResetTarget = 'som' | 'handset' | '4kdu' | 'ccu' | 'full';

export interface ResetLog {
  id: string;
  type: ResetType;
  timestamp: string;
  payload: any;
  status: 'success' | 'failed' | 'pending';
  statusCode?: number;
  responseBody?: any;
  error?: string;
  isSimulated?: boolean;
  command?: string;
  sshTarget?: string;
}

export interface Seat {
  id: string; // e.g. "1A", "1B"
  rowNumber: number;
  seatLetter: string;
  status: 'online' | 'rebooting' | 'offline';
  lastResetTime?: string;
}

export interface CabinRow {
  rowNumber: number;
  seats: Seat[];
}
