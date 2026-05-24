from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="cashier")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)


class Medicine(Base):
    __tablename__ = "medicines"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    hsn_code = Column(String, unique=True, nullable=True, index=True)
    gst_rate = Column(Float, default=0)
    unit = Column(String)
    price = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)
    barcode = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)

    stocks = relationship("Stock", back_populates="medicine")
    invoice_items = relationship("InvoiceItem", back_populates="medicine")


class Stock(Base):
    __tablename__ = "stock"
    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    batch_number = Column(String, nullable=False)
    expiry_date = Column(Date, nullable=False)
    quantity = Column(Integer, default=0)
    reorder_level = Column(Integer, default=10)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)

    medicine = relationship("Medicine", back_populates="stocks")


class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    credit_limit = Column(Float, default=0)
    credit_used = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)

    invoices = relationship("Invoice", back_populates="customer")


class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer_name = Column(String, nullable=True)
    date = Column(Date, default=datetime.utcnow)
    subtotal = Column(Float, default=0)
    gst_amount = Column(Float, default=0)
    discount = Column(Float, default=0)
    total = Column(Float, default=0)
    payment_method = Column(String, default="cash")
    status = Column(String, default="draft")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)

    customer = relationship("Customer", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    medicine_name = Column(String, nullable=False)
    stock_id = Column(Integer, nullable=True)
    batch_number = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    gst_rate = Column(Float, default=0)
    gst_amount = Column(Float, default=0)
    item_total = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="items")
    medicine = relationship("Medicine", back_populates="invoice_items")


class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    dl_number = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)

    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    po_number = Column(String, unique=True, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    supplier_name = Column(String, nullable=True)
    date = Column(Date, default=datetime.utcnow)
    expected_delivery = Column(Date, nullable=True)
    total_amount = Column(Float, default=0)
    status = Column(String, default="draft")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_id = Column(String, unique=True, nullable=True)

    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship("POItem", back_populates="po", cascade="all, delete-orphan")


class POItem(Base):
    __tablename__ = "po_items"
    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    medicine_name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    received_quantity = Column(Integer, default=0)
    batch_number = Column(String, nullable=True)
    expiry_date = Column(Date, nullable=True)
    amount = Column(Float, nullable=False)

    po = relationship("PurchaseOrder", back_populates="items")
