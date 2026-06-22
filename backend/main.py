from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.database import (
    init_db, get_restaurants, add_restaurant, update_restaurant,
    delete_restaurant, get_votes, set_votes, update_foodtruck_tags,
)
from backend.scraper import get_todays_foodtrucks

app = FastAPI()
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def startup():
    init_db()


# --- Restaurant endpoints ---

@app.get("/api/restaurants")
def list_restaurants():
    restaurants = get_restaurants()
    try:
        foodtrucks = get_todays_foodtrucks()
    except Exception:
        foodtrucks = []
    return restaurants + foodtrucks


class RestaurantCreate(BaseModel):
    name: str


class RestaurantUpdate(BaseModel):
    name: str
    address: str = ""
    tags: str = ""


@app.post("/api/restaurants")
def create_restaurant(body: RestaurantCreate):
    rid = add_restaurant(body.name)
    return {"id": rid}


class TagsUpdate(BaseModel):
    tags: str


@app.put("/api/restaurants/{rid}")
def edit_restaurant(rid: str, body: RestaurantUpdate):
    update_restaurant(rid, body.name, body.address, body.tags)
    return {"ok": True}


@app.put("/api/foodtrucks/{rid}/tags")
def edit_foodtruck_tags(rid: str, body: TagsUpdate):
    update_foodtruck_tags(rid, body.tags)
    return {"ok": True}


@app.delete("/api/restaurants/{rid}")
def remove_restaurant(rid: str):
    delete_restaurant(rid)
    return {"ok": True}


# --- Vote endpoints ---

@app.get("/api/votes/{vote_date}")
def list_votes(vote_date: str):
    return get_votes(vote_date)


class VoteSet(BaseModel):
    user_name: str
    restaurant_ids: list[str]


@app.put("/api/votes/{vote_date}")
def submit_votes(vote_date: str, body: VoteSet):
    set_votes(body.user_name, body.restaurant_ids, vote_date)
    return {"ok": True}


# --- Serve frontend ---

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/{path:path}")
def serve_frontend(path: str = ""):
    file = FRONTEND_DIR / path
    if file.is_file():
        return FileResponse(file)
    return FileResponse(FRONTEND_DIR / "index.html")
