import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.models import Poll
from backend.main import app
from backend.seed import seed_data

# Use in-memory SQLite database for isolated test execution
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as db:
        seed_data(db)
    yield
    Base.metadata.drop_all(bind=engine)

client = TestClient(app)

def test_seed_admin_login():
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"
    assert data["user"]["username"] == "admin"

def test_seed_voter_login():
    response = client.post("/api/auth/login", json={"username": "voter1", "password": "voter123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "voter"

def test_register_new_user_and_prevent_duplicate():
    # Register new user
    res1 = client.post("/api/auth/register", json={"username": "alice", "password": "alicepassword"})
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["user"]["username"] == "alice"
    assert data1["user"]["role"] == "voter"
    assert "access_token" in data1

    # Duplicate username registration should fail with 400
    res2 = client.post("/api/auth/register", json={"username": "alice", "password": "differentpwd"})
    assert res2.status_code == 400
    assert "already taken" in res2.json()["detail"]

def test_login_invalid_password():
    response = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpassword"})
    assert response.status_code == 401
    assert "Incorrect username or password" in response.json()["detail"]

def test_get_current_user_me():
    # Login as voter1
    login_res = client.post("/api/auth/login", json={"username": "voter1", "password": "voter123"})
    token = login_res.json()["access_token"]

    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["username"] == "voter1"

    # Request without token fails with 401
    unauth_res = client.get("/api/auth/me")
    assert unauth_res.status_code == 401

def test_list_polls():
    res = client.get("/api/polls")
    assert res.status_code == 200
    polls = res.json()
    assert len(polls) >= 1
    assert polls[0]["title"] == "Favorite Web & Backend Technology (2026)"
    assert len(polls[0]["options"]) == 4

def test_admin_create_poll_and_voter_forbidden():
    # Admin login
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    # Voter login
    voter_token = client.post("/api/auth/login", json={"username": "voter1", "password": "voter123"}).json()["access_token"]

    # Voter trying to create poll -> 403 Forbidden
    voter_res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {voter_token}"},
        json={
            "title": "Unauthorized Poll",
            "description": "Should fail",
            "options": ["Opt 1", "Opt 2"]
        }
    )
    assert voter_res.status_code == 403

    # Admin creating poll -> 201 Created
    admin_res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Best Cloud Provider 2026",
            "description": "Vote for your preferred cloud",
            "options": ["GCP", "AWS", "Azure"]
        }
    )
    assert admin_res.status_code == 201
    created_poll = admin_res.json()
    assert created_poll["title"] == "Best Cloud Provider 2026"
    assert len(created_poll["options"]) == 3

def test_vote_and_enforce_one_vote_per_user_per_poll():
    # Get seeded poll
    polls = client.get("/api/polls").json()
    poll = polls[0]
    poll_id = poll["id"]
    option_id = poll["options"][0]["id"]

    # Voter login
    voter_token = client.post("/api/auth/login", json={"username": "voter1", "password": "voter123"}).json()["access_token"]

    # 1. Cast first vote
    vote_res = client.post(
        f"/api/polls/{poll_id}/vote",
        headers={"Authorization": f"Bearer {voter_token}"},
        json={"option_id": option_id}
    )
    assert vote_res.status_code == 201
    assert vote_res.json()["poll_id"] == poll_id
    assert vote_res.json()["option_id"] == option_id

    # 2. Attempt duplicate vote by same user in same poll -> must return 409 Conflict
    dup_res = client.post(
        f"/api/polls/{poll_id}/vote",
        headers={"Authorization": f"Bearer {voter_token}"},
        json={"option_id": poll["options"][1]["id"]}
    )
    assert dup_res.status_code == 409
    assert "already voted" in dup_res.json()["detail"].lower()

