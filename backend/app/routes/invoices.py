from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


@router.get("/", response_model=List[schemas.InvoiceOut])
async def list_invoices(
    skip: int = 0, limit: int = 50, status: Optional[str] = None,
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    q = db.query(models.Invoice)
    if status:
        q = q.filter(models.Invoice.status == status)
    return q.order_by(models.Invoice.id.desc()).offset(skip).limit(limit).all()


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
async def get_invoice(invoice_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    inv = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.post("/", response_model=schemas.InvoiceOut)
async def create_invoice(data: schemas.InvoiceCreate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    invoice = models.Invoice(
        invoice_number=data.invoice_number,
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        date=data.date,
        subtotal=data.subtotal,
        gst_amount=data.gst_amount,
        discount=data.discount,
        total=data.total,
        payment_method=data.payment_method,
        status=data.status,
        notes=data.notes,
        sync_id=data.sync_id or str(uuid4()),
    )
    db.add(invoice)
    db.flush()

    for item_data in data.items:
        item = models.InvoiceItem(**item_data.model_dump(), invoice_id=invoice.id)
        db.add(item)
        if item_data.stock_id:
            stock = db.query(models.Stock).filter(models.Stock.id == item_data.stock_id).first()
            if stock:
                stock.quantity -= item_data.quantity

    if data.payment_method == "credit" and data.customer_id:
        customer = db.query(models.Customer).filter(models.Customer.id == data.customer_id).first()
        if customer:
            customer.credit_used += data.total

    db.commit()
    db.refresh(invoice)
    return invoice
