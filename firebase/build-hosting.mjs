// 새 앱을 Firebase 무료 주소(https://sansung-sheets.web.app/multi/)에 올릴 파일 모으기 → firebase/hosting-dist (저장소엔 안 넣음)
// 지금 산성 앱(저장소 맨 위 index.html·app.js 등)은 넣지 않는다 — 다른 주소(깃허브)라 폰에서 두 앱이 섞이지 않음
import { cp, rm, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url), out = new URL('./hosting-dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const d of ['multi', 'multi2', 'img', 'icons']) await cp(new URL(d + '/', root), new URL(d + '/', out), { recursive: true });
console.log('hosting-dist 준비: multi · multi2 · img · icons');