def test_poll_results_calculation():
    # Poll & Options
    poll = client.get("/api/polls").json()[0]
    poll_id = poll["id"]
    opt1_id = poll["options"][0]["id"]
    opt2_id = poll["options"][1]["id"]

    # Register two users and cast votes
    user1_token = client.post("/api/auth/register", json={"username": "voter_a", "password": "password123"}).json()["access_token"]
    user2_token = client.post("/api/auth/register", json={"username": "voter_b", "password": "password123"}).json()["access_token"]

    client.post(f"/api/polls/{poll_id}/vote", headers={"Authorization": f"Bearer {user1_token}"}, json={"option_id": opt1_id})
    client.post(f"/api/polls/{poll_id}/vote", headers={"Authorization": f"Bearer {user2_token}"}, json={"option_id": opt2_id})

    results_res = client.get(f"/api/polls/{poll_id}/results")
    assert results_res.status_code == 200
    res_data = results_res.json()
    assert res_data["total_votes"] == 2

    counts = {opt["id"]: (opt["votes_count"], opt["percentage"]) for opt in res_data["options"]}
    assert counts[opt1_id] == (1, 50.0)
    assert counts[opt2_id] == (1, 50.0)

def test_admin_close_poll_and_reject_voting_on_closed_poll():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    voter_token = client.post("/api/auth/register", json={"username": "voter_c", "password": "password123"}).json()["access_token"]

    poll = client.get("/api/polls").json()[0]
    poll_id = poll["id"]
    opt_id = poll["options"][0]["id"]

    # Close poll as admin
    close_res = client.patch(f"/api/polls/{poll_id}/close", headers={"Authorization": f"Bearer {admin_token}"})
    assert close_res.status_code == 200
    assert close_res.json()["is_closed"] is True

    # Attempt to vote on closed poll -> should return 400
    vote_res = client.post(
        f"/api/polls/{poll_id}/vote",
        headers={"Authorization": f"Bearer {voter_token}"},
        json={"option_id": opt_id}
    )
    assert vote_res.status_code == 400
    assert "closed" in vote_res.json()["detail"].lower()

# ==========================================
# Phase 1: Timers, Expiration & Deletion Tests
# ==========================================

def test_create_poll_with_duration_and_auto_delete():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]

    res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Timed Poll 2026",
            "options": ["Option Alpha", "Option Beta"],
            "duration_minutes": 60,
            "auto_delete_hours": 12
        }
    )
    assert res.status_code == 201
    data = res.json()
    assert data["expires_at"] is not None
    assert data["auto_delete_hours"] == 12

def test_voting_on_expired_poll_rejected():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    voter_token = client.post("/api/auth/register", json={"username": "voter_exp", "password": "password123"}).json()["access_token"]

    # Create poll with duration
    create_res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Expiring Poll",
            "options": ["Opt A", "Opt B"],
            "duration_minutes": 10
        }
    )
    poll_id = create_res.json()["id"]
    opt_id = create_res.json()["options"][0]["id"]

    # Manually backdate expires_at in DB to simulate past expiration
    with TestingSessionLocal() as db:
        p = db.query(Poll).filter(Poll.id == poll_id).first()
        p.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

    # Attempt to vote -> should be rejected with 400 Expired
    vote_res = client.post(
        f"/api/polls/{poll_id}/vote",
        headers={"Authorization": f"Bearer {voter_token}"},
        json={"option_id": opt_id}
    )
    assert vote_res.status_code == 400
    assert "expired" in vote_res.json()["detail"].lower()

def test_auto_close_expired_polls():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]

    create_res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Auto Close Poll",
            "options": ["Opt 1", "Opt 2"],
            "duration_minutes": 10
        }
    )
    poll_id = create_res.json()["id"]

    # Backdate expires_at in DB
    with TestingSessionLocal() as db:
        p = db.query(Poll).filter(Poll.id == poll_id).first()
        p.expires_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        db.commit()

    # Listing polls triggers maintenance
    polls_res = client.get("/api/polls")
    assert polls_res.status_code == 200
    updated_poll = next(p for p in polls_res.json() if p["id"] == poll_id)
    assert updated_poll["is_closed"] is True

def test_auto_delete_closed_polls():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]

    create_res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Auto Purge Poll",
            "options": ["A", "B"],
            "auto_delete_hours": 1
        }
    )
    poll_id = create_res.json()["id"]

    # Set as closed 2 hours ago (exceeding 1 hour retention)
    with TestingSessionLocal() as db:
        p = db.query(Poll).filter(Poll.id == poll_id).first()
        p.is_closed = True
        p.closed_at = datetime.now(timezone.utc) - timedelta(hours=2)
        p.auto_delete_hours = 1
        db.commit()

    # Querying polls triggers maintenance auto-purge
    polls = client.get("/api/polls").json()
    assert not any(p["id"] == poll_id for p in polls)

