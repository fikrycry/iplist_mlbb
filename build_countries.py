#!/usr/bin/env python3
"""build_countries.py
Streaming parser for IP2Location CSV that produces:
- countries.json: list of {code, name, count, flag}
- ipdata.db: sqlite DB with ip ranges table

Usage:
  python build_countries.py --csv IP2LOCATION-LITE-DB3.CIDR.CSV --json countries.json --db ipdata.db
"""
import argparse
import csv
import json
import os
import sqlite3

POSSIBLE_COUNTRY_CODE_KEYS = ["kode negara", "country_code", "countrycode", "country_code", "cc", "code"]
POSSIBLE_COUNTRY_NAME_KEYS = ["nama negara", "country_name", "country", "countryname", "country_name"]

# Values considered 'missing' or placeholder for country codes
INVALID_CODE_VALUES = {'-', 'NA', 'N/A', 'UNKNOWN', 'NONE', ''}


def is_missing_code(val):
    """Return True for empty or clearly-invalid placeholder country codes."""
    if not val:
        return True
    v = val.strip().upper()
    return v in INVALID_CODE_VALUES


def normalize_header(h):
    return h.strip().lower()


def find_key(fieldnames, candidates):
    lowered = [normalize_header(f) for f in fieldnames]
    # Try several matching strategies (exact, substring) to be robust to different headers
    for c in candidates:
        for i, h in enumerate(lowered):
            if c == h or c in h or h in c:
                return fieldnames[i]
    return None


