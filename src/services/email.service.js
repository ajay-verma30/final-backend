const Brevo = require('@getbrevo/brevo');

const apiInstance = new Brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

exports.sendPasswordSetupEmail = async (toEmail, firstName, resetLink) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail.subject = "Set Your Password";

sendSmtpEmail.htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Set Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:30px 0;">
    <tr>
      <td align="center">

        <!-- Main Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background:#111827;padding:25px;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;">
                Ecom Platform
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 30px;color:#333333;">
              <h2 style="margin-top:0;font-size:20px;">
                Hello ${firstName},
              </h2>

              <p style="font-size:15px;line-height:22px;color:#555;">
                Your account has been successfully created.
                Please click the button below to set your password and activate your account.
              </p>

              <!-- Button -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:5px;">
                    <a href="${resetLink}"
                       target="_blank"
                       style="display:inline-block;padding:12px 25px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#777;text-align:center;">
                This link will expire in 24 hours.
              </p>

              <hr style="border:none;border-top:1px solid #eeeeee;margin:30px 0;" />

              <p style="font-size:12px;color:#999;text-align:center;">
                If you did not request this email, you can safely ignore it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f9fafb;padding:20px;font-size:12px;color:#888;">
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

  sendSmtpEmail.sender = {
    name: "Ecom App",
    email: process.env.EMAIL_FROM
  };

  sendSmtpEmail.to = [{ email: toEmail }];

  await apiInstance.sendTransacEmail(sendSmtpEmail);
};