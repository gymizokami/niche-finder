/* =====================================================================
   MODO: CANAIS DARK
   Tudo que é específico da ferramenta de canais dark fica aqui.
   O resto (API, mineração, análise, visual) está em /shared e vale
   para todas as ferramentas.
   ===================================================================== */
window.NF_MODO = {
  id: 'dark',
  nome: 'Canais Dark',
  noun: 'canais',                       // "12 canais minerados"
  goLabel: 'Minerar canais',
  filePrefix: 'nichos',                 // nome dos arquivos exportados

  // Chaves do localStorage (a chave da API é compartilhada entre os modos)
  ls: { key:'nf_key', cfg:'nf_cfg', res:'nf_results', seen:'nf_seen', anHist:'nf_an_hist' },

  // Vídeo com até 3 min = Short. Em canal dark não existe vídeo "normal" tão curto.
  isShort: v => v.dur <= 180,

  hit: 10000,          // views para um vídeo contar como "hit"
  maxVidsCap: 50,      // máx. de vídeos lidos por canal na mineração
  uploadPages: 1,      // páginas de 50 uploads lidas por canal na mineração

  // Faixas de duração do "Raio-x do formato" na aba Analisar canal
  buckets: [[0,480,'até 8 min'],[480,900,'8–15 min'],[900,1800,'15–30 min'],[1800,3600,'30–60 min'],[3600,1e9,'1 h ou mais']],

  // Sugestões de palavras-chave (chips abaixo do campo de nichos)
  presets: {
    pt: ['histórias reais','mistérios não resolvidos','curiosidades sobre','história antiga','mitologia grega','relatos de terror','casos criminais','estoicismo','histórias bíblicas','psicologia sombria','civilizações perdidas','documentário','fatos sobre o universo','histórias de reis','segunda guerra mundial','biografia'],
    en: ['history documentary','unsolved mysteries','true crime story','stoicism','bible stories','dark psychology','ancient civilizations','sleep stories','horror stories','space documentary','reddit stories','biography','cold war','ancient rome','philosophy explained','lost civilizations'],
    es: ['historias reales','misterios sin resolver','documental historia','mitología griega','relatos de terror','casos criminales','estoicismo','historias bíblicas','psicología oscura','civilizaciones antiguas','curiosidades del universo','biografía']
  },

  formats: null        // modo dark não classifica formato (faixa/mix/horas)
};
