"use strict";
/* ============ store ============ */
const KEY="hanziflow.v1";
const DAY=86400000;
function todayStr(d){d=d||new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function dayStart(d){d=d||new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}

const defaultState=()=>({
  decks:[], cards:[],
  settings:{target:20,newCap:15,theme:"light"},
  streak:{count:0,last:null},
  reviews:{} // {"2026-11-07":{n:12,ok:10}}
});
let S=defaultState();
function load(){
  try{const raw=localStorage.getItem(KEY);if(raw){const p=JSON.parse(raw);S=Object.assign(defaultState(),p);
    S.settings=Object.assign(defaultState().settings,p.settings||{});S.streak=Object.assign({count:0,last:null},p.streak||{});S.reviews=p.reviews||{};}}catch(e){}
}
function save(){localStorage.setItem(KEY,JSON.stringify(S))}
const dictMap={};HSK_DICT.forEach(d=>{dictMap[d.w]=d});

/* ============ tone colors ============ */
const TONE_MARKS={"ā":1,"á":2,"ǎ":3,"à":4,"ē":1,"é":2,"ě":3,"è":4,"ī":1,"í":2,"ǐ":3,"ì":4,"ō":1,"ó":2,"ǒ":3,"ò":4,"ū":1,"ú":2,"ǔ":3,"ù":4,"ǖ":1,"ǘ":2,"ǚ":3,"ǜ":4,"Ā":1,"Á":2,"Ǎ":3,"À":4,"Ē":1,"É":2,"Ě":3,"È":4,"Ī":1,"Í":2,"Ǐ":3,"Ì":4,"Ō":1,"Ó":2,"Ǒ":3,"Ò":4,"Ū":1,"Ú":2,"Ǔ":3,"Ù":4,"Ǖ":1,"Ǘ":2,"Ǚ":3,"Ǜ":4};
function toneOfSyllable(s){for(const ch of s){if(TONE_MARKS[ch])return TONE_MARKS[ch]}return 0}
const PYN_VOW=new Set([..."aeiouvüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜAEIOUVÜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ"]);
const PYN_INI2=new Set(["zh","ch","sh","Zh","Ch","Sh","ZH","CH","SH"]);
const PYN_INI1=new Set([..."bpmfdtnlgkhjqxrzcsywBPMFDTNLGKHJQXRZCSYW"]);
function splitSyllables(p){
  const out=[];
  for(const tok of (p||"").trim().split(/[\s']+/).filter(Boolean)){
    const marks=[];for(let i=0;i<tok.length;i++)if(TONE_MARKS[tok[i]])marks.push(i);
    if(!marks.length){out.push(tok);continue}
    let start=0;
    for(let k=0;k<marks.length;k++){
      // back-scan from the tone mark to find this syllable's initial
      let j=marks[k];while(j>=start&&PYN_VOW.has(tok[j]))j--;
      let c=j;while(c>=start&&!PYN_VOW.has(tok[c]))c--;
      let s=start;
      const cl=tok.slice(c+1,j+1);
      if(c+1>start){
        if(cl.length>=2&&PYN_INI2.has(cl.slice(-2)))s=j-1;
        else if(cl.length>=1&&PYN_INI1.has(cl.slice(-1)))s=j;
      }
      // forward: consume trailing vowels of the final, then coda n/ng/r
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
function colorHanzi(word,pinyin){
  const syls=splitSyllables(pinyin);let i=0,out="";
  for(const ch of word){
    if(!/[\u4e00-\u9fff]/.test(ch)){out+=ch;continue}
    const t=syls.length?(i<syls.length?toneOfSyllable(syls[i]):toneOfSyllable(syls[syls.length-1])):0;
    out+=`<span class="t${t}">${ch}</span>`;i++;
  }
  return out;
}
function colorPinyin(pinyin){
  return splitSyllables(pinyin).map(s=>`<span class="t${toneOfSyllable(s)}">${s}</span>`).join(" ");
}

/* ============ TTS ============ */
let zhVoice=null;
function pickVoice(){try{zhVoice=speechSynthesis.getVoices().find(v=>/zh(-|_)CN/i.test(v.lang))||speechSynthesis.getVoices().find(v=>v.lang&&v.lang.startsWith("zh"))||null}catch(e){}}
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
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove("show"),2200)}
let _pinyinWarned=false;
function hfPinyin(text,opts){
  if(typeof window.pinyinPro==="undefined"||!window.pinyinPro||typeof window.pinyinPro.pinyin!=="function"){
    if(!_pinyinWarned){_pinyinWarned=true;console.warn("[HanziFlow] hfPinyin: pinyin-pro unavailable");toast("Pinyin engine unavailable — check vendor/pinyin-pro.min.js")}
    return"";
  }
  try{return window.pinyinPro.pinyin(text,opts||{toneType:"symbol"})}
  catch(e){console.warn("[HanziFlow] hfPinyin failed for:",text,e);return""}
}
function newSRS(){return{e:2.5,ivl:0,due:dayStart(),reps:0,lapses:0}}
function stageOf(c){
  const s=c.srs;
  if(!s||s.reps===0&&s.ivl===0)return"New";
  if(s.ivl<3)return"Learning";
  if(s.ivl<21)return"Reviewing";
  return"Mastered";
}
function gradeCard(c,q){ // q: 0 again,1 hard,2 good,3 easy
  const s=c.srs||(c.srs=newSRS());
  if(q===0){s.lapses++;s.e=Math.max(1.3,s.e-0.2);s.ivl=0;s.due=Date.now()+10*60000}
  else{
    s.reps++;
    if(q===1){s.e=Math.max(1.3,s.e-0.15);s.ivl=s.ivl<1?1:Math.round(s.ivl*1.2)}
    else if(q===2){s.ivl=s.ivl<1?1:s.ivl<3?3:Math.round(s.ivl*s.e)}
    else{s.e+=0.15;s.ivl=s.ivl<1?2:Math.max(2,Math.round(s.ivl*s.e*1.3))}
    s.due=dayStart()+s.ivl*DAY;
  }
  recordReview(q>0);save();
}
function nextIvlLabel(c,q){
  const s=c.srs||{e:2.5,ivl:0};
  if(q===0)return"10m";
  let iv;
  if(q===1)iv=s.ivl<1?1:Math.round(s.ivl*1.2);
  else if(q===2)iv=s.ivl<1?1:s.ivl<3?3:Math.round(s.ivl*s.e);
  else iv=s.ivl<1?2:Math.max(2,Math.round(s.ivl*s.e*1.3));
  return iv+"d";
}
function recordReview(ok){
  const d=todayStr();
  if(!S.reviews[d])S.reviews[d]={n:0,ok:0};
  S.reviews[d].n++;if(ok)S.reviews[d].ok++;
  if(S.streak.last!==d){
    const y=todayStr(new Date(Date.now()-DAY));
    S.streak.count=(S.streak.last===y)?S.streak.count+1:1;
    S.streak.last=d;
  }
}
function dueCards(pool){
  const now=Date.now();
  return pool.filter(c=>c.srs&&(c.srs.due<=now||c.srs.reps===0&&false));
}
function newCards(pool,cap){
  return pool.filter(c=>!c.srs||c.srs.reps===0&&c.srs.ivl===0&&c.srs.lapses===0).slice(0,cap);
}
function studyQueue(deckId){
  const pool=deckId?S.cards.filter(c=>c.deckId===deckId):S.cards;
  const due=pool.filter(c=>c.srs&&c.srs.due<=Date.now()&&!(c.srs.reps===0&&c.srs.ivl===0&&c.srs.lapses===0));
  const fresh=newCards(pool,S.settings.newCap);
  return due.concat(fresh);
}

/* ============ router ============ */
const SCREENS=["home","weeks","week-detail","add","study","quiz","browse","stats","settings"];
function go(name){
  SCREENS.forEach(s=>$("#scr-"+s).classList.toggle("on",s===name));
  document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===name));
  if(name==="home")renderHome();
  if(name==="weeks")renderWeeks();
  if(name==="browse")renderBrowse();
  if(name==="stats")renderStats();
  if(name==="settings")renderSettings();
  window.scrollTo(0,0);
}
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>go(b.dataset.tab));
document.addEventListener("click",e=>{const g=e.target.closest("[data-go]");if(g)go(g.dataset.go)});

/* ============ home ============ */
function renderHome(){
  const q=studyQueue(null);
  $("#home-due").textContent=q.length;
  $("#home-streak").textContent=S.streak.count+" 🔥";
  const d=todayStr(),rev=S.reviews[d]||{n:0};
  $("#home-today").textContent=rev.n;
  const learned=S.cards.filter(c=>c.srs&&c.srs.reps>0).length;
  $("#home-learned").textContent=learned;
  $("#home-mastered").textContent=S.cards.filter(c=>stageOf(c)==="Mastered").length;
  $("#home-new").textContent=S.cards.filter(c=>stageOf(c)==="New").length;
  const tgt=S.settings.target;
  $("#home-target-label").textContent=rev.n+" / "+tgt;
  $("#home-target-bar").style.width=Math.min(100,Math.round(rev.n/tgt*100))+"%";
  const btn=$("#home-study");
  btn.textContent=q.length?`Study Now (${q.length} cards)`:"Nothing due — add words!";
  btn.onclick=()=>{startStudy(null)};
  const hw=$("#home-weeks");
  hw.innerHTML=S.decks.slice(-3).reverse().map(w=>weekItemHTML(w)).join("")||`<div class="empty"><div class="big">🀄</div>No decks yet. Create your first week in Decks!</div>`;
  hw.querySelectorAll(".week-item").forEach(el=>el.onclick=()=>openWeek(el.dataset.id));
}
function weekItemHTML(w){
  const cs=S.cards.filter(c=>c.deckId===w.id);
  const mast=cs.length?Math.round(cs.filter(c=>stageOf(c)==="Mastered").length/cs.length*100):0;
  const num=(w.name.match(/\d+/)||["#"])[0];
  return`<div class="week-item" data-id="${w.id}">
    <div class="badge">${esc(num)}</div>
    <div class="info"><div class="name">${esc(w.name)}</div>
    <div class="meta">${cs.length} cards · ${mast}% mastered</div>
    <div class="progress"><i style="width:${mast}%"></i></div></div></div>`;
}
/* ============ weeks ============ */
function renderWeeks(){
  $("#week-list").innerHTML=S.decks.map(weekItemHTML).join("")||`<div class="empty"><div class="big">🗂️</div>No decks yet.<br>Tap "+ New Week" to start.</div>`;
  document.querySelectorAll("#week-list .week-item").forEach(el=>el.onclick=()=>openWeek(el.dataset.id));
}
$("#btn-new-week").onclick=()=>{
  const n=S.decks.length+1;
  const d={id:uid(),name:"Week "+n,created:todayStr()};
  S.decks.push(d);save();openWeek(d.id,true);
};
let curDeck=null;
function openWeek(id,isNew){
  curDeck=S.decks.find(d=>d.id===id);if(!curDeck)return renderWeeks(),go("weeks");
  const cs=S.cards.filter(c=>c.deckId===id);
  const stages={New:0,Learning:0,Reviewing:0,Mastered:0};cs.forEach(c=>stages[stageOf(c)]++);
  $("#week-detail").innerHTML=`
    <div class="card">
      <div class="row between">
        <h2 style="margin:0" id="wd-name">${esc(curDeck.name)}</h2>
        <button class="icon-btn" id="wd-rename" title="Rename">✏️</button>
      </div>
      <div class="muted">Created ${esc(curDeck.created)} · ${cs.length} cards</div>
      <div style="margin:8px 0">
        <span class="stage New">New ${stages.New}</span> <span class="stage Learning">Learning ${stages.Learning}</span>
        <span class="stage Reviewing">Reviewing ${stages.Reviewing}</span> <span class="stage Mastered">Mastered ${stages.Mastered}</span>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
        <button class="btn small" id="wd-study">📖 Study this deck</button>
        <button class="btn small ghost" id="wd-quiz">🎯 Quiz</button>
        <button class="btn small ghost" id="wd-paste">📋 Paste words</button>
        <button class="btn small ghost" id="wd-add">+ Card</button>
        <button class="btn small danger" id="wd-del">Delete deck</button>
      </div>
    </div>
    <div class="card" style="padding:4px 14px">${cs.map(cardRowHTML).join("")||'<div class="empty">No cards yet — paste words to auto-fill!</div>'}</div>`;
  go("week-detail");
  $("#wd-rename").onclick=()=>{const n=prompt("Deck name:",curDeck.name);if(n){curDeck.name=n.trim()||curDeck.name;save();openWeek(id)}};
  $("#wd-study").onclick=()=>startStudy(id);
  $("#wd-quiz").onclick=()=>startQuiz(id);
  $("#wd-paste").onclick=()=>startPaste(id);
  $("#wd-add").onclick=()=>cardForm(null,id);
  $("#wd-del").onclick=()=>{if(confirm(`Delete "${curDeck.name}" and its ${cs.length} cards?`)){S.cards=S.cards.filter(c=>c.deckId!==id);S.decks=S.decks.filter(d=>d.id!==id);save();go("weeks")}};
  bindCardRows("#week-detail");
  if(isNew)startPaste(id);
}
function cardRowHTML(c){
  return`<div class="card-row" data-id="${c.id}">
    <div class="hw zh">${colorHanzi(c.w,c.p)}</div>
    <div class="det"><div class="p">${colorPinyin(c.p)}</div><div class="m">${esc(c.m)}</div></div>
    <span class="stage ${stageOf(c)}">${stageOf(c)}</span>
    <button class="audio-btn small" data-say="${esc(c.w)}" title="Listen">🔊</button>
  </div>`;
}
function bindCardRows(sel){
  document.querySelectorAll(sel+" .card-row").forEach(el=>{
    el.querySelector("[data-say]").onclick=e=>{e.stopPropagation();speak(e.currentTarget.dataset.say)};
    el.onclick=()=>cardForm(S.cards.find(c=>c.id===el.dataset.id));
  });
}

/* ============ add / bulk paste flow ============ */
function startPaste(deckId){
  const d=S.decks.find(x=>x.id===deckId);
  $("#add-flow").innerHTML=`
    <div class="card">
      <h2 style="margin-top:0">Add words to “${esc(d.name)}”</h2>
      <p class="muted">Paste or type Chinese words, one per line. Pinyin, meaning, HSK level and an example sentence will be auto-filled from the built-in dictionary.</p>
      <textarea id="paste-box" class="zh" placeholder="苹果&#10;环境&#10;保护&#10;经济…"></textarea>
      <div style="height:10px"></div>
      <button class="btn" id="btn-lookup">Auto-fill →</button>
      <div style="height:8px"></div>
      <button class="btn ghost" id="btn-manual">Or add a single card manually</button>
    </div>`;
  go("add");
  $("#btn-lookup").onclick=()=>{
    const lines=$("#paste-box").value.split("\n").map(s=>s.trim()).filter(Boolean);
    if(!lines.length)return toast("Paste some words first");
    const rows=lines.map(w=>{
      const hit=dictMap[w];
      if(hit)return{w,p:hit.p,m:hit.m,h:hit.h,s:Object.assign({},hit.s),auto:false};
      let p=hfPinyin(w);
      return{w,p,m:"",h:3,s:{z:"",y:"",e:""},auto:true};
    });
    reviewRows(deckId,rows);
  };
  $("#btn-manual").onclick=()=>cardForm(null,deckId);
}
function reviewRows(deckId,rows){
  const d=S.decks.find(x=>x.id===deckId);
  function render(){
    $("#add-flow").innerHTML=`
      <div class="card">
        <h2 style="margin-top:0">Review before saving</h2>
        <p class="muted">${rows.length} cards → “${esc(d.name)}”. Fix anything, delete rows, then save. <span class="tag-auto">AUTO</span> = not in dictionary, pinyin auto-generated.</p>
        <div id="rows"></div>
        <button class="btn" id="btn-save-rows">💾 Save to ${esc(d.name)}</button>
        <div style="height:8px"></div>
        <button class="btn ghost" id="btn-back-paste">← Back</button>
      </div>`;
    const wrap=$("#rows");
    wrap.innerHTML=rows.map((r,i)=>`
      <div class="edit-row" data-i="${i}">
        <div class="head"><span class="hw zh">${esc(r.w)}</span>${r.auto?'<span class="tag-auto">AUTO</span>':""}
          <select data-f="h">${[1,2,3,4].map(h=>`<option value="${h}" ${r.h===h?"selected":""}>HSK ${h}</option>`).join("")}</select>
          <button class="icon-btn" data-del="${i}" title="Delete">🗑️</button></div>
        <input data-f="p" value="${esc(r.p)}" placeholder="pīn yīn">
        <input data-f="m" value="${esc(r.m)}" placeholder="English meaning">
        <input data-f="z" class="zh" value="${esc(r.s.z)}" placeholder="例句（中文）">
        <input data-f="y" value="${esc(r.s.y)}" placeholder="例句拼音">
        <input data-f="e" value="${esc(r.s.e)}" placeholder="English translation">
      </div>`).join("");
    wrap.querySelectorAll("input,select").forEach(inp=>inp.oninput=()=>{
      const row=inp.closest(".edit-row"),r=rows[+row.dataset.i],f=inp.dataset.f;
      if(f==="h")r.h=+inp.value;else if(["z","y","e"].includes(f))r.s[f]=inp.value;else r[f]=inp.value;
    });
    wrap.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{rows.splice(+b.dataset.del,1);render()});
    $("#btn-back-paste").onclick=()=>startPaste(deckId);
    $("#btn-save-rows").onclick=()=>{
      rows.forEach(r=>S.cards.push({id:uid(),deckId,w:r.w,p:r.p,m:r.m,h:r.h,s:r.s,auto:r.auto,srs:newSRS()}));
      save();toast(`Saved ${rows.length} cards to ${d.name}`);openWeek(deckId);
    };
  }
  render();
}

