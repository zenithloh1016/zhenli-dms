#!/usr/bin/env python3
"""Idempotent integration patch. Run in existing ZHENLI-DMS repository.
No Supabase credentials are read, no database changes, no private data bundled.
"""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
main=root/'src/main.js'
workflow=root/'.github/workflows/deploy.yml'
assert main.exists() and workflow.exists(), 'Run after the integration ZIP is extracted into existing zhenli-dms repo root.'
s=main.read_text()

def one(old,new,label):
    global s
    if new in s: return
    if old not in s:raise SystemExit('Cannot find expected anchor for '+label+'. No changes written. Contact ChatGPT with error screenshot.')
    s=s.replace(old,new,1)

one("import './style.css';", "import './style.css';\nimport './integration.css';\nimport { renderIntegratedView, installHubBridge, launchSigning } from './integrated-modules.js';",'module imports')
one("modal: null, authMode: 'login'", "modal: null, module: 'portfolio', authMode: 'login'",'module state')
# Navbar insertion does not overwrite existing DMS functionality.
anchor='<div class="side-label">WORKSPACE</div><button class="nav-item ${!state.companyId?\'selected\':\'\'}" data-action="home"><span>▦</span> Company portfolio <b>${state.companies.length}</b></button>'
repl='''<div class="side-label">WORKSPACE</div>
  <button class="nav-item ${state.module==='dashboard'?'selected':''}" data-action="zh-module" data-id="dashboard"><span class="zh-nav-icon">▦</span> Overview</button>
  <button class="nav-item ${state.module==='portfolio'?'selected':''}" data-action="zh-module" data-id="portfolio"><span class="zh-nav-icon">📁</span> Company portfolio <b>${state.companies.length}</b></button>
  <button class="nav-item ${state.module==='tasks'?'selected':''}" data-action="zh-module" data-id="tasks"><span class="zh-nav-icon">📋</span> Secretarial Task Hub</button>
  <button class="nav-item ${state.module==='signing'?'selected':''}" data-action="zh-module" data-id="signing"><span class="zh-nav-icon">✍️</span> Sequential Signing</button>'''
# Live DMS may have shifted the state selected class; use anchor if available.
if 'data-action="zh-module" data-id="dashboard"' not in s:
    if anchor not in s:
        raise SystemExit('Cannot find original workspace navbar. Source changed: manual review needed before patch. No changes written.')
    s=s.replace(anchor,repl,1)
# Switch main content while preserving current DMS folder logic.
old='<main class="main-content">${state.companyId?renderFolder():renderCompanies()}</main>'
new='''<div class="zh-mobile-nav">
      <button data-action="zh-module" data-id="dashboard" class="${state.module==='dashboard'?'active':''}">Overview</button>
      <button data-action="zh-module" data-id="portfolio" class="${state.module==='portfolio'?'active':''}">Documents</button>
      <button data-action="zh-module" data-id="tasks" class="${state.module==='tasks'?'active':''}">Tasks</button>
      <button data-action="zh-module" data-id="signing" class="${state.module==='signing'?'active':''}">Signing</button>
    </div><main class="main-content ${state.module==='tasks'?'zh-hub-container':''}">${state.module==='portfolio'?(state.companyId?renderFolder():renderCompanies()):renderIntegratedView(state.module,state.companies)}</main>'''
one(old,new,'multi-module main view')
# Safeguard old breadcrumb navigation.
old="if(a==='home'){state.companyId=null;state.folderId=null;state.search='';render();return;}"
new="""if(a==='zh-module'){
    if(!['dashboard','portfolio','tasks','signing'].includes(id))return;
    state.module=id;state.companyId=null;state.folderId=null;state.search='';render();return;
  }
  if(a==='zh-launch-signing'){void launchSigning().catch(showError);return;}
  if(a==='home'){state.module='portfolio';state.companyId=null;state.folderId=null;state.search='';render();return;}"""
one(old,new,'module click actions')
# Ensure authenticated message listener starts BEFORE iframe loads.
one('async function init() {\n  if(!db)', "async function init() {\n  if(db) installHubBridge(db,()=>state.user,()=>state.companies,showError);\n  if(!db)",'bridge registration')
# Excel import defects in original package, updated conditionally to avoid overwriting previous fixes.
if 'function colName(' not in s:
    one('function columnOptions(selected, includeNone=false) {', '''function colName(index) {
  let n=index+1, label='';
  while(n>0){n--; label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}
  return label;
}
function columnOptions(selected, includeNone=false) {''','Excel column letter helper')
# original app passed 2D rows but expected sheet objects; safe fix for read-excel-file v9.x
if 'state.importData=await readExcelFile(file);' in s:
    one('state.importData=await readExcelFile(file);', '''const discovered = await readExcelFile(file,{getSheets:true});
      const sheets = [];
      for(const entry of discovered){
        const sheet=entry.name;
        sheets.push({sheet,data:await readExcelFile(file,{sheet})});
      }
      state.importData=sheets;''', 'Excel worksheet reading')
main.write_text(s)
y=workflow.read_text()
if 'VITE_EDGEONE_SIGNING_URL:' not in y:
    if not y.startswith('name:') or 'jobs:' not in y:raise SystemExit('Unknown GitHub Actions YAML format')
    y=y.replace('jobs:\n', 'env:\n  VITE_EDGEONE_SIGNING_URL: ${{ vars.VITE_EDGEONE_SIGNING_URL }}\njobs:\n',1)
# upgrade old Android action if users extracted the original old DMS source, not needed when already v4
if 'android-actions/setup-android@v3' in y:y=y.replace('android-actions/setup-android@v3','android-actions/setup-android@v4')
workflow.write_text(y)
print('Integration installed. Existing DMS tables/files untouched. SQL migration still needs manual execution.')
