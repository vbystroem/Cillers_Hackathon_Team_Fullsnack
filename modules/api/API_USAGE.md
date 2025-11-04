# Compliance Analysis API

A REST API for compliance text analysis with human reviewer workflow.

## Overview

This API allows users to submit text for compliance analysis and enables reviewers to approve or reject the analyses. The system uses in-memory storage (no database) and features role-based access control via HTTP headers.

## Running the API

The API is automatically running on `http://localhost:3030` via Polytope.

To check if it's running:
```bash
curl http://localhost:3030/health
```

## API Endpoints

### Common Endpoints

#### Root - API Information
```bash
curl http://localhost:3030/
```

#### Health Check
```bash
curl http://localhost:3030/health
```

#### Statistics (requires mode header)
```bash
# As user
curl -H 'X-User-Mode: user' http://localhost:3030/stats

# As reviewer
curl -H 'X-User-Mode: reviewer' http://localhost:3030/stats
```

### User Endpoints (require `X-User-Mode: user` header)

#### 1. Submit Text for Analysis
```bash
curl -H 'X-User-Mode: user' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/analyze \
     -d '{"text":"This document contains sensitive data about customer privacy and GDPR compliance requirements."}'
```

**Response:**
```json
{
  "id": "e09a31c7-fcb6-40b7-adaf-8ccf07418a04",
  "status": "pending_review",
  "score": {
    "overall_score": 80.0,
    "risk_level": "low",
    "flags": []
  },
  "created_at": "2025-11-04T13:18:28.243036",
  "message": "Analysis created successfully. Status: pending_review"
}
```

#### 2. Get Analysis Result by ID
```bash
curl -H 'X-User-Mode: user' \
     http://localhost:3030/analysis/{analysis_id}
```

**Response includes:**
- Analysis ID and text
- Compliance score (0-100)
- Risk level (low, medium, high)
- Status (pending_review, approved, rejected)
- Reviewer notes (if reviewed)
- Timestamps

### Reviewer Endpoints (require `X-User-Mode: reviewer` header)

#### 1. Get All Pending Reviews
```bash
curl -H 'X-User-Mode: reviewer' \
     http://localhost:3030/reviews/pending
```

**Response:**
```json
[
  {
    "id": "e09a31c7-fcb6-40b7-adaf-8ccf07418a04",
    "text": "This document contains sensitive data...",
    "score": {
      "overall_score": 80.0,
      "risk_level": "low",
      "flags": []
    },
    "status": "pending_review",
    "created_at": "2025-11-04T13:18:28.243036",
    "reviewed_at": null,
    "reviewer_notes": null
  }
]
```

#### 2. Approve an Analysis
```bash
curl -H 'X-User-Mode: reviewer' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/reviews/{analysis_id}/decision \
     -d '{"decision":"approve","notes":"Compliance score looks good."}'
```

#### 3. Reject an Analysis
```bash
curl -H 'X-User-Mode: reviewer' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/reviews/{analysis_id}/decision \
     -d '{"decision":"reject","notes":"High risk score detected."}'
```

**Response:**
```json
{
  "id": "e09a31c7-fcb6-40b7-adaf-8ccf07418a04",
  "status": "approved",
  "reviewed_at": "2025-11-04T13:18:53.268253",
  "message": "Analysis has been approved"
}
```

#### 4. Get All Reviews (with optional filter)
```bash
# All reviews
curl -H 'X-User-Mode: reviewer' \
     http://localhost:3030/reviews/all

# Filter by status
curl -H 'X-User-Mode: reviewer' \
     'http://localhost:3030/reviews/all?status=approved'

# Available statuses: pending_review, approved, rejected
```

## Mode Switching

The API enforces role-based access control using the `X-User-Mode` header:

- **User mode** (`X-User-Mode: user`): Can submit analyses and view results
- **Reviewer mode** (`X-User-Mode: reviewer`): Can view pending reviews and make decisions

### Example: Switching Modes

```bash
# As a user - submit analysis
curl -H 'X-User-Mode: user' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/analyze \
     -d '{"text":"Sample compliance text"}'

# Switch to reviewer - approve the analysis
curl -H 'X-User-Mode: reviewer' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/reviews/{analysis_id}/decision \
     -d '{"decision":"approve","notes":"Looks good"}'

# Switch back to user - view the result
curl -H 'X-User-Mode: user' \
     http://localhost:3030/analysis/{analysis_id}
```

## Compliance Scoring

The API automatically computes compliance scores based on:

- **Compliance keywords**: GDPR, privacy, consent, data protection, secure, confidential (+5 points each)
- **Risk keywords**: leak, breach, unauthorized, violation, illegal (-15 points each)
- **Base score**: 70.0

### Risk Levels
- **Low**: Score ≥ 80
- **Medium**: Score 50-79
- **High**: Score < 50

### Flags
The system generates flags for:
- Risk-related keywords detected
- Text too short for proper analysis
- Low compliance scores requiring review

## Error Handling

### Missing Mode Header
```bash
curl http://localhost:3030/analyze
# Response: {"detail":"Access denied. This endpoint requires 'user' mode..."}
```

### Wrong Mode
```bash
curl -H 'X-User-Mode: user' http://localhost:3030/reviews/pending
# Response: {"detail":"Access denied. This endpoint requires 'reviewer' mode..."}
```

### Analysis Not Found
```bash
curl -H 'X-User-Mode: user' http://localhost:3030/analysis/invalid-id
# Response: {"detail":"Analysis invalid-id not found"}
```

### Already Reviewed
```bash
# Trying to review an already-reviewed analysis
# Response: {"detail":"Analysis {id} has already been reviewed. Status: approved"}
```

## Data Storage

Currently using **in-memory storage** (as requested). Data is stored in a dictionary and will be lost when the API restarts.

To add database persistence later:
1. Enable PostgreSQL in `src/backend/conf.py`
2. Create database models in `src/backend/db/models.py`
3. Replace `analyses_store` dict with database queries

## Complete Workflow Example

```bash
# 1. User submits text for analysis
ANALYSIS_ID=$(curl -s -H 'X-User-Mode: user' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/analyze \
     -d '{"text":"This contains sensitive customer data requiring GDPR compliance."}' \
     | jq -r '.id')

echo "Created analysis: $ANALYSIS_ID"

# 2. Reviewer gets pending reviews
curl -H 'X-User-Mode: reviewer' \
     http://localhost:3030/reviews/pending

# 3. Reviewer approves the analysis
curl -H 'X-User-Mode: reviewer' \
     -H 'Content-Type: application/json' \
     -X POST http://localhost:3030/reviews/$ANALYSIS_ID/decision \
     -d '{"decision":"approve","notes":"GDPR compliance verified."}'

# 4. User checks the final result
curl -H 'X-User-Mode: user' \
     http://localhost:3030/analysis/$ANALYSIS_ID
```

## API Documentation

Interactive API documentation is available at:
- Swagger UI: `http://localhost:3030/docs`
- ReDoc: `http://localhost:3030/redoc`

## Development

To view API logs:
```bash
# Using Polytope MCP tool
__polytope__get_container_logs(container: api, limit: 50)
```

To restart the API (if needed):
```bash
__polytope__restart_container(container: api)
