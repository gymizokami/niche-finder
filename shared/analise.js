/* =====================================================================
   Niche Finder — Analisar canal
   Recebe link / @handle / link de vídeo / nome, lê até 200 uploads,
   calcula as métricas e dá a "nota para modelar" (0–10).
   Custo típico: 3–10 unidades (busca por nome: +100).
   ===================================================================== */

$('#view-an').innerHTML = `
  <div class="an-top">
    <h2>Analisar canal</h2>
    <p class="sub">Cole o link do canal, o @handle, o link de qualquer vídeo dele ou só o nome. A ferramenta lê até os 200 vídeos mais recentes (sem Shorts), calcula as métricas e dá uma <b>nota de 0 a 10</b> dizendo se vale modelar.</p>
    <form class="an-form" id="anForm" autocomplete="off">
      <input class="in" id="anInput" placeholder="@canal · link do canal · link de um vídeo · nome do canal">
      <button class="btn primary" id="anGo" type="submit">Analisar</button>
    </form>
    <div class="hint">Link/@handle custa ~3–10 unidades de cota. Busca por nome custa +100.</div>
    <div class="an-recent" id="anRecent"></div>
  </div>
  <div class="an-status" id="anStatus"></div>
  <div id="anOut"></div>`;

// Palavras ignoradas na contagem de palavras dos títulos
const STOP = new Set(('a o e é de da do das dos em no na nos nas um uma uns umas para pra por com sem que se sua seu suas seus como mais menos muito foi ser são ao à às pelo pela ou isso esse essa este esta você voce ele ela eles elas quando onde porque por que não nao sim já ja até ate sobre entre ' +
  'the of and to in on for with an is are was be by at from your you it this that these those my me we our how why what who when not all can will just its ' +
  'el la los las y en un una por con del al lo su sus es como pero sin más mas ' +
  'vs ft feat official oficial video vídeo videos vídeos hd 4k 1080p full completo completa parte part ep episódio episodio episode new novo nova').split(/\s+/));

function anStatus(t, err=false){ const s=$('#anStatus'); s.textContent=t; s.classList.toggle('err', err); }

