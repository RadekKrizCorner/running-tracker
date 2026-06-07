from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
LOCAL_OVERLAY = REPO_ROOT / "infra/k8s/overlays/local"


def test_local_kubernetes_config_uses_valhalla() -> None:
    """Verify local Kubernetes routes suggestions through Valhalla."""
    config_text = (LOCAL_OVERLAY / "config.env").read_text()
    secret_example_text = (LOCAL_OVERLAY / "secret.env.example").read_text()
    config = _read_env_file(LOCAL_OVERLAY / "config.env")
    secret_example = _read_env_file(LOCAL_OVERLAY / "secret.env.example")

    assert "ROUTING_PROVIDER=local_demo" not in config_text
    assert "ROUTING_PROVIDER=local_demo" not in secret_example_text
    assert config["ROUTING_ENABLED"] == "true"
    assert config["ROUTING_PROVIDER"] == "valhalla"
    assert config["VALHALLA_BASE_URL"] == "http://valhalla:8002"
    assert secret_example["ROUTING_PROVIDER"] == "valhalla"
    assert secret_example["VALHALLA_BASE_URL"] == "http://valhalla:8002"


def test_local_kubernetes_includes_valhalla_resources() -> None:
    """Verify local Kubernetes includes Valhalla service and storage."""
    kustomization = (LOCAL_OVERLAY / "kustomization.yaml").read_text()
    manifest = (LOCAL_OVERLAY / "valhalla.yaml").read_text()

    assert "valhalla.yaml" in kustomization
    assert "kind: Service" in manifest
    assert "name: valhalla" in manifest
    assert "kind: Deployment" in manifest
    assert "kind: PersistentVolumeClaim" in manifest
    assert "image: ghcr.io/valhalla/valhalla-scripted:latest" in manifest
    assert "claimName: valhalla-data" in manifest
    assert "port: 8002" in manifest
    assert "containerPort: 8002" in manifest
    assert "download.geofabrik.de/europe/czech-republic-latest.osm.pbf" in manifest


def _read_env_file(path: Path) -> dict[str, str]:
    """Return key-value pairs from a simple env file."""
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key] = value
    return values
