const API_BASE = (window.CLIPFORGE_API_URL || localStorage.getItem('clipforge_api_url') || 'https://desktop-tutorial-bkh1.onrender.com').replace(/\/$/,'');
const API_ENDPOINT = API_BASE + '/api/generate';

const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('.nav-item[data-view]')];
function showView(id){views.forEach(v=>v.classList.toggle('active',v.id===id));nav.forEach(n=>n.classList.toggle('active',n.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));
nav.forEach(n=>n.addEventListener('click',()=>showView(n.dataset.view)));

function escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function normalizeText(value){
  if(value==null) return '';
  if(typeof value==='string') return value;
  if(Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join('\n');
  if(typeof value==='object') return value.text || value.content || value.value || Object.values(value).map(normalizeText).filter(Boolean).join('\n');
  return String(value);
}
const toast=(msg)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)};

async function apiError(response){
  const err=await response.json().catch(()=>({}));
  return new Error(err.error || ('API-Fehler ' + response.status));
}

document.getElementById('ideaBtn').addEventListener('click', async () => {
  const input=document.getElementById('ideaInput');
  const result=document.getElementById('ideaResult');
  const topic=input.value.trim() || 'AI tools für Schüler';
  result.classList.remove('hidden');
  result.innerHTML='<span>⏳ KI erstellt gerade eine Idee …</span>';
  try {
    const response=await fetch(API_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'idea',topic})});
    if(!response.ok) throw await apiError(response);
    const data=await response.json();
    const prompt = [
      data.title ? 'Erstelle ein TikTok-Video zum Thema: ' + normalizeText(data.title) : '',
      data.hook ? 'Starker Einstieg/Hook: ' + normalizeText(data.hook) : '',
      data.duration ? 'Zieldauer: ' + normalizeText(data.duration) : 'Zieldauer: 30–45 Sekunden',
      'Format: 9:16, schnelle und moderne TikTok-Inszenierung.',
      'Ziel: Zuschauer in den ersten Sekunden halten und verständlich informieren.'
    ].filter(Boolean).join('\n');
    const topicField=document.getElementById('topic');
    if(topicField) topicField.value=prompt;
    result.innerHTML='<b>✨ Prompt übernommen</b><br><span>Die KI-Idee wurde direkt in den Video-Builder eingesetzt.</span>';
    showView('create');
    toast('KI-Prompt übernommen');
  } catch(error) {
    result.innerHTML='<b>⚠️ KI-Fehler</b><br><span>'+escapeHtml(error.message||'Backend nicht erreichbar')+'</span>';
    toast(error.message||'Backend nicht erreichbar');
  }
});

document.getElementById('buildBtn').addEventListener('click', async () => {
  const topic=document.getElementById('topic').value.trim() || 'Eine spannende TikTok-Idee';
  const result=document.getElementById('buildResult');
  result.classList.remove('hidden');
  result.innerHTML='<span>⏳ KI schreibt dein Skript …</span>';
  try {
    const response=await fetch(API_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'script',topic,style:document.querySelector('.form-panel select')?.value||'Fast & energetic'})});
    if(!response.ok) throw await apiError(response);
    const data=await response.json();
    const hook=normalizeText(data.hook);
    const body=normalizeText(data.body);
    const cta=normalizeText(data.cta);
    result.innerHTML='<b>HOOK</b><br>'+escapeHtml(hook)+'<br><br><b>BODY</b><br>'+escapeHtml(body).replace(/\n/g,'<br>')+'<br><br><b>CTA</b><br>'+escapeHtml(cta);
    toast('KI-Skript erstellt');
  } catch(error) {
    result.innerHTML='<b>⚠️ KI-Fehler</b><br><span>'+escapeHtml(error.message||'Backend nicht erreichbar')+'</span>';
    toast(error.message||'Backend nicht erreichbar');
  }
});

document.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>{
 document.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));chip.classList.add('selected');
}));
document.querySelectorAll('.switch input').forEach(i=>i.addEventListener('change',()=>toast(i.checked?'Automation enabled':'Automation paused')));

const days=document.getElementById('days');
if(days){
 const events={24:'3 AI tools you need',25:'5 websites that feel illegal',26:'How I save money with AI',28:'AI news in 30 sec',30:'Student AI hacks'};
 for(let i=1;i<=30;i++){const d=document.createElement('div');d.innerHTML='<span>'+i+'</span>'+(events[i]?'<span class="day-event">'+events[i]+'</span>':'');days.appendChild(d);}
}

const STORAGE_KEY='clipforge-projects-v1';
function saveProject(){
  const title=(document.getElementById('topic')?.value||'').trim();
  if(!title){ toast('Bitte zuerst ein Thema eingeben'); return; }
  const projects=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
  projects.unshift({title,status:'Entwurf',created:new Date().toLocaleDateString('de-DE')});
  localStorage.setItem(STORAGE_KEY,JSON.stringify(projects.slice(0,20)));
  toast('Entwurf gespeichert');
}

const buildButton=document.getElementById('buildBtn');
if(buildButton){
  const save=document.createElement('button');
  save.className='secondary wide';
  save.type='button';
  save.textContent='＋ Als Entwurf speichern';
  buildButton.insertAdjacentElement('afterend',save);
  save.addEventListener('click',saveProject);
}

document.querySelectorAll('.primary').forEach(button=>{
  if(button.dataset.go==='create') return;
  button.addEventListener('click',()=>{
    if(/automation|automatisierung/i.test(button.textContent)) toast('Automatisierungs-Editor wird vorbereitet');
  });
});

async function checkApiStatus(){
  const el=document.getElementById('apiStatus');
  if(!el) return;
  try{
    const response=await fetch(API_BASE + '/health',{cache:'no-store'});
    if(!response.ok) throw new Error('offline');
    const data=await response.json();
    if(data.configured){
      el.className='api-status online';
      el.innerHTML='<span></span> KI verbunden';
    }else{
      el.className='api-status offline';
      el.innerHTML='<span></span> KI-Key fehlt';
    }
  }catch{
    el.className='api-status offline';
    el.innerHTML='<span></span> KI offline';
  }
}
checkApiStatus();
setInterval(checkApiStatus,30000);
