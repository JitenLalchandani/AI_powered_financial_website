# FinWise AI — Financial Intelligence Platform

> AI-powered financial advisor for businesses, organisations, and households.
> Built with Node.js · Express · MongoDB · Anthropic Claude AI

---

## Project Structure

```
finwise/
├── backend/
│   ├── config/
│   │   └── db.js                  ← MongoDB connection
│   ├── middleware/
│   │   └── auth.js                ← JWT protection + plan gate
│   ├── models/
│   │   ├── User.js                ← User accounts (business/org/household)
│   │   ├── Transaction.js         ← Income & expense records
│   │   ├── Conversation.js        ← AI chat history (persisted)
│   │   └── Insight.js             ← AI-generated financial insights
│   ├── routes/
│   │   ├── auth.js                ← Register, login, profile
│   │   ├── transactions.js        ← Full CRUD + analytics
│   │   └── ai.js                  ← Chatbot, analysis, forecast
│   ├── services/
│   │   └── aiService.js           ← Core Anthropic Claude integration
│   ├── scripts/
│   │   └── seed.js                ← Demo data seeder
│   ├── utils/
│   │   ├── response.js            ← Consistent API response helpers
│   │   └── validate.js            ← express-validator rule sets
│   ├── server.js                  ← Express app entry point
│   ├── .env.example               ← Environment variable template
│   └── package.json
└── frontend/
    └── index.html                 ← Complete SPA (landing + auth + dashboard)
```

---

## Quick Start

### 1. Get a MongoDB database (free)
- Go to [cloud.mongodb.com](https://cloud.mongodb.com) → create free M0 cluster
- Add a database user and copy the **Connection String**

### 2. Get your Anthropic API key
- Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key

### 3. Configure environment
```bash
cd backend
cp .env.example .env
# Edit .env and fill in:
#   MONGO_URI=mongodb+srv://...
#   JWT_SECRET=<64-char random string>
#   ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Install & run
```bash
cd backend
npm install
npm run dev        # Development (auto-reload)
# or
npm start          # Production
```

### 5. (Optional) Seed demo data
```bash
npm run seed
# Creates demo@finwise.ai / demo123456 with 6 months of transactions
```

### 6. Open the app
- **Frontend:** Open `frontend/index.html` in your browser
- **API Health:** `http://localhost:5000/api/health`

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in → get JWT |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/profile` | Update profile |
| POST | `/api/auth/change-password` | Change password |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List (filter: type, category, date, search, page) |
| POST | `/api/transactions` | Add one |
| POST | `/api/transactions/bulk` | Import array (max 500) |
| GET | `/api/transactions/:id` | Get one |
| PATCH | `/api/transactions/:id` | Update one |
| DELETE | `/api/transactions/:id` | Delete one |
| GET | `/api/transactions/analytics/summary` | Dashboard KPIs |
| GET | `/api/transactions/analytics/trend` | Monthly chart data |

### AI Advisor
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | Send message, get AI reply (persisted) |
| POST | `/api/ai/quick-advice` | One-shot advice (no history) |
| GET | `/api/ai/conversations` | List all conversations |
| GET | `/api/ai/conversations/:id` | Load full conversation |
| DELETE | `/api/ai/conversations/:id` | Delete conversation |
| POST | `/api/ai/analyse` | Full AI analysis → generate insights |
| GET | `/api/ai/insights` | List AI insights |
| PATCH | `/api/ai/insights/:id` | Mark as actioned or dismissed |
| GET | `/api/ai/forecast` | 30 & 90-day cash flow forecast |

---

## Authentication

All `/api/transactions` and `/api/ai` routes require a Bearer token:

```
Authorization: Bearer <token>
```

---

## AI Features

### 1. AI Chatbot (`POST /api/ai/chat`)
- Powered by **Claude Sonnet** via Anthropic API
- Automatically loads the user's real financial data as context
- Full conversation history persisted in MongoDB
- Auto-generates insights from each chat session

```json
// Request
{ "message": "Where am I losing the most money?", "conversationId": "optional" }

// Response
{ "success": true, "data": { "reply": "Based on your data...", "conversationId": "..." } }
```

### 2. Financial Analysis (`POST /api/ai/analyse`)
- Sends 3-month aggregated data to Claude
- Returns 4 structured, prioritised insights (saving / risk / opportunity / achievement)
- Insights saved to MongoDB and surfaced on the dashboard

### 3. Cash Flow Forecast (`GET /api/ai/forecast`)
- 6-month historical trend → 30 & 90-day projections
- Returns confidence levels, key risks, and 3 recommendations

---

## Rate Limits

| Endpoint group | Limit |
|---------------|-------|
| All API routes | 300 requests / 15 min |
| Auth routes | 20 requests / 15 min |
| AI chat | 15 requests / min |
| AI analyse | 15 requests / min |

---

## Deployment (Production)

```bash
# Set in your hosting environment:
NODE_ENV=production
PORT=5000
MONGO_URI=...
JWT_SECRET=...
ANTHROPIC_API_KEY=...
CLIENT_URL=https://yourdomain.com
```

The server serves the `frontend/` folder as static files in production mode.
Point your domain to port 5000 (or use a reverse proxy like nginx/Caddy).

Recommended hosting: **Railway**, **Render**, **Fly.io**, **DigitalOcean App Platform**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | MongoDB Atlas (Mongoose 8) |
| AI | Anthropic Claude Sonnet via REST API |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Security | helmet, cors, express-rate-limit |
| Validation | express-validator |
| Frontend | Vanilla HTML/CSS/JS + Chart.js |
