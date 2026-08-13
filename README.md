<<<<<<< HEAD
<<<<<<< HEAD
# Clarity B2B - Supply Chain Finance Portal

Clarity is a modern, premium B2B Supply Chain Finance platform designed to help suppliers track their invoice statuses, request early payment discounts, and manage cash flow.

## 🚀 Features

- **Invoice Pipeline Tracker:** Real-time visual tracking of invoices from "Submitted" to "Completed".
- **Dynamic Dashboard:** View overall cash flow, payout history, and pending invoices.
- **Smart Data Synchronization:** Connects live to a Supabase PostgreSQL backend.
- **Premium UI/UX:** Built with React, featuring a highly polished, minimalist SaaS aesthetic.

## 📁 Project Structure

This is a monorepo containing both the frontend client and the backend server.

- `/frontend` - The React (Vite) client application.
- `/backend` - The Express.js Node API server.

## 🛠️ Tech Stack

**Frontend:**
- React 19
- Vite
- Lucide React (Icons)
- CSS (Custom B2B Design System)

**Backend:**
- Node.js & Express
- Supabase (PostgreSQL)
- Swagger UI (API Documentation)

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MIhirDas10/Clarity-supply-chain-finance.git
   cd Clarity-supply-chain-finance
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   # Create a .env file with your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   npm run dev
   ```
   *The backend will run on `http://localhost:5000`. You can view the API documentation at `http://localhost:5000/api-docs`.*

3. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```
   *The frontend will run on `http://localhost:5174` (or similar).*

## 🤝 Contributing
1. Create a new branch (`git checkout -b feature/your-feature`)
2. Commit your changes
3. Push to the branch
4. Open a Pull Request
=======
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
>>>>>>> module1-integration
=======

>>>>>>> 7a282f768bceb3cb2eadb6b7f9169eaff865cfb3
