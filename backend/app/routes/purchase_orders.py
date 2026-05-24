from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/purchase-orders", tags=["purchase_orders"])


@router.get("/", response_model=List[schemas.PurchaseOrderOut])
async def list_purchase_orders(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.PurchaseOrder)
    if status:
        q = q.filter(models.PurchaseOrder.status == status)
    return q.order_by(models.PurchaseOrder.id.desc()).all()


@router.get("/{po_id}", response_model=schemas.PurchaseOrderOut)
async def get_purchase_order(po_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.post("/", response_model=schemas.PurchaseOrderOut)
async def create_purchase_order(data: schemas.PurchaseOrderCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == data.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    po = models.PurchaseOrder(
        po_number=data.po_number,
        supplier_id=data.supplier_id,
        supplier_name=data.supplier_name or supplier.name,
        date=data.date,
        expected_delivery=data.expected_delivery,
        total_amount=data.total_amount,
        status=data.status,
        notes=data.notes,
        sync_id=data.sync_id or str(uuid4()),
    )
    db.add(po)
    db.flush()

    for item_data in data.items:
        item = models.POItem(**item_data.model_dump(), po_id=po.id)
        db.add(item)

    db.commit()
    db.refresh(po)
    return po


@router.put("/{po_id}", response_model=schemas.PurchaseOrderOut)
async def update_purchase_order(po_id: int, data: schemas.PurchaseOrderCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    for field, value in data.model_dump(exclude={"sync_id", "items"}).items():
        setattr(po, field, value)
    db.commit()
    db.refresh(po)
    return po


@router.post("/{po_id}/receive")
async def receive_purchase_order(po_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status == "received":
        raise HTTPException(status_code=400, detail="Already received")

    for item in po.items:
        qty = item.received_quantity or item.quantity
        if qty > 0 and item.batch_number and item.expiry_date:
            existing = db.query(models.Stock).filter(
                models.Stock.medicine_id == item.medicine_id,
                models.Stock.batch_number == item.batch_number,
            ).first()
            if existing:
                existing.quantity += qty
            else:
                db.add(models.Stock(
                    medicine_id=item.medicine_id,
                    batch_number=item.batch_number,
                    expiry_date=item.expiry_date,
                    quantity=qty,
                    sync_id=str(uuid4()),
                ))

    po.status = "received"
    db.commit()
    return {"success": True, "po_id": po_id}


@router.delete("/{po_id}")
async def delete_purchase_order(po_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    db.delete(po)
    db.commit()
    return {"success": True}
