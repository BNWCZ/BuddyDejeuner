import json
from datetime import date
from pathlib import Path

import streamlit as st

RESTAURANTS_FILE = Path("data/restaurants.json")
VOTES_DIR = Path("data/votes")


def load_restaurants():
    if RESTAURANTS_FILE.exists():
        return json.loads(RESTAURANTS_FILE.read_text(encoding="utf-8"))
    return []


def votes_file_for_today():
    return VOTES_DIR / f"{date.today().isoformat()}.json"


def load_votes():
    path = votes_file_for_today()
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_votes(votes):
    VOTES_DIR.mkdir(parents=True, exist_ok=True)
    votes_file_for_today().write_text(json.dumps(votes, indent=2, ensure_ascii=False), encoding="utf-8")


st.title("BuddyDejeuner")
st.caption(f"Sondage du {date.today().strftime('%d/%m/%Y')}")

# --- Step 1: Enter name ---
if "user_name" not in st.session_state:
    st.session_state.user_name = ""

name = st.text_input("Ton prénom", value=st.session_state.user_name)
st.session_state.user_name = name

if not name.strip():
    st.warning("Entre ton prénom pour participer.")
    st.stop()

name = name.strip()

# --- Step 2: Load data ---
restaurants = load_restaurants()
votes = load_votes()

if not restaurants:
    st.info("Aucun restaurant configuré. Demande à l'admin d'en ajouter.")
    st.stop()

# --- Step 3: Vote ---
st.subheader("Où veux-tu déjeuner ?")

my_votes = votes.get(name, [])

for r in restaurants:
    checked = r["id"] in my_votes
    if st.checkbox(r["name"], value=checked, key=f"vote_{r['id']}"):
        if r["id"] not in my_votes:
            my_votes.append(r["id"])
    else:
        if r["id"] in my_votes:
            my_votes.remove(r["id"])

votes[name] = my_votes
save_votes(votes)

# --- Step 4: Show matches ---
st.subheader("Tes buddies")

if not my_votes:
    st.info("Sélectionne au moins un restaurant pour voir tes buddies.")
else:
    for r in restaurants:
        if r["id"] not in my_votes:
            continue
        buddies = [v_name for v_name, v_picks in votes.items() if r["id"] in v_picks and v_name != name]
        if buddies:
            st.success(f"**{r['name']}** — {', '.join(buddies)} aussi !")
        else:
            st.write(f"**{r['name']}** — personne d'autre pour le moment")