def test_admin_manual_delete_poll_and_voter_forbidden():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    voter_token = client.post("/api/auth/register", json={"username": "voter_del", "password": "password123"}).json()["access_token"]

    create_res = client.post(
        "/api/polls",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Poll to Delete",
            "options": ["X", "Y"]
        }
    )
    poll_id = create_res.json()["id"]

    # Voter cannot delete poll -> 403 Forbidden
    voter_del = client.delete(f"/api/polls/{poll_id}", headers={"Authorization": f"Bearer {voter_token}"})
    assert voter_del.status_code == 403

    # Admin can delete poll -> 200 OK
    admin_del = client.delete(f"/api/polls/{poll_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_del.status_code == 200
    assert "deleted successfully" in admin_del.json()["detail"].lower()

    # Results for deleted poll should return 404
    get_res = client.get(f"/api/polls/{poll_id}/results")
    assert get_res.status_code == 404

def test_my_votes_endpoint_authenticated_and_unauthorized():
    # Login as voter1
    voter_token = client.post("/api/auth/login", json={"username": "voter1", "password": "voter123"}).json()["access_token"]

    # Unauthorized access check
    unauth_res = client.get("/api/polls/my-votes")
    assert unauth_res.status_code == 401

    # Get sample poll option
    poll = client.get("/api/polls").json()[0]
    opt_id = poll["options"][0]["id"]

    # Cast vote
    vote_res = client.post(
        f"/api/polls/{poll['id']}/vote",
        headers={"Authorization": f"Bearer {voter_token}"},
        json={"option_id": opt_id}
    )
    assert vote_res.status_code == 201

    # Query My Votes
    my_votes_res = client.get("/api/polls/my-votes", headers={"Authorization": f"Bearer {voter_token}"})
    assert my_votes_res.status_code == 200
    my_votes = my_votes_res.json()
    assert len(my_votes) >= 1
    v = next(item for item in my_votes if item["poll_id"] == poll["id"])
    assert v["voted_option_id"] == opt_id
    assert v["poll_title"] == poll["title"]
    assert v["total_votes"] >= 1
    assert "voted_at" in v

def test_export_poll_csv_admin_and_voter_forbidden():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    voter_token = client.post("/api/auth/login", json={"username": "voter1", "password": "voter123"}).json()["access_token"]

    poll = client.get("/api/polls").json()[0]
    poll_id = poll["id"]

    # Voter export forbidden -> 403
    voter_res = client.get(f"/api/polls/{poll_id}/export?format=csv", headers={"Authorization": f"Bearer {voter_token}"})
    assert voter_res.status_code == 403

    # Admin export CSV -> 200
    admin_res = client.get(f"/api/polls/{poll_id}/export?format=csv", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_res.status_code == 200
    assert "text/csv" in admin_res.headers["content-type"]
    assert "attachment" in admin_res.headers["content-disposition"]
    csv_text = admin_res.text
    assert "Poll ID" in csv_text
    assert poll["title"] in csv_text
    assert "Option Text" in csv_text

def test_export_poll_json_admin():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    poll = client.get("/api/polls").json()[0]
    poll_id = poll["id"]

    admin_res = client.get(f"/api/polls/{poll_id}/export?format=json", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_res.status_code == 200
    assert "application/json" in admin_res.headers["content-type"]
    data = admin_res.json()
    assert data["poll_id"] == poll_id
    assert data["title"] == poll["title"]
    assert "options" in data
    assert len(data["options"]) == len(poll["options"])
    assert "exported_at" in data

def test_export_poll_invalid_format_and_not_found():
    admin_token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    poll = client.get("/api/polls").json()[0]

    # Invalid format -> 400 Bad Request
    invalid_res = client.get(f"/api/polls/{poll['id']}/export?format=xml", headers={"Authorization": f"Bearer {admin_token}"})
    assert invalid_res.status_code == 400
    assert "invalid export format" in invalid_res.json()["detail"].lower()

    # Poll not found -> 404
    not_found_res = client.get("/api/polls/99999/export?format=csv", headers={"Authorization": f"Bearer {admin_token}"})
    assert not_found_res.status_code == 404
