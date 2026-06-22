from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.database import (
    init_db, create_team, join_team, get_team,
    get_restaurants, add_restaurant, update_restaurant, delete_restaurant,
    get_votes, set_votes, update_foodtruck_tags,
)
from backend.scraper import get_todays_foodtrucks

app = FastAPI()
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def startup():
    init_db()


# --- Team endpoints ---

class TeamCreate(BaseModel):
    name: str
    user_name: str


class TeamJoin(BaseModel):
    invite_code: str
    user_name: str


@app.post("/api/teams")
def api_create_team(body: TeamCreate):
    team = create_team(body.name, body.user_name)
    return team


@app.post("/api/teams/join")
def api_join_team(body: TeamJoin):
    result = join_team(body.invite_code, body.user_name)
    if result is None:
        return JSONResponse({"error": "team_not_found"}, status_code=404)
    if result.get("error") == "username_taken":
        return JSONResponse({"error": "username_taken"}, status_code=409)
    return result


@app.get("/api/teams/{team_id}")
def api_get_team(team_id: str):
    team = get_team(team_id)
    if not team:
        return JSONResponse({"error": "team_not_found"}, status_code=404)
    return team


# --- Restaurant endpoints (team-scoped) ---

class RestaurantCreate(BaseModel):
    name: str


class RestaurantUpdate(BaseModel):
    name: str
    address: str = ""
    tags: str = ""


@app.get("/api/teams/{team_id}/restaurants")
def list_restaurants(team_id: str):
    restaurants = get_restaurants(team_id)
    try:
        foodtrucks = get_todays_foodtrucks()
    except Exception:
        foodtrucks = []
    return restaurants + foodtrucks


@app.post("/api/teams/{team_id}/restaurants")
def create_restaurant(team_id: str, body: RestaurantCreate):
    rid = add_restaurant(team_id, body.name)
    return {"id": rid}


@app.put("/api/teams/{team_id}/restaurants/{rid}")
def edit_restaurant(team_id: str, rid: str, body: RestaurantUpdate):
    update_restaurant(rid, body.name, body.address, body.tags)
    return {"ok": True}


@app.delete("/api/teams/{team_id}/restaurants/{rid}")
def remove_restaurant(team_id: str, rid: str):
    delete_restaurant(rid)
    return {"ok": True}


# --- Vote endpoints (team-scoped) ---

class VoteSet(BaseModel):
    user_name: str
    restaurant_ids: list[str]


@app.get("/api/teams/{team_id}/votes/{vote_date}")
def list_votes(team_id: str, vote_date: str):
    return get_votes(team_id, vote_date)


@app.put("/api/teams/{team_id}/votes/{vote_date}")
def submit_votes(team_id: str, vote_date: str, body: VoteSet):
    set_votes(team_id, body.user_name, body.restaurant_ids, vote_date)
    return {"ok": True}


# --- Food truck tags (global) ---

class TagsUpdate(BaseModel):
    tags: str


@app.put("/api/foodtrucks/{rid}/tags")
def edit_foodtruck_tags(rid: str, body: TagsUpdate):
    update_foodtruck_tags(rid, body.tags)
    return {"ok": True}


# --- Serve frontend ---

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/{path:path}")
def serve_frontend(path: str = ""):
    file = FRONTEND_DIR / path
    if file.is_file():
        return FileResponse(file)
    return FileResponse(FRONTEND_DIR / "index.html")
