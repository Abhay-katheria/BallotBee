from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_serializer

def serialize_utc_datetime(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    # Ensure ISO 8601 formatting with explicit UTC trailing 'Z'
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt.microsecond == 0 else dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

# User Schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)

class UserRegister(UserBase):
    password: str = Field(..., min_length=6, max_length=100)

class UserLogin(UserBase):
    password: str

class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    created_at: datetime

    @field_serializer("created_at", check_fields=False)
    def serialize_created_at(self, dt: datetime, _info) -> str:
        return serialize_utc_datetime(dt)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# Option Schemas
class OptionBase(BaseModel):
    text: str = Field(..., min_length=1, max_length=255)

class OptionCreate(OptionBase):
    pass

class OptionOut(OptionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    poll_id: int

# Poll Schemas
class PollCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    options: List[str] = Field(..., min_length=2, description="At least two options are required")
    duration_minutes: Optional[int] = Field(None, ge=1, description="Voting duration in minutes from creation")
    auto_delete_hours: Optional[int] = Field(24, ge=1, description="Hours after closing before auto-deletion")

class PollOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    is_closed: bool
    created_at: datetime
    created_by_id: int
    options: List[OptionOut]
    total_votes: int = 0
    has_voted: bool = False
    user_voted_option_id: Optional[int] = None
    expires_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    auto_delete_hours: Optional[int] = 24

    @field_serializer("created_at", "expires_at", "closed_at", check_fields=False)
    def serialize_poll_datetimes(self, dt: Optional[datetime], _info) -> Optional[str]:
        return serialize_utc_datetime(dt)

# Vote Schemas
class VoteCreate(BaseModel):
    option_id: int

class VoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    poll_id: int
    option_id: int
    user_id: int
    created_at: datetime

    @field_serializer("created_at", check_fields=False)
    def serialize_vote_created_at(self, dt: datetime, _info) -> str:
        return serialize_utc_datetime(dt)

# Results Schemas
class OptionResult(BaseModel):
    id: int
    text: str
    votes_count: int
    percentage: float

class PollResultsOut(BaseModel):
    poll_id: int
    title: str
    description: Optional[str]
    is_closed: bool
    total_votes: int
    options: List[OptionResult]
    expires_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    @field_serializer("expires_at", "closed_at", check_fields=False)
    def serialize_result_datetimes(self, dt: Optional[datetime], _info) -> Optional[str]:
        return serialize_utc_datetime(dt)

# Phase 3: My Votes Schema
class MyVoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vote_id: int
    poll_id: int
    poll_title: str
    poll_description: Optional[str] = None
    poll_is_closed: bool
    poll_expires_at: Optional[datetime] = None
    voted_option_id: int
    voted_option_text: str
    voted_at: datetime
    total_votes: int

    @field_serializer("poll_expires_at", "voted_at", check_fields=False)
    def serialize_my_vote_datetimes(self, dt: Optional[datetime], _info) -> Optional[str]:
        return serialize_utc_datetime(dt)
