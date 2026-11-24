# 🐝 BallotBee

A secure, high-performance community voting & decision platform built with **FastAPI**, **SQLite**, and a modern modular **Vanilla JavaScript** frontend crafted in an **Obsidian Minimal** (Linear-style) aesthetic.

---

## Features

- **Strict Separation of Concerns**: Decoupled `/frontend` and `/backend` architecture following strict modular design patterns.
- **Obsidian Minimal Aesthetic**: Matte `#09090b` canvas with a masked architectural grid, studio spotlight ambient depth, anodized fine grain texture, and crisp `#27272a` hairline borders.
- **Robust Security**: Passwords securely hashed with `bcrypt`; stateless authentication via `PyJWT` bearer tokens.
- **Guaranteed Voting Integrity**: Database-level `UNIQUE(poll_id, user_id)` constraint prevents double-voting (rejects duplicates with HTTP 409 Conflict).
- **Real-Time Auto-Refresh**: Background 5-second polling updates vote counts, poll statuses, and active results charts without page reloads or interrupting user selections.
- **Live Expiration Timers**: Real-time ticking `HH:MM:SS` countdown with automated UI transitions upon expiration, styled with `JetBrains Mono` and `tabular-nums` for flicker-free ticking.
- **Interactive Option Tiles**: Poll options styled as full-width interactive cards with custom checkmark indicators and `:has(input:checked)` state highlighting.
- **Live Stats Bar**: Compact horizontal summary strip displaying **Active Polls**, **Total Votes Cast**, and a pulsing emerald **Live Sync** indicator.
- **Live Search Filtering**: Search polls in real time by title or description alongside status filter pills.
- **"My Votes" History**: Authenticated voters can view their complete voting history and selected choices in clean glassmorphic cards.
- **Admin Results Export**: Export poll results to downloadable CSV and JSON files directly from the Admin Dashboard.
- **Winner Celebration & Confetti**: Automated winner announcements with celebratory `canvas-confetti` bursts on poll conclusion; handles ties and zero-vote sessions gracefully with `localStorage` celebration deduplication.
- **Interactive Live Charts**: Built-in animated `Chart.js` bar and doughnut visualizations inside the Live Results view with leading-option contrast highlights.
- **Accessibility & Safety**: Unique IDs and labels on all inputs, global `Escape` key modal dismissal, and in-flight submit button guards preventing double-submissions.
- **Zero Inline Code**: Zero `<style>` tags, zero `style="..."` attributes, and zero inline `<script>` blocks in HTML.
- **Immediate Testability**: Automatic startup seed script provisioning a default admin and sample poll.

---

## Directory Structure

```
ballotbee/
├── .gitignore               # Git ignored patterns & caches
├── requirements.txt         # Pinned Python dependencies (including psycopg2-binary)
├── render.yaml              # Render Blueprint specification for zero-config cloud deploy
├── README.md                # System documentation & run guide
├── AGENTS.md                # Architectural & design guidelines
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI application, CORS, favicon & static file mounting
│   ├── config.py            # Environment settings and JWT constants
│   ├── database.py          # SQLAlchemy engine, session maker & Base
│   ├── models.py            # Declarative database models (User, Poll, Option, Vote)
│   ├── schemas.py           # Pydantic validation schemas
│   ├── security.py          # Direct bcrypt hashing & PyJWT token utilities
│   ├── dependencies.py      # Dependency injection (get_db, get_current_user, get_current_admin)
│   ├── seed.py              # Idempotent database seeder (admin & sample poll)
│   └── routers/
│       ├── __init__.py
│       ├── auth.py          # /api/auth (register, login, me)
│       └── polls.py         # /api/polls (list, create, vote, results, close, export)
├── frontend/
│   ├── favicon.svg          # Minimalist BallotBee hexagon-check SVG icon
│   ├── index.html           # Semantic HTML (zero inline styles or scripts)
│   ├── css/
│   │   └── style.css        # Obsidian Minimal design system & animations
│   └── js/
│       ├── api.js           # Fetch API wrapper with Bearer token injection
│       ├── auth.js          # Authentication state and session management
│       ├── ui.js            # Toast notifications, modal helpers & SVG icon generator
│       ├── polls.js         # Community polls, voting logic, live results & auto-refresh
│       ├── myVotes.js       # Personal voting history & choices
│       ├── admin.js         # Admin panel, dynamic option builder & CSV/JSON export
│       └── main.js          # Application bootstrapper, keyboard handlers & event listeners
└── tests/
    └── test_api.py          # Comprehensive pytest suite (19 test cases)
```

---

## Getting Started

### 1. Prerequisites
- Python 3.10+ (tested and fully compatible with Python 3.14)

### 2. Setup Virtual Environment & Install Dependencies
Open PowerShell in the project directory:

```powershell
# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install required dependencies
pip install -r requirements.txt
```

### 3. Run Automated Tests
Execute the comprehensive test suite:
```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_api.py -v
```

### 4. Start the Application
Run the FastAPI development server:
```powershell
.\.venv\Scripts\uvicorn.exe backend.main:app --reload --port 8000
```

Once running, access the web application in your browser:
- **Web App**: [http://localhost:8000/](http://localhost:8000/)
- **Interactive API Docs (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Alternative Docs (ReDoc)**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 5. Default Seed Accounts
Upon initial startup, the database automatically seeds with:
- **Admin**: `username: admin` | `password: admin123`
- **Voter**: `username: voter1` | `password: voter123`

---

## Cloud Deployment (Render & Neon PostgreSQL)

BallotBee is cloud-ready and can be deployed in minutes on **Render** using a free **Neon Serverless PostgreSQL** database.

### 1. Provision a Neon PostgreSQL Database
1. Go to [Neon.tech](https://neon.tech) and create a free project (e.g., `ballotbee-db`).
2. Copy the database connection string from the Neon dashboard. It will look like:
   ```text
   postgresql://username:password@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   *(Note: If your connection string starts with `postgres://`, BallotBee automatically normalizes it to `postgresql://` at startup).*

### 2. Deploy to Render
You can deploy BallotBee using either the **Render Blueprint** or manual **Web Service**:

#### Option A: 1-Click Blueprint Deploy
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** > **Blueprint**.
3. Connect your repository. Render will automatically parse [render.yaml](file:///c:/my%20stuff/project/online%20voting%20system/render.yaml).
4. Enter your Neon connection string in the `DATABASE_URL` prompt and deploy.

#### Option B: Manual Web Service
1. Click **New +** > **Web Service** and connect your repository.
2. Configure the service settings:
   - **Environment**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
3. Add Environment Variables:
   - `DATABASE_URL`: Your Neon connection string.
   - `SECRET_KEY`: A secure random secret string (e.g. generated via `openssl rand -hex 32`).
   - `PYTHON_VERSION`: `3.11.9`
4. Click **Deploy Web Service**.

### 3. Production Architecture Highlights
- **Single-Origin Deployment**: The FastAPI backend directly serves the modular vanilla JS frontend at `/` with relative API routing (`/api`), eliminating CORS issues and hosting fees for separate frontend tiers.
- **Neon Sleep Resilience**: Neon serverless instances suspend compute after 5 minutes of idle time. BallotBee runs with `pool_pre_ping=True` and `pool_recycle=300` in SQLAlchemy, transparently recovering from wakeups without dropped queries or user errors.
- **Zero-Config Local Fallback**: When `DATABASE_URL` is omitted, the application seamlessly falls back to local SQLite (`voting.db`), ensuring effortless local development and automated testing.

