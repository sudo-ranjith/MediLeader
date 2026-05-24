import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .database import engine, Base
from .routes import auth, medicines, customers, invoices, sync, reports

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Pharma Vault API",
    description="Cloud sync backend for Pharma Vault pharmacy management system",
    version="1.0.0",
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost,http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(medicines.router)
app.include_router(customers.router)
app.include_router(invoices.router)
app.include_router(sync.router)
app.include_router(reports.router)


@app.get("/")
async def root():
    return {"message": "Pharma Vault API v1.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
