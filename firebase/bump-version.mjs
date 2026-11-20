// 새 앱(multi/) 올리기 전에: node bump-version.mjs  (또는 npm run bump)
// 깃허브 페이지는 폰이 파일을 10분까지 들고 있음 → 파일끼리 부르는 주소에 ?v=번호를 붙여, 올릴 때마다 번호를 올려 새 파일을 바로 받게 함
import { readFile, writeFile, readdir } from 'node:fs/promises';
const dir = new URL('../multi/', import.meta.url);
const html = await readFile(new URL('index.html', dir), 'utf8');
const v = (+((html.match(/app\.js\?v=(\d+)/) || [])[1] || 0)) + 1;
await writeFile(new URL('index.html', dir), html.replace(/app\.js(\?v=\d+)?"/, `app.js?v=${v}"`));
for (const f of (await readdir(dir)).filter(f => f.endsWith('.js'))) {
  const s = await readFile(new URL(f, dir), 'utf8');
  const t = s.replace(/from '(\.\/[^'?]+\.js)(\?v=\d+)?'/g, `from '$1?v=${v}'`);
  if (t !== s) await writeFile(new URL(f, dir), t);
}
// multi2(산성 화면 그대로 + Firebase)도 multi 파일을 같은 번호로 불러야 Firebase가 두 번 안 뜸
const dir2 = new URL('../multi2/', import.meta.url);
for (const f of (await readdir(dir2)).filter(f => f.endsWith('.js'))) {
  const s = await readFile(new URL(f, dir2), 'utf8');
  const t = s.replace(/(['"])\.\.\/multi\/([^'"?]+\.js)(?:\?v=\d+)?\1/g, (m, q, f) => `${q}../multi/${f}?v=${v}${q}`);
  if (t !== s) await writeFile(new URL(f, dir2), t);
}
console.log('새 앱 버전', v);
