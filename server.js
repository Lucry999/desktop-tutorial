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

const fs = await import('node:fs/promises');
const os = await import('node:os');
const crypto = await import('node:crypto');
const { default: ffmpegPath } = await import('ffmpeg-static');
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const videoJobs = new Map();

async function runwayRequest(url, options) {
  if (!process.env.RUNWAYML_API_SECRET) throw new Error('RUNWAYML_API_SECRET fehlt in Render');
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RUNWAYML_API_SECRET,
      'X-Runway-Version': '2024-11-06',
      ...(options?.headers || {})
    }
  });
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    const message = data?.error || data?.message || data?.details || ('Runway API HTTP ' + response.status);
    throw new Error(String(message));
  }
  return data;
}

async function runRunwayClip(prompt) {
  const task = await runwayRequest('https://api.dev.runwayml.com/v1/image_to_video', {
    method:'POST',
    body:JSON.stringify({
      model:'gen4.5',
      promptText:prompt,
      ratio:'720:1280',
      duration:6
    })
  });
  const taskId=task.id;
  if(!taskId) throw new Error('Runway hat keine Task-ID zurückgegeben');
  for(let attempt=0;attempt<48;attempt++){
    await new Promise(resolve=>setTimeout(resolve,5000 + Math.random()*1500));
    const status=await runwayRequest('https://api.dev.runwayml.com/v1/tasks/'+encodeURIComponent(taskId), {method:'GET'});
    if(status.status==='SUCCEEDED' && status.output?.[0]) return status.output[0];
    if(status.status==='FAILED' || status.status==='CANCELED') throw new Error('Runway konnte eine Videoszene nicht erstellen');
  }
  throw new Error('Runway-Video braucht länger als erwartet');
}

