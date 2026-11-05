from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="善款账本 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "welfare-fund-api"}


@app.get("/api/v1/projects/{project_id}")
def get_project(project_id: str) -> dict[str, object]:
    return {
        "id": project_id,
        "name": "Mountain School Water Access",
        "status": "active",
        "raised_amount": 128400,
        "target_amount": 180000,
        "executed_tranches": 1,
        "next_tranche": {
            "number": 2,
            "amount": 18600,
            "approval_count": 1,
            "opposition_count": 0,
            "donor_count": 3,
            "approval_threshold_percent": 50,
            "opposition_threshold_percent": 30,
            "status": "awaiting_vote",
        },
    }