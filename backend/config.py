import os
from dotenv import load_dotenv

# Load optional local .env file (ignored by Git)
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-voting-system-jwt-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

raw_db_url = os.getenv("DATABASE_URL", "").strip()

if raw_db_url:
    # Normalize postgres:// and bare postgresql:// to postgresql+psycopg2:// for SQLAlchemy
    if raw_db_url.startswith("postgres://"):
        DATABASE_URL = raw_db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif raw_db_url.startswith("postgresql://"):
        DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    else:
        DATABASE_URL = raw_db_url
else:
    # Zero-config local development fallback
    DATABASE_URL = "sqlite:///./voting.db"

IS_SQLITE = DATABASE_URL.startswith("sqlite")
