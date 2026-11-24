/* =====================================================================
   MODO: MÚSICA
   Tudo que é específico da ferramenta de música fica aqui.
   O resto (API, mineração, análise, visual) está em /shared.
   ===================================================================== */
window.NF_MODO = {
  id: 'musica',
  nome: 'Música',
  noun: 'canais de música',
  goLabel: 'Minerar canais de música',
  filePrefix: 'nichos-musica',

  ls: { key:'nf_key', cfg:'nfm_cfg', res:'nfm_results', seen:'nfm_seen', anHist:'nfm_an_hist' },

  // Música tem faixas normais de 2–3 min, então Short = vídeo VERTICAL (ou quadrado) até 3 min.
  // Se a API não informar a proporção, cai para a regra de duração (até 60 s).
  isShort: v => (v.w && v.h) ? (v.dur <= 180 && v.h >= v.w * 0.95) : v.dur <= 60,

  hit: 5000,
  maxVidsCap: 100,     // canais de música postam muito
  uploadPages: 2,

  buckets: [[0,300,'até 5 min'],[300,1200,'5–20 min'],[1200,3600,'20–60 min'],[3600,10800,'1–3 h'],[10800,1e9,'3 h ou mais']],

  presets: {
    pt: ['música para dormir','música relaxante','lofi para estudar','piano relaxante','som de chuva para dormir','música para meditação','jazz para relaxar','bossa nova','música gospel instrumental','música para foco','música medieval','música épica','frequência 432hz','música celta','sertanejo acústico','pagode antigo'],
    en: ['lofi hip hop','sleep music','relaxing piano','ambient music','dark ambient','phonk','slowed reverb','jazz cafe','study music','meditation music','synthwave','epic music','medieval music','rain sounds','ai music','80s music'],
    es: ['música para dormir','música relajante','lofi para estudiar','piano relajante','música para meditar','jazz relajante','música épica','sonidos de lluvia','música celta','baladas románticas']
  },

  // Formato musical: [rótulo, cor]
  formats: { track:['Faixas','var(--f1)'], mix:['Mixes','var(--f2)'], long:['Horas','var(--f3)'] },
  fmtOf: dur => dur < 600 ? 'track' : dur < 3600 ? 'mix' : 'long'
};
