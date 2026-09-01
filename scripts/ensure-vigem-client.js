const fs = require('fs');
const path = require('path');
const https = require('https');

const buildingForWindows = process.env.BUILDING_FOR_WINDOWS === '1';
if ((!buildingForWindows && process.platform !== 'win32') || (!buildingForWindows && process.arch !== 'x64')) {
  console.log('[87Z] ViGEmClient.dll é necessário em Windows x64.');
  process.exit(0);
}

const out = path.join(__dirname, '..', 'ViGEmClient.dll');
if (fs.existsSync(out)) {
  console.log('[87Z] ViGEmClient.dll already present.');
  process.exit(0);
}

const url = 'https://unpkg.com/vigemclient@1.5.3/native/x64/ViGEmClient.dll';
console.log('[87Z] Downloading ViGEmClient.dll...');

function download(target, redirects = 0) {
  https.get(url, { headers: { 'User-Agent': '87Z-Installer/0.1.1' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
      res.resume();
      const next = new URL(res.headers.location, url).toString();
      https.get(next, { headers: { 'User-Agent': '87Z-Installer/0.1.1' } }, r => saveResponse(r, target, redirects + 1));
      return;
    }
    saveResponse(res, target, redirects);
  }).on('error', fail);
}
function saveResponse(res, target, redirects) {
  if (res.statusCode !== 200) { res.resume(); fail(new Error(`HTTP ${res.statusCode}`)); return; }
  const tmp = target + '.download';
  const file = fs.createWriteStream(tmp);
  res.pipe(file);
  file.on('finish', () => file.close(() => {
    try {
      const header = Buffer.alloc(2);
      const fd = fs.openSync(tmp, 'r');
      fs.readSync(fd, header, 0, 2, 0);
      fs.closeSync(fd);
      if (header.toString('ascii') !== 'MZ' || fs.statSync(tmp).size < 100000) {
        throw new Error('arquivo recebido não é uma DLL válida');
      }
      fs.renameSync(tmp, target);
      console.log('[87Z] ViGEmClient.dll installed.');
    }
    catch (e) { fail(e); }
  }));
  file.on('error', e => { try { fs.unlinkSync(tmp); } catch (_) {} ; fail(e); });
}
function fail(err) {
  console.error('[87Z] Não foi possível obter o ViGEmClient.dll:', err.message);
  console.error('[87Z] O aplicativo abrirá, mas o Xbox 360 virtual não será criado até que ViGEmClient.dll esteja disponível.');
  process.exit(0);
}
download(out);
