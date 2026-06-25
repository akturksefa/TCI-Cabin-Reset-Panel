import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Client } from 'ssh2';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function saveLogToServer(
  endpoint: string,
  payload: any,
  success: boolean,
  resultMessage: string,
  isSimulated: boolean,
  durationMs: number
) {
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;
    const timestamp = `${dateStr} ${timeStr}`;

    const logFileName = `logs_${dateStr}.log`;
    const logFilePath = path.join(logsDir, logFileName);

    const statusText = success ? 'SUCCESS' : 'FAILED';
    const modeText = isSimulated ? 'SIMULATED' : 'LIVE';
    
    const rowInfo = payload?.rowNumber ? `Row: ${payload.rowNumber}` : 'Row: N/A';
    const seatInfo = payload?.seatId ? `Seat: ${payload.seatId}` : 'Seat: N/A';
    const targetInfo = payload?.target ? `Target: ${payload.target}` : 'Target: N/A';
    
    const logLine = `[${timestamp}] [${modeText}] [${statusText}] Endpoint: ${endpoint} | ${rowInfo} | ${seatInfo} | ${targetInfo} | Duration: ${durationMs}ms | Msg: ${resultMessage}\n`;

    fs.appendFileSync(logFilePath, logLine, 'utf8');
    console.log(`[Server Log] Saved to server logs file: ${logFilePath}`);
  } catch (error) {
    console.error('Failed to write server-side log:', error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json());

  // Log in server console
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // TCI API Base URL
  const TCI_BASE_URL = 'https://crewcontrol.tci.aero/api/v1';

  // Active SSH configuration state (dynamic and modifiable by the client)
  const activeSSHConfig = {
    host: process.env.SSH_HOST || '10.18.225.250',
    username: process.env.SSH_USER || 'tcitest',
    password: process.env.SSH_PASS || 'tcitest1.',
  };

  // SSH execution client helper to execute curl commands on the user's specific gateway host
  function executeSSHCommand(
    command: string,
    host = activeSSHConfig.host,
    username = activeSSHConfig.username,
    password = activeSSHConfig.password
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          let stdout = '';
          let stderr = '';
          stream.on('close', (code, signal) => {
            conn.end();
            resolve({ stdout, stderr });
          }).on('data', (data) => {
            stdout += data.toString();
          }).stderr.on('data', (data) => {
            stderr += data.toString();
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host,
        port: 22,
        username,
        password,
        readyTimeout: 3000, // Short timeout for modern UX
      });
    });
  }

  // Common response handler to proxy or simulate
  async function handleResetProxy(
    endpoint: string,
    reqBody: any,
    res: express.Response,
    method = 'POST',
    customHeaders: Record<string, string> = {}
  ) {
    const startTime = Date.now();
    const forceSimulate = reqBody.simulate === true || reqBody.simulate === 'true';
    const cleanBody = { ...reqBody };
    delete cleanBody.simulate; // remove simulator flag from actual payload

    const url = `${TCI_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    // Construct the curl command that will be run on the target machine (10.18.225.250)
    const escapedBody = JSON.stringify(cleanBody).replace(/'/g, "'\\''");
    const curlHeaderArgs = Object.keys(headers).map(h => `-H "${h}: ${headers[h]}"`).join(' ');
    const curlDataArg = method !== 'GET' && method !== 'HEAD' && Object.keys(cleanBody).length > 0
      ? `-d '${escapedBody}'`
      : '';
    const curlCommand = `curl -s -S --connect-timeout 5 -X ${method} "${url}" ${curlHeaderArgs} ${curlDataArg}`;

    if (forceSimulate) {
      // Simulate response immediately
      console.log(`[Simulator] Simulating response for ${endpoint}`);
      await new Promise((resolve) => setTimeout(resolve, 800)); // nice realistic delay
      const duration = Date.now() - startTime;
      const simMsg = `[Simulated] Action for ${endpoint} completed successfully.`;
      
      saveLogToServer(endpoint, cleanBody, true, simMsg, true, duration);

      return res.json({
        success: true,
        message: simMsg,
        payload: cleanBody,
        isSimulated: true,
        command: curlCommand,
        timestamp: new Date().toISOString(),
      });
    }

    const host = activeSSHConfig.host;
    const username = activeSSHConfig.username;
    const password = activeSSHConfig.password;

    try {
      console.log(`[SSH Proxy] Logging into ${host} as ${username} to run command: ${curlCommand}`);
      const sshResult = await executeSSHCommand(curlCommand, host, username, password);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`[SSH Proxy] Execution completed on ${host} in ${duration}ms`);
      
      let responseData: any = {};
      const stdoutTrimmed = (sshResult.stdout || '').trim();
      
      if (stdoutTrimmed.startsWith('{') || stdoutTrimmed.startsWith('[')) {
        try {
          responseData = JSON.parse(stdoutTrimmed);
        } catch {
          responseData = { stdout: sshResult.stdout, stderr: sshResult.stderr };
        }
      } else {
        responseData = { stdout: sshResult.stdout, stderr: sshResult.stderr };
      }

      // Differentiate success using the actual inner payload's success field
      // since target API might return 200 HTTP status even for errors like Cooldown periods.
      let isExecutionSuccessful = !sshResult.stderr || sshResult.stderr.toLowerCase().indexOf('error') === -1;
      if (responseData && typeof responseData === 'object' && typeof responseData.success === 'boolean') {
        isExecutionSuccessful = responseData.success;
      }

      const outcomeMsg = responseData?.message || (isExecutionSuccessful ? 'Command successfully executed via SSH' : 'Command execution rejected by bus/cooldown');
      saveLogToServer(endpoint, cleanBody, isExecutionSuccessful, outcomeMsg, false, duration);

      return res.json({
        success: isExecutionSuccessful,
        data: responseData,
        isSimulated: false,
        command: curlCommand,
        duration,
        sshTarget: `${username}@${host}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      console.warn(`[SSH Proxy Error] SSH connection to ${username}@${host} failed: ${err.message || err}.`);
      
      const errMsg = `SSH connection to ${host} failed: ${err.message || String(err)}`;
      saveLogToServer(endpoint, cleanBody, false, errMsg, false, duration);

      return res.json({
        success: false,
        message: `SSH connection block to ${host} failed.`,
        payload: cleanBody,
        isSimulated: false,
        command: curlCommand,
        error: `Could not connect to SSH Gateway ${username}@${host} from hosted workspace: ${err.message || String(err)}. Private IPs like '10.18.225.250' are only reachable from your local corporate network or aircraft network.`,
        sshTarget: `${username}@${host}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Gateway config information api
  app.get('/api/proxy/ssh-config', (req, res) => {
    res.json({
      host: activeSSHConfig.host,
      username: activeSSHConfig.username,
      status: "nominal"
    });
  });

  // Update Gateway config information api
  app.post('/api/proxy/ssh-config', (req, res) => {
    const { host, username, password } = req.body;
    if (host) activeSSHConfig.host = host;
    if (username) activeSSHConfig.username = username;
    if (password !== undefined) activeSSHConfig.password = password;
    
    console.log(`[SSH Config] SSH Target updated to: ${activeSSHConfig.username}@${activeSSHConfig.host}`);
    res.json({
      success: true,
      host: activeSSHConfig.host,
      username: activeSSHConfig.username,
      status: "nominal"
    });
  });

  // 1. MCU Reset (SSB)
  // curl -X POST "https://crewcontrol.tci.aero/api/v1/mcu-reset" -H "Content-Type: application/json" -d '{"rowNumber": 2}'
  app.post('/api/proxy/v1/mcu-reset', async (req, res) => {
    await handleResetProxy('/mcu-reset', req.body, res);
  });

  // 2. Seat Reboot (SOFT)
  // curl -X POST "https://crewcontrol.tci.aero/api/v1/seat-reboot" -H "Content-Type: application/json" -d '{"seatId": "A", "rowNumber": 1, "target": "som"}'
  app.post('/api/proxy/v1/seat-reboot', async (req, res) => {
    await handleResetProxy('/seat-reboot', req.body, res);
  });

  // 3. Seat Hard Reset (HARD)
  // curl -X POST "https://crewcontrol.tci.aero/api/v1/seat-hard-reset" -H "Content-Type: application/json" -d '{"seatId": "A", "rowNumber": 1, "target": "som"}'
  app.post('/api/proxy/v1/seat-hard-reset', async (req, res) => {
    await handleResetProxy('/seat-hard-reset', req.body, res);
  });

  // 4. AMCU Full Reset
  // curl -X POST "https://crewcontrol.tci.aero/api/v1/full-reset" -H "Accept: application/json"
  app.post('/api/proxy/v1/full-reset', async (req, res) => {
    await handleResetProxy('/full-reset', req.body, res, 'POST', {
      Accept: 'application/json',
    });
  });

  // 5. Server-side log list and download endpoints
  app.get('/api/server-logs', (req, res) => {
    try {
      if (!fs.existsSync(logsDir)) {
        return res.json({ logs: [] });
      }
      const files = fs.readdirSync(logsDir);
      const logFiles = files
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(logsDir, f);
          const stats = fs.statSync(filePath);
          return {
            filename: f,
            size: stats.size,
            mtime: stats.mtime,
          };
        })
        .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime()); // newest first

      res.json({ logs: logFiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/server-logs/download/:filename', (req, res) => {
    try {
      const filename = req.params.filename;
      if (filename.includes('..') || !filename.endsWith('.log')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const filePath = path.join(logsDir, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.download(filePath, filename);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite integration for bundling and development hot-reloading
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets safely
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] TCI Crew Control Reset GUI running on http://localhost:${PORT}`);
  });
}

startServer();
