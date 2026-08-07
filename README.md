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
