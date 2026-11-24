import io
import csv
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.database import get_db
from backend.models import User, Poll, Option, Vote
from backend.schemas import (
    PollCreate, 
    PollOut, 
    OptionOut, 
    VoteCreate, 
    VoteOut, 
    PollResultsOut, 
    OptionResult, 
    MyVoteOut, 
    serialize_utc_datetime
)
from backend.dependencies import get_current_user, get_current_user_optional, get_current_admin

router = APIRouter()

def to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Helper ensuring any datetime is timezone-aware in UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def process_poll_maintenance(db: Session) -> None:
    """Auto-closes expired polls and permanently deletes closed polls past auto_delete_hours."""
    now = datetime.now(timezone.utc)

    # 1. Auto-close expired active polls
    active_polls = db.query(Poll).filter(
        Poll.is_closed.is_(False),
        Poll.expires_at.isnot(None)
    ).all()

    for poll in active_polls:
        exp = to_utc(poll.expires_at)
        if exp and exp <= now:
            poll.is_closed = True
            poll.closed_at = now

    # 2. Auto-delete closed polls that exceeded retention hours
    closed_polls = db.query(Poll).filter(
        Poll.is_closed.is_(True),
        Poll.closed_at.isnot(None),
        Poll.auto_delete_hours.isnot(None)
    ).all()

    for poll in closed_polls:
        closed_dt = to_utc(poll.closed_at)
        if closed_dt:
            deletion_threshold = closed_dt + timedelta(hours=poll.auto_delete_hours)
            if deletion_threshold <= now:
                db.delete(poll)

    db.commit()

@router.get("", response_model=List[PollOut])
def list_polls(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by 'active' or 'closed'"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    process_poll_maintenance(db)

    query = db.query(Poll)
    if status_filter == "active":
        query = query.filter(Poll.is_closed.is_(False))
    elif status_filter == "closed":
        query = query.filter(Poll.is_closed.is_(True))
    
    polls = query.order_by(Poll.created_at.desc()).all()
    
    # Pre-fetch user votes if authenticated
    user_votes_by_poll = {}
    if current_user:
        user_votes = db.query(Vote).filter(Vote.user_id == current_user.id).all()
        for v in user_votes:
            user_votes_by_poll[v.poll_id] = v.option_id

    results = []
    for poll in polls:
        total_votes = db.query(Vote).filter(Vote.poll_id == poll.id).count()
        has_voted = poll.id in user_votes_by_poll
        user_voted_option_id = user_votes_by_poll.get(poll.id)
        
        results.append(
            PollOut(
                id=poll.id,
                title=poll.title,
                description=poll.description,
                is_closed=poll.is_closed,
                created_at=to_utc(poll.created_at),
                created_by_id=poll.created_by_id,
                options=[OptionOut(id=opt.id, poll_id=opt.poll_id, text=opt.text) for opt in poll.options],
                total_votes=total_votes,
                has_voted=has_voted,
                user_voted_option_id=user_voted_option_id,
                expires_at=to_utc(poll.expires_at),
                closed_at=to_utc(poll.closed_at),
                auto_delete_hours=poll.auto_delete_hours
            )
        )
    return results

@router.post("", response_model=PollOut, status_code=status.HTTP_201_CREATED)
def create_poll(
    poll_data: PollCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    cleaned_options = [opt.strip() for opt in poll_data.options if opt.strip()]
    if len(cleaned_options) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A poll must have at least 2 non-empty options."
        )

    now = datetime.now(timezone.utc)
    expires_at = None
    if poll_data.duration_minutes is not None:
        expires_at = now + timedelta(minutes=poll_data.duration_minutes)

    auto_delete_hours = poll_data.auto_delete_hours if poll_data.auto_delete_hours is not None else 24

    new_poll = Poll(
        title=poll_data.title.strip(),
        description=poll_data.description.strip() if poll_data.description else None,
        created_by_id=current_admin.id,
        created_at=now,
        expires_at=expires_at,
        auto_delete_hours=auto_delete_hours,
        closed_at=None
    )
    db.add(new_poll)
    db.commit()
    db.refresh(new_poll)

    for opt_text in cleaned_options:
        opt = Option(poll_id=new_poll.id, text=opt_text)
        db.add(opt)
    db.commit()
    db.refresh(new_poll)

    return PollOut(
        id=new_poll.id,
        title=new_poll.title,
        description=new_poll.description,
        is_closed=new_poll.is_closed,
        created_at=to_utc(new_poll.created_at),
        created_by_id=new_poll.created_by_id,
        options=[OptionOut(id=opt.id, poll_id=opt.poll_id, text=opt.text) for opt in new_poll.options],
        total_votes=0,
        has_voted=False,
        user_voted_option_id=None,
        expires_at=to_utc(new_poll.expires_at),
        closed_at=to_utc(new_poll.closed_at),
        auto_delete_hours=new_poll.auto_delete_hours
    )

@router.get("/my-votes", response_model=List[MyVoteOut])
def get_my_votes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns the authenticated voter's personal voting history."""
    process_poll_maintenance(db)

    votes = (
        db.query(Vote)
        .filter(Vote.user_id == current_user.id)
        .order_by(Vote.created_at.desc())
        .all()
    )

    results = []
    for v in votes:
        poll = v.poll
        option = v.option
        if not poll or not option:
            continue
        total_votes = db.query(Vote).filter(Vote.poll_id == poll.id).count()
        results.append(
            MyVoteOut(
                vote_id=v.id,
                poll_id=poll.id,
                poll_title=poll.title,
                poll_description=poll.description,
                poll_is_closed=poll.is_closed,
                poll_expires_at=to_utc(poll.expires_at),
                voted_option_id=option.id,
                voted_option_text=option.text,
                voted_at=to_utc(v.created_at),
                total_votes=total_votes
            )
        )
    return results

@router.post("/{poll_id}/vote", response_model=VoteOut, status_code=status.HTTP_201_CREATED)
def cast_vote(
    poll_id: int,
    vote_data: VoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    process_poll_maintenance(db)

    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Poll not found."
        )

    now = datetime.now(timezone.utc)
    # Check if poll expired using tz-aware comparison
    if poll.expires_at:
        poll_exp = to_utc(poll.expires_at)
        if poll_exp and now >= poll_exp:
            poll.is_closed = True
            if not poll.closed_at:
                poll.closed_at = now
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Voting has expired for this poll."
            )

    if poll.is_closed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voting has closed for this poll."
        )

    option = db.query(Option).filter(Option.id == vote_data.option_id, Option.poll_id == poll_id).first()
    if not option:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected option is invalid for this poll."
        )

    new_vote = Vote(
        poll_id=poll_id,
        option_id=vote_data.option_id,
        user_id=current_user.id,
        created_at=now
    )
    db.add(new_vote)

    try:
        db.commit()
        db.refresh(new_vote)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted in this poll."
        )

    return new_vote

