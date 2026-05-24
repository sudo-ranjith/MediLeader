from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


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

    def to_dict(obj):
        d = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
        for k, v in d.items():
            if isinstance(v, datetime):
                d[k] = v.isoformat()
            elif hasattr(v, 'isoformat'):
                d[k] = v.isoformat()
        return d

    return {
        "medicines": [to_dict(m) for m in medicines],
        "stock": [to_dict(s) for s in stock],
        "customers": [to_dict(c) for c in customers],
        "invoices": [to_dict(i) for i in invoices],
        "suppliers": [to_dict(s) for s in suppliers],
        "server_time": datetime.utcnow().isoformat(),
    }


@router.post("/push")
async def sync_push(request: schemas.SyncPushRequest, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    conflicts = []
    changes = request.changes

    for med_data in changes.get("medicines", []):
        existing = db.query(models.Medicine).filter(models.Medicine.sync_id == med_data.get("sync_id")).first()
        if existing:
            server_updated = existing.updated_at
            client_updated = datetime.fromisoformat(med_data.get("updated_at", "2000-01-01"))
            if server_updated and server_updated > client_updated:
                conflicts.append({"type": "medicine", "sync_id": med_data.get("sync_id")})
            else:
                for k, v in med_data.items():
                    if hasattr(existing, k) and k not in ("id", "sync_id"):
                        setattr(existing, k, v)
        else:
            obj = models.Medicine(**{k: v for k, v in med_data.items() if hasattr(models.Medicine, k)})
            db.add(obj)

    db.commit()
    return {"success": True, "conflicts": conflicts}
