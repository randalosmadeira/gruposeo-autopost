// Respostas de exemplo das APIs do Google (PageSpeed Insights e CrUX) usadas nos testes da velocidade.
export const PSI = {
  lighthouseResult: {
    lighthouseVersion: '13.6.0', fetchTime: '2026-11-19T04:11:47.823Z', finalDisplayedUrl: 'https://exemplo.com.br/',
    categories: { performance: { score: 0.92 } },
    audits: {
      'largest-contentful-paint': { numericValue: 2683.4 }, 'cumulative-layout-shift': { numericValue: 0.04612 }, 'total-blocking-time': { numericValue: 20 },
      'first-contentful-paint': { numericValue: 1512.9 }, 'server-response-time': { numericValue: 50.2 }, 'speed-index': { numericValue: 4981 },
    },
  },
};
export const CRUX = {
  record: {
    key: { url: 'https://exemplo.com.br/' },
    metrics: {
      largest_contentful_paint: { percentiles: { p75: 2300 } }, cumulative_layout_shift: { percentiles: { p75: '0.05' } },
      interaction_to_next_paint: { percentiles: { p75: 180 } }, first_contentful_paint: { percentiles: { p75: 1700 } }, experimental_time_to_first_byte: { percentiles: { p75: 620 } },
    },
    collectionPeriod: { firstDate: { year: 2026, month: 10, day: 20 }, lastDate: { year: 2026, month: 11, day: 16 } },
  },
};

