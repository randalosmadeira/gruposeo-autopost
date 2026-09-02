(() => {
  const config = window.ZicaElectoralOptin || {};
  if (!config.enabled || !config.apiUrl) return;

  const disableAt = config.disableAfter ? Date.parse(config.disableAfter) : NaN;
  if (Number.isFinite(disableAt) && Date.now() >= disableAt) return;

  const portalKey = config.portalId || window.location.hostname.replace(/\W+/g, '-');
  const successKey = `zica-optin:${portalKey}:success-until`;
  const dismissKey = `zica-optin:${portalKey}:dismiss-until`;
  const scrollSeenKey = `zica-optin:${portalKey}:scroll-seen`;
  const exitSeenKey = `zica-optin:${portalKey}:exit-seen`;
  const closeCountKey = `zica-optin:${portalKey}:close-count`;

  const now = Date.now();
  const successUntil = Number(localStorage.getItem(successKey) || 0);
  const dismissUntil = Number(localStorage.getItem(dismissKey) || 0);
  if (successUntil > now || dismissUntil > now) return;

  const push = (event, payload = {}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, zica_portal_id: portalKey, ...payload });
  };

  const root = document.createElement('div');
  root.className = 'zica-optin-root';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="zica-optin-backdrop" data-zica-close></div>
    <section class="zica-optin-dialog" role="dialog" aria-modal="true" aria-labelledby="zica-optin-title">
      <button type="button" class="zica-optin-close" aria-label="Fechar" data-zica-close>×</button>
      <div class="zica-optin-header">
        <h2 id="zica-optin-title"></h2>
        <p class="zica-optin-subtitle"></p>
      </div>
      <form class="zica-optin-form" novalidate>
        <label class="zica-optin-field"><span class="zica-optin-icon" aria-hidden="true">♙</span><input name="fullName" autocomplete="name" placeholder="Seu nome completo" maxlength="120" required /></label>
        <label class="zica-optin-field"><span class="zica-optin-icon" aria-hidden="true">✉</span><input name="email" type="email" autocomplete="email" placeholder="seu@email.com" maxlength="180" /></label>
        <label class="zica-optin-field"><span class="zica-optin-icon" aria-hidden="true">◉</span><input name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" maxlength="24" /></label>
        <div class="zica-optin-location-row">
          <label class="zica-optin-field"><span class="zica-optin-icon" aria-hidden="true">⌖</span><input name="city" autocomplete="address-level2" placeholder="Cidade" maxlength="100" /></label>
          <label class="zica-optin-field zica-optin-state-field"><select name="state" autocomplete="address-level1" aria-label="UF"><option value="">UF</option><option>AC</option><option>AL</option><option>AP</option><option>AM</option><option>BA</option><option>CE</option><option>DF</option><option>ES</option><option>GO</option><option>MA</option><option>MT</option><option>MS</option><option>MG</option><option>PA</option><option>PB</option><option>PR</option><option>PE</option><option>PI</option><option>RJ</option><option>RN</option><option>RS</option><option>RO</option><option>RR</option><option>SC</option><option selected>SP</option><option>SE</option><option>TO</option></select></label>
        </div>
        <input name="website" class="zica-optin-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <div class="zica-optin-choices">
          <label><input type="checkbox" name="emailUpdates" /> <span>Receber novidades por email</span></label>
          <label><input type="checkbox" name="whatsappUpdates" /> <span>Receber novidades por WhatsApp</span></label>
          <label><input type="checkbox" name="volunteer" /> <span>Quero ser voluntário</span></label>
          <label class="zica-optin-required-consent"><input type="checkbox" name="consentContact" required /> <span>Autorizo o uso dos dados informados para retorno sobre este cadastro e organização da participação na campanha.</span></label>
        </div>
        <p class="zica-optin-privacy-note">O cadastro não é vinculado ao seu histórico individual de navegação e não é usado para personalização política individual.</p>
        <p class="zica-optin-error" role="alert" aria-live="polite"></p>
        <button type="submit" class="zica-optin-submit"></button>
      </form>
      <div class="zica-optin-instagram-wrap" hidden><span class="zica-optin-instagram-eyebrow">Acompanhe também</span><a class="zica-optin-instagram" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false"><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm10.5 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg><span></span></a></div>
      <div class="zica-optin-success" hidden><strong>Cadastro concluído.</strong><p>As preferências de contato informadas foram registradas.</p></div>
    </section>`;
  document.body.appendChild(root);

  root.querySelector('#zica-optin-title').textContent = config.title || 'Quero ajudar na campanha';
  root.querySelector('.zica-optin-subtitle').textContent = config.subtitle || 'Deixe seu contato e diga como quer ajudar.';
  root.querySelector('.zica-optin-submit').textContent = config.buttonLabel || '🪵 MADEIRAAA NELESS';

  const privacyNote = root.querySelector('.zica-optin-privacy-note');
  if (config.privacyUrl) { const link = document.createElement('a'); link.href = config.privacyUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = ' Política de privacidade.'; privacyNote.appendChild(link); }

  const form = root.querySelector('.zica-optin-form');
  const errorBox = root.querySelector('.zica-optin-error');
  const submitButton = root.querySelector('.zica-optin-submit');
  const successBox = root.querySelector('.zica-optin-success');
  let currentReason = '';
  let submitting = false;

  const instagramWrap = root.querySelector('.zica-optin-instagram-wrap');
  const instagramLink = root.querySelector('.zica-optin-instagram');
  if (config.instagramEnabled && config.instagramUrl) {
    instagramWrap.hidden = false;
    instagramLink.href = config.instagramUrl;
    instagramLink.querySelector('span').textContent = config.instagramLabel || 'Seguir @rdmadvogados no Instagram';
    instagramLink.addEventListener('click', () => push('zica_optin_instagram_click', { zica_trigger: currentReason || 'direct' }));
  }

  const setOpen = (open) => { root.classList.toggle('is-open', open); root.setAttribute('aria-hidden', open ? 'false' : 'true'); document.documentElement.classList.toggle('zica-optin-lock', open); if (open) window.setTimeout(() => root.querySelector('input[name="fullName"]')?.focus(), 80); };
  const openModal = (reason) => { if (root.classList.contains('is-open') || submitting || successBox.hidden === false) return; if (reason === 'scroll' && sessionStorage.getItem(scrollSeenKey)) return; if (reason === 'exit' && sessionStorage.getItem(exitSeenKey)) return; if (reason === 'scroll') sessionStorage.setItem(scrollSeenKey, '1'); if (reason === 'exit') sessionStorage.setItem(exitSeenKey, '1'); currentReason = reason; setOpen(true); push('zica_optin_popup_impression', { zica_trigger: reason }); };
  const closeModal = () => { if (!root.classList.contains('is-open')) return; setOpen(false); const closeCount = Number(sessionStorage.getItem(closeCountKey) || 0) + 1; sessionStorage.setItem(closeCountKey, String(closeCount)); if (closeCount >= 2 || currentReason === 'exit') { const hours = Math.max(1, Number(config.dismissHours || 24)); localStorage.setItem(dismissKey, String(Date.now() + hours * 60 * 60 * 1000)); } push('zica_optin_popup_close', { zica_trigger: currentReason || 'unknown' }); };

  root.querySelectorAll('[data-zica-close]').forEach((element) => element.addEventListener('click', closeModal));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

  const formatPhone = (value) => { const digits = value.replace(/\D/g, '').slice(0, 11); if (digits.length <= 2) return digits; if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`; return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`; };
  form.elements.whatsapp.addEventListener('input', (event) => { event.target.value = formatPhone(event.target.value); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (submitting) return; errorBox.textContent = '';
    const data = new FormData(form);
    const fullName = String(data.get('fullName') || '').trim(); const email = String(data.get('email') || '').trim(); const whatsapp = String(data.get('whatsapp') || '').trim();
    const emailUpdates = data.get('emailUpdates') === 'on'; const whatsappUpdates = data.get('whatsappUpdates') === 'on'; const volunteer = data.get('volunteer') === 'on'; const consentContact = data.get('consentContact') === 'on';
    if (fullName.length < 2) return void (errorBox.textContent = 'Informe seu nome completo.');
    if (!email && !whatsapp) return void (errorBox.textContent = 'Informe pelo menos email ou WhatsApp.');
    if (!emailUpdates && !whatsappUpdates && !volunteer) return void (errorBox.textContent = 'Selecione como deseja participar ou receber contato.');
    if (!consentContact) return void (errorBox.textContent = 'Confirme a autorização para registrar o cadastro.');
    if (emailUpdates && !email) return void (errorBox.textContent = 'Informe o email para receber novidades por email.');
    if (whatsappUpdates && !whatsapp) return void (errorBox.textContent = 'Informe o WhatsApp para receber novidades por WhatsApp.');
    submitting = true; submitButton.disabled = true; submitButton.textContent = 'Enviando...';
    try {
      const response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, email, whatsapp, city: String(data.get('city') || '').trim(), state: String(data.get('state') || '').trim(), emailUpdates, whatsappUpdates, volunteer, consentContact, website: String(data.get('website') || ''), sourcePortal: config.sourcePortal || window.location.hostname }) });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'registration_failed');
      form.hidden = true; successBox.hidden = false; const days = Math.max(1, Number(config.successSuppressDays || 90)); localStorage.setItem(successKey, String(Date.now() + days * 24 * 60 * 60 * 1000)); localStorage.removeItem(dismissKey); push('zica_optin_submit_success', { zica_trigger: currentReason || 'direct' }); window.setTimeout(() => setOpen(false), 1800);
    } catch { errorBox.textContent = 'Não foi possível concluir o cadastro agora. Tente novamente.'; push('zica_optin_submit_error', { zica_trigger: currentReason || 'direct' }); }
    finally { submitting = false; submitButton.disabled = false; submitButton.textContent = config.buttonLabel || '🪵 MADEIRAAA NELESS'; }
  });

  const threshold = Math.max(1, Math.min(90, Number(config.scrollTriggerPercent || 10)));
  const onScroll = () => { const doc = document.documentElement; const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight); const depth = Math.min(100, (window.scrollY / scrollable) * 100); if (window.scrollY >= 120 && depth >= threshold) { window.removeEventListener('scroll', onScroll); openModal('scroll'); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  const startedAt = Date.now();
  if (config.exitIntentEnabled && window.matchMedia('(pointer:fine)').matches) document.addEventListener('mouseout', (event) => { if (Date.now() - startedAt < 8000) return; if (event.relatedTarget || event.toElement) return; if (event.clientY > 0) return; openModal('exit'); });
})();
