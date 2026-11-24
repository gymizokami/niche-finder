/* =====================================================================
   Niche Finder — Mineração
   Busca vídeos recentes por palavra-chave, filtra canais novos/pequenos,
   confere a idade real pelo 1º upload, remove Shorts e rankeia.
   Ordem das chamadas (importa para a cota):
     search (100 un.) → channels (1) → playlistItems (1) → videos (1)
   ===================================================================== */
let aborting = false, results = [], funnel = null;
const DUR_LABEL = { short:'até 4 min', medium:'4–20 min', long:'+20 min' };

/* ---------- Configuração da barra lateral ---------- */
const cfgIds = ['kws','lang','region','catMusic','maxAge','maxSubs','minVids','maxVids','minAvg','maxShorts',
                'durShort','durMedium','durLong','pages','order','hideSeen','rememberKey'].filter(id => document.getElementById(id));
function readCfg(){ const c={}; cfgIds.forEach(id=>{ const el=$('#'+id); c[id] = el.type==='checkbox' ? el.checked : el.value; }); return c; }
function saveCfg(){
  localStorage.setItem(LS.cfg, JSON.stringify(readCfg()));
  const k = $('#key').value.trim();
  if($('#rememberKey').checked && k) localStorage.setItem(LS.key, k);
  else if(!$('#rememberKey').checked) localStorage.removeItem(LS.key);
  estimate();
}
function loadCfg(){
  const c = loadJSON(LS.cfg, null);
  if(c) cfgIds.forEach(id=>{ const el=$('#'+id); if(c[id]===undefined) return; if(el.type==='checkbox') el.checked=c[id]; else el.value=c[id]; });
  if(!$('#kws').value.trim()) $('#kws').value = MODO.presets.pt.slice(0,6).join('\n');
  $('#key').value = localStorage.getItem(LS.key) || '';
}
const keywords  = () => [...new Set($('#kws').value.split('\n').map(s=>s.trim()).filter(Boolean))];
const durations = () => ['short','medium','long'].filter(d => $('#dur'+d[0].toUpperCase()+d.slice(1))?.checked);
function estimate(){ const n = keywords().length * durations().length * (+$('#pages').value); $('#qEst').textContent = (n*100 + Math.ceil(n*50*0.6)).toLocaleString('pt-BR'); }

function renderChips(p){
  $('#chips').innerHTML = MODO.presets[p].map(k=>`<button class="chip" type="button">${esc(k)}</button>`).join('');
  document.querySelectorAll('#presetTabs button').forEach(b=>b.classList.toggle('on', b.dataset.p===p));
}
$('#presetTabs').addEventListener('click', e=>{ if(e.target.dataset.p) renderChips(e.target.dataset.p); });
$('#chips').addEventListener('click', e=>{
  if(!e.target.classList.contains('chip')) return;
  const k = e.target.textContent, list = keywords();
  if(!list.includes(k)){ $('#kws').value = [...list,k].join('\n'); saveCfg(); }
});
document.querySelector('.side').addEventListener('input', saveCfg);
document.querySelector('.side').addEventListener('change', saveCfg);

/* ---------- Painel de progresso ---------- */
function log(msg, cls=''){ const d=document.createElement('div'); if(cls) d.className=cls; d.textContent=msg; $('#log').appendChild(d); $('#log').scrollTop=1e9; }
function step(t, p){ $('#step').textContent=t; if(p!=null) $('#prog').style.width=(p*100).toFixed(1)+'%'; }
async function pool(items, n, fn){ let i=0; await Promise.all(Array.from({length:Math.min(n,items.length)}, async () => { while(i<items.length && !aborting){ const k=i++; await fn(items[k],k); } })); }

