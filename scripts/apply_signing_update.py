#!/usr/bin/env python3
"""Safely patch the already-integrated DMS source. Leaves Supabase schema/data alone."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
main=root/'src/main.js'
modules=root/'src/integrated-modules.js'
workflow=root/'.github/workflows/deploy.yml'
if not main.exists() or not modules.exists() or not workflow.exists():
    raise SystemExit('Expected the existing INTEGRATED DMS source under src/ and .github/workflows/deploy.yml. Nothing changed.')
s=main.read_text()
t=modules.read_text()
w=workflow.read_text()
if 'signing-workspace.js' in s:
    print('Already patched. No changes made.')
    raise SystemExit(0)
if "import { renderIntegratedView, installHubBridge, launchSigning } from './integrated-modules.js';" not in s:
    raise SystemExit('Task Hub integration is not present, or the app imports changed. No changes made.')
if "if (section === 'signing') return" not in t or "const count = companies.length;" not in t:
    raise SystemExit('Signing module format differs; no changes made.')
if "if(db) installHubBridge(db,()=>state.user,()=>state.companies,showError);" not in s:
    raise SystemExit('Hub bridge anchor changed; no changes made.')
if '  <input id="document-upload" type="file" multiple hidden />`;' not in s:
    raise SystemExit('DMS render anchor changed; no changes made.')
if "if(a==='zh-launch-signing'){void launchSigning().catch(showError);return;}" not in s:
    raise SystemExit('DMS click handler changed; no changes made.')
# Integrate real signing workspace in lieu of the previous external-site link card.
t = "import { signingWorkspaceHTML } from './signing-workspace.js';\n" + t
start=t.index("  if (section === 'signing') return")
end=t.index('  const count = companies.length;',start)
t=t[:start] + "  if (section === 'signing') return signingWorkspaceHTML();\n" + t[end:]
s=s.replace("import { renderIntegratedView, installHubBridge, launchSigning } from './integrated-modules.js';",
"import { renderIntegratedView, installHubBridge, launchSigning } from './integrated-modules.js';\nimport { initSigningWorkspace, restoreSigningWorkspace, presetSigning } from './signing-workspace.js';",1)
s=s.replace("if(db) installHubBridge(db,()=>state.user,()=>state.companies,showError);",
"if(db) installHubBridge(db,()=>state.user,()=>state.companies,showError);\n  if(db) initSigningWorkspace(db,()=>state.user,()=>state.companies);",1)
s=s.replace('  <input id="document-upload" type="file" multiple hidden />`;',
'  <input id="document-upload" type="file" multiple hidden />`;\n  if(state.module===\'signing\') queueMicrotask(restoreSigningWorkspace);',1)
s=s.replace("if(a==='zh-launch-signing'){void launchSigning().catch(showError);return;}",
"if(a==='zh-launch-signing'){void launchSigning().catch(showError);return;}\n  if(a==='zh-create-signing'){presetSigning(state.companyId,id);state.module='signing';render();return;}",1)
if "${action('Download','download-file',doc.id)}" not in s or "${current?action('↑ Upload documents','upload-trigger','','primary'):''}" not in s:
    raise SystemExit('Unexpected DMS file layout; no changes made.')
s=s.replace("${action('Download','download-file',doc.id)}", "${/\\.pdf$/i.test(doc.name)?action('✍ Sign','zh-create-signing',doc.id):''}${action('Download','download-file',doc.id)}",1)
s=s.replace("${current?action('↑ Upload documents','upload-trigger','','primary'):''}","${action('✍ New signing','zh-create-signing')} ${current?action('↑ Upload documents','upload-trigger','','primary'):''}",1)
# Ensure the EdgeOne environment variable is made available to both build jobs.
if 'VITE_EDGEONE_SIGNING_URL:' not in w:
    if 'jobs:\n' not in w:raise SystemExit('Workflow format changed; no files modified.')
    w=w.replace('jobs:\n','env:\n  VITE_EDGEONE_SIGNING_URL: ${{ vars.VITE_EDGEONE_SIGNING_URL }}\njobs:\n',1)
main.write_text(s);modules.write_text(t);workflow.write_text(w)
print('DMS signing-workspace integration applied. Run node --check and npm run build before pushing.')
