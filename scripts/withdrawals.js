// ---------------- DATA STORAGE ----------------
let data = []; // të dhënat për faqen aktuale

// ---------------- ELEMENTS ----------------
const clientInput = document.getElementById("clientInput");
const amountInput = document.getElementById("amountInput");
const addBtn = document.getElementById("addBtn");
const tableBody = document.getElementById("tableBody");
const filterInput = document.getElementById("filterInput");

const totalExpensesEl = document.getElementById("totalExpenses");
const remainingEl = document.getElementById("remaining");

// ---------------- DETERMINE CURRENT USER ----------------
let USER = "";
document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("elvis.html")) USER = "elvis";
    else if (path.includes("urim.html")) USER = "urim";
    else if (path.includes("bunjamin.html")) USER = "bunjamin";

    // Inicializo Local Storage për expenses
    if (!localStorage.getItem("expensesData")) {
        const initData = { elvis: [], urim: [], bunjamin: [] };
        localStorage.setItem("expensesData", JSON.stringify(initData));
    }

    // Inicializo Local Storage për dashboard budget nëse nuk ekziston
    if (!localStorage.getItem("dashboardBudget")) {
        localStorage.setItem("dashboardBudget", "0");
    }

    // Ngarko të dhënat për faqen aktuale
    const allExpenses = JSON.parse(localStorage.getItem("expensesData"));
    data = allExpenses[USER] || [];

    renderTable();
    updateStats();
});

// ---------------- ADD FUNCTION ----------------
function addItem() {
    const client = clientInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (!client || isNaN(amount)) {
        alert("Ju lutem, mbushni të gjitha fushat!");
        return;
    }
    if (amount <= 0) {
        alert("Vlera nuk mund të jetë 0 ose negative!");
        return;
    }

    const date = new Date().toLocaleDateString();
    const item = { client, amount, date };

    data.push(item);

    // Ruaj në Local Storage
    const allExpenses = JSON.parse(localStorage.getItem("expensesData"));
    allExpenses[USER] = data;
    localStorage.setItem("expensesData", JSON.stringify(allExpenses));

    clientInput.value = "";
    amountInput.value = "";
    clientInput.focus();

    renderTable();
    updateStats();
}

// ---------------- EVENTS ----------------
addBtn.addEventListener("click", addItem);
[clientInput, amountInput].forEach(input => {
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") addItem(); });
});

// ---------------- RENDER TABLE ----------------
function renderTable(filteredData = data) {
    tableBody.innerHTML = "";

    filteredData.forEach((item, i) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.date}</td>
            <td class="client">${item.client}</td>
            <td class="amount">${item.amount}</td>
            <td>
                <div class="actions">
                    <button class="action-btn edit-btn">EDIT</button>
                    <button class="action-btn delete-btn">X</button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);

        // DELETE
        row.querySelector(".delete-btn").addEventListener("click", () => {
            data.splice(i, 1);

            const allExpenses = JSON.parse(localStorage.getItem("expensesData"));
            allExpenses[USER] = data;
            localStorage.setItem("expensesData", JSON.stringify(allExpenses));

            renderTable();
            updateStats();
        });

        // EDIT
        row.querySelector(".edit-btn").addEventListener("click", () => {
            const clientCell = row.querySelector(".client");
            const amountCell = row.querySelector(".amount");

            if (clientCell.querySelector("input")) return;

            const clientInputEdit = document.createElement("input");
            clientInputEdit.type = "text";
            clientInputEdit.value = item.client;

            const amountInputEdit = document.createElement("input");
            amountInputEdit.type = "number";
            amountInputEdit.value = item.amount;

            clientCell.innerHTML = "";
            amountCell.innerHTML = "";

            clientCell.appendChild(clientInputEdit);
            amountCell.appendChild(amountInputEdit);

            let editing = true;

            const save = () => {
                if (!editing) return;
                editing = false;

                const newClient = clientInputEdit.value.trim();
                const newAmount = parseFloat(amountInputEdit.value);

                if (newClient) item.client = newClient;
                if (!isNaN(newAmount)) item.amount = newAmount;

                const allExpenses = JSON.parse(localStorage.getItem("expensesData"));
                allExpenses[USER] = data;
                localStorage.setItem("expensesData", JSON.stringify(allExpenses));

                renderTable();
                updateStats();
            };

            const blurHandler = () => { setTimeout(() => { if (!row.contains(document.activeElement)) save(); }, 0); };

            clientInputEdit.addEventListener("blur", blurHandler);
            amountInputEdit.addEventListener("blur", blurHandler);

            const enterHandler = (e) => { if (e.key === "Enter") save(); };
            clientInputEdit.addEventListener("keydown", enterHandler);
            amountInputEdit.addEventListener("keydown", enterHandler);
        });
    });
}

// ---------------- UPDATE STATS ----------------
function updateStats() {
    const myTotal = data.reduce((sum, e) => sum + e.amount, 0);

    const allExpenses = JSON.parse(localStorage.getItem("expensesData"));
    const totalAll = Object.values(allExpenses).flat().reduce((sum, e) => sum + e.amount, 0);

    const dashboardBudget = parseFloat(localStorage.getItem("dashboardBudget")) || 0;
    const remaining = dashboardBudget - totalAll;

    totalExpensesEl.textContent = myTotal + " €";
    remainingEl.textContent = remaining + " €";
}

// ---------------- FILTER ----------------
filterInput.addEventListener("input", () => {
    const value = filterInput.value.toLowerCase();
    const filtered = data.filter(item =>
        item.client.toLowerCase().includes(value) || item.date.includes(value)
    );
    renderTable(filtered);
});