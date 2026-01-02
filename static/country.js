(function(){
  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').toUpperCase();
  const title = document.getElementById('title');
  const subtitle = document.getElementById('subtitle');
  const flag = document.getElementById('flag');
  const meta = document.getElementById('meta');
  const searchInput = document.getElementById('searchInput');
  const clearSearch = document.getElementById('clearSearch');
  const searchHint = document.getElementById('searchHint');
  const list = document.getElementById('list');
  const loadMore = document.getElementById('loadMore');
  const FLAG_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="88" height="64" viewBox="0 0 88 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d6efd" stop-opacity=".35"/><stop offset="1" stop-color="#20c997" stop-opacity=".35"/></linearGradient></defs><rect width="88" height="64" rx="10" fill="url(#g)"/><path d="M18 40c8-14 16-14 24 0s16 14 28 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/><circle cx="26" cy="26" r="6" fill="rgba(255,255,255,.55)"/></svg>')}`;
  flag.src = FLAG_FALLBACK;
  flag.onerror = () => { flag.src = FLAG_FALLBACK; };

  if(!code){
    title.textContent = 'Country not specified';
    meta.innerHTML = '<div class="alert alert-warning">Gunakan <em>?code=XX</em> pada URL.</div>';
    return;
  }
  title.textContent = code;
  document.title = `${code} - IP Ranges`;
  meta.textContent = 'Memuat daftar IP...';
  if (searchHint) searchHint.textContent = '';

  fetch('./data/countries.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .then((countries) => {
      if (!Array.isArray(countries)) return;
      const found = countries.find((c) => String(c.code || '').toUpperCase() === code);
      if (!found) return;
      const name = String(found.name || '').trim();
      const flagUrl = String(found.flag || '').trim();
      subtitle.textContent = name;
      if (flagUrl) {
        flag.src = flagUrl;
        flag.alt = name || code;
      }
      if (name) document.title = `${code} - ${name}`;
    })
    .catch(() => {});

  const fileKey = encodeURIComponent(code);
  fetch(`./data/${fileKey}.json`).then(r => {
    if(!r.ok) throw new Error('Not found');
    return r.json();
  }).then(data => {
    const full = Array.isArray(data) ? data : [];
    const normalized = full.map((r) => ({
      cidr: String(r?.cidr ?? ''),
      region: String(r?.region ?? ''),
      city: String(r?.city ?? '')
    }));

    if(normalized.length === 0){
      meta.textContent = `Jumlah subnet: 0`;
      list.innerHTML = '<div class="alert alert-info">Tidak ada data.</div>';
      loadMore.classList.add('d-none');
      return;
    }

    const chunkSize = 100;
    let idx = 0;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const t = document.createElement('table');
    t.className = 'table table-sm table-striped align-middle';
    t.innerHTML = `<thead><tr><th style="width:38%">CIDR</th><th style="width:31%">Region</th><th style="width:31%">City</th></tr></thead>`;
    const tb = document.createElement('tbody');
    t.appendChild(tb);
    wrap.appendChild(t);
    list.appendChild(wrap);

    let filtered = normalized;
    let currentQuery = '';
    let filterTimer = 0;

    function matchesRow(r, q){
      if (!q) return true;
      const region = (r.region || '').toLowerCase();
      const city = (r.city || '').toLowerCase();
      return region.includes(q) || city.includes(q);
    }

    function updateMeta(){
      const total = normalized.length;
      const shown = filtered.length;
      if (currentQuery) {
        meta.textContent = `Jumlah subnet: ${shown.toLocaleString()} (dari ${total.toLocaleString()})`;
        if (searchHint) searchHint.textContent = `Filter region/city: "${currentQuery}"`;
      } else {
        meta.textContent = `Jumlah subnet: ${total.toLocaleString()}`;
        if (searchHint) searchHint.textContent = 'Ketik untuk memfilter berdasarkan region atau city.';
      }
    }

    function clearTable(){
      tb.innerHTML = '';
      idx = 0;
    }

    function renderChunk(){
      const chunk = filtered.slice(idx, idx + chunkSize);
      const frag = document.createDocumentFragment();
      for(const r of chunk){
        const cidrText = String(r.cidr || '');
        const plainHref = `ip.html?cidr=${encodeURIComponent(cidrText)}`;
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e) => {
          const target = e?.target;
          if (target && target.closest && target.closest('a')) return;
          location.href = plainHref;
        });
        tr.innerHTML = `<td><a class="fw-semibold text-decoration-none" style="color:inherit" href="${plainHref}">${escapeHtml(cidrText)}</a></td><td>${escapeHtml(r.region || '')}</td><td>${escapeHtml(r.city || '')}</td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      idx += chunkSize;
      if(idx >= filtered.length){
        loadMore.classList.add('d-none');
      } else {
        loadMore.classList.remove('d-none');
      }
    }

    function applyFilterNow(){
      const raw = String(searchInput?.value ?? '').trim();
      const q = raw.toLowerCase();
      currentQuery = raw;
      filtered = normalized.filter((r) => matchesRow(r, q));
      clearTable();
      updateMeta();
      if (filtered.length === 0) {
        loadMore.classList.add('d-none');
        list.innerHTML = '<div class="alert alert-info">Tidak ada hasil. Coba kata kunci lain.</div>';
        list.appendChild(wrap);
        return;
      }
      list.innerHTML = '';
      list.appendChild(wrap);
      renderChunk();
    }

    function scheduleFilter(){
      if (filterTimer) window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(applyFilterNow, 150);
    }

    if (searchInput) searchInput.addEventListener('input', scheduleFilter);
    if (clearSearch) clearSearch.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = '';
      applyFilterNow();
      searchInput.focus();
    });
    loadMore.addEventListener('click', renderChunk);

    updateMeta();
    renderChunk();
  }).catch(err => {
    meta.innerHTML = `<div class="alert alert-warning">Gagal memuat data untuk ${code} (${err.message}).</div>`;
  })

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }
})();
