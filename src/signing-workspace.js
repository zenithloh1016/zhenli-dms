/** In-app signing administration. Uses existing EdgeOne engine; no signing secrets in frontend. */
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import './signing-workspace.css';

const EDGE_URL = String(import.meta.env.VITE_EDGEONE_SIGNING_URL || '').trim();
const esc = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = () => crypto.randomUUID();
const MB3 = 3 * 1024 * 1024;
const base = (() => {try {const u = new URL(EDGE_URL);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u.origin:'';}catch{return '';}})();
let context = null;
const u = {
  view:'list', busy:false, loaded:false, error:'',message:'',list:[],request:null,
  companyId:'', subject:'', note:'',days:'14', signers:[{id:uuid(),name:'',email:''}],
  selectedFiles:[], existingDocs:[], selectedExisting:[],
  chosenDoc:'',chosenSigner:'',page:1,x:15,y:20,w:28,h:8,places:[]
};
const el = () => document.getElementById('zh-signing-workspace');
const opt = (v,t,selected=false)=>`<option value="${esc(v)}" ${selected?'selected':''}>${esc(t)}</option>`;
const btn = (label,act,id='',other='')=>`<button type="button" data-sg="${act}" data-sg-id="${esc(id)}" ${other}>${label}</button>`;
function company() {return context?.companies().find(c=>c.id===u.companyId) || null;}
const pretty = s => String(s||'').replaceAll('_',' ');
const hasPdf = d => /\.pdf$/i.test(d.name) || d.mime_type==='application/pdf';
function safeStatus(status){return /^(draft|pending|completed|finalizing|deleting)$/.test(status)?status:'unknown';}
const formValue = (f,key) => String(f.get(key)||'').trim();
function viewLabel(name){return esc(name||'');}
function render() {
  const root=el();if(!root)return;
  if(!base){root.innerHTML='<div class="sg-note">The EdgeOne signing website address is not configured. Set the GitHub Actions repository variable <code>VITE_EDGEONE_SIGNING_URL</code> to the root HTTPS website URL (not an invitation link), then rebuild both web and Android.</div>';return;}
  const header=`<div class="sg-top"><div><h2>Sequential Signing Requests</h2><p>Create drafts using your existing EdgeOne signing engine, with company records from DMS.</p></div><div>${btn('Original EdgeOne site ↗','edgeone')}${btn('All requests','list')}${btn('+ Create request','new')}</div></div>`;
  const msg = u.error?`<div class="sg-error" role="alert">${esc(u.error)}</div>`:u.message?`<div class="sg-success" role="status">${esc(u.message)}</div>`:'';
  let content='';
  if (u.view==='list') content=`<div class="sg-toolbar">${btn('↻ Refresh requests','refresh')}</div><div class="sg-list">${u.list.length?u.list.map(r=>`<div class="sg-row"><div><strong>${viewLabel(r.company)}</strong><small>${viewLabel(r.subject)}</small><small>${esc((r.createdAt||'').slice(0,10))}</small></div><div><span class="sg-tag sg-${safeStatus(r.status)}">${esc(r.status)}</span><small>${Number(r.done)||0}/${Number(r.signers)||0} signed · ${Number(r.docs)||0} PDFs</small></div>${btn('Open →','open',r.id)}</div>`).join(''):'<div class="sg-empty">No requests found. Select Create request to begin.</div>'}</div>`;
  if(u.view==='new') {
    const companies=context?.companies()||[];
    content=`<form id="sg-new-form" class="sg-card"><h3>New signing request</h3>
      <label>Company<select name="companyId" id="sg-company" required>${opt('','Select a company',!u.companyId)}${companies.map(c=>opt(c.id,c.name,c.id===u.companyId)).join('')}</select></label>
      <label>Signing subject<input name="subject" required maxlength="180" value="${esc(u.subject)}" placeholder="Board Resolution for Bank Signatories"/></label>
      <label>Message for signers<textarea name="note" maxlength="1000" rows="3" placeholder="Please click the link and sign in the designated signature box">${esc(u.note)}</textarea></label>
      <label>Validity (days)<input name="days" type="number" min="1" max="60" required value="${esc(u.days)}"/></label>
      <h3>Signatories — in signing order</h3>
      <p class="sg-hint">Signatory 2 cannot sign until signatory 1 has finished. Maximum 15 signers.</p>
      <div class="sg-signers">${u.signers.map((s,i)=>`<div class="sg-signer"><span class="sg-order">${i+1}</span><label>Name<input data-sg-signer="name" data-sg-index="${i}" value="${esc(s.name)}" maxlength="180" required></label><label>Email<input data-sg-signer="email" data-sg-index="${i}" type="email" value="${esc(s.email)}" required></label>${btn('↑','signer-up',String(i),i===0?'disabled':'')}${btn('↓','signer-down',String(i),i===u.signers.length-1?'disabled':'')}${btn('×','signer-remove',String(i),u.signers.length===1?'disabled':'')}</div>`).join('')}</div>
      ${btn('+ Add signer','signer-add')}
      <h3>PDF documents</h3><label>Upload PDFs from phone or laptop<input id="sg-file-input" type="file" accept="application/pdf,.pdf" multiple/></label>
      <p class="sg-hint">Maximum 8 PDFs, 3 MB each, as required by your EdgeOne signing service.</p>
      ${u.selectedFiles.length?`<p>${u.selectedFiles.map(f=>esc(f.name)).join(' · ')}</p>`:''}
      <div class="sg-subtle">Existing PDFs from the selected DMS company:</div>
      <div class="sg-checklist">${u.existingDocs.length?u.existingDocs.map(d=>`<label class="sg-check"><input type="checkbox" data-sg-existing="${esc(d.id)}" ${u.selectedExisting.includes(d.id)?'checked':''} ${d.size_bytes>MB3?'disabled':''}/><span>${esc(d.name)} (${(d.size_bytes/1048576).toFixed(2)} MB)</span></label>`).join(''):'<span class="sg-hint">No PDFs found (or no company selected).</span>'}</div>
      <div class="sg-actions"><button type="submit" class="sg-primary" ${u.busy?'disabled':''}>${u.busy?'Creating…':'Create draft and attach PDFs'}</button>${btn('Cancel','list')}</div></form>`;
  }
  if(u.view==='detail' && u.request){const r=u.request;
    content=`<div class="sg-card"><div class="sg-details-head"><div><h3>${esc(r.company)} — ${esc(r.subject)}</h3><p>Status: <strong>${esc(r.status)}</strong> · Valid until ${esc((r.expiry||'').slice(0,10))}</p></div><div>${btn('↻ Refresh','reload-detail')}${r.status==='draft'?btn('Delete draft','delete'):''}</div></div>
    <h3>Documents</h3><div class="sg-list">${r.docs.map(d=>`<div class="sg-row"><div><strong>${esc(d.name)}</strong><small>${d.pages} pages</small></div>${btn('Download','download',d.id)}</div>`).join('')||'<p>No PDFs attached.</p>'}</div>
    ${r.status==='draft'?`<label>Add PDF (maximum 3 MB)<input type="file" id="sg-add-pdf" accept="application/pdf,.pdf" multiple/></label>`:''}
    <h3>Sequential signatories</h3><div class="sg-list">${r.signers.map(s=>`<div class="sg-row"><div><strong>${s.position}. ${esc(s.name)}</strong><small>${esc(s.email)} · ${s.signedAt?'Signed':'Waiting / not activated'}</small></div>${btn('Copy signing link','copy',s.id)}</div>`).join('')}</div>
    ${r.status==='draft'?`<h3>Signature boxes (required before activation)</h3><p class="sg-hint">Position is measured from the top-left of the PDF page, in percentages (0–100). Every signer requires at least one box. Use the EdgeOne visual editor for drag-and-drop placement if preferred.</p>
      <form id="sg-place-form" class="sg-placement-form"><label>PDF<select name="docId" required>${r.docs.map(d=>opt(d.id,d.name,d.id===u.chosenDoc)).join('')}</select></label><label>Signer<select name="signerId" required>${r.signers.map(s=>opt(s.id,`${s.position}. ${s.name}`,s.id===u.chosenSigner)).join('')}</select></label><label>Page<input type="number" min="1" name="page" value="${u.page}" required/></label><label>X %<input type="number" min="0" max="96" step="0.1" name="x" value="${u.x}" required/></label><label>Y %<input type="number" min="0" max="97" step="0.1" name="y" value="${u.y}" required/></label><label>Width %<input type="number" min="4" max="100" step="0.1" name="w" value="${u.w}" required/></label><label>Height %<input type="number" min="2.5" max="100" step="0.1" name="h" value="${u.h}" required/></label><button class="sg-primary" type="submit">Add signature box</button></form>
      <div class="sg-list">${u.places.map((p,i)=>{const d=r.docs.find(x=>x.id===p.docId),s=r.signers.find(x=>x.id===p.signerId);return `<div class="sg-row"><div><strong>${esc(s?.name)} — ${esc(d?.name)}</strong><small>Page ${p.page} · X ${(p.x*100).toFixed(1)}%, Y ${(p.y*100).toFixed(1)}%, W ${(p.width*100).toFixed(1)}%, H ${(p.height*100).toFixed(1)}%</small></div>${btn('Remove','remove-placement',String(i))}</div>`}).join('')||'<p>No signature boxes added yet.</p>'}</div>
      <div class="sg-actions">${btn('Save positions','save-placements')}${btn('Activate sequential signing','activate','','class="sg-primary"')}${btn('Open original visual editor ↗','edgeone')}</div>`:''}
    ${r.status==='pending'?`<div class="sg-actions">${btn('Resend current invitation','invite')}${btn('Open original signing website ↗','edgeone')}</div>`:''}
    ${r.status==='completed'?`<div class="sg-actions">${btn('Save signed PDFs to DMS','file-signed')}${btn('Download audit ZIP','archive')}</div>`:''}</div>`;
  }
  root.innerHTML=header+msg+content+`<p class="sg-foot">Signers continue to sign through your existing EdgeOne secure invitation links. Keep signing access tokens and final PDFs out of public GitHub.</p>`;
}
function notify(message, isError=false){u.error=isError?String(message):'';u.message=isError?'':String(message);render();}
async function call(path='',opts={}){
  if(!base)throw Error('EdgeOne signing URL is not configured.');
  const db=context?.db;if(!db)throw Error('DMS database is not ready.');
  const {data:{session},error:authError}=await db.auth.getSession();
  if(authError||!session?.access_token)throw Error('Please sign in to the DMS again.');
  const headers={'Authorization':`Bearer ${session.access_token}`,'X-ZH-Request':'1'};
  let body;
  if(opts.json!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(opts.json);}
  if(opts.file){headers['Content-Type']='application/pdf';headers['X-File-Name']=encodeURIComponent(opts.file.name);body=opts.file;}
  let resp;
  try {
    resp=await fetch(`${base}/api/dms/requests${path}`,{method:opts.method||'GET',headers,body,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  }catch{throw Error('Cannot connect to the EdgeOne signing API. Check the EdgeOne deployment, HTTPS URL, DMS_ALLOWED_ORIGINS and connection before retrying.');}
  if(!resp.ok){let reason=`HTTP ${resp.status}`;try{reason=(await resp.json()).error||reason;}catch{}throw Error(reason);}
  if(opts.binary)return await resp.blob();
  return resp.json();
}
async function loading(job){if(u.busy)return;u.busy=true;u.error='';u.message='';render();try{await job();}catch(e){u.error=e?.message||String(e);}finally{u.busy=false;render();}}
async function loadList(){u.loaded=true;await loading(async()=>{const r=await call();u.list=r.requests||[];u.view='list';});}
async function detail(id){await loading(async()=>{u.request=await call('/'+id);u.places=(u.request.placements||[]).map(p=>({...p}));u.chosenDoc=u.request.docs[0]?.id||'';u.chosenSigner=u.request.signers[0]?.id||'';u.view='detail';});}
async function loadDocs(){u.existingDocs=[];u.selectedExisting=[];if(!u.companyId)return;const{data,error}=await context.db.from('documents').select('id,name,size_bytes,storage_path,mime_type').eq('company_id',u.companyId).order('name');if(error)throw error;u.existingDocs=(data||[]).filter(hasPdf);}
export function presetSigning(companyId,docId=''){
  u.view='new';u.companyId=companyId||'';u.subject='';u.note='';u.days='14';u.signers=[{id:uuid(),name:'',email:''}];u.selectedFiles=[];u.existingDocs=[];u.selectedExisting=[];u.message='';u.error='';
  if(context){void loading(async()=>{await loadDocs();if(docId&&u.existingDocs.some(d=>d.id===docId))u.selectedExisting=[docId];});}
}
export function signingWorkspaceHTML(){return `<div id="zh-signing-workspace"><div class="sg-note">Loading signing dashboard…</div></div>`;}
export function restoreSigningWorkspace(){if(!el())return;render();if(!u.busy&&u.view==='list'&&!u.loaded)void loadList();}
export function resetSigningWorkspace(){u.view='list';u.busy=false;u.loaded=false;u.error='';u.message='';u.list=[];u.request=null;u.companyId='';u.selectedFiles=[];u.existingDocs=[];u.selectedExisting=[];u.places=[];}
export function initSigningWorkspace(db,getUser,getCompanies){
  if(context)return;
  context={db,user:getUser,companies:getCompanies};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-sg]');if(!b||!e.target.closest('#zh-signing-workspace'))return;const a=b.dataset.sg,id=b.dataset.sgId;
    if(a==='list'){u.view='list';void loadList();}
    if(a==='refresh')void loadList();
    if(a==='new')presetSigning('');
    if(a==='signer-add'){if(u.signers.length>=15){notify('Maximum 15 signers.',true);return;}u.signers.push({id:uuid(),name:'',email:''});render();}
    if(a==='signer-up'||a==='signer-down'){const i=Number(id),j=a==='signer-up'?i-1:i+1;if(j>=0&&j<u.signers.length)[u.signers[i],u.signers[j]]=[u.signers[j],u.signers[i]];render();}
    if(a==='signer-remove'){if(u.signers.length>1)u.signers.splice(Number(id),1);render();}
    if(a==='open')void detail(id);
    if(a==='reload-detail'&&u.request)void detail(u.request.id);
    if(a==='remove-placement'){u.places.splice(Number(id),1);render();}
    if(a==='save-placements'&&u.request)void loading(async()=>{await call('/'+u.request.id+'/placements',{method:'POST',json:{placements:u.places}});u.message='Signature positions saved.';});
    if(a==='activate'&&u.request){if(!window.confirm('Activate sequential signing and invite the first signer? Signature positions will be locked.'))return;void loading(async()=>{const data=await call('/'+u.request.id+'/activate',{method:'POST'});u.request=await call('/'+u.request.id);u.message='Request activated. '+(data.mailResult||'');});}
    if(a==='invite'&&u.request)void loading(async()=>{const result=await call('/'+u.request.id+'/invite',{method:'POST'});u.message=result.result||'Invitation attempted.';});
    if(a==='delete'&&u.request){if(window.prompt('Type DELETE to permanently remove this draft:')!=='DELETE')return;void loading(async()=>{await call('/'+u.request.id,{method:'DELETE',json:{confirm:'DELETE'}});u.view='list';u.request=null;u.list=(await call()).requests||[];u.message='Draft deleted.';});}
    if(a==='copy'&&u.request){const s=u.request.signers.find(x=>x.id===id);if(s?.link){void navigator.clipboard.writeText(s.link).then(()=>notify('Signing link copied. Share only with the intended signer.')).catch(()=>window.prompt('Copy signing link',s.link));}}
    if(a==='download'&&u.request)void loading(async()=>{const d=u.request.docs.find(x=>x.id===id);const pdf=await call('/'+u.request.id+'/docs/'+id,{binary:true});downloadBlob(pdf,d?.name||'document.pdf');});
    if(a==='archive'&&u.request)void loading(async()=>downloadBlob(await call('/'+u.request.id+'/archive',{binary:true}),`Signing-${u.request.id}.zip`));
    if(a==='file-signed'&&u.request)void loading(saveSignedToDms);
    if(a==='edgeone'){if(Capacitor.isNativePlatform())void Browser.open({url:base}).catch(()=>notify('Could not open the EdgeOne site on this device.',true));else window.open(base,'_blank','noopener,noreferrer');}
  });
  document.addEventListener('input',e=>{if(!e.target.closest('#zh-signing-workspace'))return;
    if(e.target.dataset.sgSigner){const i=Number(e.target.dataset.sgIndex);if(u.signers[i])u.signers[i][e.target.dataset.sgSigner]=e.target.value;}
    if(e.target.closest('#sg-new-form')&&e.target.name&&e.target.name!=='companyId'){
      if(['subject','note','days'].includes(e.target.name))u[e.target.name]=e.target.value;
    }
  });
  document.addEventListener('change',e=>{if(!e.target.closest('#zh-signing-workspace'))return;
    if(e.target.id==='sg-company'){u.companyId=e.target.value;void loading(loadDocs);}
    if(e.target.id==='sg-file-input'){u.selectedFiles=Array.from(e.target.files||[]);render();}
    if(e.target.dataset.sgExisting){const id=e.target.dataset.sgExisting;u.selectedExisting=e.target.checked?[...new Set([...u.selectedExisting,id])]:u.selectedExisting.filter(x=>x!==id);}
    if(e.target.id==='sg-add-pdf'&&u.request){const files=Array.from(e.target.files||[]);void loading(async()=>{for(const f of files)await uploadToEdge(u.request.id,f);u.request=await call('/'+u.request.id);u.places=u.request.placements||[];u.message=`${files.length} PDF(s) uploaded.`;});}
  });
  document.addEventListener('submit',e=>{if(!e.target.closest('#zh-signing-workspace'))return;
    if(e.target.id==='sg-new-form'){e.preventDefault();const form=new FormData(e.target);void loading(async()=>{
      const c=company(),subject=formValue(form,'subject'),days=Number(form.get('days'));
      if(!c||!subject||!Number.isInteger(days)||days<1||days>60)throw Error('Choose a company, subject and validity (1–60 days).');
      if(u.signers.some(s=>!s.name.trim()||!/^\S+@\S+\.\S+$/.test(s.email)))throw Error('All signers require a name and email.');
      const files=[...u.selectedFiles];const chosen=u.existingDocs.filter(d=>u.selectedExisting.includes(d.id));
      if(!files.length&&!chosen.length)throw Error('Select at least one PDF to attach.');
      if(files.length+chosen.length>8)throw Error('Maximum 8 PDFs per signing request.');
      if([...files,...chosen].some(d=>d.size>MB3||d.size_bytes>MB3||((d.size??d.size_bytes)===0)))throw Error('PDF files must be non-empty and at most 3 MB each.');
      const r=await call('',{method:'POST',json:{company:c.name,subject,note:formValue(form,'note'),days,signers:u.signers.map(s=>({name:s.name.trim(),email:s.email.trim()}))}});
      let count=0;
      try{
        for(const file of files){await uploadToEdge(r.id,file);count++;}
        for(const doc of chosen){const {data,error}=await context.db.storage.from('dms-private').download(doc.storage_path);if(error)throw error;await uploadToEdge(r.id,new File([data],doc.name,{type:'application/pdf'}));count++;}
      }catch(error){throw Error(`Signing draft created (${r.id}), but only ${count} PDFs uploaded: ${error.message}. Open the draft from Requests and attach the remainder.`);}
      u.request=await call('/'+r.id);u.places=[];u.view='detail';u.message=`Draft created with ${count} PDF(s). Add signature positions before activation.`;
    });}
    if(e.target.id==='sg-place-form'){e.preventDefault();const f=new FormData(e.target);const page=Number(f.get('page')),x=Number(f.get('x'))/100,y=Number(f.get('y'))/100,width=Number(f.get('w'))/100,height=Number(f.get('h'))/100;
      const doc=u.request?.docs.find(d=>d.id===f.get('docId'));
      if(!doc||!Number.isInteger(page)||page<1||page>doc.pages||![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<.04||height<.025||x+width>1||y+height>1){notify('Check PDF page and box coordinates; width/height must fit inside the page.',true);return;}
      u.places.push({id:`field_${uuid().replaceAll('-','')}`,docId:String(f.get('docId')),signerId:String(f.get('signerId')),page,x,y,width,height});notify('Signature box added. Save positions before activation.');
    }
  });
}
async function uploadToEdge(id,file){if(!/\.pdf$/i.test(file.name)||file.size>MB3||file.size<5)throw Error(`${file.name}: choose a PDF not exceeding 3 MB.`);await call('/'+id+'/docs',{method:'POST',file});}
function downloadBlob(blob,name){const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=name.replace(/[\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);}
async function saveSignedToDms(){const r=u.request;if(!r||r.status!=='completed')throw Error('Request has not completed signing.');
  const c=context.companies().find(x=>x.name.trim().toUpperCase()===String(r.company).trim().toUpperCase());if(!c)throw Error('Matching DMS company was not found.');
  const {data:folders,error:folderError}=await context.db.from('folders').select('id,name,parent_id').eq('company_id',c.id).is('parent_id',null);if(folderError)throw folderError;
  const folder=folders.find(f=>f.name==="Board & Members' Resolution");if(!folder)throw Error('Board & Members’ Resolution folder is missing.');
  const currentUser=context.user();if(!currentUser?.id)throw Error('Please sign in again.');let added=0;
  for(const d of r.docs){const storagePath=`${currentUser.id}/${c.id}/edgeone/${r.id}/${d.id}`;
    const {data:found,error:lookupErr}=await context.db.from('documents').select('id').eq('storage_path',storagePath).maybeSingle();if(lookupErr)throw lookupErr;if(found)continue;
    const blob=await call('/'+r.id+'/docs/'+d.id,{binary:true});
    if(blob.type && !blob.type.includes('pdf'))throw Error('EdgeOne returned a non-PDF response; no file was saved.');
    const {error:uploadError}=await context.db.storage.from('dms-private').upload(storagePath,blob,{contentType:'application/pdf',upsert:false});if(uploadError && !/exists|duplicate/i.test(uploadError.message))throw uploadError;
    const {error:insertErr}=await context.db.from('documents').insert({user_id:currentUser.id,company_id:c.id,folder_id:folder.id,name:`SIGNED_${d.name}`,storage_path:storagePath,size_bytes:blob.size,mime_type:'application/pdf'});if(insertErr)throw insertErr;
    added++;
  }
  u.message=added?`Filed ${added} signed PDFs in ${c.name} → Board & Members' Resolution.`:'Signed PDFs were already filed.';
}