async function generateMistralSpeech(text) {
  const clean=String(text||'').replace(/[*_~#`]/g,'').replace(/\[[^\]]*\]/g,'').replace(/\\/g,'').replace(/\bKI\b/gi,'künstliche Intelligenz').replace(/\bAI\b/gi,'A I').replace(/\s+/g,' ').trim().slice(0,1800);
  if(!clean) throw new Error('Kein Sprechertext vorhanden');
  const voices=await mistralJson('https://api.mistral.ai/v1/audio/voices?type=preset&limit=100',{headers:{'Authorization':'Bearer '+process.env.MISTRAL_API_KEY}});
  const presets=Array.isArray(voices.items)?voices.items:[];
  const german=presets.find(v=>Array.isArray(v.languages)&&v.languages.some(lang=>{const x=String(lang).toLowerCase();return x.startsWith('de')||x.includes('german')||x.includes('deutsch');}));
  const voiceId=String(german?.id||presets[0]?.id||'');
  if(!voiceId) throw new Error('Keine Mistral-Preset-Stimme verfügbar');
  const data=await mistralJson('https://api.mistral.ai/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.MISTRAL_API_KEY},body:JSON.stringify({model:'voxtral-mini-tts-2603',input:clean,voice_id:voiceId,response_format:'mp3'})});
  if(!data.audio_data) throw new Error('Mistral hat keine Audiodaten zurückgegeben');
  return Buffer.from(data.audio_data,'base64');
}

function srtTime(seconds){
  const ms=Math.max(0,Math.round(seconds*1000));
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000),rest=ms%1000;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+','+String(rest).padStart(3,'0');
}

function makeSrt(scenes){
  const weights=scenes.map(s=>Math.max(1,cleanSceneText(s.narration).split(/\s+/).length));
  const total=weights.reduce((a,b)=>a+b,0)||1;
  let t=0;
  return scenes.map((s,i)=>{
    const d=30*weights[i]/total;
    const line=cleanSceneText(s.on_screen||s.narration).replace(/-->/g,'-');
    const out=(i+1)+'\n'+srtTime(t)+' --> '+srtTime(t+d)+'\n'+line+'\n\n';
    t+=d;return out;
  }).join('');
}

function cleanSceneText(value){ return String(value||'').replace(/[*_~#`]/g,'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim(); }

async function assembleVideo(jobId, scenes, title){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clipforge-'+jobId+'-'));
  const clips=[];
  try{
    const style='Vertical nine-by-sixteen TikTok video, premium cinematic commercial look, realistic photography, natural skin and materials, strong depth of field, smooth handheld or dolly camera motion, clean modern lighting, no text, no subtitles, no logos, no watermark, visually coherent color grade.';
    for(let i=0;i<scenes.length;i++){
      videoJobs.get(jobId).progress=10 + Math.round((i/scenes.length)*45);
      const scene=scenes[i];
      const prompt=style+' Scene '+(i+1)+': '+cleanSceneText(scene.visual||scene.narration)+'. '+cleanSceneText(scene.narration)+'. Show a clear visual that supports the narration; do not depict written words on screen.';
      const url=await runRunwayClip(prompt);
      const file=path.join(dir,'scene-'+i+'.mp4');
      const response=await fetch(url);
      if(!response.ok) throw new Error('Runway-Videodatei konnte nicht geladen werden');
      await fs.writeFile(file,Buffer.from(await response.arrayBuffer()));
      clips.push(file);
    }

    videoJobs.get(jobId).progress=58;
    const listFile=path.join(dir,'list.txt');
    await fs.writeFile(listFile,clips.map(file=>"file '"+file.replace(/'/g,"'\\''")+"'").join('\n'));
    const silent=path.join(dir,'silent.mp4');
    await execFileAsync(ffmpegPath,['-y','-f','concat','-safe','0','-i',listFile,'-c','copy',silent]);

    videoJobs.get(jobId).progress=72;
    const narration=scenes.map(s=>cleanSceneText(s.narration)).filter(Boolean).join(' ');
    const audio=await generateMistralSpeech(narration);
    const audioFile=path.join(dir,'voice.mp3');
    await fs.writeFile(audioFile,audio);

    const srtFile=path.join(dir,'captions.srt');
    await fs.writeFile(srtFile,makeSrt(scenes));
    const outputDir=path.join(__dirname,'generated');
    await fs.mkdir(outputDir,{recursive:true});
    const outputFile=path.join(outputDir,jobId+'.mp4');
    videoJobs.get(jobId).progress=84;
    const subtitleFilter='subtitles='+srtFile.replace(/\\/g,'/').replace(/:/g,'\\:')+':force_style=FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Alignment=2,MarginV=120';
    await execFileAsync(ffmpegPath,['-y','-i',silent,'-i',audioFile,'-vf',subtitleFilter,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest',outputFile],{maxBuffer:1024*1024*10});
    videoJobs.get(jobId).progress=100;
    videoJobs.get(jobId).status='done';
    videoJobs.get(jobId).url='/generated/'+jobId+'.mp4';
    videoJobs.get(jobId).title=title||'ClipForge Video';
  }catch(error){
    videoJobs.get(jobId).status='error';
    videoJobs.get(jobId).error=error.message||'Videoerstellung fehlgeschlagen';
    console.error('HQ video job error:',error);
  }finally{
    await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}

app.post('/api/video-hq', async (req,res)=>{
  if(!process.env.RUNWAYML_API_SECRET) return res.status(503).json({error:'RUNWAYML_API_SECRET fehlt in Render'});
  if(!process.env.MISTRAL_API_KEY) return res.status(503).json({error:'MISTRAL_API_KEY fehlt in Render'});
  const scenes=Array.isArray(req.body?.scenes)?req.body.scenes.slice(0,6).map(s=>({narration:cleanSceneText(s.narration),on_screen:cleanSceneText(s.on_screen),visual:cleanSceneText(s.visual)})).filter(s=>s.narration):[];
  const title=String(req.body?.title||'ClipForge Video').slice(0,160);
  if(scenes.length<3) return res.status(400).json({error:'Für ein Qualitätsvideo werden mindestens 3 Szenen benötigt'});
  const jobId=crypto.randomUUID();
  videoJobs.set(jobId,{status:'processing',progress:0});
  assembleVideo(jobId,scenes,title);
  res.status(202).json({jobId});
});

app.get('/api/video-hq/:id',(req,res)=>{
  const job=videoJobs.get(req.params.id);
  if(!job) return res.status(404).json({error:'Renderjob nicht gefunden'});
  res.json(job);
});

app.use('/generated',express.static(path.join(__dirname,'generated'),{maxAge:'1h'}));

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
