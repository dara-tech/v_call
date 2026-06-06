import dotenv from 'dotenv';
import { WebSocket } from 'ws';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('Connected');
  
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-3.1-flash-live-preview',
      generationConfig: {
        responseModalities: ["AUDIO"]
      }
    }
  }));
});

ws.on('message', (data) => {
  const str = data.toString();
  const msg = JSON.parse(str);
  if (msg.setupComplete) {
    console.log('Received setupComplete, sending realtimeInput');
      const dummyPcm = Buffer.alloc(16000 * 2); // 1 second of silence
      const chunkSize = 4096;
      let offset = 0;
      
      const interval = setInterval(() => {
        if (offset >= dummyPcm.length) {
          clearInterval(interval);
          return;
        }
        const chunk = dummyPcm.subarray(offset, Math.min(offset + chunkSize, dummyPcm.length));
        const base64Data = chunk.toString('base64');
        ws.send(JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: base64Data
            }
          }
        }));
        offset += chunkSize;
      }, 100);
  } else if (str.includes('serverContent')) {
    console.log('Received serverContent chunk');
  } else {
    console.log('Message from Gemini:', str);
  }
});

ws.on('close', (code, reason) => {
  console.log('Closed', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('Error', err);
});
