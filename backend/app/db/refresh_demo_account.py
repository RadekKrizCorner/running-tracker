from __future__ import annotations

import argparse
from argparse import Namespace

from app.core.config import get_settings
from app.db.init_db import create_database
from app.db.session import get_session_factory
from app.services.demo_data_service import refresh_demo_account


def parse_args() -> Namespace:
    """Parse demo refresh command arguments."""
    parser = argparse.ArgumentParser(description="Refresh the portfolio demo account data.")
    pattern_group = parser.add_mutually_exclusive_group()
    pattern_group.add_argument(
        "--from-owner-patterns",
        action="store_true",
        help="Use safe owner aggregate patterns when owner data is available.",
    )
    pattern_group.add_argument(
        "--synthetic-only",
        action="store_true",
        help="Ignore owner aggregates and use synthetic fallback patterns.",
    )
    parser.add_argument("--weeks", type=int, default=None, help="Number of historical weeks to generate.")
    return parser.parse_args()


def main() -> None:
    """Refresh the configured demo account and print generated counts."""
    args = parse_args()
    settings = get_settings()
    if args.from_owner_patterns:
        from_owner_patterns = True
    elif args.synthetic_only:
        from_owner_patterns = False
    else:
        from_owner_patterns = None

    create_database()
    with get_session_factory()() as session:
        result = refresh_demo_account(
            session,
            settings,
            history_weeks=args.weeks,
            from_owner_patterns=from_owner_patterns,
        )

    print(
        "Refreshed demo account: "
        f"{result.activities} activities, "
        f"{result.streams} streams, "
        f"{result.planned_workouts} planned workouts, "
        f"{result.events} events, "
        f"{result.gear} gear items, "
        f"{result.start_date.isoformat()} to {result.end_date.isoformat()}"
    )


if __name__ == "__main__":
    main()
