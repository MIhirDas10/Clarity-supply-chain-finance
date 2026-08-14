const nodemailer = require('nodemailer');
const supabase = require('../config/supabase');

// Nodemailer transporter setup. The credentials come from the .env file:
//   EMAIL_USER=youraddress@gmail.com
//   EMAIL_PASS=your 16-character Gmail App Password (NOT your normal password)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'clarityb2b.demo@gmail.com',
        pass: process.env.EMAIL_PASS || 'demo-password',
    },
});

// Check the email connection once on startup so you get clear feedback:
//   - "Email transporter ready"  -> credentials work, real emails will send
//   - "Email transporter FAILED" -> wrong App Password / setup problem
//   - "Email not configured"     -> no EMAIL_PASS yet, emails are simulated
if (process.env.EMAIL_PASS) {
    transporter.verify()
        .then(() => console.log('Email transporter ready - real emails will be sent.'))
        .catch(err => console.error('Email transporter FAILED to connect:', err.message));
} else {
    console.log('Email not configured (no EMAIL_PASS) - emails will be simulated in the console.');
}

// Build the HTML body for an email. Kept in one place so every email that
// goes out looks the same. The colour and label change with the notification
// type so, for example, a distress alert reads red and an invoice update blue.
function buildEmailHtml({ message, invoiceLink, type }) {
    // Relative links (like "/health") do not work inside an email, so turn
    // them into a full URL to the app. Set APP_URL in .env for a deployed site.
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const link = invoiceLink ? appUrl + invoiceLink : appUrl;

    // Accent colour, light badge background, and a short label per type.
    let accent = '#2563eb';
    let accentBg = '#dbeafe';
    let label = 'Notification';
    if (type === 'distress_alert') {
        accent = '#dc2626';
        accentBg = '#fee2e2';
        label = 'Supplier Alert';
    } else if (type === 'status_update') {
        accent = '#2563eb';
        accentBg = '#dbeafe';
        label = 'Invoice Update';
    } else if (type === 'funding_status') {
        accent = '#d97706';
        accentBg = '#fef3c7';
        label = 'Funding Update';
    }

    return `
    <div style="margin:0; padding:24px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto;">
        <tr>
          <td style="background-color:#0f172a; padding:20px 28px; border-radius:12px 12px 0 0;">
            <span style="color:#ffffff; font-size:18px; font-weight:bold;">Clarity B2B</span>
            <span style="color:#94a3b8; font-size:12px; display:block; margin-top:2px;">Supply Chain Finance</span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff; padding:28px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
            <span style="display:inline-block; background-color:${accentBg}; color:${accent}; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; padding:5px 10px; border-radius:6px;">${label}</span>
            <p style="color:#0f172a; font-size:15px; line-height:1.6; margin:18px 0 24px 0;">${message}</p>
            <a href="${link}" style="display:inline-block; background-color:${accent}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; padding:12px 22px; border-radius:8px;">View in Clarity</a>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff; padding:0 28px 28px 28px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; border-radius:0 0 12px 12px;">
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0 16px 0;" />
            <p style="color:#94a3b8; font-size:12px; line-height:1.5; margin:0;">This is an automated message from Clarity B2B. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </div>`;
}

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

        // 2. Send matching Email using the shared branded template.
        const emailOptions = {
            from: `Clarity B2B <${process.env.EMAIL_USER || 'clarityb2b.demo@gmail.com'}>`,
            to: recipient || 'supplier@example.com',
            subject: emailSubject || 'Clarity B2B Invoice Update',
            html: buildEmailHtml({ message, invoiceLink, type }),
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

// Exported so the template can be previewed/tested without sending a real email.
exports.buildEmailHtml = buildEmailHtml;
