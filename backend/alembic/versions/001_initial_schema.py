"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.String(), default='cashier'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )
    op.create_table(
        'medicines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, index=True),
        sa.Column('hsn_code', sa.String(), unique=True, nullable=True, index=True),
        sa.Column('gst_rate', sa.Float(), default=0),
        sa.Column('unit', sa.String()),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('cost', sa.Float(), nullable=False),
        sa.Column('barcode', sa.String(), nullable=True),
        sa.Column('manufacturer', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )
    op.create_table(
        'stock',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('medicine_id', sa.Integer(), sa.ForeignKey('medicines.id'), nullable=False),
        sa.Column('batch_number', sa.String(), nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=False),
        sa.Column('quantity', sa.Integer(), default=0),
        sa.Column('reorder_level', sa.Integer(), default=10),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
        sa.UniqueConstraint('medicine_id', 'batch_number'),
    )
    op.create_table(
        'customers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, index=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('address', sa.String(), nullable=True),
        sa.Column('city', sa.String(), nullable=True),
        sa.Column('gst_number', sa.String(), nullable=True),
        sa.Column('credit_limit', sa.Float(), default=0),
        sa.Column('credit_used', sa.Float(), default=0),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )
    op.create_table(
        'invoices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('invoice_number', sa.String(), unique=True, nullable=False, index=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id'), nullable=True),
        sa.Column('customer_name', sa.String(), nullable=True),
        sa.Column('date', sa.Date()),
        sa.Column('subtotal', sa.Float(), default=0),
        sa.Column('gst_amount', sa.Float(), default=0),
        sa.Column('discount', sa.Float(), default=0),
        sa.Column('total', sa.Float(), default=0),
        sa.Column('payment_method', sa.String(), default='cash'),
        sa.Column('status', sa.String(), default='draft'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )
    op.create_table(
        'invoice_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('medicine_id', sa.Integer(), sa.ForeignKey('medicines.id'), nullable=False),
        sa.Column('medicine_name', sa.String(), nullable=False),
        sa.Column('stock_id', sa.Integer(), nullable=True),
        sa.Column('batch_number', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Float(), nullable=False),
        sa.Column('gst_rate', sa.Float(), default=0),
        sa.Column('gst_amount', sa.Float(), default=0),
        sa.Column('item_total', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime()),
    )
    op.create_table(
        'suppliers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, index=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('address', sa.String(), nullable=True),
        sa.Column('city', sa.String(), nullable=True),
        sa.Column('gst_number', sa.String(), nullable=True),
        sa.Column('dl_number', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )
    op.create_table(
        'purchase_orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('po_number', sa.String(), unique=True, nullable=False, index=True),
        sa.Column('supplier_id', sa.Integer(), sa.ForeignKey('suppliers.id'), nullable=False),
        sa.Column('supplier_name', sa.String(), nullable=True),
        sa.Column('date', sa.Date()),
        sa.Column('expected_delivery', sa.Date(), nullable=True),
        sa.Column('total_amount', sa.Float(), default=0),
        sa.Column('status', sa.String(), default='draft'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )
    op.create_table(
        'po_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('po_id', sa.Integer(), sa.ForeignKey('purchase_orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('medicine_id', sa.Integer(), sa.ForeignKey('medicines.id'), nullable=False),
        sa.Column('medicine_name', sa.String(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Float(), nullable=False),
        sa.Column('received_quantity', sa.Integer(), default=0),
        sa.Column('batch_number', sa.String(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
    )
    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('method', sa.String(), default='cash'),
        sa.Column('date', sa.Date()),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('sync_id', sa.String(), unique=True, nullable=True),
    )


def downgrade() -> None:
    for table in ['payments', 'po_items', 'purchase_orders', 'suppliers', 'invoice_items', 'invoices', 'customers', 'stock', 'medicines', 'users']:
        op.drop_table(table)
