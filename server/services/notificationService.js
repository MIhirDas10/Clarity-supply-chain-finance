const nodemailer = require('nodemailer');
const supabase = require('../config/supabase');

// Nodemailer transporter setup
// In a real application, these credentials would be environment variables
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'clarityb2b.demo@gmail.com',
        pass: process.env.EMAIL_PASS || 'demo-password',
    },
});

exports.sendNotification = async ({ recipient, message, invoiceLink, type, emailSubject }) => {
    try {
        // 1. Create In-App Notification Record
        const { error: dbError } = await supabase
            .from('notifications')
            .insert([{
                recipient: recipient || 'Supplier',
                message,
                invoice_link: invoiceLink,
                type: type || 'info'
            }]);

        if (dbError) {
            console.error('Failed to create in-app notification:', dbError);
            throw dbError;
        }

        // 2. Send matching Email
        const emailOptions = {
            from: process.env.EMAIL_USER || 'clarityb2b.demo@gmail.com',
            to: recipient || 'supplier@example.com',
            subject: emailSubject || 'Clarity B2B Invoice Update',
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2>Clarity B2B</h2>
                    <p>${message}</p>
                    ${invoiceLink ? `<p><a href="${invoiceLink}">View Invoice</a></p>` : ''}
                </div>
            `,
        };

        // Don't actually send emails if there's no password in the env, just log it.
        if (process.env.EMAIL_PASS) {
            await transporter.sendMail(emailOptions);
            console.log(`Notification email sent to ${emailOptions.to}`);
        } else {
            console.log(`Simulated email to ${emailOptions.to}: ${message}`);
        }
    } catch (error) {
        console.error('Notification Service Error:', error.message);
    }
};
