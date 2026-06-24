import hashlib
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

FOODTRUCK_URL = "https://www.parisladefense.com/fr/activites/food-trucks"
DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def _scrape_groups():
    """Scrape the page and return [{day, trucks: [{name, location, cuisine}]}]."""
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
    return groups


def _day_index(day_text):
    s = day_text.strip().lower()
    for i, d in enumerate(DAYS_FR):
        if s.startswith(d.lower()):
            return i
    return None


def scrape_foodtrucks_week():
    """Scrape the whole published week and cache each day's trucks by date.

    The site publishes a day-by-day schedule for the entire week, so we map each
    day group (Lundi..Dimanche) onto the matching date of the current week and
    store every truck with its raw location. No location filtering happens here;
    that is decided per team at read time.
    """
    from backend.database import save_week_foodtrucks

    monday = date.today() - timedelta(days=date.today().weekday())
    groups = _scrape_groups()

    by_date = {}
    for group in groups:
        idx = _day_index(group["day"])
        if idx is None:
            continue
        day_date = (monday + timedelta(days=idx)).isoformat()
        results = []
        for t in group["trucks"]:
            if not t["name"]:
                continue
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
        by_date[day_date] = results

    save_week_foodtrucks(by_date)
    return by_date


def get_todays_foodtrucks():
    """Return today's cached food trucks. Scraping is done weekly by the cron."""
    from backend.database import get_cached_foodtrucks

    return get_cached_foodtrucks()
