import express from "express";
import cors from "cors";
import { supabase } from "./supabase";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// POST /api/invoices - Create a new invoice
app.post("/api/invoices", async (req, res) => {
  try {
    const {
      supplier_id,
      buyer_name,
      invoice_number,
      amount,
      due_date,
      file_url,
      discount_days,
      discounted_amount
    } = req.body;

    if (!supplier_id || !buyer_name || !invoice_number || !amount || !due_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert([
        {
          supplier_id,
          buyer_name,
          invoice_number,
          amount,
          due_date,
          file_url: file_url || null,
          status: "Pending",
          // discount fields can be added to the db if needed, but for now we follow the existing schema
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Failed to create invoice" });
    }

    return res.status(201).json({ success: true, invoice: data });
  } catch (err) {
    console.error("Internal server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/invoices - Get all invoices (for testing)
app.get("/api/invoices", async (req, res) => {
  try {
    const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: "Failed to fetch invoices" });
    }
    
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
