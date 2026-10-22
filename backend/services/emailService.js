
const nodemailer = require("nodemailer");

const sendWelcomeEmail = async ({ name, email }) => {
  const required = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(
      `Missing email environment variables: ${missing.join(", ")}`
    );
  }

  const port = Number(process.env.SMTP_PORT || 587);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure:
      String(process.env.SMTP_SECURE).toLowerCase() === "true" ||
      port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Welcome to RESQ!",
    text: `Hi ${name}, welcome to RESQ! Your account has been created successfully.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Welcome to RESQ, ${escapeHtml(name)}!</h2>
        <p>Your account has been created successfully.</p>
        <p>Thank you for joining RESQ. We hope to make emergency coordination easier and more accessible.</p>
        <p>— Team RESQ</p>
      </div>
    `,
  });
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

module.exports = { sendWelcomeEmail };
