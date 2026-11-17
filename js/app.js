"use strict";
/* ============ store (schema v2) ============ */
const KEY="hanziflow.v2",KEY_V1="hanziflow.v1",SCHEMA=2;
const {DAY,dayStart,todayStr,shuffle,stageOf}=window.HFSRS;
const newSRS=window.HFSRS.newSRS;
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}

const defaultState=()=>({
  version:SCHEMA,decks:[],cards:[],
  settings:{target:20,newCap:15,theme:"light"},
  streak:{count:0,last:null},
  reviews:{}
});
let S=defaultState();
let loadProblem=null;
function normalizeState(p){
  const d=defaultState();
  return Object.assign(d,p,{version:SCHEMA,
    decks:Array.isArray(p.decks)?p.decks:[],
    cards:Array.isArray(p.cards)?p.cards:[],
    settings:Object.assign(d.settings,p.settings||{}),
    streak:Object.assign(d.streak,p.streak||{}),
    reviews:p.reviews||{}});
}
function migrateCard(c){
  if(c.confidence)return c;
  const m=Object.assign({},c,{source:c.auto?"generated":"legacy",confidence:c.auto?"low":"high",
    needsReview:!!c.auto&&!c.m,dictionaryVersion:"1.0",exampleSource:c.s&&c.s.z?"legacy":""});
  if(c.auto)m.h=null; // v1 guessed HSK 3 for unknown words
  delete m.auto;
  return m;
}
function migrateV1toV2(p){
  const s=normalizeState(p);
  s.cards=s.cards.map(migrateCard);
  return s;
}
function load(){
  const rawV2=localStorage.getItem(KEY);
  const rawV1=localStorage.getItem(KEY_V1);
  const raw=rawV2||rawV1;
  if(!raw)return;
  try{
    const p=JSON.parse(raw);
    S=rawV2?normalizeState(p):migrateV1toV2(p);
    if(!rawV2)localStorage.setItem(KEY,JSON.stringify(S)); // v1 stays untouched for one release
  }catch(e){
    console.warn("[HanziFlow] saved data could not be read",e);
    localStorage.setItem("hanziflow.corrupt-"+Date.now(),raw);
    loadProblem="Your saved data could not be read. A raw copy was kept in this browser; restore a backup from Settings if you have one.";
  }
}
const syncHashes={};
function save(){
  window.HFSync.stamp(S,syncHashes);
  scheduleSync();
  try{localStorage.setItem(KEY,JSON.stringify(S))}
  catch(e){console.warn("[HanziFlow] save failed",e);toast("Could not save — browser storage is full")}
}

