from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/medicines", tags=["medicines"])


@router.get("/", response_model=List[schemas.MedicineOut])
async def list_medicines(
    skip: int = 0, limit: int = 100, search: Optional[str] = None,
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    q = db.query(models.Medicine)
    if search:
        q = q.filter(models.Medicine.name.ilike(f"%{search}%"))
    return q.order_by(models.Medicine.name).offset(skip).limit(limit).all()


@router.get("/{medicine_id}", response_model=schemas.MedicineOut)
async def get_medicine(medicine_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    m = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return m


@router.post("/", response_model=schemas.MedicineOut)
async def create_medicine(data: schemas.MedicineCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    medicine = models.Medicine(**data.model_dump(exclude_none=True), sync_id=data.sync_id or str(uuid4()))
    db.add(medicine)
    db.commit()
    db.refresh(medicine)
    return medicine


@router.put("/{medicine_id}", response_model=schemas.MedicineOut)
async def update_medicine(medicine_id: int, data: schemas.MedicineUpdate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    m = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Medicine not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(m, key, value)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{medicine_id}")
async def delete_medicine(medicine_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    m = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Medicine not found")
    db.delete(m)
    db.commit()
    return {"success": True}
