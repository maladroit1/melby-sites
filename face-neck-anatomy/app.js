// HERO: the anatomical specimen is the interface's central reference point.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const slug = name => name.replace(/\.[lr]$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const vector = p => new THREE.Vector3(...p);
const validPoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const colors = { skin:0xcda98f, muscle:0xa85f5b, bone:0xe5dfca, tooth:0xffffff, cartilage:0xa9cfdf, gland:0xbb9972, eye:0xf2f2ed, artery:0xe6504e, vein:0x548cde, nerve:0xf3d459, injection:0x55c5b0 };
const titles = {skin:'Skin',muscle:'Muscles',bone:'Bones',tooth:'Teeth',cartilage:'Cartilage',gland:'Glands',eye:'Eyes',artery:'Arteries',vein:'Veins',nerve:'Nerves',injection:'Injection'};
const layers = Object.fromEntries(Object.keys(colors).map(k => [k,{group:new THREE.Group(),enabled:true,opacity:k==='skin'?.25:1}]));
const structures = new Map(), pickables = [], debugLabels = [], pinObjects = [];
let manifest={}, landmarks={}, content={}, selected=null, isolated=false, pinMode=false, pendingPin=null;
let scene,camera,renderer,controls,headCenter,headRadius,flight=null,quiz=null;
let pins=readStorage('atlas-pins-v1',[]), score=readStorage('atlas-score-v1',{correct:0,total:0});
if (!Array.isArray(pins)) pins=[];
pins=pins.filter(p=>validPoint(p.point)&&typeof p.label==='string');
if (!Number.isInteger(score?.correct)||!Number.isInteger(score?.total)||score.correct<0||score.total<score.correct) score={correct:0,total:0};
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
let pointerStart=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

