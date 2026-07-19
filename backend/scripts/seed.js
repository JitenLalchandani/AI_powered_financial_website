/**
 * Seed Script — populates the DB with demo user + realistic transactions
 * Usage: node scripts/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose    = require('mongoose');
const User        = require('../models/User');
const Transaction = require('../models/Transaction');
const Insight     = require('../models/Insight');

const DEMO_EMAIL    = 'demo@finwise.ai';
const DEMO_PASSWORD = 'demo123456';

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo       = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // ── Clean previous demo data ───────────────────────────────────────────────
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await Transaction.deleteMany({ user: existing._id });
    await Insight.deleteMany({ user: existing._id });
    await User.deleteOne({ email: DEMO_EMAIL });
    console.log('🗑  Cleared previous demo data');
  }

  // ── Create demo user ───────────────────────────────────────────────────────
  const user = await User.create({
    name:     'Rajesh Kumar (Demo)',
    email:    DEMO_EMAIL,
    password: DEMO_PASSWORD,
    userType: 'business',
    plan:     'growth',
    onboarded: true,
    profile: {
      phone:        '+91 98765 43210',
      location:     'Ahmedabad, Gujarat',
      businessName: 'Kumar Electronics',
      industry:     'Retail',
      employeeCount: 12,
      currency:     'INR'
    }
  });
  console.log(`👤 Demo user created: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // ── Generate 6 months of transactions ─────────────────────────────────────
  const txDefs = [
    // INCOME
    { type:'income', category:'sales',    baseAmount:85000,  desc:'Customer sales — electronics',  freq:2  },
    { type:'income', category:'sales',    baseAmount:45000,  desc:'Wholesale order — AC units',    freq:1  },
    { type:'income', category:'service',  baseAmount:12000,  desc:'Repair & service charges',      freq:3  },
    { type:'income', category:'freelance',baseAmount:25000,  desc:'IT support contract',           freq:1  },
    // EXPENSES
    { type:'expense', category:'rent',      baseAmount:22000, desc:'Shop rent — MG Road',          freq:1  },
    { type:'expense', category:'salaries',  baseAmount:68000, desc:'Staff salaries',               freq:1  },
    { type:'expense', category:'utilities', baseAmount:8500,  desc:'Electricity & water',          freq:1  },
    { type:'expense', category:'vendor',    baseAmount:35000, desc:'Inventory purchase — Samsung', freq:2  },
    { type:'expense', category:'marketing', baseAmount:6000,  desc:'Google Ads & social media',    freq:1  },
    { type:'expense', category:'software',  baseAmount:2499,  desc:'Tally ERP subscription',       freq:1  },
    { type:'expense', category:'software',  baseAmount:999,   desc:'Zoom Pro (unused)',             freq:1  },
    { type:'expense', category:'transport', baseAmount:4200,  desc:'Delivery & logistics',         freq:2  },
    { type:'expense', category:'insurance', baseAmount:5500,  desc:'Business insurance premium',   freq:1  },
    { type:'expense', category:'maintenance',baseAmount:3200, desc:'Shop maintenance',             freq:1  },
    { type:'expense', category:'food',      baseAmount:1800,  desc:'Team meals & entertainment',   freq:2  },
  ];

  const txDocs = [];
  for (let monthBack = 5; monthBack >= 0; monthBack--) {
    for (const def of txDefs) {
      for (let i = 0; i < def.freq; i++) {
        const jitter = randomBetween(-8, 15) / 100;
        const amount = Math.round(def.baseAmount * (1 + jitter));
        const day    = randomBetween(1, 27);
        const date   = new Date();
        date.setMonth(date.getMonth() - monthBack);
        date.setDate(day);
        txDocs.push({
          user:        user._id,
          type:        def.type,
          category:    def.category,
          description: def.desc,
          amount,
          date,
          vendor:      def.type === 'expense' ? def.desc.split('—')[1]?.trim() : undefined
        });
      }
    }
  }

  await Transaction.insertMany(txDocs);
  console.log(`💳 ${txDocs.length} transactions seeded (6 months of data)`);

  // ── Flag the "unused Zoom" subscription ───────────────────────────────────
  await Transaction.updateMany(
    { user: user._id, description: { $regex: 'Zoom', $options: 'i' } },
    { $set: { 'aiFlag.isFlagged': true, 'aiFlag.reason': 'Subscription with no usage detected', 'aiFlag.savingOpportunity': 999 } }
  );
  console.log('🚩 Flagged 1 wasteful subscription');

  // ── Seed demo insights ─────────────────────────────────────────────────────
  const insights = [
    {
      type:'saving', priority:'high',
      title:'Cancel Zoom Pro — zero usage in 4 months',
      description:'₹999/month being spent on Zoom Pro. Login data shows 0 sessions in the last 120 days. Cancel immediately for ₹11,988 annual saving.',
      estimatedImpact: 11988, impactType:'saving', generatedBy:'ai_analysis'
    },
    {
      type:'risk', priority:'high',
      title:'Receivables overdue 60+ days — ₹42,000 at risk',
      description:'2 invoices unpaid beyond 60 days. Risk of bad debt. Send final notice this week and consider a collection agency if unpaid by month-end.',
      estimatedImpact: 42000, impactType:'risk_reduction', generatedBy:'ai_analysis'
    },
    {
      type:'opportunity', priority:'medium',
      title:'Renegotiate vendor contract — potential ₹8,500/month saving',
      description:'Samsung distributor margin review due. Competitors are offering 12% better pricing. Schedule a meeting this month before order renewal.',
      estimatedImpact: 102000, impactType:'saving', generatedBy:'ai_analysis'
    },
    {
      type:'achievement', priority:'low',
      title:'Profit margin improved 14% over last quarter',
      description:'Strong performance. Revenue grew while expenses stayed controlled. Your cost-to-revenue ratio is now better than the retail sector average.',
      estimatedImpact: 0, impactType:'revenue', generatedBy:'ai_analysis'
    }
  ];

  await Insight.insertMany(insights.map(i => ({ ...i, user: user._id })));
  console.log(`💡 ${insights.length} AI insights seeded\n`);

  console.log('════════════════════════════════════════');
  console.log('✅  Seed complete!');
  console.log('   Email:    demo@finwise.ai');
  console.log('   Password: demo123456');
  console.log('════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
