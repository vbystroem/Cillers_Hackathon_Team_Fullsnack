import asyncio
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum
from fastapi import APIRouter, Request, HTTPException, Query, Header
from pydantic import BaseModel, Field

from ..utils import log
from .. import conf

logger = log.get_logger(__name__)
router = APIRouter()

#### Data Models ####

class AnalysisStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"

class AnalysisRequest(BaseModel):
    text: str = Field(..., description="Text to analyze for compliance")

class ComplianceScore(BaseModel):
    overall_score: float = Field(..., ge=0, le=100, description="Overall compliance score (0-100)")
    risk_level: str = Field(..., description="Risk level: low, medium, high")
    flags: List[str] = Field(default_factory=list, description="List of compliance flags")

class Analysis(BaseModel):
    id: str
    text: str
    score: ComplianceScore
    status: AnalysisStatus
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewer_notes: Optional[str] = None

class AnalysisResponse(BaseModel):
    id: str
    status: AnalysisStatus
    score: ComplianceScore
    created_at: datetime
    message: str

class ReviewDecision(BaseModel):
    decision: str = Field(..., description="'approve' or 'reject'")
    notes: Optional[str] = Field(None, description="Reviewer notes")

class ReviewDecisionResponse(BaseModel):
    id: str
    status: AnalysisStatus
    reviewed_at: datetime
    message: str

#### In-Memory Storage ####

# In-memory storage for analyses (replace with database later)
analyses_store: Dict[str, Analysis] = {}

#### Utility Functions ####

def get_app_version() -> str:
    """Read version from pyproject.toml."""
    try:
        current_path = Path(__file__).resolve()
        for parent in [current_path] + list(current_path.parents):
            pyproject_path = parent / "pyproject.toml"
            if pyproject_path.exists():
                content = pyproject_path.read_text()
                for line in content.split('\n'):
                    if line.strip().startswith('version = '):
                        return line.split('=')[1].strip().strip('"\'')
                break
        return "unknown"
    except Exception as e:
        logger.warning(f"Failed to read version from pyproject.toml: {e}")
        return "unknown"

def compute_compliance_score(text: str) -> ComplianceScore:
    """
    Compute a compliance score for the given text.
    This is a simple mock implementation - replace with actual compliance logic.
    """
    # Simple heuristic scoring based on text length and keywords
    text_lower = text.lower()
    
    # Check for compliance-related keywords
    compliance_keywords = ["gdpr", "privacy", "consent", "data protection", "secure", "confidential"]
    risk_keywords = ["leak", "breach", "unauthorized", "violation", "illegal"]
    
    compliance_count = sum(1 for keyword in compliance_keywords if keyword in text_lower)
    risk_count = sum(1 for keyword in risk_keywords if keyword in text_lower)
    
    # Calculate base score
    base_score = 70.0
    
    # Adjust score based on findings
    score = base_score + (compliance_count * 5) - (risk_count * 15)
    score = max(0, min(100, score))  # Clamp between 0-100
    
    # Determine risk level
    if score >= 80:
        risk_level = "low"
    elif score >= 50:
        risk_level = "medium"
    else:
        risk_level = "high"
    
    # Generate flags
    flags = []
    if risk_count > 0:
        flags.append(f"Found {risk_count} risk-related keyword(s)")
    if len(text) < 20:
        flags.append("Text too short for proper analysis")
    if score < 50:
        flags.append("Low compliance score - requires review")
    
    return ComplianceScore(
        overall_score=round(score, 2),
        risk_level=risk_level,
        flags=flags
    )

def verify_mode(x_user_mode: Optional[str], required_mode: str):
    """Verify that the user is in the required mode."""
    if not x_user_mode:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied. This endpoint requires '{required_mode}' mode. "
                   f"Please include 'X-User-Mode: {required_mode}' header."
        )
    
    if x_user_mode.lower() != required_mode.lower():
        raise HTTPException(
            status_code=403,
            detail=f"Access denied. This endpoint requires '{required_mode}' mode, "
                   f"but you are in '{x_user_mode}' mode."
        )

