const elements = {
  searchInput: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),
  countriesMeta: document.getElementById('countriesMeta'),
  searchHint: document.getElementById('searchHint'),
  countriesEmpty: document.getElementById('countriesEmpty'),
  countries: document.getElementById('countries')
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
let allCountries = [];
const FLAG_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="88" height="64" viewBox="0 0 88 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d6efd" stop-opacity=".35"/><stop offset="1" stop-color="#20c997" stop-opacity=".35"/></linearGradient></defs><rect width="88" height="64" rx="10" fill="url(#g)"/><path d="M18 40c8-14 16-14 24 0s16 14 28 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/><circle cx="26" cy="26" r="6" fill="rgba(255,255,255,.55)"/></svg>')}`;

function safeText(v) {
  return String(v ?? '');
}

function normalizeCountry(c) {
  const code = safeText(c.code).trim().toUpperCase();
  const name = safeText(c.name).trim();
  const count = Number.isFinite(Number(c.count)) ? Number(c.count) : 0;
  const flag = safeText(c.flag).trim();
  return { code, name, count, flag };
}

function formatDisplayName(name) {
  const n = safeText(name).trim();
  if (!n) return '';
  if (n.length <= 26) return n;
  const beforeParen = n.split('(')[0].trim();
  if (beforeParen.length >= 10) return beforeParen;
  const beforeComma = n.split(',')[0].trim();
  if (beforeComma.length >= 10) return beforeComma;
  return n;
}

function sortCountries(list) {
  return list.slice().sort((a, b) => {
    const nameCmp = collator.compare(a.name || a.code, b.name || b.code);
    if (nameCmp !== 0) return nameCmp;
    return collator.compare(a.code, b.code);
  });
}

function matchesQuery(c, q) {
  if (!q) return true;
  const code = c.code.toLowerCase();
  const name = c.name.toLowerCase();
  return code.includes(q) || name.includes(q);
}

function render(list, query) {
  elements.countries.innerHTML = '';

  const total = allCountries.length;
  const shown = list.length;
  elements.countriesMeta.textContent = `${shown.toLocaleString()} / ${total.toLocaleString()} negara`;

  if (query) {
    elements.searchHint.textContent = `Filter: "${query}"`;
  } else {
    elements.searchHint.textContent = 'Ketik untuk memfilter. Pencarian cocok untuk nama atau kode.';
  }

  if (shown === 0) {
    elements.countriesEmpty.classList.remove('d-none');
    elements.countriesEmpty.innerHTML = 'Tidak ada hasil. Coba kata kunci lain.';
    return;
  }
  elements.countriesEmpty.classList.add('d-none');

  const frag = document.createDocumentFragment();
  for (const c of list) {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-md-4 col-lg-3 col-xxl-2';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'country-card w-100 p-3 text-start';
    btn.addEventListener('click', () => openCountry(c.code));
    btn.title = c.name ? `${c.code} — ${c.name}` : c.code;

    const flagSrc = c.flag || FLAG_FALLBACK;
    const nameText = formatDisplayName(c.name);

    btn.innerHTML = `
      <div class="d-flex align-items-center gap-3">
        <img class="flag" src="${flagSrc}" alt="${escapeAttr(c.name || c.code)}" onerror="this.src='${FLAG_FALLBACK}'">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center justify-content-between gap-2">
            <div class="country-code">${escapeHtml(c.code)}</div>
            <span class="country-count badge badge-soft rounded-pill">${c.count.toLocaleString()}</span>
          </div>
          <div class="country-name muted" style="font-size:0.92rem">${escapeHtml(nameText)}</div>
        </div>
      </div>
    `;

    col.appendChild(btn);
    frag.appendChild(col);
  }
  elements.countries.appendChild(frag);
}

function openCountry(code) {
  window.location = `country.html?code=${encodeURIComponent(code)}`;
}

function escapeHtml(s) {
  return safeText(s).replace(/[&<>"']/g, (ch) => {
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

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

function applyFilter() {
  const raw = safeText(elements.searchInput.value).trim();
  const q = raw.toLowerCase();
  const filtered = allCountries.filter((c) => matchesQuery(c, q));
  render(filtered, raw);
}

async function init() {
  elements.countries.innerHTML = '<div class="col-12"><div class="panel p-4 text-center muted">Memuat data…</div></div>';
  try {
    const res = await fetch('./data/countries.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allCountries = sortCountries((Array.isArray(data) ? data : []).map(normalizeCountry));
    elements.searchInput.addEventListener('input', applyFilter);
    elements.clearSearch.addEventListener('click', () => {
      elements.searchInput.value = '';
      applyFilter();
      elements.searchInput.focus();
    });
    applyFilter();
  } catch (e) {
    elements.countries.innerHTML = '';
    elements.countriesEmpty.classList.remove('d-none');
    elements.countriesEmpty.innerHTML = `Data belum tersedia. Jalankan <code>python build_countries.py --csv "IP2LOCATION-LITE-DB3.CIDR.CSV"</code> untuk menghasilkan <code>static/data/countries.json</code>.`;
    elements.countriesMeta.textContent = '';
    elements.searchHint.textContent = '';
  }
}

init();
