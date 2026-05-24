from typing import List
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/suppliers", tags=["suppliers"])


@router.get("/", response_model=List[schemas.SupplierOut])
async def list_suppliers(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return db.query(models.Supplier).order_by(models.Supplier.name.asc()).all()


@router.get("/{supplier_id}", response_model=schemas.SupplierOut)
async def get_supplier(supplier_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.post("/", response_model=schemas.SupplierOut)
async def create_supplier(data: schemas.SupplierCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    supplier = models.Supplier(
        name=data.name,
        phone=data.phone,
        email=data.email,
        address=data.address,
        city=data.city,
        gst_number=data.gst_number,
        dl_number=data.dl_number,
        sync_id=data.sync_id or str(uuid4()),
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.put("/{supplier_id}", response_model=schemas.SupplierOut)
async def update_supplier(supplier_id: int, data: schemas.SupplierCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for field, value in data.model_dump(exclude={"sync_id"}).items():
        setattr(supplier, field, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(supplier)
    db.commit()
    return {"success": True}
