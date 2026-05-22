#!/usr/bin/env python3
"""
Phase 14 — Import CREEMOS + SN senate votes into PuestoPrioridad.

Steps:
  1  DB reconnaisance: snapshot Puesto table
  2  Read Excel, filter ANTIOQUIA + CREEMOS|MOVIMIENTO SALVACIÓN NACIONAL, aggregate
  3  Build mapping (exact → abbreviation → fuzzy), produce puesto_mapping_prioridad.csv
  4  Validation gate (prints summary; asks "apply? [y/N]")
  5  Pilot: insert prioridad for one municipio (RIONEGRO)
  6  Full apply: batched transactions
  7  Verification: conservation arithmetic + spot-check
  8  Generate noagregados_prioridad report

Usage:
  python import-priority.py [--env-file path/to/.env.local] [--pilot-only] [--skip-confirm]
"""

import argparse
import collections
import csv
import json
import math
import os
import random
import re
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import psycopg2
import psycopg2.extras
from rapidfuzz import fuzz, process as rfprocess

# ── Config ────────────────────────────────────────────────────────────────────

EXCEL_PATH = Path(__file__).parent.parent.parent.parent / "data" / "Comparativo CREEMOS vs SN.xlsx"
SHEET_SENADO = "Senado (Para candidatos)"
MAPPING_CSV = Path(__file__).parent / "puesto_mapping_prioridad.csv"
NOAGREGADOS_CSV = Path(__file__).parent / "noagregados_prioridad.csv"
REPORT_MD = Path(__file__).parent / "reporte_prioridad.md"

TARGET_DEPT = "ANTIOQUIA"
TARGET_PARTIES = {"CREEMOS", "MOVIMIENTO SALVACIÓN NACIONAL"}

# Pilot municipio — medium volume, real venue names, no Medellín complexity
PILOT_MUNICIPIO = "RIONEGRO"

BATCH_SIZE = 100

# Fuzzy thresholds
THRESHOLD_AUTO = 90
THRESHOLD_REVIEW = 75

# Abbreviation expansions: (regex pattern → expansion, bidirectional)
ABBREV_MAP = [
    (r"\bSEC\.\s*ESC\.\b",      "SECCION ESCUELA"),
    (r"\bI\.E\.\b",             "INSTITUCION EDUCATIVA"),
    (r"\bINST\.\s*EDUC\.\b",    "INSTITUCION EDUCATIVA"),
    (r"\bINST\.\b",             "INSTITUCION"),
    (r"\bCC\b",                 "CENTRO COMERCIAL"),
    (r"\bCOL\.\b",              "COLEGIO"),
    (r"\bEsc\b",                "ESCUELA"),
    (r"\bHDA\.\b",              "HACIENDA"),
    (r"\bCRA\.\b",              "CARRERA"),
    (r"\bCLL\.\b",              "CALLE"),
    (r"\bNo\s+(\d)",            r"No \1"),
]


# ── Normalisation ─────────────────────────────────────────────────────────────

def normalise(s: str) -> str:
    """Unicode NFC → strip accents → upper → collapse whitespace → strip."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    s = s.upper()
    s = re.sub(r"\s+", " ", s).strip()
    return s


def expand_abbrevs(s: str) -> str:
    for pattern, repl in ABBREV_MAP:
        s = re.sub(pattern, repl, s, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", s).strip()


def norm_expand(s: str) -> str:
    return normalise(expand_abbrevs(s))


# ── Step 1: DB snapshot ───────────────────────────────────────────────────────

def load_db_puestos(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT p.id, p.name, p."municipioId", m.name AS municipio_name,
                   p."comunaId", p.divipola, p.mesas
            FROM "Puesto" p
            JOIN "Municipio" m ON m.id = p."municipioId"
            ORDER BY m.name, p.name
        """)
        rows = cur.fetchall()
    print(f"[Step 1] DB snapshot: {len(rows)} puestos")
    return [dict(r) for r in rows]


# ── Step 2: Read + aggregate Excel ───────────────────────────────────────────

