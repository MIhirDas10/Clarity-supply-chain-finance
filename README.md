# Clarity - B2B Invoice Discounting and Supply Chain Finance Platform

## Overview
Small and medium-sized enterprises (SMEs) routinely wait 90 to 120 days to be paid on confirmed B2B invoices. This long payment cycle locks up working capital and stalls payroll, procurement, and growth. Clarity is a trusted, transparent marketplace that connects suppliers with funders willing to finance verified receivables, providing a single place to run the full financing lifecycle with proper confirmation, risk assessment, and settlement.

## Features

### Supplier Onboarding & Invoice Origination
- **Invoice Upload with OCR & Cloud Storage:** Upload invoice PDFs/images to Cloudinary; OCR extracts key fields and catches duplicate or invalid entries before financing begins.
- **Invoice Status Pipeline:** Guarded state machine (Submitted -> Buyer Confirmed -> Funded -> Payout Initiated -> Completed) with in-app notifications and email alerts.
- **Real-Time Discount Rate Calculator:** See exact payouts before accepting early funding based on the buyer's credit score.
- **Cash Flow Forecast Engine:** 30/60/90-day expected-inflow view built from real invoice and planned-expense records.

### Buyer Confirmation & Payables Management
- **Invoice Confirmation & Digital Acknowledgment:** Buyers confirm, request corrections, or dispute invoices. Confirmation gates marketplace eligibility.
- **Supplier Health & Distress-Signal Analytics:** Weighted supplier health score with Healthy/Watch/Distress bands.
- **Dispute Filing & Invoice Freeze:** Disputes atomically freeze invoices and remove them from funding until resolved.
- **Buyer-Funded Early Payment:** Buyers with surplus cash can pay suppliers early at a negotiated discount without a third-party funder.

### Funding Marketplace, Risk & Settlement
- **Invoice Marketplace with First-Come-First-Funded Locking:** Database row-level claim lock prevents double-funding.
- **Know Your Business (KYB):** Admin review for trade licenses, TIN certificates, and bank account details.
- **Investor Portfolio & Analytics:** Deployed capital tracking, projected vs. realized returns, maturity schedule, and adverse-scenario stress simulation.
- **Buyer Credit Scoring + Risk-Based Pricing:** Explainable buyer credit score that drives discount pricing, credit limits, and marketplace confidence.
- **Auto-Invest Rules:** Standing criteria to automatically fund matching invoices.
- **Wallet Funding:** Deposit capital and fund invoices through a reconciled wallet ledger.
- **Repayment & Settlement Engine:** Collects buyer repayment and runs the funder-return / platform-fee / supplier waterfall in one transaction.
- **Calendar Sync:** Syncs due and maturity dates with reminders to Google Calendar.

## System Architecture & Technologies

- **Frontend:** React (Vite), Tailwind CSS, Lucide React icons
- **Backend:** Node.js, Express
- **Database:** Supabase (managed PostgreSQL) with raw `pg` SQL (No ORM)
- **Authentication:** JWT (jsonwebtoken), bcrypt password hashing, Role-based Access Control (Supplier, Buyer, Funder, Admin)
- **External APIs:**
  - Cloudinary (Invoice document storage)
  - Nodemailer / Gmail SMTP (Email notifications)
  - bKash / UddoktaPay (Deposits)
  - Google Calendar API (Reminders)

## Technical Highlights
- **Robust Concurrency Control:** Row-level database locking (`SELECT ... FOR UPDATE`) guarantees race condition prevention in the invoice funding marketplace.
- **Guarded State Machines:** Strict status pipelines enforce business rules across all lifecycle events of an invoice.
- **Dynamic Discounting Engine:** Calculates complex pricing logic with safety checks using PostgreSQL database transactions.
