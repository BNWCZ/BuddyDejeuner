from datetime import date

import streamlit as st

st.title("BuddyDejeuner")
st.caption(f"Sondage du {date.today().strftime('%d/%m/%Y')}")

if "user_name" not in st.session_state:
    st.session_state.user_name = ""

name = st.text_input("Ton prénom", value=st.session_state.user_name)
st.session_state.user_name = name

if name.strip():
    st.success(f"Bienvenue {name.strip()} ! Utilise le menu à gauche pour voter ou voir les résultats.")
else:
    st.info("Entre ton prénom pour commencer.")