/* ============ card form (add/edit) ============ */
function cardForm(c,deckId){
  const isNew=!c;
  c=c||{w:"",p:"",m:"",h:3,s:{z:"",y:"",e:""}};
  $("#add-flow").innerHTML=`
    <div class="card">
      <h2 style="margin-top:0">${isNew?"New card":"Edit card"}</h2>
      <label class="lbl">Chinese word 汉字</label><input id="cf-w" class="zh" value="${esc(c.w)}">
      <label class="lbl">Pinyin (tone marks)</label><input id="cf-p" value="${esc(c.p)}">
      <label class="lbl">English meaning</label><input id="cf-m" value="${esc(c.m)}">
      <label class="lbl">HSK level</label>
      <select id="cf-h">${[1,2,3,4].map(h=>`<option value="${h}" ${c.h===h?"selected":""}>HSK ${h}</option>`).join("")}</select>
      <label class="lbl">Example sentence (中文)</label><input id="cf-z" class="zh" value="${esc(c.s.z)}">
      <label class="lbl">Example pinyin</label><input id="cf-y" value="${esc(c.s.y)}">
      <label class="lbl">Example translation</label><input id="cf-e" value="${esc(c.s.e)}">
      ${isNew?`<label class="lbl">Deck</label><select id="cf-d">${S.decks.map(d=>`<option value="${d.id}" ${d.id===deckId?"selected":""}>${esc(d.name)}</option>`).join("")}</select>`:""}
      <div style="height:14px"></div>
      <button class="btn" id="cf-save">${isNew?"Add card":"Save changes"}</button>
      ${!isNew?'<div style="height:8px"></div><button class="btn danger" id="cf-del">Delete card</button>':""}
      <div style="height:8px"></div>
      <button class="btn ghost" id="cf-cancel">Cancel</button>
    </div>`;
  go("add");
  $("#cf-w").oninput=e=>{ // live tone preview via pinyin-pro if empty
    const w=e.target.value.trim();
    if(w&&!$("#cf-p").value){const hit=dictMap[w];if(hit){$("#cf-p").value=hit.p;if(!$("#cf-m").value)$("#cf-m").value=hit.m;if(!$("#cf-z").value){$("#cf-z").value=hit.s.z;$("#cf-y").value=hit.s.y;$("#cf-e").value=hit.s.e}}
      else{const gp=hfPinyin(w);if(gp)$("#cf-p").value=gp;}}
  };
  $("#cf-save").onclick=()=>{
    const data={w:$("#cf-w").value.trim(),p:$("#cf-p").value.trim(),m:$("#cf-m").value.trim(),h:+$("#cf-h").value,
      s:{z:$("#cf-z").value.trim(),y:$("#cf-y").value.trim(),e:$("#cf-e").value.trim()}};
    if(!data.w)return toast("Word is required");
    if(isNew){
      const did=S.decks.length?($("#cf-d").value||deckId):null;
      if(!did){toast("Create a deck first");return}
      S.cards.push(Object.assign({id:uid(),deckId:did,srs:newSRS(),auto:false},data));
    }else Object.assign(c,data);
    save();toast(isNew?"Card added":"Saved");
    deckId=c.deckId||deckId;if(deckId)openWeek(deckId);else go("browse");
  };
  if(!isNew)$("#cf-del").onclick=()=>{if(confirm("Delete this card?")){S.cards=S.cards.filter(x=>x.id!==c.id);save();if(c.deckId)openWeek(c.deckId);else go("browse")}};
  $("#cf-cancel").onclick=()=>{const did=c.deckId||deckId;if(did)openWeek(did);else go("browse")};
}
$("#btn-add-card").onclick=()=>{if(!S.decks.length){toast("Create a deck first");go("weeks")}else cardForm(null,S.decks[S.decks.length-1].id)};
/* ============ study (flashcard flip) ============ */
let session=null;
function startStudy(deckId){
  const q=studyQueue(deckId);
  if(!q.length){
    $("#study-flow").innerHTML=`<div class="card summary"><div class="emoji">🎉</div>
      <h2>All caught up!</h2><p class="muted">No cards due${deckId?" in this deck":""}. Add new words or come back later.</p>
      <button class="btn" data-go="weeks">Go to Decks</button></div>`;
    go("study");return;
  }
  session={queue:q.slice(),i:0,ok:0,total:q.length,t0:Date.now(),flipped:false};
  go("study");renderStudyCard();
}
function renderStudyCard(){
  const c=session.queue[session.i];
  const pos=`${session.i+1} / ${session.queue.length}`;
  $("#study-flow").innerHTML=`
    <div class="row between" style="margin-top:8px"><button class="btn ghost small" id="st-exit">✕ Exit</button><span class="muted">${pos}</span></div>
    <div class="study-wrap"><div class="flip" id="flip">
      <div class="face front">
        <div class="big-hanzi zh">${colorHanzi(c.w,c.p)}</div>
        <button class="audio-btn" data-say="${esc(c.w)}">🔊</button>
        <div class="flip-hint">Tap the card to reveal</div>
      </div>
      <div class="face back">
        <div class="py-line">${colorPinyin(c.p)}</div>
        <div class="mean">${esc(c.m)}</div>
        ${c.s&&c.s.z?`<div class="example">
          <div class="row" style="justify-content:center"><div class="ez zh">${colorHanzi(c.s.z,c.s.y)}</div>
          <button class="audio-btn small" data-say="${esc(c.s.z)}">🔊</button></div>
          <div class="ep">${colorPinyin(c.s.y)}</div><div class="ee">${esc(c.s.e)}</div></div>`:""}
        <div class="flip-hint">HSK ${c.h} · ${stageOf(c)}</div>
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
  flip.onclick=e=>{if(e.target.closest(".audio-btn"))return;flip.classList.toggle("flipped");session.flipped=!session.flipped};
  $("#study-flow").querySelectorAll("[data-say]").forEach(b=>b.onclick=e=>{e.stopPropagation();speak(b.dataset.say)});
  $("#st-exit").onclick=()=>go("home");
  $("#study-flow").querySelectorAll(".grade").forEach(b=>b.onclick=()=>{
    if(!session.flipped){flip.classList.add("flipped");session.flipped=true;return}
    const q=+b.dataset.q;
    gradeCard(c,q);
    if(q>0)session.ok++;
    if(q===0){ // requeue within session
      session.queue.push(c);
    }
    session.i++;
    if(session.i>=session.queue.length){finishSession();return}
    renderStudyCard();
  });
}
function finishSession(){
  const mins=Math.max(1,Math.round((Date.now()-session.t0)/60000));
  const acc=session.i?Math.round(session.ok/session.i*100):0;
  $("#study-flow").innerHTML=`<div class="card summary pop"><div class="emoji">🏁</div>
    <h2>Session complete!</h2>
    <p>${session.i} cards reviewed · ${acc}% remembered · ${mins} min</p>
    <button class="btn" data-go="home">Back home</button>
    <div style="height:8px"></div>
    <button class="btn ghost" data-go="study" onclick="startStudy(null)">Study again</button>
  </div>`;
}

/* ============ quiz ============ */
let quiz=null;
function startQuiz(deckId){
  const pool=(deckId?S.cards.filter(c=>c.deckId===deckId):S.cards).filter(c=>c.m);
  if(pool.length<4){toast("Need at least 4 cards for a quiz");return}
  const shuffled=pool.slice().sort(()=>Math.random()-0.5);
  quiz={deckId,pool,items:shuffled.slice(0,Math.min(15,shuffled.length)),i:0,ok:0,t0:Date.now()};
  go("quiz");renderQuiz();
}
function renderQuiz(){
  const c=quiz.items[quiz.i];
  const reverse=Math.random()<0.5; // English → hanzi
  const distract=quiz.pool.filter(x=>x.id!==c.id).sort(()=>Math.random()-0.5).slice(0,3);
  const opts=distract.concat([c]).sort(()=>Math.random()-0.5);
  $("#quiz-flow").innerHTML=`
    <div class="row between" style="margin-top:8px"><button class="btn ghost small" id="qz-exit">✕ Exit</button>
    <span class="muted">${quiz.i+1} / ${quiz.items.length}</span></div>
    <div class="card" style="text-align:center;padding:28px 16px">
      <div class="muted" style="margin-bottom:8px">${reverse?"Pick the matching Chinese word":"What does this word mean?"}</div>
      ${reverse?`<div style="font-size:22px;font-weight:600">${esc(c.m)}</div>`
        :`<div class="big-hanzi zh" style="font-size:52px">${colorHanzi(c.w,c.p)}</div>
          <button class="audio-btn" data-say="${esc(c.w)}">🔊</button>`}
    </div>
    <div id="qz-opts">
      ${opts.map(o=>`<button class="quiz-opt" data-id="${o.id}">${reverse?`<span class="zh" style="font-size:20px">${colorHanzi(o.w,o.p)}</span> <span class="muted">${colorPinyin(o.p)}</span>`:esc(o.m)}</button>`).join("")}
    </div>`;
  const sayBtn=$("#quiz-flow [data-say]");if(sayBtn)sayBtn.onclick=()=>speak(sayBtn.dataset.say);
  $("#qz-exit").onclick=()=>go("home");
  $("#qz-opts").querySelectorAll(".quiz-opt").forEach(b=>b.onclick=()=>{
    const good=b.dataset.id===c.id;
    b.classList.add(good?"correct":"wrong");
    if(good){b.classList.add("pop");quiz.ok++;gradeCard(c,2)}
    else{gradeCard(c,0);const right=$("#qz-opts").querySelector(`[data-id="${c.id}"]`);right.classList.add("correct")}
    $("#qz-opts").querySelectorAll(".quiz-opt").forEach(x=>x.disabled=true);
    setTimeout(()=>{
      quiz.i++;
      if(quiz.i>=quiz.items.length)finishQuiz();else renderQuiz();
    },good?600:1400);
  });
}
function finishQuiz(){
  const mins=Math.max(1,Math.round((Date.now()-quiz.t0)/60000));
  const acc=Math.round(quiz.ok/quiz.items.length*100);
  $("#quiz-flow").innerHTML=`<div class="card summary pop"><div class="emoji">${acc>=80?"🏆":acc>=50?"💪":"📚"}</div>
    <h2>Quiz complete!</h2>
    <p>${quiz.ok} / ${quiz.items.length} correct · ${acc}% · ${mins} min</p>
    <button class="btn" data-go="home">Back home</button>
    <div style="height:8px"></div>
    <button class="btn ghost" onclick="startQuiz(${quiz.deckId?("'"+quiz.deckId+"'"):"null"})">Retry quiz</button>
  </div>`;
}
/* ============ browse ============ */
let browseH=0;
function renderBrowse(){
  const fs=[0,1,2,3,4];
  $("#browse-filters").innerHTML=fs.map(h=>`<span class="pill ${browseH===h?"on":""}" data-h="${h}">${h===0?"All levels":"HSK "+h}</span>`).join("");
  $("#browse-filters").querySelectorAll(".pill").forEach(p=>p.onclick=()=>{browseH=+p.dataset.h;renderBrowse()});
  const q=($("#browse-search").value||"").trim().toLowerCase();
  let list=S.cards.filter(c=>!browseH||c.h===browseH);
  if(q)list=list.filter(c=>c.w.includes(q)||(c.p||"").toLowerCase().includes(q)||(c.m||"").toLowerCase().includes(q));
  $("#browse-list").innerHTML=list.slice(0,200).map(cardRowHTML).join("")||'<div class="empty">No matching cards.</div>';
  if(list.length>200)$("#browse-list").innerHTML+=`<div class="muted" style="padding:10px">…and ${list.length-200} more. Use search to narrow down.</div>`;
  bindCardRows("#browse-list");
}
$("#browse-search").oninput=()=>renderBrowse();

/* ============ stats ============ */
let charts=[];
function renderStats(){
  charts.forEach(ch=>ch.destroy());charts=[];
  if(!window.Chart){document.querySelectorAll("#scr-stats canvas").forEach(c=>c.replaceWith("Charts need internet (Chart.js CDN)."));return}
  const days=[],counts=[];
  for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*DAY),k=todayStr(d);
    days.push((d.getMonth()+1)+"/"+d.getDate());counts.push((S.reviews[k]||{n:0}).n)}
  charts.push(new Chart($("#ch-reviews"),{type:"bar",data:{labels:days,datasets:[{data:counts,backgroundColor:"#0d9488"}]},
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}));
  // cumulative reviews (proxy for words practiced over time)
  let run=0;const cumSeries=counts.map(n=>run+=n);
  charts.push(new Chart($("#ch-cum"),{type:"line",data:{labels:days,datasets:[{data:cumSeries,borderColor:"#0d9488",tension:.3,fill:true,backgroundColor:"rgba(13,148,136,.12)"}]},
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}));
  const st={New:0,Learning:0,Reviewing:0,Mastered:0};S.cards.forEach(c=>st[stageOf(c)]++);
  charts.push(new Chart($("#ch-mastery"),{type:"doughnut",
    data:{labels:Object.keys(st),datasets:[{data:Object.values(st),backgroundColor:["#94a3b8","#f59e0b","#3b82f6","#22c55e"]}]},
    options:{plugins:{legend:{position:"bottom"}}}}));
}

/* ============ settings ============ */
function renderSettings(){
  $("#set-target").value=S.settings.target;
  $("#set-newcap").value=S.settings.newCap;
  $("#set-dark").checked=S.settings.theme==="dark";
  $("#import-mode").innerHTML="";
}
$("#set-target").onchange=e=>{S.settings.target=Math.max(1,+e.target.value||20);save();toast("Daily target saved")};
$("#set-newcap").onchange=e=>{S.settings.newCap=Math.max(0,+e.target.value||15);save();toast("New-card cap saved")};
$("#set-dark").onchange=e=>{setTheme(e.target.checked?"dark":"light")};
$("#btn-export").onclick=()=>{
  const blob=new Blob([JSON.stringify(S,null,1)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="hanziflow-backup-"+todayStr()+".json";a.click();URL.revokeObjectURL(a.href);
  toast("Backup downloaded");
};
$("#file-import").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    let data;try{data=JSON.parse(r.result)}catch(x){toast("Invalid JSON file");return}
    if(!data||!Array.isArray(data.decks)||!Array.isArray(data.cards)){toast("Not a HanziFlow backup");return}
    const mode=confirm("OK = REPLACE all current data with this backup.\nCancel = MERGE (add decks/cards you don't already have).");
    if(mode){S=Object.assign(defaultState(),data)}
    else{
      const deckIds=new Set(S.decks.map(d=>d.id));
      data.decks.forEach(d=>{if(!deckIds.has(d.id))S.decks.push(d)});
      const cardIds=new Set(S.cards.map(c=>c.id));
      data.cards.forEach(c=>{if(!cardIds.has(c.id))S.cards.push(c)});
      if(data.settings)S.settings=Object.assign(S.settings,data.settings);
      if(data.reviews)Object.assign(S.reviews,data.reviews);
      if(data.streak&&(data.streak.count||0)>(S.streak.count||0))S.streak=data.streak;
    }
    save();setTheme(S.settings.theme);toast("Backup imported");go("home");
  };
  r.readAsText(f);e.target.value="";
};
$("#btn-reset").onclick=()=>{
  if(!confirm("Erase ALL decks, cards and progress? This cannot be undone."))return;
  if(!confirm("Really delete everything?"))return;
  S=defaultState();save();setTheme("light");toast("All data erased");go("home");
};
$("#theme-toggle").onclick=()=>setTheme(S.settings.theme==="dark"?"light":"dark");
function setTheme(t){
  S.settings.theme=t;save();
  document.documentElement.setAttribute("data-theme",t);
  $("#theme-toggle").textContent=t==="dark"?"☀️":"🌙";
  const cb=$("#set-dark");if(cb)cb.checked=t==="dark";
}

/* ============ init ============ */
load();
setTheme(S.settings.theme||"light");
go("home");

/* ============ boot guard ============ */
(function(){
  const missing=[];
  if(Array.isArray(window.HF_MISSING_DEPS)&&window.HF_MISSING_DEPS.length)missing.push(...window.HF_MISSING_DEPS);
  if(typeof window.pinyinPro==="undefined"&&!missing.includes("pinyin-pro"))missing.push("pinyin-pro");
  if(typeof window.Chart==="undefined"&&!missing.includes("chart.js"))missing.push("chart.js");
  if(typeof window.HF_DATA==="undefined"&&!missing.includes("dictionary data"))missing.push("dictionary data (data/dictionary.js)");
  if(!missing.length)return;
  console.warn("[HanziFlow] missing dependencies: "+missing.join(", "));
  const banner=document.createElement("div");
  banner.style.cssText="position:fixed;top:0;left:0;right:0;z-index:999;background:#e05252;color:#fff;padding:8px 14px;font-size:13px;text-align:center";
  banner.textContent="Some features are unavailable ("+missing.join(", ")+" failed to load). Check your connection and reload.";
  document.body.appendChild(banner);
  setTimeout(()=>{banner.style.transition="opacity .4s";banner.style.opacity="0";setTimeout(()=>banner.remove(),450)},6000);
})();