/* ============ tone colours ============ */
const TONE_MARKS={"ā":1,"á":2,"ǎ":3,"à":4,"ē":1,"é":2,"ě":3,"è":4,"ī":1,"í":2,"ǐ":3,"ì":4,"ō":1,"ó":2,"ǒ":3,"ò":4,"ū":1,"ú":2,"ǔ":3,"ù":4,"ǖ":1,"ǘ":2,"ǚ":3,"ǜ":4,"Ā":1,"Á":2,"Ǎ":3,"À":4,"Ē":1,"É":2,"Ě":3,"È":4,"Ī":1,"Í":2,"Ǐ":3,"Ì":4,"Ō":1,"Ó":2,"Ǒ":3,"Ò":4,"Ū":1,"Ú":2,"Ǔ":3,"Ù":4,"Ǖ":1,"Ǘ":2,"Ǚ":3,"Ǜ":4};
function toneOfSyllable(s){for(const ch of s){if(TONE_MARKS[ch])return TONE_MARKS[ch]}return 0}
const PYN_VOW=new Set([..."aeiouvüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜAEIOUVÜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ"]);
const PYN_INI2=new Set(["zh","ch","sh","Zh","Ch","Sh","ZH","CH","SH"]);
const PYN_INI1=new Set([..."bpmfdtnlgkhjqxrzcsywBPMFDTNLGKHJQXRZCSYW"]);
function splitSyllables(p){
  const out=[];
  for(const tok of String(p||"").replace(/[^\p{L}\s']/gu," ").trim().split(/[\s']+/).filter(Boolean)){
    const marks=[];for(let i=0;i<tok.length;i++)if(TONE_MARKS[tok[i]])marks.push(i);
    if(!marks.length){out.push(tok);continue}
    let start=0;
    for(let k=0;k<marks.length;k++){
      let j=marks[k];while(j>=start&&PYN_VOW.has(tok[j]))j--;
      let c=j;while(c>=start&&!PYN_VOW.has(tok[c]))c--;
      let s=start;
      const cl=tok.slice(c+1,j+1);
      if(c+1>start){
        if(cl.length>=2&&PYN_INI2.has(cl.slice(-2)))s=j-1;
        else if(cl.length>=1&&PYN_INI1.has(cl.slice(-1)))s=j;
      }
      let e=marks[k]+1;
      while(e<tok.length&&PYN_VOW.has(tok[e]))e++;
      if(/^[nN][gG]$/.test(tok.slice(e,e+2)))e+=2;
      else if(/^[nNrR]$/.test(tok[e]||"")&&(e+1>=tok.length||!PYN_VOW.has(tok[e+1])))e+=1;
      if(s>start)out.push(tok.slice(start,s));
      out.push(tok.slice(s,e));start=e;
    }
    if(start<tok.length)out.push(tok.slice(start));
  }
  return out.filter(Boolean);
}
const HANZI_RE=/[㐀-鿿豈-﫿]/;
/* One tone per hanzi. Falls back to pinyin-pro when the stored pinyin doesn't line up (这儿 → zhèr, etc). */
function tonesFor(text,pinyin){
  const count=[...text].filter(ch=>HANZI_RE.test(ch)).length;
  const syls=splitSyllables(pinyin);
  if(syls.length===count)return syls.map(toneOfSyllable);
  if(window.pinyinPro&&count){
    try{
      const arr=window.pinyinPro.pinyin(text,{toneType:"symbol",type:"array",nonZh:"removed"});
      if(arr.length===count)return arr.map(toneOfSyllable);
    }catch(e){console.warn("[HanziFlow] tone alignment failed",e)}
  }
  return syls.map(toneOfSyllable);
}
function colorHanzi(word,pinyin){
  word=String(word||"");
  const tones=tonesFor(word,pinyin);let i=0,out="";
  for(const ch of word){
    if(!HANZI_RE.test(ch)){out+=esc(ch);continue}
    const t=i<tones.length?tones[i]:0;
    out+=`<span class="t${t}">${esc(ch)}</span>`;i++;
  }
  return out;
}
function colorPinyin(pinyin){
  return String(pinyin||"").split(/([\p{L}']+)/u).map((part,i)=>
    i%2?splitSyllables(part).map(s=>`<span class="t${toneOfSyllable(s)}">${esc(s)}</span>`).join(""):esc(part)).join("");
}

/* ============ TTS ============ */
let zhVoice=null;
function pickVoice(){try{zhVoice=speechSynthesis.getVoices().find(v=>/zh(-|_)CN/i.test(v.lang))||speechSynthesis.getVoices().find(v=>v.lang&&v.lang.startsWith("zh"))||null}catch(e){console.warn(e)}}
if("speechSynthesis" in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function speak(text){
  if(!("speechSynthesis" in window)){toast("This browser doesn't support speech");return}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang="zh-CN";if(zhVoice)u.voice=zhVoice;u.rate=0.85;
  speechSynthesis.speak(u);
}

/* ============ helpers ============ */
function $(s){return document.querySelector(s)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove("show"),2600)}
const svg=(d)=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON={
  say:svg('<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500H4Z"/><path d="M15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>'),
  edit:svg('<path d="m5 16-1 4 4-1L19 8l-3-3L5 16Z"/>'),
  trash:svg('<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 13h9l1-13"/>'),
  redo:svg('<path d="M19 5v5h-5"/><path d="M19 10a7.500 7.500 0 1 0 .8 5"/>'),
  sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>'),
  write:'<span class="ico-zh zh" aria-hidden="true">写</span>',
  moon:svg('<path d="M20 14.500A8.500 8.500 0 0 1 9.500 4a8.500 8.500 0 1 0 10.500 10.500Z"/>')
};
let _pinyinWarned=false;
function hfPinyin(text,opts){
  if(!window.pinyinPro||typeof window.pinyinPro.pinyin!=="function"){
    if(!_pinyinWarned){_pinyinWarned=true;console.warn("[HanziFlow] hfPinyin: pinyin-pro unavailable");toast("Pinyin engine unavailable — check vendor/pinyin-pro.min.js")}
    return"";
  }
  try{return window.pinyinPro.pinyin(text,opts||{toneType:"symbol"})}
  catch(e){console.warn("[HanziFlow] hfPinyin failed for:",text,e);return""}
}
/* In-app dialog. Resolves with the chosen action's value, or null when dismissed. */
function hfDialog({title,body="",input=null,actions}){
  return new Promise(resolve=>{
    const root=$("#dialog-root");
    const prev=document.activeElement;
    root.innerHTML=`<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <h3 id="dlg-t">${esc(title)}</h3>${body?`<p class="muted">${esc(body)}</p>`:""}
      ${input!==null?`<input type="text" id="dlg-in" aria-label="${esc(title)}" value="${esc(input)}">`:""}
      <div class="acts">${actions.map((a,i)=>`<button class="btn ${esc(a.kind||"")}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>
    </div></div>`;
    const inp=$("#dlg-in");
    const close=v=>{root.innerHTML="";document.removeEventListener("keydown",onKey);if(prev&&prev.focus)prev.focus();resolve(v)};
    const onKey=e=>{if(e.key==="Escape")close(null)};
    document.addEventListener("keydown",onKey);
    root.querySelector(".overlay").onclick=e=>{if(e.target.classList.contains("overlay"))close(null)};
    root.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{
      const a=actions[+b.dataset.i];
      close(a.value===undefined?(inp?inp.value:true):a.value);
    });
    if(inp){inp.focus();inp.select()}else root.querySelector(".btn").focus();
  });
}
const hskOptions=sel=>`<option value="" ${sel==null?"selected":""}>HSK —</option>`+[1,2,3,4,5,6].map(h=>`<option value="${h}" ${sel===h?"selected":""}>HSK ${h}</option>`).join("");

/* ============ SRS wrappers ============ */
function gradeCard(c,q){window.HFSRS.schedule(c,q);recordReview(q>0);save()}
const nextIvlLabel=window.HFSRS.nextIvlLabel;
function recordReview(ok){
  const d=todayStr();
  if(!S.reviews[d])S.reviews[d]={n:0,ok:0};
  S.reviews[d].n++;if(ok)S.reviews[d].ok++;
  window.HFSRS.bumpStreak(S.streak,d,todayStr(new Date(Date.now()-DAY)));
}
function studyQueue(deckId){
  const pool=deckId?S.cards.filter(c=>c.deckId===deckId):S.cards;
  return window.HFSRS.buildQueue(pool,S.settings.newCap);
}

/* ============ router ============ */
const SCREENS=["home","weeks","week-detail","add","study","quiz","browse","stats","settings"];
let curScreen="home";
function placeBubble(){
  const on=$("nav.tabs button.on"),b=$(".bubble");
  if(!b)return;
  if(!on){b.style.width="0";return}
  b.style.width=on.offsetWidth+"px";b.style.height=on.offsetHeight+"px";
  const pad=parseFloat(getComputedStyle(b).left)||0;
  b.style.transform=`translate(${on.offsetLeft-pad}px,${on.offsetTop-(parseFloat(getComputedStyle(b).top)||0)}px)`;
}
window.addEventListener("resize",placeBubble);
function go(name){
  curScreen=name;
  SCREENS.forEach(s=>$("#scr-"+s).classList.toggle("on",s===name));
  document.querySelectorAll("nav.tabs button").forEach(b=>{
    const on=b.dataset.tab===name;b.classList.toggle("on",on);
    if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
  });
  placeBubble();
  if(name==="home")renderHome();
  if(name==="weeks")renderWeeks();
  if(name==="browse"){browseLimit=BROWSE_PAGE;renderBrowse()}
  if(name==="stats")renderStats();
  if(name==="settings")renderSettings();
  window.scrollTo(0,0);
  if(syncPending&&!syncBusyScreen())syncNow();
}
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{
  if(b.dataset.tab==="study")startStudy(null);else go(b.dataset.tab);
});
const ACTIONS={
  "study-all":()=>startStudy(null),
  "quiz-retry":el=>startQuiz(el.dataset.deck||null)
};
document.addEventListener("click",e=>{
  const g=e.target.closest("[data-go]");if(g)go(g.dataset.go);
  const a=e.target.closest("[data-action]");if(a&&ACTIONS[a.dataset.action])ACTIONS[a.dataset.action](a);
});

/* ============ home ============ */
function latestDeck(){
  if(!S.decks.length){const d={id:uid(),name:"Week 1",created:todayStr()};S.decks.push(d);save();return d}
  return S.decks[S.decks.length-1];
}
function renderHome(){
  const q=studyQueue(null);
  $("#home-due").textContent=q.length;
  $("#home-streak").textContent=S.streak.count;
  const rev=S.reviews[todayStr()]||{n:0};
  $("#home-today").textContent=rev.n;
  $("#home-learned").textContent=S.cards.filter(c=>c.srs&&c.srs.reps>0).length;
  $("#home-mastered").textContent=S.cards.filter(c=>stageOf(c)==="Mastered").length;
  $("#home-new").textContent=S.cards.filter(c=>stageOf(c)==="New").length;
  const tgt=S.settings.target,pct=Math.min(100,Math.round(rev.n/tgt*100));
  $("#home-target-label").textContent=rev.n+" / "+tgt;
  $("#home-target-bar").style.width=pct+"%";
  $("#home-target-track").setAttribute("aria-valuenow",pct);
  const btn=$("#home-study");
  btn.textContent=q.length?`Study Now (${q.length} cards)`:"Nothing due right now";
  btn.onclick=()=>startStudy(null);
  $("#home-add").onclick=()=>startPaste(latestDeck().id);
  $("#welcome-line").textContent=q.length?`你好! ${q.length} card${q.length===1?"":"s"} waiting`:"你好! You're all caught up";
  const hw=$("#home-weeks");
  hw.innerHTML=S.decks.slice(-3).reverse().map(weekItemHTML).join("")||`<div class="empty"><div class="big zh">汉</div>No decks yet. Tap “Add words” to create your first one.</div>`;
  bindWeekItems(hw);
}
function bindWeekItems(root){
  root.querySelectorAll(".week-item").forEach(el=>{
    el.onclick=()=>openWeek(el.dataset.id);
    el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openWeek(el.dataset.id)}};
  });
}
function weekItemHTML(w){
  const cs=S.cards.filter(c=>c.deckId===w.id);
  const mast=cs.length?Math.round(cs.filter(c=>stageOf(c)==="Mastered").length/cs.length*100):0;
  const num=(String(w.name).match(/\d+/)||["#"])[0];
  return`<div class="week-item" role="button" tabindex="0" data-id="${esc(w.id)}">
    <div class="badge">${esc(num)}</div>
    <div class="info"><div class="name">${esc(w.name)}</div>
    <div class="meta">${cs.length} cards · ${mast}% mastered</div>
    <div class="progress" role="progressbar" aria-label="Mastered" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${mast}"><i style="width:${mast}%"></i></div></div></div>`;
}
/* ============ decks ============ */
function renderWeeks(){
  const list=$("#week-list");
  list.innerHTML=S.decks.map(weekItemHTML).join("")||`<div class="empty"><div class="big zh">卡</div>No decks yet.<br>Tap “+ New Week” to start.</div>`;
  bindWeekItems(list);
}
$("#btn-new-week").onclick=()=>{
  const d={id:uid(),name:"Week "+(S.decks.length+1),created:todayStr()};
  S.decks.push(d);save();startPaste(d.id);
};
let curDeck=null;
function openWeek(id){
  curDeck=S.decks.find(d=>d.id===id);if(!curDeck)return go("weeks");
  const cs=S.cards.filter(c=>c.deckId===id);
  const stages={New:0,Learning:0,Reviewing:0,Mastered:0};cs.forEach(c=>stages[stageOf(c)]++);
  $("#week-detail").innerHTML=`
    <div class="card">
      <div class="row between">
        <h2 style="margin:0">${esc(curDeck.name)}</h2>
        <button class="icon-btn" id="wd-rename" aria-label="Rename deck" title="Rename">${ICON.edit}</button>
      </div>
      <div class="muted">Created ${esc(curDeck.created)} · ${cs.length} cards</div>
      <div style="margin:10px 0">
        <span class="stage New">New ${stages.New}</span> <span class="stage Learning">Learning ${stages.Learning}</span>
        <span class="stage Reviewing">Reviewing ${stages.Reviewing}</span> <span class="stage Mastered">Mastered ${stages.Mastered}</span>
      </div>
      <div class="row wrap" style="gap:8px;margin-top:8px">
        <button class="btn small" id="wd-study">Study this deck</button>
        <button class="btn small coral" id="wd-paste">+ Add words</button>
        <button class="btn small ghost" id="wd-quiz">Quiz</button>
        <button class="btn small danger" id="wd-del">Delete deck</button>
      </div>
    </div>
    <div class="card" style="padding:4px 14px">${cs.map(cardRowHTML).join("")||'<div class="empty">No cards yet — add words and they fill in automatically.</div>'}</div>`;
  go("week-detail");
  $("#wd-rename").onclick=async()=>{
    const n=await hfDialog({title:"Rename deck",input:curDeck.name,actions:[{label:"Save"},{label:"Cancel",kind:"ghost",value:null}]});
    if(n&&n.trim()){curDeck.name=n.trim();save();openWeek(id)}
  };
  $("#wd-study").onclick=()=>startStudy(id);
  $("#wd-quiz").onclick=()=>startQuiz(id);
  $("#wd-paste").onclick=()=>startPaste(id);
  $("#wd-del").onclick=async()=>{
    const yes=await hfDialog({title:`Delete “${curDeck.name}”?`,body:`Its ${cs.length} cards will be removed.`,actions:[{label:"Delete deck",kind:"danger",value:true},{label:"Keep it",kind:"ghost",value:false}]});
    if(yes){S.cards=S.cards.filter(c=>c.deckId!==id);S.decks=S.decks.filter(d=>d.id!==id);save();go("weeks")}
  };
  bindCardRows("#week-detail");
}
function cardRowHTML(c){
  const st=stageOf(c);
  return`<div class="card-row" role="button" tabindex="0" data-id="${esc(c.id)}">
    <div class="hw zh">${colorHanzi(c.w,c.p)}</div>
    <div class="det"><div class="p">${colorPinyin(c.p)}</div><div class="m">${esc(c.m)||'<i>no meaning yet</i>'}</div></div>
    <span class="stage ${st}">${st}</span>
    <button class="audio-btn small" data-write="${esc(c.w)}" data-write-py="${esc(c.p)}" aria-label="Stroke order for ${esc(c.w)}" title="Stroke order">${ICON.write}</button>
    <button class="audio-btn small" data-say="${esc(c.w)}" aria-label="Listen to ${esc(c.w)}">${ICON.say}</button>
  </div>`;
}
function bindCardRows(sel){
  document.querySelectorAll(sel+" .card-row").forEach(el=>{
    el.querySelector("[data-say]").onclick=e=>{e.stopPropagation();speak(e.currentTarget.dataset.say)};
    const open=()=>cardForm(S.cards.find(c=>c.id===el.dataset.id));
    el.onclick=open;
    el.onkeydown=e=>{if(e.target===el&&(e.key==="Enter"||e.key===" ")){e.preventDefault();open()}};
  });
}

/* ============ add words ============ */
const norm=w=>{const n=window.HF?HF.normalizeList(w):[];return n[0]||String(w||"").trim()};
function deckWordSet(deckId){return new Set(S.cards.filter(c=>c.deckId===deckId).map(c=>norm(c.w)))}
function rowFromLookup(r){
  const ex=r.ex&&r.ex[0]||{};
  return{w:r.word,p:r.p||"",m:r.m||"",h:r.h==null?null:r.h,s:{z:ex.z||"",y:ex.y||"",e:ex.e||""},
    confidence:r.confidence,sources:r.sources||[],notes:r.notes||[],heteronym:!!r.heteronym,pieced:!!r.pieced,
    exampleSource:ex.source||"",needsReview:!!r.needsReview,edited:false};
}
const CHIP={curated:"Curated",dictionary:"Dictionary",pinyin:"Pinyin only — needs review",missing:"Not found"};
function chipText(r,st){return st==="pinyin"&&r.m?"Pieced together — needs review":CHIP[st]}
function rowStatus(r){return window.HF?HF.statusOf({m:r.m,p:r.p,sources:r.sources,pieced:r.pieced&&!r.edited}):"missing"}
function addHeader(deckId,mode){
  const opts=S.decks.map(d=>`<option value="${esc(d.id)}" ${d.id===deckId?"selected":""}>${esc(d.name)}</option>`).join("");
  return`<div class="row between wrap"><h2 style="margin:0">Add words</h2>
      <select id="add-deck" aria-label="Deck" style="width:auto;max-width:55%">${opts}</select></div>
    <div class="seg" role="tablist">
      ${[["list","Word list"],["text","Free text"],["manual","Manual"]].map(([k,l])=>`<button role="tab" aria-selected="${k===mode}" class="${k===mode?"on":""}" data-mode="${k}">${l}</button>`).join("")}
    </div>`;
}
function bindAddHeader(deckId,keep){
  const deck=()=>$("#add-deck").value;
  $("#add-flow").querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{
    if(b.dataset.mode==="list")startPaste(deck(),keep&&keep());
    else if(b.dataset.mode==="text")startFreeText(deck(),keep&&keep());
    else cardForm(null,deck());
  });
  return deck;
}
function leaveAdd(deckId){if(deckId&&S.decks.some(d=>d.id===deckId))openWeek(deckId);else go("home")}
function startPaste(deckId,initial){
  $("#add-flow").innerHTML=`<div class="card">${addHeader(deckId,"list")}
      <textarea id="paste-box" class="zh" aria-label="Word list" placeholder="Paste in any format:&#10;苹果&#10;shui guo&#10;1. 环境&#10;保护，经济；牛奶&#10;图书馆  túshūguǎn  library&#10;圖書館">${esc(initial||"")}</textarea>
      <div class="detected" id="paste-count" aria-live="polite"></div>
      <div id="pinyin-picks"></div>
      <button class="btn" id="btn-lookup">Auto-fill →</button>
      <div style="height:8px"></div>
      <button class="btn ghost" id="btn-add-cancel">Cancel</button>
    </div>`;
  go("add");
  const deck=bindAddHeader(deckId,()=>$("#paste-box").value);
  const box=$("#paste-box");
  const words=()=>HF.normalizeList(box.value);
  const count=()=>{const n=words().length;$("#paste-count").innerHTML=n?`<b>${n}</b> word${n===1?"":"s"} detected`:"Pinyin, meaning, HSK level and an example fill in automatically."};
  let queries=[];
  async function renderPicks(){
    queries=HF.latinQueries(box.value);
    const wrap=$("#pinyin-picks");
    if(!queries.length){wrap.innerHTML="";return}
    await HF.ensureExtra();
    if(!$("#pinyin-picks"))return;
    wrap.innerHTML=queries.map((q,qi)=>{
      const hits=HF.search(q);
      return`<div class="pick-group"><div class="muted">${hits.length?`Which word do you mean by <b>${esc(q)}</b>?`:`Nothing found for <b>${esc(q)}</b>. Check the spelling.`}</div>
        <div class="suggest">${hits.map(h=>`<button type="button" data-q="${qi}" data-word="${esc(h.word)}"><span class="zh">${esc(h.word)}</span> <span class="muted">${esc(h.p)} · ${esc(h.m)}</span></button>`).join("")}</div></div>`;
    }).join("");
    wrap.querySelectorAll("[data-word]").forEach(b=>b.onclick=()=>{
      box.value=box.value.replace(queries[+b.dataset.q],b.dataset.word);
      count();renderPicks();box.focus();
    });
  }
  let pickTimer=null;
  box.oninput=()=>{count();clearTimeout(pickTimer);pickTimer=setTimeout(renderPicks,250)};
  count();renderPicks();box.focus();
  $("#btn-add-cancel").onclick=()=>leaveAdd(deck());
  $("#btn-lookup").onclick=()=>{
    const list=words();
    if(HF.latinQueries(box.value).length)return toast("Tap the word you mean in the list below");
    if(!list.length)return toast("Type or paste some words first");
    if(HF.lastWarning){toast(HF.lastWarning);HF.lastWarning=null}
    runEnrich(deck(),list);
  };
}
function startFreeText(deckId,initial){
  $("#add-flow").innerHTML=`<div class="card">${addHeader(deckId,"text")}
      <textarea id="text-box" class="zh" aria-label="Chinese text" placeholder="Paste a sentence or a paragraph:&#10;我今天去图书馆看书，因为明天要考试。">${esc(initial||"")}</textarea>
      <div style="height:10px"></div>
      <button class="btn" id="btn-find">Find words</button>
      <div id="cands"></div>
    </div>`;
  go("add");
  const deck=bindAddHeader(deckId,()=>$("#text-box").value);
  $("#btn-find").onclick=async()=>{
    const raw=$("#text-box").value;
    if(!raw.trim())return toast("Paste some Chinese text first");
    $("#btn-find").textContent="Loading dictionary…";
    await HF.ensureExtra();
    if(!$("#btn-find"))return;
    $("#btn-find").textContent="Find words";
    const simp=HF.simplify(raw);
    const cands=HF.extractFromText(simp,{maxWords:80});
    const box=$("#cands");
    if(!cands.length){box.innerHTML='<div class="empty">No Chinese words found in that text.</div>';return}
    const known=deckWordSet(deck());
    box.innerHTML=`<div class="detected"><b>${cands.length}</b> words found — untick any you don't want.</div>`+
      cands.map((c,i)=>`<label class="cand"><input type="checkbox" data-i="${i}" ${known.has(c.word)?"":"checked"}>
        <span class="zh">${esc(c.word)}</span>
        <span class="muted">${known.has(c.word)?"already in deck · ":""}${c.hsk?"HSK "+esc(c.hsk):c.matched?"dictionary":"not in dictionary"}</span></label>`).join("")+
      `<div style="height:8px"></div><button class="btn" id="btn-enrich-sel">Auto-fill selected →</button>`;
    $("#btn-enrich-sel").onclick=()=>{
      const list=[...box.querySelectorAll("input:checked")].map(x=>cands[+x.dataset.i].word);
      if(!list.length)return toast("Select at least one word");
      runEnrich(deck(),list);
    };
  };
}
async function runEnrich(deckId,words){
  const ctl=new AbortController();
  $("#add-flow").innerHTML=`<div class="card">
    <h2 style="margin-top:0">Filling in ${words.length} word${words.length===1?"":"s"}…</h2>
    <div class="progress" role="progressbar" aria-label="Auto-fill progress" aria-valuemin="0" aria-valuemax="100" id="ef-track"><i id="ef-bar" style="width:4%"></i></div>
    <div class="detected" id="ef-msg">Loading dictionary…</div>
    <button class="btn ghost" id="ef-cancel">Cancel</button></div>`;
  $("#ef-cancel").onclick=()=>{ctl.abort();startPaste(deckId,words.join("\n"))};
  const full=await HF.ensureExtra();
  if(ctl.signal.aborted)return;
  try{
    const rows=await HF.enrichBatch(words,{signal:ctl.signal,onProgress(i,n){
      const pct=Math.round(i/n*100);
      $("#ef-bar").style.width=pct+"%";$("#ef-track").setAttribute("aria-valuenow",pct);$("#ef-msg").textContent=`${i} / ${n}`;
    }});
    if(!ctl.signal.aborted)reviewRows(deckId,HF.dedupe(rows).map(rowFromLookup),full);
  }catch(e){
    if(e.name!=="AbortError"){console.warn("[HanziFlow] auto-fill failed",e);toast("Auto-fill failed: "+e.message)}
  }
}
function reviewRows(deckId,rows,fullDict){
  const known=deckWordSet(deckId);
  let saveAnyway=false;
  const incomplete=()=>rows.filter(r=>!r.m.trim());
  function rowHTML(r,i){
    const st=rowStatus(r),dup=known.has(r.w);
    const notes=r.notes.slice();
    if(r.exampleSource==="generic"&&!r.edited)notes.unshift("Replace the generic example with your own if you can");
    return`<div class="edit-row ${st==="curated"||st==="dictionary"?"":"flagged"}" data-i="${i}">
      <div class="head"><span class="hw zh">${colorHanzi(r.w,r.p)}</span>
        <span class="chip ${st}" data-chip>${chipText(r,st)}</span>
        <select data-f="h" aria-label="HSK level">${hskOptions(r.h)}</select>
        <button class="icon-btn" data-say="${esc(r.w)}" aria-label="Listen to ${esc(r.w)}">${ICON.say}</button>
        <button class="icon-btn" data-re="${i}" aria-label="Look up ${esc(r.w)} again" title="Re-lookup">${ICON.redo}</button>
        <button class="icon-btn" data-del="${i}" aria-label="Remove ${esc(r.w)}" title="Delete">${ICON.trash}</button></div>
      <input type="text" data-f="p" aria-label="Pinyin" value="${esc(r.p)}" placeholder="pīn yīn">
      <input type="text" data-f="m" aria-label="Meaning" value="${esc(r.m)}" placeholder="English meaning">
      <input type="text" data-f="z" aria-label="Example sentence" class="zh" value="${esc(r.s.z)}" placeholder="例句（中文）">
      <input type="text" data-f="y" aria-label="Example pinyin" value="${esc(r.s.y)}" placeholder="例句拼音">
      <input type="text" data-f="e" aria-label="Example translation" value="${esc(r.s.e)}" placeholder="English translation">
      <div class="foot">${dup?"<b>Already in this deck — won't be added again.</b> ":""}${notes.map(esc).join(" · ")}${r.sources.length?` · Source: ${esc(r.sources.join(", "))}`:""}</div>
    </div>`;
  }
  function refreshSave(){
    const bad=incomplete().length,hint=$("#save-hint"),btn=$("#btn-save-rows"),wrap=$("#save-anyway-wrap");
    const toSave=rows.filter(r=>!known.has(r.w)).length;
    hint.textContent=bad?`Fix ${bad} row${bad===1?"":"s"} without a meaning, or tick “Save anyway”.`:"";
    wrap.style.display=bad?"flex":"none";
    btn.disabled=!toSave||(bad>0&&!saveAnyway);
    btn.textContent=`Save ${toSave} card${toSave===1?"":"s"} to ${(S.decks.find(x=>x.id===deckId)||{}).name||"deck"}`;
  }
  function render(){
    if(!rows.length)return startPaste(deckId);
    const counts={curated:0,dictionary:0,pinyin:0,missing:0};rows.forEach(r=>counts[rowStatus(r)]++);
    $("#add-flow").innerHTML=`<div class="card">
        <h2 style="margin-top:0">Review ${rows.length} card${rows.length===1?"":"s"}</h2>
        <div class="muted">${counts.curated+counts.dictionary} filled automatically${counts.pinyin+counts.missing?` · <b>${counts.pinyin+counts.missing} need your attention</b>`:""}. Edit anything, then save.</div>
        ${fullDict===false?'<div class="notice">The full dictionary could not be loaded, so only common words were checked. Reload when you are online and use Re-lookup.</div>':""}
        <div id="rows">${rows.map(rowHTML).join("")}</div>
      </div>
      <div class="save-area">
        <div class="save-hint" id="save-hint" aria-live="polite"></div>
        <label class="save-anyway" id="save-anyway-wrap"><input type="checkbox" id="save-anyway" ${saveAnyway?"checked":""}> Save anyway, I'll finish these later</label>
        <div class="save-btns"><button class="btn ghost" id="btn-back-paste">← Back</button>
        <button class="btn" id="btn-save-rows">Save</button></div>
      </div>`;
    const wrap=$("#rows");
    wrap.querySelectorAll("input,select").forEach(inp=>{
      inp.oninput=inp.onchange=()=>{
        const el=inp.closest(".edit-row"),r=rows[+el.dataset.i],f=inp.dataset.f;
        if(f==="h")r.h=inp.value?+inp.value:null;
        else if(["z","y","e"].includes(f)){r.s[f]=inp.value;r.exampleSource="user";}
        else r[f]=inp.value;
        r.edited=true;r.needsReview=!r.m.trim();
        if(f==="p")el.querySelector(".hw").innerHTML=colorHanzi(r.w,r.p);
        const st=rowStatus(r),chip=el.querySelector("[data-chip]");
        chip.className="chip "+st;chip.textContent=chipText(r,st);
        refreshSave();
      };
    });
    wrap.querySelectorAll("[data-say]").forEach(b=>b.onclick=()=>speak(b.dataset.say));
    wrap.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{rows.splice(+b.dataset.del,1);render()});
    wrap.querySelectorAll("[data-re]").forEach(b=>b.onclick=async()=>{
      fullDict=await HF.ensureExtra();
      const i=+b.dataset.re;rows[i]=rowFromLookup(HF.lookup(rows[i].w));render();toast("Looked up again");
    });
    $("#save-anyway").onchange=e=>{saveAnyway=e.target.checked;refreshSave()};
    $("#btn-back-paste").onclick=()=>startPaste(deckId,rows.map(r=>r.w).join("\n"));
    $("#btn-save-rows").onclick=()=>{
      const d=S.decks.find(x=>x.id===deckId);
      const fresh=rows.filter(r=>!known.has(r.w));
      fresh.forEach(r=>S.cards.push({id:uid(),deckId,w:r.w,p:r.p.trim(),m:r.m.trim(),h:r.h,s:r.s,
        source:r.sources[0]||"user",confidence:r.confidence,needsReview:!r.m.trim(),
        dictionaryVersion:window.HF_DATA?HF_DATA.version:"",exampleSource:r.exampleSource,srs:newSRS()}));
      save();toast(`Saved ${fresh.length} card${fresh.length===1?"":"s"} to ${d?d.name:"deck"}`);openWeek(deckId);
    };
    refreshSave();
  }
  render();
}

/* ============ single card form ============ */
function cardForm(c,deckId){
  const isNew=!c;
  const original=c;
  c=c||{w:"",p:"",m:"",h:null,s:{z:"",y:"",e:""}};
  const s=c.s||{z:"",y:"",e:""};
  const shell=isNew?addHeader(deckId,"manual"):`<h2 style="margin-top:0">Edit card</h2>`;
  $("#add-flow").innerHTML=`
    <div class="card">${shell}
      <label class="lbl" for="cf-w">Chinese word or pinyin</label><input type="text" id="cf-w" class="zh" autocomplete="off" value="${esc(c.w)}">
      <div class="suggest" id="cf-suggest"></div>
      <div class="detected" id="cf-status" aria-live="polite">${isNew?"Type or paste a word — the rest fills in by itself.":""}</div>
      <label class="lbl" for="cf-p">Pinyin (tone marks)</label><input type="text" id="cf-p" value="${esc(c.p)}">
      <label class="lbl" for="cf-m">English meaning</label><input type="text" id="cf-m" value="${esc(c.m)}">
      <label class="lbl" for="cf-h">HSK level</label>
      <select id="cf-h">${hskOptions(c.h==null?null:c.h)}</select>
      <label class="lbl" for="cf-z">Example sentence (中文)</label><input type="text" id="cf-z" class="zh" value="${esc(s.z)}">
      <label class="lbl" for="cf-y">Example pinyin</label><input type="text" id="cf-y" value="${esc(s.y)}">
      <label class="lbl" for="cf-e">Example translation</label><input type="text" id="cf-e" value="${esc(s.e)}">
      <div style="height:14px"></div>
      <button class="btn" id="cf-save">${isNew?"Add card":"Save changes"}</button>
      ${!isNew?'<div style="height:8px"></div><button class="btn danger" id="cf-del">Delete card</button>':""}
      <div style="height:8px"></div>
      <button class="btn ghost" id="cf-cancel">Cancel</button>
    </div>`;
  go("add");
  const deck=isNew?bindAddHeader(deckId,()=>$("#cf-w").value):()=>c.deckId;
  const FIELDS=["p","m","h","z","y","e"];
  const edited=new Set();
  FIELDS.forEach(f=>{const el=$("#cf-"+f);el.addEventListener("input",()=>{edited.add(f)})});
  let lastLookup=null;
  function fill(word,force){
    const r=rowFromLookup(HF.lookup(word));
    lastLookup=r;
    const vals={p:r.p,m:r.m,h:r.h==null?"":String(r.h),z:r.s.z,y:r.s.y,e:r.s.e};
    FIELDS.forEach(f=>{
      const el=$("#cf-"+f);
      if(edited.has(f))return;
      if(force||!el.value)el.value=vals[f];
    });
    const st=rowStatus(r);
    $("#cf-status").innerHTML=`<span class="chip ${st}">${chipText(r,st)}</span>`;
  }
  let timer=null;
  async function onWord(forceFill){
    const raw=$("#cf-w").value;
    const list=HF.normalizeList(raw);
    if(list.length>1&&isNew)return startPaste(deck(),raw);
    const box=$("#cf-suggest");
    await HF.ensureExtra();
    if(!$("#cf-w"))return;
    if(!list.length){
      const pick=word=>{$("#cf-w").value=word;lastWord=word;box.innerHTML="";fill(word,true)};
      box.innerHTML=HF.search(raw).map(x=>`<button type="button" data-word="${esc(x.word)}"><span class="zh">${esc(x.word)}</span> <span class="muted">${esc(x.p)} · ${esc(x.m)}</span></button>`).join("");
      box.querySelectorAll("[data-word]").forEach(b=>b.onclick=()=>pick(b.dataset.word));
      return;
    }
    const w=list[0];
    box.innerHTML=HF.suggest(w).map(x=>`<button type="button" data-word="${esc(x.word)}"><span class="zh">${esc(x.word)}</span> <span class="muted">${esc(x.p)} · ${esc(x.m)}</span></button>`).join("");
    box.querySelectorAll("[data-word]").forEach(b=>b.onclick=()=>{$("#cf-w").value=b.dataset.word;box.innerHTML="";fill(b.dataset.word,true)});
    fill(w,!!forceFill&&isNew);
  }
  const w=$("#cf-w");
  let lastWord=w.value;
  w.addEventListener("input",()=>{
    clearTimeout(timer);
    const changed=w.value!==lastWord;lastWord=w.value;
    timer=setTimeout(()=>onWord(changed),250);
  });
  if(!isNew&&(!c.m||!s.z||!c.p)){HF.ensureExtra().then(()=>{if($("#cf-w")){fill(c.w,false)}})}
  $("#cf-save").onclick=()=>{
    const raw=$("#cf-w").value.trim();
    const data={w:isNew?norm(raw):raw,p:$("#cf-p").value.trim(),m:$("#cf-m").value.trim(),h:$("#cf-h").value?+$("#cf-h").value:null,
      s:{z:$("#cf-z").value.trim(),y:$("#cf-y").value.trim(),e:$("#cf-e").value.trim()}};
    if(!data.w)return toast("Word is required");
    if(isNew){
      const did=deck();
      if(!did)return toast("Create a deck first");
      if(deckWordSet(did).has(data.w))return toast(`${data.w} is already in this deck`);
      S.cards.push(Object.assign({id:uid(),deckId:did,srs:newSRS(),
        source:lastLookup&&lastLookup.sources[0]||"user",confidence:lastLookup?lastLookup.confidence:"high",
        needsReview:!data.m,dictionaryVersion:window.HF_DATA?HF_DATA.version:"",
        exampleSource:lastLookup?lastLookup.exampleSource:"user"},data));
      deckId=did;
    }else{
      Object.assign(original,data,{needsReview:!data.m});
      if(data.m&&edited.size)original.confidence="high";
      deckId=original.deckId;
    }
    save();toast(isNew?"Card added":"Saved");
    if(deckId)openWeek(deckId);else go("browse");
  };
  if(!isNew)$("#cf-del").onclick=async()=>{
    const yes=await hfDialog({title:`Delete ${c.w}?`,actions:[{label:"Delete card",kind:"danger",value:true},{label:"Keep it",kind:"ghost",value:false}]});
    if(yes){S.cards=S.cards.filter(x=>x.id!==c.id);save();if(c.deckId)openWeek(c.deckId);else go("browse")}
  };
  $("#cf-cancel").onclick=()=>{const did=c.deckId||deckId;if(did&&S.decks.some(d=>d.id===did))openWeek(did);else go("home")};
}
$("#btn-add-card").onclick=()=>{cardForm(null,latestDeck().id)};

/* ============ stroke order (Hanzi Writer) ============ */
/* Stroke data comes from the hanzi-writer-data package on jsDelivr; sw.js keeps a copy of each character after first use. */
const STROKE_URL="https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/";
const strokeCache={};
function loadStrokes(ch){
  if(!strokeCache[ch])strokeCache[ch]=fetch(STROKE_URL+encodeURIComponent(ch)+".json")
    .then(r=>{if(!r.ok)throw new Error(r.status===404?"missing":"HTTP "+r.status);return r.json()})
    .catch(e=>{delete strokeCache[ch];throw e});
  return strokeCache[ch];
}
const GRID_SVG=`<svg class="wr-grid" viewBox="0 0 100 100" aria-hidden="true"><rect x="1" y="1" width="98" height="98" rx="6"/>
  <path d="M50 1V99M1 50H99"/><path class="diag" d="M1 1 99 99M99 1 1 99"/></svg>`;
function openWriter(word,pinyin){
  if(typeof window.HanziWriter==="undefined")return toast("Stroke animations are unavailable — vendor/hanzi-writer.min.js did not load");
  const chars=[...String(word||"")].filter(ch=>HANZI_RE.test(ch));
  if(!chars.length)return toast("No Chinese characters to write");
  const tones=tonesFor(chars.join(""),pinyin);
  const syls=splitSyllables(pinyin);
  const charPinyin=i=>syls.length===chars.length?syls[i]:hfPinyin(chars[i]);
  const root=$("#dialog-root"),prev=document.activeElement;
  const size=Math.max(180,Math.min(280,window.innerWidth-96));
  root.innerHTML=`<div class="overlay"><div class="dialog writer-dlg" role="dialog" aria-modal="true" aria-labelledby="wr-t">
    <div class="row between"><h3 id="wr-t">Stroke order</h3>
      <button class="icon-btn" id="wr-x" aria-label="Close">✕</button></div>
    ${chars.length>1?`<div class="wr-chars" role="tablist" aria-label="Characters">${chars.map((ch,i)=>
      `<button role="tab" class="zh t${tones[i]||0}" data-ci="${i}" aria-label="${esc(ch)}">${esc(ch)}</button>`).join("")}</div>`:""}
    <div class="wr-py" id="wr-py"></div>
    <div class="wr-stage" style="width:${size}px;height:${size}px">${GRID_SVG}<div id="wr-target"></div></div>
    <div class="wr-msg" id="wr-msg" aria-live="polite"></div>
    <div class="wr-acts">
      <button class="btn small ghost" id="wr-play">▶ Watch</button>
      <button class="btn small" id="wr-quiz">✍ Practice</button>
      ${chars.length>1?'<button class="btn small ghost" id="wr-all">Whole word</button>':""}
    </div>
  </div></div>`;
  let cur=0,writer=null,run=0,mode="watch";
  const msg=t=>{const m=$("#wr-msg");if(m)m.textContent=t};
  const color=v=>cssVar(v)||"#14212c";
  function mount(i){
    run++;cur=i;
    if(writer){try{writer.cancelQuiz()}catch(e){}}
    root.querySelectorAll("[data-ci]").forEach(b=>b.setAttribute("aria-selected",+b.dataset.ci===i?"true":"false"));
    $("#wr-py").innerHTML=colorPinyin(charPinyin(i)||"");
    const tgt=$("#wr-target");tgt.innerHTML="";
    msg("Loading strokes…");
    writer=HanziWriter.create(tgt,chars[i],{
      width:size,height:size,padding:Math.round(size*.06),
      showCharacter:false,showOutline:true,
      strokeColor:color("--t"+(tones[i]||0)),outlineColor:color("--line"),
      radicalColor:null,highlightColor:color("--accent-2"),drawingColor:color("--accent"),
      strokeAnimationSpeed:1,delayBetweenStrokes:260,showHintAfterMisses:2,drawingWidth:Math.max(12,Math.round(size/18)),
      charDataLoader:(ch,ok,fail)=>{loadStrokes(ch).then(ok,fail)},
      onLoadCharDataSuccess:d=>{const n=d.strokes.length,label=`${n} stroke${n===1?"":"s"}`;
        msg(mode==="quiz"?`Trace the ${label} in order. A hint appears after 2 misses.`:label)},
      onLoadCharDataError:e=>msg(e&&e.message==="missing"?`No stroke data for ${chars[i]}.`:"Stroke data needs an internet connection the first time.")
    });
    return writer;
  }
  async function watch(i){
    mode="watch";const my=mount(i),token=run;
    try{await my.animateCharacter()}catch(e){}
    return token===run;
  }
  async function watchAll(from){
    for(let i=from;i<chars.length;i++){
      if(!await watch(i))return;
      const token=run;
      if(i<chars.length-1)await new Promise(r=>setTimeout(r,450));
      if(token!==run)return;
    }
  }
  function practice(i){
    mode="quiz";const my=mount(i),token=run;
    my.quiz({
      onMistake:s=>{if(token===run)msg(`Not quite — stroke ${s.strokeNum+1}. Try again.`)},
      onCorrectStroke:s=>{if(token===run)msg(s.strokesRemaining?`Good! ${s.strokesRemaining} to go.`:"")},
      onComplete:s=>{
        if(token!==run)return;
        const m=s.totalMistakes;
        msg(m===0?"Perfect! 完美 🎉":`Done with ${m} mistake${m===1?"":"s"}.`);
        if(i<chars.length-1)setTimeout(()=>{if(token===run&&mode==="quiz")practice(i+1)},1100);
      }
    });
  }
  const close=()=>{run++;if(writer){try{writer.cancelQuiz()}catch(e){}}root.innerHTML="";document.removeEventListener("keydown",onKey);if(prev&&prev.focus)prev.focus()};
  const onKey=e=>{if(e.key==="Escape")close()};
  document.addEventListener("keydown",onKey);
  root.querySelector(".overlay").onclick=e=>{if(e.target.classList.contains("overlay"))close()};
  $("#wr-x").onclick=close;
  $("#wr-play").onclick=()=>watch(cur);
  $("#wr-quiz").onclick=()=>practice(cur);
  const all=$("#wr-all");if(all)all.onclick=()=>watchAll(0);
  root.querySelectorAll("[data-ci]").forEach(b=>b.onclick=()=>mode==="quiz"?practice(+b.dataset.ci):watch(+b.dataset.ci));
  $("#wr-play").focus();
  watchAll(0);
}
/* Any [data-write] button opens the writer; capture phase so the card underneath doesn't flip or open. */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-write]");if(!b)return;
  e.stopPropagation();openWriter(b.dataset.write,b.dataset.writePy||"");
},true);

