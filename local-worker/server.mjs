import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const app = express();
const PORT = 5577;
const LTX_BASE = 'http://127.0.0.1:8000';
const CLIPFORGE_API = 'https://desktop-tutorial-bkh1.onrender.com';
const OUTPUT_DIR = path.join(process.cwd(), 'generated');
const jobs = new Map();

app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin){
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/generated',express.static(OUTPUT_DIR,{maxAge:'1h'}));

async function jsonFetch(url, options={}){
  const response=await fetch(url,options);
  const raw=await response.text();
  let data={};
  try{data=JSON.parse(raw);}catch{data={raw};}
  if(!response.ok){
    const message=data?.detail||data?.error||data?.message||('HTTP '+response.status);
    throw new Error(String(message));
  }
  return data;
}

function clean(text){
  return String(text||'')
    .replace(/[*_~#`]/g,'')
    .replace(/\[[^\]]*\]/g,'')
    .replace(/https?:\/\/\S+/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

function srtTime(seconds){
  const ms=Math.max(0,Math.round(seconds*1000));
  const h=Math.floor(ms/3600000);
  const m=Math.floor((ms%3600000)/60000);
  const s=Math.floor((ms%60000)/1000);
  const rest=ms%1000;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+','+String(rest).padStart(3,'0');
}

async function download(url,file){
  const response=await fetch(url);
  if(!response.ok)throw new Error('LTX-Ausgabe konnte nicht geladen werden');
  await fs.writeFile(file,Buffer.from(await response.arrayBuffer()));
}

async function createClip(prompt, duration, dir, index){
  const payload={
    prompt:clean(prompt),
    model:'fast',
    resolution:'720p',
    duration:Math.max(5,Math.min(10,Math.round(duration))),
    fps:24,
    aspectRatio:'9:16'
  };
  const data=await jsonFetch(LTX_BASE+'/api/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!data.video_path)throw new Error('LTX hat keinen Video-Pfad zurückgegeben');
  const file=path.join(dir,'scene-'+index+'.mp4');
  await download('file://'+data.video_path,file).catch(async()=>{
    const source=String(data.video_path);
    await fs.copyFile(source,file);
  });
  return file;
}

async function createVoice(text, file){
  const response=await fetch(CLIPFORGE_API+'/api/tts',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:clean(text)})
  });
  const raw=await response.text();
  let data={};
  try{data=JSON.parse(raw);}catch{}
  if(!response.ok)throw new Error(data?.error||'Mistral-Stimme konnte nicht erzeugt werden');
  if(!data.audio)throw new Error('Keine Audiodaten erhalten');
  const base64=data.audio.split(',')[1];
  await fs.writeFile(file,Buffer.from(base64,'base64'));
}

async function renderJob(jobId, title, scenes){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clipforge-local-'));
  try{
    const job=jobs.get(jobId);
    job.progress=5; job.stage='LTX wird geprüft';
    await jsonFetch(LTX_BASE+'/api/generate-video-model-specs',{method:'GET'}).catch(()=>null);

    const clips=[];
    for(let i=0;i<scenes.length;i++){
      job.progress=10+Math.round(i/scenes.length*50);
      job.stage='Szene '+(i+1)+' von '+scenes.length+' wird erzeugt';
      const visualPrompt=[
        'Premium vertical TikTok footage, realistic cinematic commercial quality.',
        'No subtitles, no text, no logos, no watermark.',
        'Natural lighting, realistic materials, detailed environment, coherent camera motion.',
        'Scene concept: '+clean(scenes[i].visual),
        'Narrative context: '+clean(scenes[i].narration)
      ].join(' ');
      const clip=await createClip(visualPrompt,6,dir,i);
      clips.push(clip);
    }

    job.progress=68; job.stage='Szenen werden zusammengesetzt';
    const list=path.join(dir,'concat.txt');
    await fs.writeFile(list,clips.map(file=>"file '"+file.replace(/'/g,"'\\''")+"'").join('\n'));
    const silent=path.join(dir,'silent.mp4');
    await execFileAsync(ffmpegPath,['-y','-f','concat','-safe','0','-i',list,'-c','copy',silent]);

    job.progress=76; job.stage='KI-Stimme wird erzeugt';
    const narration=scenes.map(s=>clean(s.narration)).filter(Boolean).join(' ');
    const audio=path.join(dir,'voice.mp3');
    await createVoice(narration,audio);

    job.progress=86; job.stage='Captions werden eingebaut';
    const captions=[];
    let cursor=0;
    const words=scenes.map(s=>Math.max(1,clean(s.narration).split(/\s+/).length));
    const sum=words.reduce((a,b)=>a+b,0)||1;
    for(let i=0;i<scenes.length;i++){
      const d=30*words[i]/sum;
      captions.push((i+1)+'\n'+srtTime(cursor)+' --> '+srtTime(cursor+d)+'\n'+clean(scenes[i].on_screen||scenes[i].narration)+'\n\n');
      cursor+=d;
    }
    const srt=path.join(dir,'captions.srt');
    await fs.writeFile(srt,captions.join(''));

    await fs.mkdir(OUTPUT_DIR,{recursive:true});
    const safeId=crypto.randomUUID();
    const output=path.join(OUTPUT_DIR,safeId+'.mp4');
    const subFilter='subtitles='+srt.replace(/\\/g,'/').replace(/:/g,'\\:')+':force_style=FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Alignment=2,MarginV=115';
    await execFileAsync(ffmpegPath,[
      '-y','-i',silent,'-i',audio,
      '-vf',subFilter,
      '-map','0:v:0','-map','1:a:0',
      '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','192k','-shortest',output
    ],{maxBuffer:1024*1024*10});

    job.progress=100;
    job.stage='Fertig';
    job.status='done';
    job.url='/generated/'+safeId+'.mp4';
    job.title=title||'ClipForge Video';
  }catch(error){
    const job=jobs.get(jobId);
    if(job){
      job.status='error';
      job.stage='Fehler';
      job.error=error.message||'Lokaler Video-Render fehlgeschlagen';
    }
  }finally{
    await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}

app.get('/health',(req,res)=>res.json({ok:true,service:'ClipForge Local Worker',ltx:'http://127.0.0.1:8000'}));

app.post('/generate',async(req,res)=>{
  const scenes=Array.isArray(req.body?.scenes)?req.body.scenes.slice(0,6).map(s=>({
    narration:clean(s.narration),
    on_screen:clean(s.on_screen),
    visual:clean(s.visual)
  })).filter(s=>s.narration):[];
  if(scenes.length<3)return res.status(400).json({error:'Mindestens drei Szenen erforderlich'});
  const jobId=crypto.randomUUID();
  jobs.set(jobId,{status:'processing',progress:0,stage:'Start'});
  renderJob(jobId,String(req.body?.title||'ClipForge Video'),scenes);
  res.status(202).json({jobId});
});

app.get('/generate/:id',(req,res)=>{
  const job=jobs.get(req.params.id);
  if(!job)return res.status(404).json({error:'Renderjob nicht gefunden'});
  res.json(job);
});

app.listen(PORT,'127.0.0.1',()=>console.log('ClipForge Local Worker läuft auf http://127.0.0.1:'+PORT));
