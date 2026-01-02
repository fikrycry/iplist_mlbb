"""Simple Flask backend for countries + ip ranges
Endpoints:
- GET /api/countries -> returns countries.json if present, else queries DB
- GET /api/ips/<code> -> returns IP ranges for country code (first 1000 by default)
- / -> serves static/index.html
"""
from flask import Flask, jsonify, send_from_directory, abort, request, Response
import os, json, sqlite3, ipaddress, secrets

APP_DIR = os.path.dirname(__file__)
DATA_JSON = os.path.join(APP_DIR, 'countries.json')
DB_PATH = os.path.join(APP_DIR, 'ipdata.db')

app = Flask(__name__, static_folder='static', static_url_path='')


@app.route('/api/countries')
def countries():
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    # fallback: query distinct country codes from DB
    if os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('SELECT country_code, country_name, COUNT(*) FROM ranges GROUP BY country_code, country_name ORDER BY COUNT(*) DESC')
        rows = cur.fetchall()
        res = []
        for code, name, cnt in rows:
            code = (code or '').upper()
            res.append({'code': code, 'name': name or '', 'count': cnt, 'flag': f"https://flagcdn.com/w80/{(code or '').lower()}.png"})
        return jsonify(res)
    abort(404, "No data available. Run the parser to generate countries.json or ipdata.db")


@app.route('/api/ips/<code>')
def ips_for_country(code):
    code = code.strip().upper()
    if not os.path.exists(DB_PATH):
        abort(404, "DB not found. Run parser")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT cidr, region, city FROM ranges WHERE country_code = ? LIMIT 1000', (code,))
    rows = cur.fetchall()
    return jsonify([{'cidr': r[0], 'region': r[1], 'city': r[2]} for r in rows])


def _get_client_ip():
    x_forwarded_for = (request.headers.get('X-Forwarded-For') or '').strip()
    if x_forwarded_for:
        first = x_forwarded_for.split(',')[0].strip()
        if first:
            return first
    x_real_ip = (request.headers.get('X-Real-IP') or '').strip()
    if x_real_ip:
        return x_real_ip
    return (request.remote_addr or '').strip()


@app.route('/myip')
def myip():
    ip = _get_client_ip()
    resp = Response(ip, mimetype='text/plain')
    resp.headers['Cache-Control'] = 'no-store'
    return resp


def _pick_ip_from_cidr_or_ip(raw):
    s = (raw or '').strip()
    if not s:
        return None
    if '/' not in s:
        try:
            return str(ipaddress.IPv4Address(s))
        except Exception:
            return None

    try:
        net = ipaddress.IPv4Network(s, strict=False)
    except Exception:
        return None

    size = net.num_addresses
    base = int(net.network_address)
    if size == 1:
        return str(net.network_address)
    if size == 2:
        offset = secrets.randbelow(2)
        return str(ipaddress.IPv4Address(base + offset))
    offset = 1 + secrets.randbelow(size - 2)
    return str(ipaddress.IPv4Address(base + offset))


@app.route('/ip')
def ip_from_cidr():
    cidr = (request.args.get('cidr') or '').strip()
    ip = _pick_ip_from_cidr_or_ip(cidr)
    if not ip:
        abort(400, "Invalid or missing 'cidr'")
    resp = Response(ip, mimetype='text/plain')
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/')
def root():
    return send_from_directory('static', 'index.html')


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
