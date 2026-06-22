import streamlit as st
from data_utils import load_all_restaurants, load_votes, save_votes, require_username

name = require_username()

st.title("Vote")

restaurants = load_all_restaurants()
votes = load_votes()

if not restaurants:
    st.info("Aucun restaurant configuré. Ajoute-en sur la page Restaurants.")
    st.stop()

my_votes = votes.get(name, [])

for r in restaurants:
    tags_str = "  ".join(f"`{t}`" for t in r.get("tags", []))
    label = f"{r['name']}  {tags_str}" if tags_str else r["name"]
    checked = r["id"] in my_votes
    if st.checkbox(label, value=checked, key=f"vote_{r['id']}"):
        if r["id"] not in my_votes:
            my_votes.append(r["id"])
    else:
        if r["id"] in my_votes:
            my_votes.remove(r["id"])

votes[name] = my_votes
save_votes(votes)
