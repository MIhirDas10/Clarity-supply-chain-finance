const supabase = require('../config/supabase');
const notificationService = require('../services/notificationService');

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

const ALLOWED_TRANSITIONS = {
    'Submitted': ['Buyer Confirmed', 'Disputed'],
    'Disputed': ['Submitted', 'Buyer Confirmed'],
    'Buyer Confirmed': ['Funded'],
    'Funded': ['Payout Initiated'],
    'Payout Initiated': ['Completed'],
    'Completed': []
};

// updating invoice status (the pipeline)
exports.updateInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatus, actorName, recipientEmail, note } = req.body;

        // 1. Fetch current invoice to get the old status
        const { data: currentInvoice, error: fetchError } = await supabase
            .from('invoices')
            .select('current_stage, status')
            .eq('id', id)
            .single();

        if (fetchError || !currentInvoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const oldStatus = currentInvoice.current_stage || currentInvoice.status || 'Submitted';

        // 2. Guarded transition: check if transition is allowed
        const allowedNextStates = ALLOWED_TRANSITIONS[oldStatus];
        if (!allowedNextStates || !allowedNextStates.includes(newStatus)) {
            return res.status(400).json({ 
                error: `Invalid transition from ${oldStatus} to ${newStatus}. Allowed next states: ${allowedNextStates ? allowedNextStates.join(', ') : 'none'}` 
            });
        }

        // 3. Update the invoice in Supabase
        const { error: updateError } = await supabase
            .from('invoices')
            .update({ current_stage: newStatus, status: newStatus })
            .eq('id', id);

        if (updateError) throw updateError;

        // 4. Record the transition in extended history table
        const { error: historyError } = await supabase
            .from('invoice_history')
            .insert([{
                invoice_id: id,
                old_status: oldStatus,
                stage: newStatus,
                note: note || '',
                actor: actorName || 'System Admin'
            }]);

        if (historyError) throw historyError;

        // 5. Trigger Notification & Email Engine
        await notificationService.sendNotification({
            recipient: recipientEmail || 'supplier@example.com',
            message: `Your invoice #${id} status has advanced to ${newStatus}. ${note ? 'Note: ' + note : ''}`,
            invoiceLink: `/pipeline?invoice=${id}`,
            type: 'status_update',
            emailSubject: `Invoice Status Update: ${newStatus}`
        });
        
        res.status(200).json({ message: `Invoice ${id} status successfully updated to ${newStatus}` });
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

        res.status(201).json(newInvoice);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
