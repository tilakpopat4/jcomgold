const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

// 1. generateNextAccountNumber logic
code = code.replace(
    'let maxSerial = seed - 1;',
    'let maxSerial = seed;'
);

// 2. loanForm submit logic: Auto-update seeds
const unshiftStr = `if (!state.editingLoanId) {
            state.loans.unshift(newLoan);`;
const autoUpdateStr = `if (!state.editingLoanId) {
            state.loans.unshift(newLoan);
            
            // --- INJECT AUTO-UPDATE SEEDS ---
            const branchCode = state.currentSession ? state.currentSession.code : "99";
            const productCode = newLoan.productCode;
            
            let num = 0;
            if (newLoan.accountNo.includes("-")) {
                const parts = newLoan.accountNo.split("-");
                num = parseInt(parts[parts.length - 1]);
            } else {
                num = parseInt(newLoan.accountNo);
            }
            if (!isNaN(num)) {
                if (!state.accountSeeds) state.accountSeeds = {};
                if (!state.accountSeeds[branchCode]) state.accountSeeds[branchCode] = {};
                state.accountSeeds[branchCode][productCode] = num;
            }
            
            const packetNum = parseInt(newLoan.packetNo);
            if (!isNaN(packetNum)) {
                if (!state.lastPacketSeed) state.lastPacketSeed = {};
                state.lastPacketSeed[branchCode] = packetNum;
            }
            // ---------------------------------`;

code = code.replace(unshiftStr, autoUpdateStr);

// 3. Fine Gold logic in Loan Object
// Editing loan object construction around line 1326 and 1400:
code = code.replace(
    /goldWeightGross:(.*)/g,
    'goldWeightGross:$1\n                    goldWeightFine: parseFloat(document.getElementById("gold-weight-fine") ? document.getElementById("gold-weight-fine").value : 0) || 0,'
);

// 4. Fine Gold logic in editing loader
code = code.replace(
    'if(document.getElementById("gold-weight-net")) document.getElementById("gold-weight-net").value = loan.goldWeight;',
    'if(document.getElementById("gold-weight-net")) document.getElementById("gold-weight-net").value = loan.goldWeight;\n    if(document.getElementById("gold-weight-fine")) document.getElementById("gold-weight-fine").value = loan.goldWeightFine || \'\';'
);

// 5. Excel Backup
code = code.replace(
    '"Gold Weight (Net)": l.goldWeight || 0,',
    '"Gold Weight (Net)": l.goldWeight || 0,\n            "Gold Weight (Fine)": l.goldWeightFine || 0,'
);

// 6. Excel Restore
code = code.replace(
    'goldWeight: parseFloat(r["Gold Weight (Net)"]) || parseFloat(r["Gold Weight"]) || 0,',
    'goldWeight: parseFloat(r["Gold Weight (Net)"]) || parseFloat(r["Gold Weight"]) || 0,\n                    goldWeightFine: parseFloat(r["Gold Weight (Fine)"]) || 0,'
);

// 7. Update display strings to include Fine Gold
// They use: ${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)
code = code.replace(
    /\\\$\\{parseFloat\\(loan\\.goldWeightGross \\|\\| loan\\.goldWeight\\)\\.toFixed\\(3\\)\\} Grams \\(Gross\\) \/ \\\$\\{parseFloat\\(loan\\.goldWeight\\)\\.toFixed\\(3\\)\\} Grams \\(Net\\)/g,
    '\\$\\{parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)\\}g(G) / \\$\\{parseFloat(loan.goldWeight).toFixed(3)\\}g(N) / \\$\\{parseFloat(loan.goldWeightFine || 0).toFixed(3)\\}g(F)'
);

code = code.replace(
    /<td>\\\$\\{parseFloat\\(loan\\.goldWeightGross \\|\\| loan\\.goldWeight\\)\\.toFixed\\(3\\)\\}g \/ \\\$\\{parseFloat\\(loan\\.goldWeight\\)\\.toFixed\\(3\\)\\}g<\/td>/g,
    '<td>\\$\\{parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)\\}g / \\$\\{parseFloat(loan.goldWeight).toFixed(3)\\}g / \\$\\{parseFloat(loan.goldWeightFine || 0).toFixed(3)\\}g<\/td>'
);

code = code.replace(
    /<span>Ornaments Weight \\(G\/N\\):<\/span><span class="p-val">\\\$\\{parseFloat\\(loan\\.goldWeightGross \\|\\| loan\\.goldWeight\\)\\.toFixed\\(3\\)\\} \/ \\\$\\{parseFloat\\(loan\\.goldWeight\\)\\.toFixed\\(3\\)\\} Grams<\/span>/g,
    '<span>Ornaments Weight(G/N/F):<\/span><span class="p-val">\\$\\{parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)\\} / \\$\\{parseFloat(loan.goldWeight).toFixed(3)\\} / \\$\\{parseFloat(loan.goldWeightFine || 0).toFixed(3)\\} Grams<\/span>'
);

fs.writeFileSync('app_new.js', code);
console.log('Update complete');
