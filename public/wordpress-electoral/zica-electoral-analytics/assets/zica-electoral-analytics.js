(() => {
  const config = window.ZicaElectoralAnalytics || {};
  if (!config.enabled) return;

  const disableAt = config.disableAfter ? Date.parse(config.disableAfter) : NaN;
  if (Number.isFinite(disableAt) && Date.now() >= disableAt) return;

  window.dataLayer = window.dataLayer || [];
  const push = (event, payload = {}) => {
    window.dataLayer.push({
      event,
      zica_portal_id: config.portalId || '',
      zica_post_id: config.page?.postId || 0,
      zica_post_type: config.page?.postType || '',
      zica_canonical_url: config.page?.canonicalUrl || window.location.href,
      ...payload,
    });
  };

  const cookieConsent = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('zica_analytics_consent='));

  if (cookieConsent?.endsWith('granted') && typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  const search = new URLSearchParams(window.location.search);
  const referrerHost = (() => {
    try { return document.referrer ? new URL(document.referrer).hostname : ''; }
    catch { return ''; }
  })();

  push('zica_page_context', {
    zica_referrer_host: referrerHost,
    zica_utm_source: search.get('utm_source') || '',
    zica_utm_medium: search.get('utm_medium') || '',
    zica_utm_campaign: search.get('utm_campaign') || '',
    zica_utm_content: search.get('utm_content') || '',
  });

  window.setTimeout(() => push('zica_engaged_30s'), 30000);

  const firedScroll = new Set();
  const thresholds = [25, 50, 75, 90];
  const onScroll = () => {
    const doc = document.documentElement;
    const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
    const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    thresholds.forEach((threshold) => {
      if (depth >= threshold && !firedScroll.has(threshold)) {
        firedScroll.add(threshold);
        push('zica_scroll_depth', { zica_scroll_percent: threshold });
      }
    });
    if (firedScroll.size === thresholds.length) window.removeEventListener('scroll', onScroll);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  const normalizeHost = (url) => url.hostname.replace(/^www\./, '').toLowerCase();
  const primaryHosts = new Set((config.primaryPortals || []).map((value) => {
    try { return normalizeHost(new URL(value)); }
    catch { return ''; }
  }).filter(Boolean));

  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;

    let url;
    try { url = new URL(anchor.href, window.location.href); }
    catch { return; }
    if (!['http:', 'https:'].includes(url.protocol)) return;

    const currentHost = normalizeHost(new URL(window.location.href));
    const targetHost = normalizeHost(url);
    const internal = targetHost === currentHost;
    const portalCrosslink = !internal && primaryHosts.has(targetHost);

    push(
      portalCrosslink ? 'zica_portal_crosslink_click' : internal ? 'zica_internal_link_click' : 'zica_outbound_link_click',
      {
        zica_target_host: targetHost,
        zica_target_path: url.pathname,
        zica_link_text: (anchor.textContent || '').trim().slice(0, 120),
      },
    );
  }, { capture: true });

  window.addEventListener('zica:analytics-consent', (event) => {
    const granted = Boolean(event?.detail?.granted);
    document.cookie = `zica_analytics_consent=${granted ? 'granted' : 'denied'}; path=/; SameSite=Lax`;
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    }
    push('zica_consent_update', { zica_analytics_consent: granted ? 'granted' : 'denied' });
  });
})();
