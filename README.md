# Pharma Vault

Offline-first pharmacy management system for independent pharmacies in Tamil Nadu.

## Features

- **Medicine Inventory** — CRUD with HSN codes, GST rates, batch tracking
- **Stock Management** — Expiry alerts, low stock warnings, batch receipt
- **POS / Billing** — GST-compliant invoicing (0/5/12/18%), multiple payment methods
- **Customer Credit** — Credit limit management, purchase history
- **Suppliers & Purchase Orders** — Full PO lifecycle (draft → sent → received → auto-stock)
- **Reports** — 5 report types with CSV export and charts
- **Cloud Sync** — Offline-first with automatic background sync (Pro plan)
- **Multi-user** — Admin, Manager, Cashier roles with JWT auth

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 29 + React 18 + Vite |
| UI | Tailwind CSS + Recharts + Lucide icons |
| State | Zustand (auth store) |
| Local DB | SQLite via better-sqlite3 |
| Backend | FastAPI (Python 3.11+) |
| Cloud DB | PostgreSQL |
| Auth | JWT (local bcrypt + cloud jose) |

## Quick Start

### Desktop App (Development)

```bash
npm install
npm run dev
```

First launch creates an admin setup screen. Enter email + password to get started.

### Backend API

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Edit DATABASE_URL and JWT_SECRET
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Project Structure

```
pharma-vault/
├── src/
│   ├── main/          # Electron main process
│   │   ├── main.ts    # IPC handlers
│   │   ├── preload.ts # Context bridge
│   │   ├── db.ts      # SQLite + schema
│   │   └── auth.ts    # JWT + bcrypt
│   └── renderer/      # React app
│       ├── pages/     # 10 full pages
│       ├── components/ # Reusable components
│       ├── hooks/     # DB hooks
│       ├── stores/    # Zustand stores
│       └── utils/     # GST calc, invoice print
├── backend/           # FastAPI cloud backend
│   └── app/
│       ├── main.py    # App entry + CORS
│       ├── models.py  # SQLAlchemy ORM
│       ├── schemas.py # Pydantic schemas
│       ├── auth.py    # JWT helpers
│       └── routes/    # API endpoints
└── package.json
```

## Database Schema

11 tables: `users`, `medicines`, `stock`, `customers`, `invoices`, `invoice_items`, `payments`, `suppliers`, `purchase_orders`, `po_items`, `settings`

## Pricing

| Plan | Price | Features |
|------|-------|---------|
| Free | ₹0 | Desktop only, offline, 1 user |
| Pro | ₹999/month | Cloud sync, 3 users, advanced reports |
| Enterprise | Custom | Unlimited users, white-label, API access |

## Versioning

- `v0.1.0` — Project setup, database schema
- `v0.2.0` — React frontend (all 10 pages)
- `v0.3.0` — FastAPI backend + cloud sync
- `v1.0.0` — Production release
