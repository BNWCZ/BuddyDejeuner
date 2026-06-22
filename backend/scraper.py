import hashlib
from datetime import date

from playwright.sync_api import sync_playwright

FOODTRUCK_URL = "https://www.parisladefense.com/fr/activites/food-trucks"
DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def scrape_foodtrucks_today():
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


def get_todays_foodtrucks():
    from backend.database import get_cached_foodtrucks, save_foodtrucks

    cached = get_cached_foodtrucks()
    if cached:
        return cached

    trucks = scrape_foodtrucks_today()
    results = []
    for t in trucks:
        truck_id = "ft-" + hashlib.md5(t["name"].encode()).hexdigest()[:6]
        tags_parts = [t["cuisine"]] if t["cuisine"] else []
        if t["location"]:
            tags_parts.append(t["location"])
        results.append({
            "id": truck_id,
            "name": t["name"],
            "address": t["location"],
            "tags": ", ".join(tags_parts),
        })

    if results:
        save_foodtrucks(results)
    return results
