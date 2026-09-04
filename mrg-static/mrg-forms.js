/* Standalone form handler replacing the Gravity Forms backend.
 * Keeps the original form markup/styling; on submit it validates required
 * fields, POSTs the entry as JSON to MRG_CONFIG.FORM_ENDPOINT and then shows
 * a Gravity-Forms-style confirmation message. If no endpoint is configured it
 * falls back to a pre-filled email. */
(function () {
  // stubs for inline handlers left in the markup
  window.gform = window.gform || {};
  window.gform.submission = window.gform.submission || { handleButtonClick: function () {} };
  window.gformToggleRadioOther = window.gformToggleRadioOther || function () {};

  var cfg = window.MRG_CONFIG || {};

  function labelFor(form, el) {
    var lab = el.id && form.querySelector('label[for="' + el.id + '"]');
    var txt = lab ? lab.textContent.replace(/\*/g, '').trim() : '';
    var wrap = el.closest('.gfield');
    var main = wrap && wrap.querySelector('.gfield_label');
    var mainTxt = main ? main.textContent.replace(/\*/g, '').trim() : '';
    if (el.type === 'checkbox' || el.type === 'radio') return mainTxt || txt || el.name;
    if (lab && lab.classList.contains('screen-reader-text')) return (mainTxt ? mainTxt + ' ' : '') + txt;
    return txt || mainTxt || el.placeholder || el.name;
  }

  function collect(form) {
    var data = {};
    var els = form.querySelectorAll('input, select, textarea');
    Array.prototype.forEach.call(els, function (el) {
      if (!el.name || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      var key = labelFor(form, el);
      var val = el.value;
      if (data[key]) data[key] += ', ' + val; else data[key] = val;
    });
    data['_page'] = location.href;
    return data;
  }

  function validate(form) {
    var ok = true;
    form.querySelectorAll('.gfield').forEach(function (f) { f.classList.remove('gfield_error'); });
    form.querySelectorAll('[aria-required="true"], [required]').forEach(function (el) {
      var empty = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      if (el.type === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) empty = true;
      if (empty) { ok = false; var w = el.closest('.gfield'); if (w) w.classList.add('gfield_error'); }
    });
    return ok;
  }

  function confirm(form, msg) {
    var wrap = form.closest('.gform_wrapper') || form;
    var div = document.createElement('div');
    div.className = 'gform_confirmation_wrapper';
    div.innerHTML = '<div class="gform_confirmation_message" role="alert">' + msg + '</div>';
    wrap.parentNode.replaceChild(div, wrap);
    div.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function send(form, data) {
    var btn = form.querySelector('.gform_button');
    if (btn) { btn.disabled = true; btn.dataset.orig = btn.value; btn.value = 'Sending…'; }
    if (!cfg.FORM_ENDPOINT || (cfg.FORM_ENDPOINT.indexOf('web3forms') > -1 && !cfg.WEB3FORMS_ACCESS_KEY)) {
      var body = Object.keys(data).map(function (k) { return k + ': ' + data[k]; }).join('\n');
      location.href = 'mailto:' + (cfg.FALLBACK_EMAIL || '') + '?subject=' + encodeURIComponent('Website enquiry') + '&body=' + encodeURIComponent(body);
      confirm(form, cfg.SUCCESS_MESSAGE || 'Thank you.');
      return;
    }
    if (cfg.WEB3FORMS_ACCESS_KEY) {
      data.access_key = cfg.WEB3FORMS_ACCESS_KEY;
      data.subject = cfg.SUBJECT || 'New enquiry from material-reuse.co.uk';
      data.from_name = 'Material Reuse Group website';
      var em = form.querySelector('input[type="email"]');
      if (em && em.value) data.replyto = em.value;
    }
    fetch(cfg.FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      confirm(form, cfg.SUCCESS_MESSAGE || 'Thank you.');
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.value = btn.dataset.orig; }
      var err = form.querySelector('.mrg-form-error') || document.createElement('div');
      err.className = 'mrg-form-error gform_validation_errors';
      err.textContent = 'Sorry, something went wrong sending your message. Please email ' + (cfg.FALLBACK_EMAIL || 'us') + ' instead.';
      form.insertBefore(err, form.firstChild);
    });
  }

  // ---- multi-page forms (Gravity Forms page breaks) ----
  function pagesOf(form) { return Array.prototype.slice.call(form.querySelectorAll('.gform_page')); }
  function currentIndex(form) {
    var ps = pagesOf(form);
    for (var i = 0; i < ps.length; i++) if (ps[i].style.display !== 'none') return i;
    return 0;
  }
  function validatePage(form, page) {
    var ok = true;
    page.querySelectorAll('.gfield').forEach(function (f) { f.classList.remove('gfield_error'); });
    page.querySelectorAll('[aria-required="true"], [required]').forEach(function (el) {
      var empty = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      if (el.type === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) empty = true;
      if (empty) { ok = false; var w = el.closest('.gfield'); if (w) w.classList.add('gfield_error'); }
    });
    return ok;
  }
  function showPage(form, idx) {
    var ps = pagesOf(form);
    ps.forEach(function (p, i) { p.style.display = i === idx ? '' : 'none'; });
    var pct = Math.round(((idx + 1) / ps.length) * 100);
    var bar = form.querySelector('.gf_progressbar_percentage');
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = bar.className.replace(/percentbar_\d+/, 'percentbar_' + pct);
      var span = bar.querySelector('span'); if (span) span.textContent = pct + '%';
    }
    var step = form.querySelector('.gf_step_current_page, .gf_progressbar_title, .gf_page_steps');
    form.querySelectorAll('.gf_progressbar_title').forEach(function (t) {
      t.innerHTML = t.innerHTML.replace(/Step\s*<span[^>]*>\d+<\/span>|Step\s*\d+/, function (m) {
        return m.replace(/\d+/, String(idx + 1));
      });
    });
    var wrap = form.closest('.gform_wrapper') || form;
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target;
    if (!btn.matches || !btn.matches('form[data-mrg-form] .gform_next_button, form[data-mrg-form] .gform_previous_button')) return;
    e.preventDefault();
    var form = btn.closest('form');
    var idx = currentIndex(form);
    if (btn.classList.contains('gform_next_button')) {
      if (!validatePage(form, pagesOf(form)[idx])) return;
      showPage(form, Math.min(idx + 1, pagesOf(form).length - 1));
    } else {
      showPage(form, Math.max(idx - 1, 0));
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches || !form.matches('form[data-mrg-form]')) return;
    e.preventDefault();
    if (!validate(form)) {
      var first = form.querySelector('.gfield_error');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    send(form, collect(form));
  });
})();

/* ---- Carousel height fix ----
 * Salient's carousels size themselves to the tallest slide when they initialise.
 * In Safari that can happen before the icons/fonts have loaded, leaving the
 * carousel only a few pixels tall and clipping its content. Re-measure once
 * everything has loaded, and again on resize. */
(function () {
  function resizeCarousels() {
    try {
      if (window.Flickity) {
        document.querySelectorAll('.flickity-enabled').forEach(function (el) {
          try { var f = Flickity.data(el); if (f) f.resize(); } catch (e) {}
        });
      }
    } catch (e) {}
  }
  window.addEventListener('load', function () {
    resizeCarousels();
    setTimeout(resizeCarousels, 800);
    setTimeout(resizeCarousels, 2500);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resizeCarousels);
  });
  var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(resizeCarousels, 200); });
})();