/* ============ study ============ */
let session=null;
function startStudy(deckId){
  const q=studyQueue(deckId);
  if(!q.length){
    $("#study-flow").innerHTML=`<div class="card summary"><div class="emoji zh">好</div>
      <h2>All caught up!</h2><p class="muted">No cards due${deckId?" in this deck":""}. Add new words or come back later.</p>
      <button class="btn" data-go="weeks">Go to Decks</button></div>`;
    go("study");return;
  }
  session={queue:q.slice(),i:0,ok:0,total:q.length,t0:Date.now(),flipped:false,deckId};
  go("study");renderStudyCard();
}
function renderStudyCard(){
  const c=session.queue[session.i];
  const s=c.s||{};
  const pos=`${session.i+1} / ${session.queue.length}`;
  const level=[c.h?"HSK "+c.h:"",stageOf(c)].filter(Boolean).map(esc).join(" · ");
  const badge=c.confidence&&c.confidence!=="high"?`<div class="conf-badge">${c.confidence==="low"?"Unverified — please check":"Check reading/example"}</div>`:"";
  $("#study-flow").innerHTML=`
    <div class="row between" style="margin-top:8px"><button class="btn ghost small" id="st-exit">✕ Exit</button><span class="muted">${pos}</span></div>
    <div class="study-wrap"><div class="flip" id="flip" role="button" tabindex="0" aria-label="Flip card">
      <div class="face front">
        <div class="big-hanzi zh">${colorHanzi(c.w,c.p)}</div>
        <div class="row" style="justify-content:center;gap:10px">
          <button class="audio-btn" data-say="${esc(c.w)}" aria-label="Listen">${ICON.say}</button>
          <button class="audio-btn" data-write="${esc(c.w)}" data-write-py="${esc(c.p)}" aria-label="Show stroke order" title="Stroke order">${ICON.write}</button>
        </div>
        <div class="flip-hint">Tap the card to reveal</div>
      </div>
      <div class="face back">
        ${badge}
        <div class="py-line">${colorPinyin(c.p)}</div>
        <div class="mean">${esc(c.m)}</div>
        ${s.z?`<div class="example">
          <div class="row" style="justify-content:center"><div class="ez zh">${colorHanzi(s.z,s.y)}</div>
          <button class="audio-btn small" data-say="${esc(s.z)}" aria-label="Listen to example">${ICON.say}</button></div>
          <div class="ep">${colorPinyin(s.y)}</div><div class="ee">${esc(s.e)}</div></div>`:""}
        <div class="flip-hint">${level}</div>
      </div>
    </div></div>
    <div class="grade-bar">
      <button class="grade again" data-q="0">Again<small>${nextIvlLabel(c,0)}</small></button>
      <button class="grade hard" data-q="1">Hard<small>${nextIvlLabel(c,1)}</small></button>
      <button class="grade good" data-q="2">Good<small>${nextIvlLabel(c,2)}</small></button>
      <button class="grade easy" data-q="3">Easy<small>${nextIvlLabel(c,3)}</small></button>
    </div>`;
  session.flipped=false;
  const flip=$("#flip");
  const toggle=()=>{flip.classList.toggle("flipped");session.flipped=!session.flipped};
  flip.onclick=e=>{if(!e.target.closest(".audio-btn"))toggle()};
  flip.onkeydown=e=>{if(e.target===flip&&(e.key===" "||e.key==="Enter")){e.preventDefault();toggle()}};
  $("#study-flow").querySelectorAll("[data-say]").forEach(b=>b.onclick=e=>{e.stopPropagation();speak(b.dataset.say)});
  $("#st-exit").onclick=()=>go("home");
  $("#study-flow").querySelectorAll(".grade").forEach(b=>b.onclick=()=>{
    if(!session.flipped){flip.classList.add("flipped");session.flipped=true;return}
    const q=+b.dataset.q;
    gradeCard(c,q);
    if(q>0)session.ok++;
    if(q===0)session.queue.push(c);
    session.i++;
    if(session.i>=session.queue.length){finishSession();return}
    renderStudyCard();
  });
}
function finishSession(){
  const mins=Math.max(1,Math.round((Date.now()-session.t0)/60000));
  const acc=session.i?Math.round(session.ok/session.i*100):0;
  $("#study-flow").innerHTML=`<div class="card summary pop"><div class="emoji zh">棒</div>
    <h2>Session complete!</h2>
    <p>${session.i} cards reviewed · ${acc}% remembered · ${mins} min</p>
    <button class="btn" data-go="home">Back home</button>
    <div style="height:8px"></div>
    <button class="btn ghost" data-action="study-all">Study again</button>
  </div>`;
}

