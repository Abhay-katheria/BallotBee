from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.config import DATABASE_URL, IS_SQLITE

if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def migrate_db():
    """Safely migrate SQLite database schema for Phase 1 columns if missing."""
    if not IS_SQLITE:
        return

    with engine.connect() as conn:
        try:
            result = conn.execute(text("PRAGMA table_info(polls)"))
            columns = [row[1] for row in result.fetchall()]
            if columns:  # 'polls' table exists
                if "expires_at" not in columns:
                    conn.execute(text("ALTER TABLE polls ADD COLUMN expires_at DATETIME"))
                if "closed_at" not in columns:
                    conn.execute(text("ALTER TABLE polls ADD COLUMN closed_at DATETIME"))
                if "auto_delete_hours" not in columns:
                    conn.execute(text("ALTER TABLE polls ADD COLUMN auto_delete_hours INTEGER DEFAULT 24"))
                conn.commit()
        except Exception as e:
            print(f"Schema migration notice: {e}")
