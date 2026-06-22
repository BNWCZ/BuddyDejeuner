import streamlit as st
from data_utils import load_restaurants, save_restaurants, add_restaurant, require_username

require_username()

st.title("Restaurants")

# --- Add ---
st.subheader("Ajouter un restaurant")
new_name = st.text_input("Nom du restaurant")
if st.button("Ajouter") and new_name.strip():
    add_restaurant(new_name)
    st.rerun()

# --- List & Edit ---
st.subheader("Liste des restaurants")
restaurants = load_restaurants()

if not restaurants:
    st.info("Aucun restaurant pour le moment.")
    st.stop()

for r in restaurants:
    with st.expander(r["name"]):
        address = st.text_input("Adresse", value=r.get("address", ""), key=f"addr_{r['id']}")
        tags_str = st.text_input("Tags (séparés par des virgules)", value=", ".join(r.get("tags", [])), key=f"tags_{r['id']}")

        col_save, col_del = st.columns([1, 1])
        if col_save.button("Enregistrer", key=f"save_{r['id']}"):
            r["address"] = address.strip()
            r["tags"] = [t.strip() for t in tags_str.split(",") if t.strip()]
            save_restaurants(restaurants)
            st.rerun()
        if col_del.button("Supprimer", key=f"del_{r['id']}"):
            restaurants = [x for x in restaurants if x["id"] != r["id"]]
            save_restaurants(restaurants)
            st.rerun()
