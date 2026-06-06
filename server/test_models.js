import dotenv from 'dotenv';
import https from 'https';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const liveModels = json.models.filter(m => m.supportedGenerationMethods.includes('bidiGenerateContent') || m.name.includes('flash'));
    console.log(JSON.stringify(liveModels, null, 2));
  });
});
