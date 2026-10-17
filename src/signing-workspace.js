/** ZHENLI DMS V1: restore the original EdgeOne service panel (no in-app signing API).
 * Deliberately uses existing V1 exports so Documents and other navigation remain untouched.
 */
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import './signing-workspace.css';

const rawSigningUrl = String(import.meta.env.VITE_EDGEONE_SIGNING_URL || '').trim();
let signingUrl = '';
try {
  const u = new URL(rawSigningUrl);
  if (u.protocol === 'https:' && !u.username && !u.password) signingUrl = u.href;
} catch { /* No valid EdgeOne site URL configured */ }

const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const getPanel = () => document.getElementById('zh-signing-workspace');
let bound = false;

export function signingWorkspaceHTML() {
  return '<div id="zh-signing-workspace"></div>';
}

function panelHTML() {
  return `<section class="sg-prev-panel">
    <section class="sg-prev-header">
      <div><p class="sg-prev-eyebrow">SIGNING WORKFLOW</p><h1>Sequential Signing</h1>
        <p class="sg-prev-subtitle">Continue using your existing Tencent EdgeOne signing engine and private storage.</p></div>
      <span class="sg-prev-chip">Existing EdgeOne service</span>
    </section>
    <section class="sg-prev-card">
      <h2>Keep your established signing process</h2>
      <p>Create a request, upload PDFs, position signature boxes, activate sequential signers, send links, and download signed PDFs with audit records in your original signing deployment.</p>
      <div class="sg-prev-steps"><span>① Draft &amp; upload</span><span>② Place signature boxes</span><span>③ Sign in order</span><span>④ Download signed PDFs</span></div>
      ${signingUrl ? `<a class="sg-prev-launch" data-sg-prev-open href="${htmlEscape(signingUrl)}" target="_blank" rel="noopener noreferrer">Open existing Signing Website ↗</a>
        <p class="sg-prev-origin">${htmlEscape(new URL(signingUrl).origin)}</p>` : `<div class="sg-prev-notice">Signing website address not configured. In GitHub → Settings → Secrets and variables → Actions → Variables, add <code>VITE_EDGEONE_SIGNING_URL</code> with your existing <strong>HTTPS EdgeOne signing site address</strong>, then run the web and APK workflow again.</div>`}
      <p class="sg-prev-footnote">Your original signing administrator account, signing requests, storage and sender emails remain on Tencent EdgeOne. Download completed PDFs there and upload them into the relevant DMS company folder. Automatic document transfer and single sign-on are not enabled.</p>
    </section>
  </section>`;
}

export function restoreSigningWorkspace() {
  const panel = getPanel();
  if (panel) panel.innerHTML = panelHTML();
}

export function resetSigningWorkspace() { /* No local signing state to reset */ }

export function presetSigning(_companyId, _documentId = '') {
  // A DMS document does not get uploaded to EdgeOne automatically in this version.
}

export function initSigningWorkspace() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-sg-prev-open]')) return;
    if (!signingUrl) return;
    if (Capacitor.isNativePlatform()) {
      event.preventDefault();
      void Browser.open({ url: signingUrl }).catch(err => {
        console.error('EdgeOne browser could not open', err);
        alert('Unable to open the EdgeOne website. Please check its HTTPS address and your connection.');
      });
    } // Web browsers follow the HTTPS anchor as a regular user-initiated navigation.
  });
}
