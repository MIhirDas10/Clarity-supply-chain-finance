const supabase = require('../config/supabase');

// GET /api/notifications            (optional ?recipient=email)
// Return notifications, newest first. If a recipient is given, only that
// person's notifications are returned; otherwise all of them are returned.
exports.getNotifications = async (req, res) => {
    try {
        const recipient = req.query.recipient; // optional

        let query = supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        if (recipient) {
            query = query.eq('recipient', recipient);
        }

        const result = await query;

        if (result.error) {
            throw result.error;
        }

        res.status(200).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH /api/notifications/:id/read
// Mark one notification as read (seen by the user).
exports.markAsRead = async (req, res) => {
    try {
        const id = req.params.id;

        const result = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id)
            .select()
            .single();

        if (result.error) {
            throw result.error;
        }

        res.status(200).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
