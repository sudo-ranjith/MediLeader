def test_list_medicines_empty(client, auth_headers):
    resp = client.get("/api/v1/medicines/", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_medicine(client, auth_headers):
    payload = {
        "name": "Paracetamol 500mg",
        "hsn_code": "30049099",
        "gst_rate": 5,
        "unit": "strip",
        "price": 25.0,
        "cost": 15.0,
        "manufacturer": "Generic Pharma",
    }
    resp = client.post("/api/v1/medicines/", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Paracetamol 500mg"
    assert data["id"] is not None
    assert data["sync_id"] is not None


def test_get_medicine(client, auth_headers):
    create_resp = client.post(
        "/api/v1/medicines/",
        json={"name": "Ibuprofen 400mg", "price": 30.0, "cost": 18.0, "gst_rate": 5},
        headers=auth_headers,
    )
    med_id = create_resp.json()["id"]
    resp = client.get(f"/api/v1/medicines/{med_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Ibuprofen 400mg"


def test_update_medicine(client, auth_headers):
    create_resp = client.post(
        "/api/v1/medicines/",
        json={"name": "Aspirin 100mg", "price": 10.0, "cost": 5.0, "gst_rate": 0},
        headers=auth_headers,
    )
    med_id = create_resp.json()["id"]
    resp = client.put(
        f"/api/v1/medicines/{med_id}",
        json={"name": "Aspirin 100mg", "price": 12.0, "cost": 5.0, "gst_rate": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["price"] == 12.0


def test_delete_medicine(client, auth_headers):
    create_resp = client.post(
        "/api/v1/medicines/",
        json={"name": "Vitamin C 500mg", "price": 20.0, "cost": 10.0, "gst_rate": 12},
        headers=auth_headers,
    )
    med_id = create_resp.json()["id"]
    resp = client.delete(f"/api/v1/medicines/{med_id}", headers=auth_headers)
    assert resp.status_code == 200

    get_resp = client.get(f"/api/v1/medicines/{med_id}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_search_medicines(client, auth_headers):
    client.post("/api/v1/medicines/", json={"name": "Amoxicillin 500mg", "price": 80.0, "cost": 50.0, "gst_rate": 5}, headers=auth_headers)
    client.post("/api/v1/medicines/", json={"name": "Metformin 500mg", "price": 15.0, "cost": 8.0, "gst_rate": 0}, headers=auth_headers)

    resp = client.get("/api/v1/medicines/?search=amox", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert "Amoxicillin" in results[0]["name"]


def test_unauthenticated_access(client):
    resp = client.get("/api/v1/medicines/")
    assert resp.status_code == 401
