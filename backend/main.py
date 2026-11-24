from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.database import Base, engine, SessionLocal, migrate_db
from backend.seed import seed_data
from backend.routers import auth, polls

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database schema exists & apply safe column migrations
    Base.metadata.create_all(bind=engine)
    migrate_db()
    # Automatically seed admin and sample poll
    with SessionLocal() as db:
        seed_data(db)
    yield

app = FastAPI(
    title="BallotBee API",
    description="Minimalist, secure community polling platform with real-time sync and cryptographically verified voting integrity.",
    version="1.2.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(polls.router, prefix="/api/polls", tags=["Polls"])

# Frontend path resolution
frontend_path = Path(__file__).resolve().parent.parent / "frontend"

# Clean favicon handling to eliminate browser 404s
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    favicon_path = frontend_path / "favicon.svg"
    if favicon_path.is_file():
        return FileResponse(favicon_path, media_type="image/svg+xml")
    return Response(status_code=204)

# Mount frontend directory for clean serving
if frontend_path.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