/* ============ quiz ============ */
let quiz=null;
function startQuiz(deckId){
  const pool=(deckId?S.cards.filter(c=>c.deckId===deckId):S.cards).filter(c=>c.m||c.p);
  if(pool.length<4){toast("Need at least 4 cards for a quiz");return}
  quiz={deckId,pool,items:shuffle(pool).slice(0,15),i:0,ok:0,t0:Date.now()};
  go("quiz");renderQuiz();
}
function renderQuiz(){
  const c=quiz.items[quiz.i];
  const reverse=!!c.m&&Math.random()<0.5; // English → hanzi
  const label=o=>c.m?(o.m||o.p):o.p; // pinyin-only cards are asked by reading
  const opts=shuffle(shuffle(quiz.pool.filter(x=>x.id!==c.id&&(reverse||label(x)))).slice(0,3).concat([c]));
  $("#quiz-flow").innerHTML=`
    <div class="row between" style="margin-top:8px"><button class="btn ghost small" id="qz-exit">✕ Exit</button>
    <span class="muted">${quiz.i+1} / ${quiz.items.length}</span></div>
    <div class="card" style="text-align:center;padding:28px 16px">
      <div class="muted" style="margin-bottom:8px">${reverse?"Pick the matching Chinese word":c.m?"What does this word mean?":"How is this word read?"}</div>
      ${reverse?`<div style="font-size:22px;font-weight:600">${esc(c.m)}</div>`
        :`<div class="big-hanzi zh" style="font-size:52px">${colorHanzi(c.w,c.p)}</div>
          <button class="audio-btn" data-say="${esc(c.w)}" aria-label="Listen">${ICON.say}</button>`}
    </div>
    <div id="qz-opts">
      ${opts.map(o=>`<button class="quiz-opt" data-id="${esc(o.id)}">${reverse?`<span class="zh" style="font-size:20px">${colorHanzi(o.w,o.p)}</span> <span class="muted">${colorPinyin(o.p)}</span>`:esc(label(o))}</button>`).join("")}
    </div>`;
  const sayBtn=$("#quiz-flow [data-say]");if(sayBtn)sayBtn.onclick=()=>speak(sayBtn.dataset.say);
  $("#qz-exit").onclick=()=>go("home");
  const buttons=[...$("#qz-opts").querySelectorAll(".quiz-opt")];
  buttons.forEach(b=>b.onclick=()=>{
    const good=b.dataset.id===c.id;
    b.classList.add(good?"correct":"wrong");
    if(good){b.classList.add("pop");quiz.ok++;gradeCard(c,2)}
    else{gradeCard(c,0);buttons.find(x=>x.dataset.id===c.id).classList.add("correct")}
    buttons.forEach(x=>x.disabled=true);
    setTimeout(()=>{
      if(curScreen!=="quiz")return;
      quiz.i++;
      if(quiz.i>=quiz.items.length)finishQuiz();else renderQuiz();
    },good?600:1400);
  });
}
function finishQuiz(){
  const mins=Math.max(1,Math.round((Date.now()-quiz.t0)/60000));
  const acc=Math.round(quiz.ok/quiz.items.length*100);
  $("#quiz-flow").innerHTML=`<div class="card summary pop"><div class="emoji zh">${acc>=80?"棒":acc>=50?"好":"学"}</div>
    <h2>Quiz complete!</h2>
    <p>${quiz.ok} / ${quiz.items.length} correct · ${acc}% · ${mins} min</p>
    <button class="btn" data-go="home">Back home</button>
    <div style="height:8px"></div>
    <button class="btn ghost" data-action="quiz-retry" data-deck="${esc(quiz.deckId||"")}">Retry quiz</button>
  </div>`;
}
/* ============ browse ============ */
const BROWSE_PAGE=50;
let browseH=0,browseLimit=BROWSE_PAGE;
function renderBrowse(){
  $("#browse-filters").innerHTML=[0,1,2,3,4,5,6].map(h=>`<button class="pill ${browseH===h?"on":""}" data-h="${h}">${h===0?"All levels":"HSK "+h}</button>`).join("");
  $("#browse-filters").querySelectorAll(".pill").forEach(p=>p.onclick=()=>{browseH=+p.dataset.h;browseLimit=BROWSE_PAGE;renderBrowse()});
  const q=($("#browse-search").value||"").trim().toLowerCase();
  let list=S.cards.filter(c=>!browseH||c.h===browseH);
  if(q)list=list.filter(c=>c.w.includes(q)||(c.p||"").toLowerCase().includes(q)||(c.m||"").toLowerCase().includes(q));
  const box=$("#browse-list");
  box.innerHTML=list.slice(0,browseLimit).map(cardRowHTML).join("")||'<div class="empty">No matching cards.</div>';
  if(list.length>browseLimit){
    box.insertAdjacentHTML("beforeend",`<div style="padding:12px 0"><button class="btn ghost" id="browse-more">Load more (${list.length-browseLimit} left)</button></div>`);
    $("#browse-more").onclick=()=>{browseLimit+=BROWSE_PAGE;renderBrowse()};
  }
  bindCardRows("#browse-list");
}
$("#browse-search").oninput=()=>{browseLimit=BROWSE_PAGE;renderBrowse()};

