const Brevo = require('@getbrevo/brevo');

const apiInstance = new Brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// ✅ SEND PASSWORD SETUP EMAIL (for user invitation)
exports.sendPasswordSetupEmail = async (toEmail, firstName, resetLink) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.subject = "Set Your Password";
  sendSmtpEmail.htmlContent = getEmailTemplate(firstName, resetLink, "setup");
  sendSmtpEmail.sender = { name: "Ecom App", email: process.env.EMAIL_FROM };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Password setup email sent to ${toEmail}`);
  } catch (error) {
    console.error("Email send failed:", error);
    throw new Error('EMAIL_SEND_FAILED');
  }
};

// ✅ SEND FORGOT PASSWORD EMAIL
exports.sendForgotPasswordEmail = async (toEmail, firstName, resetLink) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.subject = "Reset Your Password";
  sendSmtpEmail.htmlContent = getEmailTemplate(firstName, resetLink, "forgot");
  sendSmtpEmail.sender = { name: "Ecom App", email: process.env.EMAIL_FROM };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Forgot password email sent to ${toEmail}`);
  } catch (error) {
    console.error("Email send failed:", error);
    throw new Error('EMAIL_SEND_FAILED');
  }
};

// ✅ SEND ORGANIZATION CREATION EMAIL
exports.sendOrganizationCreatedEmail = async (toEmail, firstName, organizationName, organizationSlug, resetLink) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.subject = `Your Organization "${organizationName}" Has Been Created`;
  sendSmtpEmail.htmlContent = getOrganizationEmailTemplate(firstName, organizationName, organizationSlug, resetLink);
  sendSmtpEmail.sender = { name: "Ecom App", email: process.env.EMAIL_FROM };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Organization creation email sent to ${toEmail}`);
  } catch (error) {
    console.error("Email send failed:", error);
    throw new Error('EMAIL_SEND_FAILED');
  }
};

// ✅ SEND COUPON EMAIL — couponCode is the 5th parameter
exports.sendCouponEmail = async (toEmail, firstName, amount, batchName, couponCode) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.subject = `🎁 A Special Gift for You: $${amount} Coupon!`;
  sendSmtpEmail.htmlContent = getCouponEmailTemplate(firstName, amount, batchName, couponCode);
  sendSmtpEmail.sender = { name: "Ecom App", email: process.env.EMAIL_FROM };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Coupon email sent to ${toEmail} with code ${couponCode}`);
  } catch (error) {
    console.error("Coupon Email failed:", error);
    throw new Error("COUPON_SEND_FAILED");
  }
};

// ─── Templates ───────────────────────────────────────────────────────────────