def aggregate_excel() -> dict[tuple[str, str], dict]:
    """Returns {(municipio_norm, puesto_norm): {creemos, sn, mesas, raw_muni, raw_puesto}}."""
    print(f"[Step 2] Reading {EXCEL_PATH} ...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb[SHEET_SENADO]

    agg: dict[tuple[str, str], dict] = collections.defaultdict(
        lambda: {"creemos": 0, "sn": 0, "mesas": set(), "raw_muni": "", "raw_puesto": ""}
    )

    total_rows = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            break
        dept = row[3]
        if dept != TARGET_DEPT:
            continue
        party_raw = str(row[8]).strip() if row[8] else ""
        # Normalise party name for matching
        party_norm = normalise(party_raw)
        is_creemos = "CREEMOS" in party_norm
        is_sn = "SALVACION NACIONAL" in party_norm or "SALVACI" in party_norm
        if not is_creemos and not is_sn:
            continue

        muni = str(row[4]).strip() if row[4] else ""
        puesto = str(row[5]).strip() if row[5] else ""
        mesa = row[10]
        votos = int(row[11]) if row[11] else 0

        key = (normalise(muni), normalise(puesto))
        if is_creemos:
            agg[key]["creemos"] += votos
        else:
            agg[key]["sn"] += votos
        if mesa:
            agg[key]["mesas"].add(mesa)
        agg[key]["raw_muni"] = muni
        agg[key]["raw_puesto"] = puesto
        total_rows += 1

    wb.close()
    print(f"[Step 2] Processed rows in scope: {total_rows}")
    print(f"[Step 2] Unique puesto keys: {len(agg)}")
    total_v = sum(v["creemos"] + v["sn"] for v in agg.values())
    print(f"[Step 2] Total votes (CREEMOS + SN): {total_v}")
    return dict(agg)


# ── Step 3: Mapping ───────────────────────────────────────────────────────────

def build_mapping(excel_agg: dict, db_puestos: list[dict]) -> list[dict]:
    """
    Returns list of mapping rows:
      excel_muni, excel_puesto, db_puesto_id, db_puesto_name, db_municipio_id,
      creemos, sn, mesas_historicas, confidence, method, status
    """
    # Index DB puestos by (norm_muni, norm_puesto)
    db_by_muni_puesto: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    db_by_muni: dict[str, list[dict]] = collections.defaultdict(list)
    db_muni_names: dict[str, str] = {}  # norm → raw

    for p in db_puestos:
        m_norm = normalise(p["municipio_name"])
        p_norm = normalise(p["name"])
        db_by_muni_puesto[(m_norm, p_norm)].append(p)
        db_by_muni[m_norm].append(p)
        db_muni_names[m_norm] = p["municipio_name"]

    mapping = []
    needs_review = []
    noagregados = []

    for (excel_muni_norm, excel_puesto_norm), data in excel_agg.items():
        creemos = data["creemos"]
        sn = data["sn"]
        mesas_hist = len(data["mesas"])
        raw_muni = data["raw_muni"]
        raw_puesto = data["raw_puesto"]

        # ── Mode-1: puesto name == municipio name (noagregados) ──────────────
        if excel_puesto_norm == excel_muni_norm:
            noagregados.append({
                "motivo": "noagregados",
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "note": "Puesto name equals municipio name — cannot assign to specific puesto",
            })
            continue

        # ── Find candidates in the same municipio ────────────────────────────
        candidates = db_by_muni.get(excel_muni_norm, [])
        if not candidates:
            # Try fuzzy municipio match
            all_munis = list(db_by_muni.keys())
            best_muni = rfprocess.extractOne(excel_muni_norm, all_munis, scorer=fuzz.token_set_ratio)
            if best_muni and best_muni[1] >= THRESHOLD_REVIEW:
                candidates = db_by_muni[best_muni[0]]
            else:
                noagregados.append({
                    "motivo": "municipio_not_found",
                    "excel_muni": raw_muni,
                    "excel_puesto": raw_puesto,
                    "creemos": creemos,
                    "sn": sn,
                    "mesas_historicas": mesas_hist,
                    "note": f"Municipio '{raw_muni}' not found in DB",
                })
                continue

        candidate_names = [normalise(c["name"]) for c in candidates]
        candidate_names_expanded = [norm_expand(c["name"]) for c in candidates]
        puesto_expanded = norm_expand(raw_puesto)

        # ── Exact match ──────────────────────────────────────────────────────
        exact_match = None
        if excel_puesto_norm in [normalise(c["name"]) for c in candidates]:
            idx = [normalise(c["name"]) for c in candidates].index(excel_puesto_norm)
            exact_match = candidates[idx]
        if exact_match:
            mapping.append({
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "db_puesto_id": exact_match["id"],
                "db_puesto_name": exact_match["name"],
                "db_municipio_id": exact_match["municipioId"],
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "confidence": 100,
                "method": "exact",
                "status": "ok",
            })
            continue

        # ── Abbreviation-expanded exact match ─────────────────────────────────
        if puesto_expanded in candidate_names_expanded:
            idx = candidate_names_expanded.index(puesto_expanded)
            mapping.append({
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "db_puesto_id": candidates[idx]["id"],
                "db_puesto_name": candidates[idx]["name"],
                "db_municipio_id": candidates[idx]["municipioId"],
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "confidence": 98,
                "method": "abbrev_exact",
                "status": "ok",
            })
            continue

        # ── Fuzzy match ───────────────────────────────────────────────────────
        results = rfprocess.extract(
            puesto_expanded, candidate_names_expanded,
            scorer=fuzz.token_set_ratio, limit=3
        )
        if not results:
            noagregados.append({
                "motivo": "no_fuzzy_match",
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "note": "No fuzzy match found",
            })
            continue

        best_score = results[0][1]
        best_idx = results[0][2]

        # Ambiguous: top 2 within 5 points
        if len(results) >= 2 and (results[0][1] - results[1][1]) < 5:
            needs_review.append({
                "motivo": "ambiguous_split",
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "candidates": [candidates[results[i][2]]["name"] for i in range(min(3, len(results)))],
                "scores": [results[i][1] for i in range(min(3, len(results)))],
            })
            continue

        if best_score >= THRESHOLD_AUTO:
            mapping.append({
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "db_puesto_id": candidates[best_idx]["id"],
                "db_puesto_name": candidates[best_idx]["name"],
                "db_municipio_id": candidates[best_idx]["municipioId"],
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "confidence": best_score,
                "method": "fuzzy_auto",
                "status": "ok",
            })
        elif best_score >= THRESHOLD_REVIEW:
            mapping.append({
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "db_puesto_id": candidates[best_idx]["id"],
                "db_puesto_name": candidates[best_idx]["name"],
                "db_municipio_id": candidates[best_idx]["municipioId"],
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "confidence": best_score,
                "method": "fuzzy_review",
                "status": "needs_review",
            })
        else:
            noagregados.append({
                "motivo": "low_confidence",
                "excel_muni": raw_muni,
                "excel_puesto": raw_puesto,
                "creemos": creemos,
                "sn": sn,
                "mesas_historicas": mesas_hist,
                "note": f"Best match: '{candidates[best_idx]['name']}' score={best_score}",
            })

    # Merge needs_review into noagregados for separate report
    for item in needs_review:
        item_copy = dict(item)
        item_copy["note"] = (
            f"Ambiguous: {item['candidates'][:2]} scores={item['scores'][:2]}"
        )
        del item_copy["candidates"]
        del item_copy["scores"]
        noagregados.append(item_copy)

    return mapping, noagregados


# ── Write mapping CSV ─────────────────────────────────────────────────────────

def write_mapping_csv(mapping: list[dict], noagregados: list[dict]):
    fieldnames = [
        "excel_muni", "excel_puesto", "db_puesto_id", "db_puesto_name",
        "db_municipio_id", "creemos", "sn", "mesas_historicas",
        "confidence", "method", "status",
    ]
    with open(MAPPING_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(mapping)

    na_fields = ["motivo", "excel_muni", "excel_puesto", "creemos", "sn", "mesas_historicas", "note"]
    with open(NOAGREGADOS_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=na_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(noagregados)


# ── Step 4: Validation gate ───────────────────────────────────────────────────

def print_validation_report(mapping: list[dict], noagregados: list[dict], excel_agg: dict):
    total_excel_votes = sum(v["creemos"] + v["sn"] for v in excel_agg.values())
    mapped_votes = sum(r["creemos"] + r["sn"] for r in mapping)
    na_votes = sum(r["creemos"] + r["sn"] for r in noagregados)

    ok = [r for r in mapping if r["status"] == "ok"]
    review = [r for r in mapping if r["status"] == "needs_review"]

    print("\n" + "=" * 70)
    print("VALIDATION REPORT")
    print("=" * 70)
    print(f"Excel puestos total      : {len(excel_agg)}")
    print(f"Mapped (ok)              : {len(ok)}")
    print(f"Mapped (needs_review)    : {len(review)}")
    print(f"Noagregados              : {len(noagregados)}")
    print(f"  - noagregados          : {sum(1 for r in noagregados if r['motivo']=='noagregados')}")
    print(f"  - municipio_not_found  : {sum(1 for r in noagregados if r['motivo']=='municipio_not_found')}")
    print(f"  - ambiguous_split      : {sum(1 for r in noagregados if r['motivo']=='ambiguous_split')}")
    print(f"  - low_confidence       : {sum(1 for r in noagregados if r['motivo']=='low_confidence')}")
    print(f"  - no_fuzzy_match       : {sum(1 for r in noagregados if r['motivo']=='no_fuzzy_match')}")
    print()
    print(f"Total Excel votes (scope): {total_excel_votes}")
    print(f"Votes in mapped rows     : {mapped_votes}  ({100*mapped_votes//total_excel_votes}%)")
    print(f"Votes in noagregados     : {na_votes}  ({100*na_votes//total_excel_votes}%)")
    print()
    print("Top 20 needs_review rows:")
    for r in sorted(review, key=lambda x: x["confidence"])[:20]:
        print(f"  [{int(r['confidence']):3d}] {r['excel_muni']:<20} | {r['excel_puesto']:<40} -> {r['db_puesto_name']}")
    print("=" * 70)
    print(f"Mapping CSV written to: {MAPPING_CSV}")
    print(f"Noagregados CSV written to: {NOAGREGADOS_CSV}")


# ── Compute nivelPrioridad ────────────────────────────────────────────────────

def get_prioridad_config(conn) -> dict:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute('SELECT * FROM "PrioridadConfig" ORDER BY id LIMIT 1')
        row = cur.fetchone()
    if not row:
        raise RuntimeError("PrioridadConfig row not found — run the migration first")
    return dict(row)


def compute_nivel(votos_total: int, config: dict) -> str:
    if votos_total > config["umbralAlto"]:
        return "ALTA"
    elif votos_total > config["umbralMedio"]:
        return "MEDIA"
    else:
        return "BAJA"


# ── Step 5/6: Insert / upsert PuestoPrioridad ────────────────────────────────

def upsert_batch(conn, rows: list[dict], config: dict, dry_run=False):
    now = datetime.now(tz=timezone.utc)
    with conn.cursor() as cur:
        for r in rows:
            votos_total = r["creemos"] + r["sn"]
            nivel = compute_nivel(votos_total, config)
            if dry_run:
                continue
            cur.execute("""
                INSERT INTO "PuestoPrioridad"
                    ("puestoId", "votosCreemos", "votosSN", "votosTotal",
                     "mesasHistoricas", "nivelPrioridad", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("puestoId") DO UPDATE SET
                    "votosCreemos"    = EXCLUDED."votosCreemos",
                    "votosSN"         = EXCLUDED."votosSN",
                    "votosTotal"      = EXCLUDED."votosTotal",
                    "mesasHistoricas" = EXCLUDED."mesasHistoricas",
                    "nivelPrioridad"  = EXCLUDED."nivelPrioridad",
                    "updatedAt"       = EXCLUDED."updatedAt"
            """, (
                r["db_puesto_id"], r["creemos"], r["sn"], votos_total,
                r["mesas_historicas"], nivel, now,
            ))
    if not dry_run:
        conn.commit()


def apply_mapping(conn, mapping: list[dict], config: dict, filter_muni: str | None = None):
    rows = mapping
    if filter_muni:
        rows = [r for r in mapping if normalise(r["excel_muni"]) == normalise(filter_muni)]
    print(f"[Apply] Inserting {len(rows)} rows" + (f" for {filter_muni}" if filter_muni else " (all)"))
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        upsert_batch(conn, batch, config)
    print(f"[Apply] Done.")


# ── Step 7: Verification ──────────────────────────────────────────────────────

def verify(conn, mapping: list[dict], excel_agg: dict):
    print("\n[Step 7] Verification")
    with conn.cursor() as cur:
        cur.execute('SELECT SUM("votosTotal"), COUNT(*) FROM "PuestoPrioridad"')
        db_total, db_count = cur.fetchone()

    excel_total = sum(v["creemos"] + v["sn"] for v in excel_agg.values())
    mapped_votes = sum(r["creemos"] + r["sn"] for r in mapping if r["status"] == "ok")

    print(f"  DB votosTotal SUM       : {db_total}")
    print(f"  Mapped votes (this run) : {mapped_votes}")
    print(f"  DB count                : {db_count}")

    # Smell test: max votesTotal
    with conn.cursor() as cur:
        cur.execute("""
            SELECT pp."votosTotal", p.name, m.name AS muni
            FROM "PuestoPrioridad" pp
            JOIN "Puesto" p ON p.id = pp."puestoId"
            JOIN "Municipio" m ON m.id = p."municipioId"
            ORDER BY pp."votosTotal" DESC LIMIT 5
        """)
        top = cur.fetchall()
    print("  Top 5 puestos by votos:")
    for row in top:
        print(f"    votos={row[0]:5d}  {row[2]:<20} | {row[1]}")

    # Spot-check 30 random rows
    ok_rows = [r for r in mapping if r["status"] == "ok"]
    sample = random.sample(ok_rows, min(30, len(ok_rows)))
    errors = 0
    for r in sample:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "votosCreemos", "votosSN" FROM "PuestoPrioridad" WHERE "puestoId" = %s',
                (r["db_puesto_id"],)
            )
            row = cur.fetchone()
        if not row:
            print(f"  SPOT-CHECK FAIL: puestoId={r['db_puesto_id']} not found in DB")
            errors += 1
        elif row[0] != r["creemos"] or row[1] != r["sn"]:
            print(f"  SPOT-CHECK MISMATCH: puestoId={r['db_puesto_id']} "
                  f"expected c={r['creemos']} s={r['sn']} got c={row[0]} s={row[1]}")
            errors += 1
    print(f"  Spot-check (30 random): {30-errors}/30 correct")


# ── Report ────────────────────────────────────────────────────────────────────

def write_report(mapping: list[dict], noagregados: list[dict], excel_agg: dict):
    ok_count = sum(1 for r in mapping if r["status"] == "ok")
    review_count = sum(1 for r in mapping if r["status"] == "needs_review")
    total_excel = sum(v["creemos"] + v["sn"] for v in excel_agg.values())
    mapped_votes = sum(r["creemos"] + r["sn"] for r in mapping)

    motivo_counts = collections.Counter(r["motivo"] for r in noagregados)

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write(f"# Reporte de Importación Prioridades — {datetime.now():%Y-%m-%d %H:%M}\n\n")
        f.write(f"## Resumen\n\n")
        f.write(f"| Métrica | Valor |\n|---|---|\n")
        f.write(f"| Total puestos Excel (Antioquia CREEMOS+SN) | {len(excel_agg)} |\n")
        f.write(f"| Mapeados OK | {ok_count} |\n")
        f.write(f"| Mapeados (needs_review) | {review_count} |\n")
        f.write(f"| Noagregados | {len(noagregados)} |\n")
        f.write(f"| Total votos Excel | {total_excel:,} |\n")
        f.write(f"| Votos mapeados | {mapped_votes:,} ({100*mapped_votes//total_excel}%) |\n\n")
        f.write(f"## Noagregados por motivo\n\n")
        for motivo, cnt in motivo_counts.most_common():
            f.write(f"- {motivo}: {cnt}\n")
        f.write(f"\nVer `noagregados_prioridad.csv` para detalle.\n")

    print(f"[Report] Written to {REPORT_MD}")


# ── Main ──────────────────────────────────────────────────────────────────────

def get_db_conn(env_file: str | None) -> psycopg2.extensions.connection:
    if env_file and os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    url = line[len("DATABASE_URL="):].strip()
                    print(f"[DB] Connecting via DATABASE_URL from {env_file}")
                    return psycopg2.connect(url)
    # Fallback: check environment
    url = os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_DATABASE_URL")
    if url:
        return psycopg2.connect(url)
    raise RuntimeError(
        "No DATABASE_URL found. Pass --env-file backend/.env.local "
        "or set DATABASE_URL env var."
    )


def main():
    parser = argparse.ArgumentParser(description="Import priority data from Excel")
    parser.add_argument("--env-file", default="backend/.env.local")
    parser.add_argument("--pilot-only", action="store_true",
                        help=f"Only insert pilot municipio ({PILOT_MUNICIPIO})")
    parser.add_argument("--skip-confirm", action="store_true",
                        help="Skip the 'apply? [y/N]' prompt")
    parser.add_argument("--no-insert", action="store_true",
                        help="Build mapping only, do not write to DB")
    args = parser.parse_args()

    # ── Step 1 ────────────────────────────────────────────────────────────────
    conn = get_db_conn(args.env_file)
    db_puestos = load_db_puestos(conn)

    # Save snapshot
    snapshot_path = Path(__file__).parent / "snapshot_pre.json"
    with open(snapshot_path, "w", encoding="utf-8") as f:
        json.dump(db_puestos, f, default=str, indent=2, ensure_ascii=False)
    print(f"[Step 1] Snapshot saved: {snapshot_path}")

    # ── Step 2 ────────────────────────────────────────────────────────────────
    excel_agg = aggregate_excel()

    # ── Step 3 ────────────────────────────────────────────────────────────────
    print("[Step 3] Building mapping...")
    mapping, noagregados = build_mapping(excel_agg, db_puestos)
    write_mapping_csv(mapping, noagregados)

    # ── Step 4 ────────────────────────────────────────────────────────────────
    print_validation_report(mapping, noagregados, excel_agg)

    if args.no_insert:
        print("[Done] --no-insert: mapping built, no DB writes.")
        write_report(mapping, noagregados, excel_agg)
        conn.close()
        return

    if not args.skip_confirm:
        answer = input("\nApply to DB? [y/N] ").strip().lower()
        if answer != "y":
            print("Aborted.")
            conn.close()
            return

    # ── Step 5: Pilot ─────────────────────────────────────────────────────────
    config = get_prioridad_config(conn)
    print(f"\n[Step 5] Pilot: {PILOT_MUNICIPIO}")
    apply_mapping(conn, mapping, config, filter_muni=PILOT_MUNICIPIO)

    # ── Step 6: Full apply ────────────────────────────────────────────────────
    if not args.pilot_only:
        print("[Step 6] Full apply (all municipios)")
        apply_mapping(conn, mapping, config, filter_muni=None)
    else:
        print("[Done] --pilot-only: only inserted pilot municipio.")

    # ── Step 7: Verification ──────────────────────────────────────────────────
    verify(conn, mapping, excel_agg)

    # ── Step 8: Report ────────────────────────────────────────────────────────
    write_report(mapping, noagregados, excel_agg)

    conn.close()
    print("\n[Done] Import complete.")


if __name__ == "__main__":
    main()
