(()=> {
const $=id=>document.getElementById(id);
let db,items=[],kind="photo",tab="all",selected=new Set(),view="home";
const status=s=>{$("status").textContent=s;};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isKind=x=>x.kind||((x.type||"").startsWith("video/")?"video":"photo");
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open("MyPhotoGalleryProDB",1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("media")){const st=d.createObjectStore("media",{keyPath:"id",autoIncrement:true});st.createIndex("createdAt","createdAt");}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function store(mode="readonly"){return db.transaction("media",mode).objectStore("media");}
function all(){return new Promise((resolve,reject)=>{const r=store().getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function save(x){return new Promise((resolve,reject)=>{const r=store("readwrite").put(x);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
function del(id){return new Promise((resolve,reject)=>{const r=store("readwrite").delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
async function reload(){items=await all();items.forEach(x=>{if(!x.kind)x.kind=isKind(x);if(!x.status)x.status="unused";if(typeof x.deleted!=="boolean")x.deleted=false;});await updateDashboard();if(view==="media")await render();}
async function updateDashboard(){
 const live=items.filter(x=>!x.deleted);
 $("photoSummary").textContent=`${live.filter(x=>isKind(x)==="photo").length} ছবি · Used ${live.filter(x=>isKind(x)==="photo"&&x.status==="used").length} · Unused ${live.filter(x=>isKind(x)==="photo"&&x.status!=="used").length}`;
 $("videoSummary").textContent=`${live.filter(x=>isKind(x)==="video").length} ভিডিও · Used ${live.filter(x=>isKind(x)==="video"&&x.status==="used").length} · Unused ${live.filter(x=>isKind(x)==="video"&&x.status!=="used").length}`;
}
function showHome(){view="home";$("homeView").classList.remove("hidden");$("mediaView").classList.add("hidden");selected.clear();}
async function openMedia(k){kind=k;tab="all";view="media";selected.clear();$("homeView").classList.add("hidden");$("mediaView").classList.remove("hidden");$("mediaTitle").textContent=k==="photo"?"All Pictures":"All Videos";$("uploadLabel").textContent=k==="photo"?"＋ ছবি Upload":"＋ ভিডিও Upload";$("mediaInput").accept=k==="photo"?"image/*":"video/*";$("search").value="";document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab==="all"));await render();}
function matchesTab(x){if(tab==="trash")return !!x.deleted;if(x.deleted)return false;if(tab==="used")return x.status==="used";if(tab==="unused")return x.status!=="used";return true;}
async function render(){
 const q=$("search").value.trim().toLowerCase();
 const shown=items.filter(x=>isKind(x)===kind&&matchesTab(x)).filter(x=>!q||String(x.serial||x.id).includes(q)||(x.name||"").toLowerCase().includes(q)).sort((a,b)=>(a.serial||a.id)-(b.serial||b.id));
 $("mediaCount").textContent=`${shown.length} টি ${kind==="photo"?"ছবি":"ভিডিও"}`;
 $("selectedCount").textContent=`${selected.size} নির্বাচিত`;
 const g=$("gallery");g.innerHTML="";
 if(!shown.length){g.innerHTML=`<div class="empty">এই বিভাগে কোনো ${kind==="photo"?"ছবি":"ভিডিও"} নেই।<br>উপরের Upload বাটনে চাপ দিয়ে যোগ করো।</div>`;return;}
 for(const x of shown){
  const url=URL.createObjectURL(x.blob);
  const media=kind==="video"?`<video controls playsinline preload="metadata" src="${url}"></video>`:`<img loading="lazy" src="${url}" alt="${esc(x.name)}">`;
  const el=document.createElement("article");el.className="item";
  const captionText=[x.caption||"",x.hashtags||""].filter(Boolean).join("\n");
  el.innerHTML=`<div class="row" style="justify-content:space-between"><div class="serial">#${x.serial||x.id} · ${kind==="photo"?"ছবি":"ভিডিও"}</div><label class="small"><input type="checkbox" data-select="${x.id}" ${selected.has(x.id)?"checked":""}> Select</label></div>
  ${media}<div class="muted small" style="overflow-wrap:anywhere;margin-top:7px">${esc(x.name||"")}</div>
  <div class="caption">${esc(captionText||"এখনো Caption/Hashtag যোগ করা হয়নি।")}</div>
  <textarea class="hidden" data-editor="${x.id}" placeholder="এক লাইনে Caption লিখুন। পরের লাইনে সর্বোচ্চ ৫টি Hashtag দিন।">${esc(captionText)}</textarea>
  <div class="row">
   <button data-act="edit" data-id="${x.id}" class="gray">Edit</button><button data-act="copy" data-id="${x.id}">Copy</button>
   ${x.deleted?`<button data-act="restore" data-id="${x.id}" class="gray">Restore</button><button data-act="purge" data-id="${x.id}" class="red">Delete Forever</button>`:`<button data-act="move" data-id="${x.id}" class="gray">${x.status==="used"?"Unused":"Used"}</button><button data-act="trash" data-id="${x.id}" class="red">Recycle</button>`}
   <button data-act="share" data-id="${x.id}" class="gray">Facebook Share</button>
  </div>
  <div class="row hidden" data-savebox="${x.id}"><button data-act="save" data-id="${x.id}">Save Caption</button><span class="muted small">Caption ও Hashtag আলাদা লাইনে লিখবে</span></div>`;
  g.appendChild(el);
 }
}
async function upload(list){
 const accepted=list.filter(f=>kind==="photo"?f.type.startsWith("image/"):f.type.startsWith("video/"));
 if(!accepted.length)return;
 for(const f of accepted){
  status(`সংরক্ষণ হচ্ছে: ${f.name}`);
  const current=await all();const serial=current.reduce((m,x)=>Math.max(m,x.serial||0),0)+1;
  await save({serial,name:f.name,kind,blob:f,caption:"",hashtags:"",status:"unused",deleted:false,createdAt:Date.now()});
 }
 status(`${accepted.length} টি ${kind==="photo"?"ছবি":"ভিডিও"} এই ফোনের ব্রাউজারে সংরক্ষিত হয়েছে।`);
 await reload();
}
async function shareItems(arr){
 if(!arr.length){status("আগে ফাইল নির্বাচন করো।");return;}
 const files=arr.map(x=>new File([x.blob],x.name||`${isKind(x)}-${x.serial||x.id}`,{type:x.blob.type||"application/octet-stream"}));
 const text=arr.map(x=>[x.caption||"",x.hashtags||""].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
 try{
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files})))await navigator.share({title:"My Photo Gallery Pro",text,files});
  else if(arr.length===1){const a=document.createElement("a");a.href=URL.createObjectURL(arr[0].blob);a.download=arr[0].name||"media";a.click();status("এই ব্রাউজারে সরাসরি Share সমর্থিত নয়; ফাইল ডাউনলোড হয়েছে।");}
  else status("এই ব্রাউজারে একসঙ্গে একাধিক ফাইল Share সমর্থিত নয়।");
 }catch(e){if(e.name!=="AbortError")status("Share করা যায়নি: "+e.message);}
}
$("homeView").addEventListener("click",e=>{const b=e.target.closest("[data-open]");if(b)openMedia(b.dataset.open);});
$("backHome").onclick=showHome;
$("mediaInput").onchange=e=>upload([...e.target.files]).finally(()=>e.target.value="");
$("search").oninput=render;
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;selected.clear();document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));render();});
$("gallery").onclick=async e=>{
 const cb=e.target.closest("[data-select]");
 if(cb){const id=Number(cb.dataset.select);cb.checked?selected.add(id):selected.delete(id);$("selectedCount").textContent=`${selected.size} নির্বাচিত`;return;}
 const b=e.target.closest("button");if(!b)return;
 const id=Number(b.dataset.id),x=items.find(y=>y.id===id);if(!x)return;
 switch(b.dataset.act){
 case"edit":{const ta=document.querySelector(`[data-editor="${id}"]`),box=document.querySelector(`[data-savebox="${id}"]`);ta.classList.remove("hidden");box.classList.remove("hidden");break;}
 case"save":{const ta=document.querySelector(`[data-editor="${id}"]`);const lines=ta.value.split(/\r?\n/);x.hashtags=lines.filter(s=>s.trim().startsWith("#")).join(" ").split(/\s+/).filter(Boolean).slice(0,5).join(" ");x.caption=lines.filter(s=>!s.trim().startsWith("#")).join("\n").trim();await save(x);await reload();break;}
 case"copy":{const value=[x.caption||"",x.hashtags||""].filter(Boolean).join("\n");try{await navigator.clipboard.writeText(value);status("Caption ও Hashtag কপি হয়েছে।");}catch{status("Clipboard অনুমতি পাওয়া যায়নি।");}break;}
 case"move":x.status=x.status==="used"?"unused":"used";await save(x);await reload();break;
 case"trash":x.deleted=true;selected.delete(id);await save(x);await reload();break;
 case"restore":x.deleted=false;x.status=x.status||"unused";await save(x);await reload();break;
 case"purge":if(confirm("ফাইলটি স্থায়ীভাবে মুছবেন?")){await del(id);selected.delete(id);await reload();}break;
 case"share":await shareItems([x]);break;
 }
};
$("selectAll").onclick=()=>{const shown=items.filter(x=>isKind(x)===kind&&matchesTab(x));if(shown.length&&shown.every(x=>selected.has(x.id)))shown.forEach(x=>selected.delete(x.id));else shown.forEach(x=>selected.add(x.id));render();};
async function bulk(action){
 const chosen=items.filter(x=>selected.has(x.id)&&isKind(x)===kind);if(!chosen.length){status("আগে ফাইল নির্বাচন করো।");return;}
 if(action==="purge"&&!confirm(`${chosen.length} টি ফাইল স্থায়ীভাবে মুছবে?`))return;
 for(const x of chosen){if(action==="used"||action==="unused"){x.status=action;await save(x);}else if(action==="trash"){x.deleted=true;await save(x);}else if(action==="purge")await del(x.id);}
 selected.clear();await reload();status("নির্বাচিত ফাইলগুলোর কাজ সম্পন্ন হয়েছে।");
}
$("bulkUsed").onclick=()=>bulk("used");$("bulkUnused").onclick=()=>bulk("unused");$("bulkTrash").onclick=()=>bulk("trash");$("bulkDelete").onclick=()=>bulk(tab==="trash"?"purge":"purge");
$("shareSelected").onclick=()=>shareItems(items.filter(x=>selected.has(x.id)&&isKind(x)===kind));
$("setPin").onclick=()=>{const p=$("pin").value;if(!/^\d{4,8}$/.test(p)){alert("৪–৮ সংখ্যার PIN দিন");return;}localStorage.setItem("mgp_pin",p);$("pin").value="";alert("এই ব্রাউজারে PIN সেট হয়েছে।");};
$("lock").onclick=()=>{if(!localStorage.getItem("mgp_pin")){alert("আগে PIN সেট করুন।");return;}$("lockedScreen").classList.remove("hidden");};
function unlock(){if($("screenPin").value===localStorage.getItem("mgp_pin")){$("lockedScreen").classList.add("hidden");$("screenPin").value="";}else alert("ভুল PIN");}
$("screenUnlock").onclick=unlock;$("screenPin").addEventListener("keydown",e=>{if(e.key==="Enter")unlock();});
$("unlock").onclick=()=>{if($("unlockPin").value===localStorage.getItem("mgp_pin")){$("unlockArea").classList.add("hidden");$("unlockPin").value="";}else alert("ভুল PIN");};
$("export").onclick=async()=>{const data=(await all()).map(({blob,...x})=>x);const a=document.createElement("a");const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.href=u;a.download="gallery-metadata-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);};
openDB().then(async d=>{db=d;await reload();}).catch(e=>status("Database চালু হয়নি: "+e.message));
})();