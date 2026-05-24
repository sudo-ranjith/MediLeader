from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/stock", tags=["stock"])


@router.get("/", response_model=List[schemas.StockOut])
async def list_stock(
    medicine_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.Stock).filter(models.Stock.quantity > 0)
    if medicine_id:
        q = q.filter(models.Stock.medicine_id == medicine_id)
    return q.order_by(models.Stock.expiry_date.asc()).all()


@router.get("/{stock_id}", response_model=schemas.StockOut)
async def get_stock(stock_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    item = db.query(models.Stock).filter(models.Stock.id == stock_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Stock item not found")
    return item


@router.post("/", response_model=schemas.StockOut)
async def create_stock(data: schemas.StockCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    medicine = db.query(models.Medicine).filter(models.Medicine.id == data.medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    existing = db.query(models.Stock).filter(
        models.Stock.medicine_id == data.medicine_id,
        models.Stock.batch_number == data.batch_number,
    ).first()

    if existing:
        existing.quantity += data.quantity
        existing.expiry_date = data.expiry_date
        existing.reorder_level = data.reorder_level
        db.commit()
        db.refresh(existing)
        return existing

    item = models.Stock(
        medicine_id=data.medicine_id,
        batch_number=data.batch_number,
        expiry_date=data.expiry_date,
        quantity=data.quantity,
        reorder_level=data.reorder_level,
        sync_id=data.sync_id or str(uuid4()),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{stock_id}", response_model=schemas.StockOut)
async def update_stock(stock_id: int, data: schemas.StockCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    item = db.query(models.Stock).filter(models.Stock.id == stock_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Stock item not found")
    for field, value in data.model_dump(exclude={"sync_id"}).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{stock_id}")
async def delete_stock(stock_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    item = db.query(models.Stock).filter(models.Stock.id == stock_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Stock item not found")
    db.delete(item)
    db.commit()
    return {"success": True}
