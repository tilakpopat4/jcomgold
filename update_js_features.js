const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

// 1. Customer Master Permissions
const customerTableStr = `                    <button class="btn-icon btn-icon-green" onclick="editCustomerProfile('\${c.custNo}')" title="Edit">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteCustomerProfile('\${c.custNo}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>`;

const newCustomerTableStr = `\${state.currentSession && state.currentSession.isHeadOffice ? \`
                    <button class="btn-icon btn-icon-green" onclick="editCustomerProfile('\${c.custNo}')" title="Edit">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteCustomerProfile('\${c.custNo}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>\` : \`<span class="text-muted"><i class="fa-solid fa-lock"></i> View Only</span>\`}`;

code = code.replace(customerTableStr, newCustomerTableStr);

// 2. Ornaments Grid Logic Injection
// Inject the new grid logic and state right after DOMContentLoaded starts.
const initStr = `    initNavigation();`;
const gridLogicStr = `    initNavigation();
    
    // --- ORNAMENTS GRID LOGIC ---
    let ornamentsList = [];
    
    function renderOrnamentsGrid() {
        const tbody = document.getElementById("ornaments-tbody");
        if(!tbody) return;
        tbody.innerHTML = "";
        
        let totalGross = 0;
        let totalNet = 0;
        let totalFineValue = 0;
        
        const goldRate = state.goldRates[document.getElementById("loan-date").value] || 0;
        
        ornamentsList.forEach((orn, index) => {
            // Fine Gold Value Formula: (Net Weight * Carat / 22) * (Gold Market Rate / 10)
            let fineVal = 0;
            if(orn.net && orn.carat && goldRate) {
                fineVal = (orn.net * orn.carat / 22) * (goldRate / 10);
            }
            orn.fineValue = fineVal;
            
            totalGross += orn.gross || 0;
            totalNet += orn.net || 0;
            totalFineValue += fineVal;
            
            const tr = document.createElement("tr");
            tr.innerHTML = \`
                <td style="text-align:center;">\${index + 1}</td>
                <td><input type="text" class="orn-detail" value="\${orn.detail || ''}" style="width:100%; padding:4px;" required></td>
                <td><input type="number" class="orn-qty" value="\${orn.qty || ''}" style="width:50px; padding:4px;" required></td>
                <td><input type="number" class="orn-gross" step="0.001" value="\${orn.gross || ''}" style="width:70px; padding:4px;" required></td>
                <td><input type="number" class="orn-net" step="0.001" value="\${orn.net || ''}" style="width:70px; padding:4px;" required></td>
                <td>
                    <select class="orn-carat" style="width:60px; padding:4px;">
                        <option value="16" \${orn.carat == 16 ? 'selected' : ''}>16</option>
                        <option value="17" \${orn.carat == 17 ? 'selected' : ''}>17</option>
                        <option value="18" \${orn.carat == 18 ? 'selected' : ''}>18</option>
                        <option value="19" \${orn.carat == 19 ? 'selected' : ''}>19</option>
                        <option value="20" \${orn.carat == 20 ? 'selected' : ''}>20</option>
                        <option value="21" \${orn.carat == 21 ? 'selected' : ''}>21</option>
                        <option value="22" \${orn.carat == 22 || !orn.carat ? 'selected' : ''}>22</option>
                    </select>
                </td>
                <td style="text-align:right; font-weight:bold; color:#ff9800;">₹\${Math.round(fineVal).toLocaleString("en-IN")}</td>
                <td style="text-align:center;">
                    <button type="button" class="btn-icon btn-icon-red orn-delete" data-index="\${index}"><i class="fa-solid fa-trash"></i></button>
                </td>
            \`;
            
            tr.querySelectorAll('input, select').forEach(inp => {
                inp.addEventListener('input', updateOrnamentsListFromDOM);
            });
            
            tr.querySelector('.orn-delete').addEventListener('click', (e) => {
                ornamentsList.splice(index, 1);
                renderOrnamentsGrid();
                updateMainWeights();
            });
            
            tbody.appendChild(tr);
        });
        
        document.getElementById("orn-total-gross").textContent = totalGross.toFixed(3);
        document.getElementById("orn-total-net").textContent = totalNet.toFixed(3);
        document.getElementById("orn-total-fine").textContent = "₹" + Math.round(totalFineValue).toLocaleString("en-IN");
    }
    
    function updateOrnamentsListFromDOM() {
        const tbody = document.getElementById("ornaments-tbody");
        if(!tbody) return;
        const rows = tbody.querySelectorAll('tr');
        ornamentsList = [];
        rows.forEach(tr => {
            ornamentsList.push({
                detail: tr.querySelector('.orn-detail').value,
                qty: parseInt(tr.querySelector('.orn-qty').value) || 0,
                gross: parseFloat(tr.querySelector('.orn-gross').value) || 0,
                net: parseFloat(tr.querySelector('.orn-net').value) || 0,
                carat: parseInt(tr.querySelector('.orn-carat').value) || 22
            });
        });
        renderOrnamentsGrid();
        updateMainWeights();
    }
    
    function updateMainWeights() {
        let tGross = 0;
        let tNet = 0;
        let tFineWeight = 0; // We will use this to update the external fine weight input if needed
        ornamentsList.forEach(o => {
            tGross += (o.gross || 0);
            tNet += (o.net || 0);
            tFineWeight += (o.net || 0) * ((o.carat || 22) / 22);
        });
        
        if(document.getElementById("gold-weight-gross")) document.getElementById("gold-weight-gross").value = tGross.toFixed(3);
        if(document.getElementById("gold-weight-net")) {
            document.getElementById("gold-weight-net").value = tNet.toFixed(3);
            document.getElementById("gold-weight-net").dispatchEvent(new Event('input')); // Trigger calculateCharges
        }
        if(document.getElementById("gold-weight-fine")) document.getElementById("gold-weight-fine").value = tFineWeight.toFixed(3);
    }
    
    const addOrnBtn = document.getElementById("add-ornament-btn");
    if(addOrnBtn) {
        addOrnBtn.addEventListener('click', () => {
            if(ornamentsList.length < 10) {
                ornamentsList.push({detail: '', qty: 1, gross: 0, net: 0, carat: 22});
                renderOrnamentsGrid();
            } else {
                alert("Maximum 10 ornaments allowed per loan.");
            }
        });
    }
    
    // Ensure grid updates when date/rate changes
    const loanDateInp = document.getElementById("loan-date");
    if(loanDateInp) {
        loanDateInp.addEventListener('change', () => {
            renderOrnamentsGrid();
        });
    }
    // ----------------------------`;

