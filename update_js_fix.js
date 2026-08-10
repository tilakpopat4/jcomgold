const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

code = code.replace(
    /state\.loans\.push\(newLoan\);\s*upsertCustomerFromForm\(\);\s*saveState\(\);/g,
    `state.loans.push(newLoan);
            
            // --- INJECT AUTO-UPDATE SEEDS ---
            const currentBranch = state.currentSession ? state.currentSession.code : "99";
            const prodCode = newLoan.productCode;
            
            let num = 0;
            if (newLoan.accountNo.includes("-")) {
                const parts = newLoan.accountNo.split("-");
                num = parseInt(parts[parts.length - 1]);
            } else {
                num = parseInt(newLoan.accountNo);
            }
            if (!isNaN(num)) {
                if (!state.accountSeeds) state.accountSeeds = {};
                if (!state.accountSeeds[currentBranch]) state.accountSeeds[currentBranch] = {};
                state.accountSeeds[currentBranch][prodCode] = num;
            }
            
            const packetNum = parseInt(newLoan.packetNo);
            if (!isNaN(packetNum)) {
                if (!state.lastPacketSeed) state.lastPacketSeed = {};
                state.lastPacketSeed[currentBranch] = packetNum;
            }
            // ---------------------------------
            
            upsertCustomerFromForm();
            saveState();`
);

fs.writeFileSync('app_new.js', code);
console.log('Update complete');
