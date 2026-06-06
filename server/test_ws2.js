import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:5001/ai-proxy');
ws.on('open', () => {
  console.log('Connected to proxy');
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-3.1-flash-live-preview',
      systemInstruction: { parts: [{ text: "Hello" }] },
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede"
            }
          }
        }
      }
    }
  }));
});
ws.on('message', (data) => console.log('Proxy Msg:', data.toString()));
ws.on('close', (c, r) => console.log('Proxy Close:', c, r.toString()));