def prepare_db(dbpath):
    conn = sqlite3.connect(dbpath)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS ranges (
            id INTEGER PRIMARY KEY,
            cidr TEXT,
            country_code TEXT,
            country_name TEXT,
            region TEXT,
            city TEXT
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_countrycode ON ranges(country_code)')
    conn.commit()
    return conn


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True)
    p.add_argument("--json", default="countries.json")
    p.add_argument("--db", default="ipdata.db")
    p.add_argument("--sample", type=int, default=0, help="only process first N rows (for testing)")
    p.add_argument("--no-export-static", action="store_false", dest="export_static", default=True,
                   help="Do not export per-country JSON files to static/data/")
    args = p.parse_args()

    counts = {}
    conn = prepare_db(args.db)
    cur = conn.cursor()

    with open(args.csv, newline='', encoding='utf-8', errors='replace') as f:
        # Peek first line to detect whether the CSV has a header row or not
        pos = f.tell()
        first_line = f.readline()
        f.seek(pos)
        first_token = first_line.split(',')[0].strip().strip('"') if first_line else ''
        no_header = False
        if first_token and '/' in first_token and any(ch.isdigit() for ch in first_token):
            no_header = True
            print('No CSV header detected, treating file as headerless (positional columns)')

        to_commit = 0
        processed = 0

        if no_header:
            # Heuristic: sample first N rows to detect which column is country code (usually 2-letter ISO)
            import itertools
            import collections
            pycountry_mod = None
            try:
                import pycountry as pycountry_mod  # optional: install `pycountry` to improve detection
                PYCOUNTRY_AVAILABLE = True
            except Exception:
                pycountry_mod = None
                PYCOUNTRY_AVAILABLE = False

            sample_rows = []
            samp_n = 1000
            reader_for_sample = csv.reader(f)
            for row in itertools.islice(reader_for_sample, samp_n):
                sample_rows.append(row)
            # rewind file to start for full reading
            f.seek(0)

            def looks_like_cc(val):
                if not val:
                    return False
                v = val.strip().strip('"')
                if len(v) == 2 and v.isalpha():
                    return True
                if PYCOUNTRY_AVAILABLE and pycountry_mod is not None:
                    try:
                        if pycountry_mod.countries.get(alpha_2=v.upper()):
                            return True
                    except Exception:
                        pass
                return False

            counts_by_col = collections.Counter()
            max_cols = max((len(r) for r in sample_rows), default=0)
            for r in sample_rows:
                for i in range(min(len(r), 5)):
                    if looks_like_cc(r[i]):
                        counts_by_col[i] += 1
            # choose column with highest cc matches, default fallback to 1
            if counts_by_col:
                code_idx = counts_by_col.most_common(1)[0][0]
            else:
                code_idx = 1 if max_cols > 1 else 1

            # choose name index heuristically (a column with longer strings or not code_idx)
            name_idx = None
            if max_cols > 2:
                for i in range(1, min(max_cols,5)):
                    if i == code_idx:
                        continue
                    # prefer a column which often has spaces or letters
                    sample_vals = [r[i] for r in sample_rows if len(r) > i]
                    avg_len = sum(len(s) for s in sample_vals)/max(1,len(sample_vals))
                    if avg_len > 3:
                        name_idx = i
                        break
                if name_idx is None:
                    name_idx = 2 if max_cols > 2 else code_idx
            else:
                name_idx = code_idx

            print(f"Auto-detected columns (positional): code_idx={code_idx}, name_idx={name_idx}")

            reader = csv.reader(f)
            for row in reader:
                processed += 1
                cidr = row[0] if len(row) > 0 else ''
                code = (row[code_idx] or '').strip().upper() if len(row) > code_idx else ''
                name = (row[name_idx] or '').strip() if len(row) > name_idx else ''
                region = (row[3] or '').strip() if len(row) > 3 else ''
                city = (row[4] or '').strip() if len(row) > 4 else ''

                # Skip placeholder/missing country codes (e.g. '-') when building counts
                if not is_missing_code(code):
                    counts.setdefault(code, {'code': code, 'name': name, 'count': 0})
                    counts[code]['count'] += 1

                # Insert into sqlite
                try:
                    cur.execute('INSERT INTO ranges (cidr, country_code, country_name, region, city) VALUES (?,?,?,?,?)',
                                (cidr, code, name, region, city))
                except Exception as e:
                    print(f"Warning: failed to insert row {processed}: {e}")

                to_commit += 1
                if to_commit >= 1000:
                    conn.commit()
                    to_commit = 0

                if args.sample and processed >= args.sample:
                    break

                if processed % 50000 == 0:
                    print(f"Processed {processed} rows...")

            if to_commit:
                conn.commit()
        else:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames or []
            print("Fieldnames:", fieldnames)
            cc_key = find_key(fieldnames, POSSIBLE_COUNTRY_CODE_KEYS) or (fieldnames[1] if len(fieldnames) > 1 else None)
            cname_key = find_key(fieldnames, POSSIBLE_COUNTRY_NAME_KEYS) or (fieldnames[2] if len(fieldnames) > 2 else None)
            region_key = 'region' if 'region' in [normalize_header(x) for x in fieldnames] else None
            city_key = 'city' if 'city' in [normalize_header(x) for x in fieldnames] else None

            print(f"Detected keys: country_code='{cc_key}', country_name='{cname_key}', region='{region_key}', city='{city_key}'")

            for row in reader:
                processed += 1
                cidr = row.get(fieldnames[0]) if fieldnames else None
                code = (row.get(cc_key) or '').strip().upper() if cc_key else ''
                name = (row.get(cname_key) or '').strip() if cname_key else ''
                region = (row.get(region_key) or '').strip() if region_key else ''
                city = (row.get(city_key) or '').strip() if city_key else ''

                # Skip placeholder/missing country codes (e.g. '-') when building counts
                if not is_missing_code(code):
                    counts.setdefault(code, {'code': code, 'name': name, 'count': 0})
                    counts[code]['count'] += 1

                # Insert into sqlite
                try:
                    cur.execute('INSERT INTO ranges (cidr, country_code, country_name, region, city) VALUES (?,?,?,?,?)',
                                (cidr, code, name, region, city))
                except Exception as e:
                    # skip problematic rows
                    print(f"Warning: failed to insert row {processed}: {e}")

                to_commit += 1
                if to_commit >= 1000:
                    conn.commit()
                    to_commit = 0

                if args.sample and processed >= args.sample:
                    break

                if processed % 50000 == 0:
                    print(f"Processed {processed} rows...")

            if to_commit:
                conn.commit()

    # write countries.json (exclude missing/placeholder codes)
    countries = sorted([c for c in counts.values() if not is_missing_code(c.get('code',''))], key=lambda x: x['count'], reverse=True)
    for c in countries:
        code_lower = c['code'].lower()
        c['flag'] = f"https://flagcdn.com/w80/{code_lower}.png"

    with open(args.json, 'w', encoding='utf-8') as out:
        json.dump(countries, out, ensure_ascii=False, indent=2)

    # export per-country static JSON files for static hosting (e.g. GitHub Pages)
    if args.export_static:
        outdir = os.path.join(os.path.dirname(__file__), 'static', 'data')
        os.makedirs(outdir, exist_ok=True)
        print(f"Exporting per-country files to {outdir} ...")
        with open(os.path.join(outdir, 'countries.json'), 'w', encoding='utf-8') as out:
            json.dump(countries, out, ensure_ascii=False, indent=2)
        for c in countries:
            code = c.get('code', '') or ''
            name = c.get('name', '') or ''
            # Choose a filename key: prefer short alphanumeric codes, otherwise use country name
            filename_key = code if code and len(code) <= 4 and all(ch.isalnum() or ch in ('-','_') for ch in code) else (name or code)
            if not filename_key:
                continue
            # sanitize filename to avoid path separators and illegal chars
            safe = ''.join(ch if ch.isalnum() or ch in ('-','_') else '_' for ch in filename_key).strip('_')
            if not safe:
                safe = 'country'
            cur.execute('SELECT cidr, region, city FROM ranges WHERE country_code = ?', (code,))
            rows = cur.fetchall()
            rows_out = [{'cidr': r[0], 'region': r[1], 'city': r[2]} for r in rows]
            pfn = os.path.join(outdir, f"{safe}.json")
            with open(pfn, 'w', encoding='utf-8') as fo:
                json.dump(rows_out, fo, ensure_ascii=False)

        # Clean up any leftover placeholder files (e.g. "-.json") from previous runs
        placeholder = os.path.join(outdir, '-.json')
        if os.path.exists(placeholder):
            try:
                os.remove(placeholder)
                print(f"Removed placeholder file {placeholder}")
            except Exception as e:
                print(f"Warning: unable to remove placeholder file {placeholder}: {e}")

        print(f"Wrote per-country files to {outdir}")

    print(f"Done. Processed {processed} rows. Wrote {args.json} and {args.db}")


if __name__ == '__main__':
    main()