code = code.replace(initStr, gridLogicStr);

// 3. Save Logic
// Replace ornamentsDesc save with ornamentsList
const oldSaveStr = `ornamentsDesc: document.getElementById("ornaments-desc").value,`;
const newSaveStr = `ornamentsList: JSON.parse(JSON.stringify(ornamentsList)),
                    ornamentsDesc: ornamentsList.map(o => o.qty + 'x ' + o.detail).join(', '),`;

// We also need to fix if the user didn't fill out the old `ornaments-desc` because it's removed.
// Since it's removed, `document.getElementById("ornaments-desc")` will be null, causing an error.
code = code.replace(/ornamentsDesc: document.getElementById\("ornaments-desc"\)\.value,/g, newSaveStr);

// 4. Load Logic
const oldLoadStr = `if(document.getElementById("gold-weight-net")) document.getElementById("gold-weight-net").value = loan.goldWeight;`;
const newLoadStr = `if(document.getElementById("gold-weight-net")) document.getElementById("gold-weight-net").value = loan.goldWeight;
    
    // Load ornaments list
    if (loan.ornamentsList && Array.isArray(loan.ornamentsList)) {
        ornamentsList = JSON.parse(JSON.stringify(loan.ornamentsList));
    } else {
        // Fallback for old loans
        ornamentsList = [{
            detail: loan.ornamentsDesc || 'Gold Ornaments',
            qty: 1,
            gross: loan.goldWeightGross || loan.goldWeight,
            net: loan.goldWeight,
            carat: 22
        }];
    }
    renderOrnamentsGrid();`;

code = code.replace(oldLoadStr, newLoadStr);

// Reset grid when clearing form
const oldClearStr = `currentUploadedGoldPhoto = null;`;
const newClearStr = `currentUploadedGoldPhoto = null;
    ornamentsList = [];
    if(typeof renderOrnamentsGrid === 'function') renderOrnamentsGrid();`;
code = code.replace(oldClearStr, newClearStr);


// 5. Debit Voucher Rendering
const printFuncStr = `        document.getElementById("v-net-payable-words").textContent = convertNumberToWords(loan.netDisbursal) + " Only";`;

const newPrintFuncStr = `        document.getElementById("v-net-payable-words").textContent = convertNumberToWords(loan.netDisbursal) + " Only";
        
        // Populate Cash Debit Voucher
        if(document.getElementById("v-debit-branch")) {
            document.getElementById("v-debit-branch").textContent = loan.branchCode === "99" ? "Head Office" : "Branch " + loan.branchCode;
            document.getElementById("v-debit-date").textContent = formatDateDMY(loan.date);
            document.getElementById("v-debit-account").textContent = loan.accountNo;
            document.getElementById("v-debit-borrower").textContent = loan.borrowerName;
            
            document.getElementById("vd-share-a").textContent = "₹" + loan.shareA;
            document.getElementById("vd-share-b").textContent = "₹" + loan.shareB;
            document.getElementById("vd-member-fee").textContent = "₹" + loan.memberFee;
            document.getElementById("vd-valuation").textContent = "₹" + loan.valuationCharge;
            document.getElementById("vd-stamp").textContent = "₹" + loan.stampCharge;
            document.getElementById("vd-adjustment").textContent = "₹" + loan.adjustment;
            
            document.getElementById("vd-service").textContent = "₹" + loan.serviceCharge;
            document.getElementById("vd-document").textContent = "₹" + loan.docCharge;
            document.getElementById("vd-insurance").textContent = "₹" + loan.insCharge;
            document.getElementById("vd-cgst").textContent = "₹" + loan.cgst;
            document.getElementById("vd-sgst").textContent = "₹" + loan.sgst;
            
            document.getElementById("vd-total-deductions").textContent = "₹" + loan.totalCharges;
            document.getElementById("v-debit-net-payable").textContent = "₹" + loan.netDisbursal.toLocaleString("en-IN");
            
            document.getElementById("v-debit-borrower-sign").textContent = loan.borrowerName;
        }`;

code = code.replace(printFuncStr, newPrintFuncStr);

fs.writeFileSync('app_new.js', code);
console.log('JS update complete');