/* ============ stats ============ */
let charts=[];
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
function renderStats(){
  charts.forEach(ch=>ch.destroy());charts=[];
  const warn=$("#stats-warning");
  if(!window.Chart){warn.innerHTML='<div class="notice">Charts are unavailable because vendor/chart.umd.min.js did not load. Reload to try again.</div>';return}
  warn.innerHTML="";
  const accent=cssVar("--accent"),ink=cssVar("--ink-2"),line=cssVar("--line");
  Chart.defaults.color=ink;Chart.defaults.borderColor=line;
  const days=[],counts=[];
  for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*DAY),k=todayStr(d);
    days.push((d.getMonth()+1)+"/"+d.getDate());counts.push((S.reviews[k]||{n:0}).n)}
  const axes={plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}},x:{ticks:{maxTicksLimit:8,maxRotation:0}}}};
  charts.push(new Chart($("#ch-reviews"),{type:"bar",data:{labels:days,datasets:[{data:counts,backgroundColor:accent,borderRadius:4}]},options:axes}));
  let run=0;const cumSeries=counts.map(n=>run+=n);
  charts.push(new Chart($("#ch-cum"),{type:"line",data:{labels:days,datasets:[{data:cumSeries,borderColor:accent,tension:.3,fill:true,pointRadius:0,backgroundColor:`color-mix(in srgb, ${accent} 16%, transparent)`}]},options:axes}));
  const st={New:0,Learning:0,Reviewing:0,Mastered:0};S.cards.forEach(c=>st[stageOf(c)]++);
  charts.push(new Chart($("#ch-mastery"),{type:"doughnut",
    data:{labels:Object.keys(st),datasets:[{data:Object.values(st),borderWidth:0,backgroundColor:["--st-new","--st-learn","--st-rev","--st-mast"].map(cssVar)}]},
    options:{plugins:{legend:{position:"bottom"}}}}));
}

