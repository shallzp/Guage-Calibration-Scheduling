from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import gauges, system

app = FastAPI(title="Gauge ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # fallback CRA / other dev servers
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.risk_service = None
app.state.startup_error = None

app.include_router(gauges.router)
app.include_router(system.router)
