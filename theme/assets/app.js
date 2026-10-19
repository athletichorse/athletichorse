/* Athletic Horse — storefront behaviour. No dependencies. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var root = window.Shopify && Shopify.routes && Shopify.routes.root ? Shopify.routes.root : '/';
  var isRTL = document.documentElement.dir === 'rtl';

  function formatMoney(cents) {
    var format = window.themeMoneyFormat || '{{amount}} SR';
    var value = (cents / 100);
    function fmt(n, decimals, thousands, dec) {
      var parts = n.toFixed(decimals).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return parts.join(dec);
    }
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case 'amount_no_decimals': return fmt(value, 0, ',', '.');
        case 'amount_with_comma_separator': return fmt(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return fmt(value, 0, '.', ',');
        default: return fmt(value, value % 1 === 0 ? 0 : 2, ',', '.');
      }
    });
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
  function initRails() {
    $$('[data-rail]').forEach(function (rail) {
      var track = $('[data-rail-track]', rail.closest('section') || rail);
      var prev = $('[data-rail-prev]', rail.closest('section') || rail);
      var next = $('[data-rail-next]', rail.closest('section') || rail);
      if (!track || !prev || !next) return;
      var dir = isRTL ? -1 : 1;
      function step() { return track.clientWidth * 0.85; }
      function update() {
        var max = track.scrollWidth - track.clientWidth - 2;
        var pos = Math.abs(track.scrollLeft);
        prev.disabled = pos <= 2;
        next.disabled = pos >= max;
      }
      prev.addEventListener('click', function () { track.scrollBy({ left: -step() * dir, behavior: 'smooth' }); });
      next.addEventListener('click', function () { track.scrollBy({ left: step() * dir, behavior: 'smooth' }); });
      track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    });
  }

  /* ---------- Cart API ---------- */
  var Cart = {
    get: function () { return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }); },
    add: function (body) {
      return fetch(root + 'cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
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
      '<div class="ah-totals__row ah-totals__row--total"><span>' + escapeHtml(s.strTotal) + '</span><span>' + formatMoney(cart.total_price) + '</span></div>';
  }

  function refreshDrawer() { return Cart.get().then(renderDrawer); }

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
      if (!btn) return;
      var line = btn.closest('[data-line-key]');
      line.classList.add('is-updating');
      Cart.change(line.dataset.lineKey, parseInt(btn.dataset.lineQty, 10)).then(renderDrawer);
    });
    drawerEl.addEventListener('change', function (e) {
      if (!e.target.matches('[data-line-input]')) return;
      var line = e.target.closest('[data-line-key]');
      line.classList.add('is-updating');
      Cart.change(line.dataset.lineKey, Math.max(0, parseInt(e.target.value, 10) || 0)).then(renderDrawer);
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
    var mainImg = $('[data-main-image]', rootEl);
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
        return '<span class="ah-price__now">' + formatMoney(v.price) + '</span><s class="ah-price__was">' + formatMoney(v.compare_at_price) + '</s><span class="ah-price__off">−' + off + '%</span>';
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
      if (priceEl) {
        priceEl.innerHTML = priceHtml(v);
        priceEl.classList.toggle('ah-price--sale', !!(v.compare_at_price && v.compare_at_price > v.price));
      }
      addBtn.disabled = !v.available;
      addBtn.textContent = v.available ? s.strAdd : s.strSoldOut;
      $$('[data-sticky-add]').forEach(function (b) { b.disabled = !v.available; b.textContent = addBtn.textContent; });
      $$('[data-sticky-price]').forEach(function (p) { p.textContent = formatMoney(v.price); });

      var capped = v.inventory_management === 'shopify' && v.inventory_policy === 'deny';
      if (qtyInput) {
        if (capped && v.inventory_quantity > 0) qtyInput.max = v.inventory_quantity; else qtyInput.removeAttribute('max');
        if (qtyInput.max && parseInt(qtyInput.value, 10) > parseInt(qtyInput.max, 10)) qtyInput.value = qtyInput.max;
      }
      if (stockEl) {
        if (!v.available) { stockEl.hidden = true; }
        else if (capped && v.inventory_quantity > 0 && v.inventory_quantity <= 10) {
          stockEl.hidden = false; stockEl.className = 'ah-stock ah-stock--low';
          stockEl.textContent = s.strLowStock.replace('[count]', v.inventory_quantity);
        } else {
          stockEl.hidden = false; stockEl.className = 'ah-stock'; stockEl.textContent = s.strInStock;
        }
      }
      if (v.featured_image && mainImg) setMain(v.featured_image.src, v.featured_image.id);
      $$('[data-selected-label]', rootEl).forEach(function (el) {
        var i = parseInt(el.dataset.selectedLabel, 10); el.textContent = opts[i] || '';
      });
      if (history.replaceState) {
        var url = new URL(window.location.href); url.searchParams.set('variant', v.id);
        history.replaceState({}, '', url.toString());
      }
    }

    function setMain(src, mediaId) {
      if (!mainImg) return;
      mainImg.removeAttribute('srcset');
      mainImg.src = src;
      mainImg.dataset.zoom = src.replace(/width=\d+/, 'width=2000');
      $$('[data-thumb]', rootEl).forEach(function (t) {
        t.classList.toggle('is-active', mediaId ? t.dataset.mediaId === String(mediaId) : t.dataset.src === src);
      });
    }

    rootEl.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-option-index] [data-value]');
      if (opt) {
        $$('[data-value]', opt.parentNode).forEach(function (b) { b.classList.remove('is-selected'); b.setAttribute('aria-checked', 'false'); });
        opt.classList.add('is-selected'); opt.setAttribute('aria-checked', 'true');
        update(); return;
      }
      var thumb = e.target.closest('[data-thumb]');
      if (thumb) { setMain(thumb.dataset.src, thumb.dataset.mediaId); return; }
      var step = e.target.closest('[data-qty-step]');
      if (step && qtyInput) {
        var next = (parseInt(qtyInput.value, 10) || 1) + parseInt(step.dataset.qtyStep, 10);
        var max = qtyInput.max ? parseInt(qtyInput.max, 10) : Infinity;
        qtyInput.value = Math.max(1, Math.min(max, next));
      }
    });
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

    // Zoom
    var zoom = $('[data-zoom-modal]');
    if (zoom && mainImg) {
      var openZoom = function () {
        $('img', zoom).src = mainImg.dataset.zoom || mainImg.currentSrc || mainImg.src;
        zoom.classList.add('is-open'); lockScroll(true);
      };
      mainImg.addEventListener('click', openZoom);
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
      var input = $('input', step.parentNode);
      input.value = Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(step.dataset.qtyStep, 10));
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
      var form = $('form', facets);
      var desktop = window.matchMedia('(min-width: 990px)');
      if (form) {
        form.addEventListener('change', function (e) {
          if (!desktop.matches) return;
          if (e.target.type === 'number') return;
          form.submit();
        });
      }
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

    $$('[data-load-more]').forEach(function (wrap) {
      var grid = $('[data-grid]', wrap.closest('[data-results]') || document);
      var btn = $('a, button', wrap);
      if (!grid || !btn) return;
      var busy = false;
      function load() {
        var next = wrap.dataset.next;
        if (!next || busy) return;
        busy = true; btn.classList.add('is-loading');
        fetch(next).then(function (r) { return r.text(); }).then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var newGrid = $('[data-grid]', doc);
          var newWrap = $('[data-load-more]', doc);
          if (newGrid) Array.prototype.forEach.call(newGrid.children, function (c) { grid.appendChild(document.importNode(c, true)); });
          var label = $('span', wrap);
          var newLabel = newWrap ? $('span', newWrap) : null;
          if (label && newLabel) label.innerHTML = newLabel.innerHTML;
          var bar = $('.ah-progress span', wrap);
          if (bar && wrap.dataset.total) bar.style.width = Math.min(100, grid.children.length / parseInt(wrap.dataset.total, 10) * 100) + '%';
          if (newWrap && newWrap.dataset.next) {
            wrap.dataset.next = newWrap.dataset.next; btn.href = newWrap.dataset.next;
            busy = false; btn.classList.remove('is-loading');
          } else {
            btn.remove();
          }
        }).catch(function () { busy = false; btn.classList.remove('is-loading'); });
      }
      btn.addEventListener('click', function (e) { e.preventDefault(); load(); });
    });
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
    initProduct();
    initModals();
    initCartPage();
    initCollection();
    initPolicy();
  });
})();
