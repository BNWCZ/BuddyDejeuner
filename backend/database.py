import json
import sqlite3
import uuid
from datetime import date
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "buddydejeuner.db"
SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "restaurants.json"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS restaurants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT DEFAULT '',
            tags TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS votes (
            date TEXT NOT NULL,
            user_name TEXT NOT NULL,
            restaurant_id TEXT NOT NULL,
            PRIMARY KEY (date, user_name, restaurant_id)
        );
        CREATE TABLE IF NOT EXISTS foodtruck_cache (
            date TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT DEFAULT '',
            tags TEXT DEFAULT '',
            PRIMARY KEY (date, id)
        );
    """)

    # Seed from JSON if table is empty and seed file exists
    count = conn.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0]
    if count == 0 and SEED_FILE.exists():
        restaurants = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        for r in restaurants:
            tags = ", ".join(r.get("tags", []))
            conn.execute(
                "INSERT INTO restaurants (id, name, address, tags) VALUES (?, ?, ?, ?)",
                (r["id"], r["name"], r.get("address", ""), tags),
            )
    conn.commit()
    conn.close()


# --- Restaurants ---

def get_restaurants():
    conn = get_db()
    rows = conn.execute("SELECT * FROM restaurants").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_restaurant(name):
    rid = str(uuid.uuid4())[:8]
    conn = get_db()
    conn.execute("INSERT INTO restaurants (id, name) VALUES (?, ?)", (rid, name.strip()))
    conn.commit()
    conn.close()
    return rid


def update_restaurant(rid, name, address, tags):
    conn = get_db()
    conn.execute(
        "UPDATE restaurants SET name=?, address=?, tags=? WHERE id=?",
        (name.strip(), address.strip(), tags.strip(), rid),
    )
    conn.commit()
    conn.close()


def delete_restaurant(rid):
    conn = get_db()
    conn.execute("DELETE FROM restaurants WHERE id=?", (rid,))
    conn.commit()
    conn.close()


# --- Votes ---

def get_votes(vote_date=None):
    if vote_date is None:
        vote_date = date.today().isoformat()
    conn = get_db()
    rows = conn.execute("SELECT user_name, restaurant_id FROM votes WHERE date=?", (vote_date,)).fetchall()
    conn.close()
    result = {}
    for row in rows:
        result.setdefault(row["user_name"], []).append(row["restaurant_id"])
    return result


def set_votes(user_name, restaurant_ids, vote_date=None):
    if vote_date is None:
        vote_date = date.today().isoformat()
    conn = get_db()
    conn.execute("DELETE FROM votes WHERE date=? AND user_name=?", (vote_date, user_name))
    for rid in restaurant_ids:
        conn.execute(
            "INSERT INTO votes (date, user_name, restaurant_id) VALUES (?, ?, ?)",
            (vote_date, user_name, rid),
        )
    conn.commit()
    conn.close()


# --- Food truck cache ---

def get_cached_foodtrucks(cache_date=None):
    if cache_date is None:
        cache_date = date.today().isoformat()
    conn = get_db()
    rows = conn.execute("SELECT * FROM foodtruck_cache WHERE date=?", (cache_date,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_foodtrucks(trucks, cache_date=None):
    if cache_date is None:
        cache_date = date.today().isoformat()
    conn = get_db()
    for t in trucks:
        conn.execute(
            "INSERT OR REPLACE INTO foodtruck_cache (date, id, name, address, tags) VALUES (?, ?, ?, ?, ?)",
            (cache_date, t["id"], t["name"], t["address"], t["tags"]),
        )
    conn.commit()
    conn.close()


def update_foodtruck_tags(truck_id, tags, cache_date=None):
    if cache_date is None:
        cache_date = date.today().isoformat()
    conn = get_db()
    conn.execute(
        "UPDATE foodtruck_cache SET tags=? WHERE date=? AND id=?",
        (tags.strip(), cache_date, truck_id),
    )
    conn.commit()
    conn.close()
