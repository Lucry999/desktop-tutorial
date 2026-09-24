const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('.nav-item[data-view]')];
function showView(id){views.forEach(v=>v.classList.toggle('active',v.id===id));nav.forEach(n=>n.classList.toggle('active',n.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));
nav.forEach(n=>n.addEventListener('click',()=>showView(n.dataset.view)));

const toast=(msg)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)};

document.getElementById('ideaBtn').addEventListener('click',()=>{
 const input=document.getElementById('ideaInput'); const result=document.getElementById('ideaResult');
 const topic=input.value.trim()||'AI tools for students';
 result.innerHTML='<b>✨ AI idea:</b> “3 AI tools that save students hours every week”<br><span>Hook: “Stop doing these 3 things manually…” · 38 sec · Fast & energetic</span>';
 result.classList.remove('hidden'); toast('Video idea generated');
});

document.getElementById('buildBtn').addEventListener('click',()=>{
 const topic=document.getElementById('topic').value.trim()||'Your next viral idea';
 const result=document.getElementById('buildResult');
 result.innerHTML='<b>HOOK</b><br>“Stop scrolling — '+topic+' is about to get a lot easier.”<br><br><b>BODY</b><br>Quick cuts, one clear point per scene, bold captions and a strong visual every 2–3 seconds.<br><br><b>CTA</b><br>“Follow for more useful AI shortcuts.”';
 result.classList.remove('hidden'); toast('Script generated — ready for rendering');
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
