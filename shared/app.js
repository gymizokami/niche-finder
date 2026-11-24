/* =====================================================================
   Niche Finder — inicialização (abas + carregar dados salvos)
   Último script da página.
   ===================================================================== */
function switchTab(t){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===t));
  $('#view-mine').hidden = t!=='mine'; $('#view-an').hidden = t!=='an';
  if(t==='an') setTimeout(()=>$('#anInput').focus(), 0);
  history.replaceState(null, '', t==='an' ? '#analisar' : location.pathname+location.search);
}
document.querySelector('.tabs').addEventListener('click', e=>{ const t=e.target.closest('button')?.dataset.tab; if(t) switchTab(t); });

loadCfg(); renderChips('pt'); estimate();
const saved = loadJSON(LS.res, null);
if(saved?.results){
  // compatibilidade com resultados salvos pela versão antiga (arquivo único)
  results = saved.results.map(r => ({ ...r, validCount: r.validCount ?? r.longCount }));
  funnel = saved.funnel;
}
render(); renderAnHist();
if(location.hash === '#analisar') switchTab('an');

if(TESTE){
  document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="test-banner">MODO TESTE — API simulada, nenhuma cota é gasta. Tire o <b>?teste</b> da URL para usar de verdade.</div>');
  if(!$('#key').value) $('#key').value = 'TESTE';
}
