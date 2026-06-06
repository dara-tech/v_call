import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:5001/ai-proxy');
ws.on('open', () => {
  console.log('Connected to proxy');
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-3.1-flash-live-preview',
      systemInstruction: { parts: [{ text: "Hello" }] },
      generationConfig: { responseModalities: ["AUDIO"] }
    }
  }));
});
ws.on('message', (data) => {
  const str = data.toString();
  console.log('Proxy Msg:', str.substring(0, 100));
  if (str.includes('setupComplete')) {
    console.log('Sending video...');
    ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: "image/jpeg",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        }]
      }
    }));
  }
});
ws.on('close', (c, r) => console.log('Proxy Close:', c, r.toString()));