/* ---------- Pipeline ---------- */
async function mine(){
  if(!$('#key').value.trim()){ alert('Cole sua chave da API do YouTube primeiro.'); $('#key').focus(); return; }
  const kws = keywords(), durs = durations();
  if(!kws.length){ alert('Adicione pelo menos uma palavra-chave.'); return; }
  if(!durs.length){ alert('Selecione pelo menos uma duração de vídeo.'); return; }

  const c = readCfg();
  const maxAge=+c.maxAge||60, maxSubs=+c.maxSubs, minVids=Math.max(1,+c.minVids||1),
        maxVids=Math.min(MODO.maxVidsCap, +c.maxVids||MODO.maxVidsCap),
        minAvg=+c.minAvg||0, maxShorts=(+c.maxShorts)/100, pages=+c.pages||1;
  const cutoff = new Date(Date.now() - maxAge*864e5);

  aborting=false; $('#go').disabled=true; $('#go').textContent='Minerando…';
  $('#run').classList.add('show'); $('#log').innerHTML=''; $('#empty').hidden=true;
  const F = { videos:0, channels:0, subs:0, vids:0, old:0, shorts:0, low:0, pass:0 };
  const cands = new Map();   // channelId -> { kws:Set }
  let fatal = null;

  try{
    // 1) BUSCA
    const jobs=[]; kws.forEach(k=>durs.forEach(d=>jobs.push({k,d})));
    let done=0;
    for(const {k,d} of jobs){
      if(aborting) break;
      let token;
      for(let p=0; p<pages && !aborting; p++){
        step(`Buscando “${k}” (${DUR_LABEL[d]})`, 0.5*done/jobs.length);
        const j = await yt('search', { part:'snippet', type:'video', q:k, order:c.order, publishedAfter:cutoff.toISOString(),
          maxResults:50, videoDuration:d, videoCategoryId:c.catMusic?'10':'', relevanceLanguage:c.lang, regionCode:c.region, pageToken:token }, 100);
        for(const it of j.items||[]){
          F.videos++;
          const id=it.snippet.channelId; if(!cands.has(id)) cands.set(id,{kws:new Set()});
          cands.get(id).kws.add(k);
        }
        token=j.nextPageToken; if(!token) break;
      }
      done++;
    }
    log(`${F.videos} vídeos encontrados → ${cands.size} canais únicos`);
    F.channels = cands.size;

    // 2) CANAIS → filtro de inscritos / nº de vídeos
    step('Lendo dados dos canais…', .55);
    const chans=[];
    for(const ids of chunk([...cands.keys()],50)){
      if(aborting) break;
      const j = await yt('channels', { part:'snippet,statistics,contentDetails', id:ids.join(','), maxResults:50 }, 1);
      for(const ch of j.items||[]){
        const st=ch.statistics||{}, subs = st.hiddenSubscriberCount ? null : +st.subscriberCount||0, vc=+st.videoCount||0;
        if(subs!=null && subs>maxSubs){ F.subs++; continue; }
        if(vc>maxVids || vc<1){ F.vids++; continue; }
        chans.push({ id:ch.id, title:ch.snippet.title, handle:ch.snippet.customUrl||'', country:ch.snippet.country||'',
          created:ch.snippet.publishedAt, thumb:ch.snippet.thumbnails?.default?.url||'', subs, videoCount:vc,
          uploads:ch.contentDetails?.relatedPlaylists?.uploads, kws:[...cands.get(ch.id).kws] });
      }
    }
    log(`${chans.length} canais passaram no filtro de inscritos/vídeos`);

    // 3) UPLOADS → idade real (data do 1º vídeo, não a de criação do canal)
    const young=[]; let n=0;
    await pool(chans, 6, async ch => {
      try{
        let items=[], token;
        for(let p=0; p<MODO.uploadPages; p++){
          const j = await yt('playlistItems', { part:'contentDetails', playlistId:ch.uploads, maxResults:50, pageToken:token }, 1);
          items.push(...(j.items||[]).filter(i=>i.contentDetails?.videoPublishedAt));
          token=j.nextPageToken; if(!token) break;
        }
        if(!items.length){ F.old++; return; }
        const first = items.reduce((m,i)=> i.contentDetails.videoPublishedAt < m ? i.contentDetails.videoPublishedAt : m, items[0].contentDetails.videoPublishedAt);
        if(new Date(first) < cutoff){ F.old++; return; }
        ch.firstVideo=first; ch.videoIds=items.map(i=>i.contentDetails.videoId); young.push(ch);
      }catch(e){ if(e.reason==='quotaExceeded') throw e; F.old++; }
      finally{ step(`Verificando idade dos canais (${++n}/${chans.length})`, .55 + .2*n/Math.max(1,chans.length)); }
    });
    log(`${young.length} canais com 1º vídeo nos últimos ${maxAge} dias`);

    // 4) VÍDEOS → métricas (player traz a proporção, usada para detectar Shorts)
    const vmap=new Map(), batches=chunk(young.flatMap(c=>c.videoIds),50); n=0;
    for(const ids of batches){
      if(aborting) break;
      const j = await yt('videos', { ...VIDEO_PARTS, id:ids.join(',') }, 1);
      for(const v of j.items||[]) vmap.set(v.id, v);
      step(`Analisando vídeos (${++n}/${batches.length})`, .75 + .2*n/Math.max(1,batches.length));
    }

    const seen = new Set(loadJSON(LS.seen, []));
    const out=[];
    for(const ch of young){
      const vids = ch.videoIds.map(id=>vmap.get(id)).filter(v=>v && v.snippet.liveBroadcastContent==='none').map(toVideo);
      if(!vids.length){ F.old++; continue; }
      const valid = vids.filter(v=>!isShort(v)), shortsPct = 1 - valid.length/vids.length;
      if(shortsPct>maxShorts || valid.length<minVids){ F.shorts++; continue; }
      const views = valid.map(v=>v.views);
      const sum = views.reduce((a,b)=>a+b,0), avg = sum/views.length, median = med(views);
      if(avg<minAvg){ F.low++; continue; }
      const age = days(ch.firstVideo), vpd = sum/age, vps = ch.subs ? avg/ch.subs : null;
      const score = viralScore(viralParts(avg, vpd, median, vps));
      const likeRate = sum ? valid.reduce((a,v)=>a+v.likes,0)/sum : 0;
      let mix=null, dominant=null;
      if(FORMATS){ mix={}; Object.keys(FORMATS).forEach(k=>mix[k]=0); valid.forEach(v=>mix[fmtOf(v.dur)]++); dominant=Object.entries(mix).sort((a,b)=>b[1]-a[1])[0][0]; }
      const byViews=[...valid].sort((a,b)=>b.views-a.views);
      out.push({ ...ch, videoIds:undefined,
        videos: valid.sort((a,b)=>a.date<b.date?-1:1).map(({w,h,...v})=>v), totalAll:vids.length,
        validCount:valid.length, shortsPct, avg, median, sumValid:sum, age, vpd, vps, score, likeRate,
        mix, dominant, lives: valid.filter(v=>v.live).length,
        avgDur: valid.reduce((a,v)=>a+v.dur,0)/valid.length, perWeek: valid.length/(age/7),
        hitRate: valid.filter(v=>v.views>=Math.max(minAvg,10000)).length/valid.length,
        top: byViews.slice(0,3), isNew: !seen.has(ch.id) });
    }
    F.pass = out.length;
    out.forEach(r=>seen.add(r.id));
    localStorage.setItem(LS.seen, JSON.stringify([...seen].slice(-20000)));
    results=out; funnel=F;
    localStorage.setItem(LS.res, JSON.stringify({ at:new Date().toISOString(), funnel:F, results, kws }));
    log(`✔ ${out.length} canais aprovados`);
    step(aborting ? 'Interrompido — resultados parciais' : 'Concluído', 1);
  }catch(e){
    fatal=e; log('✖ '+apiErrMsg(e),'err'); step('Erro', null);
  }finally{
    $('#go').disabled=false; $('#go').textContent=MODO.goLabel;
    if(!fatal) setTimeout(()=>$('#run').classList.remove('show'), 1800);
    render();
  }
}

