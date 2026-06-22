import streamlit as st
from data_utils import load_all_restaurants, load_votes, require_username

require_username()

st.title("Résultats")

restaurants = load_all_restaurants()
votes = load_votes()
restaurant_by_id = {r["id"]: r["name"] for r in restaurants}

if not votes:
    st.info("Personne n'a encore voté aujourd'hui.")
    st.stop()

tab_resto, tab_person = st.tabs(["Par restaurant", "Par personne"])

with tab_resto:
    for r in restaurants:
        voters = [name for name, picks in votes.items() if r["id"] in picks]
        if voters:
            st.write(f"**{r['name']}** ({len(voters)}) — {', '.join(voters)}")

with tab_person:
    for person, picks in sorted(votes.items()):
        pick_names = [restaurant_by_id[rid] for rid in picks if rid in restaurant_by_id]
        if pick_names:
            st.write(f"**{person}** — {', '.join(pick_names)}")
