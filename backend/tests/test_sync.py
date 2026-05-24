from app.models import Medicine
import uuid


def _create_medicine(db, name="Test Med", sync_id=None):
    med = Medicine(
        name=name,
        price=50.0,
        cost=30.0,
        gst_rate=5.0,
        sync_id=sync_id or str(uuid.uuid4()),
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


def test_sync_pull_returns_empty_on_future_timestamp(client, auth_headers):
    resp = client.post(
        "/api/v1/sync/pull",
        json={"last_sync_time": "2099-01-01T00:00:00"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["medicines"] == []
    assert data["customers"] == []
    assert "server_time" in data


def test_sync_pull_returns_medicines_after_timestamp(client, db, auth_headers):
    _create_medicine(db, "Pulled Med")
    resp = client.post(
        "/api/v1/sync/pull",
        json={"last_sync_time": "2000-01-01T00:00:00"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["medicines"]) >= 1


def test_sync_push_creates_new_medicine(client, auth_headers):
    sync_id = str(uuid.uuid4())
    resp = client.post(
        "/api/v1/sync/push",
        json={
            "changes": {
                "medicines": [{
                    "name": "Pushed Medicine",
                    "price": 30.0,
                    "cost": 15.0,
                    "gst_rate": 5.0,
                    "sync_id": sync_id,
                    "updated_at": "2024-01-01T00:00:00",
                }]
            }
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["conflicts"] == []


def test_sync_push_conflict_detection(client, db, auth_headers):
    from datetime import datetime
    sync_id = str(uuid.uuid4())
    med = _create_medicine(db, "Server Medicine", sync_id=sync_id)
    # Server updated_at is "now" (recent), client sends an older updated_at
    resp = client.post(
        "/api/v1/sync/push",
        json={
            "changes": {
                "medicines": [{
                    "name": "Client Medicine",
                    "price": 999.0,
                    "cost": 500.0,
                    "gst_rate": 12.0,
                    "sync_id": sync_id,
                    "updated_at": "2000-01-01T00:00:00",
                }]
            }
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conflicts"]) == 1
    assert data["conflicts"][0]["sync_id"] == sync_id


def test_sync_unauthorized(client):
    resp = client.post("/api/v1/sync/pull", json={"last_sync_time": "2000-01-01T00:00:00"})
    assert resp.status_code == 401
