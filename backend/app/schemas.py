from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class Token(BaseModel):
    access_token: str
    user: dict


class LoginRequest(BaseModel):
    email: str
    password: str


class MedicineBase(BaseModel):
    name: str
    hsn_code: Optional[str] = None
    gst_rate: float = 0
    unit: Optional[str] = None
    price: float
    cost: float
    barcode: Optional[str] = None
    manufacturer: Optional[str] = None


class MedicineCreate(MedicineBase):
    sync_id: Optional[str] = None


class MedicineUpdate(MedicineBase):
    pass


class MedicineOut(MedicineBase):
    id: int
    sync_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class StockBase(BaseModel):
    medicine_id: int
    batch_number: str
    expiry_date: date
    quantity: int
    reorder_level: int = 10


class StockCreate(StockBase):
    sync_id: Optional[str] = None


class StockOut(StockBase):
    id: int
    sync_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gst_number: Optional[str] = None
    credit_limit: float = 0


class CustomerCreate(CustomerBase):
    sync_id: Optional[str] = None


class CustomerOut(CustomerBase):
    id: int
    credit_used: float = 0
    sync_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class InvoiceItemCreate(BaseModel):
    medicine_id: int
    medicine_name: str
    stock_id: Optional[int] = None
    batch_number: Optional[str] = None
    quantity: int
    unit_price: float
    gst_rate: float = 0
    gst_amount: float = 0
    item_total: float


class InvoiceItemOut(InvoiceItemCreate):
    id: int
    invoice_id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    invoice_number: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    date: Optional[date] = None
    subtotal: float
    gst_amount: float
    discount: float = 0
    total: float
    payment_method: str = "cash"
    status: str = "draft"
    notes: Optional[str] = None
    items: List[InvoiceItemCreate] = []
    sync_id: Optional[str] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    customer_id: Optional[int]
    customer_name: Optional[str]
    date: Optional[date]
    subtotal: float
    gst_amount: float
    discount: float
    total: float
    payment_method: str
    status: str
    notes: Optional[str]
    sync_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    items: List[InvoiceItemOut] = []

    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gst_number: Optional[str] = None
    dl_number: Optional[str] = None


class SupplierCreate(SupplierBase):
    sync_id: Optional[str] = None


class SupplierOut(SupplierBase):
    id: int
    sync_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class POItemBase(BaseModel):
    medicine_id: int
    medicine_name: str
    quantity: int
    unit_price: float
    received_quantity: int = 0
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    amount: float


class POItemCreate(POItemBase):
    pass


class POItemOut(POItemBase):
    id: int
    po_id: int

    class Config:
        from_attributes = True


class PurchaseOrderBase(BaseModel):
    po_number: str
    supplier_id: int
    supplier_name: Optional[str] = None
    date: Optional[date] = None
    expected_delivery: Optional[date] = None
    total_amount: float = 0
    status: str = "draft"
    notes: Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    items: List[POItemCreate] = []
    sync_id: Optional[str] = None


class PurchaseOrderOut(PurchaseOrderBase):
    id: int
    sync_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    items: List[POItemOut] = []

    class Config:
        from_attributes = True


class PaymentBase(BaseModel):
    invoice_id: int
    amount: float
    method: str = "cash"
    date: Optional[date] = None
    notes: Optional[str] = None


class PaymentCreate(PaymentBase):
    sync_id: Optional[str] = None


class PaymentOut(PaymentBase):
    id: int
    sync_id: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class SyncPullRequest(BaseModel):
    last_sync_time: str


class SyncPushRequest(BaseModel):
    changes: dict
