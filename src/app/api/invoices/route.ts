import { NextRequest } from "next/server";
import { query } from "@/lib/db";

// ─── GET  /api/invoices ─────────────────────────────────────────────
export async function GET() {
  try {
    const result = await query(
      `SELECT id, supplier_id, buyer_name, invoice_number,
              amount, due_date, file_url, status, created_at
       FROM invoices
       ORDER BY created_at DESC`
    );

    return Response.json({ invoices: result.rows }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/invoices]", error);
    return Response.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

// ─── POST /api/invoices ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplier_id, buyer_name, invoice_number, amount, due_date, file_url } = body;

    // Basic validation
    const missing: string[] = [];
    if (!supplier_id) missing.push("supplier_id");
    if (!buyer_name) missing.push("buyer_name");
    if (!invoice_number) missing.push("invoice_number");
    if (amount == null || amount === "") missing.push("amount");
    if (!due_date) missing.push("due_date");

    if (missing.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO invoices (supplier_id, buyer_name, invoice_number, amount, due_date, file_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [supplier_id, buyer_name, invoice_number, parseFloat(amount), due_date, file_url || null]
    );

    return Response.json({ invoice: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/invoices]", error);

    // Handle duplicate invoice_number
    if (
      error instanceof Error &&
      error.message.includes("duplicate key")
    ) {
      return Response.json(
        { error: "An invoice with this number already exists" },
        { status: 409 }
      );
    }

    return Response.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}