function getEmailTemplate(firstName, resetLink, type) {
  const isSetup = type === "setup";
  const title = isSetup ? "Set Your Password" : "Reset Your Password";
  const message = isSetup
    ? "Your account has been successfully created. Please click the button below to set your password and activate your account."
    : "We received a request to reset the password for your account. Click the button below to choose a new password.";
  const buttonText = isSetup ? "Set Your Password" : "Reset Password";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td align="center" style="background:linear-gradient(135deg, #1f2937 0%, #111827 100%);padding:30px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:bold;">Ecom Platform</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;color:#333333;">
              <h2 style="margin-top:0;font-size:20px;color:#1f2937;">Hello ${firstName},</h2>
              <p style="font-size:15px;line-height:24px;color:#555555;margin:20px 0;">${message}</p>
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:35px auto;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                    <a href="${resetLink}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px;color:#888888;text-align:center;margin:25px 0;"><strong>⏱️ This link will expire in 24 hours.</strong></p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />
              <p style="font-size:12px;color:#999999;text-align:center;">If you did not request this email, you can safely ignore it.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#f9fafb;padding:20px;font-size:12px;color:#888888;border-top:1px solid #e5e7eb;">
              © ${new Date().getFullYear()} Ecom Platform. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function getOrganizationEmailTemplate(firstName, organizationName, organizationSlug, resetLink) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Organization Created Successfully</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td align="center" style="background:linear-gradient(135deg, #07c586 0%, #059669 100%);padding:40px 30px;">
              <div style="font-size:48px;margin-bottom:15px;">✨</div>
              <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:bold;">Organization Created!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;color:#333333;">
              <h2 style="margin-top:0;font-size:20px;color:#1f2937;">Welcome, ${firstName}!</h2>
              <p style="font-size:15px;line-height:24px;color:#555555;margin:20px 0;">
                Your organization <strong>"${organizationName}"</strong> has been successfully created.
              </p>
              <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:20px;margin:30px 0;">
                <p style="margin:0 0 10px;font-size:13px;color:#666666;"><strong>Organization Name:</strong></p>
                <p style="margin:0 0 16px;font-size:15px;color:#1f2937;font-weight:bold;">${organizationName}</p>
                <p style="margin:0 0 10px;font-size:13px;color:#666666;"><strong>Organization Slug:</strong></p>
                <p style="margin:0;font-size:15px;color:#2563eb;font-family:monospace;background:#eff6ff;padding:8px 12px;border-radius:4px;">${organizationSlug}</p>
              </div>
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:35px auto;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                    <a href="${resetLink}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px;color:#888888;text-align:center;"><strong>⏱️ This link will expire in 24 hours.</strong></p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#f9fafb;padding:25px 30px;font-size:12px;color:#888888;border-top:1px solid #e5e7eb;">
              © ${new Date().getFullYear()} Ecom Platform. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function getCouponEmailTemplate(firstName, amount, batchName, couponCode) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Your Special Discount</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.1);">
          <tr>
            <td align="center" style="background:linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);padding:50px 30px;">
              <div style="font-size:60px;margin-bottom:10px;">🎁</div>
              <h1 style="color:#ffffff;margin:0;font-size:32px;font-weight:bold;letter-spacing:-0.5px;">Just For You!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;text-align:center;color:#333333;">
              <h2 style="font-size:24px;color:#1f2937;margin-bottom:10px;">Hello ${firstName},</h2>
              <p style="font-size:16px;line-height:26px;color:#555555;margin:0;">
                To show our appreciation, we've sent you a special coupon from our <strong>"${batchName}"</strong> campaign.
              </p>

              <!-- Amount Box -->
              <div style="margin:32px 0 20px;padding:24px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;">
                <p style="margin:0;font-size:13px;color:#64748b;text-transform:uppercase;font-weight:bold;letter-spacing:1px;">Coupon Value</p>
                <h3 style="margin:8px 0 0;font-size:48px;color:#4f46e5;font-weight:900;">$${amount}</h3>
              </div>

              <!-- Coupon Code Box -->
              <div style="margin:0 0 32px;padding:24px;background:#eef2ff;border:2px solid #c7d2fe;border-radius:12px;">
                <p style="margin:0 0 10px;font-size:13px;color:#6366f1;text-transform:uppercase;font-weight:bold;letter-spacing:1px;">Your Unique Coupon Code</p>
                <div style="display:inline-block;background:#ffffff;border:2px dashed #6366f1;border-radius:8px;padding:14px 32px;">
                  <span style="font-size:28px;font-weight:900;color:#4f46e5;letter-spacing:6px;font-family:'Courier New',Courier,monospace;">${couponCode}</span>
                </div>
                <p style="margin:12px 0 0;font-size:13px;color:#818cf8;">Enter this code at checkout to redeem your discount.</p>
              </div>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                    <a href="${process.env.FRONTEND_URL}/shop" target="_blank" style="display:inline-block;padding:16px 40px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">
                      Shop Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#f9fafb;padding:30px;font-size:12px;color:#94a3b8;">
              <p style="margin:0;">You received this because you are a valued member of our community.</p>
              <p style="margin:8px 0 0 0;">© ${new Date().getFullYear()} Ecom Platform. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}