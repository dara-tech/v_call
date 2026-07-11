import { WebSocketServer, WebSocket } from 'ws';

/** WebSocket close codes 1005/1006 must not be sent in a close frame. */
function safeCloseCode(code) {
  const n = Number(code);
  if (!Number.isInteger(n)) return 1011;
  if (n === 1000 || (n >= 3000 && n <= 4999)) return n;
  const allowed = new Set([1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013]);
  if (allowed.has(n)) return n;
  return 1011;
}

function safeClose(ws, code, reason) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const text = Buffer.isBuffer(reason) ? reason.toString() : String(reason ?? '');
  try {
    ws.close(safeCloseCode(code), text.slice(0, 123));
  } catch (err) {
    console.error('[AI Proxy] close failed:', err.message);
    try { ws.terminate(); } catch { /* noop */ }
  }
}

export function setupAIProxy(server) {
  // Create a WebSocket server attached to the existing HTTP server
  const wss = new WebSocketServer({ server, path: '/ai-proxy' });

  wss.on('connection', (clientWs, req) => {
    console.log('[AI Proxy] Client connected from:', req.socket.remoteAddress);

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      console.error('[AI Proxy] GEMINI_API_KEY not found in environment.');
      clientWs.close(1011, 'Server misconfiguration: No API key');
      return;
    }

    const host = "generativelanguage.googleapis.com";
    const url = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
    
    console.log('[AI Proxy] Connecting to Gemini API...');
    const geminiWs = new WebSocket(url);

    // Forward messages from Gemini to the Client
    geminiWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    geminiWs.on('open', () => {
      console.log('[AI Proxy] Connected to Gemini API successfully.');
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`[AI Proxy] Gemini API disconnected (${code}): ${reason}`);
      safeClose(clientWs, code, reason);
    });

    geminiWs.on('error', (err) => {
      console.error('[AI Proxy] Gemini API Error:', err.message);
      safeClose(clientWs, 1011, 'Upstream Error');
    });

    // Forward messages from the Client to Gemini
    clientWs.on('message', (data, isBinary) => {
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(data, { binary: isBinary });
      } else if (geminiWs.readyState === WebSocket.CONNECTING) {
        // Optional: buffer messages until open, but for streaming real-time we can just drop or queue
        geminiWs.once('open', () => {
          geminiWs.send(data, { binary: isBinary });
        });
      }
    });

    clientWs.on('close', (code, reason) => {
      console.log(`[AI Proxy] Client disconnected (${code}): ${reason}`);
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
    });

    clientWs.on('error', (err) => {
      console.error('[AI Proxy] Client Error:', err.message);
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
    });
  });

  return wss;
}
