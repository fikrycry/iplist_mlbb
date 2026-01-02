(function () {
  const params = new URLSearchParams(location.search);
  const cidr = String(params.get('cidr') || '').trim();

  function ipv4ToBigInt(ip) {
    const parts = String(ip).trim().split('.');
    if (parts.length !== 4) return null;
    let out = 0n;
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0 || n > 255) return null;
      out = (out << 8n) | BigInt(n);
    }
    return out;
  }

  function bigIntToIpv4(v) {
    const a = Number((v >> 24n) & 255n);
    const b = Number((v >> 16n) & 255n);
    const c = Number((v >> 8n) & 255n);
    const d = Number(v & 255n);
    return `${a}.${b}.${c}.${d}`;
  }

  function randomBelow(n) {
    if (n <= 0n) return 0n;
    const bitLen = n.toString(2).length;
    const bytes = Math.ceil(bitLen / 8);
    const buf = new Uint8Array(bytes);
    while (true) {
      crypto.getRandomValues(buf);
      let x = 0n;
      for (const b of buf) x = (x << 8n) | BigInt(b);
      const excessBits = BigInt(bytes * 8 - bitLen);
      if (excessBits > 0n) x = x >> excessBits;
      if (x < n) return x;
    }
  }

  function parseCidr(s) {
    const raw = String(s).trim();
    const m = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})$/);
    if (!m) return null;
    const ip = ipv4ToBigInt(m[1]);
    if (ip == null) return null;
    const prefixNum = Number(m[2]);
    if (!Number.isInteger(prefixNum) || prefixNum < 0 || prefixNum > 32) return null;
    const prefix = BigInt(prefixNum);
    const hostBits = 32n - prefix;
    const hostCount = 1n << hostBits;
    const mask = prefix === 0n ? 0n : ((~0n) << hostBits) & ((1n << 32n) - 1n);
    const base = ip & mask;
    return { base, hostCount, prefixNum };
  }

  function pickRandomIpFromCidr(s) {
    const parsed = parseCidr(s);
    if (!parsed) return null;
    const { base, hostCount, prefixNum } = parsed;
    let offset = 0n;
    if (hostCount === 1n) {
      offset = 0n;
    } else if (hostCount === 2n) {
      offset = randomBelow(2n);
    } else {
      offset = 1n + randomBelow(hostCount - 2n);
    }
    const ip = base + offset;
    if (ip < 0n || ip > ((1n << 32n) - 1n)) return null;
    if (prefixNum === 32) return bigIntToIpv4(base);
    return bigIntToIpv4(ip);
  }

  let out = cidr;
  if (cidr.includes('/')) {
    out = pickRandomIpFromCidr(cidr) || '';
  } else {
    const ip = ipv4ToBigInt(cidr);
    out = ip == null ? '' : bigIntToIpv4(ip);
  }

  document.body.textContent = out || 'Not specified';
  document.title = out || 'IP';
})();
