from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from .. import schemas as s
from ..database import Db
from ..models import User
from ..security import DUMMY_HASH, Browser, Csrf, Customer, limit, password_hash, rotate_session
from ..services.carts import merge_account_cart

router = APIRouter(tags=["Accounts"])


@router.get("/session", response_model=s.SessionOut)
def session_info(session: Browser):
    return {"csrf_token": session.csrf_token, "user": session.user}


@router.post("/auth/register", response_model=s.UserOut, status_code=201)
def register(payload: s.Register, request: Request, session: Csrf, db: Db):
    limit(request, "auth", 10)
    user = User(
        email=str(payload.email).lower(),
        name=payload.name,
        password_hash=password_hash.hash(payload.password),
    )
    db.add(user)
    db.commit()
    return user


@router.post("/auth/login", response_model=s.UserOut)
def login(payload: s.Login, request: Request, response: Response, session: Csrf, db: Db):
    limit(request, "auth", 10)
    if session.user_id is not None:
        raise HTTPException(409, "Log out before starting another login.")
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    valid = password_hash.verify(payload.password, user.password_hash if user else DUMMY_HASH)
    if not valid or user is None or not user.active:
        raise HTTPException(401, "Invalid email or password.")
    session.cart_id = merge_account_cart(db, session, user)
    session.user_id = user.id
    rotate_session(session, response, request.app.state.settings)
    db.commit()
    return user


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, session: Csrf, db: Db):
    db.delete(session)
    db.commit()
    response.delete_cookie(request.app.state.settings.cookie_name, path="/")


@router.get("/auth/me", response_model=s.UserOut)
def profile(user: Customer):
    return user


@router.patch("/auth/me", response_model=s.UserOut)
def update_profile(payload: s.ProfileUpdate, user: Customer, session: Csrf, db: Db):
    user.name = payload.name
    db.commit()
    return user
