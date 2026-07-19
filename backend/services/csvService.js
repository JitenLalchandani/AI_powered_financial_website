const csv = require('csv-parser');
const fs = require('fs');
const Transaction = require('../models/Transaction');

// Parse CSV file and return transactions
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const transactions = [];
    const errors = [];
    let lineNumber = 1;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        lineNumber++;
        try {
          // Validate and normalize the row
          const transaction = validateAndNormalizeRow(row, lineNumber);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          errors.push({
            line: lineNumber,
            error: error.message,
            data: row
          });
        }
      })
      .on('end', () => {
        resolve({ transactions, errors });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Validate and normalize CSV row
const validateAndNormalizeRow = (row, lineNumber) => {
  // Support multiple CSV formats
  const transaction = {
    date: null,
    description: null,
    amount: null,
    type: null,
    category: null
  };

  // Try to extract date (support multiple column names)
  const dateFields = ['date', 'Date', 'DATE', 'transaction_date', 'Transaction Date'];
  for (const field of dateFields) {
    if (row[field]) {
      transaction.date = parseDate(row[field]);
      break;
    }
  }

  // Try to extract description
  const descFields = ['description', 'Description', 'DESCRIPTION', 'particulars', 'Particulars', 'narration', 'Narration'];
  for (const field of descFields) {
    if (row[field]) {
      transaction.description = row[field].trim();
      break;
    }
  }

  // Try to extract amount
  const amountFields = ['amount', 'Amount', 'AMOUNT', 'value', 'Value'];
  for (const field of amountFields) {
    if (row[field]) {
      transaction.amount = parseAmount(row[field]);
      break;
    }
  }

  // Try to extract type (income/expense)
  const typeFields = ['type', 'Type', 'TYPE', 'transaction_type', 'Transaction Type'];
  for (const field of typeFields) {
    if (row[field]) {
      transaction.type = normalizeType(row[field]);
      break;
    }
  }

  // If type not found, check for debit/credit columns
  if (!transaction.type) {
    if (row['debit'] || row['Debit'] || row['DEBIT']) {
      const debit = parseAmount(row['debit'] || row['Debit'] || row['DEBIT']);
      if (debit > 0) {
        transaction.amount = debit;
        transaction.type = 'expense';
      }
    }
    if (row['credit'] || row['Credit'] || row['CREDIT']) {
      const credit = parseAmount(row['credit'] || row['Credit'] || row['CREDIT']);
      if (credit > 0) {
        transaction.amount = credit;
        transaction.type = 'income';
      }
    }
  }

  // Try to extract category
  const categoryFields = ['category', 'Category', 'CATEGORY'];
  for (const field of categoryFields) {
    if (row[field]) {
      transaction.category = normalizeCategory(row[field], transaction.type);
      break;
    }
  }

  // Auto-detect category from description if not provided
  if (!transaction.category && transaction.description) {
    transaction.category = detectCategory(transaction.description, transaction.type);
  }

  // Validate required fields
  if (!transaction.date) {
    throw new Error('Missing or invalid date');
  }
  if (!transaction.description) {
    throw new Error('Missing description');
  }
  if (!transaction.amount || transaction.amount <= 0) {
    throw new Error('Missing or invalid amount');
  }
  if (!transaction.type) {
    throw new Error('Missing or invalid transaction type');
  }
  if (!transaction.category) {
    throw new Error('Missing or invalid category');
  }

  return transaction;
};

// Parse date from various formats
const parseDate = (dateStr) => {
  if (!dateStr) return null;

  // Try ISO format first
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length === 3) {
    // Assume DD/MM/YYYY
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

// Parse amount from string (handle currency symbols, commas)
const parseAmount = (amountStr) => {
  if (!amountStr) return 0;
  
  // Remove currency symbols and commas
  const cleaned = amountStr.toString().replace(/[₹$,\s]/g, '');
  const amount = parseFloat(cleaned);
  
  return isNaN(amount) ? 0 : Math.abs(amount);
};

// Normalize transaction type
const normalizeType = (typeStr) => {
  if (!typeStr) return null;
  
  const type = typeStr.toLowerCase().trim();
  
  if (type.includes('income') || type.includes('credit') || type.includes('deposit') || type.includes('received')) {
    return 'income';
  }
  if (type.includes('expense') || type.includes('debit') || type.includes('payment') || type.includes('withdrawal')) {
    return 'expense';
  }
  
  return null;
};

// Normalize category
const normalizeCategory = (categoryStr, type) => {
  if (!categoryStr) return null;
  
  const category = categoryStr.toLowerCase().trim();
  
  // Income categories
  const incomeCategories = {
    'sales': 'sales',
    'service': 'service',
    'salary': 'salary',
    'freelance': 'freelance',
    'investment': 'investment',
    'grant': 'grant',
    'rental': 'rental',
    'rent': 'rental'
  };
  
  // Expense categories
  const expenseCategories = {
    'rent': 'rent',
    'utilities': 'utilities',
    'utility': 'utilities',
    'salaries': 'salaries',
    'salary': 'salaries',
    'marketing': 'marketing',
    'supplies': 'supplies',
    'software': 'software',
    'transport': 'transport',
    'transportation': 'transport',
    'food': 'food',
    'healthcare': 'healthcare',
    'health': 'healthcare',
    'education': 'education',
    'entertainment': 'entertainment',
    'insurance': 'insurance',
    'loan': 'loan_repayment',
    'tax': 'taxes',
    'taxes': 'taxes',
    'maintenance': 'maintenance',
    'subscription': 'subscription'
  };
  
  const categories = type === 'income' ? incomeCategories : expenseCategories;
  
  for (const [key, value] of Object.entries(categories)) {
    if (category.includes(key)) {
      return value;
    }
  }
  
  return type === 'income' ? 'other_income' : 'other_expense';
};

// Auto-detect category from description
const detectCategory = (description, type) => {
  const desc = description.toLowerCase();
  
  if (type === 'income') {
    if (desc.includes('salary') || desc.includes('wage')) return 'salary';
    if (desc.includes('sale') || desc.includes('sold')) return 'sales';
    if (desc.includes('service') || desc.includes('consulting')) return 'service';
    if (desc.includes('freelance') || desc.includes('contract')) return 'freelance';
    if (desc.includes('rent') || desc.includes('rental')) return 'rental';
    if (desc.includes('investment') || desc.includes('dividend')) return 'investment';
    return 'other_income';
  } else {
    if (desc.includes('rent')) return 'rent';
    if (desc.includes('electric') || desc.includes('water') || desc.includes('utility')) return 'utilities';
    if (desc.includes('salary') || desc.includes('wage') || desc.includes('payroll')) return 'salaries';
    if (desc.includes('marketing') || desc.includes('advertising')) return 'marketing';
    if (desc.includes('software') || desc.includes('subscription') || desc.includes('saas')) return 'software';
    if (desc.includes('transport') || desc.includes('fuel') || desc.includes('taxi')) return 'transport';
    if (desc.includes('food') || desc.includes('restaurant') || desc.includes('meal')) return 'food';
    if (desc.includes('health') || desc.includes('medical') || desc.includes('doctor')) return 'healthcare';
    if (desc.includes('education') || desc.includes('school') || desc.includes('course')) return 'education';
    if (desc.includes('entertainment') || desc.includes('movie') || desc.includes('game')) return 'entertainment';
    if (desc.includes('insurance')) return 'insurance';
    if (desc.includes('loan') || desc.includes('emi')) return 'loan_repayment';
    if (desc.includes('tax')) return 'taxes';
    return 'other_expense';
  }
};

// Import transactions to database
const importTransactions = async (userId, transactions) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const txData of transactions) {
    try {
      const transaction = new Transaction({
        user: userId,
        ...txData
      });
      await transaction.save();
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        transaction: txData,
        error: error.message
      });
    }
  }

  return results;
};

module.exports = {
  parseCSV,
  importTransactions
};

// Made with Bob
