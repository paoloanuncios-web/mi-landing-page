(() => {
  'use strict';

  // ---------- Origen del tráfico (UTM, gclid, fbclid) ----------
  const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* modo privado */ } },
  };
  const params = new URLSearchParams(location.search);
  if (ATTR_KEYS.some((k) => params.get(k))) {
    ATTR_KEYS.forEach((k) => store.set('pao_' + k, params.get(k) || ''));
  }
  if (!store.get('pao_landing_url')) {
    store.set('pao_landing_url', location.href);
    store.set('pao_referrer', document.referrer || '');
  }
  const attribution = () => {
    const out = { landing_url: store.get('pao_landing_url'), referrer: store.get('pao_referrer') };
    ATTR_KEYS.forEach((k) => { out[k] = store.get('pao_' + k) || params.get(k) || ''; });
    return out;
  };

  // ---------- Píxeles (se activan solo si cargaste los IDs en index.html) ----------
  const T = window.PAO_TRACKING || {};
  if (T.metaPixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', T.metaPixelId);
    window.fbq('track', 'PageView');
  }
  const gtagId = T.ga4Id || T.googleAdsId;
  if (gtagId) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gtagId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    if (T.ga4Id) window.gtag('config', T.ga4Id);
    if (T.googleAdsId) window.gtag('config', T.googleAdsId);
  }
  const track = (event, data) => {
    try {
      if (window.fbq) window.fbq('track', event === 'lead' ? 'Lead' : 'Contact', data);
      if (window.gtag) {
        window.gtag('event', event === 'lead' ? 'generate_lead' : 'open_lead_form', data);
        if (event === 'lead' && T.googleAdsId && T.googleAdsLeadLabel) {
          window.gtag('event', 'conversion', { send_to: T.googleAdsId + '/' + T.googleAdsLeadLabel });
        }
      }
    } catch { /* la medición nunca debe romper el formulario */ }
  };

  // ---------- Envío de leads ----------
  const isTouch = matchMedia('(pointer: coarse)').matches;

  async function sendLead(form, source) {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.assign(data, attribution(), { source });
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({ ok: false, error: 'No pudimos enviar tus datos. Probá de nuevo.' }));
    if (!res.ok || !out.ok) throw new Error(out.error || 'No pudimos enviar tus datos. Probá de nuevo.');
    track('lead', { source });
    return out;
  }

  function openWhatsApp(url) {
    if (isTouch) {
      location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  function validate(scope) {
    let firstBad = null;
    const seenRadios = new Set();
    scope.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.closest('.hp')) return;
      el.classList.remove('is-invalid');
      if (el.type === 'radio') {
        if (seenRadios.has(el.name) || !el.required) return;
        seenRadios.add(el.name);
        if (!scope.querySelector(`input[name="${el.name}"]:checked`) && !firstBad) firstBad = el;
        return;
      }
      let ok = el.checkValidity();
      if (el.name === 'whatsapp') {
        const digits = el.value.replace(/\D/g, '');
        ok = digits.length >= 8 && digits.length <= 15;
      }
      if (!ok) {
        el.classList.add('is-invalid');
        if (!firstBad) firstBad = el;
      }
    });
    return firstBad;
  }

  const messages = {
    name: 'Ingresá tu nombre.',
    whatsapp: 'Ingresá un WhatsApp válido, con código de área.',
    email: 'Ingresá un email válido.',
    business: 'Contanos tu negocio o rubro.',
    goal: 'Elegí qué querés lograr.',
    timeline: 'Elegí cómo estás con esto hoy.',
    ad_budget: 'Elegí un rango de inversión.',
  };
  const errorFor = (el) => messages[el.name] || 'Completá los campos marcados.';

  // ---------- Popup de calificación ----------
  const modal = document.getElementById('lead-modal');
  const mform = document.getElementById('modal-form');
  const steps = [...mform.querySelectorAll('.step[data-step]')].filter((s) => s.dataset.step !== 'done');
  const doneStep = mform.querySelector('[data-step="done"]');
  const bar = mform.querySelector('.progress span');
  const stepN = mform.querySelector('.step-n');
  const btnPrev = mform.querySelector('[data-prev]');
  const btnNext = mform.querySelector('[data-next]');
  const btnSubmit = mform.querySelector('[data-submit]');
  const merr = mform.querySelector('.form-error');
  const waLink = document.getElementById('wa-link');
  let current = 0;
  let openedFrom = 'popup';

  function showStep(i) {
    current = i;
    steps.forEach((s, idx) => s.classList.toggle('is-active', idx === i));
    doneStep.classList.remove('is-active');
    bar.style.width = ((i + 1) / steps.length) * 100 + '%';
    stepN.textContent = i + 1;
    btnPrev.style.visibility = i === 0 ? 'hidden' : 'visible';
    btnNext.hidden = i === steps.length - 1;
    btnSubmit.hidden = i !== steps.length - 1;
    mform.querySelector('.modal__nav').hidden = false;
    mform.querySelector('.modal__step').hidden = false;
    merr.textContent = '';
  }

  function openModal(from) {
    openedFrom = from || 'popup';
    if (!doneStep.classList.contains('is-active')) showStep(0);
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    track('open', { source: openedFrom });
  }
  function closeModal() {
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }

  document.querySelectorAll('[data-open-lead]').forEach((b) =>
    b.addEventListener('click', () => openModal(b.dataset.openLead)));
  mform.querySelector('[data-close]').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Avanza solo al elegir la última opción del paso
  mform.addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    const step = steps[current];
    const radios = new Set([...step.querySelectorAll('input[type=radio]')].map((r) => r.name));
    const allAnswered = [...radios].every((n) => step.querySelector(`input[name="${n}"]:checked`));
    const textsFilled = [...step.querySelectorAll('input:not([type=radio])')].every((i) => i.closest('.hp') || !i.required || i.value.trim());
    if (allAnswered && textsFilled && current < steps.length - 1) setTimeout(() => showStep(current + 1), 220);
  });

  btnNext.addEventListener('click', () => {
    const bad = validate(steps[current]);
    if (bad) { merr.textContent = errorFor(bad); (bad.type === 'radio' ? bad.closest('label') : bad).focus?.(); return; }
    showStep(current + 1);
  });
  btnPrev.addEventListener('click', () => showStep(Math.max(0, current - 1)));

  mform.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (let i = 0; i < steps.length; i++) {
      const bad = validate(steps[i]);
      if (bad) { showStep(i); merr.textContent = errorFor(bad); if (bad.type !== 'radio') bad.focus(); return; }
    }
    btnSubmit.setAttribute('aria-busy', 'true');
    merr.textContent = '';
    try {
      const out = await sendLead(mform, 'popup:' + openedFrom);
      waLink.href = out.whatsapp_url;
      steps.forEach((s) => s.classList.remove('is-active'));
      doneStep.classList.add('is-active');
      mform.querySelector('.modal__nav').hidden = true;
      mform.querySelector('.modal__step').hidden = true;
      bar.style.width = '100%';
      openWhatsApp(out.whatsapp_url);
    } catch (err) {
      merr.textContent = err.message;
    } finally {
      btnSubmit.removeAttribute('aria-busy');
    }
  });

  // ---------- Formulario del pie ----------
  const fform = document.getElementById('footer-form');
  fform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ferr = fform.querySelector('.form-error');
    const bad = validate(fform);
    if (bad) { ferr.textContent = errorFor(bad); bad.focus(); return; }
    const btn = fform.querySelector('[type=submit]');
    btn.setAttribute('aria-busy', 'true');
    ferr.textContent = '';
    try {
      const out = await sendLead(fform, 'footer');
      fform.innerHTML = `<div class="step--done"><p class="done__icon">✓</p><h3>¡Gracias! Ya recibí tus datos.</h3>
        <p>Te escribo por WhatsApp en menos de 24 horas hábiles. Si querés, adelantame tu consulta ahora:</p>
        <a class="btn btn--primary btn--block btn--lg" href="${out.whatsapp_url}" target="_blank" rel="noopener">Abrir WhatsApp</a></div>`;
      openWhatsApp(out.whatsapp_url);
    } catch (err) {
      ferr.textContent = err.message;
    } finally {
      btn.removeAttribute('aria-busy');
    }
  });

  // ---------- Barra móvil: aparece después del hero ----------
  const mobilebar = document.querySelector('.mobilebar');
  const hero = document.querySelector('.hero');
  const contact = document.getElementById('contacto');
  if ('IntersectionObserver' in window && mobilebar) {
    let heroVisible = true;
    let contactVisible = false;
    const update = () => mobilebar.classList.toggle('is-visible', !heroVisible && !contactVisible);
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; update(); }).observe(hero);
    new IntersectionObserver(([e]) => { contactVisible = e.isIntersecting; update(); }).observe(contact);
  }

  document.getElementById('year').textContent = new Date().getFullYear();
})();
