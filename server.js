import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({limit:'1mb'}));
app.use(express.static(__dirname));

app.post('/api/generate', async (req,res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({error:'OPENAI_API_KEY fehlt'});
  }

  const {type='script', topic='', style='Fast & energetic'} = req.body || {};
  const cleanTopic = String(topic).trim().slice(0,500);
  if (!cleanTopic) return res.status(400).json({error:'Thema fehlt'});

  const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});

  try {
    if (type === 'idea') {
      const response = await client.responses.create({
        model:'gpt-5.6-luna',
        instructions:'Du bist ClipForge AI, ein kreativer Kurzvideo-Assistent. Erstelle sichere, jugendgeeignete TikTok-Ideen auf Deutsch. Keine gefährlichen Challenges, keine illegalen Anleitungen und keine sexualisierten Inhalte.',
        input:`Nische/Thema: ${cleanTopic}
Gib genau ein JSON-Objekt zurück: {"title":"...","hook":"...","duration":"..."}.
Die Idee soll konkret, modern und in 30-45 Sekunden umsetzbar sein.`,
        text:{format:{type:'json_object'}}
      });
      return res.json(JSON.parse(response.output_text));
    }

    const response = await client.responses.create({
      model:'gpt-5.6-luna',
      instructions:'Du bist ClipForge AI und schreibst kurze, natürliche deutsche TikTok-Skripte. Zielgruppe: allgemeines Publikum, jugendgeeignet. Keine gefährlichen Challenges, keine illegalen Anleitungen und keine sexualisierten Inhalte. Schreibe verständlich und mit starkem Hook.',
      input:`Thema: ${cleanTopic}
Stil: ${String(style).slice(0,100)}
Gib genau ein JSON-Objekt zurück: {"hook":"...","body":"...","cta":"..."}.
Body für etwa 30-45 Sekunden, mit kurzen Sätzen und sinnvollen Zeilenumbrüchen.`,
      text:{format:{type:'json_object'}}
    });
    res.json(JSON.parse(response.output_text));
  } catch (error) {
    console.error(error);
    res.status(500).json({error:'KI-Anfrage fehlgeschlagen'});
  }
});

app.listen(port,()=>console.log(`ClipForge läuft auf http://localhost:${port}`));
