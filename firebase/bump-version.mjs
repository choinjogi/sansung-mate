// 새 앱(multi/) 올리기 전에: node bump-version.mjs  (또는 npm run bump)
// 깃허브 페이지는 폰이 파일을 10분까지 들고 있음 → 파일끼리 부르는 주소에 ?v=번호를 붙여, 올릴 때마다 번호를 올려 새 파일을 바로 받게 함
import { readFile, writeFile, readdir } from 'node:fs/promises';
const dir = new URL('../multi/', import.meta.url);
const html = await readFile(new URL('old.html', dir), 'utf8');   // 11/21부터 index.html = 산성 화면(2판), 예전 화면 = old.html
const v = (+((html.match(/app\.js\?v=(\d+)/) || [])[1] || 0)) + 1;
await writeFile(new URL('old.html', dir), html.replace(/app\.js(\?v=\d+)?"/, `app.js?v=${v}"`));
for (const f of ['../multi/index.html', '../multi2/index.html']) {
  const u = new URL(f, import.meta.url.replace(/[^/]+$/, '') + '../multi/'), h = await readFile(u, 'utf8');
  await writeFile(u, h.replace(/data-fb\.js\?v=\d+/, `data-fb.js?v=${v}`));
}
for (const f of (await readdir(dir)).filter(f => f.endsWith('.js'))) {
  const s = await readFile(new URL(f, dir), 'utf8');
  const t = s.replace(/from '(\.\/[^'?]+\.js)(\?v=\d+)?'/g, `from '$1?v=${v}'`);
  if (t !== s) await writeFile(new URL(f, dir), t);
}
// 공개 근무표 페이지(week.html)도 같은 번호로
{ const u = new URL('week.html', dir), h = await readFile(u, 'utf8'); await writeFile(u, h.replace(/from '(\.\/[^'?]+\.js)(\?v=\d+)?'/g, `from '$1?v=${v}'`)); }
// multi2(산성 화면 그대로 + Firebase)도 multi 파일을 같은 번호로 불러야 Firebase가 두 번 안 뜸
const dir2 = new URL('../multi2/', import.meta.url);
for (const f of (await readdir(dir2)).filter(f => f.endsWith('.js'))) {
  const s = await readFile(new URL(f, dir2), 'utf8');
  const t = s.replace(/(['"])\.\.\/multi\/([^'"?]+\.js)(?:\?v=\d+)?\1/g, (m, q, f) => `${q}../multi/${f}?v=${v}${q}`)
    .replace(/(['"])\.\/([^'"?]+\.js)(?:\?v=\d+)?\1/g, (m, q, f) => `${q}./${f}?v=${v}${q}`)   // multi2 자기 파일(admin·extra)
    .replace(/new URL\('app\.js(?:\?v=\d+)?'/g, `new URL('app.js?v=${v}'`);                  // 산성 화면 스크립트
  if (t !== s) await writeFile(new URL(f, dir2), t);
}
// 산성 화면(2판)의 "새 버전이 있어요" 띠: app.js APP_VER와 version.json을 같은 번호로
{ const u = new URL('../multi2/app.js', import.meta.url), a = await readFile(u, 'utf8'); await writeFile(u, a.replace(/const APP_VER = \d+;/, `const APP_VER = ${v};`)); }
for (const d of ['../multi/version.json', '../multi2/version.json']) await writeFile(new URL(d, import.meta.url), JSON.stringify({ v }));
console.log('새 앱 버전', v);
