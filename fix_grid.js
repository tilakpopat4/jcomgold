const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

// 1. Fix the rendering loop (Input Focus Bug) and the Average Fine Value
const oldGridLogic = `        tr.querySelectorAll('input, select').forEach(inp => {
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
}`;

const newGridLogic = `        tr.querySelectorAll('input, select').forEach(inp => {
            inp.addEventListener('input', updateOrnamentsListFromDOM);
        });
        
        tr.querySelector('.orn-delete').addEventListener('click', (e) => {
            ornamentsList.splice(index, 1);
            renderOrnamentsGrid();
            updateMainWeights();
        });
        
        tbody.appendChild(tr);
    });
    
    updateGridCalculations();
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
    // DO NOT renderOrnamentsGrid() here to prevent losing input focus!
    updateGridCalculations();
    updateMainWeights();
}

function updateGridCalculations() {
    const tbody = document.getElementById("ornaments-tbody");
    if(!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    
    let totalGross = 0;
    let totalNet = 0;
    let totalFineValue = 0;
    let validFineCount = 0;
    
    const goldRate = state.goldRates ? (state.goldRates[document.getElementById("loan-date").value] || 0) : 0;
    
    rows.forEach((tr, index) => {
        const orn = ornamentsList[index];
        if(!orn) return;
        
        let fineVal = 0;
        if(orn.net && orn.carat && goldRate) {
            fineVal = (orn.net * orn.carat / 22) * (goldRate / 10);
            validFineCount++;
        }
        orn.fineValue = fineVal;
        
        totalGross += orn.gross || 0;
        totalNet += orn.net || 0;
        totalFineValue += fineVal;
        
        // Update the fine value cell directly
        const fineCell = tr.querySelector('.orn-fine-val-cell');
        if(fineCell) {
            fineCell.textContent = "₹" + Math.round(fineVal).toLocaleString("en-IN");
        }
    });
    
    const tgEl = document.getElementById("orn-total-gross");
    if(tgEl) tgEl.textContent = totalGross.toFixed(3);
    const tnEl = document.getElementById("orn-total-net");
    if(tnEl) tnEl.textContent = totalNet.toFixed(3);
    const tfEl = document.getElementById("orn-total-fine");
    if(tfEl) {
        // User requested AVERAGE fine value for the Totals row
        const avgFineValue = validFineCount > 0 ? (totalFineValue / validFineCount) : 0;
        tfEl.innerHTML = "Avg: ₹" + Math.round(avgFineValue).toLocaleString("en-IN");
    }
}`;

code = code.replace(oldGridLogic, newGridLogic);

// We need to add the class 'orn-fine-val-cell' to the fine value td so we can update it
code = code.replace(
    '<td style="text-align:right; font-weight:bold; color:#ff9800;">₹${Math.round(fineVal).toLocaleString("en-IN")}</td>',
    '<td class="orn-fine-val-cell" style="text-align:right; font-weight:bold; color:#ff9800; padding-right:10px;">₹${Math.round(fineVal).toLocaleString("en-IN")}</td>'
);

// Fix CSS styling for the inputs inside the table to look better
code = code.replace(
    /style="width:100%; padding:4px;"/g,
    'style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;"'
);
code = code.replace(
    /style="width:50px; padding:4px;"/g,
    'style="width:60px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;"'
);
code = code.replace(
    /style="width:70px; padding:4px;"/g,
    'style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;"'
);
code = code.replace(
    /style="width:60px; padding:4px;"/g,
    'style="width:60px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;"'
);

// Format table rows
code = code.replace(
    'const tr = document.createElement("tr");',
    'const tr = document.createElement("tr");\n        tr.style.borderBottom = "1px solid #eee";\n        tr.style.backgroundColor = index % 2 === 0 ? "#ffffff" : "#fbfbfb";'
);

fs.writeFileSync('app_new.js', code);
console.log('Fixed Grid Logic');
