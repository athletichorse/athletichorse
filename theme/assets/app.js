/* Athletic Horse — storefront behaviour. No dependencies. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var root = window.Shopify && Shopify.routes && Shopify.routes.root ? Shopify.routes.root : '/';
  var isRTL = document.documentElement.dir === 'rtl';

  // Prices render as "<riyal symbol> 1,234" to match the Liquid `money` snippet
  function formatMoney(cents) {
    var value = cents / 100;
    var parts = value.toFixed(value % 1 === 0 ? 0 : 2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '<span class="ah-money">' + (window.themeRiyal || 'SAR ') + '<span class="ah-money__num">' + parts.join('.') + '</span></span>';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function lockScroll(lock) { document.documentElement.style.overflow = lock ? 'hidden' : ''; }

  /* ---------- Header ---------- */
  function initFooter() {
    var mq = window.matchMedia('(min-width: 990px)');
    var cols = $$('.ah-footer__col');
    function sync() { cols.forEach(function (d) { d.open = mq.matches; }); }
    sync();
    if (mq.addEventListener) mq.addEventListener('change', sync);
  }

  function initHeader() {
    var header = $('[data-ah-header]');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile menu ---------- */
  function initDrawer() {
    var drawer = $('.mobile-drawer');
    var overlay = $('[data-overlay]');
    var openBtn = $('[data-drawer-open]');
    if (!drawer || !overlay || !openBtn) return;
    function open() {
      drawer.classList.add('is-open'); overlay.classList.add('is-open');
      openBtn.setAttribute('aria-expanded', 'true'); lockScroll(true);
      var first = drawer.querySelector('a, button'); if (first) first.focus();
    }
    function close() {
      drawer.classList.remove('is-open'); overlay.classList.remove('is-open');
      openBtn.setAttribute('aria-expanded', 'false'); lockScroll(false);
    }
    openBtn.addEventListener('click', open);
    overlay.addEventListener('click', close);
    $$('[data-drawer-close]', drawer).forEach(function (b) { b.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('is-open')) close(); });

    $$('[data-accordion-toggle]', drawer).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var group = btn.closest('[data-accordion-group]');
        var openNow = !group.classList.contains('is-open');
        group.classList.toggle('is-open', openNow);
        btn.setAttribute('aria-expanded', String(openNow));
      });
    });
  }

  /* ---------- Announcement rotator ---------- */
  function initAnnouncement() {
    var msgs = $$('[data-announce-msg]');
    if (msgs.length < 2) return;
    var i = 0;
    setInterval(function () {
      if (document.hidden) return;
      msgs[i].classList.remove('is-active');
      i = (i + 1) % msgs.length;
      msgs[i].classList.add('is-active');
    }, 4500);
  }

  /* ---------- Rails (horizontal product carousels) ---------- */
  function initRails() { $$('[data-rail]').forEach(initRail); }
  function initRail(rail) {
    var scope = rail.closest('section') || rail;
    var track = $('[data-rail-track]', scope);
    var prev = $('[data-rail-prev]', scope);
    var next = $('[data-rail-next]', scope);
    if (!track || !prev || !next || rail.dataset.railReady) return;
    rail.dataset.railReady = '1';
    var dir = isRTL ? -1 : 1;
    /* Page counter between the arrows: "1/N", one page = one screen of cards */
    var count = $('[data-rail-count]', scope);
    if (!count) {
      count = document.createElement('span');
      count.className = 'ah-rail__count'; count.setAttribute('data-rail-count', ''); count.setAttribute('aria-live', 'polite');
      prev.parentNode.insertBefore(count, next);
    }
    function metrics() {
      var items = track.children, first = items[0];
      if (!first) return { per: 1, pages: 1, unit: track.clientWidth };
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      var unit = first.getBoundingClientRect().width + gap;
      var per = Math.max(1, Math.round((track.clientWidth + gap) / unit));
      return { per: per, pages: Math.max(1, Math.ceil(items.length / per)), unit: unit };
    }
    function page() {
      var m = metrics();
      return Math.min(m.pages, Math.round(Math.abs(track.scrollLeft) / (m.unit * m.per)) + 1);
    }
    function update() {
      var m = metrics(), cur = page();
      var max = track.scrollWidth - track.clientWidth - 2, pos = Math.abs(track.scrollLeft);
      prev.disabled = pos <= 2;
      next.disabled = pos >= max;
      count.textContent = cur + '/' + m.pages;
      prev.parentNode.hidden = m.pages <= 1;
    }
    function go(delta) {
      var m = metrics(), target = (page() - 1 + delta) * m.per * m.unit;
      track.scrollTo({ left: Math.max(0, target) * dir, behavior: 'smooth' });
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    new MutationObserver(update).observe(track, { childList: true });
    update();
  }

  /* ---------- Cart API ---------- */
  var Cart = {
    get: function () { return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }); },
    add: function (body) {
      return fetch(root + 'cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; document.dispatchEvent(new CustomEvent('cart:added')); return j; }); });
    },
    change: function (key, quantity) {
      return fetch(root + 'cart/change.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ id: key, quantity: quantity })
      }).then(function (r) { return r.json(); });
    }
  };

  function updateCount(count) {
    $$('.cart-count').forEach(function (el) { el.textContent = count; el.style.display = count > 0 ? '' : 'none'; });
  }

  /* ---------- Cart drawer ---------- */
  var drawerEl, drawerOverlay, lastFocus;

  function renderDrawer(cart) {
    if (!drawerEl) return;
    var s = drawerEl.dataset;
    var body = $('[data-cart-body]', drawerEl);
    var foot = $('[data-cart-foot]', drawerEl);
    var ship = $('[data-cart-ship]', drawerEl);
    var countEl = $('[data-cart-title-count]', drawerEl);
    updateCount(cart.item_count);
    if (countEl) countEl.textContent = cart.item_count > 0 ? '(' + cart.item_count + ')' : '';

    var threshold = parseInt(s.freeShipping || '0', 10) * 100;
    if (ship) {
      if (threshold > 0 && cart.item_count > 0) {
        var remaining = threshold - cart.total_price;
        var pct = Math.min(100, Math.round((cart.total_price / threshold) * 100));
        ship.hidden = false;
        ship.classList.toggle('is-done', remaining <= 0);
        ship.innerHTML = (remaining > 0
          ? s.strShipRemaining.replace('[amount]', '<strong>' + formatMoney(remaining) + '</strong>')
          : '<strong>' + s.strShipDone + '</strong>') +
          '<div class="ah-ship__bar"><span style="width:' + pct + '%"></span></div>';
      } else {
        ship.hidden = true;
      }
    }

    if (cart.item_count === 0) {
      body.innerHTML = '<div class="ah-cart-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path stroke-linecap="round" d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>' +
        '<h3>' + escapeHtml(s.strEmpty) + '</h3>' +
        '<a class="ah-btn" href="' + s.allUrl + '">' + escapeHtml(s.strContinue) + '</a></div>';
      foot.hidden = true;
      return;
    }

    body.innerHTML = cart.items.map(function (item) {
      var img = item.featured_image && item.featured_image.url
        ? '<img src="' + item.featured_image.url + (item.featured_image.url.indexOf('?') > -1 ? '&' : '?') + 'width=200" alt="' + escapeHtml(item.featured_image.alt || item.product_title) + '" width="84" height="84" loading="lazy">'
        : '';
      var variant = item.variant_title && item.variant_title !== 'Default Title' ? '<span class="ah-line__variant">' + escapeHtml(item.variant_title) + '</span>' : '';
      var price = item.original_line_price !== item.final_line_price
        ? '<s class="ah-price__was">' + formatMoney(item.original_line_price) + '</s> ' + formatMoney(item.final_line_price)
        : formatMoney(item.final_line_price);
      return '<div class="ah-line" data-line-key="' + item.key + '">' +
        '<a class="ah-line__media" href="' + item.url + '">' + img + '</a>' +
        '<div class="ah-line__info">' +
          '<a class="ah-line__title" href="' + item.url + '">' + escapeHtml(item.product_title) + '</a>' + variant +
          '<div class="ah-line__row">' +
            '<div class="ah-qty ah-qty--sm">' +
              '<button type="button" data-line-qty="' + (item.quantity - 1) + '" aria-label="−">−</button>' +
              '<input type="number" value="' + item.quantity + '" min="0" data-line-input aria-label="' + escapeHtml(s.strQty) + '">' +
              '<button type="button" data-line-qty="' + (item.quantity + 1) + '" aria-label="+">+</button>' +
            '</div>' +
            '<span class="ah-line__price">' + price + '</span>' +
          '</div>' +
          '<button type="button" class="ah-line__remove" data-line-qty="0">' + escapeHtml(s.strRemove) + '</button>' +
        '</div></div>';
    }).join('');

    foot.hidden = false;
    var discounts = (cart.cart_level_discount_applications || []).map(function (d) {
      return '<div class="ah-totals__row ah-totals__row--discount"><span>' + escapeHtml(d.title) + '</span><span>−' + formatMoney(d.total_allocated_amount) + '</span></div>';
    }).join('');
    $('[data-cart-totals]', foot).innerHTML = discounts +
      '<div class="ah-totals__row ah-totals__row--total"><span>' + escapeHtml(s.strTotal) + '</span><span>' + formatMoney(cart.total_price) + '</span></div>' +
      '<div class="ah-totals__row ah-totals__row--vat"><span>' + escapeHtml(s.strVat) + '</span><span>' + formatMoney(Math.round(cart.total_price * 15 / 115)) + '</span></div>';
    applyCartLimits();
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
  }

  function refreshDrawer() { return Cart.get().then(renderDrawer); }

  /* Dim the + button on drawer lines that already hold every unit in stock */
  function applyCartLimits() {
    if (!drawerEl) return Promise.resolve();
    return fetch(root + '?sections=cart-limits', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var wrap = document.createElement('div'); wrap.innerHTML = data['cart-limits'] || '';
        var el = wrap.querySelector('[data-cart-limits]');
        var limits = el ? JSON.parse(el.textContent) : {};
        $$('[data-line-key]', drawerEl).forEach(function (line) {
          var max = limits[line.dataset.lineKey];
          var plus = $$('[data-line-qty]', line).filter(function (b) { return b.getAttribute('aria-label') === '+'; })[0];
          var input = $('[data-line-input]', line);
          if (!plus || max === undefined) return;
          var qty = parseInt(input.value, 10) || 0;
          if (input) input.max = Math.max(max, qty);
          plus.disabled = qty >= max;
          plus.title = plus.disabled ? (window.themeStrings || {}).maxInCart || '' : '';
        });
      }).catch(function () {});
  }

  function openDrawer() {
    if (!drawerEl) { window.location.href = root + 'cart'; return; }
    lastFocus = document.activeElement;
    drawerEl.classList.add('is-open'); drawerOverlay.classList.add('is-open');
    drawerEl.setAttribute('aria-hidden', 'false'); lockScroll(true);
    var close = $('[data-cart-close]', drawerEl); if (close) close.focus();
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('is-open'); drawerOverlay.classList.remove('is-open');
    drawerEl.setAttribute('aria-hidden', 'true'); lockScroll(false);
    if (lastFocus) lastFocus.focus();
  }

  function initCartDrawer() {
    drawerEl = $('[data-cart-drawer]');
    drawerOverlay = $('[data-cart-overlay]');
    if (!drawerEl) return;
    var onCartPage = document.body.classList.contains('template-cart');
    $$('[data-cart-drawer-open]').forEach(function (t) {
      t.addEventListener('click', function (e) {
        if (onCartPage) return;
        e.preventDefault(); openDrawer(); refreshDrawer();
      });
    });
    drawerOverlay.addEventListener('click', closeDrawer);
    $('[data-cart-close]', drawerEl).addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawerEl.classList.contains('is-open')) closeDrawer(); });

    drawerEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-line-qty]');
      if (!btn || btn.disabled) return;
      var line = btn.closest('[data-line-key]');
      line.classList.add('is-updating');
      Cart.change(line.dataset.lineKey, parseInt(btn.dataset.lineQty, 10)).then(renderDrawer);
    });
    drawerEl.addEventListener('change', function (e) {
      if (!e.target.matches('[data-line-input]')) return;
      var line = e.target.closest('[data-line-key]');
      line.classList.add('is-updating');
      var want = Math.max(0, parseInt(e.target.value, 10) || 0);
      if (e.target.max) want = Math.min(want, parseInt(e.target.max, 10));
      Cart.change(line.dataset.lineKey, want).then(renderDrawer);
    });

    var coupon = $('[data-coupon]', drawerEl);
    if (coupon) {
      coupon.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('input', coupon);
        var msg = $('[data-coupon-msg]', coupon.parentNode);
        var code = input.value.trim();
        if (!code) { if (msg) msg.textContent = drawerEl.dataset.strCouponEmpty; return; }
        window.location.href = root + 'discount/' + encodeURIComponent(code) + '?redirect=' + encodeURIComponent(root + 'checkout');
      });
    }
  }

  function addedToCart(btn, html) {
    if (btn) {
      btn.classList.remove('is-loading'); btn.classList.add('is-added');
      setTimeout(function () { btn.classList.remove('is-added'); if (html != null) btn.innerHTML = html; btn.disabled = false; }, 1600);
    }
    refreshDrawer().then(openDrawer);
  }

  function addError(btn, err, html) {
    if (btn) { btn.classList.remove('is-loading'); btn.disabled = false; if (html != null) btn.innerHTML = html; }
    var message = (err && (err.description || err.message)) || 'Error';
    window.alert(message);
  }

  /* ---------- Quick add from product cards ---------- */
  function initQuickAdd() {
    document.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-quick-add]');
      if (!form) return;
      e.preventDefault();
      var btn = $('button[type="submit"]', form);
      if (btn.disabled) return;
      btn.disabled = true; btn.classList.add('is-loading');
      Cart.add({ items: [{ id: parseInt($('input[name="id"]', form).value, 10), quantity: 1 }] })
        .then(function () { addedToCart(btn); })
        .catch(function (err) { addError(btn, err); });
    });
  }

  /* ---------- Card hover image: only fetched on first hover (saves a second image per card) ---------- */
  function initCardHover() {
    document.addEventListener('mouseover', function (e) {
      var card = e.target.closest && e.target.closest('.ah-card');
      if (!card || card.classList.contains('is-alt')) return;
      var img = $('.ah-card__img--alt', card);
      if (!img) return;
      var ready = function () { card.classList.add('is-alt'); };
      if (img.complete && img.naturalWidth) ready(); else img.addEventListener('load', ready, { once: true });
    });
  }

  /* ---------- Quick view: pick options for multi-variant products from the card ---------- */
  function initQuickView() {
    var str = window.themeStrings || {};
    var modal, lastBtn;
    function build() {
      modal = document.createElement('div');
      modal.className = 'ah-qv';
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = '<div class="ah-qv__panel"><button type="button" class="ah-icon-btn ah-qv__close" data-qv-close aria-label="' + escapeHtml(str.close) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg></button><div data-qv-body></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-qv-close]')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
    }
    function close() { modal.classList.remove('is-open'); lockScroll(false); if (lastBtn) lastBtn.focus(); }
    function render(p, url) {
      var body = $('[data-qv-body]', modal);
      var opts = p.options.map(function (o) { return (o && o.name) || o; });
      var values = p.options.map(function (o, i) {
        if (o && o.values) return o.values;
        var seen = []; p.variants.forEach(function (v) { var x = v['option' + (i + 1)]; if (seen.indexOf(x) < 0) seen.push(x); }); return seen;
      });
      var first = p.variants.filter(function (v) { return v.available; })[0] || p.variants[0];
      var sel = opts.map(function (_, i) { return first['option' + (i + 1)]; });
      var img = p.featured_image ? '<img src="' + p.featured_image + (p.featured_image.indexOf('?') < 0 ? '?' : '&') + 'width=400" alt="" width="200" height="200">' : '';
      body.innerHTML = '<div class="ah-qv__head"><div class="ah-qv__media">' + img + '</div><div><h2 class="ah-qv__title">' + escapeHtml(p.title) + '</h2><div class="ah-price" data-qv-price></div></div></div>' +
        opts.map(function (name, i) {
          return '<fieldset class="ah-qv__opt"><legend>' + escapeHtml(name) + '</legend><div class="ah-qv__chips">' +
            values[i].map(function (val) { return '<button type="button" class="ah-chip-opt" data-i="' + i + '" data-v="' + escapeHtml(val) + '">' + escapeHtml(val) + '</button>'; }).join('') + '</div></fieldset>';
        }).join('') +
        '<button type="button" class="ah-btn ah-btn--block" data-qv-add></button><a class="ah-qv__link" href="' + url + '">' + escapeHtml(str.details) + '</a>';
      var add = $('[data-qv-add]', body);
      function current() { return p.variants.filter(function (v) { return sel.every(function (x, i) { return v['option' + (i + 1)] === x; }); })[0]; }
      function sync() {
        var v = current();
        $$('[data-i]', body).forEach(function (b) {
          var i = +b.dataset.i, test = sel.slice(); test[i] = b.dataset.v;
          var match = p.variants.filter(function (x) { return test.every(function (t, j) { return x['option' + (j + 1)] === t; }); })[0];
          b.classList.toggle('is-selected', sel[i] === b.dataset.v);
          b.classList.toggle('is-unavailable', !match || !match.available);
        });
        var priceEl = $('[data-qv-price]', body);
        if (v) {
          var sale = v.compare_at_price && v.compare_at_price > v.price;
          priceEl.className = 'ah-price' + (sale ? ' ah-price--sale' : '');
          priceEl.innerHTML = (sale ? '<s class="ah-price__was">' + formatMoney(v.compare_at_price) + '</s>' : '') + '<span class="ah-price__now">' + formatMoney(v.price) + '</span>' +
            (sale ? '<span class="ah-price__off">-' + Math.round((1 - v.price / v.compare_at_price) * 100) + '%</span>' : '');
        }
        add.disabled = !v || !v.available;
        add.textContent = !v ? str.unavailable : (v.available ? str.add : str.soldOut);
      }
      body.addEventListener('click', function (e) {
        var b = e.target.closest('[data-i]');
        if (b) { sel[+b.dataset.i] = b.dataset.v; sync(); }
      });
      add.addEventListener('click', function () {
        var v = current(); if (!v) return;
        add.disabled = true; add.classList.add('is-loading');
        Cart.add({ items: [{ id: v.id, quantity: 1 }] })
          .then(function () { add.classList.remove('is-loading'); modal.classList.remove('is-open'); lockScroll(false); addedToCart(lastBtn); })
          .catch(function (err) { addError(add, err); sync(); });
      });
      sync();
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-quick-view]');
      if (!btn) return;
      e.preventDefault();
      if (!modal) build();
      lastBtn = btn;
      var url = btn.dataset.quickView.split('?')[0];
      btn.classList.add('is-loading');
      fetch(url + '.js').then(function (r) { if (!r.ok) throw r; return r.json(); }).then(function (p) {
        btn.classList.remove('is-loading');
        render(p, url);
        modal.classList.add('is-open'); lockScroll(true);
        var c = $('[data-qv-close]', modal); if (c) c.focus();
      }).catch(function () { window.location.href = url; });
    });
  }

  /* ---------- Product gallery: swipe/scroll-snap slides, counter, arrows, thumbs ---------- */
  function initGallery(el) {
    if (!el) return null;
    var track = $('[data-gallery-track]', el);
    if (!track) return null;
    var slides = $$('[data-slide]', el);
    var thumbs = $$('[data-thumb]', el);
    var counter = $('[data-gallery-index]', el);
    var index = 0;
    function width() { return track.clientWidth || 1; }
    function sync() {
      var i = Math.round(Math.abs(track.scrollLeft) / width());
      i = Math.max(0, Math.min(slides.length - 1, i));
      if (i === index && counter && counter.textContent === String(i + 1)) return;
      index = i;
      if (counter) counter.textContent = i + 1;
      thumbs.forEach(function (t, n) { t.classList.toggle('is-active', n === i); });
      var active = thumbs[i];
      if (active && active.parentNode.scrollTo) {
        var box = active.parentNode;
        if (box.scrollHeight > box.clientHeight) box.scrollTo({ top: active.offsetTop - box.clientHeight / 2 + active.clientHeight / 2, behavior: 'smooth' });
      }
    }
    function goTo(i, instant) {
      i = (i + slides.length) % slides.length;
      track.scrollTo({ left: (isRTL ? -1 : 1) * i * width(), behavior: instant ? 'auto' : 'smooth' });
      index = i; if (counter) counter.textContent = i + 1;
      thumbs.forEach(function (t, n) { t.classList.toggle('is-active', n === i); });
    }
    var raf = 0;
    track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
    thumbs.forEach(function (t, n) { t.addEventListener('click', function () { goTo(n); }); });
    var prev = $('[data-gallery-prev]', el), next = $('[data-gallery-next]', el);
    if (prev) prev.addEventListener('click', function () { goTo(index - 1); });
    if (next) next.addEventListener('click', function () { goTo(index + 1); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + (isRTL ? -1 : 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index + (isRTL ? 1 : -1)); }
    });
    return {
      goToMedia: function (id) {
        for (var n = 0; n < slides.length; n++) if (slides[n].dataset.mediaId === String(id)) { goTo(n); return; }
      },
      currentImg: function () { return slides[index] ? $('img', slides[index]) : null; }
    };
  }

  /* ---------- Product page ---------- */
  function initProduct() {
    var rootEl = $('[data-product]');
    if (!rootEl) return;
    var data = JSON.parse($('[data-product-json]', rootEl).textContent);
    var form = $('[data-product-form]', rootEl);
    var idInput = $('input[name="id"]', form);
    var addBtn = $('[data-add-to-cart]', rootEl);
    var priceEl = $('[data-price]', rootEl);
    var stockEl = $('[data-stock]', rootEl);
    var qtyInput = $('[data-qty-input]', rootEl);
    var gallery = initGallery($('[data-gallery]', rootEl));
    var s = rootEl.dataset;

    function selectedOptions() {
      return data.options.map(function (name, i) {
        var group = $('[data-option-index="' + i + '"]', rootEl);
        if (!group) return null;
        var sel = $('select', group);
        if (sel) return sel.value;
        var active = $('.is-selected', group);
        return active ? active.dataset.value : null;
      });
    }

    function findVariant(opts) {
      return data.variants.filter(function (v) {
        return opts.every(function (o, i) { return o === null || v['option' + (i + 1)] === o; });
      })[0];
    }

    function markAvailability(opts) {
      data.options.forEach(function (_, i) {
        $$('[data-option-index="' + i + '"] [data-value]', rootEl).forEach(function (btn) {
          var test = opts.slice(); test[i] = btn.dataset.value;
          var v = findVariant(test);
          btn.classList.toggle('is-unavailable', !v || !v.available);
        });
      });
    }

    function priceHtml(v) {
      if (v.compare_at_price && v.compare_at_price > v.price) {
        var off = Math.round((1 - v.price / v.compare_at_price) * 100);
        var save = (s.strSave || '').replace('[amount]', formatMoney(v.compare_at_price - v.price)).replace('[percent]', off);
        return '<s class="ah-price__was">' + formatMoney(v.compare_at_price) + '</s><span class="ah-price__now">' + formatMoney(v.price) + '</span><span class="ah-price__off">' + (s.strOff || '[percent]%').replace('[percent]', off) + '</span><span class="ah-save">' + save + '</span>';
      }
      return '<span class="ah-price__now">' + formatMoney(v.price) + '</span>';
    }

    function update() {
      var opts = selectedOptions();
      var v = findVariant(opts);
      markAvailability(opts);
      if (!v) {
        addBtn.disabled = true; addBtn.textContent = s.strUnavailable; return;
      }
      idInput.value = v.id;
      document.dispatchEvent(new CustomEvent('product:variant', { detail: { id: v.id, price: v.price } }));
      if (priceEl) {
        priceEl.innerHTML = priceHtml(v);
        priceEl.classList.toggle('ah-price--sale', !!(v.compare_at_price && v.compare_at_price > v.price));
      }
      addBtn.disabled = !v.available;
      addBtn.textContent = v.available ? s.strAdd : s.strSoldOut;
      $$('[data-sticky-add]').forEach(function (b) { b.disabled = !v.available; b.textContent = addBtn.textContent; });
      $$('[data-sticky-price]').forEach(function (p) { p.innerHTML = formatMoney(v.price); });

      var capped = v.inventory_management === 'shopify' && v.inventory_policy === 'deny';
      current = v; capVariant = capped;
      syncQty();
      if (stockEl) {
        if (!v.available) { stockEl.hidden = true; }
        else if (capped && v.inventory_quantity > 0 && v.inventory_quantity <= 10) {
          stockEl.hidden = false; stockEl.className = 'ah-stock ah-stock--low';
          stockEl.textContent = s.strLowStock.replace('[count]', v.inventory_quantity);
        } else {
          stockEl.hidden = false; stockEl.className = 'ah-stock'; stockEl.textContent = s.strInStock;
        }
      }
      if (v.featured_image && gallery) gallery.goToMedia(v.featured_image.id);
      $$('[data-selected-label]', rootEl).forEach(function (el) {
        var i = parseInt(el.dataset.selectedLabel, 10); el.textContent = opts[i] || '';
      });
      if (history.replaceState) {
        var url = new URL(window.location.href); url.searchParams.set('variant', v.id);
        history.replaceState({}, '', url.toString());
      }
    }

    rootEl.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-option-index] [data-value]');
      if (opt) {
        $$('[data-value]', opt.parentNode).forEach(function (b) { b.classList.remove('is-selected'); b.setAttribute('aria-checked', 'false'); });
        opt.classList.add('is-selected'); opt.setAttribute('aria-checked', 'true');
        update(); return;
      }
      var step = e.target.closest('[data-qty-step]');
      if (step && qtyInput && !step.disabled) {
        var next = (parseInt(qtyInput.value, 10) || 1) + parseInt(step.dataset.qtyStep, 10);
        var max = qtyInput.max ? parseInt(qtyInput.max, 10) : Infinity;
        qtyInput.value = Math.max(1, Math.min(max, next));
        syncQty();
      }
    });
    if (qtyInput) qtyInput.addEventListener('change', syncQty);

    /* Quantity limit: stock minus what is already in the basket; + dims at the limit */
    var current = null, capVariant = false, inCart = {};
    function syncQty() {
      if (!qtyInput || !current) return;
      var plus = $('[data-qty-step="1"]', rootEl), minus = $('[data-qty-step="-1"]', rootEl);
      var left = capVariant ? Math.max(0, current.inventory_quantity - (inCart[current.id] || 0)) : Infinity;
      if (left === Infinity) qtyInput.removeAttribute('max'); else qtyInput.max = Math.max(1, left);
      var val = parseInt(qtyInput.value, 10) || 1;
      if (val > left && left > 0) qtyInput.value = val = left;
      if (val < 1) qtyInput.value = val = 1;
      if (plus) { plus.disabled = val >= left; plus.title = plus.disabled ? (window.themeStrings || {}).maxInCart || '' : ''; }
      if (minus) minus.disabled = val <= 1;
      if (current.available) {
        var full = capVariant && left <= 0;
        addBtn.disabled = full;
        addBtn.textContent = full ? ((window.themeStrings || {}).maxInCart || s.strSoldOut) : s.strAdd;
      }
    }
    function loadCartCounts(cart) {
      inCart = {};
      (cart.items || []).forEach(function (i) { inCart[i.variant_id] = (inCart[i.variant_id] || 0) + i.quantity; });
      syncQty();
    }
    Cart.get().then(loadCartCounts).catch(function () {});
    document.addEventListener('cart:updated', function (e) { if (e.detail) loadCartCounts(e.detail); });
    rootEl.addEventListener('change', function (e) { if (e.target.closest('[data-option-index]')) update(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (addBtn.disabled) return;
      var label = addBtn.textContent;
      addBtn.disabled = true; addBtn.classList.add('is-loading');
      Cart.add({ items: [{ id: parseInt(idInput.value, 10), quantity: parseInt(qtyInput ? qtyInput.value : 1, 10) || 1 }] })
        .then(function () { addBtn.classList.remove('is-loading'); addBtn.disabled = false; addBtn.textContent = label; refreshDrawer().then(openDrawer); })
        .catch(function (err) { addError(addBtn, err, label); });
    });

    // Sticky add-to-cart bar on mobile
    var sticky = $('[data-sticky-atc]');
    if (sticky && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        sticky.classList.toggle('is-visible', !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0);
      }).observe(addBtn);
      $$('[data-sticky-add]', sticky).forEach(function (b) {
        b.addEventListener('click', function () { form.requestSubmit ? form.requestSubmit() : addBtn.click(); });
      });
    }

    // Zoom: opens the image on the current slide
    var zoom = $('[data-zoom-modal]');
    if (zoom && gallery) {
      var openZoom = function () {
        var img = gallery.currentImg();
        if (!img) return;
        $('img', zoom).src = img.dataset.zoom || img.currentSrc || img.src;
        zoom.classList.add('is-open'); lockScroll(true);
      };
      $$('[data-slide] img', rootEl).forEach(function (i) { i.addEventListener('click', openZoom); });
      $$('[data-zoom-open]', rootEl).forEach(function (b) { b.addEventListener('click', openZoom); });
      zoom.addEventListener('click', function () { zoom.classList.remove('is-open'); lockScroll(false); });
    }

    update();
  }

  /* ---------- Generic modals (size guide) ---------- */
  function initModals() {
    $$('[data-modal-open]').forEach(function (btn) {
      var modal = document.getElementById(btn.dataset.modalOpen);
      if (!modal) return;
      btn.addEventListener('click', function () { modal.classList.add('is-open'); lockScroll(true); });
      modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target.closest('[data-modal-close]')) { modal.classList.remove('is-open'); lockScroll(false); }
      });
    });
  }

  /* ---------- Cart page quantity ---------- */
  function initCartPage() {
    var form = $('[data-cart-form]');
    if (!form) return;
    form.addEventListener('click', function (e) {
      var step = e.target.closest('[data-qty-step]');
      if (!step) return;
      if (step.disabled) return;
      var input = $('input', step.parentNode);
      var max = input.max ? parseInt(input.max, 10) : Infinity;
      input.value = Math.max(0, Math.min(max, (parseInt(input.value, 10) || 0) + parseInt(step.dataset.qtyStep, 10)));
      form.submit();
    });
    form.addEventListener('change', function (e) { if (e.target.matches('input[type="number"]')) form.submit(); });
  }

  /* ---------- Collection: filters, sort, load more ---------- */
  function initCollection() {
    var facets = $('[data-facets]');
    var overlay = $('[data-facets-overlay]');
    if (facets) {
      var open = function () { facets.classList.add('is-open'); if (overlay) overlay.classList.add('is-open'); lockScroll(true); };
      var close = function () { facets.classList.remove('is-open'); if (overlay) overlay.classList.remove('is-open'); lockScroll(false); };
      $$('[data-facets-open]').forEach(function (b) { b.addEventListener('click', open); });
      $$('[data-facets-close]').forEach(function (b) { b.addEventListener('click', close); });
      if (overlay) overlay.addEventListener('click', close);
    }

    var sort = $('[data-sort]');
    if (sort) {
      sort.addEventListener('change', function () {
        var url = new URL(window.location.href);
        url.searchParams.set('sort_by', sort.value);
        url.searchParams.delete('page');
        window.location.href = url.toString();
      });
    }

    // Infinite scroll. In-stock cards are appended page by page; sold-out cards are held back
    // and appended once the last page has loaded, so they always sit at the end of the list.
    $$('[data-load-more]').forEach(function (wrap) {
      var grid = $('[data-grid]', wrap.closest('[data-results]') || document);
      var btn = $('a, button', wrap);
      if (!grid || !btn) return;
      var held = $$('[data-soldout][hidden]', grid);
      held.forEach(function (li) { li.remove(); li.hidden = false; });
      var busy = false;
      var sentinel = document.createElement('div');
      sentinel.className = 'ah-load-more__sentinel';
      wrap.parentNode.insertBefore(sentinel, wrap);

      function finish() {
        held.forEach(function (li) { grid.appendChild(li); });
        held = [];
        btn.remove();
        if (io) io.disconnect();
      }
      function nearBottom() { return sentinel.getBoundingClientRect().top < window.innerHeight + 800; }
      function load() {
        var next = wrap.dataset.next;
        if (!next || busy) return;
        busy = true; btn.classList.add('is-loading'); wrap.classList.add('is-loading');
        fetch(next).then(function (r) { return r.text(); }).then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var newGrid = $('[data-grid]', doc);
          var newWrap = $('[data-load-more]', doc);
          if (newGrid) Array.prototype.forEach.call(newGrid.children, function (c) {
            var node = document.importNode(c, true);
            if (node.hasAttribute('data-soldout')) { node.hidden = false; held.push(node); }
            else grid.appendChild(node);
          });
          var label = $('span', wrap);
          var newLabel = newWrap ? $('span', newWrap) : null;
          if (label && newLabel) label.innerHTML = newLabel.innerHTML;
          var bar = $('.ah-progress span', wrap);
          if (bar && wrap.dataset.total) bar.style.width = Math.min(100, (grid.children.length + held.length) / parseInt(wrap.dataset.total, 10) * 100) + '%';
          busy = false; btn.classList.remove('is-loading'); wrap.classList.remove('is-loading');
          if (newWrap && newWrap.dataset.next) {
            wrap.dataset.next = newWrap.dataset.next; btn.href = newWrap.dataset.next;
            if (nearBottom()) load();
          } else {
            wrap.dataset.next = '';
            finish();
          }
        }).catch(function () { busy = false; btn.classList.remove('is-loading'); wrap.classList.remove('is-loading'); });
      }
      btn.addEventListener('click', function (e) { e.preventDefault(); load(); });
      if (!wrap.dataset.next) { finish(); return; }
      var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) load();
      }, { rootMargin: '0px 0px 800px 0px' }) : null;
      if (io) io.observe(sentinel);
      // Fast flicks can jump past the sentinel without it ever intersecting
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking || !wrap.dataset.next) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; if (nearBottom()) load(); });
      }, { passive: true });
    });
  }

  /* ---------- Product recommendations: "You may also like" + "Frequently bought together" ---------- */
  function fetchSection(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw r; return r.text(); })
      .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
  }

  function initRecommendations() {
    $$('[data-recs]').forEach(function (sec) {
      var list = $('[data-recs-items]', sec);
      var done = function () { if (!list.children.length) sec.hidden = true; else initRail($('[data-rail]', sec)); };
      if (!sec.dataset.url) { done(); return; }
      var load = function () {
        fetchSection(sec.dataset.url).then(function (doc) {
          var fresh = $('[data-recs-items]', doc);
          if (fresh && fresh.children.length >= 4) list.innerHTML = fresh.innerHTML;
          done();
        }).catch(done);
      };
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '600px' });
        io.observe(sec);
      } else load();
    });
  }

  function initFbt() {
    var sec = $('[data-fbt]');
    if (!sec) return;
    var adds = $('[data-fbt-items]', sec);
    var totalEl = $('[data-fbt-total]', sec);
    var btn = $('[data-fbt-add]', sec);
    var mirror = $('[data-fbt-mirror]', sec);

    function priceOf(item) {
      var sel = $('[data-fbt-variant]', item);
      if (sel.tagName === 'SELECT') { var o = sel.options[sel.selectedIndex]; return o ? parseInt(o.dataset.price, 10) : 0; }
      return parseInt(sel.dataset.price, 10) || 0;
    }
    function chosen() { return $$('[data-fbt-item]', sec).filter(function (i) { return $('[data-fbt-check]', i).checked; }); }
    function refresh() {
      var items = chosen(), all = $$('[data-fbt-item]', sec);
      totalEl.innerHTML = formatMoney(items.reduce(function (t, i) { return t + priceOf(i); }, 0));
      all.forEach(function (i) { i.classList.toggle('is-off', !$('[data-fbt-check]', i).checked); });
      btn.textContent = items.length === all.length ? btn.dataset.strAll : btn.dataset.strSome.replace('[count]', items.length);
      btn.disabled = items.length === 0;
    }
    function ready() {
      if (!adds.children.length) return;
      sec.hidden = false; refresh();
    }
    sec.addEventListener('change', refresh);
    document.addEventListener('product:variant', function (e) {
      if (!mirror) return;
      mirror.value = String(e.detail.id);
      if (mirror.value !== String(e.detail.id)) { var o = document.createElement('option'); o.value = e.detail.id; o.dataset.price = e.detail.price; mirror.appendChild(o); mirror.value = String(e.detail.id); }
      refresh();
    });
    btn.addEventListener('click', function () {
      var items = chosen().map(function (i) { return { id: parseInt($('[data-fbt-variant]', i).value, 10), quantity: 1 }; });
      if (!items.length) return;
      btn.disabled = true; btn.classList.add('is-loading');
      Cart.add({ items: items }).then(function () { btn.classList.remove('is-loading'); btn.disabled = false; refreshDrawer().then(openDrawer); })
        .catch(function (err) { addError(btn, err); });
    });

    var url = sec.dataset.fbtUrl;
    if (!url) { ready(); return; }
    fetchSection(url + '&intent=complementary').then(function (doc) {
      var items = $('[data-fbt-items]', doc);
      if (items && items.children.length) return items;
      return null;
    }).then(function (items) {
      if (items) adds.innerHTML = items.innerHTML;
      ready();
    }).catch(function () {});
  }

  /* ---------- Scroll animations: reveal, count-up numbers, light parallax ---------- */
  function initMotion() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var reveals = $$('[data-reveal]'), counters = $$('[data-count]'), layers = $$('[data-parallax]');
    if (!reveals.length && !counters.length) return;
    if (reduce || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('ah-anim');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });

    var fmt = function (n, dec) { return dec ? n.toFixed(dec) : Math.round(n).toLocaleString('en-US'); };
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        var el = en.target, end = parseFloat(el.dataset.count) || 0, dec = parseInt(el.dataset.decimals || '0', 10);
        var t0 = performance.now(), dur = 1600;
        (function tick(now) {
          var p = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
          el.textContent = fmt(end * eased, dec);
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { el.textContent = fmt(0, parseInt(el.dataset.decimals || '0', 10)); cio.observe(el); });

    if (layers.length && window.matchMedia('(min-width: 750px)').matches) {
      var ticking = false;
      var move = function () {
        var vh = window.innerHeight;
        layers.forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh) return;
          var shift = (r.top + r.height / 2 - vh / 2) * parseFloat(el.dataset.parallax || '0.05');
          el.style.transform = 'translate3d(0,' + (-shift).toFixed(1) + 'px,0)';
        });
        ticking = false;
      };
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(move); } }, { passive: true });
      move();
    }
  }

  /* ---------- Attribution: "Came from" survey + automatic first-touch source ---------- */
  function detectSource() {
    var params = new URLSearchParams(window.location.search);
    var utm = params.get('utm_source');
    var ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    if (ref === window.location.hostname.replace(/^www\./, '')) ref = '';
    var map = [[/chatgpt|openai/, 'ChatGPT'], [/perplexity/, 'Perplexity'], [/gemini|bard/, 'Gemini'], [/copilot|bing/, 'Bing / Copilot'],
      [/google/, 'Google'], [/instagram/, 'Instagram'], [/tiktok/, 'TikTok'], [/snapchat/, 'Snapchat'], [/facebook|fb\./, 'Facebook'],
      [/whatsapp|wa\.me/, 'WhatsApp'], [/(^|\.)t\.co$|twitter|x\.com/, 'X'], [/youtube/, 'YouTube']];
    var probe = (utm || ref || '').toLowerCase();
    if (!probe) return null;
    for (var i = 0; i < map.length; i++) if (map[i][0].test(probe)) return map[i][1];
    return utm || ref;
  }

  function saveAttributes(attrs) {
    return fetch(root + 'cart/update.js', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ attributes: attrs })
    }).catch(function () {});
  }

  /* Order attribution: detected silently and saved as cart attributes, so it shows on the order in Shopify admin only */
  function initAttribution() {
    var KEY = 'ah_first_touch';
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    var src = detectSource();
    var params = new URLSearchParams(window.location.search);
    if (!stored) {
      stored = { source: src || 'Direct', landing: window.location.pathname, at: new Date().toISOString().slice(0, 10), campaign: params.get('utm_campaign') || '' };
      try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch (e) {}
    }
    if (src) { try { sessionStorage.setItem('ah_last_touch', src); } catch (e) {} }
    var last = src;
    if (!last) { try { last = sessionStorage.getItem('ah_last_touch'); } catch (e) {} }
    var pushed = false;
    function pushAuto() {
      if (pushed) return pushed;
      var attrs = { 'Came from': stored.source, 'Landing page': stored.landing, 'First visit': stored.at, 'Last source': last || stored.source };
      if (stored.campaign) attrs['Campaign'] = stored.campaign;
      pushed = saveAttributes(attrs);
      return pushed;
    }
    document.addEventListener('cart:added', pushAuto);
    if (window.location.pathname.indexOf('/cart') > -1) pushAuto();
    document.addEventListener('click', function (e) {
      var go = e.target.closest('[data-checkout]');
      if (!go || pushed) return;
      e.preventDefault();
      pushAuto().then(function () { window.location.href = go.href || (root + 'checkout'); });
    }, true);
  }

  /* ---------- Policies: table of contents + related policy nav ---------- */
  function initPolicy() {
    var container = $('.shopify-policy__container');
    if (!container) return;
    var body = $('.shopify-policy__body', container);
    var rte = $('.rte', body) || body;
    var headings = $$('h2', rte);
    var cfg = $('[data-policy-config]');
    var conf = cfg ? JSON.parse(cfg.textContent) : { links: [], toc: 'Contents' };

    if (conf.links && conf.links.length) {
      var nav = document.createElement('nav');
      nav.className = 'ah-legal__nav'; nav.setAttribute('aria-label', conf.navLabel || '');
      nav.innerHTML = conf.links.map(function (l) {
        var current = window.location.pathname.replace(/\/$/, '').endsWith(l.url.replace(/\/$/, ''));
        return '<a href="' + l.url + '"' + (current ? ' aria-current="page"' : '') + '>' + escapeHtml(l.title) + '</a>';
      }).join('');
      container.insertBefore(nav, body);
    }

    if (headings.length >= 3) {
      var layout = document.createElement('div');
      layout.className = 'ah-legal__layout';
      var toc = document.createElement('details');
      toc.className = 'ah-toc';
      if (window.matchMedia('(min-width: 990px)').matches) toc.open = true;
      var list = headings.map(function (h, i) {
        if (!h.id) h.id = 'section-' + (i + 1);
        return '<li><a href="#' + h.id + '">' + escapeHtml(h.textContent.trim()) + '</a></li>';
      }).join('');
      toc.innerHTML = '<summary>' + escapeHtml(conf.toc) + '</summary><ol>' + list + '</ol>';
      body.parentNode.insertBefore(layout, body);
      layout.appendChild(toc);
      layout.appendChild(body);

      if ('IntersectionObserver' in window) {
        var links = $$('a', toc);
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
            }
          });
        }, { rootMargin: '-20% 0px -70% 0px' });
        headings.forEach(function (h) { io.observe(h); });
      }
    }

    if (conf.help) {
      var help = document.createElement('div');
      help.className = 'ah-legal__help';
      help.innerHTML = '<div><strong>' + escapeHtml(conf.help.title) + '</strong><p>' + escapeHtml(conf.help.text) + '</p></div>' +
        '<a class="ah-btn ah-btn--highlight" href="' + conf.help.url + '">' + escapeHtml(conf.help.cta) + '</a>';
      body.appendChild(help);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initFooter();
    initDrawer();
    initAnnouncement();
    initRails();
    initCartDrawer();
    initQuickAdd();
    initCardHover();
    initQuickView();
    initRecommendations();
    initFbt();
    initMotion();
    initAttribution();
    initProduct();
    initModals();
    initCartPage();
    initCollection();
    initPolicy();
  });
})();
