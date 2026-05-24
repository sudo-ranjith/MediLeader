from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/daily-sales")
async def daily_sales(date_from: str, date_to: str, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    result = db.execute(text(
        "SELECT COUNT(*) as transactions, COALESCE(SUM(total),0) as revenue, "
        "COALESCE(SUM(gst_amount),0) as gst_collected, COALESCE(AVG(total),0) as avg_transaction "
        "FROM invoices WHERE date BETWEEN :from AND :to AND status='paid'"
    ), {"from": date_from, "to": date_to}).mappings().first()
    return dict(result)


@router.get("/medicine-sales")
async def medicine_sales(date_from: str, date_to: str, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    result = db.execute(text(
        "SELECT m.name, SUM(ii.quantity) as qty_sold, SUM(ii.item_total) as revenue, "
        "SUM(ii.quantity * (m.price - m.cost)) as profit "
        "FROM invoice_items ii JOIN medicines m ON m.id=ii.medicine_id "
        "JOIN invoices i ON i.id=ii.invoice_id "
        "WHERE i.date BETWEEN :from AND :to AND i.status='paid' "
        "GROUP BY m.id ORDER BY revenue DESC"
    ), {"from": date_from, "to": date_to}).mappings().all()
    return [dict(r) for r in result]


@router.get("/inventory-valuation")
async def inventory_valuation(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    result = db.execute(text(
        "SELECT m.name, SUM(s.quantity) as total_qty, m.cost, SUM(s.quantity * m.cost) as total_value "
        "FROM stock s JOIN medicines m ON m.id=s.medicine_id "
        "WHERE s.quantity > 0 GROUP BY m.id ORDER BY total_value DESC"
    )).mappings().all()
    return [dict(r) for r in result]


@router.get("/expiry-tracking")
async def expiry_tracking(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    result = db.execute(text(
        "SELECT m.name, s.batch_number, s.expiry_date, s.quantity "
        "FROM stock s JOIN medicines m ON m.id=s.medicine_id "
        "WHERE s.quantity > 0 ORDER BY s.expiry_date ASC"
    )).mappings().all()
    return [dict(r) for r in result]
