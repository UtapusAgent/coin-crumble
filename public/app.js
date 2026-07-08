const $ = (selector) => document.querySelector(selector);

let expenses = [];
let categoryFilter = "";
let monthFilter = "";
let editingId = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function amount(expense) {
  return Number(expense.meta?.amount || 0);
}

function spentOn(expense) {
  return expense.meta?.spent_on || "";
}

function categories() {
  return [...new Set(expenses.map((expense) => expense.meta?.category || "Uncategorized"))].sort();
}

function months() {
  return [...new Set(expenses.map((expense) => spentOn(expense).slice(0, 7)).filter(Boolean))].sort().reverse();
}

function filteredExpenses() {
  return expenses
    .filter((expense) => !categoryFilter || (expense.meta?.category || "Uncategorized") === categoryFilter)
    .filter((expense) => !monthFilter || spentOn(expense).startsWith(monthFilter))
    .sort((a, b) => spentOn(b).localeCompare(spentOn(a)) || b.id - a.id);
}

function currency(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

function totals(list) {
  const total = list.reduce((sum, expense) => sum + amount(expense), 0);
  const byCategory = {};
  for (const expense of list) {
    const category = expense.meta?.category || "Uncategorized";
    byCategory[category] = (byCategory[category] || 0) + amount(expense);
  }
  return { total, byCategory };
}

function render() {
  const list = filteredExpenses();
  const summary = totals(list);
  const editing = expenses.find((expense) => expense.id === editingId);
  $("#app").innerHTML = `
    <section class="expense-layout">
      <aside class="panel">
        <h2>${editing ? "Edit Expense" : "Add Expense"}</h2>
        <form id="expenseForm">
          <label>Description</label>
          <input id="title" required placeholder="Coffee, hosting, train ticket" value="${escapeHtml(editing?.title || "")}">
          <label>Amount</label>
          <input id="amount" type="number" min="0" step="0.01" required value="${escapeHtml(editing ? amount(editing) : "")}">
          <label>Category</label>
          <input id="category" list="categoryOptions" placeholder="Food, SaaS, Travel" value="${escapeHtml(editing?.meta?.category || "")}">
          <datalist id="categoryOptions">
            ${categories().map((category) => `<option value="${escapeHtml(category)}">`).join("")}
          </datalist>
          <label>Date</label>
          <input id="spent_on" type="date" required value="${escapeHtml(editing?.meta?.spent_on || "")}">
          <label>Notes</label>
          <textarea id="body" placeholder="Receipt notes, invoice number, vendor...">${escapeHtml(editing?.body || "")}</textarea>
          <div class="row"><button>${editing ? "Save changes" : "Save expense"}</button>${editing ? `<button type="button" class="ghost" id="cancelEdit">Cancel</button>` : ""}</div>
        </form>
      </aside>
      <section>
        <div class="stats">
          <div class="stat"><span class="muted">Filtered Total</span><strong>${currency(summary.total)}</strong></div>
          <div class="stat"><span class="muted">Transactions</span><strong>${list.length}</strong></div>
          <div class="stat"><span class="muted">All-Time Total</span><strong>${currency(totals(expenses).total)}</strong></div>
        </div>
        <div class="panel">
          <div class="row space">
            <div class="row filters">
              <select id="monthFilter">
                <option value="">All months</option>
                ${months().map((month) => `<option value="${escapeHtml(month)}" ${monthFilter === month ? "selected" : ""}>${escapeHtml(month)}</option>`).join("")}
              </select>
              <select id="categoryFilter">
                <option value="">All categories</option>
                ${categories().map((category) => `<option value="${escapeHtml(category)}" ${categoryFilter === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
              </select>
            </div>
            <button class="ghost" id="csvExport">Export CSV</button>
          </div>
          <div class="category-bars">
            ${Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]).map(([category, value]) => `
              <div>
                <div class="row space"><span>${escapeHtml(category)}</span><strong>${currency(value)}</strong></div>
                <div class="bar"><span style="width:${summary.total ? Math.round((value / summary.total) * 100) : 0}%"></span></div>
              </div>
            `).join("")}
          </div>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="right">Amount</th><th></th></tr></thead>
            <tbody>
              ${list.map((expense) => `
                <tr>
                  <td>${escapeHtml(spentOn(expense))}</td>
                  <td><strong>${escapeHtml(expense.title)}</strong><br><span class="muted">${escapeHtml(expense.body)}</span></td>
                  <td>${escapeHtml(expense.meta?.category || "Uncategorized")}</td>
                  <td class="right">${currency(amount(expense))}</td>
                  <td><button class="ghost" onclick="editExpense(${expense.id})">Edit</button><button class="danger" onclick="deleteExpense(${expense.id})">Delete</button></td>
                </tr>
              `).join("") || `<tr><td colspan="5" class="muted">No expenses yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
  bindEvents();
}

function bindEvents() {
  if (!editingId) $("#spent_on").value = new Date().toISOString().slice(0, 10);
  $("#expenseForm").addEventListener("submit", saveExpense);
  $("#monthFilter").addEventListener("change", (event) => {
    monthFilter = event.target.value;
    render();
  });
  $("#categoryFilter").addEventListener("change", (event) => {
    categoryFilter = event.target.value;
    render();
  });
  $("#csvExport").addEventListener("click", exportCsv);
  const cancel = $("#cancelEdit");
  if (cancel) cancel.addEventListener("click", () => { editingId = null; render(); });
}

async function saveExpense(event) {
  event.preventDefault();
  const payload = {
      title: $("#title").value.trim(),
      body: $("#body").value.trim(),
      status: "posted",
      meta: {
        amount: Number($("#amount").value || 0),
        category: $("#category").value.trim() || "Uncategorized",
        spent_on: $("#spent_on").value,
      },
    };
  if (editingId) {
    const old = expenses.find((expense) => expense.id === editingId);
    await api(`/api/items/${editingId}`, { method: "PUT", body: JSON.stringify({ ...old, ...payload, id: editingId }) });
    editingId = null;
  } else {
    await api("/api/items", {
    method: "POST",
    body: JSON.stringify(payload),
    });
  }
  await loadExpenses();
}

function editExpense(id) {
  editingId = id;
  render();
}

async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  await api(`/api/items/${id}`, { method: "DELETE" });
  await loadExpenses();
}

function exportCsv() {
  const rows = [["date", "description", "category", "amount", "notes"]];
  for (const expense of filteredExpenses()) {
    rows.push([
      spentOn(expense),
      expense.title,
      expense.meta?.category || "Uncategorized",
      amount(expense),
      expense.body || "",
    ]);
  }
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "expenses.csv";
  link.click();
}

async function loadExpenses() {
  expenses = await api("/api/items");
  render();
}

document.body.innerHTML = `
  <main>
    <header class="top">
      <div>
        <h1>${escapeHtml(APP.name)}</h1>
        <p class="muted">${escapeHtml(APP.desc)}</p>
      </div>
    </header>
    <div id="app"></div>
  </main>
`;

loadExpenses();
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
