from __future__ import annotations

from pathlib import Path


def test_initial_migration_uses_explicit_operations() -> None:
    """Verify the initial migration is not coupled to live model metadata."""
    migration = Path(__file__).parents[2] / "alembic" / "versions" / "202604280001_initial_schema.py"
    source = migration.read_text()

    assert "Base.metadata.create_all" not in source
    assert "Base.metadata.drop_all" not in source
    assert "from app.db.base import Base" not in source
    assert "op.create_table" in source