/* ============ settings ============ */
function renderSettings(){
  renderSyncCard();
  $("#set-target").value=S.settings.target;
  $("#set-newcap").value=S.settings.newCap;
  $("#set-dark").checked=S.settings.theme==="dark";
  const D=window.HF_DATA||{},X=window.HF_DATA_EXTRA;
  const core=D.entries?Object.keys(D.entries).length:0;
  const total=X?(core+Object.keys(X.entries).length).toLocaleString():"about 119,000";
  const sw=navigator.serviceWorker&&navigator.serviceWorker.controller?"Offline ready":"Offline copy not active yet (reload once online)";
  $("#about-card").innerHTML=`<b>About &amp; data sources</b>
    <p class="muted" style="margin:6px 0 0">HanziFlow ${esc(window.HF?HF.version:"")} · Dictionary ${esc(D.version||"?")} (${esc(D.generatedAt||"?")}) · ${total} entries<br><span id="offline-status">${esc(sw)}</span></p>
    <ul class="about-list">
      <li><a href="https://cc-cedict.org/wiki/" target="_blank" rel="noopener">CC-CEDICT</a> — CC BY-SA 4.0. The derived dictionary files are shared under the same licence.</li>
      <li><a href="https://tatoeba.org/eng/downloads" target="_blank" rel="noopener">Tatoeba</a> example sentences — CC BY 2.0 FR, by the Tatoeba contributors.</li>
      <li><a href="https://github.com/zh-lx/pinyin-pro" target="_blank" rel="noopener">pinyin-pro</a> — MIT.</li>
    </ul>`;
}
$("#set-target").onchange=e=>{S.settings.target=Math.max(1,+e.target.value||20);save();toast("Daily target saved")};
$("#set-newcap").onchange=e=>{S.settings.newCap=Math.max(0,+e.target.value||0);save();toast("New-card cap saved")};
$("#set-dark").onchange=e=>{setTheme(e.target.checked?"dark":"light")};
$("#btn-export").onclick=()=>{
  const blob=new Blob([JSON.stringify(S,null,1)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="hanziflow-backup-"+todayStr()+".json";a.click();URL.revokeObjectURL(a.href);
  toast("Backup downloaded");
};
function mergeBackup(data){
  const incoming=migrateV1toV2(data);
  incoming.decks.forEach(d=>{
    if(!S.decks.some(x=>x.id===d.id))S.decks.push(d);
  });
  const seen=new Set(S.cards.map(c=>c.deckId+"|"+norm(c.w)));
  let added=0;
  incoming.cards.forEach(c=>{
    const k=c.deckId+"|"+norm(c.w);
    if(seen.has(k))return;
    seen.add(k);S.cards.push(c);added++;
  });
  Object.entries(incoming.reviews).forEach(([d,r])=>{if(!S.reviews[d]||(r.n||0)>(S.reviews[d].n||0))S.reviews[d]=r});
  if((incoming.streak.count||0)>(S.streak.count||0))S.streak=incoming.streak;
  return added;
}
$("#file-import").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=async()=>{
    let data;try{data=JSON.parse(r.result)}catch(x){toast("That file isn't valid JSON");return}
    if(!data||!Array.isArray(data.decks)||!Array.isArray(data.cards)||data.cards.some(c=>!c||typeof c.w!=="string")){toast("Not a HanziFlow backup");return}
    const mode=await hfDialog({title:"Import backup",body:`${data.decks.length} decks and ${data.cards.length} cards found.`,
      actions:[{label:"Merge — add what's missing",value:"merge"},{label:"Replace everything",kind:"danger",value:"replace"},{label:"Cancel",kind:"ghost",value:null}]});
    if(!mode)return;
    if(mode==="replace"){S=Object.assign(migrateV1toV2(data),{deleted:S.deleted||{}});toast("Backup restored")}
    else toast(`Merged — ${mergeBackup(data)} new cards`);
    save();setTheme(S.settings.theme);go("home");repairBlankCards();
  };
  r.readAsText(f);e.target.value="";
};
$("#btn-reset").onclick=()=>{
  if(!confirm("Erase ALL decks, cards and progress? This cannot be undone."))return;
  if(!confirm("Really delete everything?"))return;
  // Resets this device only: no deletions are sent, so synced devices keep their cards.
  S=defaultState();localStorage.removeItem(KEY_V1);window.HFSync.baseline(S,syncHashes);
  if(syncCfg.token){syncCfg.token="";syncCfg.gistId="";saveSyncCfg()}
  save();setTheme("light");toast("All data on this device erased");go("home");
};
$("#theme-toggle").onclick=()=>setTheme(S.settings.theme==="dark"?"light":"dark");
function setTheme(t){
  S.settings.theme=t;save();
  document.documentElement.setAttribute("data-theme",t);
  $("#theme-toggle").innerHTML=t==="dark"?ICON.sun:ICON.moon;
  const cb=$("#set-dark");if(cb)cb.checked=t==="dark";
  if(curScreen==="stats")renderStats();
}

/* Old v1 cards were often saved blank; complete whatever the dictionary can now fill. Never overwrites. */
async function repairBlankCards(){
  const blank=S.cards.filter(c=>!c.m||!c.p||!(c.s&&c.s.z));
  if(!blank.length||!window.HF)return;
  await HF.ensureExtra();
  let fixed=0;
  blank.forEach(c=>{
    const r=rowFromLookup(HF.lookup(c.w));
    if(!r.m&&!r.p)return;
    const before=JSON.stringify([c.m,c.p,c.s]);
    c.s=c.s||{z:"",y:"",e:""};
    c.m=c.m||r.m;c.p=c.p||r.p;
    if(c.h==null)c.h=r.h;
    if(!c.s.z&&r.s.z){c.s=r.s;c.exampleSource=r.exampleSource}
    c.needsReview=!c.m;
    c.confidence=r.confidence;c.source=r.sources[0]||c.source;c.dictionaryVersion=window.HF_DATA?HF_DATA.version:"";
    if(before!==JSON.stringify([c.m,c.p,c.s]))fixed++;
  });
  if(fixed){save();toast(`Completed ${fixed} older card${fixed===1?"":"s"} from the dictionary`);if(curScreen==="home")renderHome()}
}

/* ============ device sync (private GitHub Gist) ============ */
const SYNC_KEY="hanziflow.sync",SYNC_FILE="hanziflow.json",SYNC_DESC="HanziFlow sync";
let syncCfg={token:"",gistId:"",last:0,error:""};
try{syncCfg=Object.assign(syncCfg,JSON.parse(localStorage.getItem(SYNC_KEY)||"{}"))}catch(e){console.warn("[HanziFlow] sync settings unreadable",e)}
function saveSyncCfg(){localStorage.setItem(SYNC_KEY,JSON.stringify(syncCfg))}
let syncTimer=null,syncRunning=false,syncPending=false;
const syncBusyScreen=()=>["study","quiz","add"].includes(curScreen); // never swap data under an open card
function scheduleSync(){
  if(!syncCfg.token)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{if(syncBusyScreen())syncPending=true;else syncNow()},3000);
}
async function gh(path,opts={}){
  const res=await fetch("https://api.github.com"+path,Object.assign({},opts,{cache:"no-store",headers:{
    Authorization:"Bearer "+syncCfg.token,Accept:"application/vnd.github+json","Content-Type":"application/json"}}));
  if(!res.ok){
    const err=new Error(res.status===401?"GitHub rejected the token. Create a new one and connect again.":
      res.status===403||res.status===404?"The token can't use Gists. Make sure the “gist” box was ticked.":"GitHub error "+res.status);
    err.status=res.status;throw err;
  }
  return res.status===204?null:res.json();
}
async function findSyncGist(){
  for(let page=1;page<=10;page++){
    const list=await gh(`/gists?per_page=100&page=${page}`);
    const hit=list.find(x=>x.description===SYNC_DESC&&x.files&&x.files[SYNC_FILE]);
    if(hit)return hit.id;
    if(list.length<100)return "";
  }
  return "";
}
async function readSyncGist(id){
  const gist=await gh("/gists/"+id);
  const f=gist.files&&gist.files[SYNC_FILE];
  if(!f)return null;
  const text=f.truncated?await (await fetch(f.raw_url,{cache:"no-store"})).text():f.content;
  return JSON.parse(text);
}
async function syncNow(manual){
  if(!syncCfg.token||syncRunning)return;
  if(syncBusyScreen()){syncPending=true;return}
  syncRunning=true;syncPending=false;renderSyncStatus("Syncing…");
  try{
    if(!syncCfg.gistId)syncCfg.gistId=await findSyncGist();
    let remote=null;
    if(syncCfg.gistId)remote=await readSyncGist(syncCfg.gistId);
    const before=JSON.stringify({d:S.decks,c:S.cards});
    if(remote&&Array.isArray(remote.cards)){
      const merged=window.HFSync.merge(S,migrateV1toV2(remote));
      S=Object.assign(normalizeState(merged),{deleted:merged.deleted,settingsU:merged.settingsU});
    }
    window.HFSync.baseline(S,syncHashes);
    localStorage.setItem(KEY,JSON.stringify(S));
    const payload=JSON.stringify(S);
    if(!syncCfg.gistId){
      const g=await gh("/gists",{method:"POST",body:JSON.stringify({description:SYNC_DESC,public:false,files:{[SYNC_FILE]:{content:payload}}})});
      syncCfg.gistId=g.id;
    }else if(!remote||JSON.stringify(remote)!==payload){
      await gh("/gists/"+syncCfg.gistId,{method:"PATCH",body:JSON.stringify({files:{[SYNC_FILE]:{content:payload}}})});
    }
    syncCfg.last=Date.now();syncCfg.error="";saveSyncCfg();
    if(before!==JSON.stringify({d:S.decks,c:S.cards})&&!syncBusyScreen())go(curScreen==="week-detail"?"weeks":curScreen);
    if(manual)toast("Synced");
  }catch(e){
    console.warn("[HanziFlow] sync failed",e);
    if(e.status===404)syncCfg.gistId=""; // the gist was deleted; find or create it next time
    syncCfg.error=e.status?e.message:"Couldn't reach GitHub. Changes stay on this device and sync later.";
    saveSyncCfg();
    if(manual)toast(syncCfg.error);
  }finally{syncRunning=false;renderSyncStatus()}
}
function ago(t){
  const s=Math.round((Date.now()-t)/1000);
  return s<60?"just now":s<3600?Math.round(s/60)+" min ago":s<86400?Math.round(s/3600)+" h ago":new Date(t).toLocaleDateString();
}
function renderSyncStatus(msg){
  const el=$("#sync-status");if(!el)return;
  el.textContent=msg||(syncCfg.error?syncCfg.error:syncCfg.last?"Last synced "+ago(syncCfg.last):"Not synced yet");
  el.classList.toggle("bad",!msg&&!!syncCfg.error);
}
function renderSyncCard(){
  const box=$("#sync-card");
  if(syncCfg.token){
    box.innerHTML=`<div class="row between"><b>Sync between devices</b><span class="chip curated">On</span></div>
      <p class="muted" id="sync-status"></p>
      <div class="row wrap" style="gap:8px"><button class="btn small" id="sync-now">Sync now</button>
      <button class="btn small coral" id="sync-pair">Connect another device</button>
      <button class="btn small ghost" id="sync-off">Turn off on this device</button></div>`;
    $("#sync-now").onclick=()=>syncNow(true);
    $("#sync-pair").onclick=showPairDialog;
    $("#sync-off").onclick=async()=>{
      const yes=await hfDialog({title:"Turn off sync here?",body:"Your cards stay on this device and in the cloud copy. Other devices keep syncing.",
        actions:[{label:"Turn off",kind:"danger",value:true},{label:"Cancel",kind:"ghost",value:false}]});
      if(yes){syncCfg={token:"",gistId:"",last:0,error:""};saveSyncCfg();renderSyncCard()}
    };
    renderSyncStatus();return;
  }
  box.innerHTML=`<b>Sync between devices</b>
    <p class="muted">Keep your computer and phone in step. Your cards are saved to a private Gist on your own GitHub account; nobody else can see it.</p>
    <ol class="about-list">
      <li><a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=HanziFlow%20sync" target="_blank" rel="noopener">Create a GitHub token</a> with only the “gist” box ticked, and copy it.</li>
      <li>Paste it below and tap Connect.</li>
      <li>Then tap “Connect another device” to send your phone a one-tap link. On iPhone, open it in the HanziFlow you actually use: the home-screen app and Safari keep separate cards.</li>
    </ol>
    <input type="password" id="sync-token" autocapitalize="off" spellcheck="false" aria-label="GitHub token" placeholder="Token (ghp_…) or pairing link" autocomplete="off" style="margin-top:10px">
    <div style="height:8px"></div>
    <button class="btn" id="sync-connect">Connect</button>`;
  $("#sync-connect").onclick=async()=>{
    let token=$("#sync-token").value.trim();
    const at=token.indexOf(PAIR_PREFIX);if(at>=0)token=decodeURIComponent(token.slice(at+PAIR_PREFIX.length)).trim(); // a pasted pairing link works too
    if(!token)return toast("Paste your token first");
    $("#sync-connect").textContent="Connecting…";
    if(!await connectWithToken(token)&&$("#sync-connect"))$("#sync-connect").textContent="Connect";
  };
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncNow()});
window.addEventListener("online",()=>syncNow());
window.addEventListener("focus",()=>syncNow());
/* Both devices open at once (Mac on the desk, phone in hand): pick up the other's changes every 30 s. */
setInterval(()=>{if(document.visibilityState==="visible")syncNow()},30000);

