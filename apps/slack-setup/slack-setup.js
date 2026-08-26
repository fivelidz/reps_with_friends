// Slack setup page — loads manifest, copy buttons, Add-to-Slack link builder.
const $ = (id) => document.getElementById(id);

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = 'Copied ✓';
  setTimeout(() => (btn.textContent = old), 1400);
}

// 1. Load the manifest (served beside this page).
let manifest = '';
try {
  const r = await fetch('/slack/manifest.yml');
  manifest = (await r.text()).trim();
} catch {
  manifest = '# manifest unavailable — see apps/bot-slack/manifest.yml in the repo';
}
$('manifestText').textContent = manifest;
$('copyManifest').addEventListener('click', () => copyText(manifest, $('copyManifest')));

// 3. Add-to-Slack link builder. Scopes must match the manifest.
const SCOPES = 'commands,chat:write,app_mentions:read';
function buildLink(clientId) {
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('scope', SCOPES);
  return u.toString();
}
function present(clientId) {
  const url = buildLink(clientId.trim());
  $('oauthUrl').textContent = url;
  $('openOauth').href = url;
  $('cidResult').hidden = false;
  try {
    const here = new URL(location);
    here.searchParams.set('client_id', clientId.trim());
    history.replaceState(null, '', here);
  } catch { /* ignore */ }
}
$('cidForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const cid = $('cidInput').value.trim();
  if (cid) present(cid);
});
$('copyOauth').addEventListener('click', () => copyText($('oauthUrl').textContent, $('copyOauth')));

// Prefill from ?client_id= (bookmarkable install page per workspace).
const pre = new URL(location).searchParams.get('client_id');
if (pre) {
  $('cidInput').value = pre;
  present(pre);
}
