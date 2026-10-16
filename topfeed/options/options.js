'use strict';
const FIELDS = ['defaultSort', 'anthropicKey', 'openaiKey', 'transcribeModel'];
const CHECKS = ['hideLauncher'];
const saved = document.getElementById('saved');
let t;

chrome.storage.local.get(FIELDS.concat(CHECKS, ['tf_snapshots']), (s) => {
  for (const f of FIELDS) if (s[f]) document.getElementById(f).value = s[f];
  for (const c of CHECKS) document.getElementById(c).checked = !!s[c];
  const snaps = s.tf_snapshots || [];
  document.getElementById('snapInfo').textContent = snaps.length + ' snapshot(s) guardados, ' +
    snaps.reduce((n, x) => n + x.items.length, 0) + ' posts en total.';
});

function save() {
  const o = {};
  for (const f of FIELDS) o[f] = document.getElementById(f).value.trim();
  for (const c of CHECKS) o[c] = document.getElementById(c).checked;
  chrome.storage.local.set(o, () => {
    saved.textContent = 'Guardado ✔';
    clearTimeout(t);
    t = setTimeout(() => { saved.textContent = ''; }, 1500);
  });
}
for (const id of FIELDS.concat(CHECKS)) document.getElementById(id).addEventListener('change', save);

document.getElementById('exportSnaps').onclick = () => {
  chrome.storage.local.get(['tf_snapshots'], (s) => {
    const blob = new Blob([JSON.stringify(s.tf_snapshots || [], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'topfeed_historial.json';
    a.click();
  });
};
document.getElementById('clearSnaps').onclick = () => {
  if (!confirm('¿Borrar todo el historial de snapshots?')) return;
  chrome.storage.local.set({ tf_snapshots: [] }, () => { document.getElementById('snapInfo').textContent = '0 snapshots guardados.'; });
};
