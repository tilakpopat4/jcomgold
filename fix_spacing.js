const fs = require('fs');
let code = fs.readFileSync('app_new.js', 'utf8');

const oldTr = `        tr.innerHTML = \`
            <td style="text-align:center;">\${index + 1}</td>
            <td><input type="text" class="orn-detail" value="\${orn.detail || ''}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" required></td>
            <td><input type="number" class="orn-qty" value="\${orn.qty || ''}" style="width:60px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" required></td>
            <td><input type="number" class="orn-gross" step="0.001" value="\${orn.gross || ''}" style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" required></td>
            <td><input type="number" class="orn-net" step="0.001" value="\${orn.net || ''}" style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" required></td>
            <td>
                <select class="orn-carat" style="width:60px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                    <option value="16" \${orn.carat == 16 ? 'selected' : ''}>16</option>
                    <option value="17" \${orn.carat == 17 ? 'selected' : ''}>17</option>
                    <option value="18" \${orn.carat == 18 ? 'selected' : ''}>18</option>
                    <option value="19" \${orn.carat == 19 ? 'selected' : ''}>19</option>
                    <option value="20" \${orn.carat == 20 ? 'selected' : ''}>20</option>
                    <option value="21" \${orn.carat == 21 ? 'selected' : ''}>21</option>
                    <option value="22" \${orn.carat == 22 || !orn.carat ? 'selected' : ''}>22</option>
                </select>
            </td>
            <td class="orn-fine-val-cell" style="text-align:right; font-weight:bold; color:#ff9800; padding-right:10px;">₹\${Math.round(fineVal).toLocaleString("en-IN")}</td>
            <td style="text-align:center;">
                <button type="button" class="btn-icon btn-icon-red orn-delete" data-index="\${index}"><i class="fa-solid fa-trash"></i></button>
            </td>
        \`;`;

const newTr = `        tr.innerHTML = \`
            <td style="text-align:center; padding: 12px 6px;">\${index + 1}</td>
            <td style="padding: 12px 6px;"><input type="text" class="orn-detail" value="\${orn.detail || ''}" style="width:100%; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;"><input type="number" class="orn-qty" value="\${orn.qty || ''}" style="width:65px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;"><input type="number" class="orn-gross" step="0.001" value="\${orn.gross || ''}" style="width:85px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;"><input type="number" class="orn-net" step="0.001" value="\${orn.net || ''}" style="width:85px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;">
                <select class="orn-carat" style="width:65px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;">
                    <option value="16" \${orn.carat == 16 ? 'selected' : ''}>16</option>
                    <option value="17" \${orn.carat == 17 ? 'selected' : ''}>17</option>
                    <option value="18" \${orn.carat == 18 ? 'selected' : ''}>18</option>
                    <option value="19" \${orn.carat == 19 ? 'selected' : ''}>19</option>
                    <option value="20" \${orn.carat == 20 ? 'selected' : ''}>20</option>
                    <option value="21" \${orn.carat == 21 ? 'selected' : ''}>21</option>
                    <option value="22" \${orn.carat == 22 || !orn.carat ? 'selected' : ''}>22</option>
                </select>
            </td>
            <td class="orn-fine-val-cell" style="text-align:right; font-weight:bold; color:#ff9800; padding: 12px 10px 12px 6px; font-size:15px;">₹\${Math.round(fineVal).toLocaleString("en-IN")}</td>
            <td style="text-align:center; padding: 12px 6px;">
                <button type="button" class="btn-icon btn-icon-red orn-delete" data-index="\${index}"><i class="fa-solid fa-trash"></i></button>
            </td>
        \`;`;

code = code.replace(oldTr, newTr);
fs.writeFileSync('app_new.js', code);
console.log('Padding added to grid');
