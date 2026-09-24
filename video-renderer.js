(function(){
  const API_BASE=(window.CLIPFORGE_API_URL||localStorage.getItem('clipforge_api_url')||'http://127.0.0.1:5577').replace(/\/$/,'');
  let lastUrl='';

  function escape(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function sceneData(script){
    return Array.isArray(script?.scenes)?script.scenes.map(s=>({
      narration:String(s?.narration||'').trim(),
      on_screen:String(s?.on_screen||'').trim(),
      visual:String(s?.visual||'').trim()
    })).filter(s=>s.narration):[];
  }

  async function openDb(){
    return await new Promise((resolve,reject)=>{
      const req=indexedDB.open('ClipForgeVideoDB',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('videos',{keyPath:'id'});
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function saveLocalVideo(blob,title){
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('videos','readwrite');
        tx.objectStore('videos').put({id:crypto.randomUUID(),blob,title:title||'ClipForge Video',created:Date.now()});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      db.close();
    }catch(error){console.warn('Video-Bibliothek:',error);}
  }

  async function loadLibrary(){
    const grid=document.getElementById('libraryGrid');
    if(!grid)return;
    try{
      const db=await openDb();
      const items=await new Promise((resolve,reject)=>{
        const tx=db.transaction('videos','readonly'),req=tx.objectStore('videos').getAll();
        req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.created-a.created));
        req.onerror=()=>reject(req.error);
      });
      db.close();
      grid.querySelectorAll('.generated-video-card').forEach(x=>x.remove());
      items.forEach(item=>{
        const url=URL.createObjectURL(item.blob);
        const card=document.createElement('div');
        card.className='video-card generated-video-card';
        card.innerHTML='<div class="card-video-wrap"><video src="'+url+'" muted playsinline controls preload="metadata"></video></div><strong>'+escape(item.title)+'</strong><small>Gerendert · '+new Date(item.created).toLocaleDateString('de-DE')+' · <a href="'+url+'" download="clipforge-video.mp4">Download</a></small>';
        grid.prepend(card);
      });
    }catch(error){console.warn('Bibliothek laden:',error);}
  }

  async function waitForLocalWorker(){
    const response=await fetch(API_BASE+'/health',{cache:'no-store'});
    if(!response.ok)throw new Error('Lokaler ClipForge-Worker antwortet nicht.');
    return response.json();
  }

  async function renderVideo(){
    const script=window.clipforgeLastScript;
    const scenes=sceneData(script);
    const result=document.getElementById('buildResult');
    if(!script||scenes.length<3){
      if(result){
        result.classList.remove('hidden');
        result.innerHTML='<b>⚠️ Noch nicht bereit</b><br><span>Erstelle zuerst ein Skript mit mindestens drei Szenen.</span>';
      }
      return;
    }

    const btn=document.getElementById('renderVideoBtn');
    const wrap=document.getElementById('videoPreviewWrap');
    const video=document.getElementById('videoPreview');
    const download=document.getElementById('downloadVideoBtn');
    const demo=document.getElementById('demoPhone');
    const hint=document.getElementById('previewHint');
    if(btn){btn.disabled=true;btn.textContent='⏳ Lokale KI wird gestartet…';}

    try{
      await waitForLocalWorker();
      if(hint)hint.textContent='LTX Desktop erzeugt die Szenen lokal auf deiner Grafikkarte. Danach werden Stimme und Captions zusammengesetzt.';

      const response=await fetch(API_BASE+'/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title:script.topic||'ClipForge Video',scenes})
      });
      if(!response.ok){
        const data=await response.json().catch(()=>({}));
        throw new Error(data.error||'Lokaler Qualitäts-Render konnte nicht gestartet werden');
      }

      const job=await response.json();
      if(!job.jobId)throw new Error('Der lokale Worker hat keine Job-ID zurückgegeben.');

      let status=null;
      for(let attempt=0;attempt<180;attempt++){
        await new Promise(resolve=>setTimeout(resolve,4000));
        const poll=await fetch(API_BASE+'/generate/'+encodeURIComponent(job.jobId),{cache:'no-store'});
        if(!poll.ok)continue;
        status=await poll.json();
        const progress=Math.max(0,Math.min(100,Number(status.progress)||0));
        if(btn)btn.textContent='🎬 KI-Video wird gebaut… '+progress+'%';
        if(hint)hint.textContent=(status.stage||'Lokaler Render läuft…');
        if(status.status==='error')throw new Error(status.error||'Qualitäts-Render fehlgeschlagen');
        if(status.status==='done'&&status.url)break;
      }

      if(!status||status.status!=='done'||!status.url)throw new Error('Der lokale Renderjob läuft länger als erwartet. Prüfe LTX Desktop und den ClipForge-Worker.');
      lastUrl=API_BASE+status.url;
      video.src=lastUrl;
      wrap.classList.remove('hidden');
      demo.classList.add('hidden');
      hint.textContent='Fertiges 9:16-Video mit lokalen KI-Szenen, KI-Stimme und Captions.';
      download.href=lastUrl;
      download.download='clipforge-'+Date.now()+'.mp4';

      try{
        const file=await fetch(lastUrl);
        if(file.ok){
          await saveLocalVideo(await file.blob(),script.topic||'ClipForge Video');
          await loadLibrary();
        }
      }catch(error){console.warn('Lokale Videobibliothek:',error);}

      if(result)result.innerHTML+='<br><br><b>✅ Qualitätsvideo fertig!</b><br><span>LTX-Szenen wurden lokal erzeugt und mit Stimme und Captions zusammengesetzt.</span>';
      if(btn)btn.textContent='🎬 Video erneut erstellen';
    }catch(error){
      console.error(error);
      if(result){
        result.classList.remove('hidden');
        result.innerHTML+='<br><br><b>⚠️ Video-Fehler:</b> '+escape(error.message||'Unbekannter Fehler');
      }
      if(btn)btn.textContent='🎬 Erneut versuchen';
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  function init(){
    try{
      const saved=localStorage.getItem('clipforge_last_script');
      if(saved&&!window.clipforgeLastScript)window.clipforgeLastScript=JSON.parse(saved);
    }catch(error){console.warn('Skript laden:',error);}
    document.getElementById('renderVideoBtn')?.addEventListener('click',renderVideo);
    document.getElementById('newVideoBtn')?.addEventListener('click',()=>document.getElementById('renderVideoBtn')?.click());
    loadLibrary();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();