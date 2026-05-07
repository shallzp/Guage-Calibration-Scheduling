from fastapi import FastAPI

from app.api.routes import gauges, system

app = FastAPI(title="Gauge ML Service")

app.state.risk_service = None
app.state.startup_error = None

app.include_router(gauges.router)
app.include_router(system.router)
