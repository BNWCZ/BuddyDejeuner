import hashlib
import json
import uuid
from datetime import date
from pathlib import Path

import streamlit as st

RESTAURANTS_FILE = Path("data/restaurants.json")
VOTES_DIR = Path("data/votes")
FOODTRUCK_URL = "https://www.parisladefense.com/fr/activites/food-trucks"
DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def load_restaurants():
    if RESTAURANTS_FILE.exists():
        restaurants = json.loads(RESTAURANTS_FILE.read_text(encoding="utf-8"))
        for r in restaurants:
            r.setdefault("address", "")
            r.setdefault("tags", [])
        return restaurants
    return []


def save_restaurants(restaurants):
    RESTAURANTS_FILE.write_text(json.dumps(restaurants, indent=2, ensure_ascii=False), encoding="utf-8")


def add_restaurant(name):
    restaurants = load_restaurants()
    restaurants.append({"id": str(uuid.uuid4())[:8], "name": name.strip(), "address": "", "tags": []})
    save_restaurants(restaurants)


def votes_file_for_today():
    return VOTES_DIR / f"{date.today().isoformat()}.json"


def load_votes():
    path = votes_file_for_today()
    if path.exists():
        content = path.read_text(encoding="utf-8").strip()
        if content:
            return json.loads(content)
    return {}


def save_votes(votes):
    VOTES_DIR.mkdir(parents=True, exist_ok=True)
    votes_file_for_today().write_text(json.dumps(votes, indent=2, ensure_ascii=False), encoding="utf-8")


def scrape_foodtrucks_today():
    from playwright.sync_api import sync_playwright

    today_day = DAYS_FR[date.today().weekday()]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(FOODTRUCK_URL, wait_until="networkidle")
        groups = page.evaluate('''() => {
            const groups = document.querySelectorAll(".paragraphRemonteeCard");
            const results = [];
            for (const group of groups) {
                const h3 = group.querySelector("h3");
                const day = h3 ? h3.textContent.trim() : "";
                const cards = group.querySelectorAll("article.pld-content-card");
                const trucks = [];
                for (const card of cards) {
                    const name = card.querySelector("h5")?.textContent?.trim() || "";
                    const locEl = card.querySelector(".pld-content-card__location");
                    const loc = locEl ? locEl.textContent.replace("Lieu :", "").trim() : "";
                    const cuisine = card.querySelector(".pld-taxonomy-tag a")?.textContent?.trim() || "";
                    trucks.push({name, location: loc, cuisine});
                }
                results.push({day, trucks});
            }
            return results;
        }''')
        browser.close()

    for group in groups:
        if group["day"] == today_day:
            return [
                t for t in group["trucks"]
                if "Cours Valmy" not in t["location"]
            ]
    return []


def load_foodtrucks():
    cache_file = VOTES_DIR / f"foodtrucks-{date.today().isoformat()}.json"
    if cache_file.exists():
        content = cache_file.read_text(encoding="utf-8").strip()
        if content:
            return json.loads(content)

    trucks = scrape_foodtrucks_today()
    results = []
    for t in trucks:
        truck_id = "ft-" + hashlib.md5(t["name"].encode()).hexdigest()[:6]
        tags = [t["cuisine"]] if t["cuisine"] else []
        tags.append("food-truck")
        results.append({
            "id": truck_id,
            "name": t["name"],
            "address": t["location"],
            "tags": tags,
        })

    VOTES_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    return results


def load_all_restaurants():
    return load_restaurants() + load_foodtrucks()


def require_username():
    if not st.session_state.get("user_name", "").strip():
        st.warning("Entre ton prénom sur la page d'accueil pour participer.")
        st.stop()
    return st.session_state["user_name"].strip()
