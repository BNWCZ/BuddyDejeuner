from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.database import (
    init_db,
    create_user, get_user, get_user_teams,
    recover_by_team_name, recover_by_invite_code, recover_confirm,
    create_team, join_team, get_team,
    get_restaurants, add_restaurant, update_restaurant, delete_restaurant,
    get_votes, set_votes, update_foodtruck_tags,
    get_team_admin_data, update_team_admin, remove_team_member, delete_team,
)
from backend.scraper import get_todays_foodtrucks

app = FastAPI()
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def startup():
    init_db()


# --- User endpoints ---

class UserCreate(BaseModel):
    name: str


@app.post("/api/users")
def api_create_user(body: UserCreate):
    user_id = create_user(body.name)
    return {"id": user_id}


# --- Auth endpoints ---

class AuthLogin(BaseModel):
    user_id: str


@app.post("/api/auth/login")
def api_login(body: AuthLogin):
    user = get_user(body.user_id)
    if not user:
        return JSONResponse({"error": "user_not_found"}, status_code=404)
    teams = get_user_teams(body.user_id)
    return {"id": user["id"], "teams": teams}


class AuthRecover(BaseModel):
    team_name: Optional[str] = None
    invite_code: Optional[str] = None


@app.post("/api/auth/recover")
def api_recover(body: AuthRecover):
    if body.invite_code:
        result = recover_by_invite_code(body.invite_code)
    elif body.team_name:
        result = recover_by_team_name(body.team_name)
    else:
        return JSONResponse({"error": "missing_field"}, status_code=400)
    if not result:
        return JSONResponse({"error": "team_not_found"}, status_code=404)
    if result.get("error") == "multiple_teams":
        return JSONResponse({"error": "multiple_teams"}, status_code=409)
    return result


class AuthRecoverConfirm(BaseModel):
    team_id: str
    display_name: str
    user_id: Optional[str] = None


@app.post("/api/auth/recover/confirm")
def api_recover_confirm(body: AuthRecoverConfirm):
    result = recover_confirm(body.team_id, body.display_name, body.user_id)
    if not result:
        return JSONResponse({"error": "member_not_found"}, status_code=404)
    if result.get("error") == "admin_verification_required":
        return JSONResponse({"error": "admin_verification_required"}, status_code=403)
    return result


# --- Team endpoints ---

class TeamCreate(BaseModel):
    name: str
    user_id: str
    display_name: str


class TeamJoin(BaseModel):
    invite_code: str
    user_id: str
    display_name: str


@app.post("/api/teams")
def api_create_team(body: TeamCreate):
    return create_team(body.name, body.user_id, body.display_name)


@app.post("/api/teams/join")
def api_join_team(body: TeamJoin):
    result = join_team(body.invite_code, body.user_id, body.display_name)
    if result is None:
        return JSONResponse({"error": "team_not_found"}, status_code=404)
    if result.get("error") == "username_taken":
        return JSONResponse({"error": "username_taken"}, status_code=409)
    if result.get("error") == "already_member":
        return JSONResponse({"error": "already_member"}, status_code=409)
    return result


@app.get("/api/teams/{team_id}")
def api_get_team(team_id: str):
    team = get_team(team_id)
    if not team:
        return JSONResponse({"error": "team_not_found"}, status_code=404)
    return team


@app.get("/api/users/{user_id}/teams")
def api_get_user_teams(user_id: str):
    user = get_user(user_id)
    if not user:
        return JSONResponse({"error": "user_not_found"}, status_code=404)
    return get_user_teams(user_id)


# --- Admin endpoints ---

@app.get("/api/teams/{team_id}/admin")
def api_get_admin(team_id: str, user_id: str):
    data = get_team_admin_data(team_id, user_id)
    if not data:
        return JSONResponse({"error": "forbidden"}, status_code=403)
    return data


class AdminUpdate(BaseModel):
    user_id: str
    name: Optional[str] = None
    regenerate_code: bool = False


@app.put("/api/teams/{team_id}/admin")
def api_update_admin(team_id: str, body: AdminUpdate):
    result = update_team_admin(team_id, body.user_id, name=body.name, regenerate_code=body.regenerate_code)
    if not result:
        return JSONResponse({"error": "forbidden"}, status_code=403)
    return {"ok": True, "team": result}


@app.delete("/api/teams/{team_id}/members/{display_name}")
def api_remove_member(team_id: str, display_name: str, user_id: str):
    if not remove_team_member(team_id, user_id, display_name):
        return JSONResponse({"error": "forbidden"}, status_code=403)
    return {"ok": True}


@app.delete("/api/teams/{team_id}")
def api_delete_team(team_id: str, user_id: str):
    if not delete_team(team_id, user_id):
        return JSONResponse({"error": "forbidden"}, status_code=403)
    return {"ok": True}


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
    user_id: str
    restaurant_ids: list[str]


@app.get("/api/teams/{team_id}/votes/{vote_date}")
def list_votes(team_id: str, vote_date: str):
    return get_votes(team_id, vote_date)


@app.put("/api/teams/{team_id}/votes/{vote_date}")
def submit_votes(team_id: str, vote_date: str, body: VoteSet):
    set_votes(team_id, body.user_id, body.restaurant_ids, vote_date)
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