/* Pairing link: the token travels in the #hash, which browsers never send to a server. */
const PAIR_PREFIX="#hfsync=";
function pairLink(){return location.origin+location.pathname+PAIR_PREFIX+encodeURIComponent(syncCfg.token)}
async function connectWithToken(token){
  const prevCfg=syncCfg;
  syncCfg={token,gistId:"",last:0,error:""};
  try{await gh("/gists?per_page=1")}
  catch(e){syncCfg=prevCfg;toast(e.status?e.message:"Couldn't reach GitHub");return false}
  saveSyncCfg();renderSyncCard();await syncNow(true);
  return true;
}
async function showPairDialog(){
  const link=pairLink();
  const canShare=!!navigator.share;
  const v=await hfDialog({title:"Connect your phone",
    body:"Send this link to your phone (AirDrop, Messages, or copy here and paste on iPhone). Open it in the HanziFlow you use there and tap Connect. The link holds your sync key, so only send it to yourself.",
    actions:[...(canShare?[{label:"Share link…",value:"share"}]:[]),{label:"Copy link",kind:canShare?"ghost":"",value:"copy"},{label:"Close",kind:"ghost",value:null}]});
  if(v==="share"){try{await navigator.share({title:"HanziFlow sync",url:link})}catch(e){}}
  if(v==="copy"){
    try{await navigator.clipboard.writeText(link);toast("Link copied — paste it on your phone")}
    catch(e){await hfDialog({title:"Copy this link",input:link,actions:[{label:"Done",value:true}]})}
  }
}
async function checkPairLink(){
  if(!location.hash.startsWith(PAIR_PREFIX))return;
  const token=decodeURIComponent(location.hash.slice(PAIR_PREFIX.length)).trim();
  history.replaceState(null,"",location.pathname+location.search); // keep the key out of the address bar
  if(!token)return;
  if(token===syncCfg.token){toast("This device is already syncing");return}
  const yes=await hfDialog({title:"Connect this device?",
    body:"Your decks and cards will sync with your other devices through your private GitHub Gist. Cards already on this device are kept and merged.",
    actions:[{label:"Connect",value:true},{label:"Not now",kind:"ghost",value:false}]});
  if(yes&&await connectWithToken(token))toast("Connected — syncing with your other devices");
}
window.addEventListener("hashchange",checkPairLink);

