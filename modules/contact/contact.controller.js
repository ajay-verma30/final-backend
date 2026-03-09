const { sendQuoteRequestEmail } = require('../../src/services/email.service');

exports.submitQuoteRequest = async (req, res) => {
  const { companyName, email, phone, category, quantity, message } = req.body;

  if (!companyName || !email || !category || !quantity || !message) {
    return res.status(400).json({ message: 'All fields required' });
  }

  try {
    await sendQuoteRequestEmail(companyName, email, phone, category, quantity, message);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to send email' });
  }
};