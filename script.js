
const POOL_LIMIT = 1100;
let level = 1, xp = 0, nextXp = calcNext(level);
let tasks = [], pool = [], pokedex = [];

function calcNext(l){ return Math.floor(100 * Math.pow(1.18, l-1) + l*10); }
function $(id){ return document.getElementById(id); }

function init(){
  // load saved state
  const s = localStorage.getItem('pt_state'); if(s){ const o = JSON.parse(s); level=o.level||1; xp=o.xp||0; pokedex=o.pokedex||[]; }
  updateUI();
  loadPool();
  // event bindings
  $('addBtn').addEventListener('click', addTask);
  $('taskInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(); });
  $('debugXp').addEventListener('click', ()=>grantXp(50));
  $('exportBtn').addEventListener('click', exportSnapshot);
}

function save(){ localStorage.setItem('pt_state', JSON.stringify({level,xp,pokedex})); }

async function loadPool(){
  try{
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=2000`);
    if(!res.ok) throw new Error('pokeapi failed');
    const data = await res.json();
    pool = data.results.slice(0, POOL_LIMIT).map(r=>({name:r.name,url:r.url}));
    if(pool.length < POOL_LIMIT){ for(let i=pool.length;i<POOL_LIMIT;i++) pool.push({name:`bestario-${i+1}`, url:null}); }
  }catch(e){
    // fallback placeholders
    pool = Array.from({length:POOL_LIMIT}).map((_,i)=>({name:`bestario-${i+1}`, url:null}));
    console.warn('Pool fallback', e);
  } finally { updateUI(); }
}

function updateUI(){
  $('level').innerText = level;
  $('xp').innerText = xp;
  $('next').innerText = nextXp;
  $('xpBar').style.width = Math.min(100, Math.round((xp/nextXp)*100)) + '%';
  renderTasks(); renderDex();
  $('poolCount').innerText = 'Pool: ' + (pool.length || 0);
  save();
}

function addTask(){
  const v = $('taskInput').value.trim(); if(!v) return; tasks.push({id:Date.now(),title:v,xp:20}); $('taskInput').value=''; renderTasks();
}

function renderTasks(){
  const el = $('taskList'); el.innerHTML='';
  tasks.forEach((t,i)=>{
    const div = document.createElement('div'); div.className='task';
    div.innerHTML = `<div>${t.title}</div><div><button onclick="complete(${i})">Completar</button></div>`;
    el.appendChild(div);
  });
}

async function complete(i){
  const t = tasks[i]; tasks.splice(i,1); renderTasks();
  await grantXp(t.xp);
}

async function grantXp(amount){
  xp += amount; let leveled=false;
  while(xp >= nextXp){
    xp -= nextXp; level++; nextXp = calcNext(level); leveled=true;
    await grantRandomPokemon();
  }
  updateUI();
  if(leveled) showLevelUpOverlay();
}

async function grantRandomPokemon(){
  if(!pool || pool.length===0) return;
  const available = pool.filter(p => !pokedex.find(k=>k.name===p.name));
  if(available.length===0) return;
  const chosen = available[Math.floor(Math.random()*available.length)];
  let sprite = null, id = null;
  if(chosen.url){
    try{
      const parts = chosen.url.split('/').filter(Boolean); id = parts[parts.length-1];
      const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`); if(r.ok){ const pj = await r.json(); sprite = pj.sprites.front_default || pj.sprites.other?.['official-artwork']?.front_default || null; }
    }catch(e){ console.warn('sprite fetch failed', e); }
  }
  playSound('capture.wav');
  // check evolution relative to last caught
  let triggeredEvo = false;
  if(pokedex.length>0 && chosen.url){
    try{
      const last = pokedex[pokedex.length-1];
      const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
      if(speciesRes.ok){
        const speciesJson = await speciesRes.json();
        const chainUrl = speciesJson.evolution_chain?.url;
        if(chainUrl){
          const chainRes = await fetch(chainUrl);
          if(chainRes.ok){
            const chainJson = await chainRes.json();
            const names = []; (function walk(node){ if(!node) return; names.push(node.species.name); if(node.evolves_to) node.evolves_to.forEach(n=>walk(n)); })(chainJson.chain);
            const idxLast = names.indexOf(last.name); const idxChosen = names.indexOf(chosen.name);
            if(idxLast!==-1 && idxChosen!==-1 && idxLast < idxChosen){
              // evolution detected
              await showEvolution(last.sprite, sprite, last.name, chosen.name);
              triggeredEvo = true;
            }
          }
        }
      }
    }catch(e){ console.warn('evo detect fail', e); }
  }
  pokedex.push({name:chosen.name, sprite:sprite, id:id});
  updateUI();
  if(!triggeredEvo) showLevelUpOverlay(chosen.name, sprite);
}

