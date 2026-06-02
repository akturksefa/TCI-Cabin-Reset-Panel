import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Client } from 'ssh2';

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

  // SSH execution client helper to execute curl commands on the user's specific gateway host
  function executeSSHCommand(
    command: string,
    host = process.env.SSH_HOST || '10.18.225.250',
    username = process.env.SSH_USER || 'tcitest',
    password = process.env.SSH_PASS || 'tcitest1.'
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
      return res.json({
        success: true,
        message: `[Simulated] Action for ${endpoint} completed successfully.`,
        payload: cleanBody,
        isSimulated: true,
        command: curlCommand,
        timestamp: new Date().toISOString(),
      });
    }

    const host = process.env.SSH_HOST || '10.18.225.250';
    const username = process.env.SSH_USER || 'tcitest';
    const password = process.env.SSH_PASS || 'tcitest1.';

    try {
      console.log(`[SSH Proxy] Logging into ${host} as ${username} to run command: ${curlCommand}`);
      const startTime = Date.now();
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
      console.warn(`[SSH Proxy Error] SSH connection to ${username}@${host} failed: ${err.message || err}.`);
      
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
      host: process.env.SSH_HOST || "10.18.225.250",
      username: process.env.SSH_USER || "tcitest",
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