/* ============ init ============ */
load();
window.HFSync.baseline(S,syncHashes);
setTheme(S.settings.theme||"light");
go("home");
if(loadProblem){$("#scr-home").insertAdjacentHTML("afterbegin",`<div class="notice">${esc(loadProblem)}</div>`)}
repairBlankCards();
syncNow();
checkPairLink();
if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){
  // A new version takes over while the page loads: reload once so nobody runs stale files.
  const hadController=!!navigator.serviceWorker.controller;
  let reloading=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(!hadController||reloading)return;
    reloading=true;save();location.reload();
  });
  navigator.serviceWorker.register("sw.js").catch(e=>console.warn("[HanziFlow] service worker not registered",e));
}

/* ============ boot guard ============ */
(function(){
  const missing=(window.HF_MISSING_DEPS||[]).slice();
  if(!window.pinyinPro&&!missing.includes("pinyin-pro"))missing.push("pinyin-pro");
  if(!window.Chart&&!missing.includes("chart.js"))missing.push("chart.js");
  if(!window.HF_DATA&&!missing.includes("dictionary data"))missing.push("dictionary data");
  if(!missing.length)return;
  console.warn("[HanziFlow] missing dependencies: "+missing.join(", "));
  $("#app").insertAdjacentHTML("afterbegin",`<div class="notice" role="alert">Some features are unavailable (${esc(missing.join(", "))} failed to load). Reload to try again.</div>`);
})();
