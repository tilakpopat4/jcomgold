const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('index.html', 'utf8');

const oldOrnamentsInput = `<div class="form-group">
                                <label for="ornaments-desc">Ornaments Description</label>
                                <input type="text" id="ornaments-desc" placeholder="e.g. Gold Ring x2, Bangle x1" required>
                            </div>`;

const newOrnamentsGrid = `<div class="form-group ornaments-grid-container" style="overflow-x: auto;">
                                <label>Ornaments Details (દાગીનાની વિગત) - Max 10 Rows</label>
                                <table class="ornaments-grid" id="ornaments-grid" style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9em;">
                                    <thead>
                                        <tr style="background-color: var(--card-bg); border-bottom: 2px solid var(--border-color);">
                                            <th style="padding: 8px;">Sr<br>(ક્રમ)</th>
                                            <th style="padding: 8px;">Detail<br>(વિગત)</th>
                                            <th style="padding: 8px;">Qty<br>(નંગ)</th>
                                            <th style="padding: 8px;">Gross Wt<br>(ગ્રોસ વજન)</th>
                                            <th style="padding: 8px;">Net Wt<br>(નેટ વજન)</th>
                                            <th style="padding: 8px;">Carat<br>(કેરેટ)</th>
                                            <th style="padding: 8px; background-color: rgba(255,152,0,0.1); color: #ff9800;">Fine Value ₹<br>(ફાઇન ગોલ્ડ)</th>
                                            <th style="padding: 8px;">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ornaments-tbody">
                                        <!-- JS will inject rows -->
                                    </tbody>
                                    <tfoot>
                                        <tr style="background-color: var(--bg-color); font-weight: bold;">
                                            <td colspan="3" style="text-align: right; padding: 8px;">Totals:</td>
                                            <td id="orn-total-gross" style="padding: 8px;">0.000</td>
                                            <td id="orn-total-net" style="padding: 8px;">0.000</td>
                                            <td style="padding: 8px;">-</td>
                                            <td id="orn-total-fine" style="padding: 8px; background-color: rgba(255,152,0,0.2); color: #ff9800;">₹0</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <button type="button" id="add-ornament-btn" class="btn-secondary" style="margin-top: 10px;"><i class="fa-solid fa-plus"></i> Add Row</button>
                            </div>`;

html = html.replace(oldOrnamentsInput, newOrnamentsGrid);

// Update print templates for CASH DEBIT VOUCHER
// We'll insert it right after `<div class="print-page" id="print-page-2">...</div>`
const printPage2End = `</div> <!-- End Page 2 -->`;
const debitVoucherHtml = `
            <!-- Cash Debit Voucher -->
            <div class="print-page" id="print-page-debit-voucher" style="page-break-before: always; position: relative;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 24px; text-decoration: underline;">CASH DEBIT VOUCHER</h2>
                    <h3 style="margin: 5px 0 0 0; font-size: 18px;">THE JUNAGADH COMMERCIAL CO-OPERATIVE BANK LTD.</h3>
                    <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 14px;">
                        <div>BRANCH : <span id="v-debit-branch"></span></div>
                        <div>DATE : <span id="v-debit-date"></span></div>
                    </div>
                </div>

                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="font-size: 22px; font-weight: bold; text-transform: uppercase;">
                        <span id="v-debit-account"></span> - <span id="v-debit-borrower"></span>
                    </h2>
                </div>

                <h4 style="margin-bottom: 10px; text-decoration: underline;">Deductions & Service Charges Breakdown</h4>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;" border="1">
                    <thead>
                        <tr style="background-color: #f0f0f0;">
                            <th style="padding: 8px; text-align: left;">Charge Description</th>
                            <th style="padding: 8px; text-align: right;">Amount(₹)</th>
                            <th style="padding: 8px; text-align: left;">Charge Description</th>
                            <th style="padding: 8px; text-align: right;">Amount(₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 8px;">Share Capital (Group A)</td>
                            <td style="padding: 8px; text-align: right;" id="vd-share-a">₹0</td>
                            <td style="padding: 8px;">Service Charges</td>
                            <td style="padding: 8px; text-align: right;" id="vd-service">₹0</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Share Capital (Group B)</td>
                            <td style="padding: 8px; text-align: right;" id="vd-share-b">₹0</td>
                            <td style="padding: 8px;">Document Charges</td>
                            <td style="padding: 8px; text-align: right;" id="vd-document">₹0</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Member Fee</td>
                            <td style="padding: 8px; text-align: right;" id="vd-member-fee">₹0</td>
                            <td style="padding: 8px;">Insurance Charges</td>
                            <td style="padding: 8px; text-align: right;" id="vd-insurance">₹0</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Valuation Fee</td>
                            <td style="padding: 8px; text-align: right;" id="vd-valuation">₹0</td>
                            <td style="padding: 8px;">CGST (9%)</td>
                            <td style="padding: 8px; text-align: right;" id="vd-cgst">₹0</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Stamp Duty</td>
                            <td style="padding: 8px; text-align: right;" id="vd-stamp">₹0</td>
                            <td style="padding: 8px;">SGST (9%)</td>
                            <td style="padding: 8px; text-align: right;" id="vd-sgst">₹0</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Manual Adjustment</td>
                            <td style="padding: 8px; text-align: right;" id="vd-adjustment">₹0</td>
                            <td style="padding: 8px; font-weight: bold;">Total Deductions</td>
                            <td style="padding: 8px; text-align: right; font-weight: bold;" id="vd-total-deductions">₹0</td>
                        </tr>
                    </tbody>
                </table>

                <div style="font-size: 16px; font-weight: bold; margin-bottom: 50px;">
                    Net Loan Disbursal Amount (Net Payable): <span id="v-debit-net-payable" style="font-size: 18px;">₹0</span>
                </div>

                <div style="position: absolute; bottom: 150px; right: 50px; text-align: center;">
                    <div style="width: 80px; height: 100px; border: 1px dashed #000; margin: 0 auto 10px auto; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666;">
                        Revenue<br>Stamp
                    </div>
                    <div id="v-debit-borrower-sign" style="font-weight: bold; text-transform: uppercase;"></div>
                </div>

                <div style="position: absolute; bottom: 50px; width: 100%; display: flex; justify-content: space-between; padding: 0 40px; box-sizing: border-box; font-weight: bold;">
                    <div>Clerk</div>
                    <div>Sr./Jr. Officer</div>
                    <div>Branch Manager</div>
                </div>
            </div> <!-- End Debit Voucher -->
`;

html = html.replace(printPage2End, printPage2End + debitVoucherHtml);

fs.writeFileSync('index.html', html);
console.log('HTML update complete');
