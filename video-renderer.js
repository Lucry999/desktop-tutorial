(function(){
  var API_BASE=(window.CLIPFORGE_API_URL||localStorage.getItem('clipforge_api_url')||'https://desktop-tutorial-bkh1.onrender.com').replace(/\/$/,'');
  var lastBlobUrl=null;

  function cleanText(value){
    return String(value||'').replace(/\[[^\]]*\]/g,'').replace(/[*_~#]/g,'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
  }

  function wrapText(ctx,text,maxWidth,maxLines){
    var words=String(text).split(/\s+/), lines=[], line='';
    for(var i=0;i<words.length;i++){
      var test=line?line+' '+words[i]:words[i];
      if(ctx.measureText(test).width>maxWidth && line){
        lines.push(line); line=words[i];
        if(lines.length===maxLines-1) break;
      }else line=test;
    }
    if(line&&lines.length<maxLines) lines.push(line);
    return lines;
  }

  function rounded(ctx,x,y,w,h,r){
    var q=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);
    ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();
  }

  function draw(ctx,script,t,duration){
    var progress=Math.min(t/duration,1), w=1080, h=1920;
    var bg=ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#09051a');bg.addColorStop(.5,'#19102e');bg.addColorStop(1,'#05060a');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);

    for(var i=0;i<5;i++){
      var x=540+Math.sin(t*.35+i*1.7)*450, y=250+i*360+Math.cos(t*.25+i)*100, r=190+i*25;
      var g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(139,92,246,.20)');g.addColorStop(1,'rgba(139,92,246,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }

    ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='800 28px Inter,Arial,sans-serif';ctx.fillText('✦ CLIPFORGE AI',70,90);
    ctx.fillStyle='#b79cff';ctx.font='800 21px Inter,Arial,sans-serif';ctx.fillText('AI SHORT • 9:16 • 2026',70,138);

    var hook=cleanText(script.hook), body=cleanText(script.body), cta=cleanText(script.cta);
    var text=body;
    if(t<3) text=hook;
    if(t>duration-3) text=cta;

    rounded(ctx,55,1240,970,440,36);ctx.fillStyle='rgba(5,6,10,.78)';ctx.fill();
    ctx.textAlign='center';ctx.fillStyle='#fff';
    ctx.font=t<3?'800 70px Inter,Arial,sans-serif':'800 56px Inter,Arial,sans-serif';
    var lines=wrapText(ctx,text,820,5), start=1360;
    for(var n=0;n<lines.length;n++) ctx.fillText(lines[n],540,start+n*70);
    ctx.textAlign='left';

    ctx.fillStyle='rgba(255,255,255,.35)';ctx.font='500 22px Inter,Arial,sans-serif';ctx.fillText('AI-GENERATED • CAPTIONS',70,1820);
    rounded(ctx,70,1760,940,8,8);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();
    rounded(ctx,70,1760,940*progress,8,8);ctx.fillStyle='#a78bfa';ctx.fill();
  }

  function openLibraryDb(){
    return new Promise(function(resolve,reject){
      var request=indexedDB.open('ClipForgeVideoDB',1);
      request.onupgradeneeded=function(){request.result.createObjectStore('videos',{keyPath:'id'});};
      request.onsuccess=function(){resolve(request.result);};
      request.onerror=function(){reject(request.error);};
    });
  }

  async function saveToLibrary(blob,title){
    try{
      var db=await openLibraryDb();
      await new Promise(function(resolve,reject){
        var tx=db.transaction('videos','readwrite');
        tx.objectStore('videos').put({id:crypto.randomUUID(),blob:blob,title:title||'ClipForge Video',created:Date.now()});
        tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};
      });
      db.close();
    }catch(error){console.warn('Video-Bibliothek:',error);}
  }

  async function loadLibrary(){
    var grid=document.getElementById('libraryGrid');
    if(!grid)return;
    try{
      var db=await openLibraryDb();
      var items=await new Promise(function(resolve,reject){
        var tx=db.transaction('videos','readonly'), req=tx.objectStore('videos').getAll();
        req.onsuccess=function(){resolve(req.result.sort(function(a,b){return b.created-a.created;}));};
        req.onerror=function(){reject(req.error);};
      });
      db.close();
      grid.querySelectorAll('.generated-video-card').forEach(function(x){x.remove();});
      items.forEach(function(item){
        var url=URL.createObjectURL(item.blob);
        var card=document.createElement('div');
        card.className='video-card generated-video-card';
        card.innerHTML='<div class="card-video-wrap"><video src="'+url+'" muted playsinline controls preload="metadata"></video></div><strong>'+String(item.title||'ClipForge Video').replace(/[&<>]/g,'')+'</strong><small>Gerendert · '+new Date(item.created).toLocaleDateString('de-DE')+' · <a href="'+url+'" download="clipforge-video.webm">Download</a></small>';
        grid.prepend(card);
      });
    }catch(error){console.warn('Bibliothek laden:',error);}
  }

  async function renderVideo(){
    var script=window.clipforgeLastScript;
    if(!script||!script.body){alert('Erst ein KI-Skript erstellen.');return;}
    var btn=document.getElementById('renderVideoBtn'), wrap=document.getElementById('videoPreviewWrap');
    var video=document.getElementById('videoPreview'), download=document.getElementById('downloadVideoBtn');
    var demo=document.getElementById('demoPhone'), hint=document.getElementById('previewHint');
    if(btn){btn.disabled=true;btn.textContent='⏳ Stimme wird erstellt…';}

    try{
      var response=await fetch(API_BASE+'/api/tts',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:cleanText([script.hook,script.body,script.cta].join(' '))})
      });
      if(!response.ok){var e=await response.json().catch(function(){return {};});throw new Error(e.error||'Sprachgenerierung fehlgeschlagen');}
      var tts=await response.json(), audio=new Audio(tts.audio);audio.preload='auto';
      await new Promise(function(resolve,reject){
        audio.onloadedmetadata=resolve;audio.onerror=function(){reject(new Error('Audiodatei konnte nicht geladen werden'));};audio.load();
      });

      var duration=Math.max(5,Math.min(audio.duration||30,60));
      var canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
      var ctx=canvas.getContext('2d'), stream=canvas.captureStream(30);
      var AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) throw new Error('AudioContext wird nicht unterstützt');
      var audioCtx=new AC();await audioCtx.resume();
      var source=audioCtx.createMediaElementSource(audio);
      var audioDest=audioCtx.createMediaStreamDestination();source.connect(audioDest);
      var combined=new MediaStream(stream.getVideoTracks().concat(audioDest.stream.getAudioTracks()));
      var types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'], mime='';
      for(var m=0;m<types.length;m++){if(MediaRecorder.isTypeSupported(types[m])){mime=types[m];break;}}
      if(!mime) throw new Error('Dieser Browser unterstützt kein WebM-Recording');

      var recorder=new MediaRecorder(combined,{mimeType:mime,videoBitsPerSecond:7000000}), chunks=[];
      recorder.ondataavailable=function(ev){if(ev.data&&ev.data.size)chunks.push(ev.data);};
      if(btn)btn.textContent='🎬 Video wird gerendert…';
      recorder.start(250);

      await audio.play();
      await new Promise(function(resolve,reject){
        var start=performance.now();
        function frame(now){
          var t=(now-start)/1000;draw(ctx,script,t,duration);
          if(t>=duration){if(recorder.state!=='inactive')recorder.stop();resolve();return;}
          requestAnimationFrame(frame);
        }
        recorder.onerror=function(){reject(recorder.error||new Error('Videoaufnahme fehlgeschlagen'));};
        requestAnimationFrame(frame);
      });

      audio.pause();stream.getTracks().forEach(function(x){x.stop();});combined.getTracks().forEach(function(x){x.stop();});await audioCtx.close();

      var blob=new Blob(chunks,{type:mime});
      if(lastBlobUrl)URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl=URL.createObjectURL(blob);
      video.src=lastBlobUrl;wrap.classList.remove('hidden');demo.classList.add('hidden');
      hint.textContent='Fertiges 9:16-Video mit KI-Stimme und animierten Captions.';
      download.href=lastBlobUrl;download.download='clipforge-'+Date.now()+'.webm';
      localStorage.setItem('clipforge_last_video_meta',JSON.stringify({title:script.topic||'ClipForge Video',created:Date.now()}));
      await saveToLibrary(blob,script.topic||'ClipForge Video');
      await loadLibrary();
      var result=document.getElementById('buildResult');
      if(result)result.innerHTML+='<br><br><b>✅ Video fertig!</b> Vorschau oder Download starten.';
      if(btn)btn.textContent='🎬 Video erstellen';
    }catch(error){
      console.error(error);
      var result=document.getElementById('buildResult');
      if(result)result.innerHTML+='<br><br><b>⚠️ Video-Fehler:</b> '+String(error.message||error);
      if(btn)btn.textContent='🎬 Erneut versuchen';
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  function init(){
    var btn=document.getElementById('renderVideoBtn');
    if(btn)btn.addEventListener('click',renderVideo);
    loadLibrary();
    var newer=document.getElementById('newVideoBtn');
    if(newer)newer.addEventListener('click',function(){if(btn)btn.click();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();