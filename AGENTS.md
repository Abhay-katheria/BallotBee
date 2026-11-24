# Project Rules: Online Voting System

## Architecture
- Strictly separate frontend and backend into `/frontend` and `/backend` folders.
- Backend: Python FastAPI with SQLite (`voting.db`) using SQLAlchemy or parameterized SQLite queries.
- Frontend: Separate `index.html`, `css/style.css`, and modular `js/` files using `fetch()` to call the API.
- NEVER put inline CSS (`<style>` or `style="..."`) or inline JavaScript (`<script>` code blocks) inside HTML files.

## Security & Integrity
- Hash all user passwords securely (use `bcrypt` directly or `pwdlib`; avoid legacy `passlib` for Python 3.14 compatibility).
- Enforce one vote per user per poll at the database level using a `UNIQUE(poll_id, user_id)` constraint.
- Use JWT token authentication for protected voting and admin endpoints.

## Workflow
- Always create and use a Python virtual environment (`.venv`) before installing packages.
- Keep `requirements.txt` and `README.md` updated with exact local run commands.
- Keep code modular, clean, and easy to read.