import re

print("Patching files...")

# === 1. Patch aiService.js ===
with open('backend/services/aiService.js', 'r') as f:
    content = f.read()

# Fix forecastCashFlow JSON parsing
old_forecast = """  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const m = raw.match(/\\{[\\s\\S]*\\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }"""

new_forecast = """  try {
    let cleaned = raw.replace(/```json\\s*|\\s*```/gi, '').trim();
    const objMatch = cleaned.match(/\\{[\\s\\S]*\\}/);
    const jsonStr = objMatch ? objMatch[0] : cleaned;
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('[AI] JSON parse failed. Raw response:', raw.slice(0, 500));
    return null;
  }"""

if old_forecast in content:
    content = content.replace(old_forecast, new_forecast)
    print("  ✓ forecastCashFlow JSON parsing fixed")
else:
    print("  ⚠ forecastCashFlow pattern not found (may already be patched)")

# Fix generateInsights JSON parsing
old_insights = """  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const m = raw.match(/\\[[\\s\\S]*?\\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return [];
  }"""

new_insights = """  try {
    let cleaned = raw.replace(/```json\\s*|\\s*```/gi, '').trim();
    const arrMatch = cleaned.match(/\\[[\\s\\S]*\\]/);
    const jsonStr = arrMatch ? arrMatch[0] : cleaned;
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[AI] JSON parse failed. Raw response:', raw.slice(0, 500));
    const m = raw.match(/\\[[\\s\\S]*?\\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return [];
  }"""

if old_insights in content:
    content = content.replace(old_insights, new_insights)
    print("  ✓ generateInsights JSON parsing fixed")
else:
    print("  ⚠ generateInsights pattern not found (may already be patched)")

# Add local fallback for sparse data in forecastCashFlow
fallback_marker = "  const sys = `You are a financial forecasting expert for India."
fallback_code = """  // Local fallback for sparse data
  const uniqueMonths = new Set(monthly.map(m => `${m._id.yr}-${m._id.mo}`)).size;
  if (uniqueMonths < 2) {
    const incomeTx = monthly.filter(m => m._id.type === 'income');
    const expenseTx = monthly.filter(m => m._id.type === 'expense');
    const avgIncome = incomeTx.length ? incomeTx.reduce((s, m) => s + m.total, 0) / incomeTx.length : 0;
    const avgExpense = expenseTx.length ? expenseTx.reduce((s, m) => s + m.total, 0) / expenseTx.length : 0;
    return {
      next30days: { expectedIncome: Math.round(avgIncome), expectedExpenses: Math.round(avgExpense), netCashFlow: Math.round(avgIncome - avgExpense), confidence: 'low' },
      next90days: { expectedIncome: Math.round(avgIncome * 3), expectedExpenses: Math.round(avgExpense * 3), netCashFlow: Math.round((avgIncome - avgExpense) * 3), confidence: 'low' },
      risks: ['Limited historical data — forecast based on short period only'],
      recommendations: ['Add more transactions across multiple months for better accuracy'],
      summary: `Based on limited data, your projected monthly net cash flow is approximately ₹${Math.round(avgIncome - avgExpense).toLocaleString('en-IN')}. Add more data for a reliable AI forecast.`
    };
  }

  const sys = `You are a financial forecasting expert for India."""

if fallback_marker in content and "Local fallback for sparse data" not in content:
    content = content.replace(fallback_marker, fallback_code)
    print("  ✓ Local fallback added to forecastCashFlow")
else:
    print("  ⚠ Fallback marker not found or already patched")

with open('backend/services/aiService.js', 'w') as f:
    f.write(content)

# === 2. Patch ai.js ===
with open('backend/routes/ai.js', 'r') as f:
    content = f.read()

old_msg = "if (!forecast) return ok(res, null, { message: 'Not enough historical data for a reliable forecast yet.' });"
new_msg = "if (!forecast) return ok(res, null, { message: 'Forecast generation failed. AI returned an unparseable response. Check API keys or try again later.' });"

if old_msg in content:
    content = content.replace(old_msg, new_msg)
    print("  ✓ ai.js error message fixed")
else:
    print("  ⚠ ai.js pattern not found")

with open('backend/routes/ai.js', 'w') as f:
    f.write(content)

# === 3. Patch index.html ===
with open('frontend/index.html', 'r') as f:
    content = f.read()

old_html = 'if(!data){ el.innerHTML=\\'<div class="empty-state">Not enough data yet. Add more transactions and try again.</div>\\'; return; }'
new_html = 'if(!data){ el.innerHTML=\\'<div class="empty-state">Unable to generate forecast. The AI service returned an invalid response or is not configured.<br><small>Check environment variables: OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.</small></div>\\'; return; }'

if old_html in content:
    content = content.replace(old_html, new_html)
    print("  ✓ index.html error message fixed")
else:
    print("  ⚠ index.html pattern not found")

with open('frontend/index.html', 'w') as f:
    f.write(content)

print("\nDone! Review with: git diff")
