import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || 'https://lucry999.github.io,http://localhost:3000,http://127.0.0.1:3000').split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';
  const githubPagesOrigin = /^https:\/\/([a-z0-9-]+)\.github\.io$/i.test(normalizedOrigin);
  if (allowedOrigins.includes('*') || (normalizedOrigin && (allowedOrigins.includes(normalizedOrigin) || githubPagesOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  if (origin) res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/health', (req, res) => res.json({
  ok: true,
  service: 'ClipForge AI',
  provider: 'mistral',
  configured: Boolean(process.env.MISTRAL_API_KEY),
  time: new Date().toISOString()
}));

async function mistralChat(messages) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.MISTRAL_API_KEY
      },
      body: JSON.stringify({
        model: 'ministral-3b-2512',
        messages,
        temperature: 0.8,
        response_format: { type: 'json_object' }
      })
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (response.ok) {
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Mistral hat keine Antwort zurückgegeben');
      return JSON.parse(content);
    }

    const message = data?.message || data?.error?.message || data?.error || ('Mistral API HTTP ' + response.status);

    if (response.status !== 429 || attempt === maxAttempts) {
      throw new Error(String(message));
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30000)
      : attempt * 2000;

    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  throw new Error('Mistral-Anfrage konnte nicht abgeschlossen werden');
}

async function mistralFetchJson(url, options) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    const message = data?.message || data?.error?.message || data?.error || ('Mistral API HTTP ' + response.status);
    throw new Error(String(message));
  }
  return data;
}

app.get('/api/voices', async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) return res.status(503).json({ error: 'MISTRAL_API_KEY fehlt in Render' });
  try {
    const data = await mistralFetchJson('https://api.mistral.ai/v1/audio/voices?type=preset&limit=100', {
      headers: { 'Authorization': 'Bearer ' + process.env.MISTRAL_API_KEY }
    });
    const voices = (data.items || []).map(v => ({ id: v.id, name: v.name, type: v.type, languages: v.languages || [] }));
    res.json({ voices });
  } catch (error) {
    console.error('Voice list error:', error);
    res.status(502).json({ error: error.message || 'Stimmen konnten nicht geladen werden' });
  }
});

app.post('/api/tts', async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) return res.status(503).json({ error: 'MISTRAL_API_KEY fehlt in Render' });
  const cleanText = String(req.body?.text || '')
    .replace(/[*_`#]/g, '')
    .replace(/[^\\S\\r\\n]+/g, ' ')
    .trim()
    .slice(0, 1800);
  if (!cleanText) return res.status(400).json({ error: 'Text für Stimme fehlt' });
  try {
    let voiceId = String(req.body?.voice_id || '').trim();
    if (!voiceId) {
      const voices = await mistralFetchJson('https://api.mistral.ai/v1/audio/voices?type=preset&limit=100', {
        headers: { 'Authorization': 'Bearer ' + process.env.MISTRAL_API_KEY }
      });
      const presets = voices.items || [];
      const german = presets.find(v => Array.isArray(v.languages) && v.languages.some(lang => String(lang).toLowerCase().startsWith('de')));
      voiceId = german?.id || presets[0]?.id || '';
    }
    if (!voiceId) throw new Error('Keine Mistral-Preset-Stimme verfügbar');
    const data = await mistralFetchJson('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.MISTRAL_API_KEY },
      body: JSON.stringify({ model: 'voxtral-mini-tts-2603', input: cleanText, voice_id: voiceId, response_format: 'mp3' })
    });
    const audioData = data?.audio_data;
    if (!audioData) throw new Error('Mistral hat keine Audiodaten zurückgegeben');
    res.json({ audio: 'data:audio/mpeg;base64,' + audioData, voice_id: voiceId });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(502).json({ error: error.message || 'Sprachgenerierung fehlgeschlagen' });
  }
});

app.post('/api/generate', async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(503).json({ error: 'MISTRAL_API_KEY fehlt in Render' });
  }

  const { type = 'script', topic = '', style = 'Fast & energetic' } = req.body || {};
  const cleanTopic = String(topic).trim().slice(0, 500);
  if (!cleanTopic) return res.status(400).json({ error: 'Thema fehlt' });

  try {
    if (type === 'idea') {
      const result = await mistralChat([
        { role: 'system', content: 'Du bist ClipForge AI, ein kreativer Kurzvideo-Assistent. Erstelle sichere, jugendgeeignete TikTok-Ideen auf Deutsch. Keine gefährlichen Challenges, keine illegalen Anleitungen und keine sexualisierten Inhalte. Gib ausschließlich valides JSON zurück.' },
        { role: 'user', content: 'Nische/Thema: ' + cleanTopic + '\nGib genau ein JSON-Objekt zurück: {"title":"...","hook":"...","duration":"..."}.\nDie Idee soll konkret, modern und in 30-45 Sekunden umsetzbar sein. Verwende für aktuelle Beispiele und Jahreszahlen 2026, nicht 2024.' }
      ]);
      return res.json(result);
    }

    const result = await mistralChat([
      { role: 'system', content: 'Du bist ClipForge AI und schreibst kurze, natürliche deutsche TikTok-Skripte. Das aktuelle Jahr ist 2026. Zielgruppe: allgemeines Publikum, jugendgeeignet. Keine gefährlichen Challenges, keine illegalen Anleitungen und keine sexualisierten Inhalte. Schreibe verständlich und mit starkem Hook. Gib ausschließlich valides JSON zurück.' },
      { role: 'user', content: 'Thema: ' + cleanTopic + '\nStil: ' + String(style).slice(0, 100) + '\nGib genau ein JSON-Objekt zurück: {"hook":"...","body":"...","cta":"..."}.\nBody für etwa 30-45 Sekunden, mit kurzen Sätzen und sinnvollen Zeilenumbrüchen. Verwende aktuelle Jahreszahlen und Bezüge auf 2026.' }
    ]);
    return res.json(result);
  } catch (error) {
    console.error('Mistral error:', error);
    return res.status(502).json({ error: error.message || 'KI-Anfrage fehlgeschlagen' });
  }
});

app.listen(port, '0.0.0.0', () => console.log('ClipForge läuft auf port ' + port));
