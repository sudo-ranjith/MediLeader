from app.models import Medicine, Stock
import datetime


def _create_medicine(client, auth_headers, name="Test Med"):
    resp = client.post(
        "/api/v1/medicines/",
        json={"name": name, "price": 50.0, "cost": 30.0, "gst_rate": 5},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()


def _create_stock(db, medicine_id: int, qty: int = 100):
    stock = Stock(
        medicine_id=medicine_id,
        batch_number="BATCH001",
        expiry_date=datetime.date(2026, 12, 31),
        quantity=qty,
        reorder_level=10,
    )
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


def test_create_invoice(client, db, auth_headers):
    med = _create_medicine(client, auth_headers)
    stock = _create_stock(db, med["id"])

    payload = {
        "invoice_number": "INV00001",
        "customer_name": "Walk-in Customer",
        "date": "2024-06-01",
        "subtotal": 47.62,
        "gst_amount": 2.38,
        "discount": 0,
        "total": 50.0,
        "payment_method": "cash",
        "status": "paid",
        "items": [
            {
                "medicine_id": med["id"],
                "medicine_name": med["name"],
                "stock_id": stock.id,
                "batch_number": "BATCH001",
                "quantity": 1,
                "unit_price": 47.62,
                "gst_rate": 5,
                "gst_amount": 2.38,
                "item_total": 50.0,
            }
        ],
    }
    resp = client.post("/api/v1/invoices/", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["invoice_number"] == "INV00001"
    assert data["total"] == 50.0
    assert len(data["items"]) == 1


def test_list_invoices(client, db, auth_headers):
    med = _create_medicine(client, auth_headers, "Med B")
    _create_stock(db, med["id"])

    client.post(
        "/api/v1/invoices/",
        json={
            "invoice_number": "INV00002",
            "date": "2024-06-01",
            "subtotal": 95.24,
            "gst_amount": 4.76,
            "discount": 0,
            "total": 100.0,
            "payment_method": "upi",
            "status": "paid",
            "items": [],
        },
        headers=auth_headers,
    )
    resp = client.get("/api/v1/invoices/", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_invoice_stock_deduction(client, db, auth_headers):
    med = _create_medicine(client, auth_headers, "Med C")
    stock = _create_stock(db, med["id"], qty=50)
    initial_qty = stock.quantity

    client.post(
        "/api/v1/invoices/",
        json={
            "invoice_number": "INV00003",
            "date": "2024-06-01",
            "subtotal": 95.24,
            "gst_amount": 4.76,
            "discount": 0,
            "total": 100.0,
            "payment_method": "cash",
            "status": "paid",
            "items": [{
                "medicine_id": med["id"],
                "medicine_name": med["name"],
                "stock_id": stock.id,
                "batch_number": "BATCH001",
                "quantity": 5,
                "unit_price": 19.05,
                "gst_rate": 5,
                "gst_amount": 4.76,
                "item_total": 100.0,
            }],
        },
        headers=auth_headers,
    )

    db.refresh(stock)
    assert stock.quantity == initial_qty - 5


def test_invoice_credit_payment(client, db, auth_headers):
    customer_resp = client.post(
        "/api/v1/customers/",
        json={"name": "Credit Customer", "credit_limit": 1000.0},
        headers=auth_headers,
    )
    assert customer_resp.status_code == 200
    customer = customer_resp.json()

    client.post(
        "/api/v1/invoices/",
        json={
            "invoice_number": "INV00004",
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "date": "2024-06-01",
            "subtotal": 200.0,
            "gst_amount": 0,
            "discount": 0,
            "total": 200.0,
            "payment_method": "credit",
            "status": "paid",
            "items": [],
        },
        headers=auth_headers,
    )

    get_resp = client.get(f"/api/v1/customers/{customer['id']}", headers=auth_headers)
    assert get_resp.json()["credit_used"] == 200.0
