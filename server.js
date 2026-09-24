import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || 'https://lucry999.github.io,http://localhost:3000,http://127.0.0.1:3000').split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean);

app.use((req,res,next) => {
  const origin = req.headers.origin;
  const normalized = origin ? origin.replace(/\/$/, '') : '';
  const githubPages = /^https:\/\/([a-z0-9-]+)\.github\.io$/i.test(normalized);
  if (allowedOrigins.includes('*') || (normalized && (allowedOrigins.includes(normalized) || githubPages))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  if (origin) res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({limit:'1mb'}));
app.use(express.static(__dirname));

async function mistralJson(url, options) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    const message = data?.message || data?.error?.message || data?.error || ('Mistral API HTTP ' + response.status);
    throw new Error(String(message));
  }
  return data;
}

app.get('/health',(req,res) => res.json({
  ok:true,
  service:'ClipForge AI',
  provider:'mistral',
  configured:Boolean(process.env.MISTRAL_API_KEY),
  version:'1.3.0'
}));

app.post('/api/generate', async (req,res) => {
  if (!process.env.MISTRAL_API_KEY) return res.status(503).json({error:'MISTRAL_API_KEY fehlt in Render'});
  const type = String(req.body?.type || 'script');
  const topic = String(req.body?.topic || '').trim().slice(0,500);
  const style = String(req.body?.style || 'Fast & energetic').slice(0,100);
  if (!topic) return res.status(400).json({error:'Thema fehlt'});

  const ideaSystem = 'Du bist ClipForge AI. Erstelle moderne, jugendgeeignete TikTok-Konzepte auf Deutsch. Keine gefährlichen Challenges, keine illegalen Anleitungen und keine sexualisierten Inhalte. Das aktuelle Jahr ist 2026. Gib ausschließlich valides JSON zurück.';
  const scriptSystem = 'Du bist ClipForge AI. Du produzierst hochwertige Kurzvideo-Skripte für TikTok. Das aktuelle Jahr ist 2026. Erstelle 5 klar unterschiedliche Szenen, die logisch aufeinander aufbauen. Verwende natürliche deutsche Sprache. Keine Markdown-Zeichen, keine Emojis, keine Hashtags in narration. Schreibe Zahlen als Wörter aus und sprich Abkürzungen aus, zum Beispiel künstliche Intelligenz statt KI. Keine gefährlichen Challenges, keine illegalen Anleitungen und keine sexualisierten Inhalte. Gib ausschließlich valides JSON zurück.';

  try {
    if (type === 'idea') {
      const data = await mistralJson('https://api.mistral.ai/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer ' + process.env.MISTRAL_API_KEY},
        body:JSON.stringify({
          model:'ministral-3b-2512',
          temperature:0.8,
          response_format:{type:'json_object'},
          messages:[
            {role:'system',content:ideaSystem},
            {role:'user',content:'Nische: ' + topic + '\nErstelle eine konkrete Videoidee für 30 bis 45 Sekunden. Gib title, hook, duration und einen fertigen video_prompt zurück. Der video_prompt soll bereits alle wichtigen Produktionsinfos enthalten und direkt in den Video-Builder übernommen werden.'}
          ]
        })
      });
      return res.json(JSON.parse(data.choices[0].message.content));
    }

    const data = await mistralJson('https://api.mistral.ai/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + process.env.MISTRAL_API_KEY},
      body:JSON.stringify({
        model:'ministral-3b-2512',
        temperature:0.7,
        response_format:{type:'json_object'},
        messages:[
          {role:'system',content:scriptSystem},
          {role:'user',content:'Thema: ' + topic + '\nStil: ' + style + '\nErstelle genau dieses JSON: {"hook":"...","body":"...","cta":"...","scenes":[{"narration":"...","on_screen":"...","visual":"..."},{"narration":"...","on_screen":"...","visual":"..."},{"narration":"...","on_screen":"...","visual":"..."},{"narration":"...","on_screen":"...","visual":"..."},{"narration":"...","on_screen":"...","visual":"..."}]. Jede Szene braucht 1 bis 2 natürliche Sätze narration, maximal 6 Wörter on_screen und eine konkrete visual-Idee. Das komplette Video soll etwa 30 bis 45 Sekunden dauern.'}
        ]
      })
    });
    const result = JSON.parse(data.choices[0].message.content);
    if (!Array.isArray(result.scenes)) result.scenes=[];
    return res.json(result);
  } catch (error) {
    console.error('Generate error:',error);
    return res.status(502).json({error:error.message || 'KI-Anfrage fehlgeschlagen'});
  }
});

app.post('/api/tts', async (req,res) => {
  if (!process.env.MISTRAL_API_KEY) return res.status(503).json({error:'MISTRAL_API_KEY fehlt in Render'});
  const text = String(req.body?.text || '')
    .replace(/[*_~#`]/g,'')
    .replace(/\[[^\]]*\]/g,'')
    .replace(/\\/g,'')
    .replace(/\bKI\b/gi,'künstliche Intelligenz')
    .replace(/\bAI\b/gi,'A I')
    .replace(/\bCTA\b/gi,'Call to Action')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,1800);
  if (!text) return res.status(400).json({error:'Text für Stimme fehlt'});
  try {
    const voices = await mistralJson('https://api.mistral.ai/v1/audio/voices?type=preset&limit=100', {
      headers:{'Authorization':'Bearer ' + process.env.MISTRAL_API_KEY}
    });
    const presets = Array.isArray(voices.items) ? voices.items : [];
    const german = presets.find(v => Array.isArray(v.languages) && v.languages.some(lang => {
      const x=String(lang).toLowerCase();
      return x.startsWith('de') || x.includes('german') || x.includes('deutsch');
    }));
    const voiceId = String(req.body?.voice_id || german?.id || presets[0]?.id || '');
    if (!voiceId) throw new Error('Keine Mistral-Preset-Stimme verfügbar');
    const data = await mistralJson('https://api.mistral.ai/v1/audio/speech', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + process.env.MISTRAL_API_KEY},
      body:JSON.stringify({model:'voxtral-mini-tts-2603',input:text,voice_id:voiceId,response_format:'mp3'})
    });
    if (!data.audio_data) throw new Error('Mistral hat keine Audiodaten zurückgegeben');
    res.json({audio:'data:audio/mpeg;base64,' + data.audio_data,voice_id:voiceId});
  } catch (error) {
    console.error('TTS error:',error);
    return res.status(502).json({error:error.message || 'Sprachgenerierung fehlgeschlagen'});
  }
});

app.listen(port,'0.0.0.0',()=>console.log('ClipForge läuft auf port ' + port));
