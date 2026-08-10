const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Labels
code = code.replace(
    '<h3><i class="fa-solid fa-hashtag"></i> Starting Account Numbers</h3>',
    '<h3><i class="fa-solid fa-hashtag"></i> Last Used Account Numbers</h3>'
);

code = code.replace(
    '<p class="helper-text-block">Set starting sequence integers for new accounts. Serials increment automatically on date change once set.</p>',
    '<p class="helper-text-block">Set the last used account numbers. The system will automatically use the next serial number for new loans and update this setting.</p>'
);

code = code.replace(
    '<p>Configure starting sequences for gold packet counts and account ledger codes</p>',
    '<p>Configure and view the last used sequences for gold packet counts and account ledger codes</p>'
);

code = code.replace(
    '<label for="seed-last-packet-no">Starting Packet Number Seed</label>',
    '<label for="seed-last-packet-no">Last Used Packet Number</label>'
);

// 2. Fine Gold Input
const netGoldInputStr = `<div class="form-group">
                                    <label for="gold-weight-net">Gold Ornaments Weight (Net Grams)</label>
                                    <input type="number" id="gold-weight-net" placeholder="e.g. 6.545" step="0.001" min="0.001" required>
                                </div>`;

const newGoldInputsStr = `<div class="form-group">
                                    <label for="gold-weight-net">Gold Ornaments Weight (Net Grams)</label>
                                    <input type="number" id="gold-weight-net" placeholder="e.g. 6.545" step="0.001" min="0.001" required>
                                </div>
                                <div class="form-group">
                                    <label for="gold-weight-fine">Gold Ornaments (Fine Gold Grams)</label>
                                    <input type="number" id="gold-weight-fine" placeholder="e.g. 5.500" step="0.001" min="0.001" required>
                                </div>`;

if(code.includes(netGoldInputStr)) {
    code = code.replace(netGoldInputStr, newGoldInputsStr);
} else {
    console.error("Could not find the target string for netGoldInputStr. File may have different formatting.");
}

fs.writeFileSync('index.html', code);
console.log('Update complete');
