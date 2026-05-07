import os
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from pymongo import MongoClient
from pymongo.database import Database

_client: MongoClient | None = None
_database: Database | None = None
_client_lock = threading.Lock()
_dotenv_loaded = False

# Load env variables
def _load_local_dotenv() -> None:
    global _dotenv_loaded
    if _dotenv_loaded:
        return

    dotenv_path = Path(__file__).resolve().parents[2] / '.env'
    if not dotenv_path.exists():
        _dotenv_loaded = True
        return

    for raw_line in dotenv_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if not key:
            continue
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)

    _dotenv_loaded = True


def _parse_bool_env(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return str(raw_value).strip().lower() in {'1', 'true', 'yes', 'on'}


# Get DB connection
def get_db() -> Database:
    global _client, _database

    if MongoClient is None:
        raise RuntimeError('pymongo is required to access MongoDB. Install dependencies from requirements.txt.')

    if _database is None:
        with _client_lock:
            if _database is None:
                _load_local_dotenv()
                mongo_uri = os.getenv('MONGO_URI')
                mongo_db_name = os.getenv('MONGO_DB_NAME')
                if not mongo_uri or not mongo_db_name:
                    raise RuntimeError(
                        'Missing MongoDB configuration. Set MONGO_URI and MONGO_DB_NAME '
                        '(for local runs, keep them in gc-ml/.env).'
                    )

                mongo_kwargs: dict[str, Any] = {
                    'serverSelectionTimeoutMS': int( '10000' )
                }
                if _parse_bool_env('MONGO_TLS_ALLOW_INVALID_CERTS', default=False):
                    mongo_kwargs['tlsAllowInvalidCertificates'] = True

                _client = MongoClient(
                    mongo_uri,
                    **mongo_kwargs,
                )
                _database = _client[mongo_db_name]

    return _database


def utc_timestamp() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'


def gauge_lookup_filter(gauge_identifier: str) -> dict[str, Any]:
    normalized = str(gauge_identifier or '').strip()
    return {
        '$or': [
            {'gauge_key': normalized},
            {'gauge_id': normalized},
        ]
    }


def sanitize_for_mongo(value: Any) -> Any:
    if value is None or value is pd.NA or value is pd.NaT:
        return None

    if isinstance(value, dict):
        return {
            str(key): sanitize_for_mongo(item)
            for key, item in value.items()
            if key != '_id'
        }

    if isinstance(value, (list, tuple, set)):
        return [sanitize_for_mongo(item) for item in value]

    if isinstance(value, np.ndarray):
        return [sanitize_for_mongo(item) for item in value.tolist()]

    if isinstance(value, np.generic):
        return sanitize_for_mongo(value.item())

    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else str(value)

    if isinstance(value, float) and pd.isna(value):
        return None

    if isinstance(value, (date, datetime)):
        return str(value)

    return value


def close_connection() -> None:
    global _client, _database

    if _client is not None:
        _client.close()

    _client = None
    _database = None
