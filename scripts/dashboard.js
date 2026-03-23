// ---------------- DATA STORAGE ----------------
let data = JSON.parse(localStorage.getItem("dashboardData")) || [];
let totalBudget = parseFloat(localStorage.getItem("dashboardBudget")) || 0;

// ---------------- ELEMENTS ----------------
const clientInput = document.getElementById("clientInput");
const amountInput = document.getElementById("amountInput");
const addBtn = document.getElementById("addBtn");
const tableBody = document.getElementById("tableBody");
const filterInput = document.getElementById("filterInput");

const totalBudgetEl = document.getElementById("totalBudget");
const totalExpensesEl = document.getElementById("totalExpenses");
const remainingEl = document.getElementById("remaining");

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

    data.push({ client, amount, date });

    // shto buxhetin total
    totalBudget += amount;

    saveToLocalStorage();
    renderTable();
    updateStats();

    clientInput.value = "";
    amountInput.value = "";
    clientInput.focus();
}

// ---------------- SAVE TO LOCAL STORAGE ----------------
function saveToLocalStorage() {
    localStorage.setItem("dashboardData", JSON.stringify(data));
    localStorage.setItem("dashboardBudget", totalBudget);
}

// ---------------- EVENTS ----------------
addBtn.addEventListener("click", addItem);
[clientInput, amountInput].forEach(input => {
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addItem();
    });
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

        // ---------------- DELETE ----------------
        row.querySelector(".delete-btn").addEventListener("click", () => {
            const amountRemoved = item.amount;

            // 1️⃣ Hiq klientin nga dashboard data
            data.splice(i, 1);

            // 2️⃣ Përditëso dashboard total budget
            totalBudget -= amountRemoved;

            // 3️⃣ Përditëso gjithashtu shpenzimet e përdoruesve (expensesData)
            const allExpenses = JSON.parse(localStorage.getItem("expensesData")) || {};
            for (const user in allExpenses) {
                allExpenses[user] = allExpenses[user].filter(exp => exp.client !== item.client);
            }
            localStorage.setItem("expensesData", JSON.stringify(allExpenses));

            // 4️⃣ Ruaj dhe përditëso tabelën + stats
            saveToLocalStorage();
            renderTable();
            updateStats();
        });

        // ---------------- EDIT ----------------
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

            const saveEdit = () => {
                if (!editing) return;
                editing = false;

                const newClient = clientInputEdit.value.trim();
                const newAmount = parseFloat(amountInputEdit.value);
                const oldAmount = item.amount;
                const oldClient = item.client;

                // Përditëso klientin
                if (newClient) item.client = newClient;

                // Përditëso shumën dhe totalBudget
                if (!isNaN(newAmount)) {
                    totalBudget = totalBudget - oldAmount + newAmount;
                    item.amount = newAmount;

                    // Përditëso expensesData: ndrysho klientin e vjetër me të ri, ruaj shumat
                    const allExpenses = JSON.parse(localStorage.getItem("expensesData")) || {};
                    for (const user in allExpenses) {
                        allExpenses[user] = allExpenses[user].map(exp => {
                            if (exp.client === oldClient) {
                                return { ...exp, client: newClient };
                            }
                            return exp;
                        });
                    }
                    localStorage.setItem("expensesData", JSON.stringify(allExpenses));
                }

                saveToLocalStorage();
                renderTable();
                updateStats();
            };

            const blurHandler = () => { setTimeout(() => { if (!row.contains(document.activeElement)) saveEdit(); }, 0); };

            clientInputEdit.addEventListener("blur", blurHandler);
            amountInputEdit.addEventListener("blur", blurHandler);
            const enterHandler = (e) => { if (e.key === "Enter") saveEdit(); };
            clientInputEdit.addEventListener("keydown", enterHandler);
            amountInputEdit.addEventListener("keydown", enterHandler);
        });
    });
}

// ---------------- UPDATE STATS ----------------
function updateStats() {
    totalBudgetEl.textContent = totalBudget + " €";

    const expensesData = JSON.parse(localStorage.getItem("expensesData")) || {};
    const totalExpenses = Object.values(expensesData).flat().reduce((sum, item) => sum + item.amount, 0);
    totalExpensesEl.textContent = totalExpenses + " €";

    const remaining = totalBudget - totalExpenses;
    remainingEl.textContent = remaining + " €";

    // bëje global për withdrawals
    window.dashboardBudget = totalBudget;
}

// ---------------- FILTER ----------------
filterInput.addEventListener("input", () => {
    const value = filterInput.value.toLowerCase();
    const filtered = data.filter(item =>
        item.client.toLowerCase().includes(value) || item.date.includes(value)
    );
    renderTable(filtered);
});

// ---------------- INITIALIZE ----------------
document.addEventListener("DOMContentLoaded", () => {
    renderTable();
    updateStats();
});