const supabase = require('../config/supabase');
const smsService = require('../services/smsService');
const healthController = require('./healthController');

// getting all the invoices for supplier
exports.getAllInvoices = async (req, res) => {
    try {
        const result = await supabase
            .from('invoices')
            .select(`
                id,
                number,
                invoice_number,
                buyerName:buyer_name,
                amount,
                invoice_amount,
                dueDate:due_date,
                currentStage:current_stage,
                status,
                history:invoice_history(stage, actor, timestamp)
            `)
            .order('created_at', { ascending: false });

        if (result.error) {
            throw result.error;
        }

        const invoices = result.data;
        const mappedInvoices = [];

        for (let i = 0; i < invoices.length; i++) {
            let inv = invoices[i];
            
            let finalNumber = inv.number;
            if (inv.invoice_number) {
                finalNumber = inv.invoice_number;
            }

            let finalAmount = inv.amount;
            if (inv.invoice_amount) {
                finalAmount = inv.invoice_amount;
            }

            let finalStage = inv.currentStage;
            if (inv.status) {
                finalStage = inv.status;
            }

            let mappedInvoice = {
                id: inv.id,
                number: finalNumber,
                buyerName: inv.buyerName,
                amount: finalAmount,
                dueDate: inv.dueDate,
                currentStage: finalStage,
                history: inv.history
            };

            mappedInvoices.push(mappedInvoice);
        }

        res.status(200).json(mappedInvoices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// get specific
exports.getInvoiceStatus = async (req, res) => {
    const { id } = req.params;
    res.status(200).json({ message: `Fetch status for invoice ${id}` });
};

// updating invoice status (the pipeline)
exports.updateInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatus, actorName, supplierPhone } = req.body;

        // Update the invoice in Supabase (updating both possible columns to be safe)
        const { error: updateError } = await supabase
            .from('invoices')
            .update({ current_stage: newStatus, status: newStatus })
            .eq('id', id);

        if (updateError) throw updateError;

        // Record the timestamp and actor in the history table
        const { error: historyError } = await supabase
            .from('invoice_history')
            .insert([{
                invoice_id: id,
                stage: newStatus,
                actor: actorName || 'System Admin'
            }]);

        if (historyError) throw historyError;

        // Send SMS
        await smsService.sendStatusUpdateSMS(supplierPhone, newStatus);
        
        // Recalculate health so it stays up to date
        await healthController.runRecalculation();
        
        res.status(200).json({ message: `Invoice ${id} status updated to ${newStatus}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// creating new invoice
exports.createInvoice = async (req, res) => {
    try {
        const { number, buyerName, amount, dueDate, actorName } = req.body;
        const { data: newInvoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert([{ 
                number, 
                buyer_name: buyerName, 
                amount, 
                due_date: dueDate,
                current_stage: 'Submitted'
            }])
            .select()
            .single();

        if (invoiceError) throw invoiceError;

        const { error: historyError } = await supabase
            .from('invoice_history')
            .insert([{
                invoice_id: newInvoice.id,
                stage: 'Submitted',
                actor: actorName || 'Supplier'
            }]);

        if (historyError) throw historyError;

        // Recalculate health so it stays up to date
        await healthController.runRecalculation();

        res.status(201).json(newInvoice);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
