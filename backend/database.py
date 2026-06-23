import random
import secrets
import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "buddydejeuner.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    needs_migration = False
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(team_members)").fetchall()]
        needs_migration = "user_name" in cols and "user_id" not in cols
    except Exception:
        pass

    if needs_migration:
        _migrate_to_user_ids(conn)
    else:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                invite_code TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS team_members (
                team_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                PRIMARY KEY (team_id, user_id),
                UNIQUE (team_id, display_name)
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
                user_id TEXT NOT NULL,
                restaurant_id TEXT NOT NULL,
                PRIMARY KEY (date, team_id, user_id, restaurant_id)
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


def _migrate_to_user_ids(conn):
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    rows = conn.execute("SELECT DISTINCT user_name FROM team_members").fetchall()
    name_to_uid = {}
    for row in rows:
        name = row["user_name"]
        uid = _generate_battletag(conn, name)
        conn.execute("INSERT INTO users (id) VALUES (?)", (uid,))
        name_to_uid[name] = uid

    conn.execute("""
        CREATE TABLE team_members_new (
            team_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            PRIMARY KEY (team_id, user_id),
            UNIQUE (team_id, display_name)
        )
    """)
    for m in conn.execute("SELECT team_id, user_name FROM team_members").fetchall():
        conn.execute(
            "INSERT INTO team_members_new (team_id, user_id, display_name, is_admin) VALUES (?, ?, ?, 0)",
            (m["team_id"], name_to_uid[m["user_name"]], m["user_name"]),
        )

    conn.execute("""
        CREATE TABLE votes_new (
            date TEXT NOT NULL,
            team_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            restaurant_id TEXT NOT NULL,
            PRIMARY KEY (date, team_id, user_id, restaurant_id)
        )
    """)
    for v in conn.execute("SELECT date, team_id, user_name, restaurant_id FROM votes").fetchall():
        uid = name_to_uid.get(v["user_name"])
        if uid:
            conn.execute(
                "INSERT OR IGNORE INTO votes_new (date, team_id, user_id, restaurant_id) VALUES (?, ?, ?, ?)",
                (v["date"], v["team_id"], uid, v["restaurant_id"]),
            )

    conn.execute("DROP TABLE team_members")
    conn.execute("DROP TABLE votes")
    conn.execute("ALTER TABLE team_members_new RENAME TO team_members")
    conn.execute("ALTER TABLE votes_new RENAME TO votes")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.commit()

    log_path = DATA_DIR / "migration.log"
    with open(log_path, "w") as f:
        f.write(f"Migration completed at {datetime.now().isoformat()}\n")
        f.write("User mappings (name -> battletag):\n")
        for name, uid in sorted(name_to_uid.items()):
            f.write(f"  {name} -> {uid}\n")


def _generate_battletag(conn, name):
    disc = f"{random.randint(0, 9999):04d}"
    tag = f"{name}#{disc}"
    while conn.execute("SELECT 1 FROM users WHERE id=?", (tag,)).fetchone():
        disc = f"{random.randint(0, 9999):04d}"
        tag = f"{name}#{disc}"
    return tag


# --- Users ---

def create_user(name):
    name = name.strip()
    conn = get_db()
    tag = _generate_battletag(conn, name)
    conn.execute("INSERT INTO users (id) VALUES (?)", (tag,))
    conn.commit()
    conn.close()
    return tag


def get_user(user_id):
    conn = get_db()
    row = conn.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    return {"id": row["id"]} if row else None


def get_user_teams(user_id):
    conn = get_db()
    rows = conn.execute("""
        SELECT t.id, t.name, t.invite_code, tm.display_name, tm.is_admin
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ?
    """, (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Recovery ---

def recover_by_team_name(team_name):
    conn = get_db()
    matched = conn.execute(
        "SELECT * FROM teams WHERE name = ? COLLATE NOCASE", (team_name.strip(),)
    ).fetchall()
    if not matched:
        conn.close()
        return None
    if len(matched) > 1:
        conn.close()
        return {"error": "multiple_teams"}
    team = matched[0]
    members = conn.execute(
        "SELECT display_name, is_admin FROM team_members WHERE team_id=?", (team["id"],)
    ).fetchall()
    conn.close()
    return {"team_id": team["id"], "team_name": team["name"],
            "members": [{"display_name": m["display_name"], "is_admin": bool(m["is_admin"])} for m in members]}


def recover_by_invite_code(invite_code):
    conn = get_db()
    team = conn.execute(
        "SELECT * FROM teams WHERE invite_code=?", (invite_code.strip().upper(),)
    ).fetchone()
    if not team:
        conn.close()
        return None
    members = conn.execute(
        "SELECT display_name, is_admin FROM team_members WHERE team_id=?", (team["id"],)
    ).fetchall()
    conn.close()
    return {"team_id": team["id"], "team_name": team["name"],
            "members": [{"display_name": m["display_name"], "is_admin": bool(m["is_admin"])} for m in members]}


def recover_confirm(team_id, display_name, provided_user_id=None):
    conn = get_db()
    member = conn.execute(
        "SELECT user_id, is_admin FROM team_members WHERE team_id=? AND display_name=?",
        (team_id, display_name.strip()),
    ).fetchone()
    if not member:
        conn.close()
        return None
    if member["is_admin"] and provided_user_id != member["user_id"]:
        conn.close()
        return {"error": "admin_verification_required"}
    uid = member["user_id"]
    teams = _user_teams(conn, uid)
    conn.close()
    return {"user_id": uid, "teams": teams}


def _user_teams(conn, user_id):
    rows = conn.execute("""
        SELECT t.id, t.name, t.invite_code, tm.display_name, tm.is_admin
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ?
    """, (user_id,)).fetchall()
    return [dict(r) for r in rows]


# --- Teams ---

def create_team(name, user_id, display_name):
    team_id = str(uuid.uuid4())[:8]
    invite_code = secrets.token_hex(3).upper()
    conn = get_db()
    conn.execute(
        "INSERT INTO teams (id, name, invite_code) VALUES (?, ?, ?)",
        (team_id, name.strip(), invite_code),
    )
    conn.execute(
        "INSERT INTO team_members (team_id, user_id, display_name, is_admin) VALUES (?, ?, ?, 1)",
        (team_id, user_id, display_name.strip()),
    )
    conn.commit()
    conn.close()
    return {"id": team_id, "name": name.strip(), "invite_code": invite_code}


def join_team(invite_code, user_id, display_name):
    conn = get_db()
    team = conn.execute(
        "SELECT * FROM teams WHERE invite_code=?", (invite_code.strip().upper(),)
    ).fetchone()
    if not team:
        conn.close()
        return None

    existing_name = conn.execute(
        "SELECT 1 FROM team_members WHERE team_id=? AND display_name=?",
        (team["id"], display_name.strip()),
    ).fetchone()
    if existing_name:
        conn.close()
        return {"error": "username_taken"}

    already_in = conn.execute(
        "SELECT 1 FROM team_members WHERE team_id=? AND user_id=?",
        (team["id"], user_id),
    ).fetchone()
    if already_in:
        conn.close()
        return {"error": "already_member"}

    conn.execute(
        "INSERT INTO team_members (team_id, user_id, display_name, is_admin) VALUES (?, ?, ?, 0)",
        (team["id"], user_id, display_name.strip()),
    )
    conn.commit()
    conn.close()
    return {"id": team["id"], "name": team["name"], "invite_code": team["invite_code"]}


def get_team(team_id):
    conn = get_db()
    team = conn.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
    if not team:
        conn.close()
        return None
    members = conn.execute(
        "SELECT display_name, is_admin FROM team_members WHERE team_id=?", (team_id,)
    ).fetchall()
    conn.close()
    return {
        "id": team["id"], "name": team["name"], "invite_code": team["invite_code"],
        "members": [{"display_name": m["display_name"], "is_admin": bool(m["is_admin"])} for m in members],
    }


# --- Admin ---

def get_team_admin_data(team_id, user_id):
    conn = get_db()
    me = conn.execute(
        "SELECT is_admin FROM team_members WHERE team_id=? AND user_id=?",
        (team_id, user_id),
    ).fetchone()
    if not me or not me["is_admin"]:
        conn.close()
        return None
    team = conn.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
    members = conn.execute(
        "SELECT display_name, is_admin FROM team_members WHERE team_id=?", (team_id,)
    ).fetchall()
    conn.close()
    return {
        "team": {"id": team["id"], "name": team["name"], "invite_code": team["invite_code"]},
        "members": [{"display_name": m["display_name"], "is_admin": bool(m["is_admin"])} for m in members],
    }


def update_team_admin(team_id, user_id, name=None, regenerate_code=False):
    conn = get_db()
    me = conn.execute(
        "SELECT is_admin FROM team_members WHERE team_id=? AND user_id=?",
        (team_id, user_id),
    ).fetchone()
    if not me or not me["is_admin"]:
        conn.close()
        return None
    if name:
        conn.execute("UPDATE teams SET name=? WHERE id=?", (name.strip(), team_id))
    if regenerate_code:
        conn.execute("UPDATE teams SET invite_code=? WHERE id=?", (secrets.token_hex(3).upper(), team_id))
    conn.commit()
    team = conn.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
    conn.close()
    return {"id": team["id"], "name": team["name"], "invite_code": team["invite_code"]}


def remove_team_member(team_id, admin_user_id, display_name):
    conn = get_db()
    me = conn.execute(
        "SELECT is_admin FROM team_members WHERE team_id=? AND user_id=?",
        (team_id, admin_user_id),
    ).fetchone()
    if not me or not me["is_admin"]:
        conn.close()
        return False
    target = conn.execute(
        "SELECT user_id, is_admin FROM team_members WHERE team_id=? AND display_name=?",
        (team_id, display_name),
    ).fetchone()
    if not target or target["is_admin"]:
        conn.close()
        return False
    conn.execute("DELETE FROM team_members WHERE team_id=? AND display_name=?", (team_id, display_name))
    conn.execute("DELETE FROM votes WHERE team_id=? AND user_id=?", (team_id, target["user_id"]))
    conn.commit()
    conn.close()
    return True


def delete_team(team_id, user_id):
    conn = get_db()
    me = conn.execute(
        "SELECT is_admin FROM team_members WHERE team_id=? AND user_id=?",
        (team_id, user_id),
    ).fetchone()
    if not me or not me["is_admin"]:
        conn.close()
        return False
    conn.execute("DELETE FROM votes WHERE team_id=?", (team_id,))
    conn.execute("DELETE FROM restaurants WHERE team_id=?", (team_id,))
    conn.execute("DELETE FROM team_members WHERE team_id=?", (team_id,))
    conn.execute("DELETE FROM teams WHERE id=?", (team_id,))
    conn.commit()
    conn.close()
    return True


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
    rows = conn.execute("""
        SELECT tm.display_name, v.restaurant_id
        FROM votes v
        JOIN team_members tm ON tm.team_id = v.team_id AND tm.user_id = v.user_id
        WHERE v.team_id=? AND v.date=?
    """, (team_id, vote_date)).fetchall()
    conn.close()
    result = {}
    for row in rows:
        result.setdefault(row["display_name"], []).append(row["restaurant_id"])
    return result


def set_votes(team_id, user_id, restaurant_ids, vote_date=None):
    if vote_date is None:
        vote_date = date.today().isoformat()
    conn = get_db()
    conn.execute("DELETE FROM votes WHERE team_id=? AND date=? AND user_id=?", (team_id, vote_date, user_id))
    for rid in restaurant_ids:
        conn.execute(
            "INSERT INTO votes (date, team_id, user_id, restaurant_id) VALUES (?, ?, ?, ?)",
            (vote_date, team_id, user_id, rid),
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
