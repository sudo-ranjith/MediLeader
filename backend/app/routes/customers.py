from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])


@router.get("/", response_model=List[schemas.CustomerOut])
async def list_customers(
    skip: int = 0, limit: int = 100, search: Optional[str] = None,
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    q = db.query(models.Customer)
    if search:
        q = q.filter(models.Customer.name.ilike(f"%{search}%"))
    return q.order_by(models.Customer.name).offset(skip).limit(limit).all()


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
async def get_customer(customer_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


@router.post("/", response_model=schemas.CustomerOut)
async def create_customer(data: schemas.CustomerCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    customer = models.Customer(**data.model_dump(exclude_none=True))
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
async def update_customer(customer_id: int, data: schemas.CustomerCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{customer_id}")
async def delete_customer(customer_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(c)
    db.commit()
    return {"success": True}
