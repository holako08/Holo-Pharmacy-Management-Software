const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

// Get today's date in DD.MM.YY format
const todayStr = dayjs().format('DD.MM.YY');
const fileName = `${todayStr}.xlsx`;
const modifiedFileName = `${todayStr}_modified.xlsx`;

if (!fs.existsSync(fileName)) {
  console.error(`File ${fileName} not found in the current directory.`);
  process.exit(1);
}

const workbook = xlsx.readFile(fileName);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });

// Helper: determine new quantity
function getAdjustedQuantity(qty) {
  if (qty >= 10 && qty <= 24) return 1;
  if (qty >= 25 && qty <= 49) return 3;
  if (qty > 49) return 8;
  return qty;
}

const result = [];

for (const row of data) {
  result.push(row); // Original row

  const qty = Number(row['Quantity']);
  if (!isNaN(qty) && qty >= 10) {
    const duplicated = { ...row };
    duplicated['Quantity'] = getAdjustedQuantity(qty);
    duplicated['Unit Price'] = 0;
    duplicated['Total (LC)'] = 0;
    duplicated['FOC'] = 'Yes';
    result.push(duplicated);
  }
}

// Convert to worksheet and save
const newSheet = xlsx.utils.json_to_sheet(result);
const newWorkbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(newWorkbook, newSheet, sheetName);
xlsx.writeFile(newWorkbook, modifiedFileName);

console.log(`✅ Processed and saved as ${modifiedFileName}`);