/* ---------- Cards ---------- */
function tier(s){ return s>=80?['Explosivo','t4']:s>=68?['Forte','t3']:s>=55?['Promissor','t2']:['Morno','t1']; }
function spark(vids, hitMin){
  if(!vids.length) return '';
  const W=300,H=46,g=2,n=vids.length,w=Math.max(1.5,(W-g*(n-1))/n), mx=Math.log10(Math.max(...vids.map(v=>v.views))+1)||1;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`+vids.map((v,i)=>{
    const h=Math.max(2,H*Math.log10(v.views+1)/mx);
    return `<rect class="${v.views>=hitMin?'hit':''}" x="${(i*(w+g)).toFixed(1)}" y="${(H-h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${esc(v.title)} — ${fmt(v.views)} views · ${durTxt(v.dur)}</title></rect>`;
  }).join('')+`</svg>`;
}
function mixBar(mix, total, lives=0){
  if(!FORMATS || !mix) return '';
  const t = total||1, keys = Object.keys(FORMATS);
  return `<div class="mix-bar">${keys.map(k=>mix[k]?`<i style="width:${mix[k]/t*100}%;background:${FORMATS[k][1]}"></i>`:'').join('')}</div>
  <div class="mix-l">${keys.filter(k=>mix[k]).map(k=>`<span style="--c:${FORMATS[k][1]}">${FORMATS[k][0]} ${Math.round(mix[k]/t*100)}%</span>`).join('')}${lives?`<span style="--c:var(--muted)">${lives} live${lives>1?'s':''}</span>`:''}</div>`;
}
function card(r, i){
  const [tl, tc] = tier(r.score), t=r.top[0], url=`https://www.youtube.com/channel/${r.id}`;
  const fd = new Date(r.firstVideo).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  const last = FORMATS ? `<div><b>${dec((r.likeRate||0)*100)}%</b><span>likes / views</span></div>`
                       : `<div><b>${dec(r.perWeek)}</b><span>vídeos / semana</span></div>`;
  return `<article class="card ${i<3?'top3':''}">
    <div class="c-head">
      <div class="rank">${String(i+1).padStart(2,'0')}</div>
      <img class="ava" src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="c-name">
        <a href="${url}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.title)}</a>
        <div class="c-meta">${r.isNew?'<span class="new">NOVO</span>':''}${r.dominant&&FORMATS?`<span class="fmt-tag">${FORMATS[r.dominant][0]}</span>`:''}<span>${esc(r.handle||'')}</span>${r.country?`<span>· ${esc(r.country)}</span>`:''}</div>
      </div>
      <div class="score ${tc}"><b>${r.score}</b><span>${tl}</span></div>
    </div>
    <div class="sbar"><i style="width:${r.score}%"></i></div>
    <div class="stats">
      <div class="hl"><b>${fmt(Math.round(r.avg))}</b><span>média de views</span></div>
      <div><b>${fmt(Math.round(r.median))}</b><span>mediana</span></div>
      <div><b>${r.subs==null?'oculto':fmt(r.subs)}</b><span>inscritos</span></div>
      <div><b>${Math.round(r.age)}d</b><span>1º vídeo · ${fd}</span></div>
      <div><b>${r.validCount}${r.totalAll>r.validCount?`<small style="color:var(--dim);font-size:11px">/${r.totalAll}</small>`:''}</b><span>vídeos (sem Shorts)</span></div>
      <div><b>${fmt(Math.round(r.vpd))}</b><span>views / dia</span></div>
      <div><b>${r.vps==null?'—':dec(r.vps)+'×'}</b><span>views / inscrito</span></div>
      <div><b>${durTxt(r.avgDur)}</b><span>duração média</span></div>
      ${last}
    </div>
    ${FORMATS?`<div class="mix">${mixBar(r.mix, r.validCount, r.lives)}</div>`:''}
    <div class="spark"><div class="spark-l"><span>Views por vídeo (ordem de postagem)${FORMATS?` · ${dec(r.perWeek)}/sem`:''}</span><span>${Math.round(r.hitRate*100)}% hits</span></div>${spark(r.videos, Math.max(r.median,10000))}</div>
    ${t?`<a class="topvid" href="https://www.youtube.com/watch?v=${t.id}" target="_blank" rel="noopener">
      <div class="thumb"><img src="${esc(t.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><em>${hms(t.dur)}</em></div>
      <div><div class="tv-k">Vídeo mais viral</div><div class="tv-t">${esc(t.title)}</div><div class="tv-s">${fmt(t.views)} views · ${Math.round(days(t.date))}d atrás</div></div>
    </a>`:''}
    ${r.top.length>1?`<ul class="others">${r.top.slice(1).map(v=>`<li><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" title="${esc(v.title)}">${esc(v.title)}</a><span>${fmt(v.views)} · ${durTxt(v.dur)}</span></li>`).join('')}</ul>`:''}
    <div class="c-foot">
      <div class="kws">${r.kws.map(k=>`<span class="kw">${esc(k)}</span>`).join('')}</div>
      <div class="acts"><button class="btn sm ghost" data-an="${r.id}" title="Analisar a fundo e dar nota para modelar">Analisar</button><a class="btn sm" href="${url}/videos" target="_blank" rel="noopener">Ver canal</a><button class="btn sm ghost" data-hide="${r.id}" title="Descartar">✕</button></div>
    </div>
  </article>`;
}

