from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.get("/", response_model=List[schemas.PaymentOut])
async def list_payments(
    invoice_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.Payment)
    if invoice_id:
        q = q.filter(models.Payment.invoice_id == invoice_id)
    return q.order_by(models.Payment.id.desc()).all()


@router.post("/", response_model=schemas.PaymentOut)
async def create_payment(data: schemas.PaymentCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == data.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    payment = models.Payment(
        invoice_id=data.invoice_id,
        amount=data.amount,
        method=data.method,
        date=data.date,
        notes=data.notes,
        sync_id=data.sync_id or str(uuid4()),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}")
async def delete_payment(payment_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    db.delete(payment)
    db.commit()
    return {"success": True}
