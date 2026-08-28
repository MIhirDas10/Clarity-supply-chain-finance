const nodemailer = require("nodemailer");
const pool = require("../db");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "clarityb2b.demo@gmail.com",
    pass: process.env.EMAIL_PASS || "demo-password",
  },
});

if (process.env.EMAIL_PASS) {
  transporter
    .verify()
    .then(() =>
      console.log("Email transporter ready - real emails will be sent."),
    )
    .catch((err) =>
      console.error("Email transporter FAILED to connect:", err.message),
    );
} else {
  console.log(
    "Email not configured (no EMAIL_PASS) - emails will be simulated in the console.",
  );
}

function buildEmailHtml({ message, invoiceLink, type }) {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const link = invoiceLink ? appUrl + invoiceLink : appUrl;

  let accent = "#2563eb";
  let accentBg = "#dbeafe";
  let label = "Notification";
  if (type === "distress_alert") {
    accent = "#dc2626";
    accentBg = "#fee2e2";
    label = "Supplier Alert";
  } else if (type === "status_update") {
    accent = "#2563eb";
    accentBg = "#dbeafe";
    label = "Invoice Update";
  } else if (type === "funding_status") {
    accent = "#d97706";
    accentBg = "#fef3c7";
    label = "Funding Update";
  } else if (type === "erp_overdue") {
    accent = "#d97706";
    accentBg = "#fef3c7";
    label = "Overdue Payables";
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

async function createInAppNotification({ recipient, message, invoiceLink, type }) {
  try {
    await pool.query(
      `INSERT INTO notifications (recipient, message, invoice_link, type)
       VALUES ($1, $2, $3, $4)`,
      [recipient || "Supplier", message, invoiceLink || null, type || "info"],
    );
    return true;
  } catch (error) {
    console.error("Failed to create in-app notification:", error.message);
    return false;
  }
}

exports.sendNotification = async ({
  recipient,
  message,
  invoiceLink,
  type,
  emailSubject,
}) => {
  const notificationCreated = await createInAppNotification({
    recipient,
    message,
    invoiceLink,
    type,
  });

  try {
    const emailOptions = {
      from: `Clarity B2B <${process.env.EMAIL_USER || "clarityb2b.demo@gmail.com"}>`,
      to: recipient || "supplier@example.com",
      subject: emailSubject || "Clarity B2B Invoice Update",
      html: buildEmailHtml({ message, invoiceLink, type }),
    };

    if (process.env.EMAIL_PASS) {
      await transporter.sendMail(emailOptions);
      console.log(`Notification email sent to ${emailOptions.to}`);
      return { notificationCreated, emailSent: true, simulated: false };
    } else {
      console.log(`Simulated email to ${emailOptions.to}: ${message}`);
      return { notificationCreated, emailSent: false, simulated: true };
    }
  } catch (error) {
    console.error("Notification Service Error:", error.message);
    return {
      notificationCreated,
      emailSent: false,
      simulated: false,
      error: error.message,
    };
  }
};
exports.buildEmailHtml = buildEmailHtml;