#### Routes ####

@router.get("/")
async def root():
    return {
        "message": "Compliance Analysis API",
        "version": get_app_version(),
        "endpoints": {
            "user": [
                "POST /analyze - Submit text for compliance analysis",
                "GET /analysis/{id} - Get analysis result"
            ],
            "reviewer": [
                "GET /reviews/pending - Get all pending reviews",
                "POST /reviews/{analysis_id}/decision - Approve or reject analysis"
            ]
        },
        "usage": {
            "mode_switching": "Include 'X-User-Mode: user' or 'X-User-Mode: reviewer' header in requests",
            "example_user": "curl -H 'X-User-Mode: user' -X POST http://localhost:3030/analyze -d '{\"text\":\"Sample text\"}'",
            "example_reviewer": "curl -H 'X-User-Mode: reviewer' http://localhost:3030/reviews/pending"
        }
    }

@router.get("/health")
async def health_check(
    request: Request,
    quick: bool = Query(False, description="Return basic status only"),
    services: Optional[str] = Query(None, description="Comma-separated list of services to check"),
    timeout: float = Query(2.0, description="Timeout in seconds for health checks", ge=0.1, le=10.0)
):
    """Fast health check endpoint."""
    start_time = time.time()

    health_status = {
        "status": "healthy",
        "service": "compliance-analysis-api",
        "timestamp": int(start_time),
        "version": get_app_version(),
        "storage": {
            "type": "in-memory",
            "total_analyses": len(analyses_store),
            "pending_reviews": sum(1 for a in analyses_store.values() if a.status == AnalysisStatus.PENDING_REVIEW)
        }
    }

    health_status["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
    return health_status

#### User Endpoints ####

@router.post("/analyze", response_model=AnalysisResponse, status_code=201)
async def create_analysis(
    analysis_request: AnalysisRequest,
    x_user_mode: Optional[str] = Header(None, description="User mode: 'user' or 'reviewer'")
):
    """
    Submit text for compliance analysis (User mode required).
    
    The API will compute a compliance score and store it as pending_review.
    """
    verify_mode(x_user_mode, "user")
    
    # Generate unique ID
    analysis_id = str(uuid.uuid4())
    
    # Compute compliance score
    score = compute_compliance_score(analysis_request.text)
    
    # Create analysis record
    analysis = Analysis(
        id=analysis_id,
        text=analysis_request.text,
        score=score,
        status=AnalysisStatus.PENDING_REVIEW,
        created_at=datetime.utcnow()
    )
    
    # Store in memory
    analyses_store[analysis_id] = analysis
    
    logger.info(f"Created analysis {analysis_id} with score {score.overall_score}")
    
    return AnalysisResponse(
        id=analysis_id,
        status=analysis.status,
        score=score,
        created_at=analysis.created_at,
        message=f"Analysis created successfully. Status: {analysis.status.value}"
    )

@router.get("/analysis/{analysis_id}", response_model=Analysis)
async def get_analysis(
    analysis_id: str,
    x_user_mode: Optional[str] = Header(None, description="User mode: 'user' or 'reviewer'")
):
    """
    Get analysis result by ID (User mode required).
    
    Returns the compliance score and current status.
    Users can only see approved or rejected analyses (with final human-approved scores).
    """
    verify_mode(x_user_mode, "user")
    
    analysis = analyses_store.get(analysis_id)
    
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    
    # Users can only view finalized analyses (approved or rejected)
    # if analysis.status == AnalysisStatus.PENDING_REVIEW:
    #     raise HTTPException(
    #         status_code=403,
    #         detail="Analysis is still pending review. Please check back later."
    #     )
    
    return analysis

#### Reviewer Endpoints ####

@router.get("/reviews/pending", response_model=List[Analysis])
async def get_pending_reviews(
    x_user_mode: Optional[str] = Header(None, description="User mode: 'user' or 'reviewer'")
):
    """
    Get all pending analyses for review (Reviewer mode required).
    
    Returns all analyses with status 'pending_review'.
    """
    verify_mode(x_user_mode, "reviewer")
    
    pending = [
        analysis for analysis in analyses_store.values()
        if analysis.status == AnalysisStatus.PENDING_REVIEW
    ]
    
    # Sort by creation time (oldest first)
    pending.sort(key=lambda x: x.created_at)
    
    logger.info(f"Returning {len(pending)} pending reviews")
    
    return pending

@router.post("/reviews/{analysis_id}/decision", response_model=ReviewDecisionResponse)
async def submit_review_decision(
    analysis_id: str,
    decision: ReviewDecision,
    x_user_mode: Optional[str] = Header(None, description="User mode: 'user' or 'reviewer'")
):
    """
    Submit a review decision for an analysis (Reviewer mode required).
    
    Decision must be 'approve' or 'reject'.
    """
    verify_mode(x_user_mode, "reviewer")
    
    analysis = analyses_store.get(analysis_id)
    
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    
    if analysis.status != AnalysisStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Analysis {analysis_id} has already been reviewed. Status: {analysis.status.value}"
        )
    
    # Validate decision
    if decision.decision.lower() not in ["approve", "reject"]:
        raise HTTPException(
            status_code=400,
            detail="Decision must be either 'approve' or 'reject'"
        )
    
    # Update analysis
    analysis.status = AnalysisStatus.APPROVED if decision.decision.lower() == "approve" else AnalysisStatus.REJECTED
    analysis.reviewed_at = datetime.utcnow()
    analysis.reviewer_notes = decision.notes
    
    logger.info(f"Analysis {analysis_id} has been {analysis.status.value} by reviewer")
    
    return ReviewDecisionResponse(
        id=analysis_id,
        status=analysis.status,
        reviewed_at=analysis.reviewed_at,
        message=f"Analysis has been {analysis.status.value}"
    )