function renderDex(){
  const el = $('dex'); el.innerHTML='';
  pokedex.forEach(p=>{
    const c = document.createElement('div'); c.className='card'; c.innerHTML = `<img src="${p.sprite || placeholder(p.name)}" alt="${p.name}"><div>${capitalize(p.name)}</div>`; el.appendChild(c);
  });
}

function placeholder(name){ const initials = name.split('-').map(s=>s[0]).join('').toUpperCase().slice(0,3); return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='100%' height='100%' fill='#f3e8ff'/><text x='50%' y='50%' dy='0.35em' font-size='26' text-anchor='middle' fill='#6d28d9' font-family='Verdana'>${initials}</text></svg>`)}`; }
function capitalize(s){ return s? s.charAt(0).toUpperCase()+s.slice(1):''; }

/* overlay and animations */
function showLevelUpOverlay(captured, sprite){ const overlay = $('overlay'); const box = $('lvlup'); overlay.style.display='flex'; box.classList.add('show'); $('lvlTitle').innerText = `Você subiu para o Nível ${level}!`; $('lvlBody').innerText = captured?`Você capturou: ${capitalize(captured)}`:'Subiu de nível!'; const area = $('evoArea'); area.innerHTML=''; if(captured){ const img = document.createElement('img'); img.src = sprite || placeholder(captured); img.style.width='96px'; area.appendChild(img); } $('closeLvl').onclick = ()=>{ box.classList.remove('show'); overlay.style.display='none'; playSound('levelup.wav'); } }
async function showEvolution(oldSprite, newSprite, oldName, newName){
  return new Promise(resolve=>{
    const overlay=$('overlay'), box=$('lvlup'); overlay.style.display='flex'; box.classList.add('show'); $('lvlTitle').innerText='Evolução!'; $('lvlBody').innerText=`${capitalize(oldName)} evoluiu para ${capitalize(newName)}!`; const area=$('evoArea'); area.innerHTML=''; const stage=document.createElement('div'); stage.style.display='flex'; stage.style.alignItems='center'; stage.style.gap='12px'; const imgOld=document.createElement('img'); imgOld.src=oldSprite||placeholder(oldName); imgOld.className='evo-sprite'; const arrow=document.createElement('div'); arrow.innerHTML='&#10132;'; arrow.style.fontSize='28px'; const imgNew=document.createElement('img'); imgNew.src=newSprite||placeholder(newName); imgNew.className='evo-sprite'; stage.appendChild(imgOld); stage.appendChild(arrow); stage.appendChild(imgNew); area.appendChild(stage); setTimeout(()=>{ imgOld.classList.add('grow'); },80); setTimeout(()=>{ playSound('capture.wav'); },700); setTimeout(()=>{ imgOld.classList.remove('grow'); imgNew.classList.add('grow'); },1050); setTimeout(()=>{ $('closeLvl').onclick = ()=>{ box.classList.remove('show'); overlay.style.display='none'; resolve(); }; },1400); });
}

/* audio playback for included wavs */
function playSound(filename){
  try{
    const a = new Audio(filename); a.play().catch(()=>{});
  }catch(e){ console.warn('sound',e); }
}

/* export snapshot */
function exportSnapshot(){ const doc = `<!doctype html><html><body><h1>Snapshot</h1><p>Level: ${level} XP: ${xp}/${nextXp}</p></body></html>`; const b = new Blob([doc], {type:'text/html'}); const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = 'poketarefas_snapshot.html'; a.click(); URL.revokeObjectURL(url); }

function initUI(){
  document.body.insertAdjacentHTML('beforeend', `
  <div class="container">
    <div class="header"><div><h2 class="title">PokéTarefas</h2><div class="muted">Capture criaturas ao subir de nível</div></div><div class="status">Nível <strong id="level">1</strong><div class="small">XP: <span id="xp">0</span> / <span id="next">100</span></div><div class="xp-wrap"><div id="xpBar" class="xp-bar"></div></div></div></div>
    <div class="main">
      <section class="tasks">
        <div class="controls"><input id="taskInput" placeholder="Nova tarefa..."><button id="addBtn">Adicionar</button></div>
        <div id="taskList"></div>
        <div style="margin-top:10px" class="controls"><button id="debugXp">+50 XP (teste)</button><button id="exportBtn">Exportar HTML</button></div>
        <div class="footer">Pool tenta usar PokéAPI; fallback a placeholders se offline.</div>
      </section>
      <aside class="pokedex">
        <div style="display:flex;align-items:center;justify-content:space-between"><strong>Pokédex Obtida</strong><div id="poolCount" class="small">Pool: 0</div></div>
        <div id="dex" class="grid"></div>
      </aside>
    </div>
  </div>
  <div class="overlay" id="overlay" style="display:none"><div class="lvlup" id="lvlup"><div><div id="lvlTitle"></div><div id="lvlBody"></div><div id="evoArea" style="margin-top:12px"></div></div><div style="margin-top:12px;text-align:right"><button id="closeLvl">Fechar</button></div></div></div>
  `);
  init();
}

window.addEventListener('DOMContentLoaded', initUI);
