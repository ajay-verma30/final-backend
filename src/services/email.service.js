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

// ✅ SEND FORGOT PASSWORD EMAIL (for password reset)
exports.sendForgotPasswordEmail = async (toEmail, firstName, resetLink) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail.subject = "Reset Your Password";
  sendSmtpEmail.htmlContent = getEmailTemplate(firstName, resetLink, "forgot");
  sendSmtpEmail.sender = {
    name: "Ecom App",
    email: process.env.EMAIL_FROM
  };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Forgot password email sent to ${toEmail}`);
  } catch (error) {
    console.error("Email send failed:", error);
    throw new Error('EMAIL_SEND_FAILED');
  }
};

// ✅ SEND ORGANIZATION CREATION EMAIL (NEW!)
exports.sendOrganizationCreatedEmail = async (toEmail, firstName, organizationName, organizationSlug, resetLink) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail.subject = `Your Organization "${organizationName}" Has Been Created`;
  sendSmtpEmail.htmlContent = getOrganizationEmailTemplate(firstName, organizationName, organizationSlug, resetLink);
  sendSmtpEmail.sender = {
    name: "Ecom App",
    email: process.env.EMAIL_FROM
  };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Organization creation email sent to ${toEmail}`);
  } catch (error) {
    console.error("Email send failed:", error);
    throw new Error('EMAIL_SEND_FAILED');
  }
};

// ✅ GENERIC PASSWORD SETUP EMAIL TEMPLATE
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
          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg, #1f2937 0%, #111827 100%);padding:30px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:bold;">Ecom Platform</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;color:#333333;">
              <h2 style="margin-top:0;font-size:20px;color:#1f2937;">Hello ${firstName},</h2>
              <p style="font-size:15px;line-height:24px;color:#555555;margin:20px 0;">${message}</p>
              
              <!-- CTA Button -->
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
              
              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />
              
              <!-- Safety Message -->
              <p style="font-size:12px;color:#999999;text-align:center;">If you did not request this email, you can safely ignore it.</p>
            </td>
          </tr>

          <!-- Footer -->
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

// ✅ ORGANIZATION CREATION EMAIL TEMPLATE (NEW!)
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
          
          <!-- Header with Success Gradient -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg, #07c586 0%, #059669 100%);padding:40px 30px;">
              <div style="font-size:48px;margin-bottom:15px;">✨</div>
              <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:bold;">Organization Created!</h1>
              <p style="color:#059669;margin:10px 0 0 0;font-size:15px;">Your new organization is ready to use</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:40px 30px;color:#333333;">
              <h2 style="margin-top:0;font-size:20px;color:#1f2937;">Welcome, ${firstName}!</h2>
              <p style="font-size:15px;line-height:24px;color:#555555;margin:20px 0;">
                Congratulations! Your organization <strong>"${organizationName}"</strong> has been successfully created. You're all set to start managing your business.
              </p>

              <!-- Organization Details Card -->
              <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:20px;margin:30px 0;">
                <h3 style="margin-top:0;color:#15803d;font-size:14px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Organization Details</h3>
                
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #d1e7dd;">
                      <p style="margin:0;font-size:13px;color:#666666;"><strong>Organization Name:</strong></p>
                      <p style="margin:5px 0 0 0;font-size:15px;color:#1f2937;font-weight:bold;">${organizationName}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <p style="margin:0;font-size:13px;color:#666666;"><strong>Organization Slug:</strong></p>
                      <p style="margin:5px 0 0 0;font-size:15px;color:#2563eb;font-family:monospace;background:#eff6ff;padding:8px 12px;border-radius:4px;word-break:break-all;">${organizationSlug}</p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Next Step -->
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:20px;border-radius:4px;margin:30px 0;">
                <p style="margin:0;font-size:14px;color:#92400e;">
                  <strong>Next Step:</strong> Set up your password to activate your admin account.
                </p>
              </div>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:35px auto;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                    <a href="${resetLink}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#888888;text-align:center;margin:20px 0;">
                <strong>⏱️ This link will expire in 24 hours.</strong><br/>
                Keep it safe and don't share it with anyone.
              </p>

              <!-- Features Highlight -->
              <div style="background:#f3f4f6;border-radius:8px;padding:20px;margin:30px 0;">
                <p style="margin-top:0;font-size:14px;font-weight:bold;color:#1f2937;">What you can do now:</p>
                <ul style="margin:10px 0;padding-left:25px;color:#555555;font-size:14px;line-height:22px;">
                  <li>Manage your organization settings and details</li>
                  <li>Invite team members to collaborate</li>
                  <li>Create and manage product catalogs</li>
                  <li>Track orders and customer data</li>
                </ul>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />

              <!-- Support Info -->
              <p style="font-size:12px;color:#999999;text-align:center;margin:20px 0;">
                If you have any questions or need support, feel free to reach out to our team. We're here to help!
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f9fafb;padding:25px 30px;font-size:12px;color:#888888;border-top:1px solid #e5e7eb;">
              <p style="margin:0;">© ${new Date().getFullYear()} Ecom Platform. All rights reserved.</p>
              <p style="margin:8px 0 0 0;font-size:11px;color:#999999;">
                Made with ❤️ for growing businesses
              </p>
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

module.exports = {
  sendPasswordSetupEmail: exports.sendPasswordSetupEmail,
  sendForgotPasswordEmail: exports.sendForgotPasswordEmail,
  sendOrganizationCreatedEmail: exports.sendOrganizationCreatedEmail
};