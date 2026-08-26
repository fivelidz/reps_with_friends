// WhatsApp connect page — crew code → wa.me deep links + QR.
// QR: vendored qrcode-generator (MIT, Kazuhiko Arase) loaded as a classic
// script — exposes the global `qrcode`.
const { qrcode } = globalThis;

const $ = (id) => document.getElementById(id);
const BOT_NUMBER = '61493484788'; // Qalarc Hub WhatsApp (E.164, no +)

function waLink(text) {
  return `https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(text)}`;
}

function renderQr(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('qrWrap').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
}

$('codeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('codeInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return;
  const cmd = `link ${code}`;
  $('cmdText').textContent = cmd;
  $('waGroup').href = waLink(cmd);
  $('waDm').href = waLink(cmd);
  renderQr(waLink(cmd));
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('copyNumber').addEventListener('click', async () => {
  const num = `+${BOT_NUMBER}`;
  try { await navigator.clipboard.writeText(num); } catch { /* ignore */ }
  const b = $('copyNumber');
  b.textContent = 'Copied ✓';
  setTimeout(() => (b.textContent = 'Copy'), 1400);
});

// Prefill from ?code= (the app's link screen can deep-link here).
const pre = new URL(location).searchParams.get('code');
if (pre) {
  $('codeInput').value = pre.toUpperCase();
  $('codeForm').requestSubmit();
}