#### Additional Reviewer Endpoints ####

@router.get("/reviews/all", response_model=List[Analysis])
async def get_all_reviews(
    status: Optional[AnalysisStatus] = Query(None, description="Filter by status"),
    x_user_mode: Optional[str] = Header(None, description="User mode: 'user' or 'reviewer'")
):
    """
    Get all analyses with optional status filter (Reviewer mode required).
    """
    verify_mode(x_user_mode, "reviewer")
    
    if status:
        filtered = [a for a in analyses_store.values() if a.status == status]
    else:
        filtered = list(analyses_store.values())
    
    # Sort by creation time (newest first)
    filtered.sort(key=lambda x: x.created_at, reverse=True)
    
    return filtered

#### Statistics Endpoint ####

@router.get("/stats")
async def get_statistics(
    x_user_mode: Optional[str] = Header(None, description="User mode: 'user' or 'reviewer'")
):
    """
    Get statistics about analyses (Available to both users and reviewers).
    """
    if not x_user_mode:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Please include 'X-User-Mode' header."
        )
    
    total = len(analyses_store)
    pending = sum(1 for a in analyses_store.values() if a.status == AnalysisStatus.PENDING_REVIEW)
    approved = sum(1 for a in analyses_store.values() if a.status == AnalysisStatus.APPROVED)
    rejected = sum(1 for a in analyses_store.values() if a.status == AnalysisStatus.REJECTED)
    
    # Calculate average score
    if total > 0:
        avg_score = sum(a.score.overall_score for a in analyses_store.values()) / total
    else:
        avg_score = 0.0
    
    return {
        "total_analyses": total,
        "pending_review": pending,
        "approved": approved,
        "rejected": rejected,
        "average_score": round(avg_score, 2),
        "mode": x_user_mode
    }
