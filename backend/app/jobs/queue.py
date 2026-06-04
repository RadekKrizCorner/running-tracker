from __future__ import annotations

from redis import Redis
from rq import Queue, get_current_job
from rq.exceptions import NoSuchJobError
from rq.job import Job
from rq.registry import DeferredJobRegistry, ScheduledJobRegistry, StartedJobRegistry

from app.core.config import get_settings

STRAVA_SYNC_TASKS = frozenset(
    {
        "app.jobs.tasks.strava_sync_history_task",
        "app.jobs.tasks.strava_sync_recent_task",
    }
)

SYNC_PROGRESS_FIELDS = frozenset(
    {
        "phase",
        "imported",
        "skipped",
        "streams",
        "current_activity",
        "started_at",
        "updated_at",
    }
)


def get_queue() -> Queue:
    """Return the default RQ queue."""
    redis = Redis.from_url(get_settings().redis_url)
    return Queue("running-tracker", connection=redis)


def enqueue_task(function_path: str, *args) -> str:
    """Enqueue a task and return the job id."""
    job = get_queue().enqueue(function_path, *args)
    return str(job.id)


def update_current_job_progress(progress: dict) -> None:
    """Store sanitized sync progress on the current RQ job."""
    job = get_current_job()
    if job is None:
        return
    existing = sanitize_sync_progress(job.meta.get("progress")) or {}
    updated = sanitize_sync_progress({**existing, **progress})
    if updated is None:
        return
    job.meta["progress"] = updated
    job.save_meta()


def sanitize_sync_progress(progress: object) -> dict | None:
    """Return a whitelisted sync progress payload."""
    if not isinstance(progress, dict):
        return None
    current_activity = progress.get("current_activity")
    return {
        "phase": str(progress.get("phase") or "queued"),
        "imported": _safe_int(progress.get("imported")),
        "skipped": _safe_int(progress.get("skipped")),
        "streams": _safe_int(progress.get("streams")),
        "current_activity": str(current_activity) if current_activity not in {None, ""} else None,
        "started_at": _safe_string(progress.get("started_at")),
        "updated_at": _safe_string(progress.get("updated_at")),
    }


def find_active_owner_job(owner_id: str, function_paths: set[str] | frozenset[str] | None = None) -> str | None:
    """Return an active queued or running job id for an owner."""
    paths = set(function_paths or STRAVA_SYNC_TASKS)
    queue = get_queue()
    for job in _iter_active_jobs(queue):
        if _job_belongs_to_owner(job, owner_id) and _job_function_path(job) in paths:
            return str(job.id)
    return None


def get_job_status(job_id: str, owner_id: str | None = None) -> dict:
    """Return normalized status details for an RQ job."""
    try:
        queue = get_queue()
        job = Job.fetch(job_id, connection=queue.connection)
        if owner_id is not None and not _job_belongs_to_owner(job, owner_id):
            return _missing_job_status(job_id)
        status = _normalize_status(job.get_status(refresh=True))
        return {
            "job_id": job_id,
            "status": status,
            "detail": _status_detail(status),
            "result": job.result if status == "finished" else None,
            "error": _job_error(job) if status == "failed" else None,
            "progress": sanitize_sync_progress(job.meta.get("progress")),
        }
    except NoSuchJobError:
        return _missing_job_status(job_id)
    except Exception:
        return {
            "job_id": job_id,
            "status": "unknown",
            "detail": "Sync status is unavailable",
            "result": None,
            "error": None,
            "progress": None,
        }


def _iter_active_jobs(queue: Queue):
    """Yield queued, started, deferred, and scheduled jobs."""
    seen: set[str] = set()
    for job in queue.jobs:
        job_id = str(job.id)
        if job_id not in seen:
            seen.add(job_id)
            yield job
    for registry in (
        StartedJobRegistry(queue=queue),
        DeferredJobRegistry(queue=queue),
        ScheduledJobRegistry(queue=queue),
    ):
        for job_id in registry.get_job_ids():
            if job_id in seen:
                continue
            try:
                job = Job.fetch(job_id, connection=queue.connection)
            except NoSuchJobError:
                continue
            seen.add(job_id)
            yield job


def _missing_job_status(job_id: str) -> dict:
    """Return a non-leaking response for missing or inaccessible jobs."""
    return {
        "job_id": job_id,
        "status": "unknown",
        "detail": "Sync job was not found",
        "result": None,
        "error": None,
        "progress": None,
    }


def _job_belongs_to_owner(job: Job, owner_id: str) -> bool:
    """Return whether an RQ sync job belongs to the owner."""
    return bool(job.args) and str(job.args[0]) == owner_id


def _job_function_path(job: Job) -> str | None:
    """Return the import path for an RQ job function."""
    func_name = getattr(job, "func_name", None) or getattr(job, "_func_name", None)
    if func_name is not None:
        return str(func_name)
    func = getattr(job, "func", None)
    if func is None:
        return None
    module = getattr(func, "__module__", None)
    qualname = getattr(func, "__qualname__", None)
    if module and qualname:
        return f"{module}.{qualname}"
    return str(func)


def _normalize_status(status: object) -> str:
    """Convert RQ status values to stable API strings."""
    raw = getattr(status, "value", str(status))
    if raw.startswith("JobStatus."):
        return raw.split(".", maxsplit=1)[1].lower()
    return raw.lower()


def _status_detail(status: str) -> str:
    """Return user-facing text for a sync job status."""
    details = {
        "queued": "Strava sync is queued",
        "deferred": "Strava sync is waiting",
        "scheduled": "Strava sync is scheduled",
        "started": "Strava sync is running",
        "finished": "Strava sync finished",
        "failed": "Strava sync failed",
    }
    return details.get(status, "Sync status is unavailable")


def _job_error(job: Job) -> str | None:
    """Return a compact job failure message."""
    if not job.exc_info:
        return None
    return job.exc_info.splitlines()[-1]


def _safe_int(value: object) -> int:
    """Return a non-negative integer for sync progress counters."""
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError):
        return 0


def _safe_string(value: object) -> str | None:
    """Return a string progress value or None."""
    if value in {None, ""}:
        return None
    return str(value)
