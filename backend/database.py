import secrets
import sqlite3
import uuid
from datetime import date
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "buddydejeuner.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            invite_code TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            PRIMARY KEY (team_id, user_name)
        );
        CREATE TABLE IF NOT EXISTS restaurants (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT DEFAULT '',
            tags TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS votes (
            date TEXT NOT NULL,
            team_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            restaurant_id TEXT NOT NULL,
            PRIMARY KEY (date, team_id, user_name, restaurant_id)
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
    conn.commit()
    conn.close()


# --- Teams ---

def create_team(name, user_name):
    team_id = str(uuid.uuid4())[:8]
    invite_code = secrets.token_hex(3).upper()
    conn = get_db()
    conn.execute("INSERT INTO teams (id, name, invite_code) VALUES (?, ?, ?)", (team_id, name.strip(), invite_code))
    conn.execute("INSERT INTO team_members (team_id, user_name) VALUES (?, ?)", (team_id, user_name.strip()))
    conn.commit()
    conn.close()
    return {"id": team_id, "name": name.strip(), "invite_code": invite_code}


def join_team(invite_code, user_name):
    conn = get_db()
    team = conn.execute("SELECT * FROM teams WHERE invite_code=?", (invite_code.strip().upper(),)).fetchone()
    if not team:
        conn.close()
        return None

    existing = conn.execute(
        "SELECT 1 FROM team_members WHERE team_id=? AND user_name=?",
        (team["id"], user_name.strip()),
    ).fetchone()
    if existing:
        conn.close()
        return {"error": "username_taken"}

    conn.execute("INSERT INTO team_members (team_id, user_name) VALUES (?, ?)", (team["id"], user_name.strip()))
    conn.commit()
    conn.close()
    return {"id": team["id"], "name": team["name"], "invite_code": team["invite_code"]}


def get_team(team_id):
    conn = get_db()
    team = conn.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
    if not team:
        conn.close()
        return None
    members = conn.execute("SELECT user_name FROM team_members WHERE team_id=?", (team_id,)).fetchall()
    conn.close()
    return {"id": team["id"], "name": team["name"], "invite_code": team["invite_code"], "members": [m["user_name"] for m in members]}


# --- Restaurants (team-scoped) ---

def get_restaurants(team_id):
    conn = get_db()
    rows = conn.execute("SELECT id, name, address, tags FROM restaurants WHERE team_id=?", (team_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_restaurant(team_id, name):
    rid = str(uuid.uuid4())[:8]
    conn = get_db()
    conn.execute("INSERT INTO restaurants (id, team_id, name) VALUES (?, ?, ?)", (rid, team_id, name.strip()))
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


# --- Votes (team-scoped) ---

def get_votes(team_id, vote_date=None):
    if vote_date is None:
        vote_date = date.today().isoformat()
    conn = get_db()
    rows = conn.execute(
        "SELECT user_name, restaurant_id FROM votes WHERE team_id=? AND date=?",
        (team_id, vote_date),
    ).fetchall()
    conn.close()
    result = {}
    for row in rows:
        result.setdefault(row["user_name"], []).append(row["restaurant_id"])
    return result


def set_votes(team_id, user_name, restaurant_ids, vote_date=None):
    if vote_date is None:
        vote_date = date.today().isoformat()
    conn = get_db()
    conn.execute("DELETE FROM votes WHERE team_id=? AND date=? AND user_name=?", (team_id, vote_date, user_name))
    for rid in restaurant_ids:
        conn.execute(
            "INSERT INTO votes (date, team_id, user_name, restaurant_id) VALUES (?, ?, ?, ?)",
            (vote_date, team_id, user_name, rid),
        )
    conn.commit()
    conn.close()


# --- Food truck cache (global) ---

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
