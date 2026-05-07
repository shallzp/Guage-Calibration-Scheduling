from __future__ import annotations
from pydantic import BaseModel, ConfigDict


class ApplyFrequencyRequest(BaseModel):
	model_config = ConfigDict(extra="allow")
	new_frequency: int | None = None


class ApplyRescheduleRequest(BaseModel):
	model_config = ConfigDict(extra="allow")
	new_due_date: str | None = None
	current_due_date: str | None = None