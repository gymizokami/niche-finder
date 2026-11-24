/* =====================================================================
   Niche Finder — utilidades compartilhadas
   API do YouTube, contagem de cota, formatação de números e datas.
   Carregado depois de modos/*.js e antes de mineracao.js / analise.js.
   ===================================================================== */
const $ = s => document.querySelector(s);
const MODO = window.NF_MODO;
const API = 'https://www.googleapis.com/youtube/v3/';

// Modo teste (?teste na URL): API falsa, nada é gravado nas chaves reais.
const TESTE = new URLSearchParams(location.search).has('teste');
const LS = Object.fromEntries(Object.entries(MODO.ls).map(([k,v]) => [k, TESTE ? 'teste_'+v : v]));

const isShort = MODO.isShort;
const FORMATS = MODO.formats || null;
const fmtOf   = MODO.fmtOf || (() => null);
const HIT     = MODO.hit;

/* ---------- formatação ---------- */
const nfmt  = new Intl.NumberFormat('pt-BR', { notation:'compact', maximumFractionDigits:1 });
const fmt   = n => n == null ? '—' : nfmt.format(n);
const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = x => Math.max(0, Math.min(1, x));
const days  = d => Math.max(1, (Date.now() - new Date(d).getTime()) / 864e5);
const pct   = x => Math.round(x*100) + '%';
const dec   = (x, n=1) => x.toFixed(n).replace('.', ',');
const med   = a => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y), n=s.length; return n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2; };
const durTxt = s => s>=3600 ? dec(s/3600).replace(',0','')+' h' : Math.max(1,Math.round(s/60))+' min';
function isoDur(s){ const m=/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s||''); if(!m) return 0; return (+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0); }
function hms(sec){ const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=sec%60; return (h? h+':'+String(m).padStart(2,'0') : m)+':'+String(s).padStart(2,'0'); }
function chunk(a,n){ const o=[]; for(let i=0;i<a.length;i+=n) o.push(a.slice(i,i+n)); return o; }
function download(name, text, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
const loadJSON = (k, def) => { try{ return JSON.parse(localStorage.getItem(k)) ?? def; }catch{ return def; } };

/* ---------- API do YouTube ---------- */
let quotaUsed = 0;
async function yt(endpoint, params, cost){
  const url = new URL(API + endpoint);
  Object.entries({ ...params, key: $('#key').value.trim() })
    .forEach(([k,v]) => { if(v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  const r = await fetch(url);
  quotaUsed += cost; $('#qUsed').textContent = quotaUsed.toLocaleString('pt-BR');
  let j = {}; try{ j = await r.json(); }catch{}
  if(!r.ok || j.error){
    const reason = j.error?.errors?.[0]?.reason || ('HTTP '+r.status);
    const err = new Error(j.error?.message || reason); err.reason = reason; throw err;
  }
  return j;
}

/* Converte o objeto de vídeo da API no formato usado pela ferramenta */
const toVideo = v => ({
  id:v.id, title:v.snippet.title, date:v.snippet.publishedAt, dur:isoDur(v.contentDetails.duration),
  w:+v.player?.embedWidth||0, h:+v.player?.embedHeight||0, cat:v.snippet.categoryId, live:!!v.liveStreamingDetails,
  views:+v.statistics.viewCount||0, likes:+v.statistics.likeCount||0, comments:+v.statistics.commentCount||0,
  thumb:v.snippet.thumbnails?.medium?.url||v.snippet.thumbnails?.default?.url||''
});
const VIDEO_PARTS = { part:'snippet,statistics,contentDetails,player,liveStreamingDetails', maxResults:50, maxHeight:720 };

/* Mensagem de erro legível */
function apiErrMsg(e){
  const m = (e.message||'') + ' ' + (e.reason||'');
  if(e.reason === 'quotaExceeded') return 'Cota diária da API esgotada — tente amanhã ou use outra chave.';
  if(e.reason === 'keyInvalid' || /API key not valid/i.test(m)) return 'Chave da API inválida.';
  if(/has not been used|is disabled|accessNotConfigured/i.test(m)) return 'A YouTube Data API v3 não está ativada no projeto desta chave.';
  if(/referer|referrer/i.test(m)) return 'A chave tem restrição de "referenciador HTTP" que não inclui este endereço. Ajuste a restrição no Google Cloud.';
  return e.message || String(e);
}

/* Viral Score 0–100 (o mesmo na mineração e na análise) */
function viralParts(avg, vpd, median, vps){
  return {
    A: clamp(Math.log10(avg+1)/6),
    B: clamp(Math.log10(vpd+1)/5),
    D: clamp(Math.log10(median+1)/6),
    C: vps == null ? .5 : clamp(Math.log10(vps+1)/Math.log10(51))
  };
}
const viralScore = p => Math.round(100*(.35*p.A + .25*p.B + .2*p.D + .2*p.C));
