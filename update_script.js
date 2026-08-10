const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

// 1. Dashboard UI Updates & Gold Weight Inputs
code = code.replace(
    'const goldWeightInput = document.getElementById("gold-weight");',
    'const goldWeightGrossInput = document.getElementById("gold-weight-gross");\n    const goldWeightNetInput = document.getElementById("gold-weight-net");\n    const goldWeightInput = goldWeightNetInput;'
);

// 2. Loan Construction: add goldWeightGross
code = code.replace(
    /goldWeight: weight,/g,
    'goldWeightGross: parseFloat(goldWeightGrossInput ? goldWeightGrossInput.value : 0) || weight,\n                    goldWeight: weight,'
);

// 3. Editing Loan (populate inputs)
code = code.replace(
    'document.getElementById("gold-weight").value = loan.goldWeight;',
    'if(document.getElementById("gold-weight-gross")) document.getElementById("gold-weight-gross").value = loan.goldWeightGross || loan.goldWeight;\n    if(document.getElementById("gold-weight-net")) document.getElementById("gold-weight-net").value = loan.goldWeight;'
);

// 4. Update templates that print Gross / Net
// They currently use: ${parseFloat(loan.goldWeight).toFixed(3)} Grams / ${parseFloat(loan.goldWeight).toFixed(3)} Grams
code = code.replace(
    /\$\{parseFloat\(loan\.goldWeight\)\.toFixed\(3\)\} Grams \/ \$\{parseFloat\(loan\.goldWeight\)\.toFixed\(3\)\} Grams/g,
    '${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)'
);

// 5. Also replace instances in summary sections
code = code.replace(
    /<td>\$\{parseFloat\(loan\.goldWeight\)\.toFixed\(3\)\}g<\/td>/g,
    '<td>${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)}g / ${parseFloat(loan.goldWeight).toFixed(3)}g</td>'
);
code = code.replace(
    /<span>Ornaments Weight:<\/span><span class="p-val">\$\{parseFloat\(loan\.goldWeight\)\.toFixed\(3\)\} Grams<\/span>/g,
    '<span>Ornaments Weight (G/N):</span><span class="p-val">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} / ${parseFloat(loan.goldWeight).toFixed(3)} Grams</span>'
);

// 6. Excel Backup
code = code.replace(
    '"Gold Weight": l.goldWeight || 0,',
    '"Gold Weight (Gross)": l.goldWeightGross || l.goldWeight || 0,\n            "Gold Weight (Net)": l.goldWeight || 0,'
);

// 7. Excel Restore
code = code.replace(
    'goldWeight: parseFloat(r["Gold Weight"]) || 0,',
    'goldWeightGross: parseFloat(r["Gold Weight (Gross)"]) || parseFloat(r["Gold Weight"]) || 0,\n                    goldWeight: parseFloat(r["Gold Weight (Net)"]) || parseFloat(r["Gold Weight"]) || 0,'
);

// 8. Dashboard Gold Rate Save & History Button Listeners
// We inject this near the end of DOMContentLoaded or by adding it at the end of the file.
const listeners = `

// --- INJECTED GOLD RATE & HISTORY LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const saveRateBtn = document.getElementById("save-gold-rate-btn");
        if (saveRateBtn) {
            saveRateBtn.addEventListener("click", async () => {
                const rateInput = document.getElementById("dashboard-gold-rate");
                const rate = parseFloat(rateInput.value);
                if (!rate || rate < 1000) {
                    alert("Please enter a valid gold rate (e.g. 65000).");
                    return;
                }
                const todayStr = getTodayDateStr();
                state.goldRates[todayStr] = rate;
                try {
                    await saveState(false, true);
                    alert("Gold rate for today saved and synced to all branches!");
                    updateDashboardStats();
                } catch(e) {
                    alert("Error saving gold rate. Try again.");
                }
            });
        }

        const historyBtn = document.getElementById("view-gold-rate-history-btn");
        const historyModal = document.getElementById("gold-rate-history-modal");
        const historyCloseBtn = document.getElementById("close-gold-rate-history-modal-btn");
        const historySearchDate = document.getElementById("history-search-date");
        const historyRateResult = document.getElementById("history-rate-result");

        if (historyBtn && historyModal) {
            historyBtn.addEventListener("click", () => {
                historyModal.classList.remove("hidden");
                historySearchDate.value = "";
                historyRateResult.innerHTML = "Please select a date to view the gold rate.";
            });

            historyCloseBtn.addEventListener("click", () => {
                historyModal.classList.add("hidden");
            });

            historySearchDate.addEventListener("change", () => {
                const dateParts = historySearchDate.value.split("-");
                if(dateParts.length === 3) {
                    const formattedDate = \`\${dateParts[2]}/\${dateParts[1]}/\${dateParts[0]}\`;
                    const rate = state.goldRates[formattedDate];
                    if (rate) {
                        historyRateResult.innerHTML = \`Gold Rate on \${formattedDate}: <strong>₹\${rate.toLocaleString("en-IN")}</strong> per 10g\`;
                    } else {
                        historyRateResult.innerHTML = \`<span style='color:red'>No gold rate recorded for \${formattedDate}</span>\`;
                    }
                }
            });
        }
    }, 1000);
});
`;

code += listeners;

fs.writeFileSync('app_new.js', code);
console.log('Update complete');