/* ---------- Entrada → ID do canal ---------- */
function parseInput(raw){
  const s=raw.trim(); let m;
  if((m=s.match(/youtube\.com\/channel\/(UC[\w-]{22})/i)) || (m=s.match(/^(UC[\w-]{22})$/))) return {id:m[1]};
  if((m=s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/))) return {video:m[1]};
  if((m=s.match(/youtube\.com\/(@[^\/?#\s]+)/i))) return {handle:decodeURIComponent(m[1])};
  if((m=s.match(/^(@[^\s\/]+)$/))) return {handle:m[1]};
  if((m=s.match(/youtube\.com\/user\/([^\/?#\s]+)/i))) return {username:decodeURIComponent(m[1])};
  if((m=s.match(/youtube\.com\/c\/([^\/?#\s]+)/i))) return {query:decodeURIComponent(m[1])};
  return {query:s};
}
function pickChannel(items){
  return new Promise(res=>{
    anStatus('Encontrei mais de um canal com esse nome — escolha qual analisar:');
    $('#anOut').innerHTML = `<div class="pick">${items.map(i=>`<button type="button" class="pick-i" data-id="${esc(i.id.channelId)}">
      <img src="${esc(i.snippet.thumbnails?.default?.url||'')}" alt="" referrerpolicy="no-referrer">
      <span><b>${esc(i.snippet.title)}</b><small>${esc((i.snippet.description||'').slice(0,110))}</small></span></button>`).join('')}</div>`;
    $('#anOut').querySelectorAll('.pick-i').forEach(b=>b.onclick=()=>{ $('#anOut').innerHTML=''; res(b.dataset.id); });
  });
}
async function resolveChannel(raw){
  const p=parseInput(raw);
  if(p.id) return p.id;
  if(p.video){
    const j=await yt('videos',{part:'snippet',id:p.video},1);
    if(!j.items?.[0]) throw new Error('Vídeo não encontrado (privado ou removido?).');
    return j.items[0].snippet.channelId;
  }
  if(p.handle){
    const j=await yt('channels',{part:'id',forHandle:p.handle},1);
    if(j.items?.[0]) return j.items[0].id;
    throw new Error(`Nenhum canal com o handle ${p.handle}.`);
  }
  if(p.username){
    const j=await yt('channels',{part:'id',forUsername:p.username},1);
    if(j.items?.[0]) return j.items[0].id;
    p.query=p.username;
  }
  anStatus('Buscando canal pelo nome (custa 100 unidades)…');
  const j=await yt('search',{part:'snippet',type:'channel',q:p.query,maxResults:6},100);
  const items=j.items||[];
  if(!items.length) throw new Error('Nenhum canal encontrado com esse nome.');
  const q=p.query.trim().toLowerCase();
  const exact=items.filter(i=>i.snippet.title.trim().toLowerCase()===q);
  if(exact.length===1) return exact[0].id.channelId;
  if(items.length===1) return items[0].id.channelId;
  return pickChannel(items);
}

/* ---------- Coleta ---------- */
let anBusy=false;
async function analyzeChannel(raw){
  if(anBusy || !raw.trim()) return;
  if(!$('#key').value.trim()){ alert('Cole sua chave da API do YouTube na barra lateral primeiro.'); $('#key').focus(); return; }
  anBusy=true; $('#anGo').disabled=true; $('#anGo').textContent='Analisando…';
  const q0=quotaUsed;
  $('#anOut').innerHTML='';
  try{
    anStatus('Localizando canal…');
    const id=await resolveChannel(raw);
    anStatus('Lendo dados do canal…');
    const cj=await yt('channels',{part:'snippet,statistics,contentDetails',id},1);
    const ch=cj.items?.[0]; if(!ch) throw new Error('Canal não encontrado.');
    const st=ch.statistics||{}, subs=st.hiddenSubscriberCount?null:(+st.subscriberCount||0), total=+st.videoCount||0;
    let items=[], token, complete=false;
    for(let p=0;p<4;p++){
      anStatus(`Lendo uploads (${items.length} de ${Math.min(total,200)})…`);
      const j=await yt('playlistItems',{part:'contentDetails',playlistId:ch.contentDetails.relatedPlaylists.uploads,maxResults:50,pageToken:token},1);
      items.push(...(j.items||[]).filter(i=>i.contentDetails?.videoPublishedAt));
      token=j.nextPageToken; if(!token){ complete=true; break; }
    }
    if(!items.length) throw new Error('Esse canal não tem vídeos públicos.');
    const ids=items.map(i=>i.contentDetails.videoId), vmap=new Map(), parts=chunk(ids,50);
    for(let b=0;b<parts.length;b++){
      anStatus(`Analisando vídeos (${b+1}/${parts.length})…`);
      const j=await yt('videos',{ ...VIDEO_PARTS, id:parts[b].join(',') },1);
      (j.items||[]).forEach(v=>vmap.set(v.id,v));
    }
    const all=ids.map(i=>vmap.get(i)).filter(v=>v && v.snippet.liveBroadcastContent==='none').map(toVideo);
    if(!all.length) throw new Error('Não foi possível ler os vídeos desse canal.');
    const rep=buildReport(ch, subs, total, all, complete);
    rep.cost=quotaUsed-q0;
    $('#anOut').innerHTML=renderReport(rep);
    saveAnHist(rep);
    anStatus('');
  }catch(e){ anStatus('✖ '+apiErrMsg(e), true); }
  finally{ anBusy=false; $('#anGo').disabled=false; $('#anGo').textContent='Analisar'; }
}

/* ---------- Nota para modelar ----------
   tracao   (30%) média, mediana e views/dia
   consist  (25%) % de vídeos acima do HIT + mediana/média (não depende de 1 viral)
   alcance  (20%) views por inscrito (algoritmo entrega fora da base)
   momento  (15%) vídeos recentes vs anteriores
   entrada  (10%) canal novo e pequeno = nicho aberto
   Sem tração, a nota é puxada para baixo (nota *= .55…1). */
function buildReport(ch, subs, total, all, complete){
  const valid=all.filter(v=>!isShort(v)), shortsPct=1-valid.length/all.length;
  const onlyShorts=!valid.length, base=onlyShorts?all:valid;
  const oldest=all.reduce((m,v)=>v.date<m?v.date:m, all[0].date);
  const age=days(complete?oldest:ch.snippet.publishedAt);
  const views=base.map(v=>v.views), sum=views.reduce((a,b)=>a+b,0), avg=sum/base.length, median=med(views);
  const span=days(base.reduce((m,v)=>v.date<m?v.date:m, base[0].date));
  const vpd=sum/span, vps=subs?avg/subs:null;
  const hitRate=base.filter(v=>v.views>=HIT).length/base.length;
  const perWeek=base.length/Math.max(1,span/7);
  const avgDur=base.reduce((a,v)=>a+v.dur,0)/base.length;
  const likeRate=sum?base.reduce((a,v)=>a+v.likes,0)/sum:0;
  const last30=base.filter(v=>days(v.date)<=30);
  const byViews=[...base].sort((a,b)=>b.views-a.views);
  const viralCount=base.filter(v=>v.views>=Math.max(2*median,HIT)).length;

  // tendência: vídeos com 7+ dias, recentes vs anteriores
  const elig=base.filter(v=>days(v.date)>=7).sort((a,b)=>a.date<b.date?1:-1);
  let trend=null;
  if(elig.length>=4){ const k=Math.min(5,Math.floor(elig.length/2)); const r=med(elig.slice(0,k).map(v=>v.views)), o=med(elig.slice(k,k+15).map(v=>v.views)); if(o>0) trend=r/o; }

  const P=viralParts(avg, vpd, median, vps), viral=viralScore(P);
  const comp={
    tracao: .45*P.A+.3*P.D+.25*P.B,
    consist: .6*hitRate+.4*clamp((avg?median/avg:0)/.6)*(hitRate>0?1:.3),
    alcance: P.C,
    momento: trend==null?.5:clamp(.5+Math.log2(trend)/4),
    entrada: .6*clamp(1-Math.log10(Math.max(age,30)/30)/Math.log10(1825/30)) + .4*(subs==null?.5:clamp(1-(Math.log10(subs+1)-3)/3)),
  };
  let nota=10*(.30*comp.tracao+.25*comp.consist+.20*comp.alcance+.15*comp.momento+.10*comp.entrada);
  nota*=.55+.45*clamp((comp.tracao-.4)/.4);   // sem demanda, o resto não salva
  if(onlyShorts) nota*=.5; else if(shortsPct>.5) nota*=.85;
  if(base.length<3) nota*=.9;
  nota=Math.round(nota*10)/10;

  // duração que mais performa
  const buckets=MODO.buckets.map(([a,b,l])=>{ const vs=base.filter(v=>v.dur>=a&&v.dur<b); return {l,n:vs.length,med:med(vs.map(v=>v.views))}; }).filter(x=>x.n);
  const bestDur=buckets.filter(x=>x.n>=2).sort((a,b)=>b.med-a.med)[0]||null;

  // palavras recorrentes nos títulos de maior sucesso
  const topHalf=byViews.slice(0,Math.max(5,Math.ceil(base.length/2))), cnt=new Map();
  topHalf.forEach(v=>new Set(v.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2&&!STOP.has(w)&&!/^\d+$/.test(w))).forEach(w=>cnt.set(w,(cnt.get(w)||0)+1)));
  const words=[...cnt].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,14);

  let mix=null, dominant=null;
  if(FORMATS){ mix={}; Object.keys(FORMATS).forEach(k=>mix[k]=0); base.forEach(v=>mix[fmtOf(v.dur)]++); dominant=Object.entries(mix).sort((a,b)=>b[1]-a[1])[0][0]; }

  // motivos em texto
  const pros=[], cons=[], info=[];
  if(avg>=100000) pros.push(`Média de ${fmt(Math.round(avg))} views por vídeo — demanda alta comprovada.`);
  else if(avg>=HIT*2) pros.push(`Média de ${fmt(Math.round(avg))} views por vídeo — demanda boa.`);
  else if(avg<HIT/2) cons.push(`Média de só ${fmt(Math.round(avg))} views — pouca demanda comprovada.`);
  if(hitRate>=.7) pros.push(`${pct(hitRate)} dos vídeos passam de ${fmt(HIT)} views — o formato funciona de forma consistente, não depende de um viral.`);
  else if(hitRate<.3 && byViews[0] && median && byViews[0].views/median>=8) cons.push(`Depende de poucos virais: o vídeo top tem ${Math.round(byViews[0].views/median)}× a mediana e só ${pct(hitRate)} dos vídeos passam de ${fmt(HIT)} views.`);
  else if(hitRate===0) cons.push(`Nenhum vídeo passou de ${fmt(HIT)} views.`);
  else if(hitRate<.3) cons.push(`Só ${pct(hitRate)} dos vídeos passam de ${fmt(HIT)} views.`);
  if(vps!=null && vps>=3 && avg>=HIT/2) pros.push(`Cada vídeo tem em média ${dec(vps)}× mais views que inscritos — o algoritmo entrega para quem não é inscrito, então um canal novo consegue o mesmo alcance.`);
  else if(vps!=null && vps<.3) cons.push(`Views equivalem a ${pct(vps)} dos inscritos — o alcance depende da base que o canal já tem, difícil de replicar do zero.`);
  if(trend!=null && trend>=1.3) pros.push(`Vídeos recentes com +${Math.round((trend-1)*100)}% de views em relação aos anteriores — nicho/canal aquecendo.`);
  else if(trend!=null && trend<=.7) cons.push(`Vídeos recentes com −${Math.round((1-trend)*100)}% de views em relação aos anteriores — pode estar esfriando.`);
  if(complete && age<=90 && avg>=HIT) pros.push(`Canal com só ${Math.round(age)} dias desde o 1º vídeo — prova que dá para entrar no nicho agora.`);
  else if(age>=3*365) cons.push(`Canal com ${(age/365).toFixed(0)} anos — parte do resultado pode vir da autoridade acumulada.`);
  if(subs!=null && subs>=1e6) cons.push(`${fmt(subs)} inscritos — concorrente grande; module o formato, não tente competir de frente.`);
  if(onlyShorts) cons.push('O canal só tem Shorts — fora do seu foco (as métricas abaixo são dos Shorts).');
  else if(shortsPct>.3) info.push(`${pct(shortsPct)} dos uploads são Shorts (ignorados no cálculo).`);
  if(base.length<5) cons.push(`Só ${base.length} vídeo(s) para analisar — amostra pequena, nota menos confiável.`);
  info.push(`Ritmo: ${dec(perWeek)} vídeos/semana com ~${durTxt(avgDur)} cada — é o volume para competir nesse nicho.`);
  if(bestDur && buckets.length>1) info.push(`Vídeos de ${bestDur.l} são os que mais performam (mediana de ${fmt(Math.round(bestDur.med))} views).`);
  if(!complete) info.push(`Canal com mais de 200 vídeos: analisados os 200 mais recentes; idade estimada pela data de criação.`);

  const verdict = onlyShorts ? ['Só Shorts','v-bad','Canal de Shorts — fora do seu foco. Os números abaixo são dos Shorts.']
                : nota>=7.5?['Modele agora','v-good','Formato validado, com demanda e espaço para canais novos.']
                : nota>=6 ?['Viável','v-good','Vale modelar, mas entre com algum diferencial.']
                : nota>=4.5?['Arriscado','v-mid','Teste com poucos vídeos antes de investir pesado.']
                :           ['Não recomendado','v-bad','Os números não mostram um formato fácil de replicar.'];

  return { id:ch.id, title:ch.snippet.title, handle:ch.snippet.customUrl||'', country:ch.snippet.country||'', thumb:ch.snippet.thumbnails?.medium?.url||ch.snippet.thumbnails?.default?.url||'',
    created:ch.snippet.publishedAt, subs, total, analyzed:all.length, validCount:valid.length, complete, oldest, age, onlyShorts, shortsPct,
    avg, median, vpd, vps, hitRate, perWeek, avgDur, likeRate, last30, viral, viralCount, trend, comp, nota, verdict, pros, cons, info,
    bestDur, words, mix, dominant, top:byViews.slice(0,5), chart:[...base].sort((a,b)=>a.date<b.date?-1:1).slice(-60) };
}

/* ---------- Relatório ---------- */
function repChart(vids, median){
  if(!vids.length) return '';
  const n=vids.length, W=n*10, H=90, mx=Math.log10(Math.max(...vids.map(v=>v.views))+1)||1, hit=Math.max(2*median,HIT);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${vids.map((v,i)=>{
    const h=Math.max(2,H*Math.log10(v.views+1)/mx);
    return `<rect class="${v.views>=hit?'hit':''}" x="${i*10+1}" y="${(H-h).toFixed(1)}" width="8" height="${h.toFixed(1)}" rx="1.5"><title>${esc(v.title)} — ${fmt(v.views)} views · ${durTxt(v.dur)}</title></rect>`;
  }).join('')}</svg>`;
}
function renderReport(r){
  const [vl, vc, vd]=r.verdict, url=`https://www.youtube.com/channel/${r.id}`;
  const dt=d=>new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  const comps=[['Tração','tracao','média, mediana e views/dia'],['Consistência','consist','quantos vídeos performam, não só um viral'],['Alcance','alcance','views por inscrito: o algoritmo entrega fora da base'],['Momento','momento','vídeos recentes vs anteriores'],['Entrada','entrada','canal novo/pequeno = nicho aberto']];
  const trendTxt = r.trend==null ? 'sem dados' : (r.trend>=1?'+':'−')+Math.abs(Math.round((r.trend-1)*100))+'%';
  const li=(arr,cls,i)=>arr.map(t=>`<li class="${cls}" data-i="${i}">${esc(t)}</li>`).join('');
  return `<article class="rep">
    <header class="rep-head">
      <img src="${esc(r.thumb)}" alt="" referrerpolicy="no-referrer">
      <div style="min-width:0">
        <h3><a href="${url}" target="_blank" rel="noopener">${esc(r.title)}</a></h3>
        <div class="meta">${esc(r.handle)}${r.country?' · '+esc(r.country):''} · ${r.complete?`1º vídeo em ${dt(r.oldest)} (${Math.round(r.age)} dias)`:`canal criado em ${dt(r.created)}`} · ${r.total} vídeos no canal${r.dominant?` · <span class="fmt-tag">${FORMATS[r.dominant][0]}</span>`:''}</div>
      </div>
      <a class="btn sm" href="${url}/videos" target="_blank" rel="noopener">Abrir no YouTube</a>
    </header>

    <div class="rep-main">
      <section class="panel verdict ${vc}">
        <div class="tv-k">Nota para modelar</div>
        <div class="nota"><b>${dec(r.nota)}</b><span>/10</span></div>
        <div class="verdict-l">${vl}</div>
        <div class="verdict-d">${vd}</div>
        <div class="comp">${comps.map(([l,k,h])=>`<div class="comp-r" title="${esc(h)}"><span>${l}</span><div class="t"><i style="width:${Math.round(r.comp[k]*100)}%"></i></div><b>${Math.round(r.comp[k]*10)}</b></div>`).join('')}</div>
      </section>
      <section class="panel reasons">
        ${r.pros.length?`<h4>Pontos fortes</h4><ul>${li(r.pros,'pro','+')}</ul>`:''}
        ${r.cons.length?`<h4>Pontos de atenção</h4><ul>${li(r.cons,'con','!')}</ul>`:''}
        <h4>Para modelar</h4><ul>${li(r.info,'info','→')}</ul>
      </section>
    </div>

    <div class="stats">
      <div class="hl"><b>${fmt(Math.round(r.avg))}</b><span>média de views</span></div>
      <div><b>${fmt(Math.round(r.median))}</b><span>mediana</span></div>
      <div><b>${r.subs==null?'oculto':fmt(r.subs)}</b><span>inscritos</span></div>
      <div><b>${fmt(Math.round(r.vpd))}</b><span>views / dia</span></div>
      <div><b>${r.vps==null?'—':dec(r.vps, r.vps<1?2:1)+'×'}</b><span>views / inscrito</span></div>
      <div><b>${r.onlyShorts?r.analyzed:r.validCount}${r.analyzed>r.validCount&&!r.onlyShorts?`<small style="color:var(--dim);font-size:11px">/${r.analyzed}</small>`:''}</b><span>vídeos analisados${r.onlyShorts?' (Shorts)':' (sem Shorts)'}</span></div>
      <div><b>${pct(r.hitRate)}</b><span>passam de ${fmt(HIT)} views</span></div>
      <div><b>${trendTxt}</b><span>tendência recente</span></div>
      <div><b>${dec(r.likeRate*100)}%</b><span>likes / views</span></div>
      <div><b>${r.viral}</b><span>Viral Score</span></div>
    </div>

    <section class="panel">
      <div class="spark-l"><span>Views dos últimos ${r.chart.length} vídeos (ordem de postagem) · destaque = acima de 2× a mediana</span><span>${r.viralCount} virais</span></div>
      <div class="rep-chart">${repChart(r.chart, r.median)}</div>
    </section>

    <div class="rep-cols">
      <section class="panel tops">
        <h4 class="h4">Vídeos que mais performaram</h4>
        ${r.top.map(v=>`<a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
          <div class="thumb"><img src="${esc(v.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><em>${hms(v.dur)}</em></div>
          <div><div class="tv-t">${esc(v.title)}</div><div class="tv-s">${fmt(v.views)} views · ${Math.round(days(v.date))}d atrás${r.median?` · ${dec(v.views/r.median)}× a mediana`:''}</div></div></a>`).join('')}
      </section>
      <section class="panel facts">
        <h4 class="h4">Raio-x do formato</h4>
        <div class="fact"><span>Duração média</span><b>${durTxt(r.avgDur)}</b></div>
        ${r.bestDur?`<div class="fact"><span>Duração que mais performa</span><b>${r.bestDur.l} <small>(${r.bestDur.n} vídeos)</small></b></div>`:''}
        <div class="fact"><span>Ritmo de postagem</span><b>${dec(r.perWeek)} / semana</b></div>
        <div class="fact"><span>Últimos 30 dias</span><b>${r.last30.length} vídeos${r.last30.length?` · mediana ${fmt(Math.round(med(r.last30.map(v=>v.views))))}`:''}</b></div>
        <div class="fact"><span>Shorts no canal</span><b>${pct(r.shortsPct)}</b></div>
        ${r.mix?`<div class="fact"><span>Formato</span><div style="flex:1">${mixBar(r.mix, r.onlyShorts?r.analyzed:r.validCount)}</div></div>`:''}
        ${r.words.length?`<div class="fact col"><span>Palavras que se repetem nos títulos de maior sucesso</span><div class="words">${r.words.map(([w,n])=>`<span>${esc(w)}<em>${n}</em></span>`).join('')}</div></div>`:''}
        <div class="cost">Análise custou ${r.cost||0} unidades de cota.</div>
      </section>
    </div>
  </article>`;
}

/* ---------- Histórico ---------- */
function saveAnHist(r){
  const h=[{id:r.id,title:r.title,thumb:r.thumb,nota:r.nota}, ...loadJSON(LS.anHist, []).filter(x=>x.id!==r.id)].slice(0,10);
  localStorage.setItem(LS.anHist, JSON.stringify(h)); renderAnHist();
}
function renderAnHist(){
  const h=loadJSON(LS.anHist, []);
  $('#anRecent').innerHTML = h.length ? `<span class="an-recent-l">Recentes:</span>`+h.map(x=>`<button type="button" data-id="${esc(x.id)}"><img src="${esc(x.thumb)}" alt="" referrerpolicy="no-referrer">${esc(x.title)} <b>${dec(+x.nota)}</b></button>`).join('') : '';
}

function analyzeById(id){ switchTab('an'); $('#anInput').value='https://www.youtube.com/channel/'+id; analyzeChannel(id); }
$('#anRecent').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b) analyzeById(b.dataset.id); });
$('#anForm').addEventListener('submit', e=>{ e.preventDefault(); analyzeChannel($('#anInput').value); });
$('#grid').addEventListener('click', e=>{ const id=e.target.closest('[data-an]')?.dataset.an; if(id) analyzeById(id); });
