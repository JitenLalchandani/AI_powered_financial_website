const nodemailer = require('nodemailer');

// Email transporter configuration
const createTransporter = () => {
  // For development, use Gmail or a test account
  // For production, use SendGrid, AWS SES, or Mailgun
  
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
      }
    });
  }
  
  // Default: Ethereal (test email service)
  return nodemailer.createTransporter({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: process.env.EMAIL_USER || 'test@ethereal.email',
      pass: process.env.EMAIL_PASSWORD || 'test123'
    }
  });
};

// Send welcome email
const sendWelcomeEmail = async (user) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"FinWise AI" <${process.env.EMAIL_USER || 'noreply@finwise.ai'}>`,
      to: user.email,
      subject: '🎉 Welcome to FinWise AI!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0B1F3A; padding: 30px; text-align: center;">
            <h1 style="color: #00C49A; margin: 0;">FinWise AI</h1>
          </div>
          <div style="padding: 30px; background: #f5f5f5;">
            <h2 style="color: #0B1F3A;">Welcome, ${user.name}! 👋</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              Thank you for joining FinWise AI! We're excited to help you make smarter financial decisions.
            </p>
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #0B1F3A; margin-top: 0;">Get Started:</h3>
              <ul style="line-height: 2;">
                <li>Add your first transaction</li>
                <li>Chat with our AI advisor</li>
                <li>View personalized insights</li>
                <li>Track your cash flow forecast</li>
              </ul>
            </div>
            <p style="color: #666; font-size: 14px;">
              Need help? Just reply to this email or chat with our AI advisor anytime!
            </p>
          </div>
          <div style="background: #0B1F3A; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p>© 2026 FinWise AI. All rights reserved.</p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

// Send budget alert email
const sendBudgetAlert = async (user, alert) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"FinWise AI Alerts" <${process.env.EMAIL_USER || 'alerts@finwise.ai'}>`,
      to: user.email,
      subject: `⚠️ Budget Alert: ${alert.category}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FF5C5C; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">⚠️ Budget Alert</h1>
          </div>
          <div style="padding: 30px; background: #f5f5f5;">
            <h2 style="color: #0B1F3A;">Hi ${user.name},</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              You've exceeded your budget for <strong>${alert.category}</strong>.
            </p>
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #FF5C5C;">
              <p style="margin: 0; font-size: 18px; color: #FF5C5C;">
                <strong>Spent: ₹${alert.spent.toLocaleString()}</strong>
              </p>
              <p style="margin: 5px 0 0 0; color: #666;">
                Budget: ₹${alert.budget.toLocaleString()} (${alert.percentage}% over)
              </p>
            </div>
            <p style="color: #666;">
              💡 <strong>AI Suggestion:</strong> ${alert.suggestion || 'Review your expenses and consider adjusting your budget or reducing spending in this category.'}
            </p>
          </div>
          <div style="background: #0B1F3A; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p>© 2026 FinWise AI. All rights reserved.</p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Budget alert sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending budget alert:', error);
    return { success: false, error: error.message };
  }
};

// Send weekly summary email
const sendWeeklySummary = async (user, summary) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"FinWise AI Reports" <${process.env.EMAIL_USER || 'reports@finwise.ai'}>`,
      to: user.email,
      subject: '📊 Your Weekly Financial Summary',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0B1F3A; padding: 30px; text-align: center;">
            <h1 style="color: #00C49A; margin: 0;">📊 Weekly Summary</h1>
          </div>
          <div style="padding: 30px; background: #f5f5f5;">
            <h2 style="color: #0B1F3A;">Hi ${user.name},</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              Here's your financial summary for the past week:
            </p>
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <div>
                  <p style="margin: 0; color: #666; font-size: 14px;">Income</p>
                  <p style="margin: 5px 0 0 0; font-size: 24px; color: #22C55E; font-weight: bold;">
                    ₹${summary.income.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p style="margin: 0; color: #666; font-size: 14px;">Expenses</p>
                  <p style="margin: 5px 0 0 0; font-size: 24px; color: #FF5C5C; font-weight: bold;">
                    ₹${summary.expenses.toLocaleString()}
                  </p>
                </div>
              </div>
              <div style="border-top: 2px solid #f0f0f0; padding-top: 15px;">
                <p style="margin: 0; color: #666; font-size: 14px;">Net Savings</p>
                <p style="margin: 5px 0 0 0; font-size: 28px; color: ${summary.net >= 0 ? '#00C49A' : '#FF5C5C'}; font-weight: bold;">
                  ₹${summary.net.toLocaleString()}
                </p>
              </div>
            </div>
            <div style="background: #E8F5F1; padding: 15px; border-radius: 10px; border-left: 4px solid #00C49A;">
              <p style="margin: 0; font-weight: bold; color: #0B1F3A;">💡 AI Insight:</p>
              <p style="margin: 10px 0 0 0; color: #333;">
                ${summary.insight || 'Keep up the good work! Your spending is under control.'}
              </p>
            </div>
          </div>
          <div style="background: #0B1F3A; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p>© 2026 FinWise AI. All rights reserved.</p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Weekly summary sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending weekly summary:', error);
    return { success: false, error: error.message };
  }
};

// Send AI insight notification
const sendInsightNotification = async (user, insight) => {
  try {
    const transporter = createTransporter();
    
    const priorityColors = {
      high: '#FF5C5C',
      medium: '#F5A623',
      low: '#22C55E'
    };
    
    const mailOptions = {
      from: `"FinWise AI Insights" <${process.env.EMAIL_USER || 'insights@finwise.ai'}>`,
      to: user.email,
      subject: `💡 New ${insight.priority} Priority Insight`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${priorityColors[insight.priority] || '#00C49A'}; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">💡 New Insight</h1>
          </div>
          <div style="padding: 30px; background: #f5f5f5;">
            <h2 style="color: #0B1F3A;">${insight.title}</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              ${insight.message}
            </p>
            ${insight.impact ? `
              <div style="background: white; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <p style="margin: 0; color: #666; font-size: 14px;">Potential Impact</p>
                <p style="margin: 5px 0 0 0; font-size: 20px; color: #00C49A; font-weight: bold;">
                  ${insight.impact}
                </p>
              </div>
            ` : ''}
            ${insight.action ? `
              <div style="background: #E8F5F1; padding: 15px; border-radius: 10px; border-left: 4px solid #00C49A;">
                <p style="margin: 0; font-weight: bold; color: #0B1F3A;">Recommended Action:</p>
                <p style="margin: 10px 0 0 0; color: #333;">${insight.action}</p>
              </div>
            ` : ''}
          </div>
          <div style="background: #0B1F3A; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p>© 2026 FinWise AI. All rights reserved.</p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Insight notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending insight notification:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendBudgetAlert,
  sendWeeklySummary,
  sendInsightNotification
};

// Made with Bob
