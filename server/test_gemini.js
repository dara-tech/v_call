import dotenv from 'dotenv';
import { WebSocket } from 'ws';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No API key');
  process.exit(1);
}

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('Connected');
  
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-2.0-flash-exp',
      generationConfig: {
        responseModalities: ["AUDIO"]
      }
    }
  }));
});

ws.on('message', (data) => {
  console.log('Message from Gemini:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log('Closed', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('Error', err);
});
