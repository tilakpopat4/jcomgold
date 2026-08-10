const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

const gridLogicStr = `
// --- ORNAMENTS GRID LOGIC ---
let ornamentsList = [];

function renderOrnamentsGrid() {
    const tbody = document.getElementById("ornaments-tbody");
    if(!tbody) return;
    tbody.innerHTML = "";
    
    let totalGross = 0;
    let totalNet = 0;
    let totalFineValue = 0;
    
    const goldRate = state.goldRates ? (state.goldRates[document.getElementById("loan-date").value] || 0) : 0;
    
    ornamentsList.forEach((orn, index) => {
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
    
    const tgEl = document.getElementById("orn-total-gross");
    if(tgEl) tgEl.textContent = totalGross.toFixed(3);
    const tnEl = document.getElementById("orn-total-net");
    if(tnEl) tnEl.textContent = totalNet.toFixed(3);
    const tfEl = document.getElementById("orn-total-fine");
    if(tfEl) tfEl.textContent = "₹" + Math.round(totalFineValue).toLocaleString("en-IN");
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
    let tFineWeight = 0;
    ornamentsList.forEach(o => {
        tGross += (o.gross || 0);
        tNet += (o.net || 0);
        tFineWeight += (o.net || 0) * ((o.carat || 22) / 22);
    });
    
    if(document.getElementById("gold-weight-gross")) {
        document.getElementById("gold-weight-gross").value = tGross.toFixed(3);
        document.getElementById("gold-weight-gross").dispatchEvent(new Event('input'));
    }
    if(document.getElementById("gold-weight-net")) {
        document.getElementById("gold-weight-net").value = tNet.toFixed(3);
        document.getElementById("gold-weight-net").dispatchEvent(new Event('input')); 
    }
    if(document.getElementById("gold-weight-fine")) document.getElementById("gold-weight-fine").value = tFineWeight.toFixed(3);
}

document.addEventListener("DOMContentLoaded", () => {
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
    
    const loanDateInp = document.getElementById("loan-date");
    if(loanDateInp) {
        loanDateInp.addEventListener('change', () => {
            renderOrnamentsGrid();
        });
    }
    
    renderOrnamentsGrid();
});
// ----------------------------
`;

code += gridLogicStr;
fs.writeFileSync('app_new.js', code);
console.log('Appended grid logic to app_new.js');
