/* =====================================================================
   API FALSA para testar a ferramenta sem gastar cota.
   Só é ativada quando a URL tem ?teste  (ex.: dark.html?teste)
   Substitui window.fetch apenas para chamadas a googleapis.com.

   Canais simulados (servem para os dois modos):
     @historiasocultas  canal dark novo, bombando          → deve passar
     @megadoc           canal gigante e antigo (300 vídeos) → reprovado (antigo / muitos inscritos)
     @cortes            só Shorts verticais                 → reprovado (Shorts)
     @lofi1             música nova, faixas + vídeos de 1h  → passa no modo música
     @lofi2             música nova, fraca                  → média baixa
   ===================================================================== */
(() => {
  if(!new URLSearchParams(location.search).has('teste')) return;

  const now = Date.now(), ago = n => new Date(now - n*864e5).toISOString();
  const pad = s => ('UC' + s + 'xxxxxxxxxxxxxxxxxxxxxx').slice(0, 24);
  const avatar = (txt, cor) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="${cor}"/><text x="44" y="56" font-family="Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${txt}</text></svg>`);
  const thumb = (txt, cor) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${cor}"/><text x="160" y="100" font-family="Arial" font-size="22" fill="rgba(255,255,255,.8)" text-anchor="middle">${txt}</text></svg>`);
  // n vídeos distribuídos entre "primeiro" dias atrás e hoje
  const mk = (n, primeiro, f) => Array.from({length:n}, (_, i) => f(i, primeiro - i*(primeiro/n)));

  const TITULOS_DARK = ['O segredo proibido do Egito antigo','A história que ninguém te contou sobre Roma','O mistério da cidade perdida','O rei mais cruel da história','O segredo do império esquecido','A verdade sobre os templários'];
  const CH = {
    [pad('Novo')]:  { title:'Histórias Ocultas', handle:'@historiasocultas', subs:4200, created:ago(900), cor:'#7a3b2e',
      vids: mk(20, 40, (i,a)=>({ dur:1500+i*20, vert:false, views:Math.round(30000+i*9000+(i%4===0?150000:0)), date:ago(a), t:TITULOS_DARK[i%6] })) },
    [pad('Velho')]: { title:'Mega Documentários', handle:'@megadoc', subs:2000000, created:ago(2400), cor:'#2e4a7a',
      vids: mk(300, 2200, (i,a)=>({ dur:2400, vert:false, views:Math.round(200000-i*600), date:ago(a), t:'Documentário completo parte '+i })) },
    [pad('Short')]: { title:'Cortes Rápidos', handle:'@cortes', subs:10000, created:ago(100), cor:'#6a2e7a',
      vids: mk(15, 50, (i,a)=>({ dur:40, vert:true, views:90000, date:ago(a), t:'Corte #'+i })) },
    [pad('Mus1')]:  { title:'Lofi Coffee', handle:'@lofi1', subs:800, created:ago(50), cor:'#1f6b58',
      vids: mk(10, 45, (i,a)=>({ dur:i%2?160:3700, vert:false, views:20000+i*4000, date:ago(a), t:i%2?'lofi coffee beats to study':'1 hour lofi coffee mix to relax' })) },
    [pad('Mus2')]:  { title:'Lofi Coffee Brasil', handle:'@lofi2', subs:300, created:ago(50), cor:'#55611f',
      vids: mk(3, 20, (i,a)=>({ dur:3600, vert:false, views:1500, date:ago(a), t:'lofi para estudar 1 hora' })) },
  };
  const VID = {};
  for(const [c, o] of Object.entries(CH)){
    o.ids = o.vids.map((v, i) => { const id = (c.slice(2,6)+'v'+i+'xxxxxxx').slice(0,11); VID[id] = { ...v, c }; return id; }).reverse(); // uploads: mais novo primeiro
  }
  const iso = s => 'PT'+Math.floor(s/3600)+'H'+Math.floor(s%3600/60)+'M'+(s%60)+'S';
  const chObj = c => ({ id:c,
    snippet:{ title:CH[c].title, customUrl:CH[c].handle, country:'BR', publishedAt:CH[c].created, description:'Canal simulado para testes',
      thumbnails:{ default:{url:avatar(CH[c].title[0], CH[c].cor)}, medium:{url:avatar(CH[c].title[0], CH[c].cor)} } },
    statistics:{ subscriberCount:String(CH[c].subs), videoCount:String(CH[c].ids.length) },
    contentDetails:{ relatedPlaylists:{ uploads:'UU'+c.slice(2) } } });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    if(!u.hostname.endsWith('googleapis.com')) return realFetch(input, init);
    await new Promise(r => setTimeout(r, 60));
    const ep = u.pathname.split('/').pop(), P = Object.fromEntries(u.searchParams);
    let body = { items: [] };
    if(ep === 'search' && P.type === 'channel'){
      body.items = Object.keys(CH).filter(c => CH[c].title.toLowerCase().includes(P.q.toLowerCase()))
        .map(c => ({ id:{channelId:c}, snippet:{ title:CH[c].title, description:'Canal simulado', thumbnails:{default:{url:avatar(CH[c].title[0], CH[c].cor)}} } }));
    } else if(ep === 'search'){
      // devolve vídeos de todos os canais, respeitando o filtro de duração da busca
      const ok = d => P.videoDuration==='short' ? d<240 : P.videoDuration==='medium' ? d>=240&&d<=1200 : P.videoDuration==='long' ? d>1200 : true;
      body.items = Object.keys(CH).flatMap(c => CH[c].ids.filter(id => ok(VID[id].dur)).slice(0, 8))
        .map(id => ({ snippet:{ channelId:VID[id].c } }));
    } else if(ep === 'channels'){
      if(P.forHandle){ const c = Object.keys(CH).find(c => CH[c].handle.toLowerCase() === P.forHandle.toLowerCase()); body.items = c ? [{id:c}] : []; }
      else if(P.forUsername) body.items = [];
      else body.items = P.id.split(',').filter(c => CH[c]).map(chObj);
    } else if(ep === 'playlistItems'){
      const c = 'UC'+P.playlistId.slice(2), start = +(P.pageToken||0), ids = CH[c].ids.slice(start, start+50);
      body = { items: ids.map(id => ({ contentDetails:{ videoId:id, videoPublishedAt:VID[id].date } })),
               nextPageToken: CH[c].ids.length > start+50 ? String(start+50) : undefined };
    } else if(ep === 'videos'){
      body.items = P.id.split(',').filter(id => VID[id]).map(id => { const v = VID[id]; return {
        id, snippet:{ channelId:v.c, title:v.t+' #'+id.slice(5,8), publishedAt:v.date, liveBroadcastContent:'none', categoryId:'10',
          thumbnails:{ medium:{url:thumb(v.t.slice(0,22), CH[v.c].cor)} } },
        statistics:{ viewCount:String(v.views), likeCount:String(Math.round(v.views*0.04)), commentCount:String(Math.round(v.views*0.002)) },
        contentDetails:{ duration:iso(v.dur) },
        player:{ embedWidth: v.vert ? '405' : '1280', embedHeight:'720' } }; });
    }
    return new Response(JSON.stringify(body), { status:200, headers:{'Content-Type':'application/json'} });
  };
})();