/* ---------- Lista / filtros ---------- */
const SORTS = { score:(a,b)=>b.score-a.score, avg:(a,b)=>b.avg-a.avg, vpd:(a,b)=>b.vpd-a.vpd, vps:(a,b)=>(b.vps??-1)-(a.vps??-1),
  like:(a,b)=>(b.likeRate||0)-(a.likeRate||0), age:(a,b)=>a.age-b.age, subs:(a,b)=>(a.subs??1e12)-(b.subs??1e12) };
function render(){
  const q=$('#q').value.trim().toLowerCase(), hideSeen=$('#hideSeen').checked, ff=$('#fmtFilter')?.value;
  let list=[...results].sort(SORTS[$('#sort').value]||SORTS.score);
  if(hideSeen) list=list.filter(r=>r.isNew);
  if(ff) list=list.filter(r=>r.dominant===ff);
  if(q) list=list.filter(r=>(r.title+' '+r.kws.join(' ')+' '+r.videos.map(v=>v.title).join(' ')).toLowerCase().includes(q));
  $('#grid').innerHTML=list.map(card).join('');
  $('#tools').hidden=!results.length;
  $('#empty').hidden=!!results.length;
  if(results.length){
    $('#title').textContent=`${list.length} ${MODO.noun} minerados`;
    const saved=loadJSON(LS.res, {});
    $('#subtitle').textContent = saved.at ? `Mineração de ${new Date(saved.at).toLocaleString('pt-BR')} · ranking do mais viral ao menos` : '';
  }else if(funnel){ $('#title').textContent='Nenhum canal passou nos filtros'; $('#subtitle').textContent='Afrouxe os critérios (mais dias, mais inscritos, menor média) ou troque as palavras-chave.'; }
  if(funnel){
    $('#funnel').hidden=false;
    $('#funnel').innerHTML=`<div><b>${funnel.videos}</b>vídeos achados</div><div><b>${funnel.channels}</b>canais únicos</div><div><b>${funnel.subs}</b>muitos inscritos</div><div><b>${funnel.vids}</b>muitos vídeos</div><div><b>${funnel.old}</b>canal antigo</div><div><b>${funnel.shorts}</b>Shorts / poucos vídeos</div><div><b>${funnel.low}</b>média baixa</div><div class="pass"><b>${funnel.pass}</b>aprovados</div>`;
  }
}
$('#grid').addEventListener('click', e=>{
  const id=e.target.dataset?.hide; if(!id) return;
  results=results.filter(r=>r.id!==id);
  const saved=loadJSON(LS.res, {}); saved.results=results; localStorage.setItem(LS.res, JSON.stringify(saved));
  render();
});
$('#q').addEventListener('input', render); $('#sort').addEventListener('change', render); $('#hideSeen').addEventListener('change', render);
$('#fmtFilter')?.addEventListener('change', render);

