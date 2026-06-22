import json
import uuid
from pathlib import Path

import streamlit as st

RESTAURANTS_FILE = Path("data/restaurants.json")


def load_restaurants():
    if RESTAURANTS_FILE.exists():
        return json.loads(RESTAURANTS_FILE.read_text(encoding="utf-8"))
    return []


def save_restaurants(restaurants):
    RESTAURANTS_FILE.write_text(json.dumps(restaurants, indent=2, ensure_ascii=False), encoding="utf-8")


st.title("Admin — Gestion des restaurants")

restaurants = load_restaurants()

# --- Add a restaurant ---
st.subheader("Ajouter un restaurant")
new_name = st.text_input("Nom du restaurant")
if st.button("Ajouter") and new_name.strip():
    restaurants.append({"id": str(uuid.uuid4())[:8], "name": new_name.strip()})
    save_restaurants(restaurants)
    st.rerun()

# --- Current list ---
st.subheader("Restaurants actuels")
if not restaurants:
    st.info("Aucun restaurant pour le moment.")
else:
    for r in restaurants:
        col1, col2 = st.columns([4, 1])
        col1.write(r["name"])
        if col2.button("Supprimer", key=f"del_{r['id']}"):
            restaurants = [x for x in restaurants if x["id"] != r["id"]]
            save_restaurants(restaurants)
            st.rerun()
