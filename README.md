# IP by Country - Prototype

This repository contains a simple pipeline to turn an IP2Location CSV into a small web app that lists countries (with flag images) and shows IP ranges per country.

Quick steps:

1. Create virtual environment and install deps

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. Run parser on your CSV (replace filename as needed)

```bash
python build_countries.py --csv "IP2LOCATION-LITE-DB3.CIDR.CSV" --json countries.json --db ipdata.db
```

3. Run the Flask app

```bash
python app.py
# open http://127.0.0.1:5000
```

Notes:
- The parser is streaming-friendly and stores results in `countries.json` and `ipdata.db`.
- If your CSV uses different column names, the parser attempts to find likely headers ("kode negara", "nama negara", etc.).

Note: For improved automatic country-code detection you can install the optional package `pycountry` (add to your venv with `pip install pycountry`). Installing it will also remove the "Import 'pycountry' could not be resolved" warning in some editors.
- After running the parser, the homepage will show a grid of country buttons with flags (from flagcdn). Click a country to view IP ranges (prototype page).

If you want, I can add pagination, search, or a country detail page that shows a map — pilih fitur yang Anda mau.

## Deploying as a static site (GitHub Pages)

This project can be hosted for free as a static site. The parser now exports per-country JSON files to `static/data/` which are suitable for static hosting (one file per country code).

Quick steps:

1. Run the parser locally:

```bash
python build_countries.py --csv "IP2LOCATION-LITE-DB3.CIDR.CSV"
```

2. Commit and push the repository to GitHub (`main` branch).

3. The included GitHub Actions workflow (`.github/workflows/deploy_pages.yml`) will automatically deploy the contents of the `static/` folder to GitHub Pages (gh-pages branch) on each push to `main`.

4. After the workflow completes, your site will be available at `https://<your-username>.github.io/<repo-name>/`.

Notes:
- If a per-country file is very large, consider chunking or splitting it before publishing.
- You can also deploy `static/` to Netlify or Vercel instead of GitHub Pages if you prefer.