@router.get("/{poll_id}/results", response_model=PollResultsOut)
def get_poll_results(
    poll_id: int,
    db: Session = Depends(get_db)
):
    process_poll_maintenance(db)

    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Poll not found."
        )

    total_votes = db.query(Vote).filter(Vote.poll_id == poll_id).count()

    option_results = []
    for option in poll.options:
        votes_count = db.query(Vote).filter(Vote.option_id == option.id).count()
        percentage = round((votes_count / total_votes * 100), 1) if total_votes > 0 else 0.0
        option_results.append(
            OptionResult(
                id=option.id,
                text=option.text,
                votes_count=votes_count,
                percentage=percentage
            )
        )

    return PollResultsOut(
        poll_id=poll.id,
        title=poll.title,
        description=poll.description,
        is_closed=poll.is_closed,
        total_votes=total_votes,
        options=option_results,
        expires_at=to_utc(poll.expires_at),
        closed_at=to_utc(poll.closed_at)
    )

@router.patch("/{poll_id}/close", response_model=PollOut)
def close_poll(
    poll_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Poll not found."
        )

    poll.is_closed = True
    poll.closed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(poll)

    total_votes = db.query(Vote).filter(Vote.poll_id == poll.id).count()
    return PollOut(
        id=poll.id,
        title=poll.title,
        description=poll.description,
        is_closed=poll.is_closed,
        created_at=to_utc(poll.created_at),
        created_by_id=poll.created_by_id,
        options=[OptionOut(id=opt.id, poll_id=opt.poll_id, text=opt.text) for opt in poll.options],
        total_votes=total_votes,
        has_voted=False,
        user_voted_option_id=None,
        expires_at=to_utc(poll.expires_at),
        closed_at=to_utc(poll.closed_at),
        auto_delete_hours=poll.auto_delete_hours
    )

@router.delete("/{poll_id}")
def delete_poll(
    poll_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Poll not found."
        )

    db.delete(poll)
    db.commit()
    return {"detail": "Poll deleted successfully", "poll_id": poll_id}

@router.get("/{poll_id}/export")
def export_poll_results(
    poll_id: int,
    format: str = Query("csv", description="Export format: 'csv' or 'json'"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin-only endpoint exporting poll results in CSV or JSON format."""
    format_clean = format.strip().lower()
    if format_clean not in ("csv", "json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid export format. Supported formats: csv, json."
        )

    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Poll not found."
        )

    total_votes = db.query(Vote).filter(Vote.poll_id == poll.id).count()
    options_data = []
    for opt in poll.options:
        votes_count = db.query(Vote).filter(Vote.option_id == opt.id).count()
        percentage = round((votes_count / total_votes * 100), 1) if total_votes > 0 else 0.0
        options_data.append({
            "id": opt.id,
            "text": opt.text,
            "votes_count": votes_count,
            "percentage": percentage
        })

    status_str = "Closed" if poll.is_closed else "Active"
    created_at_str = serialize_utc_datetime(to_utc(poll.created_at))
    closed_at_str = serialize_utc_datetime(to_utc(poll.closed_at))
    expires_at_str = serialize_utc_datetime(to_utc(poll.expires_at))
    now_str = serialize_utc_datetime(datetime.now(timezone.utc))

    if format_clean == "json":
        export_payload = {
            "poll_id": poll.id,
            "title": poll.title,
            "description": poll.description,
            "status": status_str,
            "created_at": created_at_str,
            "expires_at": expires_at_str,
            "closed_at": closed_at_str,
            "total_votes": total_votes,
            "options": options_data,
            "exported_at": now_str
        }
        content = json.dumps(export_payload, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="poll_{poll_id}_results.json"'}
        )
    else:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Poll ID", "Title", "Status", "Total Votes", "Created At", "Expires At", "Closed At", "Exported At"])
        writer.writerow([poll.id, poll.title, status_str, total_votes, created_at_str or "", expires_at_str or "", closed_at_str or "", now_str])
        writer.writerow([])
        writer.writerow(["Option ID", "Option Text", "Votes Count", "Percentage (%)"])
        for opt in options_data:
            writer.writerow([opt["id"], opt["text"], opt["votes_count"], f"{opt['percentage']}%"])

        content = output.getvalue()
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="poll_{poll_id}_results.csv"'}
        )
