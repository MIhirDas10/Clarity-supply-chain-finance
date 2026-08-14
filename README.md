# Clarity-B2B Invoice Discounting and Supply Chain Finance Platform

Clarity is a web-based supply chain finance platform designed to solve the cash-flow crisis faced by Bangladeshi SMEs (local suppliers). It connects three types of verified users - Suppliers, Buyers, and Funders - on a single digital marketplace. 

## Key Features
- **Suppliers:** Upload confirmed B2B invoices and receive early payments (up to 97% within 72 hours). Includes OCR parsing, discount rate calculator, cash flow forecasting, and savings tracker.
- **Buyers:** Confirm or dispute invoices digitally, manage upcoming payment calendars, and dynamically discount their own payables with surplus cash.
- **Funders:** Browse a verified invoice marketplace to fund receivables for short-term annualized returns, with risk-rating and auto-invest rules.
- **Admin:** Handles KYB verification, dispute resolution, compliance reports, and fee management.

## Tech Stack
- **Framework:** Next.js (App Router) / MERN Equivalent
- **Styling:** Tailwind CSS
- **Database & ORM:** PostgreSQL + Prisma
- **Key APIs:** Cloudinary (Storage), Tesseract.js (OCR), SSL Wireless (SMS), Nodemailer (Emails), bKash (Payments)

## Getting Started

First, install dependencies and generate Prisma types:
```bash
npm install
npx prisma generate
```

Then, run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