/* ---------- Exportar ---------- */
$('#csv').onclick=()=>{
  const fk = FORMATS ? Object.keys(FORMATS) : [];
  const cols=['rank','canal','url','score',...(FORMATS?['formato']:[]),'media_views','mediana','inscritos','videos_sem_shorts','dias_desde_1o_video','primeiro_video','views_dia','views_por_inscrito','duracao_media_min','like_rate_pct',...fk.map(k=>'pct_'+FORMATS[k][0].toLowerCase()),'palavras_chave','video_top','views_video_top'];
  const rows=[...results].sort(SORTS.score).map((r,i)=>{ const t=r.validCount||1; return [i+1,r.title,`https://www.youtube.com/channel/${r.id}`,r.score,...(FORMATS?[FORMATS[r.dominant]?.[0]||'']:[]),
    Math.round(r.avg),Math.round(r.median),r.subs??'',r.validCount,Math.round(r.age),r.firstVideo.slice(0,10),Math.round(r.vpd),r.vps==null?'':r.vps.toFixed(2),(r.avgDur/60).toFixed(1),((r.likeRate||0)*100).toFixed(2),
    ...fk.map(k=>Math.round((r.mix?.[k]||0)/t*100)),r.kws.join(' | '),r.top[0]?.title||'',r.top[0]?.views||'']; });
  download(`${MODO.filePrefix}-${new Date().toISOString().slice(0,10)}.csv`, '\ufeff'+[cols,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n'), 'text/csv');
};
$('#json').onclick=()=>download(`${MODO.filePrefix}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(results,null,2), 'application/json');

$('#go').onclick = mine;
$('#stop').onclick = ()=>{ aborting=true; step('Parando…'); };
