(function(){
  var API_BASE=(window.CLIPFORGE_API_URL||localStorage.getItem('clipforge_api_url')||'https://desktop-tutorial-bkh1.onrender.com').replace(/\/$/,'');
  var lastBlobUrl=null;

  function clean(value){
    return String(value||'').replace(/[*_~#`]/g,'').replace(/\[[^\]]*\]/g,'').replace(/https?:\/\/\S+/g,'').replace(/\\/g,'').replace(/\s+/g,' ').trim();
  }

  function sceneList(script){
    var scenes=Array.isArray(script.scenes)?script.scenes:[];
    scenes=scenes.map(function(s){
      return {narration:clean(s.narration),on_screen:clean(s.on_screen),visual:clean(s.visual)};
    }).filter(function(s){return s.narration;});
    if(!scenes.length){
      scenes=[
        {narration:clean(script.hook),on_screen:'Das ist der Einstieg',visual:'Hook'},
        {narration:clean(script.body),on_screen:'Die wichtigsten Punkte',visual:'Information'},
        {narration:clean(script.cta),on_screen:'Deine Meinung?',visual:'Call to Action'}
      ].filter(function(s){return s.narration;});
    }
    return scenes;
  }

  function wrap(ctx,text,maxWidth,maxLines){
    var words=String(text).split(/\s+/),lines=[],line='';
    for(var i=0;i<words.length;i++){
      var test=line?line+' '+words[i]:words[i];
      if(ctx.measureText(test).width>maxWidth && line){
        lines.push(line);line=words[i];
        if(lines.length===maxLines-1) break;
      }else line=test;
    }
    if(line&&lines.length<maxLines)lines.push(line);
    return lines;
  }

  function rr(ctx,x,y,w,h,r){
    var q=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();
  }

  function visualKind(text){
    var s=String(text).toLowerCase();
    if(/geld|preis|sparen|money|€|kosten/.test(s))return'money';
    if(/website|web|browser|seite/.test(s))return'web';
    if(/tool|app|software|programm/.test(s))return'app';
    if(/chart|zahlen|statistik|analyse|trend/.test(s))return'chart';
    if(/student|schule|lernen|study/.test(s))return'study';
    if(/warn|fehler|problem|achtung/.test(s))return'warning';
    return'default';
  }

  function drawVisual(ctx,kind,t){
    var cx=540,cy=720;
    ctx.save();
    var pulse=1+Math.sin(t*2)*.025;
    ctx.translate(cx,cy);ctx.scale(pulse,pulse);
    if(kind==='web'){
      rr(ctx,-390,-210,780,470,28);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();
      rr(ctx,-360,-175,720,55,16);ctx.fillStyle='rgba(255,255,255,.08)';ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='700 26px Inter,Arial';ctx.fillText('●  ●  ●',-325,-137);
      for(var a=0;a<3;a++){rr(ctx,-320+a*220,-70,170,210,22);ctx.fillStyle='rgba(167,139,250,'+(0.12+a*.04)+')';ctx.fill();}
    }else if(kind==='app'){
      rr(ctx,-190,-290,380,580,46);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();
      ctx.fillStyle='#b79cff';ctx.beginPath();ctx.arc(0,-190,50,0,Math.PI*2);ctx.fill();
      for(var b=0;b<4;b++){rr(ctx,-130,-90+b*95,260,66,18);ctx.fillStyle='rgba(255,255,255,.10)';ctx.fill();}
    }else if(kind==='chart'){
      rr(ctx,-390,-240,780,500,32);ctx.fillStyle='rgba(255,255,255,.10)';ctx.fill();
      ctx.strokeStyle='#a78bfa';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-300,130);ctx.lineTo(-180,70);ctx.lineTo(-50,95);ctx.lineTo(85,-40);ctx.lineTo(180,0);ctx.lineTo(300,-150);ctx.stroke();
      for(var c=0;c<6;c++){ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(-300+c*120,155,70,6);}
    }else if(kind==='money'){
      rr(ctx,-250,-180,500,360,36);ctx.fillStyle='rgba(16,185,129,.18)';ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=4;ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='900 170px Inter,Arial';ctx.textAlign='center';ctx.fillText('€',0,60);ctx.textAlign='left';
    }else if(kind==='study'){
      rr(ctx,-340,-230,680,430,28);ctx.fillStyle='rgba(96,165,250,.15)';ctx.fill();
      rr(ctx,-280,-170,560,310,20);ctx.fillStyle='rgba(255,255,255,.10)';ctx.fill();
      for(var d=0;d<4;d++){ctx.fillStyle='rgba(255,255,255,.20)';ctx.fillRect(-235,-105+d*65,430,12);}
    }else if(kind==='warning'){
      ctx.fillStyle='rgba(249,115,22,.22)';ctx.beginPath();ctx.moveTo(0,-290);ctx.lineTo(300,250);ctx.lineTo(-300,250);ctx.closePath();ctx.fill();
      ctx.fillStyle='#fff';ctx.font='900 180px Inter,Arial';ctx.textAlign='center';ctx.fillText('!',0,145);ctx.textAlign='left';
    }else{
      for(var e=0;e<3;e++){rr(ctx,-300+e*220,-145,170,290,28);ctx.fillStyle='rgba(139,92,246,'+(0.13+e*.04)+')';ctx.fill();}
    }
    ctx.restore();
  }

  function drawFrame(ctx,script,scene,t,duration,index,total){
    var progress=Math.min(t/duration,1);
    var bg=ctx.createLinearGradient(0,0,1080,1920);bg.addColorStop(0,'#09051a');bg.addColorStop(.55,'#17102b');bg.addColorStop(1,'#05060a');
    ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1920);
    for(var i=0;i<4;i++){
      var x=540+Math.sin(t*.3+i*1.8)*470,y=250+i*420+Math.cos(t*.22+i)*90,r=180+i*30;
      var g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(139,92,246,.18)');g.addColorStop(1,'rgba(139,92,246,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='rgba(255,255,255,.78)';ctx.font='800 28px Inter,Arial';ctx.fillText('✦ CLIPFORGE AI',70,90);
    ctx.fillStyle='#b79cff';ctx.font='800 20px Inter,Arial';ctx.fillText('SCENE '+String(index+1)+' / '+String(total),70,137);
    drawVisual(ctx,visualKind(scene.visual),t);
    rr(ctx,55,1125,970,535,38);ctx.fillStyle='rgba(4,5,9,.82)';ctx.fill();
    ctx.fillStyle='#b79cff';ctx.font='800 22px Inter,Arial';ctx.fillText(scene.on_screen||'ClipForge',90,1195);
    ctx.fillStyle='#fff';ctx.font='800 54px Inter,Arial';ctx.textAlign='center';
    var lines=wrap(ctx,scene.narration,830,4);for(var j=0;j<lines.length;j++)ctx.fillText(lines[j],540,1295+j*68);ctx.textAlign='left';
    ctx.fillStyle='rgba(255,255,255,.38)';ctx.font='500 22px Inter,Arial';ctx.fillText('AI-GENERATED • 9:16',70,1840);
    rr(ctx,70,1775,940,8,8);ctx.fillStyle='rgba(255,255,255,.13)';ctx.fill();rr(ctx,70,1775,940*progress,8,8);ctx.fillStyle='#a78bfa';ctx.fill();
  }

  function dataUrlToBlob(dataUrl){
    var parts=String(dataUrl).split(',');
    var mime=(parts[0].match(/data:([^;]+)/)||[])[1]||'audio/mpeg';
    var binary=atob(parts[1]||'');var bytes=new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:mime});
  }

  async function renderVideo(){
    var script=window.clipforgeLastScript;
    if(!script||!script.body){
      var missing=document.getElementById('buildResult');
      if(missing){missing.classList.remove('hidden');missing.innerHTML='<b>⚠️ Kein Skript vorhanden</b><br><span>Erstelle zuerst ein KI-Skript.</span>';}
      return;
    }
    var scenes=sceneList(script);
    var btn=document.getElementById('renderVideoBtn'),wrap=document.getElementById('videoPreviewWrap'),video=document.getElementById('videoPreview'),download=document.getElementById('downloadVideoBtn'),demo=document.getElementById('demoPhone'),hint=document.getElementById('previewHint');
    if(btn){btn.disabled=true;btn.textContent='⏳ KI-Stimme wird erstellt…';}
    try{
      var narration=scenes.map(function(s){return s.narration;}).join(' ');
      var response=await fetch(API_BASE+'/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:narration})});
      if(!response.ok){var er=await response.json().catch(function(){return {};});throw new Error(er.error||'Sprachgenerierung fehlgeschlagen');}
      var tts=await response.json();
      if(!tts.audio)throw new Error('Keine Audiodaten erhalten');
      var audioBlob=dataUrlToBlob(tts.audio),audioUrl=URL.createObjectURL(audioBlob),audio=new Audio(audioUrl);audio.preload='auto';
      await new Promise(function(resolve,reject){audio.onloadedmetadata=resolve;audio.onerror=function(){reject(new Error('Die erzeugte Stimme konnte nicht geladen werden'));};audio.load();});
      var duration=Math.max(6,Math.min(audio.duration||30,60));
      var weights=scenes.map(function(s){return Math.max(1,s.narration.split(/\s+/).length);}),sum=weights.reduce(function(a,b){return a+b;},0)||1,elapsed=0;
      var timeline=scenes.map(function(s,i){var d=duration*weights[i]/sum,item={scene:s,start:elapsed,end:elapsed+d};elapsed+=d;return item;});
      var canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;var ctx=canvas.getContext('2d');
      var canvasStream=canvas.captureStream(30),AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('AudioContext wird nicht unterstützt');
      var audioCtx=new AC();await audioCtx.resume();var source=audioCtx.createMediaElementSource(audio),audioDest=audioCtx.createMediaStreamDestination();
      source.connect(audioDest);source.connect(audioCtx.destination);
      var combined=new MediaStream(canvasStream.getVideoTracks().concat(audioDest.stream.getAudioTracks()));
      var types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'],mime='';
      for(var m=0;m<types.length;m++){if(MediaRecorder.isTypeSupported(types[m])){mime=types[m];break;}}
      if(!mime)throw new Error('Dieser Browser unterstützt kein WebM-Video');
      var recorder=new MediaRecorder(combined,{mimeType:mime,videoBitsPerSecond:7000000}),chunks=[];recorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
      recorder.start(250);if(btn)btn.textContent='🎬 Video wird gebaut…';await audio.play();
      await new Promise(function(resolve,reject){
        var start=performance.now();
        function frame(now){
          var t=(now-start)/1000,current=timeline[timeline.length-1];
          for(var q=0;q<timeline.length;q++){if(t>=timeline[q].start&&t<timeline[q].end){current=timeline[q];break;}}
          drawFrame(ctx,script,current.scene,t-current.start,current.end-current.start,timeline.indexOf(current),timeline.length);
          if(t>=duration){if(recorder.state!=='inactive')recorder.stop();resolve();return;}requestAnimationFrame(frame);
        }
        recorder.onerror=function(){reject(recorder.error||new Error('Videoaufnahme fehlgeschlagen'));};requestAnimationFrame(frame);
      });
      audio.pause();audio.currentTime=0;canvasStream.getTracks().forEach(function(x){x.stop()});combined.getTracks().forEach(function(x){x.stop()});await audioCtx.close();URL.revokeObjectURL(audioUrl);
      var blob=new Blob(chunks,{type:mime});if(lastBlobUrl)URL.revokeObjectURL(lastBlobUrl);lastBlobUrl=URL.createObjectURL(blob);
      video.src=lastBlobUrl;wrap.classList.remove('hidden');demo.classList.add('hidden');hint.textContent='Fertiges 9:16-Video mit fünf Szenen, KI-Stimme, Captions und animierten Visuals.';
      download.href=lastBlobUrl;download.download='clipforge-'+Date.now()+'.webm';
      if(typeof saveToLibrary==='function')await saveToLibrary(blob,script.topic||'ClipForge Video');
      if(typeof loadLibrary==='function')await loadLibrary();
      var result=document.getElementById('buildResult');if(result)result.innerHTML+='<br><br><b>✅ Video fertig!</b> Mehrere Szenen + KI-Stimme wurden gerendert.';
      if(btn)btn.textContent='🎬 Video erstellen';
    }catch(error){
      console.error(error);var result=document.getElementById('buildResult');if(result)result.innerHTML+='<br><br><b>⚠️ Video-Fehler:</b> '+String(error.message||error);if(btn)btn.textContent='🎬 Erneut versuchen';
    }finally{if(btn)btn.disabled=false;}
  }

  function init(){
    try{var saved=localStorage.getItem('clipforge_last_script');if(saved&&!window.clipforgeLastScript)window.clipforgeLastScript=JSON.parse(saved);}catch(e){}
    var btn=document.getElementById('renderVideoBtn');if(btn)btn.addEventListener('click',renderVideo);
    if(typeof loadLibrary==='function')loadLibrary();
    var newer=document.getElementById('newVideoBtn');if(newer)newer.addEventListener('click',function(){if(btn)btn.click()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();