function readStorage(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function saveStorage(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{warn('Browser storage is unavailable. Pins and scores will last only for this session.');}}
function warn(message){$('errors').hidden=false;if(!$('errors').textContent.includes(message))$('errors').textContent+=($('errors').textContent?' · ':'')+message;}
async function readData(file,fallback){try{const r=await fetch(`data/${file}`);if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json();}catch(e){warn(`${file} could not be loaded (${e.message}). ${fallback===null?'The model needs this file.':'Available anatomy remains usable.'}`);return fallback;}}
function text(tag,value,parent,className){const n=document.createElement(tag);n.textContent=String(value);if(className)n.className=className;parent?.append(n);return n;}
function material(layer,color=colors[layer]){return new THREE.MeshStandardMaterial({color,roughness:.68,metalness:0,side:THREE.FrontSide,transparent:layer==='skin',opacity:layers[layer].opacity,depthWrite:layer!=='skin'});}
function register(mesh,id,name,layer,extra={}){
  let s=structures.get(id);
  if(!s){s={id,name,layer,meshes:[],...extra};structures.set(id,s);}
  s.meshes.push(mesh);s.box=null;mesh.userData.structure=id;mesh.userData.layer=layer;
  pickables.push(mesh);return s;
}
function bounds(s){if(!s.box){s.box=new THREE.Box3();s.meshes.forEach(m=>s.box.expandByObject(m));}return s.box.clone();}
function center(s){return bounds(s).getCenter(new THREE.Vector3());}
function canPick(m){const l=layers[m.userData.layer];return l.enabled&&l.opacity>.08&&(!isolated||m.userData.structure===selected);}
function refreshMaterials(){
  for(const [key,l] of Object.entries(layers)){
    l.group.visible=l.enabled;
    l.group.traverse(m=>{if(!m.isMesh)return;const chosen=m.userData.structure===selected;
      const ghost=isolated&&!chosen;
      const opacity=learn?.focus&&!learn.focus.has(m.userData.structure)?(key==='skin'?.15:.12):ghost?.08:l.opacity;
      m.material.opacity=opacity;m.material.transparent=opacity<1;m.material.depthWrite=opacity>=1;
      m.material.emissive.setHex(chosen?0x866137:0x000000);m.material.emissiveIntensity=chosen?.55:0;
      m.material.needsUpdate=true;
    });
  }
  $('isolate').disabled=!selected;$('isolate').setAttribute('aria-pressed',String(isolated));
}
function setupLayers(){
  for(const [key,l] of Object.entries(layers)){
    const row=text('div','',$('layers'),'layer'),top=text('div','',row,'layer-top');
    const label=text('label','',top),check=document.createElement('input');check.type='checkbox';check.checked=l.enabled;check.id=`layer-${key}`;label.append(check);
    const swatch=text('span','',label,'swatch');swatch.style.background=`#${colors[key].toString(16).padStart(6,'0')}`;text('span',titles[key],label);
    const output=text('output',`${Math.round(l.opacity*100)}%`,top);
    const range=document.createElement('input');range.type='range';range.min=0;range.max=1;range.step=.01;range.value=l.opacity;range.setAttribute('aria-label',`${titles[key]} opacity`);row.append(range);l.check=check;l.range=range;l.output=output;
    check.onchange=()=>{l.enabled=check.checked;refreshMaterials();layerQuizChanged();};
    range.oninput=()=>{l.opacity=Number(range.value);output.value=`${Math.round(l.opacity*100)}%`;refreshMaterials();layerQuizChanged();};
  }
}
function showPanel(id){for(const panel of ['layers-panel','info-panel'])$(panel).classList.toggle('open',panel===id&&!$(panel).classList.contains('open'));}
function endQuiz(){quiz=null;$('quiz-panel').hidden=true;$('quiz-toggle').setAttribute('aria-pressed','false');if(selected)renderInfo(structures.get(selected));}
function select(id,{fly=false,testing=false}={}){
  const s=structures.get(id);if(!s)return;
  if(!testing){endLearn();endQuiz();}selected=id;
  const l=layers[s.layer];l.enabled=true;l.check.checked=true;
  if(l.opacity<=.08){l.opacity=s.layer==='skin'?.25:1;l.range.value=l.opacity;l.output.value=`${Math.round(l.opacity*100)}%`;}
  refreshMaterials();$('label').textContent=testing?'Identify this structure':s.name;$('label').hidden=false;
  if(!testing){renderInfo(s);if(innerWidth<720){$('layers-panel').classList.remove('open');$('info-panel').classList.add('open');}}
  if(fly)flyTo(s);
}
function section(parent,title,value){
  if(value===undefined||value===null||value==='')return;
  text('h3',title,parent);
  if(Array.isArray(value)){const ul=text('ul','',parent);value.forEach(v=>text('li',v,ul));}
  else if(typeof value==='object'){for(const [k,v] of Object.entries(value))section(parent,k.replaceAll('_',' '),v);}
  else text('p',value,parent);
}
function renderInfo(s){
  const root=$('info');root.replaceChildren();if(!s)return;
  const entry=content[s.id]||{};text('span',titles[s.layer]||s.layer,root,'eyebrow');text('h2',entry.name||s.name,root);
  if(entry.summary)text('p',entry.summary,root);else text('p','Detailed study notes have not been added for this structure.',root,'muted');
  for(const key of ['origin','insertion','action','innervation','blood_supply','course','branches','relations'])section(root,key.replaceAll('_',' '),entry[key]);
  if(entry.injector_notes){const block=text('div','',root,'injector');text('h3','For injectors',block);for(const [key,value] of Object.entries(entry.injector_notes))section(block,key.replaceAll('_',' '),value);}
  if(s.zone){for(const key of ['product','depth','plane','notes','common_complications'])section(root,key.replaceAll('_',' '),s.zone[key]);for(const key of ['target_ids','danger_ids'])section(root,key==='target_ids'?'Related targets':'Nearby structures to study',s.zone[key]?.map(id=>content[id]?.name||structures.get(id)?.name||id));}
  const refs=[...new Set([...(entry.refs||[]),...(s.zone?.refs||[])])];if(refs.length)section(root,'References',refs);
}
function cameraMove(target,position){flight={start:performance.now(),from:camera.position.clone(),to:position.clone(),targetFrom:controls.target.clone(),targetTo:target.clone(),duration:reducedMotion?0:650};}
function flyTo(s){const b=bounds(s),c=b.getCenter(new THREE.Vector3());const direction=c.clone().sub(headCenter);direction.y*=.25;if(direction.length()<.005)direction.set(0,0,1);direction.normalize();const distance=Math.max(b.getSize(new THREE.Vector3()).length()*2,.12);cameraMove(c,c.clone().addScaledVector(direction,Math.min(distance,headRadius*5)));}
function preset(name){
  const directions={front:[0,0,1],left34:[1,0,1],right34:[-1,0,1],left:[1,0,0],right:[-1,0,0],reset:[0,0,1]};
  const v=vector(directions[name]).normalize();const aspect=renderer.domElement.clientWidth/renderer.domElement.clientHeight;
  const distance=headRadius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,1/aspect)*1.12;
  cameraMove(headCenter,headCenter.clone().addScaledVector(v,distance));
  $('view-name').textContent=({front:'ANTERIOR VIEW',left34:'LEFT THREE-QUARTER',right34:'RIGHT THREE-QUARTER',left:'LEFT LATERAL',right:'RIGHT LATERAL',reset:'ANTERIOR VIEW'})[name];
}
function searchRank(name,q){
  const words=slug(name).split('-'),query=slug(q).split('-');if(slug(name).startsWith(slug(q)))return 0;
  if(query.every(token=>words.some(w=>w.startsWith(token))))return 1;
  if(name.toLowerCase().includes(q.toLowerCase()))return 2;
  const compact=slug(name).replaceAll('-','');let i=0;for(const c of compact)if(c===slug(q).replaceAll('-','')[i])i++;
  return i===slug(q).replaceAll('-','').length?3:99;
}
function search(){
  const q=$('search').value.trim(),root=$('results');root.replaceChildren();root.hidden=!q;if(!q)return;
  const catalog=[...structures.values(),...Object.entries(content).filter(([id])=>!structures.has(id)).map(([id,e])=>({id,name:e.name||id,layer:e.type||'note',meshes:[]}))];
  const matches=catalog.map(s=>({s,rank:Math.min(searchRank(s.name,q),searchRank(content[s.id]?.name||s.name,q))})).filter(x=>x.rank<99).sort((a,b)=>a.rank-b.rank||a.s.name.localeCompare(b.s.name)).slice(0,12);
  for(const {s} of matches){const b=text('button',content[s.id]?.name||s.name,root);text('small',titles[s.layer]||s.layer,b);b.onclick=()=>{if(s.meshes.length)select(s.id,{fly:true});else{endLearn();endQuiz();selected=null;isolated=false;refreshMaterials();$('label').hidden=true;renderInfo(s);text('p','No geometry is linked to this study entry.',$('info'),'muted');if(innerWidth<720)$('info-panel').classList.add('open');}root.hidden=true;$('search').value='';};}
  if(!matches.length)text('p','No matching structures.',root,'muted');
}
function shuffled(array){return array.map(x=>({x,r:Math.random()})).sort((a,b)=>a.r-b.r).map(o=>o.x);}
function nextQuiz(){
  isolated=false;refreshMaterials();
  const visible=[...structures.values()].filter(s=>s.meshes.some(canPick));
  const eligible=visible.filter(s=>new Set(visible.filter(x=>x.layer===s.layer).map(x=>x.name)).size>=4);
  $('quiz-panel').hidden=false;$('quiz-toggle').setAttribute('aria-pressed','true');$('info-panel').classList.remove('open');$('layers-panel').classList.remove('open');
  $('score').textContent=`${score.correct} correct / ${score.total} answered`;$('choices').replaceChildren();$('quiz-feedback').textContent='';
  if(!eligible.length){quiz={id:null,answered:true};$('question').textContent='Enable a layer with at least four different structures to start.';$('label').hidden=true;return;}
  const s=shuffled(eligible)[0];quiz={id:s.id,answered:false};select(s.id,{testing:true,fly:true});
  $('info').replaceChildren();text('h2','Quiz in progress',$('info'));text('p','Choose a name to reveal the study notes.',$('info'));
  $('question').textContent='Which structure is highlighted?';
  const unique=[...new Map(visible.filter(x=>x.layer===s.layer&&x.name!==s.name).map(x=>[x.name,x])).values()];
  for(const choice of shuffled([s,...shuffled(unique).slice(0,3)])){
    const b=text('button',choice.name,$('choices'));b.onclick=()=>{
      if(quiz.answered)return;quiz.answered=true;score.total++;const correct=choice.id===s.id;if(correct)score.correct++;
      saveStorage('atlas-score-v1',score);$('score').textContent=`${score.correct} correct / ${score.total} answered`;
      $('quiz-feedback').textContent=correct?'Correct.':`The answer is ${s.name}.`;
      $('choices').querySelectorAll('button').forEach(n=>n.disabled=true);$('label').textContent=s.name;renderInfo(s);
    };
  }
}
function layerQuizChanged(){if(quiz)nextQuiz();}
function hit(event,skinOnly=false){
  const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  return raycaster.intersectObjects(pickables.filter(m=>canPick(m)&&(!skinOnly||m.userData.layer==='skin')),false)[0];
}
function placePin(pin){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.0015,12,8),new THREE.MeshBasicMaterial({color:0xe4be80,depthTest:false}));mesh.position.copy(vector(pin.point));mesh.renderOrder=20;scene.add(mesh);
  const label=text('div',pin.label,$('debug-labels'),'dot-label');pinObjects.push({mesh,label,pin});$('pin-count').textContent=pins.length;
}
function renderPins(){
  const root=$('pin-list');root.replaceChildren();if(!pins.length)text('p','Turn on Pin mode, then tap the skin to add a study point.',root);
  pins.forEach((p,i)=>{const row=text('div','',root,'pin-row');const go=text('button',p.label,row);go.onclick=()=>{const c=vector(p.point);cameraMove(c,c.clone().addScaledVector(camera.position.clone().sub(controls.target).normalize(),.18));$('pins-dialog').close();};const remove=text('button','Delete',row);remove.setAttribute('aria-label',`Delete ${p.label}`);remove.onclick=()=>{pins.splice(i,1);saveStorage('atlas-pins-v1',pins);const obj=pinObjects.splice(i,1)[0];scene.remove(obj.mesh);obj.mesh.geometry.dispose();obj.mesh.material.dispose();obj.label.remove();$('pin-count').textContent=pins.length;renderPins();};});
}
function bindUI(){
  $('search').oninput=search;$('search').onkeydown=e=>{if(e.key==='Escape')$('results').hidden=true;if(e.key==='Enter')$('results').querySelector('button')?.click();if(e.key==='ArrowDown'){$('results').querySelector('button')?.focus();e.preventDefault();}};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-wrap'))$('results').hidden=true;});
  $('views').onclick=e=>{if(e.target.dataset.view)preset(e.target.dataset.view);};
  $('isolate').onclick=()=>{isolated=!isolated;refreshMaterials();};
  $('layers-toggle').onclick=()=>showPanel('layers-panel');$('info-toggle').onclick=()=>showPanel('info-panel');
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.panel').classList.remove('open'));
  $('about').onclick=()=>$('about-dialog').showModal();$('quiz-toggle').onclick=()=>{if(quiz)endQuiz();else{setPinMode(false);nextQuiz();}};$('quiz-close').onclick=endQuiz;$('next').onclick=nextQuiz;
  $('pin-toggle').onclick=()=>setPinMode(!pinMode);$('pins-open').onclick=()=>{renderPins();$('pins-dialog').showModal();};
  $('pin-cancel').onclick=()=>{$('pin-dialog').close();pendingPin=null;};
  $('pin-form').onsubmit=e=>{e.preventDefault();const label=$('pin-name').value.trim();if(!label||!pendingPin)return;const pin={label,point:pendingPin.toArray()};pins.push(pin);placePin(pin);saveStorage('atlas-pins-v1',pins);pendingPin=null;$('pin-dialog').close();};
  const canvas=renderer.domElement;const activePointers=new Set();let multiple=false;
  canvas.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);multiple=activePointers.size>1;if(multiple)pointerStart=null;else pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};});
  canvas.addEventListener('pointercancel',e=>{activePointers.delete(e.pointerId);pointerStart=null;});
  canvas.addEventListener('pointerup',e=>{
    activePointers.delete(e.pointerId);const start=pointerStart;pointerStart=null;if(multiple||!start||start.id!==e.pointerId||Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;
    const intersection=hit(e,pinMode);if(!intersection)return;
    if(pinMode){pendingPin=intersection.point.clone();$('pin-name').value='';$('pin-dialog').showModal();$('pin-name').focus();}
    else select(intersection.object.userData.structure);
  });
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||pointerStart){$('hover').hidden=true;return;}const h=hit(e);const s=h&&structures.get(h.object.userData.structure);$('hover').hidden=!s?.zone||!!quiz;if(s?.zone){$('hover').textContent=s.name;const r=canvas.getBoundingClientRect();$('hover').style.left=`${Math.min(e.clientX-r.left+12,r.width-200)}px`;$('hover').style.top=`${e.clientY-r.top+12}px`;}});
  canvas.addEventListener('pointerleave',()=>{$('hover').hidden=true;});
}
function setPinMode(enabled){pinMode=enabled;if(enabled){endQuiz();isolated=false;const l=layers.skin;l.enabled=true;l.check.checked=true;if(l.opacity<=.08){l.opacity=.25;l.range.value=.25;l.output.value='25%';}refreshMaterials();}$('pin-toggle').setAttribute('aria-pressed',String(enabled));$('hint').textContent=enabled?'Tap the skin to label a study point.':'Drag to rotate · Scroll or pinch to zoom · Tap to inspect';}
function projectLabel(element,position){const p=position.clone().project(camera);element.hidden=p.z < -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;element.style.left=`${(p.x*.5+.5)*renderer.domElement.clientWidth}px`;element.style.top=`${(-p.y*.5+.5)*renderer.domElement.clientHeight}px`;}
let lastFrame=0;
function animate(now=performance.now()){
  lastFrame=now;requestAnimationFrame(animate);
  if(flight){const t=flight.duration?Math.min(1,(now-flight.start)/flight.duration):1;const eased=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,eased);controls.target.lerpVectors(flight.targetFrom,flight.targetTo,eased);if(t===1)flight=null;}
  if(learn?.pulse&&!reducedMotion){const scale=1+.18*Math.sin(now/220);structures.get(learn.pulse)?.meshes.forEach(m=>m.scale.setScalar(scale));}
  controls.update();renderer.render(scene,camera);
  if(selected){const s=structures.get(selected);if(s?.meshes.some(canPick))projectLabel($('label'),center(s));else $('label').hidden=true;}
  for(const d of debugLabels)projectLabel(d.label,d.position);
  for(const p of pinObjects)projectLabel(p.label,p.mesh.position);
}
// Learn mode: lesson content comes from the loaded atlas data.
let learn=null, learnZones=[], learnLessons=[];
let learnProgress=readStorage('atlas-learn-v1',{});
if(!learnProgress||typeof learnProgress!=='object'||Array.isArray(learnProgress))learnProgress={};
const learnName=id=>content[id]?.name||structures.get(id)?.name||id;
const learnType=id=>content[id]?.type||structures.get(id)?.layer;
function syncLearnLayers(){
  for(const l of Object.values(layers)){
    l.check.checked=l.enabled;l.range.value=l.opacity;l.output.value=`${Math.round(l.opacity*100)}%`;
  }
  refreshMaterials();
}
function resetLearnPulse(){
  if(learn?.pulse)structures.get(learn.pulse)?.meshes.forEach(m=>m.scale.setScalar(1));
}
function endLearn(){
  if(!learn)return;
  resetLearnPulse();
  for(const [key,state] of Object.entries(learn.saved))Object.assign(layers[key],state);
  learn=null;isolated=false;selected=null;flight=null;
  $('label').hidden=true;$('learn-panel').hidden=true;$('info-panel').hidden=false;
  $('learn-toggle').setAttribute('aria-pressed','false');syncLearnLayers();
}
function openLearn(){
  endQuiz();setPinMode(false);
  const saved=Object.fromEntries(Object.entries(layers).map(([key,l])=>[key,{enabled:l.enabled,opacity:l.opacity}]));
  learn={saved,focus:null,pulse:null,lesson:null};isolated=false;selected=null;
  $('label').hidden=true;$('hover').hidden=true;$('results').hidden=true;
  $('info-panel').hidden=true;$('layers-panel').classList.remove('open');
  $('learn-panel').hidden=false;$('learn-toggle').setAttribute('aria-pressed','true');
  renderLearnList();
}
function learnButton(label,parent,action){const b=text('button',label,parent);b.type='button';b.onclick=action;return b;}
function renderLearnList(){
  resetLearnPulse();learn.pulse=null;learn.focus=null;learn.lesson=null;selected=null;
  for(const [key,state] of Object.entries(learn.saved))Object.assign(layers[key],state);
  syncLearnLayers();
  const root=$('learn-content');root.replaceChildren();
  text('p',`${learnLessons.filter(l=>learnProgress[l.id]?.completed===true).length} / ${learnLessons.length} lessons`,root,'learn-progress');
  for(const group of ['Introduction','Neurotoxin','Filler','Both']){
    const lessons=learnLessons.filter(l=>l.group===group);if(!lessons.length)continue;
    text('h3',group,root);const list=text('div','',root,'learn-lessons');
    for(const lesson of lessons){
      const result=learnProgress[lesson.id];
      learnButton(`${result?.completed===true?'✓ ':''}${lesson.name}${result?.completed===true&&lesson.zone?` · Best ${Number(result.best)||0}%`:''}`,list,()=>startLesson(lesson));
    }
  }
  $('learn-panel').scrollTop=0;
}
function learnQuestions(zone){
  const questions=[],catalog=[...new Set([...Object.keys(content),...structures.keys()])];
  function add(prompt,correct,candidates){
    if(!correct)return;
    const unique=[...new Map(candidates.filter(c=>c.label!==correct.label).map(c=>[c.label,c])).values()];
    if(unique.length<3)return;
    questions.push({prompt,correct,options:shuffled([correct,...shuffled(unique).slice(0,3)]),answer:null});
  }
  const danger=shuffled(zone.danger_ids||[])[0];
  add(`Which structure makes the ${zone.name} risky?`,danger?{id:danger,label:learnName(danger)}:null,
    catalog.filter(id=>['artery','vein','nerve','vessel'].includes(learnType(id))&&!(zone.danger_ids||[]).includes(id)).map(id=>({id,label:learnName(id)})));
  const target=shuffled((zone.target_ids||[]).filter(id=>learnType(id)==='muscle'))[0];
  add(`Which muscle is the treatment target of ${zone.name}?`,target?{id:target,label:learnName(target)}:null,
    catalog.filter(id=>learnType(id)==='muscle'&&!(zone.target_ids||[]).includes(id)).map(id=>({id,label:learnName(id)})));
  add(`What depth is described for ${zone.name}?`,zone.depth?{label:zone.depth}:null,learnZones.filter(z=>z.depth).map(z=>({label:z.depth})));
  return questions;
}
function startLesson(lesson){
  learn.lesson=lesson;learn.index=0;learn.finished=false;
  learn.questions=lesson.zone?learnQuestions(lesson.zone):[];
  learn.steps=lesson.zone?[
    {kind:'orientation'},...(lesson.zone.target_ids||[]).map(id=>({kind:'target',id})),
    ...(lesson.zone.danger_ids||[]).map(id=>({kind:'danger',id})),{kind:'placement'},{kind:'check'}
  ]:['skin','muscle','artery','vein','nerve','injection'].map(layer=>({kind:'layer',layer}));
  renderLearnStep();
}
function fitLearnZone(zone){
  const points=(zone.anchor_landmarks||[]).map(id=>landmarks[id]).filter(validPoint).map(vector);
  const sphere=points.length?new THREE.Box3().setFromPoints(points).getBoundingSphere(new THREE.Sphere()):new THREE.Sphere(headCenter.clone(),headRadius);
  const halfFov=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  const distance=Math.max(.012,sphere.radius)*1.2/Math.sin(halfFov);
  const direction=camera.position.clone().sub(controls.target).normalize();
  cameraMove(sphere.center,sphere.center.clone().addScaledVector(direction,distance));
}
function applyLearnStep(step,zone){
  resetLearnPulse();learn.pulse=null;learn.focus=null;selected=null;$('label').hidden=true;
  for(const [key,l] of Object.entries(layers)){l.enabled=step.kind==='layer'?key===step.layer:true;l.opacity=key==='skin'?.15:1;}
  if(step.kind==='layer')layers[step.layer].opacity=1;
  else{
    const ids=step.kind==='target'?[step.id]:step.kind==='danger'?[step.id,zone.id]:step.kind==='orientation'?[zone.id]:[...(zone.target_ids||[]),...(zone.danger_ids||[]),zone.id];
    learn.focus=new Set(ids);learn.pulse=step.kind==='target'?null:zone.id;
    if(step.kind==='orientation')fitLearnZone(zone);
    if(step.id&&structures.has(step.id))flyTo(structures.get(step.id));
  }
  syncLearnLayers();
}
function renderLearnStep(){
  const step=learn.steps[learn.index],zone=learn.lesson.zone,root=$('learn-content');root.replaceChildren();
  applyLearnStep(step,zone);
  text('p',`Step ${learn.index+1} / ${learn.steps.length}`,root,'learn-progress');
  text('h2',learn.lesson.name,root);
  const labels={orientation:'Orientation',target:'Target structure',danger:'Danger structure',placement:'Placement',check:'Check yourself',layer:titles[step.layer]};
  text('h3',labels[step.kind],root,step.kind==='danger'?'learn-warning':'');
  if(step.kind==='layer'){
    const entry=Object.values(content).find(e=>e.type===step.layer&&e.summary);
    text('p',entry?.summary?.match(/[^.!?]+[.!?]?(?:\s|$)/)?.[0]?.trim()||`${titles[step.layer]} shown for orientation.`,root);
  }else if(step.kind==='orientation'){
    section(root,'Product',zone.product);section(root,'Summary',zone.summary);
  }else if(step.kind==='target'||step.kind==='danger'){
    const entry=content[step.id]||{},notes=entry.injector_notes||{};
    text('h2',learnName(step.id),root);
    if(step.kind==='target'){
      for(const key of ['origin','insertion','action','innervation'])section(root,key,entry[key]);
      section(root,'Relevance',notes.relevance);section(root,'Toxin targets',notes.toxin_targets);
    }else{
      section(root,'Course',typeof entry.course==='string'?(entry.course.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[entry.course]).slice(0,2).join(' ').trim():entry.course);
      section(root,'Danger zones',notes.danger_zones);section(root,'Depth tips',notes.depth_tips);
    }
    if(!structures.has(step.id))text('p','No geometry is linked to this study entry.',root,'muted');
  }else if(step.kind==='placement'){
    for(const key of ['depth','plane','notes','common_complications'])section(root,key.replaceAll('_',' '),zone[key]);
  }else renderLearnCheck(root);
  const nav=text('div','',root,'button-grid learn-nav');
  learnButton('Back',nav,()=>moveLearn(-1)).disabled=learn.index===0;
  const next=learnButton(learn.index===learn.steps.length-1?'Finish lesson':'Next',nav,()=>moveLearn(1));
  next.disabled=step.kind==='check'&&learn.questions.some(q=>q.answer===null);
  next.id='learn-next';
  learnButton('Restart lesson',root,()=>startLesson(learn.lesson));
  learnButton('Back to lessons',root,renderLearnList);
  $('learn-panel').scrollTop=0;
}
function highlightLearnAnswer(question){
  const id=question.correct.id;if(!id)return;
  selected=id;learn.focus=new Set([id,learn.lesson.zone.id]);
  const s=structures.get(id);if(s){layers[s.layer].enabled=true;layers[s.layer].opacity=1;}
  syncLearnLayers();
  if(s){$('label').textContent=learnName(id);$('label').hidden=false;}
}
function renderLearnCheck(root){
  const scoreText=text('p','',root,'learn-progress');scoreText.setAttribute('role','status');
  const updateScore=()=>{scoreText.textContent=`${learn.questions.filter(q=>q.answer===q.correct).length} / ${learn.questions.length} correct · ${learn.questions.filter(q=>q.answer!==null).length} answered`;};
  updateScore();
  if(!learn.questions.length)text('p','The available data cannot supply four distinct choices for a check.',root,'muted');
  learn.questions.forEach(q=>{
    const block=text('fieldset','',root,'learn-question');text('legend',q.prompt,block);
    const feedback=text('p','',block);feedback.setAttribute('role','status');
    const buttons=q.options.map(option=>{
      const b=learnButton(option.label,block,()=>{if(q.answer!==null)return;q.answer=option;paint();highlightLearnAnswer(q);updateScore();$('learn-next').disabled=learn.questions.some(item=>item.answer===null);});
      return {b,option};
    });
    function paint(){
      if(q.answer===null)return;
      for(const {b,option} of buttons){b.disabled=true;b.classList.toggle('learn-correct',option===q.correct);b.classList.toggle('learn-wrong',option===q.answer&&option!==q.correct);}
      feedback.textContent=q.answer===q.correct?'Correct.':`Correct answer: ${q.correct.label}`;
    }
    paint();
  });
}
function moveLearn(delta){
  if(!learn?.lesson||learn.finished)return;
  if(delta<0){if(learn.index>0){learn.index--;renderLearnStep();}return;}
  if(learn.steps[learn.index].kind==='check'&&learn.questions.some(q=>q.answer===null))return;
  if(learn.index<learn.steps.length-1){learn.index++;renderLearnStep();return;}
  const correct=learn.questions.filter(q=>q.answer===q.correct).length;
  const best=learn.questions.length?Math.round(correct/learn.questions.length*100):0;
  const id=learn.lesson.id,previous=Number(learnProgress[id]?.best)||0;
  learnProgress[id]={completed:true,best:Math.max(previous,best)};saveStorage('atlas-learn-v1',learnProgress);
  learn.finished=true;
  const root=$('learn-content');root.replaceChildren();text('h2','Lesson completed',root);
  if(learn.questions.length)text('p',`${correct} / ${learn.questions.length} correct · Best ${learnProgress[id].best}%`,root);
  learnButton('Restart lesson',root,()=>startLesson(learn.lesson));learnButton('Back to lessons',root,renderLearnList);
}
function setupLearn(zones){
  learnZones=zones.map(z=>({...content[z.id],...z}));
  learnLessons=[{id:'layers-danger-map',name:'Layers & danger map',group:'Introduction'},...learnZones.map(zone=>({id:zone.id,name:zone.name,zone,group:({neurotoxin:'Neurotoxin',filler:'Filler',both:'Both'})[zone.product]||'Both'}))];
  $('learn-toggle').disabled=false;
  $('learn-toggle').onclick=()=>learn?endLearn():openLearn();$('learn-close').onclick=endLearn;
  // End the pass before the destination tool reads or changes layer settings.
  for(const id of ['layers-toggle','info-toggle','quiz-toggle','pin-toggle','pins-open','about','views','isolate','layers'])$(id).addEventListener('click',endLearn,true);
  document.addEventListener('keydown',e=>{
    if(!learn||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();moveLearn(e.key==='ArrowRight'?1:-1);}
  });
}

