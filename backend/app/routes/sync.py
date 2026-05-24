from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


def to_dict(obj):
    d = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
        elif hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
    return d


@router.post("/pull")
async def sync_pull(request: schemas.SyncPullRequest, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    try:
        last_sync = datetime.fromisoformat(request.last_sync_time.replace("Z", "+00:00"))
    except Exception:
        last_sync = datetime.min

    medicines = db.query(models.Medicine).filter(models.Medicine.updated_at > last_sync).all()
    stock = db.query(models.Stock).filter(models.Stock.updated_at > last_sync).all()
    customers = db.query(models.Customer).filter(models.Customer.updated_at > last_sync).all()
    invoices = db.query(models.Invoice).filter(models.Invoice.updated_at > last_sync).all()
    suppliers = db.query(models.Supplier).filter(models.Supplier.updated_at > last_sync).all()

    return {
        "medicines": [to_dict(m) for m in medicines],
        "stock": [to_dict(s) for s in stock],
        "customers": [to_dict(c) for c in customers],
        "invoices": [to_dict(i) for i in invoices],
        "suppliers": [to_dict(s) for s in suppliers],
        "server_time": datetime.utcnow().isoformat(),
    }


def _upsert_entity(db: Session, model_class, sync_id: str, data: dict, exclude_fields: set = None):
    exclude = exclude_fields or {"id"}
    existing = db.query(model_class).filter(model_class.sync_id == sync_id).first()
    if existing:
        server_updated = getattr(existing, 'updated_at', None)
        client_updated_str = data.get("updated_at", "2000-01-01")
        try:
            client_updated = datetime.fromisoformat(str(client_updated_str).replace("Z", "+00:00"))
        except Exception:
            client_updated = datetime.min

        if server_updated and server_updated > client_updated:
            return "conflict"

        for k, v in data.items():
            if hasattr(existing, k) and k not in exclude:
                setattr(existing, k, v)
        return "updated"
    else:
        filtered = {k: v for k, v in data.items() if hasattr(model_class, k) and k not in {"id"}}
        if "sync_id" not in filtered or not filtered["sync_id"]:
            filtered["sync_id"] = str(uuid4())
        db.add(model_class(**filtered))
        return "created"


@router.post("/push")
async def sync_push(request: schemas.SyncPushRequest, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    conflicts = []
    changes = request.changes

    entity_map = [
        ("medicines", models.Medicine, "medicine"),
        ("customers", models.Customer, "customer"),
        ("suppliers", models.Supplier, "supplier"),
    ]

    for key, model_class, conflict_type in entity_map:
        for item_data in changes.get(key, []):
            sync_id = item_data.get("sync_id")
            if not sync_id:
                continue
            result = _upsert_entity(db, model_class, sync_id, item_data)
            if result == "conflict":
                conflicts.append({"type": conflict_type, "sync_id": sync_id})

    # Handle invoices (create only, no updates to avoid double-billing)
    for inv_data in changes.get("invoices", []):
        sync_id = inv_data.get("sync_id")
        if not sync_id:
            continue
        existing = db.query(models.Invoice).filter(models.Invoice.sync_id == sync_id).first()
        if not existing:
            filtered = {k: v for k, v in inv_data.items() if hasattr(models.Invoice, k) and k not in {"id", "items"}}
            if not filtered.get("sync_id"):
                filtered["sync_id"] = str(uuid4())
            db.add(models.Invoice(**filtered))

    db.commit()
    return {"success": True, "conflicts": conflicts}
