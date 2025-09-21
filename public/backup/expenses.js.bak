document.getElementById('u_exp__form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('u_exp__name').value,
    department: document.getElementById('u_exp__department').value,
    designation: document.getElementById('u_exp__designation').value,
    period: document.getElementById('u_exp__period').value,
    date: document.getElementById('u_exp__date').value,
    email: document.getElementById('u_exp__email').value,
    category: document.getElementById('u_exp__category').value,
    description: document.getElementById('u_exp__description').value,
    amount: parseFloat(document.getElementById('u_exp__amount').value)
  };
  await fetch('/u_exp__add_expense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  alert('Saved!');
});

document.getElementById('u_exp__fetch_button').addEventListener('click', async () => {
  
  const year = document.getElementById('u_exp__view_year').value;
  const month = document.getElementById('u_exp__view_month').value;
  if (!year || !month) return alert("Please select both year and month.");
  const selectedMonth = `${year}-${month}`;
  const res = await fetch('/u_exp__get_expenses/' + selectedMonth);
    
  const data = await res.json();

  // Auto-fill user info using first row
  if (data.length > 0) {
    const first = data[0];
    document.getElementById('u_exp__name').value = first.name;
    document.getElementById('u_exp__department').value = first.department;
    document.getElementById('u_exp__designation').value = first.designation;
    document.getElementById('u_exp__period').value = first.period;
    document.getElementById('u_exp__date').value = first.expense_date.split('T')[0];
    document.getElementById('u_exp__email').value = first.email;
  }

  const tbody = document.querySelector('#u_exp__expenses_table tbody');
  tbody.innerHTML = '';
  let total = 0;
  const categorySum = {};
  data.forEach(exp => {
    const amount = parseFloat(exp.amount);
    total += amount;
    categorySum[exp.category] = (categorySum[exp.category] || 0) + amount;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${exp.expense_date.split('T')[0]}</td>
      <td>${exp.category}</td>
      <td>${exp.description}</td>
      <td>${amount.toFixed(2)}</td>
      <td><button onclick="deleteExpense(${exp.id})">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('u_exp__total').textContent = total.toFixed(2);

  const ctx = document.getElementById('u_exp__summary_chart').getContext('2d');
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(categorySum),
      datasets: [{ label: 'Summary', data: Object.values(categorySum) }]
    }
  });
});

async function deleteExpense(id) {
  await fetch('/u_exp__delete_expense/' + id, { method: 'DELETE' });
  alert('Deleted');
  document.getElementById('u_exp__fetch_button').click();
}

document.getElementById('u_exp__print').addEventListener('click', () => {
  const name = document.getElementById('u_exp__name').value;
  const dept = document.getElementById('u_exp__department').value;
  const desg = document.getElementById('u_exp__designation').value;
  const period = document.getElementById('u_exp__period').value;
  const date = document.getElementById('u_exp__date').value;
  const email = document.getElementById('u_exp__email').value;
  const total = document.getElementById('u_exp__total').textContent;
  const tableHTML = document.getElementById('u_exp__expenses_table').outerHTML;

  const win = window.open('', '_blank');
  win.document.write(
    '<html><head><title>Print Monthly Expense</title></head><body>' +
    '<h2 style="text-align:center;">EXPENSE STATEMENT</h2>' +
    '<table style="width:100%;border-collapse:collapse;" border="1">' +
    '<tr><td>NAME:</td><td>' + name + '</td><td>DEPARTMENT:</td><td>' + dept + '</td><td>DATE:</td><td>' + date + '</td></tr>' +
    '<tr><td>PERIOD:</td><td>' + period + '</td><td>DESIGNATION:</td><td>' + desg + '</td><td>E MAIL ID:</td><td>' + email + '</td></tr>' +
    '</table><br>' +
    tableHTML +
    '<h3>Total: ' + total + ' OMR</h3>' +
    '</body></html>'
  );
  win.document.close();
  win.print();
});

//export to excel
document.getElementById('u_exp__export_excel').addEventListener('click', () => {
  const rows = [];
  const headers = ["Date", "Category", "Description", "Amount"];
  rows.push(headers);

  const tbody = document.querySelector("#u_exp__expenses_table tbody");
  tbody.querySelectorAll("tr").forEach(row => {
    const cols = Array.from(row.querySelectorAll("td")).map(td => td.innerText);
    rows.push(cols.slice(0, 4)); // Ignore action buttons
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

  
  const year = document.getElementById("u_exp__view_year").value;
  const month = document.getElementById("u_exp__view_month").value;
  const filenameMonth = (year && month) ? `${year}-${month}` : "Month";
    
  XLSX.writeFile(workbook, `Expenses_${filenameMonth}.xlsx`);
});