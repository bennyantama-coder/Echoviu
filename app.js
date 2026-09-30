(() => {
  'use strict';
  const cfg = window.ECHOVUE_CONFIG || {};
  const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'; // MVP: broad read-only. Production: migrate to Picker + drive.file.
  let tokenClient = null, accessToken = null, tokenExpiresAt = 0;
  let exams = [], currentExam = null, currentCines = [], currentCineIndex = 0, objectUrls = [];
  let lockTimer = null, lastActivity = Date.now();

  const $ = id => document.getElementById(id);
  const els = {
    setup:$('setupPanel'), list:$('listPanel'), exam:$('examPanel'), root:$('rootFolder'), status:$('statusText'),
    signIn:$('signInBtn'), signOut:$('signOutBtn'), scan:$('scanBtn'), saveRoot:$('saveRootBtn'), bioSetup:$('bioSetupBtn'),
    rows:$('examRows'), search:$('searchInput'), count:$('examCount'), refresh:$('refreshBtn'),
    back:$('backBtn'), title:$('patientTitle'), meta:$('patientMeta'), sidebar:$('cineSidebar'), video:$('cineVideo'), noVideo:$('noVideo'),
    play:$('playPause'), timeline:$('timeline'), time:$('timeLabel'), speed:$('speedSel'), prev:$('prevCine'), next:$('nextCine'), full:$('fullBtn'),
    brightness:$('brightness'), contrast:$('contrast'), gamma:$('gamma'), sharpness:$('sharpness'), lockOverlay:$('lockOverlay'),
    lockBtn:$('lockBtn'), unlockBio:$('unlockBioBtn'), unlockGoogle:$('unlockGoogleBtn'), clientWarn:$('clientIdWarning'), account:$('accountLabel')
  };

  function setStatus(s){ els.status.textContent = s; }
  function validClientId(){ return cfg.GOOGLE_CLIENT_ID && !cfg.GOOGLE_CLIENT_ID.includes('PASTE_'); }
  function folderIdFromInput(v){
    v=(v||'').trim(); const m=v.match(/\/folders\/([a-zA-Z0-9_-]+)/); return m?m[1]:v;
  }
  function esc(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function parseIni(text){
    const o={}; text.replace(/^\uFEFF/,'').split(/\r?\n/).forEach(line=>{ const i=line.indexOf('='); if(i>0) o[line.slice(0,i).trim()]=line.slice(i+1).trim(); }); return o;
  }
  function patientName(i){ return [i.PatLastName,i.PatFirstName].filter(Boolean).join(', ').replace(/^,\s*/,'') || i.PatientName || '(Tanpa nama)'; }
  function numFromName(name){ const m=name.match(/m(\d+)/i); return m?Number(m[1]):99999; }

  function initGoogle(){
    if(!validClientId()){ els.clientWarn.classList.remove('hidden'); els.signIn.disabled=true; return; }
    const tryInit=()=>{
      if(!window.google?.accounts?.oauth2) return setTimeout(tryInit,250);
      tokenClient = google.accounts.oauth2.initTokenClient({client_id:cfg.GOOGLE_CLIENT_ID, scope:SCOPE, callback:handleToken});
    }; tryInit();
  }
  function requestToken(){
    if(!tokenClient){ setStatus('Google Identity belum siap. Coba beberapa detik lagi.'); return; }
    tokenClient.requestAccessToken({prompt: accessToken ? '' : 'consent'});
  }
  async function handleToken(resp){
    if(resp.error){ setStatus('Login gagal: '+resp.error); return; }
    accessToken=resp.access_token; tokenExpiresAt=Date.now()+(Number(resp.expires_in||3600)*1000)-60000;
    els.scan.disabled=false; els.bioSetup.disabled=false; els.signOut.classList.remove('hidden'); els.lockBtn.classList.remove('hidden');
    els.account.textContent='Google tersambung'; setStatus('Google Drive tersambung. Pilih/isi folder EchoVue lalu Scan.');
  }
  function authHeader(){ if(!accessToken || Date.now()>tokenExpiresAt) throw new Error('Sesi Google berakhir. Silakan masuk lagi.'); return {Authorization:'Bearer '+accessToken}; }
  async function driveJSON(path){ const r=await fetch('https://www.googleapis.com/drive/v3/'+path,{headers:authHeader()}); if(!r.ok) throw new Error('Drive API '+r.status+': '+await r.text()); return r.json(); }
  async function driveText(fileId){ const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{headers:authHeader()}); if(!r.ok) throw new Error('Gagal membaca Exam.ini'); return r.text(); }
  async function driveBlob(fileId){ const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{headers:authHeader()}); if(!r.ok) throw new Error('Gagal mengambil media'); return r.blob(); }

  async function listChildren(folderId){
    let pageToken='', all=[];
    do{
      const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      let url=`files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)&pageSize=1000&orderBy=name`;
      if(pageToken) url+='&pageToken='+encodeURIComponent(pageToken);
      const j=await driveJSON(url); all=all.concat(j.files||[]); pageToken=j.nextPageToken||'';
    }while(pageToken); return all;
  }
  async function scanRoot(){
    const rootId=folderIdFromInput(els.root.value); if(!rootId){ setStatus('Masukkan Folder ID/URL folder EchoVue.'); return; }
    localStorage.setItem('echovue_root',rootId); els.scan.disabled=true; setStatus('Memindai folder Drive…'); exams=[];
    const queue=[{id:rootId,path:''}]; let folders=0, iniCount=0;
    try{
      while(queue.length){
        const f=queue.shift(); folders++; setStatus(`Memindai ${folders} folder · ${iniCount} exam ditemukan…`);
        const kids=await listChildren(f.id);
        for(const k of kids){
          if(k.mimeType==='application/vnd.google-apps.folder') queue.push({id:k.id,path:f.path+'/'+k.name});
          else if(k.name.toLowerCase()==='exam.ini'){
            iniCount++; const text=await driveText(k.id); const ini=parseIni(text);
            exams.push({ini, iniFile:k, folderId:f.id, path:f.path, name:patientName(ini)});
          }
        }
      }
      exams.sort((a,b)=>(b.ini.ExamDate||'').localeCompare(a.ini.ExamDate||''));
      renderExams(); els.setup.classList.add('hidden'); els.list.classList.remove('hidden'); setStatus(`Selesai. ${exams.length} pemeriksaan.`);
    }catch(e){ console.error(e); setStatus(e.message); if(/sesi google/i.test(e.message)) requestToken(); }
    finally{ els.scan.disabled=false; }
  }
  function renderExams(){
    const q=(els.search.value||'').toLowerCase().trim(); const filtered=exams.filter(e=>{
      const i=e.ini; return !q || [i.PatID,e.name,i.ExamDate,i.BirthDate,i.Sex,e.path].join(' ').toLowerCase().includes(q);
    });
    els.rows.innerHTML=filtered.map((e,idx)=>{ const i=e.ini; const realIdx=exams.indexOf(e); return `<tr data-idx="${realIdx}"><td>${esc(i.PatID||'')}</td><td>${esc(e.name)}</td><td>${esc(i.ExamDate||'')}</td><td>${esc(i.BirthDate||'')}</td><td>${esc(i.Sex||'')}</td><td class="count">${esc(i.NumImages||'')}</td></tr>`; }).join('');
    els.count.textContent=`${filtered.length} / ${exams.length} pemeriksaan`;
    [...els.rows.querySelectorAll('tr')].forEach(tr=>tr.addEventListener('click',()=>openExam(exams[Number(tr.dataset.idx)])));
  }

  async function openExam(exam){
    currentExam=exam; currentCineIndex=0; revokeObjectUrls(); els.list.classList.add('hidden'); els.exam.classList.remove('hidden');
    els.title.textContent=exam.name; els.meta.textContent=`ID ${exam.ini.PatID||'-'} · ${exam.ini.ExamDate||'-'} · DOB ${exam.ini.BirthDate||'-'}`;
    els.sidebar.innerHTML='<div class="status" style="padding:10px">Memuat cine…</div>';
    try{
      const files=await listChildren(exam.folderId); const mp4=files.filter(f=>/^m\d+\.mp4$/i.test(f.name)).sort((a,b)=>numFromName(a.name)-numFromName(b.name));
      const wmvs=files.filter(f=>/^m\d+\.wmv$/i.test(f.name)).sort((a,b)=>numFromName(a.name)-numFromName(b.name));
      const thumbs=new Map(files.filter(f=>/^m\d+_small\.(jpg|jpeg|png)$/i.test(f.name)).map(f=>[numFromName(f.name),f]));
      currentCines=mp4.map(f=>({video:f,thumb:thumbs.get(numFromName(f.name)),index:numFromName(f.name)}));
      if(!currentCines.length && wmvs.length){
        els.sidebar.innerHTML=''; showNoVideo('Folder ini hanya memiliki WMV. iPhone/Safari tidak memutar WMV dengan baik. Jalankan MAKE_IPHONE_PROXIES.command pada folder sinkron Google Drive untuk membuat m0.mp4, m1.mp4, dst.'); return;
      }
      if(!currentCines.length){ els.sidebar.innerHTML=''; showNoVideo('Tidak ditemukan file m0.mp4, m1.mp4, dst.'); return; }
      await renderSidebar(); await loadCine(0);
    }catch(e){ showNoVideo(e.message); }
  }
  async function renderSidebar(){
    els.sidebar.innerHTML='';
    for(let n=0;n<currentCines.length;n++){
      const c=currentCines[n]; const card=document.createElement('div'); card.className='cine-card'; card.dataset.i=n;
      const thumb=document.createElement('div'); thumb.className='thumb'; thumb.textContent='Cine '+(c.index+1);
      if(c.thumb){ try{ const blob=await driveBlob(c.thumb.id); const u=URL.createObjectURL(blob); objectUrls.push(u); thumb.innerHTML=`<img alt="Cine ${c.index+1}" src="${u}">`; }catch{} }
      const lab=document.createElement('div'); lab.className='cine-label'; lab.textContent=`Cine ${c.index+1}`; card.append(thumb,lab); card.addEventListener('click',()=>loadCine(n)); els.sidebar.appendChild(card);
    }
  }
  function showNoVideo(msg){ els.video.classList.add('hidden'); els.noVideo.classList.remove('hidden'); els.noVideo.textContent=msg; }
  async function loadCine(idx){
    if(idx<0||idx>=currentCines.length) return; currentCineIndex=idx; els.noVideo.classList.add('hidden'); els.video.classList.remove('hidden');
    [...els.sidebar.querySelectorAll('.cine-card')].forEach((x,i)=>x.classList.toggle('active',i===idx));
    els.play.disabled=true;
    try{ const blob=await driveBlob(currentCines[idx].video.id); const u=URL.createObjectURL(blob); objectUrls.push(u); els.video.src=u; els.video.loop=true; els.video.load(); await els.video.play().catch(()=>{}); }
    catch(e){ showNoVideo(e.message); }
    finally{ els.play.disabled=false; }
  }
  function revokeObjectUrls(){ objectUrls.forEach(u=>URL.revokeObjectURL(u)); objectUrls=[]; }
  function fmtTime(s){ if(!Number.isFinite(s))return '0:00'; const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${String(sec).padStart(2,'0')}`; }
  function updateTime(){ if(!Number.isFinite(els.video.duration)||!els.video.duration)return; els.timeline.value=Math.round((els.video.currentTime/els.video.duration)*1000); els.time.textContent=`${fmtTime(els.video.currentTime)} / ${fmtTime(els.video.duration)}`; }
  function applyFilter(){
    const b=Number(els.brightness.value)/100, c=Number(els.contrast.value)/100, g=Number(els.gamma.value)/100;
    // CSS belum punya gamma/sharpen native; gunakan brightness/contrast dan approximation gamma via brightness.
    const gammaApprox=(1/g); els.video.style.setProperty('--video-filter',`brightness(${(b*gammaApprox).toFixed(3)}) contrast(${c.toFixed(3)})`);
  }
  function setMode(mode){
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));
    if(mode==='original'){ els.brightness.value=100; els.contrast.value=100; els.gamma.value=100; els.sharpness.value=0; }
    if(mode==='gelike'){ els.brightness.value=98; els.contrast.value=118; els.gamma.value=92; els.sharpness.value=20; }
    applyFilter();
  }

  // Local biometric lock via WebAuthn; Google OAuth remains authorization boundary for Drive.
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const unb64url = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
  async function setupBiometric(){
    if(!window.PublicKeyCredential){ setStatus('WebAuthn/biometrik tidak didukung browser ini.'); return; }
    try{
      const challenge=crypto.getRandomValues(new Uint8Array(32)), uid=crypto.getRandomValues(new Uint8Array(16));
      const cred=await navigator.credentials.create({publicKey:{challenge,rp:{name:'EchoVue Drive'},user:{id:uid,name:'echovue-local',displayName:'EchoVue Local Unlock'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},timeout:60000,attestation:'none'}});
      localStorage.setItem('echovue_bio_id',b64url(cred.rawId)); setStatus('Biometrik perangkat aktif untuk membuka layar EchoVue.');
    }catch(e){ setStatus('Biometrik tidak diaktifkan: '+e.message); }
  }
  async function unlockBiometric(){
    const id=localStorage.getItem('echovue_bio_id'); if(!id){ alert('Biometrik belum diaktifkan.'); return; }
    try{
      const challenge=crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({publicKey:{challenge,allowCredentials:[{type:'public-key',id:unb64url(id)}],userVerification:'required',timeout:60000}});
      unlockUI();
    }catch(e){ console.warn(e); }
  }
  function lockUI(){ els.video.pause(); els.lockOverlay.classList.remove('hidden'); }
  function unlockUI(){ els.lockOverlay.classList.add('hidden'); lastActivity=Date.now(); armLockTimer(); }
  function armLockTimer(){ clearInterval(lockTimer); lockTimer=setInterval(()=>{ if(Date.now()-lastActivity>(cfg.LOCK_AFTER_MS||180000) && !els.lockOverlay.classList.contains('hidden')===false) lockUI(); },15000); }
  function activity(){ lastActivity=Date.now(); }

  els.signIn.addEventListener('click',requestToken); els.unlockGoogle.addEventListener('click',()=>{ requestToken(); unlockUI(); });
  els.signOut.addEventListener('click',()=>{ if(accessToken && google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken,()=>{}); accessToken=null; exams=[]; revokeObjectUrls(); location.reload(); });
  els.saveRoot.addEventListener('click',()=>{ const id=folderIdFromInput(els.root.value); localStorage.setItem('echovue_root',id); els.root.value=id; setStatus('Folder ID disimpan lokal di perangkat ini.'); });
  els.scan.addEventListener('click',scanRoot); els.refresh.addEventListener('click',scanRoot); els.search.addEventListener('input',renderExams); els.back.addEventListener('click',()=>{ els.video.pause(); revokeObjectUrls(); els.exam.classList.add('hidden'); els.list.classList.remove('hidden'); });
  els.play.addEventListener('click',()=>els.video.paused?els.video.play():els.video.pause()); els.video.addEventListener('play',()=>els.play.textContent='❚❚'); els.video.addEventListener('pause',()=>els.play.textContent='▶︎'); els.video.addEventListener('timeupdate',updateTime);
  els.timeline.addEventListener('input',()=>{ if(Number.isFinite(els.video.duration)) els.video.currentTime=(Number(els.timeline.value)/1000)*els.video.duration; });
  els.speed.addEventListener('change',()=>els.video.playbackRate=parseFloat(els.speed.value)); els.prev.addEventListener('click',()=>loadCine(Math.max(0,currentCineIndex-1))); els.next.addEventListener('click',()=>loadCine(Math.min(currentCines.length-1,currentCineIndex+1)));
  els.full.addEventListener('click',()=>document.getElementById('videoStage').requestFullscreen?.());
  ['brightness','contrast','gamma','sharpness'].forEach(id=>$(id).addEventListener('input',()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.mode==='custom')); applyFilter(); }));
  document.querySelectorAll('.tab').forEach(x=>x.addEventListener('click',()=>setMode(x.dataset.mode)));
  els.bioSetup.addEventListener('click',setupBiometric); els.lockBtn.addEventListener('click',lockUI); els.unlockBio.addEventListener('click',unlockBiometric);
  ['click','touchstart','keydown','mousemove'].forEach(ev=>document.addEventListener(ev,activity,{passive:true}));
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) { lastActivity=Date.now(); } });

  const saved=localStorage.getItem('echovue_root'); if(saved) els.root.value=saved;
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  initGoogle(); armLockTimer(); setMode('original');
})();