async function start(){
  [manifest,landmarks,content]=await Promise.all([readData('manifest.json',null),readData('landmarks.json',{}),readData('content.json',{})]);
  if(!manifest)throw Error('Cannot display anatomy without data/manifest.json.');
  const [paths,injection]=await Promise.all([readData('paths.json',{paths:[]}),readData('injection.json',{zones:[]})]);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.001,20);
  renderer=new THREE.WebGLRenderer({canvas:$('viewer'),antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
  scene.add(new THREE.HemisphereLight(0xfff2dc,0x52636c,2));const key=new THREE.DirectionalLight(0xffeedb,3);key.position.set(1,3,3);scene.add(key);const fill=new THREE.DirectionalLight(0xbacddd,2);fill.position.set(-2,1,-1);scene.add(fill);
  for(const [name,l] of Object.entries(layers)){l.group.name=name;scene.add(l.group);}
  const headBox=new THREE.Box3();for(const m of Object.values(manifest))if(['skin','bone'].includes(m.layer)&&m.bbox?.every(validPoint))m.bbox.forEach(p=>headBox.expandByPoint(vector(p)));
  if(headBox.isEmpty())throw Error('Manifest has no valid skin or bone bounds.');headCenter=headBox.getCenter(new THREE.Vector3());headRadius=headBox.getSize(new THREE.Vector3()).length()/2;
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.target.copy(headCenter);controls.minDistance=.025;controls.maxDistance=headRadius*12;controls.addEventListener('start',()=>{flight=null;});
  setupLayers();bindUI();
  function resize(){const c=renderer.domElement;renderer.setSize(c.clientWidth,c.clientHeight,false);camera.aspect=c.clientWidth/c.clientHeight;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe($('stage'));resize();preset('front');requestAnimationFrame(animate);setInterval(()=>{if(performance.now()-lastFrame>250)animate();},100);
  const gltf=await new GLTFLoader().loadAsync('model/head-neck.glb',e=>{if(e.total)$('progress').value=e.loaded/e.total*85;$('loading-text').textContent=e.total?`Loading model · ${Math.round(e.loaded/e.total*100)}%`:`Loading model · ${(e.loaded/1048576).toFixed(1)} MB`;});
  gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(m=>{if(m.isMesh)meshes.push(m);});let missing=0;
  // GLTFLoader sanitizes periods and parentheses in node names. Map both forms.
  const names=new Map(Object.keys(manifest).map(name=>[THREE.PropertyBinding.sanitizeNodeName(name),name]));
  for(const mesh of meshes){const name=manifest[mesh.name]?mesh.name:names.get(mesh.name);const m=manifest[name];if(!m||!layers[m.layer]){missing++;continue;}mesh.material=material(m.layer);const world=mesh.matrixWorld.clone();mesh.removeFromParent();world.decompose(mesh.position,mesh.quaternion,mesh.scale);layers[m.layer].group.add(mesh);register(mesh,slug(m.base),m.base,m.layer);}
  if(missing)warn(`${missing} model meshes had no matching manifest entry.`);
  for(const p of paths.paths||[]){
    if(!['artery','vein','nerve'].includes(p.layer)||!p.points?.every(validPoint)||p.points.length<3||!(p.radius_mm>0)){warn(`Skipped invalid path: ${p.id||'unnamed'}.`);continue;}
    const curve=new THREE.CatmullRomCurve3(p.points.map(vector));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(24,p.points.length*8),p.radius_mm/1000,8,false),material(p.layer));layers[p.layer].group.add(mesh);register(mesh,p.id,p.name,p.layer);
  }
  for(const zone of injection.zones||[]){for(const anchor of zone.anchor_landmarks||[]){const point=landmarks[anchor];if(!validPoint(point)){warn(`Missing landmark ${anchor} for ${zone.name}.`);continue;}const color=zone.product==='neurotoxin'?0xb694f4:0x55c5b0;const mesh=new THREE.Mesh(new THREE.SphereGeometry(.0025,16,12),material('injection',color));mesh.position.copy(vector(point));layers.injection.group.add(mesh);register(mesh,zone.id,zone.name,'injection',{zone});}}
  if(new URLSearchParams(location.search).get('debug')==='1')for(const [id,p] of Object.entries(landmarks)){if(!validPoint(p))continue;const position=vector(p),dot=new THREE.Mesh(new THREE.SphereGeometry(.0008,8,6),new THREE.MeshBasicMaterial({color:0xffc76f,depthTest:false}));dot.position.copy(position);dot.renderOrder=30;scene.add(dot);debugLabels.push({position,label:text('div',id,$('debug-labels'),'dot-label')});}
  setupLearn(injection.zones||[]);pins.forEach(placePin);refreshMaterials();$('progress').value=100;$('loading').hidden=true;
}
start().catch(error=>{console.error(error);$('loading').hidden=true;warn(`Viewer could not finish loading: ${error.message}. Serve this directory with python3 -m http.server and check that the model and data files are present.`);});

