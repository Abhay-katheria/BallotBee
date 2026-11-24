from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine, Base, migrate_db
from backend.models import User, Poll, Option
from backend.security import hash_password

def seed_data(db: Session) -> None:
    # 1. Create default admin if not exists
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            hashed_password=hash_password("admin123"),
            role="admin"
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print("✓ Created default admin account (username: 'admin', password: 'admin123')")
    else:
        print("• Default admin account already exists")

    # 2. Create sample voter if not exists
    voter = db.query(User).filter(User.username == "voter1").first()
    if not voter:
        voter = User(
            username="voter1",
            hashed_password=hash_password("voter123"),
            role="voter"
        )
        db.add(voter)
        db.commit()
        db.refresh(voter)
        print("✓ Created default voter account (username: 'voter1', password: 'voter123')")
    else:
        print("• Default voter account already exists")

    # 3. Create sample poll if none exist
    poll_count = db.query(Poll).count()
    if poll_count == 0:
        sample_poll = Poll(
            title="Favorite Web & Backend Technology (2026)",
            description="Cast your vote for the most exciting modern web and backend stack.",
            created_by_id=admin.id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            auto_delete_hours=24
        )
        db.add(sample_poll)
        db.commit()
        db.refresh(sample_poll)

        options = [
            "FastAPI + Vanilla JS SPA",
            "Next.js + TypeScript",
            "Go + HTMX",
            "Rust + Axum"
        ]
        for opt_text in options:
            db.add(Option(poll_id=sample_poll.id, text=opt_text))
        db.commit()
        print(f"✓ Created sample poll '{sample_poll.title}' with {len(options)} options and 24h timer")
    else:
        print(f"• Polls already exist ({poll_count} found)")

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    migrate_db()
    with SessionLocal() as db_session:
        seed_data(db_session)
    print("Database seeding completed.")
