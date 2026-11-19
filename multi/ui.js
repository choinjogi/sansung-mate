// 화면 공용 도구 (app.js, attend.js가 같이 씀)
import { qrcode } from './vendor/firebase.js';
import * as api from './fb.js';

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const BASE = location.origin + location.pathname;
export const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
export const clone = o => JSON.parse(JSON.stringify(o));

export function toast(msg) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
export function show(html) { $('app').innerHTML = `<div class="fade">${html}</div>`; window.scrollTo(0, 0); }
export function top(title, back) {
  return `<div class="top"><div class="brand">${back ? '<button class="sm ghost" id="back">‹</button>' : ''}<span>${esc(title)}</span></div>
    ${api.auth.currentUser ? '<button class="sm ghost" id="out">로그아웃</button>' : ''}</div>`;
}
export function wireTop(back) {
  if ($('out')) $('out').onclick = async () => { await api.logout(); };
  if ($('back')) $('back').onclick = back;
}
// 버튼 눌렀을 때: 잠그고, 실패하면 이유를 보여 줌
export async function busy(btn, fn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = '잠시만요…';
  try { await fn(); } catch (e) { console.error(e); toast(niceErr(e)); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
}
export function niceErr(e) {
  const c = e && e.code || '';
  if (c === 'taken') return e.message;
  if (c.startsWith('functions/') && e.message && !/^(internal|INTERNAL)$/.test(e.message)) return e.message; // 서버 함수가 보낸 한국어 안내
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return '이름이나 번호가 맞지 않아요';
  if (/too-many-requests/.test(c)) return '여러 번 틀려서 잠시 막혔어요. 조금 뒤에 다시 해 주세요';
  if (/permission-denied/.test(c)) return '권한이 없어요';
  if (/network|unavailable/.test(c)) return '인터넷 연결을 확인해 주세요';
  if (/popup-closed|cancelled-popup/.test(c)) return '로그인 창이 닫혔어요';
  return (e && e.message) || '오류가 났어요';
}
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했어요'); } catch (e) { prompt('아래 주소를 복사하세요', text); }
}
export async function share(title, text, url) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copy(url);
}
export function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
export function linkCard({ title, desc, url, qr, extra = '' }) {
  return `<div class="card"><b>${title}</b><p class="small">${desc}</p>
    ${qr ? `<div class="qr">${qrSvg(url)}</div>` : ''}
    <div class="url">${esc(url)}</div>
    <div class="row" style="margin-top:10px"><button class="sm" data-copy="${esc(url)}">링크 복사</button><button class="sm ghost" data-share="${esc(url)}" data-title="${esc(title)}">공유</button>${extra}</div></div>`;
}
export function wireLinks() {
  document.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => copy(b.dataset.copy); });
  document.querySelectorAll('[data-share]').forEach(b => { b.onclick = () => share(b.dataset.title, b.dataset.title, b.dataset.share); });
}

