from __future__ import annotations

from redis import Redis
from rq import Worker

from app.core.config import get_settings


def main() -> None:
    """Start the RQ worker."""
    redis = Redis.from_url(get_settings().redis_url)
    Worker(["running-tracker"], connection=redis).work()


if __name__ == "__main__":
    main()

