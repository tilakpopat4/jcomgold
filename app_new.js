
const firebaseConfig = {
  apiKey: "AIzaSyAOIUkyCR_88wGGXb10qmdyK13xWPDSOCU",
  authDomain: "jccbgold.firebaseapp.com",
  projectId: "jccbgold",
  storageBucket: "jccbgold.firebasestorage.app",
  messagingSenderId: "665851575048",
  appId: "1:665851575048:web:a823afb8824c80abe14abd",
  measurementId: "G-KGRPF845CW"
};

firebase.initializeApp(firebaseConfig);
const analytics = firebase.analytics();
const db = firebase.firestore();

// ==================== INITIAL SEED DATA ====================
const INITIAL_BRANCHES = [
    { code: "99", name: "HEAD OFFICE" },
    { code: "01", name: "AZADCHOWK BRANCH" },
    { code: "02", name: "JOSHIPARA BRANCH" },
    { code: "03", name: "DOLATPARA BRANCH" },
    { code: "04", name: "KODINAR BRANCH" },
    { code: "05", name: "KESHOD BRANCH" },
    { code: "06", name: "VANTHALI BRANCH" },
    { code: "07", name: "MANAVADAR BRANCH" },
    { code: "08", name: "GANDHINAGAR BRANCH" },
    { code: "09", name: "LIMBDI BRANCH" },
    { code: "10", name: "MENDARDA BRANCH" },
    { code: "11", name: "VISAVADAR BRANCH" },
    { code: "12", name: "JAMNAGAR BRANCH" },
    { code: "13", name: "BUS STAND BRANCH" },
    { code: "14", name: "LATHI BRANCH" },
    { code: "16", name: "AHMEDABAD BRANCH" },
    { code: "17", name: "RAJKOT BRANCH" }
];

const INITIAL_PRODUCTS = [
    { id: "1", code: "GW-3725", minAmt: 0, maxAmt: 50000, rate: 11.00, desc: "Gold Loan up to ₹50,000 (GW-3725) 11.00% FIX" },
    { id: "2", code: "GW-3725", minAmt: 50001, maxAmt: 100000, rate: 11.50, desc: "Gold Loan ₹50,001 to ₹100,000 (GW-3725) 11.50% FIX" },
    { id: "3", code: "GD-3524", minAmt: 100001, maxAmt: 200000, rate: 11.50, desc: "Gold Loan ₹100,001 to ₹200,000 (GD-3524) 11.50% FIX" },
    { id: "4", code: "GNA-3527", minAmt: 200001, maxAmt: 999999999, rate: 11.50, desc: "Gold Loan above ₹200,000 (GNA-3527) 11.50% FIX" },
    { id: "5", code: "GOD-3553", minAmt: 200001, maxAmt: 999999999, rate: 11.50, desc: "Gold Loan above ₹200,000 (Overdraft) (GOD-3553) 11.50% FIX" }
];

const INITIAL_VALUERS = [
    { id: "v1", name: "Soni Jamnadas Pragjibhai", mobile: "9825012345", address: "Zaveri Bazar, Junagadh", savingsAc: "002010100012345" },
    { id: "v2", name: "Soni Hareshbhai Dahyalal", mobile: "9426211223", address: "College Road, Junagadh", savingsAc: "002010100056789" }
];

const DEFAULT_ACCOUNT_SEEDS = {
    "GW-3725": 1001,
    "GD-3524": 5001,
    "GNA-3527": 8001,
    "GOD-3553": 9001
};

const LOGO_SRC = "jccb-logo.png";

let currentUploadedCustPhoto = "";
let currentUploadedGoldPhoto = "";
let currentUploadedMasterCustPhoto = "";
let currentPrintLoanId = null;
let cropperInstance = null;
let activeCropSource = null;

// Head Office Backup Globals
let savedDirHandle = null;
let lastAutoBackupDate = "";

// ==================== STATE MANAGEMENT ====================
let state = {
    branches: [...INITIAL_BRANCHES],
    products: [...INITIAL_PRODUCTS],
    valuers: [...INITIAL_VALUERS],
    loans: [],
    customers: [],
    goldRates: {}, 
    accountSeeds: { ...DEFAULT_ACCOUNT_SEEDS }, 
    lastPacketSeed: 100, 
    currentSession: null,
    editingLoanId: null
};



let syncCounter = 0;
function showSync() {
    syncCounter++;
    const overlay = document.getElementById("sync-overlay");
    if (overlay) overlay.classList.remove("hidden");
}

function hideSync() {
    syncCounter--;
    if (syncCounter <= 0) {
        syncCounter = 0;
        const overlay = document.getElementById("sync-overlay");
        if (overlay) overlay.classList.add("hidden");
    }
}

async function loadState() {
    showSync();
    try {
        const docRef = db.collection("jccb").doc("state");
        const docSnap = await docRef.get();
        
        let stored = null;
        if (docSnap) {
            const hasExistsMethod = typeof docSnap.exists === 'function';
            const exists = hasExistsMethod ? docSnap.exists() : !!docSnap.exists;
            
            if (exists) {
                const data = hasExistsMethod ? docSnap.data() : (typeof docSnap.data === 'function' ? docSnap.data() : docSnap);
                
                if (data && Object.keys(data).length > 0) {
                    if (data._compressed && data.d) {
                        stored = LZString.decompressFromBase64(data.d) || LZString.decompress(data.d);
                        if (!stored) alert("CRITICAL ERROR: LZString decompression failed! data.d length: " + data.d.length);
                    } else {
                        stored = JSON.stringify(data);
                    }
                } else {
                    alert("CRITICAL ERROR: docSnap exists but data is empty!");
                }
            } else {
                alert("CRITICAL ERROR: docSnap says it does NOT exist!");
            }
        } else {
            alert("CRITICAL ERROR: docSnap is null!");
        }

        let localSession = null;
        try {
            const raw = localStorage.getItem("jccb_current_session");
            if (raw) localSession = JSON.parse(raw);
        } catch(e) {}
        const localEditingLoanId = typeof state !== 'undefined' && state ? state.editingLoanId : null;

        if (stored) {
            state = JSON.parse(stored);
            
            state.currentSession = localSession;
            state.editingLoanId = localEditingLoanId;

            // Merge photos back from localStorage (photos are stored separately to avoid Firestore 1MB limit)
            try {
                const savedPhotos = JSON.parse(localStorage.getItem("jccb_photos") || "{}");
                if (state.loans) {
                    state.loans.forEach(l => {
                        if (savedPhotos[l.id + "_cust"]) l.custPhoto = savedPhotos[l.id + "_cust"];
                        if (savedPhotos[l.id + "_gold"]) l.goldPhoto = savedPhotos[l.id + "_gold"];
                    });
                }
                if (state.customers) {
                    state.customers.forEach(c => {
                        if (savedPhotos["cust_" + c.custNo]) c.photo = savedPhotos["cust_" + c.custNo];
                    });
                }
            } catch(pe) { console.warn("Could not restore photos from localStorage", pe); }

            // Migrate old product codes (3527 -> GNA-3527, 3553 -> GOD-3553)
            if (state.products) {
                state.products.forEach(p => {
                    if (p.code === "3527") {
                        p.code = "GNA-3527";
                        p.desc = p.desc.replace("(3527)", "(GNA-3527)").replace("3527", "GNA-3527");
                    } else if (p.code === "3553") {
                        p.code = "GOD-3553";
                        p.desc = p.desc.replace("(3553)", "(GOD-3553)").replace("3553", "GOD-3553");
                    }
                });
            }

            if (state.loans) {
                state.loans.forEach(l => {
                    if (l.productCode === "3527") {
                        l.productCode = "GNA-3527";
                    } else if (l.productCode === "3553") {
                        l.productCode = "GOD-3553";
                    }
                });
            }

            if (state.accountSeeds) {
                Object.keys(state.accountSeeds).forEach(branchCode => {
                    const seeds = state.accountSeeds[branchCode];
                    if (seeds) {
                        if (seeds["3527"] !== undefined) {
                            seeds["GNA-3527"] = seeds["3527"];
                            delete seeds["3527"];
                        }
                        if (seeds["3553"] !== undefined) {
                            seeds["GOD-3553"] = seeds["3553"];
                            delete seeds["3553"];
                        }
                    }
                });
            }
            
            // Ensure state.customers exists
            if (!state.customers) state.customers = [];
            
            // Run migration for accountSeeds (from flat object to branch-nested objects)
            if (state.accountSeeds && !Object.values(state.accountSeeds).some(val => typeof val === 'object')) {
                const flatSeeds = { ...state.accountSeeds };
                state.accountSeeds = {};
                state.branches.forEach(b => {
                    state.accountSeeds[b.code] = { ...flatSeeds };
                });
            }
            
            // Ensure every branch has account seeds
            if (!state.accountSeeds) state.accountSeeds = {};
            state.branches.forEach(b => {
                if (!state.accountSeeds[b.code]) {
                    state.accountSeeds[b.code] = { ...DEFAULT_ACCOUNT_SEEDS };
                }
            });

            // Run migration for lastPacketSeed (from flat number to branch-nested numbers)
            if (typeof state.lastPacketSeed === 'number' || typeof state.lastPacketSeed === 'string') {
                const flatPacketSeed = parseInt(state.lastPacketSeed) || 100;
                state.lastPacketSeed = {};
                state.branches.forEach(b => {
                    state.lastPacketSeed[b.code] = flatPacketSeed;
                });
            }
            
            // Ensure every branch has lastPacketSeed
            if (!state.lastPacketSeed) state.lastPacketSeed = {};
            state.branches.forEach(b => {
                if (state.lastPacketSeed[b.code] === undefined) {
                    state.lastPacketSeed[b.code] = 100;
                }
            });
        } else {
            // Firebase document is empty or new - load defaults WITHOUT saving back to Firebase
            // (saving here could overwrite existing data that failed to load due to connectivity issues)
            state.branches = [...INITIAL_BRANCHES];
            state.products = [...INITIAL_PRODUCTS];
            state.valuers = [...INITIAL_VALUERS];
            state.loans = [];
            state.customers = [];
            state.goldRates = {};
            
            state.accountSeeds = {};
            state.branches.forEach(b => {
                state.accountSeeds[b.code] = { ...DEFAULT_ACCOUNT_SEEDS };
            });
            
            state.lastPacketSeed = {};
            state.branches.forEach(b => {
                state.lastPacketSeed[b.code] = 100;
            });
            
            let localSession = null;
            try {
                const raw = localStorage.getItem("jccb_current_session");
                if (raw) localSession = JSON.parse(raw);
            } catch(e) {}
            state.currentSession = localSession;
            // NOTE: Do NOT call saveState() here - this prevents wiping real Firebase data
            // if load failed due to connectivity, quota, or other transient errors
        }
    } catch (e) {
        // Silently log the Firebase error; fallback data is loaded in the 'finally' block
        alert("CRITICAL FATAL ERROR IN LOADSTATE: " + (e.stack || e.message || e));
        console.warn("Firebase unavailable, running in offline/fallback mode:", e.message || e);
    } finally {
        // GUARANTEED FALLBACK: Even if Firebase fails entirely, we must have branches/products/valuers to operate
        if (!state.branches || !Array.isArray(state.branches) || state.branches.length === 0) {
            state.branches = [...INITIAL_BRANCHES];
        }
        if (!state.products || !Array.isArray(state.products) || state.products.length === 0) {
            state.products = [...INITIAL_PRODUCTS];
        }
        if (!state.valuers || !Array.isArray(state.valuers) || state.valuers.length === 0) {
            state.valuers = [...INITIAL_VALUERS];
        }
        
        hideSync();
    }
}

async function saveState(isBackground = false, throwOnError = false) {
    if (!isBackground) showSync();
    try {
        const stateToUpload = { ...state };
        delete stateToUpload.currentSession;
        delete stateToUpload.editingLoanId;
        const cleanState = JSON.parse(JSON.stringify(stateToUpload));

        // Strip photos before uploading to Firebase (Firestore has 1MB limit)
        // Photos are saved separately to localStorage
        const photosStore = JSON.parse(localStorage.getItem("jccb_photos") || "{}");
        let photosChanged = false;
        if (cleanState.loans) {
            cleanState.loans.forEach(l => {
                if (l.custPhoto) { photosStore[l.id + "_cust"] = l.custPhoto; l.custPhoto = ""; photosChanged = true; }
                if (l.goldPhoto) { photosStore[l.id + "_gold"] = l.goldPhoto; l.goldPhoto = ""; photosChanged = true; }
            });
        }
        if (cleanState.customers) {
            cleanState.customers.forEach(c => {
                if (c.photo) { photosStore["cust_" + c.custNo] = c.photo; c.photo = ""; photosChanged = true; }
            });
        }
        if (photosChanged) {
            try { localStorage.setItem("jccb_photos", JSON.stringify(photosStore)); } catch(le) { console.warn("localStorage full, photos may not persist", le); }
        }

        // ---- DIAGNOSTIC: measure state size ----
        const rawJson = JSON.stringify(cleanState);
        const byteSize = new TextEncoder().encode(rawJson).length;
        const kb = (byteSize / 1024).toFixed(1);
        console.log(`💾 State size (after photo strip): ${kb} KB`);

        // Firestore limit is 1MB (1,048,576 bytes). Compress anything > 500KB to be safe.
        let docPayload;
        if (byteSize > 512000) {
            const compressed = LZString.compressToBase64(rawJson);
            const compKb = (compressed.length / 1024).toFixed(1);
            console.log(`🗜️ Compressed to ${compKb} KB (was ${kb} KB)`);
            docPayload = { _compressed: true, d: compressed };
        } else {
            docPayload = cleanState;
        }

        const docRef = db.collection("jccb").doc("state");
        
        if (!isBackground) {
            await docRef.set(docPayload);
            hideSaveBanner(); // Clear any previous warning on successful save
        } else {
            docRef.set(docPayload)
                .then(() => hideSaveBanner())
                .catch(e => {
                    console.error("Background state save failed", e);
                    showSaveBanner("⚠️ Data NOT saved to database! Firebase error: " + (e.message || e) + ". Please take an Excel backup now.");
                });
        }
    } catch (e) {
        console.error("Error saving remote state:", e.message || e);
        showSaveBanner("⚠️ Data NOT saved to database! Error: " + (e.message || e) + ". Please take an Excel backup now.");
        if (throwOnError) throw e;
    } finally {
        if (!isBackground) hideSync();
    }
}

function showSaveBanner(msg) {
    let banner = document.getElementById("save-error-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "save-error-banner";
        banner.style.cssText = "position:fixed;top:0;left:0;width:100%;background:#c0392b;color:#fff;font-weight:700;font-size:14px;padding:10px 20px;z-index:99999;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);";
        document.body.prepend(banner);
    }
    banner.textContent = msg;
    banner.style.display = "block";
}

function hideSaveBanner() {
    const banner = document.getElementById("save-error-banner");
    if (banner) banner.style.display = "none";
}

// ==================== UTILITY HELPERS ====================
function formatDateDMY(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    }
    return dateStr;
}

function getTodayDateStr() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getMaturityDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    date.setFullYear(date.getFullYear() + 1);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function getFirstEmiDueDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    date.setMonth(date.getMonth() + 1);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function getBranchLoanSerial(loanId, branchCode) {
    const branchLoans = state.loans.filter(l => l.branchCode === branchCode);
    branchLoans.sort((a, b) => a.id.localeCompare(b.id));
    let index = branchLoans.findIndex(l => l.id === loanId);
    if (index === -1) {
        index = branchLoans.length;
    }
    return String(index + 1).padStart(3, '0');
}

function roundTo10(val) {
    return Math.ceil(val / 10) * 10;
}

function roundUpTo5(val) {
    return Math.ceil(val / 5) * 5;
}

// Convert Number to English Words (Indian numbering system: Lakhs, Crores)
function numberToWords(amount) {
    if (amount === 0) return "Rupees Zero Only";
    
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty ', 'Thirty ', 'Forty ', 'Fifty ', 'Sixty ', 'Seventy ', 'Eighty ', 'Ninety '];
    
    function numToWords2(n) {
        if (n < 20) return a[n];
        const digit = n % 10;
        return b[Math.floor(n / 10)] + (digit !== 0 ? a[digit] : '');
    }
    
    function numToWords3(n) {
        const hundred = Math.floor(n / 100);
        const rest = n % 100;
        let str = '';
        if (hundred > 0) {
            str += a[hundred] + 'Hundred ';
        }
        if (rest > 0) {
            if (hundred > 0) str += 'and ';
            str += numToWords2(rest);
        }
        return str;
    }
    
    let num = Math.floor(amount);
    let paise = Math.round((amount - num) * 100);
    
    let words = "Rupees ";
    
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    
    if (crore > 0) {
        words += numToWords3(crore) + "Crore ";
    }
    if (lakh > 0) {
        words += numToWords3(lakh) + "Lakh ";
    }
    if (thousand > 0) {
        words += numToWords3(thousand) + "Thousand ";
    }
    if (num > 0) {
        words += numToWords3(num);
    }
    
    words = words.trim() + " Only";
    
    if (paise > 0) {
        words += " and " + numToWords2(paise) + "Paise Only";
    }
    
    return words;
}

// ==================== TAB NAVIGATION ====================
function initTabs() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const tabId = item.getAttribute("data-tab");
            switchTab(tabId);
        });
    });

    const shortcuts = document.querySelectorAll("[data-go-tab]");
    shortcuts.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-go-tab");
            switchTab(tabId);
        });
    });

    const viewAllBtn = document.querySelector(".view-all-register-btn");
    if (viewAllBtn) {
        viewAllBtn.addEventListener("click", () => {
            switchTab("register-view");
        });
    }
}

function switchTab(tabId, preserveEditState = false) {
    const contents = document.querySelectorAll(".tab-content");
    contents.forEach(content => content.classList.add("hidden"));

    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));

    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.remove("hidden");
    }

    const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (activeBtn) {
        activeBtn.classList.add("active");
    }

    // Tab actions
    if (tabId === "dashboard-view") {
        updateDashboardStats();
    } else if (tabId === "entry-view") {
        // Do not reset form when navigating to preserve incomplete entry state
    } else if (tabId === "register-view") {
        renderLoanRegister();
    } else if (tabId === "daily-vouchers-view") {
        prepareDailyVouchersView();
    } else if (tabId === "branch-master-view") {
        renderBranchMasterList();
    } else if (tabId === "valuer-master-view") {
        renderValuerMasterList();
    } else if (tabId === "customer-master-view") {
        renderCustomerMasterList();
    } else if (tabId === "product-master-view") {
        renderProductMasterList();
    } else if (tabId === "settings-view") {
        renderSettings();
    } else if (tabId === "backup-restore-view") {
        // Static view, no dynamic list rendering required
    }
}

// ==================== AUTH & SESSION ====================
function initAuth() {
    const loginForm = document.getElementById("login-form");
    const loginBranchSelect = document.getElementById("login-branch");
    const loginPasswordInput = document.getElementById("login-password");
    const togglePasswordBtn = document.getElementById("toggle-password-btn");
    const loginError = document.getElementById("login-error");
    const logoutBtn = document.getElementById("logout-btn");

    function populateLoginBranches() {
        loginBranchSelect.innerHTML = "";
        state.branches.forEach(branch => {
            const option = document.createElement("option");
            option.value = branch.code;
            option.textContent = branch.code === "99" ? branch.name : `${branch.code} ${branch.name}`;
            loginBranchSelect.appendChild(option);
        });
    }

    populateLoginBranches();

    togglePasswordBtn.addEventListener("click", () => {
        const type = loginPasswordInput.type === "password" ? "text" : "password";
        loginPasswordInput.type = type;
        const icon = togglePasswordBtn.querySelector("i");
        icon.className = type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
    });

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const selectedBranchCode = loginBranchSelect.value;
        const enteredPassword = loginPasswordInput.value;

        const branch = state.branches.find(b => b.code === selectedBranchCode);
        if (!branch) return;

        let isValid = false;
        if (selectedBranchCode === "99") {
            isValid = (enteredPassword === "Rahul#80810");
        } else {
            isValid = (enteredPassword === "Admin@123");
        }

        if (isValid) {
            loginError.classList.add("hidden");
            state.currentSession = branch;
            localStorage.setItem("jccb_current_session", JSON.stringify(branch));
            saveState();
            enterApp();
        } else {
            loginError.classList.remove("hidden");
        }
    });

    logoutBtn.addEventListener("click", () => {
        state.currentSession = null;
        localStorage.removeItem("jccb_current_session");
        sessionStorage.removeItem("jccb_reminder_shown");
        saveState();
        exitApp();
    });
}

function enterApp() {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");
    document.getElementById("current-user-branch").textContent = state.currentSession.code === "99" ? state.currentSession.name : `${state.currentSession.code} ${state.currentSession.name}`;
    document.getElementById("welcome-branch-name").textContent = state.currentSession.name;
    
    // RBAC Nav Menu
    const isAdmin = (state.currentSession.code === "99");
    const branchMasterNav = document.getElementById("branch-master-nav");
    const productMasterNav = document.getElementById("product-master-nav");
    const mastersNavDivider = document.getElementById("masters-nav-divider");
    
    if (isAdmin) {
        branchMasterNav.classList.remove("hidden");
        productMasterNav.classList.remove("hidden");
        mastersNavDivider.classList.remove("hidden");
    } else {
        branchMasterNav.classList.add("hidden");
        productMasterNav.classList.add("hidden");
    }
    
    // Toggle Backup Card display
    const hoBackupCard = document.getElementById("ho-backup-card");
    if (hoBackupCard) {
        hoBackupCard.style.display = isAdmin ? "block" : "none";
    }

    // Toggle Delete All Loans Button display
    const deleteAllBtn = document.getElementById("delete-all-loans-btn");
    if (deleteAllBtn) {
        deleteAllBtn.style.display = isAdmin ? "inline-flex" : "none";
    }
    
    configureChargeInputsAccess();
    updateDashboardStats();
    startClock();
    checkPendingCustomerNumbers();
    switchTab("dashboard-view");
}

function configureChargeInputsAccess() {
    const isHO = (state.currentSession && state.currentSession.code === "99");
    const chargeInputs = [
        "charge-share-a",
        "charge-share-b",
        "charge-member-fee",
        "charge-valuation",
        "charge-stamp",
        "charge-service",
        "charge-document",
        "charge-insurance",
        "charge-cgst",
        "charge-sgst"
    ];

    chargeInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            if (isHO) {
                input.readOnly = false;
                input.classList.add("admin-editable");
            } else {
                input.readOnly = true;
                input.classList.remove("admin-editable");
            }
        }
    });
}

function exitApp() {
    document.getElementById("login-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
    document.getElementById("login-password").value = "";
    document.getElementById("login-error").classList.add("hidden");
}

function startClock() {
    const headerDate = document.getElementById("header-date");
    const headerTime = document.getElementById("header-time");

    function updateTime() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        headerDate.textContent = `${dd}-${mm}-${yyyy}`;

        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        headerTime.textContent = `${hours}:${minutes} ${ampm}`;
    }

    updateTime();
    setInterval(updateTime, 1000 * 60);
}

// ==================== DASHBOARD VIEW ====================
function updateDashboardStats() {
    const totalAmountElem = document.getElementById("stat-total-amount");
    const totalAccountsElem = document.getElementById("stat-total-accounts");
    const totalWeightElem = document.getElementById("stat-total-weight");
    const totalValuersElem = document.getElementById("stat-total-valuers");
    const branchOnlyLoansElem = document.getElementById("stat-branch-only-loans");

    const isHeadOffice = (state.currentSession.code === "99");
    const viewLoans = isHeadOffice 
        ? state.loans 
        : state.loans.filter(l => l.branchCode === state.currentSession.code);

    branchOnlyLoansElem.textContent = isHeadOffice ? "All Branches Combined" : `Branch ${state.currentSession.code} Data`;

    const totalAmount = viewLoans.reduce((sum, item) => sum + parseFloat(item.loanAmount || 0), 0);
    const totalAccounts = viewLoans.length;
    const totalWeight = viewLoans.reduce((sum, item) => sum + parseFloat(item.goldWeight || 0), 0);
    const totalValuers = state.valuers.length;

    totalAmountElem.textContent = `₹${totalAmount.toLocaleString("en-IN")}`;
    totalAccountsElem.textContent = totalAccounts;
    totalWeightElem.textContent = `${totalWeight.toFixed(3)} g`;
    totalValuersElem.textContent = totalValuers;

    const todayStr = getTodayDateStr();
    const currentRate = state.goldRates[todayStr] || "";
    const rateInput = document.getElementById("dashboard-gold-rate");
    const saveRateBtn = document.getElementById("save-gold-rate-btn");
    const rateNote = document.querySelector(".rate-note");

    rateInput.value = currentRate;

    if (!isHeadOffice) {
        rateInput.disabled = true;
        saveRateBtn.disabled = true;
        saveRateBtn.style.display = "none";
        if (rateNote) {
            rateNote.textContent = currentRate 
                ? "* Today's gold rate set by Head Office." 
                : "* Today's gold rate has not been set by Head Office yet.";
        }
    } else {
        saveRateBtn.style.display = "inline-flex";
        if (currentRate) {
            rateInput.disabled = true;
            saveRateBtn.disabled = true;
            if (rateNote) {
                rateNote.textContent = "* Today's gold rate is locked.";
            }
        } else {
            rateInput.disabled = false;
            saveRateBtn.disabled = false;
            if (rateNote) {
                rateNote.textContent = "* Set once per calendar date (Locked for the day once saved)";
            }
        }
    }

    saveRateBtn.onclick = () => {
        if (!isHeadOffice) return;
        const rateVal = parseInt(rateInput.value);
        if (rateVal && rateVal > 1000) {
            state.goldRates[todayStr] = rateVal;
            saveState();
            alert(`Today's gold rate ₹${rateVal}/10g saved.`);
            updateDashboardStats();
            prepareEntryForm();
        } else {
            alert("Please enter a valid gold rate!");
        }
    };

    renderDashboardRecentTable(viewLoans);
}

function renderDashboardRecentTable(loansList) {
    const tbody = document.querySelector("#dashboard-recent-table tbody");
    tbody.innerHTML = "";

    const recent = [...loansList].reverse().slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No loans created today.</td></tr>`;
        return;
    }

    recent.forEach(loan => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #eee";
        tr.style.backgroundColor = index % 2 === 0 ? "#ffffff" : "#fbfbfb";
        tr.innerHTML = `
            <td><strong>${loan.accountNo}</strong></td>
            <td>${loan.borrowerName}</td>
            <td><span class="gold-badge">${loan.productCode}</span></td>
            <td>₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
            <td>Packet #${loan.packetNo}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== GOLD LOAN FORM ====================
function prepareEntryForm() {
    state.editingLoanId = null;
    const form = document.getElementById("gold-loan-form");
    if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Record & Generate Voucher';
        }
    }

    const loanDateInput = document.getElementById("loan-date");
    const valuerSelect = document.getElementById("valuer-select");
    const rateWarningAlert = document.getElementById("rate-missing-alert");
    const inlineRateInput = document.getElementById("inline-gold-rate");
    const inlineSaveBtn = document.getElementById("inline-save-rate-btn");

    if (form) {
        form.reset();
    }

    const installmentContainer = document.getElementById("installment-fields-container");
    if (installmentContainer) {
        installmentContainer.style.display = "none";
    }
    const inputInst = document.getElementById("loan-installments");
    if (inputInst) inputInst.value = "36";
    const inputEmi = document.getElementById("loan-emi-amount");
    if (inputEmi) inputEmi.value = "";
    const inputGrievance = document.getElementById("grievance-officer");
    if (inputGrievance) inputGrievance.value = "Amrutlal Valjibhai Chavda";
    const inputCaste = document.getElementById("cust-caste");
    if (inputCaste) inputCaste.value = "";
    const inputPropNo = document.getElementById("unique-proposal-no");
    if (inputPropNo) inputPropNo.value = "";

    currentUploadedCustPhoto = "";
    currentUploadedGoldPhoto = "";
    const custPreview = document.getElementById("cust-photo-preview");
    if (custPreview) {
        custPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }
    const goldPreview = document.getElementById("gold-photo-preview");
    if (goldPreview) {
        goldPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }
    
    const isMemberSelect = document.getElementById("is-member");
    const memberNoInput = document.getElementById("member-no");
    const isNewMemberCheck = document.getElementById("is-new-member-checkbox");

    memberNoInput.required = false;
    isNewMemberCheck.checked = true; 
    isNewMemberCheck.disabled = true;

    const todayStr = getTodayDateStr();
    loanDateInput.value = todayStr;

    valuerSelect.innerHTML = '<option value="">-- Select Valuer --</option>';
    state.valuers.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = `${v.name} (${v.mobile})`;
        valuerSelect.appendChild(opt);
    });

    checkGoldRateForDate(todayStr);
    autoCalculatePacketNumber(todayStr);

    loanDateInput.addEventListener("change", () => {
        checkGoldRateForDate(loanDateInput.value);
        autoCalculatePacketNumber(loanDateInput.value);
        calculateCharges();
    });

    autoCalculatePacketNumber(todayStr);

    const inputsToWatch = [
        "loan-amount",
        "gold-weight-gross",
        "gold-weight-net",
        "is-member"
    ];
    inputsToWatch.forEach(id => {
        document.getElementById(id).addEventListener("input", calculateCharges);
        document.getElementById(id).addEventListener("change", calculateCharges);
    });

    const categorySelect = document.getElementById("loan-category-select");
    categorySelect.addEventListener("change", calculateCharges);

    // Manual edits of charges trigger updateTotals()
    const chargeInputs = [
        "charge-share-a",
        "charge-share-b",
        "charge-member-fee",
        "charge-valuation",
        "charge-stamp",
        "charge-service",
        "charge-document",
        "charge-insurance",
        "charge-cgst",
        "charge-sgst",
        "charge-adjustment"
    ];
    
    chargeInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            if (id === "charge-service") {
                input.addEventListener("input", () => {
                    const serviceVal = parseFloat(input.value) || 0;
                    const cgst = Math.round(serviceVal * 9 / 100);
                    const sgst = cgst;
                    document.getElementById("charge-cgst").value = cgst;
                    document.getElementById("charge-sgst").value = sgst;
                    updateTotals();
                });
                input.addEventListener("change", () => {
                    const serviceVal = parseFloat(input.value) || 0;
                    const cgst = Math.round(serviceVal * 9 / 100);
                    const sgst = cgst;
                    document.getElementById("charge-cgst").value = cgst;
                    document.getElementById("charge-sgst").value = sgst;
                    updateTotals();
                });
            } else {
                input.addEventListener("input", updateTotals);
                input.addEventListener("change", updateTotals);
            }
        }
    });

    isMemberSelect.addEventListener("change", () => {
        if (isMemberSelect.value === "Yes") {
            if (memberNoInput) memberNoInput.required = true;
            if (isNewMemberCheck) { isNewMemberCheck.checked = false; isNewMemberCheck.disabled = true; }
        } else {
            if (memberNoInput) { memberNoInput.required = false; memberNoInput.value = ""; }
            if (isNewMemberCheck) { isNewMemberCheck.checked = true; isNewMemberCheck.disabled = true; }
        }
        calculateCharges();
    });

    inlineSaveBtn.onclick = (e) => {
        e.preventDefault();
        const targetDate = loanDateInput.value;
        const rateVal = parseInt(inlineRateInput.value);
        if (rateVal && rateVal > 1000) {
            state.goldRates[targetDate] = rateVal;
            saveState();
            checkGoldRateForDate(targetDate);
            calculateCharges();
        } else {
            alert("Please enter a valid gold rate.");
        }
    };

    const custNoInput = document.getElementById("cust-no");
    if (custNoInput) {
        const handleLookup = () => {
            const custNo = custNoInput.value.trim();
            if (custNo) {
                let customer = state.customers.find(c => c.custNo === custNo);
                
                // Fallback: If not found in customers profiles directory, search historical loans globally across all branches
                if (!customer) {
                    const matchingLoans = state.loans.filter(l => l.custNo === custNo);
                    if (matchingLoans.length > 0) {
                        const latestLoan = matchingLoans[matchingLoans.length - 1];
                        customer = {
                            custNo: latestLoan.custNo,
                            memberNo: latestLoan.memberNo,
                            name: latestLoan.borrowerName,
                            address: latestLoan.custAddress,
                            savingsAc: latestLoan.custSavingsAc,
                            age: latestLoan.custAge,
                            occupation: latestLoan.custOccupation,
                            religion: latestLoan.custReligion,
                            caste: latestLoan.custCaste || "",
                            mobile: latestLoan.custMobile,
                            nomineeName: latestLoan.custNomineeName,
                            nomineeRelation: latestLoan.custNomineeRelation,
                            photo: latestLoan.custPhoto
                        };
                    }
                }

                if (customer) {
                    document.getElementById("cust-name").value = customer.name || "";
                    document.getElementById("cust-address").value = customer.address || "";
                    document.getElementById("cust-savings-ac").value = customer.savingsAc || "";
                    document.getElementById("cust-age").value = customer.age || "";
                    document.getElementById("cust-occupation").value = customer.occupation || "";
                    document.getElementById("cust-religion").value = customer.religion || "";
                    document.getElementById("cust-caste").value = customer.caste || "";
                    document.getElementById("cust-mobile").value = customer.mobile || "";
                    document.getElementById("cust-nominee-name").value = customer.nomineeName || "";
                    document.getElementById("cust-nominee-relation").value = customer.nomineeRelation || "";
                    
                    // Autofill membership details
                    if (customer.memberNo && customer.memberNo !== "-") {
                        document.getElementById("is-member").value = "Yes";
                        document.getElementById("member-no").value = customer.memberNo;
                    } else {
                        document.getElementById("is-member").value = "No";
                        document.getElementById("member-no").value = "";
                    }
                    
                    if (customer.photo) {
                        currentUploadedCustPhoto = customer.photo;
                        document.getElementById("cust-photo-preview").innerHTML = `<img src="${customer.photo}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    } else {
                        currentUploadedCustPhoto = "";
                        document.getElementById("cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
                    }
                    calculateCharges();
                }
            }
        };
        custNoInput.addEventListener("blur", handleLookup);
        custNoInput.addEventListener("change", handleLookup);
    }
}

function checkGoldRateForDate(dateStr) {
    const rateWarningAlert = document.getElementById("rate-missing-alert");
    const valRateDisplay = document.getElementById("val-rate-display");
    const rate = state.goldRates[dateStr] || null;

    if (rate) {
        rateWarningAlert.classList.add("hidden");
        valRateDisplay.textContent = `₹${rate.toLocaleString("en-IN")}`;
    } else {
        rateWarningAlert.classList.remove("hidden");
        valRateDisplay.textContent = `₹0 (Not Set)`;
        
        const isHO = (state.currentSession && state.currentSession.code === "99");
        const inlineInput = document.getElementById("inline-gold-rate");
        const inlineBtn = document.getElementById("inline-save-rate-btn");
        const warningText = rateWarningAlert.querySelector("span");
        
        if (isHO) {
            if (inlineInput) inlineInput.style.display = "inline-block";
            if (inlineBtn) inlineBtn.style.display = "inline-block";
            if (warningText) {
                warningText.innerHTML = `<strong>Warning:</strong> Gold market rate is not set for today. Set rate in dashboard or enter here:`;
            }
        } else {
            if (inlineInput) inlineInput.style.display = "none";
            if (inlineBtn) inlineBtn.style.display = "none";
            if (warningText) {
                warningText.innerHTML = `<strong>Warning:</strong> Today's gold market rate is not set by the Head Office. Please contact Head Office to set the rate.`;
            }
        }
    }
}

function autoCalculatePacketNumber(dateStr) {
    const packetNoInput = document.getElementById("packet-no");
    
    if (state.editingLoanId) {
        const loan = state.loans.find(l => l.id === state.editingLoanId);
        if (loan) {
            packetNoInput.value = loan.packetNo;
            return;
        }
    }
    
    const branchCode = state.currentSession ? state.currentSession.code : "99";
    
    let seed = 100;
    if (state.lastPacketSeed && state.lastPacketSeed[branchCode] !== undefined) {
        seed = parseInt(state.lastPacketSeed[branchCode]) || 100;
    }
    
    // Instead of scanning all loans, directly use the seed so it respects the Account Settings
    packetNoInput.value = seed + 1;
}

function calculateCharges() {
    const loanAmountInput = document.getElementById("loan-amount");
    const goldWeightGrossInput = document.getElementById("gold-weight-gross");
    const goldWeightNetInput = document.getElementById("gold-weight-net");
    const goldWeightInput = goldWeightNetInput;
    const isNewMemberCheck = document.getElementById("is-new-member-checkbox");
    const loanDateVal = document.getElementById("loan-date").value;
    const isMember = document.getElementById("is-member").value;

    const amount = parseFloat(loanAmountInput.value) || 0;
    const weight = parseFloat(goldWeightInput.value) || 0;
    
    let marketRate = state.goldRates[loanDateVal] || 0;
    if (state.editingLoanId) {
        const editingLoan = state.loans.find(l => l.id === state.editingLoanId);
        if (editingLoan && editingLoan.date === loanDateVal) {
            marketRate = editingLoan.marketRate || marketRate;
        }
    }
    
    const isNewMember = isNewMemberCheck.checked;

    let matchedProduct = null;
    const matchingProducts = state.products.filter(p => amount >= p.minAmt && amount <= p.maxAmt);
    
    if (matchingProducts.length > 0) {
        matchedProduct = matchingProducts[0];
    }

    const categoryDisplay = document.getElementById("loan-category-display");
    const categorySelect = document.getElementById("loan-category-select");
    const rateDisplay = document.getElementById("interest-rate-display");
    const acNoInput = document.getElementById("loan-ac-no");

    let productCode = "";
    let interestRateVal = "";

    if (amount > 200000) {
        categoryDisplay.classList.add("hidden");
        categorySelect.classList.remove("hidden");
        if (!categorySelect.value) {
            const isOverdraft = confirm("Is this loan an Overdraft (GOD-3553)?\n\nClick OK for GOD-3553 (Overdraft)\nClick Cancel for GNA-3527 (Installment)");
            categorySelect.value = isOverdraft ? "GOD-3553" : "GNA-3527";
        }
        productCode = categorySelect.value;
        categoryDisplay.value = productCode; // Ensure display input has the value for form submit
        const matchingProd = state.products.find(p => p.code === productCode && amount >= p.minAmt && amount <= p.maxAmt);
        if (matchingProd) {
            interestRateVal = `${matchingProd.rate.toFixed(2)}%`;
        } else {
            interestRateVal = "11.50%";
        }
    } else {
        categoryDisplay.classList.remove("hidden");
        categorySelect.classList.add("hidden");
        categorySelect.value = ""; // Reset select value for future transitions above 200k
        
        if (matchedProduct && amount > 0) {
            categoryDisplay.value = matchedProduct.code;
            productCode = matchedProduct.code;
            interestRateVal = `${matchedProduct.rate.toFixed(2)}%`;
        } else {
            categoryDisplay.value = "";
            productCode = "";
            interestRateVal = "";
        }
    }

    if (productCode && amount > 0) {
        rateDisplay.value = interestRateVal;
        
        if (state.editingLoanId) {
            const loan = state.loans.find(l => l.id === state.editingLoanId);
            if (loan && loan.productCode === productCode) {
                acNoInput.value = loan.accountNo;
            } else {
                acNoInput.value = generateNextAccountNumber(productCode);
            }
        } else {
            acNoInput.value = generateNextAccountNumber(productCode);
        }
    } else {
        rateDisplay.value = "";
        acNoInput.value = "";
    }

    const installmentContainer = document.getElementById("installment-fields-container");
    if (installmentContainer) {
        if (productCode && productCode.includes("3527")) {
            installmentContainer.style.display = "block";
        } else {
            installmentContainer.style.display = "none";
        }
    }

    let marketValue = 0;
    if (typeof ornamentsList !== 'undefined' && ornamentsList.length > 0) {
        let totalFine = 0;
        ornamentsList.forEach(orn => {
            if (orn.fineValue) totalFine += orn.fineValue;
        });
        marketValue = Math.round(totalFine);
    } else {
        marketValue = Math.round((weight / 10) * marketRate);
    }
    const eligibleAmount = Math.round(marketValue * 0.75);
    
    document.getElementById("val-market-val-display").textContent = `₹${marketValue.toLocaleString("en-IN")}`;
    document.getElementById("val-eligible-display").textContent = `₹${eligibleAmount.toLocaleString("en-IN")}`;

    let ltv = 0;
    if (marketValue > 0) {
        ltv = Math.round((amount / marketValue) * 100);
    }
    document.getElementById("val-ltv-display").textContent = `${ltv}%`;
    
    let margin = 100;
    if (marketValue > 0) {
        margin = 100 - ltv;
    }
    const marginDisplay = document.getElementById("val-margin-display");
    if (marginDisplay) {
        marginDisplay.textContent = `${margin}%`;
    }

    const ltvWarning = document.getElementById("ltv-warning-badge");
    if (ltv > 75) {
        ltvWarning.classList.remove("hidden");
    } else {
        ltvWarning.classList.add("hidden");
    }

    let shareA = 0;
    let shareB = 0;
    let memberFee = 0;
    let valuationCharge = 0;
    let stampCharge = 0;
    let serviceCharge = 0;
    let docCharge = 0;
    let insCharge = 0;

    if (amount > 0) {
        if (isNewMember) {
            if (amount <= 100000) {
                shareB = 50;
            } else if (amount > 100000) {
                shareA = 500;
            }
        }

        if (amount > 100000 && isMember === "No") {
            memberFee = 25;
        }

        if (isMember === "Yes") {
            shareA = 0;
            shareB = 0;
            memberFee = 0;
        }

        // Valuation Fee (0.25% of loan, rounded up to nearest 5)
        if (amount <= 25000) {
            valuationCharge = 100;
        } else if (amount <= 50000) {
            valuationCharge = 150;
        } else if (amount <= 100000) {
            valuationCharge = 250;
        } else if (amount <= 500000) {
            valuationCharge = Math.min(1000, roundUpTo5(amount * 0.25 / 100));
        } else if (amount <= 1000000) {
            valuationCharge = Math.min(1500, roundUpTo5(amount * 0.25 / 100));
        } else {
            valuationCharge = Math.min(2000, roundUpTo5(amount * 0.25 / 100));
        }

        // Stamp Charge
        const calculated = Math.ceil((amount * 0.50 / 100) / 10) * 10;
        stampCharge = calculated;

        if (amount > 200000 && (productCode === "GOD-3553" || productCode === "3553")) {
            stampCharge += 300;
        }

        // Service Charge
        if (productCode.includes("3725") || productCode.includes("3524")) {
            serviceCharge = Math.round(amount * 0.25 / 100);
        } else if (productCode.includes("3553") || productCode.includes("3527")) {
            serviceCharge = Math.round(amount * 0.50 / 100);
        } else {
            serviceCharge = Math.round(amount * 0.25 / 100);
        }

        // Document Charge
        if (amount <= 100000) {
            docCharge = 50;
        } else if (amount <= 200000) {
            docCharge = 100;
        } else {
            docCharge = 200;
        }

        // Insurance Charge
        if (amount <= 200000) {
            insCharge = 50;
        } else {
            insCharge = 100;
        }
    }

    const cgst = Math.round((serviceCharge + docCharge) * 9 / 100);
    const sgst = cgst;

    document.getElementById("charge-share-a").value = shareA;
    document.getElementById("charge-share-b").value = shareB;
    document.getElementById("charge-member-fee").value = memberFee;
    document.getElementById("charge-valuation").value = valuationCharge;
    document.getElementById("charge-stamp").value = stampCharge;
    document.getElementById("charge-service").value = serviceCharge;
    document.getElementById("charge-document").value = docCharge;
    document.getElementById("charge-insurance").value = insCharge;
    document.getElementById("charge-cgst").value = cgst;
    document.getElementById("charge-sgst").value = sgst;

    updateTotals();
}

function updateTotals() {
    const loanAmountInput = document.getElementById("loan-amount");
    const amount = parseFloat(loanAmountInput.value) || 0;

    const shareA = parseFloat(document.getElementById("charge-share-a").value) || 0;
    const shareB = parseFloat(document.getElementById("charge-share-b").value) || 0;
    const memberFee = parseFloat(document.getElementById("charge-member-fee").value) || 0;
    const valuationCharge = parseFloat(document.getElementById("charge-valuation").value) || 0;
    const stampCharge = parseFloat(document.getElementById("charge-stamp").value) || 0;
    const serviceCharge = parseFloat(document.getElementById("charge-service").value) || 0;
    const docCharge = parseFloat(document.getElementById("charge-document").value) || 0;
    const insCharge = parseFloat(document.getElementById("charge-insurance").value) || 0;
    const cgst = parseFloat(document.getElementById("charge-cgst").value) || 0;
    const sgst = parseFloat(document.getElementById("charge-sgst").value) || 0;
    const adjustment = parseFloat(document.getElementById("charge-adjustment").value) || 0;

    const totalDeductions = shareA + shareB + memberFee + valuationCharge + stampCharge + serviceCharge + docCharge + insCharge + cgst + sgst + adjustment;
    const roundedTotalDeductions = Math.round(totalDeductions * 100) / 100;
    document.getElementById("charge-total").value = roundedTotalDeductions;

    const netDisbursal = Math.max(0, amount - roundedTotalDeductions);
    const roundedNetDisbursal = Math.round(netDisbursal * 100) / 100;

    document.getElementById("summary-sanctioned-amt").textContent = `₹${amount.toLocaleString("en-IN")}`;
    document.getElementById("summary-deductions-amt").textContent = `₹${roundedTotalDeductions.toLocaleString("en-IN")}`;
    document.getElementById("summary-net-disbursal").textContent = `₹${roundedNetDisbursal.toLocaleString("en-IN")}`;
}

function generateNextAccountNumber(schemeCode) {
    let branchCode = state.currentSession ? state.currentSession.code : "99";
    if (state.editingLoanId) {
        const loan = state.loans.find(l => l.id === state.editingLoanId);
        if (loan) {
            branchCode = loan.branchCode;
        }
    }
    
    let seed = 1001;
    if (state.accountSeeds[branchCode] && state.accountSeeds[branchCode][schemeCode] !== undefined) {
        seed = parseInt(state.accountSeeds[branchCode][schemeCode]);
    } else {
        seed = DEFAULT_ACCOUNT_SEEDS[schemeCode] || 1001;
    }
    
    // Instead of scanning all loans, directly use the seed so it respects the Account Settings
    const nextNum = seed + 1;
    return `${schemeCode}-${nextNum}`;
}

// Save Entry Form
function initFormSubmit() {
    const form = document.getElementById("gold-loan-form");
    
    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const isMemberVal = document.getElementById("is-member").value;
        const memberNoVal = document.getElementById("member-no").value.trim();
        if (isMemberVal === "Yes" && !memberNoVal) {
            alert("Error: Membership Number is required when Bank Member Status is 'Yes'!");
            document.getElementById("member-no").focus();
            return;
        }

        const dateStr = document.getElementById("loan-date").value;
        const rate = state.goldRates[dateStr] || 0;
        if (rate <= 0) {
            alert("Error: Gold market rate is not set for this date! Configure it before saving.");
            return;
        }

        const valuerId = document.getElementById("valuer-select").value;
        if (!valuerId) {
            alert("Please select a Soni Valuer.");
            return;
        }

        const amount = parseFloat(document.getElementById("loan-amount").value);
        const weight = parseFloat(document.getElementById("gold-weight-net").value);
        const marketValue = Math.round((weight / 10) * rate);
        if (amount > marketValue * 0.75) {
            const confirmLTV = confirm("Warning: Loan amount exceeds 75% of gold value. Do you still want to proceed?");
            if (!confirmLTV) return;
        }

        const confirmSave = confirm(state.editingLoanId ? "Are you sure you want to update this gold loan entry?" : "Are you sure you want to save this gold loan entry?");
        if (!confirmSave) return;

        if (state.editingLoanId) {
            const index = state.loans.findIndex(l => l.id === state.editingLoanId);
            if (index !== -1) {
                state.loans[index] = {
                    ...state.loans[index],
                    date: dateStr,
                    loanStatus: form.elements["loan-status"].value,
                    uniqueProposalNo: document.getElementById("unique-proposal-no").value.trim(),
                    isMember: document.getElementById("is-member").value,
                    memberNo: document.getElementById("member-no").value || "-",
                    isNewMember: document.getElementById("is-new-member-checkbox").checked,
                    packetNo: document.getElementById("packet-no").value,
                    valuerId: valuerId,
                    borrowerName: document.getElementById("cust-name").value,
                    loanAmount: amount,
                    productCode: document.getElementById("loan-category-display").value,
                    accountNo: document.getElementById("loan-ac-no").value,
                    interestRate: document.getElementById("interest-rate-display").value,
                    goldWeightGross: parseFloat(document.getElementById("gold-weight-gross") ? document.getElementById("gold-weight-gross").value : 0) || weight,
                    goldWeightFine: parseFloat(document.getElementById("gold-weight-fine") ? document.getElementById("gold-weight-fine").value : 0) || 0,
                    goldWeight: weight,
                    ornamentsList: JSON.parse(JSON.stringify(ornamentsList)),
                    ornamentsDesc: ornamentsList.map(o => o.qty + 'x ' + o.detail).join(', '),
                    tenureMonths: document.getElementById("loan-category-display").value.includes("3527") 
                        ? (parseInt(document.getElementById("loan-installments").value) || 36)
                        : 12,
                    emiAmount: document.getElementById("loan-category-display").value.includes("3527")
                        ? (parseFloat(document.getElementById("loan-emi-amount").value) || 0)
                        : null,
                    grievanceOfficer: document.getElementById("grievance-officer").value.trim() || "Amrutlal Valjibhai Chavda",
                    marketRate: rate,
                    marketValue: marketValue,
                    eligibleAmount: Math.round(marketValue * 0.75),
                    
                    // Customer fields
                    custNo: document.getElementById("cust-no").value.trim(),
                    custAddress: document.getElementById("cust-address").value.trim(),
                    custSavingsAc: document.getElementById("cust-savings-ac").value.trim(),
                    custAge: parseInt(document.getElementById("cust-age").value) || 0,
                    custOccupation: document.getElementById("cust-occupation").value.trim(),
                    custReligion: document.getElementById("cust-religion").value.trim(),
                    custCaste: document.getElementById("cust-caste").value.trim() || "-",
                    custMobile: document.getElementById("cust-mobile").value.trim(),
                    custNomineeName: document.getElementById("cust-nominee-name").value.trim(),
                    custNomineeRelation: document.getElementById("cust-nominee-relation").value.trim(),
                    custPhoto: currentUploadedCustPhoto,
                    goldPhoto: currentUploadedGoldPhoto,
                    loanPurpose: document.getElementById("loan-purpose").value.trim(),
                    
                    // Charges
                    shareA: parseFloat(document.getElementById("charge-share-a").value) || 0,
                    shareB: parseFloat(document.getElementById("charge-share-b").value) || 0,
                    memberFee: parseFloat(document.getElementById("charge-member-fee").value) || 0,
                    valuationCharge: parseFloat(document.getElementById("charge-valuation").value) || 0,
                    stampCharge: parseFloat(document.getElementById("charge-stamp").value) || 0,
                    serviceCharge: parseFloat(document.getElementById("charge-service").value) || 0,
                    docCharge: parseFloat(document.getElementById("charge-document").value) || 0,
                    insCharge: parseFloat(document.getElementById("charge-insurance").value) || 0,
                    cgst: parseFloat(document.getElementById("charge-cgst").value) || 0,
                    sgst: parseFloat(document.getElementById("charge-sgst").value) || 0,
                    adjustment: parseFloat(document.getElementById("charge-adjustment").value) || 0,
                    totalCharges: parseFloat(document.getElementById("charge-total").value) || 0,
                    netDisbursal: amount - (parseFloat(document.getElementById("charge-total").value) || 0)
                };
                
                upsertCustomerFromForm();
                saveState();
                alert("Gold loan entry updated successfully.");
                const updatedLoan = state.loans[index];
                
                state.editingLoanId = null;
                
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Record & Generate Voucher';
                
                switchTab("register-view");
                openPrintModal(updatedLoan.id);
            }
        } else {
            const newLoan = {
                id: "loan_" + Date.now(),
                date: dateStr,
                branchCode: state.currentSession.code,
                branchName: state.currentSession.name,
                loanStatus: form.elements["loan-status"].value,
                uniqueProposalNo: document.getElementById("unique-proposal-no").value.trim(),
                isMember: document.getElementById("is-member").value,
                memberNo: document.getElementById("member-no").value || "-",
                isNewMember: document.getElementById("is-new-member-checkbox").checked,
                packetNo: document.getElementById("packet-no").value,
                valuerId: valuerId,
                borrowerName: document.getElementById("cust-name").value,
                loanAmount: amount,
                productCode: document.getElementById("loan-category-display").value,
                accountNo: document.getElementById("loan-ac-no").value,
                interestRate: document.getElementById("interest-rate-display").value,
                goldWeightGross: parseFloat(document.getElementById("gold-weight-gross") ? document.getElementById("gold-weight-gross").value : 0) || weight,
                    goldWeightFine: parseFloat(document.getElementById("gold-weight-fine") ? document.getElementById("gold-weight-fine").value : 0) || 0,
                    goldWeight: weight,
                ornamentsList: JSON.parse(JSON.stringify(ornamentsList)),
                    ornamentsDesc: ornamentsList.map(o => o.qty + 'x ' + o.detail).join(', '),
                tenureMonths: document.getElementById("loan-category-display").value.includes("3527") 
                    ? (parseInt(document.getElementById("loan-installments").value) || 36)
                    : 12,
                emiAmount: document.getElementById("loan-category-display").value.includes("3527")
                    ? (parseFloat(document.getElementById("loan-emi-amount").value) || 0)
                    : null,
                grievanceOfficer: document.getElementById("grievance-officer").value.trim() || "Amrutlal Valjibhai Chavda",
                marketRate: rate,
                marketValue: marketValue,
                eligibleAmount: Math.round(marketValue * 0.75),
                
                // Customer fields
                custNo: document.getElementById("cust-no").value.trim(),
                custAddress: document.getElementById("cust-address").value.trim(),
                custSavingsAc: document.getElementById("cust-savings-ac").value.trim(),
                custAge: parseInt(document.getElementById("cust-age").value) || 0,
                custOccupation: document.getElementById("cust-occupation").value.trim(),
                custReligion: document.getElementById("cust-religion").value.trim(),
                custCaste: document.getElementById("cust-caste").value.trim() || "-",
                custMobile: document.getElementById("cust-mobile").value.trim(),
                custNomineeName: document.getElementById("cust-nominee-name").value.trim(),
                custNomineeRelation: document.getElementById("cust-nominee-relation").value.trim(),
                custPhoto: currentUploadedCustPhoto,
                goldPhoto: currentUploadedGoldPhoto,
                loanPurpose: document.getElementById("loan-purpose").value.trim(),
                
                // Charges
                shareA: parseFloat(document.getElementById("charge-share-a").value) || 0,
                shareB: parseFloat(document.getElementById("charge-share-b").value) || 0,
                memberFee: parseFloat(document.getElementById("charge-member-fee").value) || 0,
                valuationCharge: parseFloat(document.getElementById("charge-valuation").value) || 0,
                stampCharge: parseFloat(document.getElementById("charge-stamp").value) || 0,
                serviceCharge: parseFloat(document.getElementById("charge-service").value) || 0,
                docCharge: parseFloat(document.getElementById("charge-document").value) || 0,
                insCharge: parseFloat(document.getElementById("charge-insurance").value) || 0,
                cgst: parseFloat(document.getElementById("charge-cgst").value) || 0,
                sgst: parseFloat(document.getElementById("charge-sgst").value) || 0,
                adjustment: parseFloat(document.getElementById("charge-adjustment").value) || 0,
                totalCharges: parseFloat(document.getElementById("charge-total").value) || 0,
                netDisbursal: amount - (parseFloat(document.getElementById("charge-total").value) || 0)
            };

            state.loans.push(newLoan);
            
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
            saveState();

            alert("Gold loan entry saved successfully.");
            openPrintModal(newLoan.id);
        }

        prepareEntryForm();
        updateDashboardStats();
        checkPendingCustomerNumbers();
    });

    document.getElementById("reset-loan-form-btn").onclick = () => {
        if (confirm("Reset all form inputs?")) {
            prepareEntryForm();
        }
    };
}

// ==================== LOAN LEDGER REGISTER ====================
function renderLoanRegister() {
    const tbody = document.getElementById("register-tbody");
    const emptyMsg = document.getElementById("register-empty-msg");
    const filterBranchSelect = document.getElementById("filter-branch");
    const filterProductSelect = document.getElementById("filter-product");

    filterBranchSelect.innerHTML = '<option value="">-- All Branches --</option>';
    state.branches.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.code;
        opt.textContent = b.code === "99" ? b.name : `${b.code} ${b.name}`;
        filterBranchSelect.appendChild(opt);
    });

    filterProductSelect.innerHTML = '<option value="">-- All Schemes --</option>';
    const uniqueCodes = [...new Set(state.products.map(p => p.code))];
    uniqueCodes.forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code;
        filterProductSelect.appendChild(opt);
    });

    function runFilters() {
        const query = document.getElementById("filter-search").value.toLowerCase();
        const branchCode = filterBranchSelect.value;
        const dateFrom = document.getElementById("filter-date-from").value;
        const dateTo = document.getElementById("filter-date-to").value;
        const productCode = filterProductSelect.value;

        const isHeadOffice = (state.currentSession.code === "99");
        let list = state.loans;
        if (!isHeadOffice) {
            list = list.filter(l => l.branchCode === state.currentSession.code);
        }

        const filtered = list.filter(loan => {
            const matchesQuery = !query || 
                loan.borrowerName.toLowerCase().includes(query) || 
                loan.accountNo.toLowerCase().includes(query) || 
                loan.packetNo.toString().includes(query);
            
            const matchesBranch = !branchCode || loan.branchCode === branchCode;
            const matchesProduct = !productCode || loan.productCode === productCode;
            
            let matchesDate = true;
            if (dateFrom && loan.date < dateFrom) matchesDate = false;
            if (dateTo && loan.date > dateTo) matchesDate = false;

            return matchesQuery && matchesBranch && matchesProduct && matchesDate;
        });

        tbody.innerHTML = "";
        if (filtered.length === 0) {
            emptyMsg.classList.remove("hidden");
            return;
        }
        emptyMsg.classList.add("hidden");

        const sorted = [...filtered].reverse();

        sorted.forEach(loan => {
            const is3553 = loan.productCode && loan.productCode.includes("3553");
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${formatDateDMY(loan.date)}</td>
                <td><small>${loan.branchCode} ${loan.branchName.replace(" BRANCH", "")}</small></td>
                <td><strong>${loan.accountNo}</strong></td>
                <td>Packet #${loan.packetNo}</td>
                <td>${loan.borrowerName}</td>
                <td><small class="gold-badge">${loan.productCode}</small></td>
                <td>₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                <td>${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)}g / ${parseFloat(loan.goldWeight).toFixed(3)}g</td>
                <td>₹${parseFloat(loan.totalCharges).toLocaleString("en-IN")}</td>
                <td class="bold-text green-color">₹${parseFloat(loan.netDisbursal).toLocaleString("en-IN")}</td>
                <td>
                    <button class="btn btn-secondary-sm" onclick="openPrintModal('${loan.id}')">
                        <i class="fa-solid fa-print"></i> Print
                    </button>
                </td>
                <td>
                    <div class="action-group">
                        ${is3553 ? `
                            <button class="btn-icon" style="color: #b8860b; font-size: 15px; margin-right: 4px;" title="Print Expense Vouchers / ખર્ચ વાઉચર" onclick="printSingleLoanExpenseVouchers('${loan.id}')">
                                <i class="fa-solid fa-receipt"></i>
                            </button>
                        ` : ''}
                        <button class="btn-icon btn-icon-green" title="Edit" onclick="editLoanRecord('${loan.id}')">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        ${isHeadOffice ? `
                            <button class="btn-icon btn-icon-red" title="Delete" onclick="deleteLoanRecord('${loan.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
            
            tr.addEventListener("click", (e) => {
                if (e.target.closest("button") || e.target.closest(".action-group")) {
                    return;
                }
                editLoanRecord(loan.id);
            });
            
            tbody.appendChild(tr);
        });
    }

    const filters = ["filter-search", "filter-branch", "filter-date-from", "filter-date-to", "filter-product"];
    filters.forEach(id => {
        document.getElementById(id).oninput = runFilters;
        document.getElementById(id).onchange = runFilters;
    });

    document.getElementById("clear-filters-btn").onclick = () => {
        document.getElementById("filter-search").value = "";
        document.getElementById("filter-branch").value = "";
        document.getElementById("filter-date-from").value = "";
        document.getElementById("filter-date-to").value = "";
        document.getElementById("filter-product").value = "";
        runFilters();
    };

    document.getElementById("export-csv-btn").onclick = () => {
        exportLoansToCSV();
    };

    runFilters();
}

function deleteLoanRecord(loanId) {
    if (state.currentSession.code !== "99") {
        alert("Permission Denied: Only Head Office can delete loan records.");
        return;
    }
    const confirmDel = confirm("Warning: Are you sure you want to permanently delete this loan record?");
    if (!confirmDel) return;

    state.loans = state.loans.filter(l => l.id !== loanId);
    renderLoanRegister();
    updateDashboardStats();
    
    saveState(true); // Sync in background
    alert("Record deleted.");
}

function editLoanRecord(loanId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) {
        alert("Error: Loan record not found.");
        return;
    }

    const isHO = (state.currentSession.code === "99");
    if (!isHO && loan.branchCode !== state.currentSession.code) {
        alert("Permission Denied: You can only edit loan records belonging to your branch.");
        return;
    }
    
    state.editingLoanId = loanId;
    switchTab("entry-view", true);

    document.getElementById("loan-date").value = loan.date;
    document.getElementById("unique-proposal-no").value = loan.uniqueProposalNo || "";
    
    const statusRadios = document.getElementsByName("loan-status");
    statusRadios.forEach(radio => {
        if (radio.value === loan.loanStatus) {
            radio.checked = true;
        }
    });

    const isMemberSelect = document.getElementById("is-member");
    const memberNoInput = document.getElementById("member-no");
    const isNewMemberCheck = document.getElementById("is-new-member-checkbox");

    if (isMemberSelect) isMemberSelect.value = loan.isMember;
    if (loan.isMember === "Yes") {
        if (memberNoInput) { memberNoInput.required = true; memberNoInput.value = loan.memberNo; }
        if (isNewMemberCheck) isNewMemberCheck.checked = false;
    } else {
        if (memberNoInput) { memberNoInput.required = false; memberNoInput.value = ""; }
        if (isNewMemberCheck) isNewMemberCheck.checked = true;
    }
    if (isNewMemberCheck) isNewMemberCheck.disabled = true;

    document.getElementById("packet-no").value = loan.packetNo;

    const valuerSelect = document.getElementById("valuer-select");
    valuerSelect.innerHTML = '<option value="">-- Select Valuer --</option>';
    state.valuers.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = `${v.name} (${v.mobile})`;
        valuerSelect.appendChild(opt);
    });
    valuerSelect.value = loan.valuerId;
    
    document.getElementById("cust-no").value = loan.custNo || "";
    document.getElementById("cust-name").value = loan.borrowerName || "";
    document.getElementById("cust-address").value = loan.custAddress || "";
    document.getElementById("cust-savings-ac").value = loan.custSavingsAc || "";
    document.getElementById("cust-age").value = loan.custAge || "";
    document.getElementById("cust-occupation").value = loan.custOccupation || "";
    document.getElementById("cust-religion").value = loan.custReligion || "";
    document.getElementById("cust-caste").value = loan.custCaste || "";
    document.getElementById("cust-mobile").value = loan.custMobile || "";
    document.getElementById("cust-nominee-name").value = loan.custNomineeName || "";
    document.getElementById("cust-nominee-relation").value = loan.custNomineeRelation || "";
    document.getElementById("loan-purpose").value = loan.loanPurpose || "";

    if (loan.custPhoto) {
        currentUploadedCustPhoto = loan.custPhoto;
        document.getElementById("cust-photo-preview").innerHTML = `<img src="${loan.custPhoto}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
    } else {
        currentUploadedCustPhoto = "";
        document.getElementById("cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }

    if (loan.goldPhoto) {
        currentUploadedGoldPhoto = loan.goldPhoto;
        document.getElementById("gold-photo-preview").innerHTML = `<img src="${loan.goldPhoto}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
    } else {
        currentUploadedGoldPhoto = "";
        document.getElementById("gold-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }

    document.getElementById("loan-amount").value = loan.loanAmount;
    if(document.getElementById("gold-weight-gross")) document.getElementById("gold-weight-gross").value = loan.goldWeightGross || loan.goldWeight;
    if(document.getElementById("gold-weight-net")) document.getElementById("gold-weight-net").value = loan.goldWeight;
    
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
    renderOrnamentsGrid();
    if(document.getElementById("gold-weight-fine")) document.getElementById("gold-weight-fine").value = loan.goldWeightFine || '';
    document.getElementById("ornaments-desc").value = loan.ornamentsDesc;
    document.getElementById("charge-adjustment").value = loan.adjustment;
    document.getElementById("grievance-officer").value = loan.grievanceOfficer || "Amrutlal Valjibhai Chavda";
    
    if (loan.loanAmount > 200000) {
        document.getElementById("loan-category-select").value = loan.productCode;
    }

    const pCode = loan.productCode || "";
    const isInst = pCode.includes("3527");
    const instContainer = document.getElementById("installment-fields-container");
    if (instContainer) {
        instContainer.style.display = isInst ? "block" : "none";
    }
    document.getElementById("loan-installments").value = loan.tenureMonths !== null && loan.tenureMonths !== undefined ? loan.tenureMonths : "36";
    document.getElementById("loan-emi-amount").value = loan.emiAmount !== null && loan.emiAmount !== undefined ? loan.emiAmount : "";

    const form = document.getElementById("gold-loan-form");
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Update Loan Entry';

    calculateCharges();
}

function exportLoansToCSV() {
    const isHeadOffice = (state.currentSession.code === "99");
    let list = state.loans;
    if (!isHeadOffice) {
        list = list.filter(l => l.branchCode === state.currentSession.code);
    }

    if (list.length === 0) {
        alert("No records to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = [
        "Date", "Branch Code", "Branch Name", "Account No", "Packet No", 
        "Borrower Name", "Loan Status", "Unique Proposal No", "Member Status", "Member No", 
        "Gold Weight(g)", "Market Rate", "Market Value", "Sanctioned Amount", 
        "Valuation Charge", "Stamp Duty", "Service Charge", "Doc Charge", 
        "Insurance", "CGST", "SGST", "Adjustment", "Total Deductions", "Net Disbursed"
    ];
    csvContent += headers.join(",") + "\r\n";

    list.forEach(l => {
        const row = [
            l.date, l.branchCode, `"${l.branchName}"`, `"${l.accountNo}"`, l.packetNo,
            `"${l.borrowerName}"`, l.loanStatus, `"${l.uniqueProposalNo || ''}"`, l.isMember, l.memberNo,
            l.goldWeight, l.marketRate, l.marketValue, l.loanAmount,
            l.valuationCharge, l.stampCharge, l.serviceCharge, l.docCharge,
            l.insCharge, l.cgst, l.sgst, l.adjustment, l.totalCharges, l.netDisbursal
        ];
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `JCCB_Gold_Loans_${getTodayDateStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== HEAD OFFICE DATA BACKUP CENTER ====================
// Store handle in IndexedDB
async function saveDirHandleToDB(handle) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("JCCB_Backup_DB", 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore("handles");
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("handles", "readwrite");
            const store = tx.objectStore("handles");
            store.put(handle, "dirHandle");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}

// Retrieve handle from IndexedDB
async function getDirHandleFromDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open("JCCB_Backup_DB", 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore("handles");
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("handles", "readonly");
            const store = tx.objectStore("handles");
            const getReq = store.get("dirHandle");
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

async function loadSavedBackupHandle() {
    try {
        const handle = await getDirHandleFromDB();
        if (handle) {
            savedDirHandle = handle;
            const permission = await savedDirHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                updateBackupUI(savedDirHandle.name, false);
            } else {
                updateBackupUI(savedDirHandle.name, true);
            }
        }
    } catch (e) {
        console.warn("Failed to load saved directory handle from DB:", e);
    }
}

function generateBranchCSVContent(branchLoans) {
    const headers = [
        "Date", "Account No", "Unique Proposal No", "Packet No", "Borrower Name", "Savings A/c No", 
        "Mobile No", "Age", "Occupation", "Religion", "Caste", "Nominee Name", 
        "Nominee Relation", "Scheme Code", "Gold Weight (g)", "Market Rate (/10g)", 
        "Market Value", "Sanctioned Amount", "Interest Rate", "Ornaments Description", 
        "Soni Valuer Name", "Share Capital A", "Share Capital B", "Member Fee", 
        "Valuation Fee", "Stamp Duty", "Service Charge", "Document Charge", 
        "Insurance Charge", "CGST", "SGST", "Adjustment", "Total Deductions", 
        "Net Disbursal Amount"
    ];

    let csvContent = headers.join(",") + "\r\n";

    branchLoans.forEach(l => {
        const valuer = state.valuers.find(v => v.id === l.valuerId) || { name: l.valuerId };
        const row = [
            l.date || "",
            `"${l.accountNo || ''}"`,
            `"${l.uniqueProposalNo || ''}"`,
            l.packetNo || "",
            `"${l.borrowerName || ''}"`,
            `"${l.custSavingsAc || ''}"`,
            `"${l.custMobile || ''}"`,
            l.custAge || 0,
            `"${l.custOccupation || ''}"`,
            `"${l.custReligion || ''}"`,
            `"${l.custCaste || ''}"`,
            `"${l.custNomineeName || ''}"`,
            `"${l.custNomineeRelation || ''}"`,
            `"${l.productCode || ''}"`,
            l.goldWeight || 0,
            l.marketRate || 0,
            l.marketValue || 0,
            l.loanAmount || 0,
            `"${l.interestRate || ''}"`,
            `"${l.ornamentsDesc || ''}"`,
            `"${valuer.name || ''}"`,
            l.shareA || 0,
            l.shareB || 0,
            l.memberFee || 0,
            l.valuationCharge || 0,
            l.stampCharge || 0,
            l.serviceCharge || 0,
            l.docCharge || 0,
            l.insCharge || 0,
            l.cgst || 0,
            l.sgst || 0,
            l.adjustment || 0,
            l.totalCharges || 0,
            l.netDisbursal || 0
        ];
        csvContent += row.join(",") + "\r\n";
    });

    return csvContent;
}

function updateBackupUI(dirName, needsActivation = false) {
    const statusText = document.getElementById("backup-folder-status");
    const pathText = document.getElementById("backup-folder-path");
    const statusDot = document.getElementById("backup-status-dot");
    const syncBtn = document.getElementById("btn-ho-backup-manual");
    const selectBtn = document.getElementById("btn-ho-backup-select");

    if (dirName) {
        if (needsActivation) {
            statusText.textContent = "Requires Activation";
            statusText.className = "text-warning";
            pathText.innerHTML = `Connected directory: <strong>${dirName}</strong>. Click "Re-Authorize Folder" to restore daily 6:00 PM auto-backup.`;
            statusDot.style.backgroundColor = "var(--warning)";
            statusDot.style.boxShadow = "0 0 8px var(--warning)";
            syncBtn.style.display = "none";
            selectBtn.innerHTML = '<i class="fa-solid fa-key"></i> Re-Authorize Folder';
        } else {
            statusText.textContent = "Active";
            statusText.className = "text-green";
            pathText.innerHTML = `Connected directory: <strong>${dirName}</strong>. Ready for 6:00 PM auto-backup.`;
            statusDot.style.backgroundColor = "var(--success)";
            statusDot.style.boxShadow = "0 0 8px var(--success)";
            syncBtn.style.display = "inline-flex";
            selectBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Select Different Folder';
        }
    } else {
        statusText.textContent = "Not Set";
        statusText.className = "text-red";
        pathText.textContent = "Select a folder to enable daily 6:00 PM auto-backup.";
        statusDot.style.backgroundColor = "var(--danger)";
        statusDot.style.boxShadow = "0 0 8px var(--danger)";
        syncBtn.style.display = "none";
        selectBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Select Folder & Back Up Now';
    }
}

async function selectNewBackupFolder() {
    try {
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        savedDirHandle = handle;
        try {
            await saveDirHandleToDB(handle);
        } catch (e) {
            console.warn("Failed to save handle to IndexedDB:", e);
        }
        updateBackupUI(savedDirHandle.name, false);
        await backupAllBranchesData(false);
    } catch (err) {
        console.error("Folder picker cancelled or failed:", err);
        if (err.name !== "AbortError") {
            alert("Folder picker not supported or permission denied. Exporting via browser downloads fallback...");
            backupViaDownloadsFallback();
        }
    }
}

async function backupAllBranchesData(isAuto) {
    if (!savedDirHandle) {
        console.warn("Backup triggered but no folder handle saved.");
        return;
    }

    try {
        const options = { mode: 'readwrite' };
        const permission = await savedDirHandle.queryPermission(options);
        if (permission !== 'granted') {
            if (isAuto) {
                console.warn("Auto-backup failed: folder permission not granted. Updating UI.");
                updateBackupUI(savedDirHandle.name, true);
                return;
            } else {
                const req = await savedDirHandle.requestPermission(options);
                if (req !== 'granted') {
                    alert("Permission denied to write to folder.");
                    return;
                }
            }
        }

        let successCount = 0;
        for (const branch of state.branches) {
            const branchLoans = state.loans.filter(l => l.branchCode === branch.code);
            const csvContent = generateBranchCSVContent(branchLoans);
            const fileName = `Branch_${branch.code}_${branch.name.replace(/\s+/g, '_')}.csv`;
            
            const fileHandle = await savedDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            
            const encoder = new TextEncoder();
            const encoded = encoder.encode("\ufeff" + csvContent);
            await writable.write(encoded);
            await writable.close();
            successCount++;
        }

        if (isAuto) {
            showToastNotification(`Daily 6:00 PM Auto-Backup Completed successfully! Saved ${successCount} branch files.`);
        } else {
            alert(`Backup completed successfully! Saved ${successCount} branch CSV files to folder: ${savedDirHandle.name}`);
        }
    } catch (err) {
        console.error("Backup process error:", err);
        if (isAuto) {
            showToastNotification("Daily Auto-Backup encountered an error writing files.");
        } else {
            alert("Error during backup: " + err.message);
        }
    }
}

function backupViaDownloadsFallback() {
    let successCount = 0;
    state.branches.forEach(branch => {
        const branchLoans = state.loans.filter(l => l.branchCode === branch.code);
        const csvContent = generateBranchCSVContent(branchLoans);
        const fileName = `Branch_${branch.code}_${branch.name.replace(/\s+/g, '_')}.csv`;
        
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        successCount++;
    });
    alert(`Downloaded ${successCount} branch CSV files to your default Downloads folder.`);
}

function showToastNotification(message) {
    let toast = document.querySelector(".toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${message}</span>`;
    
    setTimeout(() => {
        toast.classList.add("show");
    }, 100);

    setTimeout(() => {
        toast.classList.remove("show");
    }, 5000);
}

function initAutoBackupScheduler() {
    setInterval(() => {
        const now = new Date();
        const hrs = now.getHours();
        const mins = now.getMinutes();
        
        if (hrs === 18 && mins === 0) {
            const todayStr = getTodayDateStr();
            if (lastAutoBackupDate !== todayStr) {
                lastAutoBackupDate = todayStr;
                if (savedDirHandle) {
                    backupAllBranchesData(true);
                } else {
                    console.warn("Daily 6:00 PM backup skipped: No folder selected yet.");
                }
            }
        }
    }, 1000 * 30);
}

// ==================== DAILY CREDIT VOUCHERS MANAGER ====================
function prepareDailyVouchersView() {
    const voucherDateSelect = document.getElementById("voucher-date-select");
    const voucherTypeSelect = document.getElementById("voucher-type-select");
    
    if (!voucherDateSelect.value) {
        voucherDateSelect.value = getTodayDateStr();
    }

    loadDailyVouchersSummary();

    document.getElementById("load-vouchers-btn").onclick = () => {
        loadDailyVouchersSummary();
    };

    if (voucherTypeSelect) {
        voucherTypeSelect.onchange = () => {
            loadDailyVouchersSummary();
        };
    }

    document.getElementById("print-vouchers-btn").onclick = () => {
        printDailyVouchers();
    };
}

function getDailyVouchersData(dateStr, voucherType = "regular") {
    const isHeadOffice = (state.currentSession.code === "99");
    
    let dayLoans = state.loans.filter(l => l.date === dateStr);
    if (!isHeadOffice) {
        dayLoans = dayLoans.filter(l => l.branchCode === state.currentSession.code);
    }

    if (voucherType === "regular") {
        // Filter regular loans (3527, 3725, 3524)
        dayLoans = dayLoans.filter(l => l.productCode && 
            (l.productCode.includes("3725") || l.productCode.includes("3524") || l.productCode.includes("3527"))
        );

        let shareA = 0;
        let shareB = 0;
        let memberFee = 0;
        let stamp = 0;
        let service = 0;
        let doc = 0;
        let insurance = 0;
        let sgst = 0;
        let cgst = 0;

        let valuerChargesMap = {};

        dayLoans.forEach(loan => {
            shareA += parseFloat(loan.shareA || 0);
            shareB += parseFloat(loan.shareB || 0);
            memberFee += parseFloat(loan.memberFee || 0);
            stamp += parseFloat(loan.stampCharge || 0);
            service += parseFloat(loan.serviceCharge || 0);
            doc += parseFloat(loan.docCharge || 0);
            insurance += parseFloat(loan.insCharge || 0);
            sgst += parseFloat(loan.sgst || 0);
            cgst += parseFloat(loan.cgst || 0);

            if (loan.valuationCharge && loan.valuationCharge > 0) {
                valuerChargesMap[loan.valuerId] = (valuerChargesMap[loan.valuerId] || 0) + parseFloat(loan.valuationCharge);
            }
        });

        const voucherAccounts = [
            { key: "shareA", code: "GL-150040-SHARE APPLICATION MONEY (GROUP-A)", title: "Share Application Money (Group A)", amount: shareA },
            { key: "shareB", code: "GL-150058-SHARE APPLICATION MONEY (GROUP-B)", title: "Share Application Money (Group B)", amount: shareB },
            { key: "memberFee", code: "GL-160067-MBMBER FEE", title: "Member Fee", amount: memberFee },
            { key: "stamp", code: "GL-370065-ADHESIV STAMP ADVANCE", title: "Stamp Charges", amount: stamp },
            { key: "service", code: "GL-160063-SERVICE CHARGE INCOME", title: "Service Charge Income", amount: service },
            { key: "doc", code: "GL-160181-DOCUMENT CHARGE INCOME", title: "Document Charge Income", amount: doc },
            { key: "insurance", code: "GL-150050-INSURANCE DEPOSIT", title: "Insurance Deposit", amount: insurance },
            { key: "sgst", code: "GL-370260-SGST PAYABLE", title: "SGST Payable", amount: sgst },
            { key: "cgst", code: "GL-370261-CGST PAYABLE", title: "CGST Payable", amount: cgst }
        ];

        let activeVouchers = voucherAccounts.filter(v => v.amount > 0);

        for (let valuerId in valuerChargesMap) {
            const valuerSum = valuerChargesMap[valuerId];
            if (valuerSum > 0) {
                const valuer = state.valuers.find(v => v.id === valuerId) || { name: valuerId, savingsAc: "-" };
                activeVouchers.push({
                    key: "valuer_" + valuerId,
                    code: `A/C: ${valuer.savingsAc} - VALUER CHARGE`,
                    title: `Valuer Valuation: ${valuer.name}`,
                    amount: valuerSum,
                    isValuer: true,
                    valuerName: valuer.name,
                    valuerAc: valuer.savingsAc
                });
            }
        }

        return activeVouchers;
    } else {
        // Filter Overdraft loans (3553)
        dayLoans = dayLoans.filter(l => l.productCode && l.productCode.includes("3553"));

        let overdraftVouchers = [];
        dayLoans.forEach(loan => {
            const deductions = [
                { key: "shareA", code: "GL-150040-SHARE APPLICATION MONEY (GROUP-A)", title: "Share Application Money (Group A)", amount: parseFloat(loan.shareA || 0) },
                { key: "shareB", code: "GL-150058-SHARE APPLICATION MONEY (GROUP-B)", title: "Share Application Money (Group B)", amount: parseFloat(loan.shareB || 0) },
                { key: "memberFee", code: "GL-160067-MBMBER FEE", title: "Member Fee", amount: parseFloat(loan.memberFee || 0) },
                { key: "stamp", code: "GL-370065-ADHESIV STAMP ADVANCE", title: "Stamp Charges", amount: parseFloat(loan.stampCharge || 0) },
                { key: "service", code: "GL-160063-SERVICE CHARGE INCOME", title: "Service Charge Income", amount: parseFloat(loan.serviceCharge || 0) },
                { key: "doc", code: "GL-160181-DOCUMENT CHARGE INCOME", title: "Document Charge Income", amount: parseFloat(loan.docCharge || 0) },
                { key: "insurance", code: "GL-150050-INSURANCE DEPOSIT", title: "Insurance Deposit", amount: parseFloat(loan.insCharge || 0) },
                { key: "sgst", code: "GL-370260-SGST PAYABLE", title: "SGST Payable", amount: parseFloat(loan.sgst || 0) },
                { key: "cgst", code: "GL-370261-CGST PAYABLE", title: "CGST Payable", amount: parseFloat(loan.cgst || 0) }
            ];

            deductions.forEach(d => {
                if (d.amount > 0) {
                    overdraftVouchers.push({
                        key: `od_${loan.id}_${d.key}`,
                        code: d.code,
                        title: d.title,
                        amount: d.amount,
                        loanNo: loan.accountNo,
                        borrowerName: loan.borrowerName,
                        branchCode: loan.branchCode,
                        branchName: loan.branchName,
                        date: loan.date,
                        particulars: `Being credit of ${d.title} for Gold Loan A/c: ${loan.accountNo} (${loan.borrowerName}).`
                    });
                }
            });

            const valuerVal = parseFloat(loan.valuationCharge || 0);
            if (valuerVal > 0) {
                const valuer = state.valuers.find(v => v.id === loan.valuerId) || { name: loan.valuerId, savingsAc: "-" };
                overdraftVouchers.push({
                    key: `od_${loan.id}_valuer`,
                    code: `A/C: ${valuer.savingsAc} - VALUER CHARGE`,
                    title: `Valuer Valuation: ${valuer.name}`,
                    amount: valuerVal,
                    loanNo: loan.accountNo,
                    borrowerName: loan.borrowerName,
                    branchCode: loan.branchCode,
                    branchName: loan.branchName,
                    date: loan.date,
                    particulars: `Being credit of Valuer Valuation fee for Gold Loan A/c: ${loan.accountNo} (${loan.borrowerName}) to Valuer: ${valuer.name} A/c: ${valuer.savingsAc}.`
                });
            }
        });

        return overdraftVouchers;
    }
}

function loadDailyVouchersSummary() {
    const tableHeader = document.querySelector("#daily-vouchers-summary-table thead tr");
    const tbody = document.getElementById("daily-vouchers-tbody");
    tbody.innerHTML = "";
    
    const dateStr = document.getElementById("voucher-date-select").value;
    const voucherTypeSelect = document.getElementById("voucher-type-select");
    const voucherType = voucherTypeSelect ? voucherTypeSelect.value : "regular";

    const isHeadOffice = (state.currentSession.code === "99");
    let dayLoans = state.loans.filter(l => l.date === dateStr);
    if (!isHeadOffice) {
        dayLoans = dayLoans.filter(l => l.branchCode === state.currentSession.code);
    }

    if (voucherType === "regular") {
        if (tableHeader) {
            tableHeader.innerHTML = `
                <th>GL Head / Account Header</th>
                <th>Account Code</th>
                <th>Aggregated Sum (₹)</th>
                <th>Sum in Words</th>
            `;
        }

        const vouchers = getDailyVouchersData(dateStr, "regular");
        if (vouchers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No transactions or deductions found on ${formatDateDMY(dateStr)}.</td></tr>`;
            return;
        }

        vouchers.forEach(v => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${v.title}</strong></td>
                <td><code>${v.code}</code></td>
                <td class="bold-text">₹${v.amount.toLocaleString("en-IN")}.00</td>
                <td><small class="text-muted">${numberToWords(v.amount)}</small></td>
            `;
            tbody.appendChild(tr);
        });

        const printBtn = document.getElementById("print-vouchers-btn");
        if (printBtn) printBtn.style.display = "inline-flex";

    } else {
        if (tableHeader) {
            tableHeader.innerHTML = `
                <th>Loan Account No / Borrower Name</th>
                <th>Product / Scheme</th>
                <th>Loan Amount (₹)</th>
                <th>Action</th>
            `;
        }

        const odLoans = dayLoans.filter(l => l.productCode && l.productCode.includes("3553"));

        if (odLoans.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No Overdraft (3553) loans found on ${formatDateDMY(dateStr)}.</td></tr>`;
            return;
        }

        odLoans.forEach(loan => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${loan.accountNo}</strong><br><small class="text-muted">${loan.borrowerName}</small></td>
                <td><small class="gold-badge">${loan.productCode}</small></td>
                <td class="bold-text">₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}.00</td>
                <td>
                    <button class="btn btn-secondary-sm" onclick="printSingleLoanExpenseVouchers('${loan.id}')">
                        <i class="fa-solid fa-print"></i> Print Expense Vouchers / ખર્ચ વાઉચર પ્રિન્ટ
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const printBtn = document.getElementById("print-vouchers-btn");
        if (printBtn) printBtn.style.display = "none";
    }
}

function printDailyVouchers() {
    const dateStr = document.getElementById("voucher-date-select").value;
    const voucherTypeSelect = document.getElementById("voucher-type-select");
    const voucherType = voucherTypeSelect ? voucherTypeSelect.value : "regular";
    const vouchers = getDailyVouchersData(dateStr, voucherType);

    if (vouchers.length === 0) {
        alert("No transaction entries to print on this date.");
        return;
    }

    const printArea = document.getElementById("print-area");
    printArea.innerHTML = "";

    let html = "";
    const vouchersPerPage = 3;
    const totalPages = Math.ceil(vouchers.length / vouchersPerPage);

    for (let page = 0; page < totalPages; page++) {
        const isLastPage = (page === totalPages - 1);
        const pageClass = isLastPage ? "print-voucher print-a4-three" : "print-voucher print-a4-three print-page-break";
        
        html += `<div class="${pageClass}">`;

        for (let i = 0; i < vouchersPerPage; i++) {
            const vIndex = (page * vouchersPerPage) + i;
            if (vIndex >= vouchers.length) {
                html += `<div class="three-part-segment" style="border:none; visibility:hidden;"></div>`;
                continue;
            }

            const voucher = vouchers[vIndex];
            const isLastInPage = (i === vouchersPerPage - 1);
            
            const particularsText = voucher.particulars || `Being aggregated credit sum of ${voucher.title} for Gold Loans on ${formatDateDMY(dateStr)}.`;
            const bCode = voucher.branchCode || state.currentSession.code;
            const bName = voucher.branchName || state.currentSession.name;
            const vDate = voucher.date || dateStr;

            html += `
                <div class="three-part-segment" style="padding: 10px 0;">
                    <div class="voucher-print-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo" style="width:38px; height:38px; border-radius:50%; border:1px solid #000; margin-right:8px;">
                            <div class="bank-info">
                                <h2 class="bank-title" style="font-size: 13.5px; font-weight:800; margin:0; color:#000;">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle" style="font-size: 10.5px; margin:2px 0 0 0; font-weight:600; color:#000;">Branch: ${bCode} - ${bName}</p>
                            </div>
                        </div>
                        <div class="voucher-badge" style="font-size: 11.5px; font-weight:800; border: 1.5px solid #000; padding: 3px 8px; text-transform: uppercase;">CASH CREDIT VOUCHER</div>
                    </div>

                    <div class="print-meta-grid-three" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:8px; border:1.5px solid #000000; padding:6px 10px; font-size:12px; font-weight:700;">
                        <div><strong>Voucher Date:</strong> ${formatDateDMY(vDate)}</div>
                        <div><strong>Voucher No:</strong> JV-${vDate.replace(/-/g, "")}-${vIndex + 1}</div>
                        <div><strong>Account Head:</strong> Credits Ledger</div>
                    </div>

                    <div style="border: 1.5px solid #000000; padding: 12px; font-size: 12.5px; margin-bottom: 5px; flex: 1; display:flex; flex-direction:column; justify-content:space-between; background-color:#ffffff; color:#000000;">
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; border-bottom:1.5px solid #000000; padding-bottom:4px;">
                                <span style="font-weight:800;">Account Header: ${voucher.code}</span>
                                <span style="font-weight:900; font-size:13.5px;">₹ ${voucher.amount.toLocaleString("en-IN")}.00</span>
                            </div>
                            <div style="font-size:12px; margin-bottom: 6px;">
                                <strong>Amount in Words:</strong> <em style="font-weight:700;">${numberToWords(voucher.amount)}</em>
                            </div>
                        </div>
                        
                        <div style="font-size: 12.5px; font-weight: 700; color: #000000; text-align: center; margin: 10px 0; border: 1.5px dashed #000000; padding: 8px 6px; border-radius: 4px; background-color: #fafafa; line-height: 1.3;">
                            Particulars: ${particularsText}
                        </div>
                    </div>

                    <div class="print-signatures-row-three" style="display:flex; justify-content:space-between; margin-top: 15px;">
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Clerk / Cashier</div>
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Officer</div>
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Manager</div>
                    </div>

                    ${!isLastInPage ? `<div class="tear-line-indicator" style="text-align:center; margin: 12px 0; font-size: 11px; border-top: 1.5px dashed #000; padding-top: 4px;"><i class="fa-solid fa-scissors"></i> Tear here -------------------------------------------------------------</div>` : ''}
                </div>
            `;
        }

        html += `</div>`;
    }

    printArea.innerHTML = html;
    triggerPrintWhenReady();
}

function printSingleLoanExpenseVouchers(loanId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) {
        alert("Error: Loan record not found.");
        return;
    }

    const deductions = [
        { key: "shareA", code: "GL-150040-SHARE APPLICATION MONEY (GROUP-A)", title: "Share Application Money (Group A)", amount: parseFloat(loan.shareA || 0) },
        { key: "shareB", code: "GL-150058-SHARE APPLICATION MONEY (GROUP-B)", title: "Share Application Money (Group B)", amount: parseFloat(loan.shareB || 0) },
        { key: "memberFee", code: "GL-160067-MBMBER FEE", title: "Member Fee", amount: parseFloat(loan.memberFee || 0) },
        { key: "stamp", code: "GL-370065-ADHESIV STAMP ADVANCE", title: "Stamp Charges", amount: parseFloat(loan.stampCharge || 0) },
        { key: "service", code: "GL-160063-SERVICE CHARGE INCOME", title: "Service Charge Income", amount: parseFloat(loan.serviceCharge || 0) },
        { key: "doc", code: "GL-160181-DOCUMENT CHARGE INCOME", title: "Document Charge Income", amount: parseFloat(loan.docCharge || 0) },
        { key: "insurance", code: "GL-150050-INSURANCE DEPOSIT", title: "Insurance Deposit", amount: parseFloat(loan.insCharge || 0) },
        { key: "sgst", code: "GL-370260-SGST PAYABLE", title: "SGST Payable", amount: parseFloat(loan.sgst || 0) },
        { key: "cgst", code: "GL-370261-CGST PAYABLE", title: "CGST Payable", amount: parseFloat(loan.cgst || 0) }
    ];

    let vouchers = [];
    deductions.forEach(d => {
        if (d.amount > 0) {
            vouchers.push({
                key: `od_${loan.id}_${d.key}`,
                code: d.code,
                title: d.title,
                amount: d.amount,
                loanNo: loan.accountNo,
                borrowerName: loan.borrowerName,
                particulars: `Being credit of ${d.title} for Gold Loan A/c: ${loan.accountNo} (${loan.borrowerName}).`
            });
        }
    });

    const valuerVal = parseFloat(loan.valuationCharge || 0);
    if (valuerVal > 0) {
        const valuer = state.valuers.find(v => v.id === loan.valuerId) || { name: loan.valuerId, savingsAc: "-" };
        vouchers.push({
            key: `od_${loan.id}_valuer`,
            code: `A/C: ${valuer.savingsAc} - VALUER CHARGE`,
            title: `Valuer Valuation: ${valuer.name}`,
            amount: valuerVal,
            loanNo: loan.accountNo,
            borrowerName: loan.borrowerName,
            particulars: `Being credit of Valuer Valuation fee for Gold Loan A/c: ${loan.accountNo} (${loan.borrowerName}) to Valuer: ${valuer.name} A/c: ${valuer.savingsAc}.`
        });
    }

    if (vouchers.length === 0) {
        alert("આ લોન માટે કોઈ કપાત કે ખર્ચાઓ નથી.");
        return;
    }

    const printArea = document.getElementById("print-area");
    printArea.innerHTML = "";

    let html = "";
    const vouchersPerPage = 3;
    const totalPages = Math.ceil(vouchers.length / vouchersPerPage);

    for (let page = 0; page < totalPages; page++) {
        const isLastPage = (page === totalPages - 1);
        const pageClass = isLastPage ? "print-voucher print-a4-three" : "print-voucher print-a4-three print-page-break";
        
        html += `<div class="${pageClass}">`;

        for (let i = 0; i < vouchersPerPage; i++) {
            const vIndex = (page * vouchersPerPage) + i;
            if (vIndex >= vouchers.length) {
                html += `<div class="three-part-segment" style="border:none; visibility:hidden;"></div>`;
                continue;
            }

            const voucher = vouchers[vIndex];
            const isLastInPage = (i === vouchersPerPage - 1);
            
            html += `
                <div class="three-part-segment" style="padding: 10px 0;">
                    <div class="voucher-print-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo" style="width:38px; height:38px; border-radius:50%; border:1px solid #000; margin-right:8px;">
                            <div class="bank-info">
                                <h2 class="bank-title" style="font-size: 13.5px; font-weight:800; margin:0; color:#000;">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle" style="font-size: 10.5px; margin:2px 0 0 0; font-weight:600; color:#000;">Branch: ${loan.branchCode} - ${loan.branchName}</p>
                            </div>
                        </div>
                        <div class="voucher-badge" style="font-size: 11.5px; font-weight:800; border: 1.5px solid #000; padding: 3px 8px; text-transform: uppercase;">CASH CREDIT VOUCHER</div>
                    </div>

                    <div class="print-meta-grid-three" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:8px; border:1.5px solid #000000; padding:6px 10px; font-size:12px; font-weight:700;">
                        <div><strong>Voucher Date:</strong> ${formatDateDMY(loan.date)}</div>
                        <div><strong>Voucher No:</strong> JV-${loan.date.replace(/-/g, "")}-${vIndex + 1}</div>
                        <div><strong>Account Head:</strong> Credits Ledger</div>
                    </div>

                    <div style="border: 1.5px solid #000000; padding: 12px; font-size: 12.5px; margin-bottom: 5px; flex: 1; display:flex; flex-direction:column; justify-content:space-between; background-color:#ffffff; color:#000000;">
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; border-bottom:1.5px solid #000000; padding-bottom:4px;">
                                <span style="font-weight:800;">Account Header: ${voucher.code}</span>
                                <span style="font-weight:900; font-size:13.5px;">₹ ${voucher.amount.toLocaleString("en-IN")}.00</span>
                            </div>
                            <div style="font-size:12px; margin-bottom: 6px;">
                                <strong>Amount in Words:</strong> <em style="font-weight:700;">${numberToWords(voucher.amount)}</em>
                            </div>
                        </div>
                        
                        <div style="font-size: 12.5px; font-weight: 700; color: #000000; text-align: center; margin: 10px 0; border: 1.5px dashed #000000; padding: 8px 6px; border-radius: 4px; background-color: #fafafa; line-height: 1.3;">
                            Particulars: ${voucher.particulars}
                        </div>
                    </div>

                    <div class="print-signatures-row-three" style="display:flex; justify-content:space-between; margin-top: 15px;">
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Clerk / Cashier</div>
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Officer</div>
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Manager</div>
                    </div>

                    ${!isLastInPage ? `<div class="tear-line-indicator" style="text-align:center; margin: 12px 0; font-size: 11px; border-top: 1.5px dashed #000; padding-top: 4px;"><i class="fa-solid fa-scissors"></i> Tear here -------------------------------------------------------------</div>` : ''}
                </div>
            `;
        }

        html += `</div>`;
    }

    printArea.innerHTML = html;
    triggerPrintWhenReady();
}

function triggerPrintWhenReady() {
    const printArea = document.getElementById("print-area");
    const images = printArea.querySelectorAll('img');
    let loadedCount = 0;
    if (images.length === 0) {
        setTimeout(() => window.print(), 500);
    } else {
        images.forEach(img => {
            if (img.complete) {
                loadedCount++;
                if (loadedCount === images.length) setTimeout(() => window.print(), 500);
            } else {
                img.onload = img.onerror = () => {
                    loadedCount++;
                    if (loadedCount === images.length) setTimeout(() => window.print(), 500);
                };
            }
        });
    }
}

// ==================== BRANCH MASTER VIEW ====================
function renderBranchMasterList() {
    const tbody = document.getElementById("branch-list-tbody");
    tbody.innerHTML = "";

    state.branches.forEach(b => {
        const tr = document.createElement("tr");
        const isHO = (b.code === "99");
        const passwordLabel = isHO ? "Rahul#80810" : "Admin@123";
        
        tr.innerHTML = `
            <td><strong>${b.code}</strong></td>
            <td>${b.name}</td>
            <td><code class="text-muted">${passwordLabel}</code></td>
            <td>
                ${isHO ? '<span class="text-muted">Read-Only</span>' : `
                    <button class="btn-icon" style="color:var(--primary); margin-right:8px;" onclick="editBranch('${b.code}')" title="Edit Branch Name">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteBranch('${b.code}')" title="Delete Branch">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const form = document.getElementById("branch-master-form");
    form.onsubmit = (e) => {
        e.preventDefault();
        if (state.currentSession.code !== "99") {
            alert("Error: Only Head Office can add branch records.");
            return;
        }
        const code = document.getElementById("branch-code").value.trim().padStart(2, '0');
        const name = document.getElementById("branch-name").value.trim().toUpperCase() + " BRANCH";

        if (state.branches.some(b => b.code === code)) {
            alert("This branch code already exists!");
            return;
        }

        state.branches.push({ code, name });
        
        if (!state.accountSeeds) state.accountSeeds = {};
        state.accountSeeds[code] = { ...DEFAULT_ACCOUNT_SEEDS };
        if (!state.lastPacketSeed) state.lastPacketSeed = {};
        state.lastPacketSeed[code] = 100;

        saveState();
        alert("Branch added successfully.");
        form.reset();
        renderBranchMasterList();
        initAuth();
    };
}

function deleteBranch(code) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can delete branch records.");
        return;
    }
    if (code === "99") return;
    if (confirm(`Are you sure you want to delete branch ${code}?`)) {
        state.branches = state.branches.filter(b => b.code !== code);
        saveState();
        renderBranchMasterList();
        initAuth();
    }
}

function editBranch(code) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can edit branch records.");
        return;
    }
    if (code === "99") return;
    
    const branch = state.branches.find(b => b.code === code);
    if (!branch) return;
    
    const newName = prompt(`Enter new name for branch ${code}:`, branch.name);
    if (newName && newName.trim() !== "") {
        branch.name = newName.trim().toUpperCase();
        if (!branch.name.endsWith(" BRANCH")) {
            branch.name += " BRANCH";
        }
        saveState();
        renderBranchMasterList();
        initAuth();
    }
}

// ==================== VALUER MASTER VIEW ====================
function renderValuerMasterList() {
    const tbody = document.getElementById("valuer-list-tbody");
    tbody.innerHTML = "";
    const isHO = (state.currentSession.code === "99");

    state.valuers.forEach(v => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${v.name}</strong></td>
            <td>${v.mobile}</td>
            <td><small>${v.address}</small></td>
            <td><code>${v.savingsAc}</code></td>
            <td>
                ${isHO ? `
                    <button class="btn-icon btn-icon-red" onclick="deleteValuer('${v.id}')" title="Delete Valuer">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                ` : `<span class="text-muted" style="font-size: 11px;">Read-Only</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const form = document.getElementById("valuer-master-form");
    if (form) {
        const inputs = form.querySelectorAll("input, button");
        if (!isHO) {
            inputs.forEach(input => {
                input.disabled = true;
            });
            const submitBtn = form.querySelector("button[type='submit']");
            if (submitBtn) {
                submitBtn.style.opacity = "0.5";
                submitBtn.style.cursor = "not-allowed";
            }
        } else {
            inputs.forEach(input => {
                input.disabled = false;
            });
            const submitBtn = form.querySelector("button[type='submit']");
            if (submitBtn) {
                submitBtn.style.opacity = "1";
                submitBtn.style.cursor = "pointer";
            }
        }

        form.onsubmit = (e) => {
            e.preventDefault();
            if (state.currentSession.code !== "99") {
                alert("Error: Only Head Office can register Soni Valuers.");
                return;
            }
            const name = document.getElementById("valuer-name").value.trim();
            const mobile = document.getElementById("valuer-mobile").value.trim();
            const address = document.getElementById("valuer-address").value.trim();
            const savingsAc = document.getElementById("valuer-savings-ac").value.trim();

            const newValuer = {
                id: "valuer_" + Date.now(),
                name, mobile, address, savingsAc
            };

            state.valuers.push(newValuer);
            saveState();
            alert("Valuer registered successfully.");
            form.reset();
            renderValuerMasterList();
        };
    }
}

function deleteValuer(id) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can delete valuer records.");
        return;
    }
    if (confirm("Delete this valuer?")) {
        state.valuers = state.valuers.filter(v => v.id !== id);
        saveState();
        renderValuerMasterList();
    }
}

// ==================== PRODUCT MASTER VIEW ====================
function renderProductMasterList() {
    const tbody = document.getElementById("product-list-tbody");
    tbody.innerHTML = "";

    state.products.forEach(p => {
        const tr = document.createElement("tr");
        const limitText = p.maxAmt > 99999999 ? `₹${p.minAmt.toLocaleString("en-IN")} & Above` : `₹${p.minAmt.toLocaleString("en-IN")} to ₹${p.maxAmt.toLocaleString("en-IN")}`;
        
        tr.innerHTML = `
            <td><strong>${p.code}</strong></td>
            <td><small>${limitText}</small></td>
            <td class="bold-text">${p.rate.toFixed(2)}%</td>
            <td><small>${p.desc}</small></td>
            <td>
                <div class="action-group">
                    <button class="btn-icon btn-icon-green" onclick="editProduct('${p.id}')">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteProduct('${p.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const form = document.getElementById("product-master-form");
    form.onsubmit = (e) => {
        e.preventDefault();
        if (state.currentSession.code !== "99") {
            alert("Error: Only Head Office can add or modify loan products.");
            return;
        }
        const editId = document.getElementById("edit-product-id").value;
        const code = document.getElementById("prod-code").value.trim();
        const minAmt = parseFloat(document.getElementById("prod-min-amt").value) || 0;
        const maxAmt = parseFloat(document.getElementById("prod-max-amt").value) || 999999999;
        const rate = parseFloat(document.getElementById("prod-interest-rate").value) || 0;
        const desc = document.getElementById("prod-desc").value.trim();

        if (editId) {
            const index = state.products.findIndex(p => p.id === editId);
            if (index !== -1) {
                state.products[index] = { id: editId, code, minAmt, maxAmt, rate, desc };
                alert("Product updated successfully.");
            }
        } else {
            const newProduct = {
                id: "prod_" + Date.now(),
                code, minAmt, maxAmt, rate, desc
            };
            state.products.push(newProduct);
            alert("Product added successfully.");
        }

        saveState();
        form.reset();
        document.getElementById("edit-product-id").value = "";
        document.getElementById("product-save-btn").innerHTML = '<i class="fa-solid fa-save"></i> Save Product';
        document.getElementById("product-cancel-edit-btn").classList.add("hidden");
        renderProductMasterList();
    };

    document.getElementById("product-cancel-edit-btn").onclick = () => {
        form.reset();
        document.getElementById("edit-product-id").value = "";
        document.getElementById("product-save-btn").innerHTML = '<i class="fa-solid fa-save"></i> Save Product';
        document.getElementById("product-cancel-edit-btn").classList.add("hidden");
    };
}

function editProduct(id) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can edit products.");
        return;
    }
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    document.getElementById("edit-product-id").value = product.id;
    document.getElementById("prod-code").value = product.code;
    document.getElementById("prod-min-amt").value = product.minAmt;
    document.getElementById("prod-max-amt").value = product.maxAmt;
    document.getElementById("prod-interest-rate").value = product.rate;
    document.getElementById("prod-desc").value = product.desc;

    document.getElementById("product-save-btn").innerHTML = '<i class="fa-solid fa-check"></i> Update Product';
    document.getElementById("product-cancel-edit-btn").classList.remove("hidden");
}

function deleteProduct(id) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can delete products.");
        return;
    }
    if (confirm("Permanently delete this product scheme?")) {
        state.products = state.products.filter(p => p.id !== id);
        saveState();
        renderProductMasterList();
    }
}

// ==================== SETTINGS CONFIGURATION ====================
function renderSettings() {
    const isHO = (state.currentSession.code === "99");
    const branchSelectGroup = document.getElementById("settings-branch-select-group");
    const branchSelect = document.getElementById("settings-branch-select");

    let targetBranchCode = state.currentSession.code;

    if (isHO) {
        branchSelectGroup.classList.remove("hidden");
        const prevSelected = branchSelect.value;
        
        branchSelect.innerHTML = "";
        state.branches.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b.code;
            opt.textContent = b.code === "99" ? b.name : `${b.code} ${b.name}`;
            branchSelect.appendChild(opt);
        });

        if (prevSelected && state.branches.some(b => b.code === prevSelected)) {
            branchSelect.value = prevSelected;
        }

        targetBranchCode = branchSelect.value;

        branchSelect.onchange = () => {
            renderSettingsForBranch(branchSelect.value);
        };
    } else {
        branchSelectGroup.classList.add("hidden");
    }

    renderSettingsForBranch(targetBranchCode);

    document.getElementById("reset-system-data-btn").onclick = () => {
        const confirm1 = confirm("Warning: Are you sure you want to restore the system? This will clear all transactions, registers, and custom valuers!");
        if (confirm1) {
            const confirm2 = confirm("Final confirmation: This is a permanent delete. Proceed?");
            if (confirm2) {
                localStorage.removeItem("jccb_gold_loan_state");
                alert("Data cleared. Portal will reload.");
                location.reload();
            }
        }
    };
}

function renderSettingsForBranch(branchCode) {
    const seedsContainer = document.getElementById("account-seeds-container");
    seedsContainer.innerHTML = "";

    const uniqueSchemes = [...new Set(state.products.map(p => p.code))];
    
    if (!state.accountSeeds[branchCode]) {
        state.accountSeeds[branchCode] = { ...DEFAULT_ACCOUNT_SEEDS };
    }
    if (state.lastPacketSeed[branchCode] === undefined) {
        state.lastPacketSeed[branchCode] = 100;
    }

    uniqueSchemes.forEach(code => {
        const currentSeed = state.accountSeeds[branchCode][code] || DEFAULT_ACCOUNT_SEEDS[code] || 1001;

        const group = document.createElement("div");
        group.className = "form-group";
        group.innerHTML = `
            <label for="seed-ac-${code}">Scheme: ${code} - Starting Account Serial</label>
            <input type="number" id="seed-ac-${code}" value="${currentSeed}" required min="1">
            <small class="helper-text">Serials will start from this number (e.g. ${currentSeed})</small>
        `;
        seedsContainer.appendChild(group);
    });

    document.getElementById("seed-last-packet-no").value = state.lastPacketSeed[branchCode];

    document.getElementById("settings-accounts-form").onsubmit = (e) => {
        e.preventDefault();
        
        uniqueSchemes.forEach(code => {
            const inputVal = parseInt(document.getElementById(`seed-ac-${code}`).value);
            if (!isNaN(inputVal) && inputVal > 0) {
                state.accountSeeds[branchCode][code] = inputVal;
            }
        });

        saveState();
        alert(`Account sequence seeds for branch ${branchCode} saved.`);
        renderSettings();
    };

    document.getElementById("settings-general-form").onsubmit = (e) => {
        e.preventDefault();
        const pSeed = parseInt(document.getElementById("seed-last-packet-no").value);
        if (!isNaN(pSeed) && pSeed >= 0) {
            state.lastPacketSeed[branchCode] = pSeed;
            saveState();
            alert(`Packet serial seed for branch ${branchCode} saved.`);
            renderSettings();
        }
    };
}

// ==================== PRINT RECEIPT ENGINE ====================
function printVoucher(loanId, format) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) {
        alert("Error: Loan record not found.");
        return;
    }

    const valuer = state.valuers.find(v => v.id === loan.valuerId) || { name: loan.valuerId, savingsAc: "-", mobile: "-" };
    const printArea = document.getElementById("print-area");
    printArea.innerHTML = "";

    // Single Voucher (A4 Copy)
    if (format === "single") {
        printArea.innerHTML = `
            <div class="print-voucher print-a4-single">
                <div>
                    <div class="voucher-print-header">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo" style="width:40px; height:40px;">
                            <div class="bank-info">
                                <h2 class="bank-title">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle">Branch: ${loan.branchCode} - ${loan.branchName}</p>
                            </div>
                        </div>
                        <div class="voucher-badge">CUSTOMER SANCTION AND EXPENCE VOUCHER</div>
                    </div>

                    <div class="print-meta-grid">
                        <div class="meta-item"><span class="m-label">Account Number</span><span class="m-val">${loan.accountNo}</span></div>
                        <div class="meta-item"><span class="m-label">Packet Number</span><span class="m-val">#${loan.packetNo}</span></div>
                        <div class="meta-item"><span class="m-label">Sanction Date</span><span class="m-val">${formatDateDMY(loan.date)}</span></div>
                        <div class="meta-item"><span class="m-label">Loan Type</span><span class="m-val">${loan.loanStatus}</span></div>
                        <div class="meta-item" style="grid-column: span 2;"><span class="m-label">Borrower Name</span><span class="m-val">${loan.borrowerName}</span></div>
                        <div class="meta-item"><span class="m-label">Member Status</span><span class="m-val">${loan.isMember} (No: ${loan.memberNo})</span></div>
                        <div class="meta-item"><span class="m-label">Scheme Code</span><span class="m-val">${loan.productCode}</span></div>
                    </div>

                    <div class="print-details-split">
                        <div class="print-panel-card">
                            <h4>Gold Evaluation & Valuation</h4>
                            <div class="p-row"><span>Ornaments Weight (G/N):</span><span class="p-val">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} / ${parseFloat(loan.goldWeight).toFixed(3)} Grams</span></div>
                            <div class="p-row"><span>Gold Market Rate (/10g):</span><span class="p-val">₹${parseFloat(loan.marketRate).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Ornaments Market Value:</span><span class="p-val">₹${parseFloat(loan.marketValue).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Max Eligible Loan (75%):</span><span class="p-val">₹${parseFloat(loan.eligibleAmount).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Ornaments Description:</span><span class="p-val" style="font-size:8px;">${loan.ornamentsDesc}</span></div>
                            <div class="p-row"><span>Authorized Soni Valuer:</span><span class="p-val" style="font-size:8px;">${valuer.name}</span></div>
                        </div>

                        <div class="print-panel-card">
                            <h4>Loan Parameters</h4>
                            <div class="p-row"><span>Sanctioned Amount:</span><span class="p-val" style="font-size:12px;">₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Interest Rate (Fix):</span><span class="p-val">${loan.interestRate}</span></div>
                            <div class="p-row"><span>Valuer Savings A/c No:</span><span class="p-val">${valuer.savingsAc}</span></div>
                            <div class="p-row"><span>Valuer Mobile No:</span><span class="p-val">${valuer.mobile}</span></div>
                        </div>
                    </div>

                    <h4 style="font-size:11px; margin-bottom: 4px;">Deductions & Service Charges Breakdown</h4>
                    <table class="print-charges-table">
                        <thead>
                            <tr>
                                <th>Charge Description</th>
                                <th>Amount (₹)</th>
                                <th>Charge Description</th>
                                <th>Amount (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Share Capital (Group A)</td>
                                <td>₹${parseFloat(loan.shareA).toFixed(2)}</td>
                                <td>Service Charges</td>
                                <td>₹${parseFloat(loan.serviceCharge).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Share Capital (Group B)</td>
                                <td>₹${parseFloat(loan.shareB).toFixed(2)}</td>
                                <td>Document Charges</td>
                                <td>₹${parseFloat(loan.docCharge).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Member Fee</td>
                                <td>₹${parseFloat(loan.memberFee).toFixed(2)}</td>
                                <td>Insurance Charges</td>
                                <td>₹${parseFloat(loan.insCharge).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Valuation Fee</td>
                                <td>₹${parseFloat(loan.valuationCharge).toFixed(2)}</td>
                                <td>CGST (9%)</td>
                                <td>₹${parseFloat(loan.cgst).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Stamp Duty</td>
                                <td>₹${parseFloat(loan.stampCharge).toFixed(2)}</td>
                                <td>SGST (9%)</td>
                                <td>₹${parseFloat(loan.sgst).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Manual Adjustment</td>
                                <td>₹${parseFloat(loan.adjustment).toFixed(2)}</td>
                                <td><strong>Total Deductions</strong></td>
                                <td><strong>₹${parseFloat(loan.totalCharges).toFixed(2)}</strong></td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="print-net-banner">
                        <span>Net Loan Disbursal Amount (Net Payable):</span>
                        <span class="disbursal-num">₹${parseFloat(loan.netDisbursal).toLocaleString("en-IN")}.00</span>
                    </div>

                    <div style="font-size: 8px; line-height: 1.4; border: 1px solid #ddd; padding: 6px; margin-top: 10px;">
                        <strong>Declaration:</strong> I/We declare that the gold ornaments pledged in the bank have been inspected and sealed in my presence. If I fail to repay the principal with interest inside the loan tenure, the bank reserves full rights to auction the pledged assets to recover outstanding debts.
                    </div>
                </div>

                <div class="print-signatures-row">
                    <div class="sig-block">Borrower Signature</div>
                    <div class="sig-block">Valuer Soni Signature</div>
                    <div class="sig-block">Cashier Signature</div>
                    <div class="sig-block">Loan Clerk</div>
                    <div class="sig-block">Branch Manager</div>
                </div>
            </div>
        `;
    }

    // 3-in-1 Voucher Template (A4 split)
    if (format === "three-in-one") {
        const segments = [
            { title: "Bank Copy", subtitle: "For Ledger Records" },
            { title: "Borrower Copy", subtitle: "To be given to customer" },
            { title: "Vault Packet Copy", subtitle: "To be kept inside sealed packet in vault" }
        ];

        let html = `<div class="print-voucher print-a4-three">`;
        
        segments.forEach((seg, idx) => {
            html += `
                <div class="three-part-segment">
                    <div class="voucher-print-header">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo">
                            <div class="bank-info">
                                <h2 class="bank-title" style="font-size: 11px;">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle" style="font-size: 8px;">Branch: ${loan.branchCode} - ${loan.branchName}</p>
                            </div>
                        </div>
                        <div class="voucher-badge" style="font-size: 8px; padding: 2px 6px;">${seg.title}</div>
                    </div>

                    <div class="print-meta-grid-three">
                        <div><strong>Account No:</strong> ${loan.accountNo}</div>
                        <div><strong>Packet No:</strong> #${loan.packetNo}</div>
                        <div><strong>Sanction Date:</strong> ${formatDateDMY(loan.date)}</div>
                        <div><strong>Name:</strong> ${loan.borrowerName}</div>
                        <div><strong>Member ID:</strong> ${loan.memberNo}</div>
                        <div><strong>Scheme:</strong> ${loan.productCode}</div>
                    </div>

                    <div class="print-details-split-three">
                        <div class="print-panel-card" style="padding: 4px 6px;">
                            <h4 style="font-size: 8px; margin-bottom: 2px;">Evaluation Details</h4>
                            <div class="p-row"><span>Gold Weight:</span><span class="p-val">${parseFloat(loan.goldWeight).toFixed(3)}g</span></div>
                            <div class="p-row"><span>Market Rate:</span><span class="p-val">₹${parseFloat(loan.marketRate)}</span></div>
                            <div class="p-row"><span>Market Value:</span><span class="p-val">₹${parseFloat(loan.marketValue)}</span></div>
                            <div class="p-row"><span>Inspector:</span><span class="p-val" style="font-size:7px;">${valuer.name.substring(0, 18)}</span></div>
                        </div>

                        <div class="print-panel-card" style="padding: 4px 6px;">
                            <h4 style="font-size: 8px; margin-bottom: 2px;">Financial Summary & Charges</h4>
                            <div class="p-row"><span>Sanctioned Amount:</span><span class="p-val">₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Total Deductions:</span><span class="p-val">₹${parseFloat(loan.totalCharges).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Interest Rate:</span><span class="p-val">${loan.interestRate}</span></div>
                            <div class="p-row"><span>Particulars:</span><span class="p-val" style="font-size:7.5px;">${loan.ornamentsDesc.substring(0, 28)}</span></div>
                        </div>
                    </div>

                    <div class="print-net-banner-three">
                        <span>Net Loan Disbursed (Net Paid):</span>
                        <span class="disbursal-num">₹${parseFloat(loan.netDisbursal).toLocaleString("en-IN")}.00</span>
                    </div>

                    <div class="print-signatures-row-three">
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Borrower Signature</div>
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Valuer Signature</div>
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Cashier Signature</div>
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Manager Signature</div>
                    </div>

                    ${idx < 2 ? `<div class="tear-line-indicator"><i class="fa-solid fa-scissors"></i> Tear along line ----------------------------------------------------------------------</div>` : ''}
                </div>
            `;
        });
        html += "</div>";
        printArea.innerHTML = html;
    }

    // Gujarati Loan Requisition Form Print
    if (format === "application_form") {
        if (loan.productCode && (loan.productCode === "GW-3725" || loan.productCode.includes("3725"))) {
            return printVoucher3725(loanId);
        }
        const gujWords = numberToGujaratiWords(loan.loanAmount);
        const ltv = loan.marketValue > 0 ? Math.round((loan.loanAmount / loan.marketValue) * 100) : 0;
        const gujNums = ['૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯', '૧૦'];
        const is3553 = (loan.productCode === "GOD-3553" || loan.productCode === "3553");
        
        const hasKfsBullet = loan.productCode && (loan.productCode.includes("3725") || loan.productCode.includes("3524"));
        const hasKfsOverdraft = loan.productCode && loan.productCode.includes("3553");
        const hasKfsInstallment = loan.productCode && loan.productCode.includes("3527");
        const hasKfs = hasKfsBullet || hasKfsOverdraft || hasKfsInstallment;
        const kfsDate = formatDateDMY(loan.date);
        const uniquePropNo = loan.uniqueProposalNo || `PROP/${loan.branchCode}/${getBranchLoanSerial(loan.id, loan.branchCode)}`;
        const maturityDate = getMaturityDate(loan.date);
        const interestRateClean = loan.interestRate ? loan.interestRate.toString().replace(/%/g, "").trim() : "";
        
        // EMI and Tenure overrides
        const tenureMonthsVal = loan.productCode && loan.productCode.includes("3527") ? (loan.tenureMonths || 36) : 12;
        const emiAmountVal = parseFloat(loan.emiAmount || 0);
        const totalPayableVal = emiAmountVal * tenureMonthsVal;
        const firstEmiDate = getFirstEmiDueDate(loan.date);
        
        const matDate = new Date(loan.date);
        matDate.setMonth(matDate.getMonth() + tenureMonthsVal);
        const dd = String(matDate.getDate()).padStart(2, '0');
        const mm = String(matDate.getMonth() + 1).padStart(2, '0');
        const yyyy = matDate.getFullYear();
        const maturityDateCustom = `${dd}-${mm}-${yyyy}`;
        
        // Processing Charges: serviceCharge
        const procCharges = parseFloat(loan.serviceCharge || 0).toFixed(2);
        // Appraiser Charges: valuationCharge
        const appraiserCharges = parseFloat(loan.valuationCharge || 0).toFixed(2);
        // Documentation Charges: docCharge
        const docCharges = parseFloat(loan.docCharge || 0).toFixed(2);
        // Other Charges: sum of insCharge, stampCharge, cgst, sgst, adjustment, shareA, shareB, memberFee
        const otherChargesSum = (
            parseFloat(loan.insCharge || 0) +
            parseFloat(loan.stampCharge || 0) +
            parseFloat(loan.cgst || 0) +
            parseFloat(loan.sgst || 0) +
            parseFloat(loan.adjustment || 0) +
            parseFloat(loan.shareA || 0) +
            parseFloat(loan.shareB || 0) +
            parseFloat(loan.memberFee || 0)
        ).toFixed(2);
        
        const ltvRatio = loan.marketValue > 0 ? Math.round((loan.loanAmount / loan.marketValue) * 100) : 0;
        
        printArea.innerHTML = `
            <div class="print-voucher print-requisition-form" style="width:100%; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; color:#000000; background-color:#ffffff;">
                
                <!-- PAGE 1: REQUISITION FORM -->
                <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                    <!-- Bank Letterhead (Logo on Left, Name & Address next to it) -->
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                        <img src="${LOGO_SRC}" alt="JCCB Logo" style="width: 55px; height: 55px; object-fit: contain; border-radius: 50%; border: 1.5px solid #000000;">
                        <div style="text-align: left;">
                            <h1 style="font-size: 20px; font-weight: 800; margin: 0; font-family: 'Outfit', 'Noto Sans Gujarati', sans-serif;">ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ.</h1>
                            <p style="font-size: 14.5px; margin: 2px 0 0 0; font-weight: 700;">હે.ઓ. : "ચંદ્રકાંત માલવિયા સ્મૃતિ ભવન", ચોકસી બજાર, જૂનાગઢ. ૩૬૨૦૦૧</p>
                        </div>
                    </div>
                    <!-- Centered Document Title -->
                    <div style="text-align: center; margin-bottom: 8px;">
                        <p style="font-size: 15px; font-weight: 800; margin: 4px 0 0 0; text-decoration: underline;">સોનાનાં દાગીનાની જામીનગીરી પર કરજ માંગણીની અરજી</p>
                    </div>
 
                    <!-- Requisition Letter Body in Exact Paragraph Format (with Floated photo) -->
                    <div style="font-size:13.5px; line-height:1.4; text-align:justify; margin-top:5px; min-height:110px;">
                        <div style="border: 2px solid #000000; width: 90px; height: 105px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; float: right; margin-left: 15px; margin-bottom: 5px;">
                            ${loan.custPhoto ? `<img src="${loan.custPhoto}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:9px; text-align:center; padding:5px; color:#555;">ગ્રાહકનો ફોટો</span>`}
                        </div>
                        <p style="margin:0 0 4px 0; font-weight:700;">પ્રતિ,<br>મેનેજરશ્રી,<br>ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ. <br>${loan.branchName} શાખા.</p>
                        <p style="margin:0 0 4px 0; font-weight:700;">સાહેબશ્રી,</p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "સવિનય હું <strong>${loan.borrowerName}</strong> સરનામું <strong>${loan.custAddress || "-"}</strong>, ઉ.વ. <strong>${loan.custAge || "-"}</strong>, ધંધો <strong>${loan.custOccupation || "-"}</strong>, મોબાઇલ નંબર <strong>${loan.custMobile || "-"}</strong>, મેમ્બરશીપ નંબર <strong>${loan.memberNo || "-"}</strong>"
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "આ સાથે સામેલ વેલ્યુએશન રિપોર્ટ મુજબના મારી માલિકીના સોનાનાં દાગીનાની જામીનગીરી ઉપર રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong>, નું આપની બેંકમાંથી ધિરાણ <strong>${loan.loanPurpose || "-"}</strong>, ના હેતુ માટે મેળવવા માટે અરજી કરું છું. આથી હું તમો બેંકને ખાતરી અને બાંહેધરી આપું છું કે બેંકને જામીનગીરીમાં આપેલ દાગીના મારી સ્વતંત્ર માલિકીના છે. મેં બેંકના સોનાના દાગીનાની જામીનગીરી પર ધિરાણના નિયમો વાંચ્યા છે જે મને કબુલ-મંજુર છે. વધુમાં હું કબુલ રાખું છું કે રિઝર્વ બેંક ઓફ ઇન્ડિયાની વખ�                    <!-- Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:15px; font-size:13.5px;">
                        <div style="text-align:left; font-weight:700; line-height:1.4;">
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="display:inline-block; text-align:center;">
                                <div style="height:50px;"></div> <!-- Signature space -->
                                <div style="margin-bottom:3px;">X ------------------------------------------</div>
                                <div style="font-weight:700;">(અરજદારનું નામ: ${loan.borrowerName})</div>
                            </div>
                        </div>
                    </div>માં આપી બેંકને સોંપુ છું."
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "વેલ્યુએશન રિપોર્ટમાંદર્શાવેલા તમામ સોનાના દાગીનાઓ શરાફે મારી હાજરીમાંએક સીલબંધ પેકેટ બનાવી, એક કાગળનું લેબલ બનાવી મારી હાજરીમાં બેંકના અધિકારીની અને મારી સહી કરાવી દાગીનાના પેકેટ ઉપર ચોટાડી તૈયાર થયેલ સદર સીલબંધ પેકેટમાંરાખેલ સોનાના દાગીના હું બેંકને થાલમાં આપુંછું."
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 6px 0;">
                            "ઉપરાંત આ દાગીનાના વારસદાર તરીકે હું <strong>${loan.custNomineeName || "-"}</strong> સંબંધે <strong>${loan.custNomineeRelation || "-"}</strong> ની નિમણુંક કરું છું."
                        </p>
                    </div>
 
                    <!-- Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:15px; font-size:13.5px;">
                        <div style="text-align:left; font-weight:700; line-height:1.4;">
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="display:inline-block; text-align:left;">
                                <div style="height:50px;"></div> <!-- Signature space -->
                                <div style="margin-bottom:3px;">X ------------------------------------------</div>
                                <div style="font-weight:700;">સહી: (${loan.borrowerName})</div>
                            </div>
                        </div>
                    </div>
 
                    <!-- Office Verification Block (ઓફિસ શેરો) -->
                    <div style="margin-top:10px; padding-top:6px;">
                        <div style="display:flex; align-items:center; text-align:center; margin-bottom:8px; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                            <div style="flex:1; border-bottom:1.5px solid #000000; margin-right:15px;"></div>
                            <span style="font-weight:800; font-size:14px; white-space:nowrap; letter-spacing:1px; color:#000000;">ઓફિસ શેરો</span>
                            <div style="flex:1; border-bottom:1.5px solid #000000; margin-left:15px;"></div>
                        </div>
                        
                        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; font-size:13px; border:1.5px solid #000000;">
                            <tr style="border-bottom:1.5px solid #000000;">
                                <td style="padding:3px 6px; font-weight:700; border-right:1.5px solid #000000; width:45%;">ખાતા નંબર (ખાતા નો પ્રકાર અને ખાતા નંબર લેવા):</td>
                                <td style="padding:3px 6px; font-weight:700;">${loan.accountNo || "-"}</td>
                            </tr>
                            <tr style="border-bottom:1.5px solid #000000;">
                                <td style="padding:3px 6px; font-weight:700; border-right:1.5px solid #000000;">પેકેટ નંબરઃ-</td>
                                <td style="padding:3px 6px; font-weight:700;">#${loan.packetNo || "-"}</td>
                            </tr>
                            <tr>
                                <td style="padding:3px 6px; font-weight:700; border-right:1.5px solid #000000;">સેવિંગ ખાતા નંબરઃ-</td>
                                <td style="padding:3px 6px; font-weight:700;">${loan.custSavingsAc || "-"}</td>
                            </tr>
                        </table>
 
                        <p style="text-indent:20px; font-size:13.5px; line-height:1.4; text-align:justify; margin:6px 0;">
                            "વેલ્યુએશન રિપોર્ટમાં દર્શાવ્યા મુજબના સોનાનાં દાગીના થાલમાં લઈને તેનીકુલ કિંમત રૂ. <strong>${parseFloat(loan.marketValue).toLocaleString("en-IN")}/-</strong> ના <strong>${ltv}%</strong> લેખે ધિરાણની રકમ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> અંકે રકમ રૂ. <strong>${gujWords}</strong> નો બેંકના સોનાના દાગીના સામે ધિરાણના નિયમાનુસાર ચુકાદો કરવાની મંજુરી આપવામાં આવે છે. આજરોજ ઉપરોક્ત દાગીનાનું સીલબંધ પેકેટ અરજદાર પાસેથી સંભાળી લૉકરમાં મુકેલ છે."
                        </p>
 
                        <div style="font-weight:700; font-size:13.5px; margin-top:4px; margin-bottom:10px;">
                            તારીખઃ- ${formatDateDMY(loan.date)}
                        </div>
 
                        <!-- Sign-off blocks for Clerks & Managers -->
                        <div style="display:flex; justify-content:space-between; margin-top:15px; font-size:13.5px; font-weight:700;">
                            <div style="width:40%; text-align:center;">
                                <div style="height:50px;"></div> <!-- Signature space -->
                                <div style="margin-bottom:3px;">X..........................................................................</div>
                                <div style="font-size:12px; font-weight:600;">સહી: (લોન ઓફિસર)</div>
                            </div>
                            <div style="width:40%; text-align:center;">
                                <div style="height:50px;"></div> <!-- Signature space -->
                                <div style="margin-bottom:3px;">X..........................................................................</div>
                                <div style="font-size:12px; font-weight:600;">સહી: (શાખા પ્રબંધક)</div>
                            </div>
                        </div>
                    </div>
                </div>
 


                <!-- PAGE 2: VALUATION REPORT & PROMISSORY NOTE -->
                <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                    <!-- Bank Letterhead (Logo on Left, Name & Address next to it) -->
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                        <img src="${LOGO_SRC}" alt="JCCB Logo" style="width: 55px; height: 55px; object-fit: contain; border-radius: 50%; border: 1.5px solid #000000;">
                        <div style="text-align: left;">
                            <h1 style="font-size: 20px; font-weight: 800; margin: 0; font-family: 'Outfit', 'Noto Sans Gujarati', sans-serif;">ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ.</h1>
                            <p style="font-size: 14.5px; margin: 2px 0 0 0; font-weight: 700;">હે.ઓ. : "ચંદ્રકાંત માલવિયા સ્મૃતિ ભવન", ચોકસી બજાર, જૂનાગઢ. ૩૬૨૦૦૧</p>
                        </div>
                    </div>

                    <!-- Header Address (with floated Gold Ornament photo) -->
                    <div style="font-size:13.5px; line-height:1.4; text-align:justify; margin-top:5px; min-height:2.1in;">
                        <div style="border: 2px solid #000000; width: 4in; height: 2in; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; float: right; margin-left: 15px; margin-bottom: 5px;">
                            ${loan.goldPhoto ? `<img src="${loan.goldPhoto}" style="width:100%; height:100%; object-fit:contain;">` : `<span style="font-size:9px; text-align:center; padding:5px; color:#555;">દાગીનાનો ફોટો</span>`}
                        </div>
                        <p style="margin:0 0 4px 0; font-weight:700;">પ્રતિ,<br>મેનેજરશ્રી,<br>ધી જૂનાગઢ કોમર્શીયલ કો-ઓપરેટીવ બેંક લી. <br>${loan.branchName} શાખા.</p>
                        <p style="margin:0 0 4px 0; font-weight:700;">સાહેબશ્રી,</p>
                        <p style="margin:0 0 6px 0;">
                            હું <strong>${loan.borrowerName}</strong>, રહેવાસીઃ- <strong>${loan.custAddress || "-"}</strong>,
                        </p>
                    </div>

                    <!-- Market Rate Display (Centered, Large) -->
                    <div style="text-align:center; font-weight:800; font-size:14.5px; margin: 4px 0; color:#000000; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                        આજનો બજાર ભાવ રૂ. <strong>${parseFloat(loan.marketRate).toLocaleString("en-IN")}/-</strong> 10 ગ્રામ શુધ્ધ સોનાનો ભાવ
                    </div>
 
                    <!-- Valuation Report Header (Centered, Large) -->
                    <div style="text-align:center; font-weight:800; font-size:14.5px; margin: 4px 0; text-decoration:underline; color:#000000; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                        સોનાનાં દાગીનાનો વેલ્યુએશન રિપોર્ટ
                    </div>
 
                    <!-- Ornaments Table (10 Blank Rows + Total Row) -->
                    <table style="width:100%; border-collapse:collapse; margin:4px 0; font-size:11.5px; border:1.5px solid #000000; text-align:center; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:24px;">
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:5%;" rowspan="2">ક્રમ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:27%;" rowspan="2">દાગીનાની વિગત</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:8%;" rowspan="2">નંગ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">ગ્રોસ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">નેટ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:12%;" rowspan="2">શુદ્ધતા કેરેટમાં</th>
                                <th style="padding:3px; font-weight:800; width:12%;" rowspan="2">કિંમત રૂ.</th>
                            </tr>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:20px;">
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${gujNums.map((num) => `
                            <tr style="border-bottom:1.5px solid #000000; height:28px;">
                                <td style="border-right:1.5px solid #000000; padding:2px; font-weight:700;">${num}</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                            `).join('')}
                            <tr style="font-weight:800; background-color:#f5f5f5; height:25px;">
                                <td style="border-right:1.5px solid #000000; padding:2px;" colspan="3">કુલ (Total)</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                        </tbody>
                    </table>
 
                    <div style="text-align:right; font-size:13px; margin-top:2px; margin-bottom:2px;">
                        <div style="height:20px;"></div> <!-- Signature space -->
                        <div style="margin-bottom:2px;">વેલ્યુઅરની સહી: X........................................</div>
                        <div style="font-weight:700; padding-right:20px;">(${valuer.name})</div>
                    </div>
 
                    <!-- Borrower Acceptance of Valuation -->
                    <p style="font-size:12px; line-height:1.35; text-align:justify; margin:2px 0;">
                        "ઉપરોક્ત વિગતે વેલ્યુઅરે જે શુદ્ધતા, વજન, દર, કિંમત આકારેલ છે તે વાજબી છે અને મને કબૂલ-મંજુર છે."
                    </p>
 
                    <div style="text-align:right; font-size:13px; margin-top:2px; margin-bottom:2px;">
                        <div style="height:20px;"></div> <!-- Signature space -->
                        <div style="margin-bottom:2px;">અરજદારની સહી: X........................................</div>
                        <div style="font-weight:700; padding-right:20px;">(${loan.borrowerName})</div>
                    </div>
 
                    <!-- Page-width Dotted Separator -->
                    <div style="border-top: 1.5px dashed #000000; margin: 2px 0; width:100%;"></div>
 
                    <!-- Demand Promissory Note Header (Centered, Large) -->
                    <div style="text-align:center; font-weight:800; font-size:13.5px; margin: 0; text-decoration:underline; color:#000000; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                        ડિમાન્ડ પ્રોમિસરી નોટ – વચન ચિઠ્ઠી
                    </div>
 
                    <!-- Promissory Note Text -->
                    <p style="text-indent:20px; font-size:12.5px; line-height:1.35; text-align:justify; margin-bottom:2px;">
                        "હું <strong>${loan.borrowerName}</strong>, આજરોજ મને મળેલા અવેજ બદલ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong>, અંકે રૂપિયા <strong>${gujWords}</strong>, <strong>${loan.interestRate}</strong>, માસિક ચક્રવૃદ્ધિ વ્યાજ ગણતરી અનુસાર વાર્ષિક વ્યાજ દરે ચડત વ્યાજની રકમ સહીત જયારે માંગો ત્યારે ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ. <strong>${loan.branchName}</strong> જુનાગઢ અથવા તેનાં આદેશ અનુસાર તેની કોઈપણ શાખામાં ચૂકવી આપવાનું વચન આપું છું."
                    </p>
 
                    <!-- Location and Date -->
                    <div style="text-align:left; font-weight:700; line-height:1.35; font-size:13px; margin-top:0; margin-bottom:0;">
                        <div>સ્થળઃ- ${loan.branchName}</div>
                        <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                    </div>
 
                    <!-- Double Signatures for borrower at the bottom (Revenue stamp on right) -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:2px; font-size:13px; font-weight:700;">
                        <div style="width:45%; text-align:center; padding-bottom:0;">
                            <div style="height:20px;"></div> <!-- Signature space -->
                            <div style="margin-bottom:2px;">X....................................................</div>
                            <div style="font-size:12px; font-weight:600;">(અરજદારનું નામ: ${loan.borrowerName})</div>
                        </div>
                        <div style="width:45%; text-align:center; display:flex; flex-direction:column; align-items:center;">
                            <div style="border: 1.5px dashed #000000; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; text-align:center; font-size:9.0px; font-weight:700; padding:2px; margin-bottom:2px;">
                                રેવન્યુ સ્ટેમ્પ
                            </div>
                            <div style="width:100%;">
                                <div style="margin-bottom:2px;">X....................................................</div>
                                <div style="font-size:12px; font-weight:600;">(અરજદારનું નામ: ${loan.borrowerName})</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- PAGE 3: RECEIPT & RETURN ACKNOWLEDGMENT -->
                <div class="${((!is3553 && parseFloat(loan.loanAmount) <= 50000) || hasKfs) ? 'print-page-break ' : ''}print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                    <!-- Bank Header (Centered, Large Font) -->
                    <div style="text-align: center; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                        <h1 style="font-size: 20px; font-weight: 800; margin: 0; font-family: 'Outfit', 'Noto Sans Gujarati', sans-serif;">ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ.</h1>
                        <p style="font-size: 14.5px; margin: 2px 0 0 0; font-weight: 700;">હે.ઓ. : “ચંદ્રકાંત માલવિયા સ્મૃતિ ભવન”, ચોકસી બજાર, જૂનાગઢ. ૩૬૨૦૦૧</p>
                    </div>

                    <!-- Recipient & Floating Photos -->
                    <div style="font-size: 13px; line-height: 1.4; text-align: left; margin-top: 5px; min-height: 2.1in;">
                        <!-- Side-by-side Photo Boxes on the Right -->
                        <div style="float: right; display: flex; gap: 10px; margin-left: 15px; margin-bottom: 5px; align-items: flex-end;">
                            <div style="border: 2px solid #000000; width: 1.1in; height: 1.3in; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; text-align: center;">
                                ${loan.custPhoto ? `<img src="${loan.custPhoto}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:8px; padding:3px; color:#555;">ગ્રાહકનો ફોટો</span>`}
                            </div>
                            <div style="border: 2px solid #000000; width: 4in; height: 2in; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; text-align: center;">
                                ${loan.goldPhoto ? `<img src="${loan.goldPhoto}" style="width:100%; height:100%; object-fit:contain;">` : `<span style="font-size:8px; padding:3px; color:#555;">દાગીનાનો ફોટો</span>`}
                            </div>
                        </div>
                        
                        <p style="margin: 0 0 4px 0; font-weight: 700;">પ્રતિ,<br>મેનેજરશ્રી,<br>ધી જૂનાગઢ કોમર્શીયલ કો-ઓપરેટીવ બેંક લી.<br>${loan.branchName} શાખા.</p>
                        <p style="margin: 0; font-weight: 700;">સાહેબશ્રી,</p>
                    </div>

                    <!-- Salutation Details -->
                    <div style="font-size:13px; line-height:1.45; text-align:justify; margin-top:0px;">
                        <p style="margin:0 0 2px 0;">
                            હું <strong>${loan.borrowerName}</strong> રહે. <strong>${loan.custAddress || "-"}</strong>
                        </p>
                        <p style="margin:0 0 2px 0;">
                            આજનો બજાર ભાવ રૂ. <strong>${parseFloat(loan.marketRate).toLocaleString("en-IN")}/-</strong> ૧૦ ગ્રામ શુદ્ધ સોનાનો
                        </p>
                    </div>

                    <!-- Centered Title -->
                    <div style="text-align: center; margin: 2px 0;">
                        <span style="font-weight: 800; font-size: 15px; text-decoration: underline; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">ગ્રાહકને આપવાની પહોંચ</span>
                    </div>

                    <!-- Ornaments Table (10 rows) -->
                    <table style="width:100%; border-collapse:collapse; margin:4px 0; font-size:11.5px; border:1.5px solid #000000; text-align:center; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:20px;">
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:5%;" rowspan="2">ક્રમ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:27%;" rowspan="2">દાગીનાની વિગત</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:8%;" rowspan="2">નંગ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">ગ્રોસ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">નેટ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:12%;" rowspan="2">શુદ્ધતા કેરેટમાં</th>
                                <th style="padding:3px; font-weight:800; width:12%;" rowspan="2">કિંમત રૂ.</th>
                            </tr>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:18px;">
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${gujNums.map((num) => `
                            <tr style="border-bottom:1.5px solid #000000; height:18px;">
                                <td style="border-right:1.5px solid #000000; padding:2px; font-weight:700;">${num}</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                            `).join('')}
                            <tr style="font-weight:800; background-color:#f5f5f5; height:22px;">
                                <td style="border-right:1.5px solid #000000; padding:2px;" colspan="3">કુલ (Total)</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Duration Details -->
                    <p style="margin: 2px 0; font-size: 13px; line-height: 1.4;">
                        સદરહુ ધિરાણ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> ની મુદત તા. <strong>${formatDateDMY(loan.date)}</strong> થી <strong>${tenureMonthsVal === 36 ? '૩ વર્ષ' : '૧ વર્ષ'}</strong> સુધીની છે.
                    </p>

                    <!-- Location & Date on the Left / Signature placeholder on the Right -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3px; font-size: 13px; font-weight: 700; line-height: 1.4;">
                        <div>
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align: right; width: 45%;">
                        </div>
                    </div>

                    <!-- Three Signatures -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 3px; font-size: 11.5px; font-weight: 700; text-align: center; line-height: 1.25;">
                        <div style="width: 32%;">
                            <div>X............................................................</div>
                            <div style="margin-top: 2px;">${valuer.name}</div>
                            <div style="font-size: 10px; font-weight: 600; color: #444; margin-top:1px;">${valuer.name}<br>(સીલબંધ પેકેટ તૈયાર કરનાર)</div>
                        </div>
                        <div style="width: 32%;">
                            <div>X............................................................</div>
                            <div style="margin-top: 2px;">${loan.borrowerName}</div>
                            <div style="font-size: 10px; font-weight: 600; color: #444; margin-top:1px;">દાગીના સોંપનારની સહી<br>(${loan.borrowerName})</div>
                        </div>
                        <div style="width: 32%; display: flex; flex-direction: column; gap: 20px;">
                            <div>
                                <div style="margin-bottom: 1px;">X............................................................</div>
                                <div style="font-size: 10px; font-weight: 600; color: #444;">ઓફિસરની સહી (સંભાળનાર)</div>
                            </div>
                            <div style="margin-top: 15px;">
                                <div style="margin-bottom: 1px;">X............................................................</div>
                                <div style="font-size: 10px; font-weight: 600; color: #444;">શાખા પ્રબંધકની સહી</div>
                            </div>
                        </div>
                    </div>

                    <!-- Dotted Separator -->
                    <div style="border-top: 1.5px dashed #000000; margin: 2px 0; width: 100%;"></div>

                    <!-- Return Acknowledgment Title -->
                    <div style="text-align: center; margin: 0;">
                        <span style="font-weight: 800; font-size: 13.5px; text-decoration: underline; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">દાગીના પરત મળ્યાંની પહોંચ</span>
                    </div>

                    <div style="font-size: 11.5px; line-height: 1.3; text-align: left; margin-bottom: 3px; font-weight: 700;">
                        પ્રતિ,<br>મેનેજરશ્રી, ધી જૂનાગઢ કોમ. કો-ઓપ. બેંક લિ. <br>${loan.branchName} શાખા.
                    </div>

                    <p style="text-indent: 20px; font-size: 11.5px; line-height: 1.35; text-align: justify; margin: 1px 0;">
                        બેંક તરફથી ઉપર મુજબના દાગીના મને અંકે કરજ પાકતી મુદતે પૂરેપૂરા સોનાના વજન સહીત સીલબંધ પેકેટમાં સહી-સલામત પરત મળેલ છે. હવે મારે બેંક પ્રત્યે દાગીના અંગે કશો વાંધો કે તકરાર રહેતી નથી.
                    </p>

                    <!-- Return Metadata & Signature Row -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top: 2px; font-size: 11.5px;">
                        <div style="font-weight: 700; line-height: 1.4; text-align: left;">
                            <div>તારીખ:- ${formatDateDMY(loan.date)}</div>
                            <div>લોન ખાતા નં:- ${loan.accountNo || "-"}</div>
                            <div>પેકેટ નંબર:- #${loan.packetNo || "-"}</div>
                        </div>
                        <div style="text-align: center; width: 45%;">
                            <div>X....................................................</div>
                            <div style="margin-top: 2px; font-weight: 700;">(${loan.borrowerName})</div>
                            <div style="font-size: 10px; font-weight: 600; color: #444; margin-top:1px;">દાગીના પરત મેળવનાર</div>
                        </div>
                    </div>

                    <!-- Rules Box -->
                    <div style="margin-top: 2px; border: 1.5px solid #000000; padding: 3px 6px; font-size: 8px; line-height: 1.2; background-color: #fafafa; color: #000000;">
                        <div style="font-weight: 800; font-size: 9px; margin-bottom: 2px; text-decoration: underline; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">નિયમોઃ-</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 15px;">
                            <div><strong>(૧)</strong> આ ધિરાણની મુદત એક વર્ષની છે.</div>
                            <div><strong>(૨)</strong> વ્યાજનો દર બેંકનું બોર્ડ વખતોવખત ઠરાવશે તે લાગુ રહેશે.</div>
                            <div><strong>(૩)</strong> ખાતે ઉધારેલ માસિક વ્યાજ દર માસે જમા કરાવવાનું છે. અન્યથા ૨ % વધારાનું વ્યાજ વસુલવામાં આવશે.</div>
                            <div><strong>(૪)</strong> ધિરાણ લેનારે વારસદાર નીમવા ફરજીયાત છે.</div>
                            <div><strong>(૫)</strong> આ ધિરાણ અંગેના તમામ વ્યવહારો કરતી વખતે આ પહોંચ સાથે રાખવી ફરજીયાત છે.</div>
                            <div><strong>(૬)</strong> ધિરાણ લેનાર વ્યક્તિને જ દાગીના પરત સોંપવામાં આવશે.</div>
                        </div>
                    </div>
                </div>
                                <!-- PAGE 4: LETTER OF PLEDGE (લેટર ઓફ પ્લેજ) -->
                ${(!is3553 && parseFloat(loan.loanAmount) <= 50000) ? `
                <div class="${hasKfs ? 'print-page-break ' : ''}print-page-layout" style="padding: 10px 0; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; font-size:14.5px; line-height:1.45; color:#000000; background-color:#ffffff;">
                    <!-- Date on Right -->
                    <div style="text-align: right; font-weight: 700; margin-bottom: 8px;">
                        તારીખઃ- ${formatDateDMY(loan.date)}
                    </div>

                    <!-- Centered Title -->
                    <div style="text-align: center; margin-bottom: 12px;">
                        <h2 style="font-size: 20px; font-weight: 800; margin: 0; text-decoration: underline;">લેટર ઓફ પ્લેજ</h2>
                    </div>

                    <!-- Recipient -->
                    <div style="font-weight: 700; margin-bottom: 10px; line-height: 1.4;">
                        પ્રતિ,<br>
                        મેનેજર સાહેબ,<br>
                        ધી જૂનાગઢ કોમ. કો-ઓપ. બેંક લિ.<br>
                        ${loan.branchName} શાખા.
                    </div>

                    <!-- Opening declaration -->
                    <p style="margin-bottom: 10px; text-align: justify; text-indent: 30px;">
                        હું <strong>${loan.borrowerName}</strong> ધંધોઃ- <strong>${loan.custOccupation || "-"}</strong>, ઉ.વ. <strong>${loan.custAge || "-"}</strong>, ધર્મેઃ- <strong>${loan.custReligion || "-"}</strong>, રહેઃ- <strong>${loan.custAddress || "-"}</strong> નીચે પ્રમાણે લખી બંધાઉં છું કે :-
                    </p>

                    <!-- 10 Points List -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧.</span>
                            <span style="text-align: justify;">આજરોજ મારી પોતાની માલિકીના સોનાના દાગીના કે જેની નોંધ બેંક તરફથી મને મળેલ જુદી પહોંચમાં કરેલ છે, તે બેંકને થાલમાં આપી મેં રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> અંકે રૂપિયા <strong>${gujWords}</strong> નું ધિરાણ મેળવેલ છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૨.</span>
                            <span style="text-align: justify;">સદરહુ રકમની આજરોજ મેં જુદી વચન ચિઠ્ઠી લખી છે અને ધિરાણની રકમ પર <strong>${loan.interestRate}</strong> ના વાર્ષિક વ્યાજ દરે, માસિક ચક્રવૃદ્ધિ લેખે ભરપાઈ કરવું છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૩.</span>
                            <span style="text-align: justify;">સદરહુ ધિરાણની રકમ ૧ વર્ષમાં ચડત વ્યાજ સહિત બેંકને ભરપાઈ કરી આપવાની છે અને વ્યાજ દર મહિને જમા કરાવી આપવાનું છે, અન્યથા બેંક દર વર્ષે દર સેંકડે ૨.૦૦ % લેખે દંડનીય વ્યાજ સદર વ્યાજની રકમ ઉપરાંત વસુલ કરશે તે મને કબુલ-મંજુર છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૪.</span>
                            <span style="text-align: justify;">બેંક દ્વારા વ્યાજ દરમાં વધારા / ઘટાડાની જાહેરાત બેંકના નોટીસ બોર્ડ પર કરી તેની અમલવારી જાહેરાતમાં દર્શાવેલી તારીખથી કરશે જે મને કબુલ-મંજુર છે અને આવા વધારા / ઘટાડા અનુસાર બેંકને જે તે તારીખથી વ્યાજ ચુકવવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૫.</span>
                            <span style="text-align: justify;">હું બેંકનો સભાસદ / નોમિનલ સભાસદ છું અને બેંકના નિયમો તથા પેટા નિયમો વાંચ્યા અને સમજ્યા છે અને તે મને બંધનકર્તા છે અને તેમાં વખતોવખત જે ફેરફાર થાય તે પાળવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૬.</span>
                            <span style="text-align: justify;">મેં સોંપેલ દાગીના પર વારસનો હક છે. પરંતુ તેમને તે ખાતર કોઈપણ જાતનો વાંધો કરવાનો અધિકાર નથી.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૭.</span>
                            <span style="text-align: justify;">બેંક માંગે ત્યારે ધિરાણ મેળવેલ તમામ રકમ વ્યાજ સહીત ભરપાઈ કરવાની છે અને તેમ કરવામાં હું કસુર કરું તો બેંક થાલમાં મુકેલ દાગીના વેંચી શકે છે. આવી રીતે બેંકે વેંચેલ દાગીના પરત્વે મારે કશો વાંધો રહેશે નહિ, આ અંગેની સર્વ જવાબદારી મારી રહેશે અને જે કાંઈપણ ખર્ચ થશે તે મારે શિરે રહેશે, જે મારા વંશ-વારસોને કબુલ-મંજુર છે. દાગીના વેંચાતા ઉપજેલી કિંમતમાંથી બેંક પોતાનું લ્હેણું વસુલ કરી બાકી રકમ મને આપશે અથવા મારા વારસને આપશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૮.</span>
                            <span style="text-align: justify;">મેં થાલમાં મુકેલ દાગીના બેંક ફરીથી થાલમાં મૂકી શકશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૯.</span>
                            <span style="text-align: justify;">મેં બેંકને થાલમાં આપેલાં દાગીનાનું સીલબંધ પેકેટ RBI ના નિર્દેશો અનુસાર રીચેકીંગના હેતુ માટે સક્ષમ અધિકારી સમક્ષ ખોલીને રીચેકીંગ કરાવી શકશે જેમાં મારી હાજરીની જરૂરી રહેશે નહીં.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧૦.</span>
                            <span style="text-align: justify;">રીઝર્વ બેંક ઓફ ઇન્ડિયાની સહકારી બેંકો ઉપર વખતોવખત જારી કરેલી ધિરાણ ખાતાઓમાં વ્યાજ ઉધારવા અંગેની સૂચનાઓ અનુસાર આ ધિરાણ ખાતામાં વ્યાજ ઉધારશે તે મને કબુલ અને બંધનકર્તા છે.</span>
                        </div>
                    </div>

                    <!-- Footer: Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; font-weight: 700; font-size: 14.5px;">
                        <div style="line-height: 1.5; text-align: left;">
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="display: inline-block; text-align: center;">
                                <div style="height: 45px;"></div>
                                <div style="margin-bottom: 3px;">સહી X ...............................................................</div>
                                <div style="font-weight: 700;">(અરજદારનું નામ: ${loan.borrowerName})</div>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- PAGE 5: LETTER OF AUTHORIZATION (અધિકાર પત્ર) -->
                ${false ? `
                <div class="print-page-layout" style="padding: 10px 0; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; font-size:14.5px; line-height:1.45; color:#000000; background-color:#ffffff;">
                    <!-- Date on Right -->
                    <div style="text-align: right; font-weight: 700; margin-bottom: 8px;">
                        તારીખ :- ${formatDateDMY(loan.date)}
                    </div>

                    <!-- Centered Title -->
                    <div style="text-align: center; margin-bottom: 12px;">
                        <h2 style="font-size: 20px; font-weight: 800; margin: 0; text-decoration: underline;">અધિકાર પત્ર</h2>
                    </div>

                    <!-- Recipient -->
                    <div style="font-weight: 700; margin-bottom: 10px; line-height: 1.4;">
                        પ્રતિ,<br>
                        મેનેજર સાહેબ,<br>
                        ધી જૂનાગઢ કોમ. કો-ઓપ. બેંક લિ.<br>
                        ${loan.branchName} શાખા.
                    </div>

                    <!-- Opening declaration -->
                    <p style="margin-bottom: 10px; text-align: justify; text-indent: 30px;">
                        હું <strong>${loan.borrowerName}</strong> ધંધો : <strong>${loan.custOccupation || "-"}</strong>, ઉ.વ. <strong>${loan.custAge || "-"}</strong>, ધર્મે : <strong>${loan.custReligion || "-"}</strong>,  રહેવાસી : <strong>${loan.custAddress || "-"}</strong> નીચે પ્રમાણે લખી બંધાઉં છું કે :-
                    </p>

                    <!-- 10 Points List -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧.</span>
                            <span style="text-align: justify;">આજરોજ મારી પોતાની માલિકીના સોનાના દાગીના કે જેની નોંધ બેંક તરફથી મને મળેલ જુદી પહોંચમાં કરેલ છે, તે બેંકને થાલમાં આપી મેં રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> અંકે રૂપિયા <strong>${gujWords}</strong> નું ધિરાણ મેળવેલ છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૨.</span>
                            <span style="text-align: justify;">સદરહુ રકમની આજરોજ મેં જુદી વચન ચિઠ્ઠી લખી છે અને ધિરાણની રકમ પર <strong>${loan.interestRate}</strong> ના વાર્ષિક વ્યાજ દરે, માસિક ચક્રવૃદ્ધિ લેખે ભરપાઈ કરવું છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૩.</span>
                            <span style="text-align: justify;">સદરહુ ધિરાણની રકમ ૧૨ માસમાં ચડત વ્યાજ સહિત બેંકને ભરપાઈ કરી આપવાની છે અને વ્યાજ દર મહિને જમા કરાવી આપવાનું છે, અન્યથા બેંક દર વર્ષે દર સેંકડે ૨.૦૦ % લેખે દંડનીય વ્યાજ સદર વ્યાજની રકમ ઉપરાંત વસુલ કરશે તે મને કબુલ-મંજુર છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૪.</span>
                            <span style="text-align: justify;">બેંક દ્વારા વ્યાજ દરમાં વધારા / ઘટાડાની જાહેરાત બેંકના નોટીસ બોર્ડ પર કરી તેની અમલવારી જાહેરાતમાં દર્શાવેલી તારીખથી કરશે જે મને કબુલ-મંજુર છે અને આવા વધારા / ઘટાડા અનુસાર બેંકને જે તે તારીખથી વ્યાજ ચુકવવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૫.</span>
                            <span style="text-align: justify;">હું બેંકનો સભાસદ / નોમિનલ સભાસદ છું અને બેંકના નિયમો તથા પેટા નિયમો વાંચ્યા અને સમજ્યા છે અને તે મને બંધનકર્તા છે અને તેમાં વખતોવખત જે ફેરફાર થાય તે પાળવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૬.</span>
                            <span style="text-align: justify;">મેં સોંપેલ દાગીના પર વારસનો હક છે. પરંતુ તેમને તે ખાતર કોઈપણ જાતનો વાંધો કરવાનો અધિકાર નથી.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૭.</span>
                            <span style="text-align: justify;">બેંક માંગે ત્યારે ધિરાણ મેળવેલ તમામ રકમ વ્યાજ સહીત ભરપાઈ કરવાની છે અને તેમ કરવામાં હું કસુર કરું તો બેંક થાલમાં મુકેલ દાગીના વેંચી શકે છે. આવી રીતે બેંકે વેંચેલ દાગીના પરત્વે મારે કશો વાંધો રહેશે નહિ, આ અંગેની સર્વ જવાબદારી મારી રહેશે અને જે કાંઈપણ ખર્ચ થશે તે મારે શિરે રહેશે, જે મારા વંશ-વારસોને કબુલ-મંજુર છે. દાગીના વેંચાતા ઉપજેલી કિંમતમાંથી બેંક પોતાનું લ્હેણું વસુલ કરી બાકી રકમ મને આપશે અથવા મારા વારસને આપશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૮.</span>
                            <span style="text-align: justify;">મેં થાલમાં મુકેલ દાગીના બેંક ફરીથી થાલમાં મૂકી શકશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૯.</span>
                            <span style="text-align: justify;">મેં બેંકને થાલમાં આપેલાં દાગીનાનું સીલબંધ પેકેટ RBI ના નિર્દેશો અનુસાર રીચેકીંગના હેતુ માટે સક્ષમ અધિકારી સમક્ષ ખોલીને રીચેકીંગ કરાવી શકશે જેમાં મારી હાજરીની જરૂરી રહેશે નહીં.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧૦.</span>
                            <span style="text-align: justify;">રીઝર્વ બેંક ઓફ ઇન્ડિયાની સહકારી બેંકો ઉપર વખતોવખત જારી કરેલી ધિરાણ ખાતાઓમાં વ્યાજ ઉધારવા અંગેની સૂચનાઓ અનુસાર આ ધિરાણ ખાતામાં વ્યાજ ઉધારશે તે મને કબુલ અને બંધનકર્તા છે.</span>
                        </div>
                    </div>

                    <!-- Footer: Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; font-weight: 700; font-size: 14.5px;">
                        <div style="line-height: 1.5; text-align: left;">
                            <div>સ્થળ : - ${loan.branchName}</div>
                            <div>તારીખ :- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="height: 45px;"></div>
                            <div style="margin-bottom: 3px;">સહી X ...............................................................</div>
                            <div style="font-weight: 700; padding-right: 80px;">(${loan.borrowerName})</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- PAGE 5: KEY FACTS STATEMENT (KFS) - BULLET REPAYMENT -->
                ${hasKfsBullet ? `
                <div class="print-page-layout print-kfs-layout" style="display:block !important; padding: 4mm 15mm; box-sizing:border-box; font-family:'Outfit', sans-serif; font-size:13.5px; line-height:1.35; color:#000000; background-color:#ffffff;">
                    <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                        <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS) – SUMMARY BOX</h2>
                        <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 6px 0;">(Gold Loan – Bullet Repayment)</h3>
                    </div>
                    
                    <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px; border:1.5px solid #000000; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; height:18px; text-align:left;">
                                <th style="border-right:1.5px solid #000000; padding:3px 6px; width:45%; font-weight:800;">Particulars</th>
                                <th style="padding:3px 6px; font-weight:800;">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Unique Proposal Number</td>
                                <td style="padding:3px 6px; font-weight:700;">${uniquePropNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Date of KFS</td>
                                <td style="padding:3px 6px;">${kfsDate}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Borrower Name</td>
                                <td style="padding:3px 6px; font-weight:800;">${loan.borrowerName}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Customer ID</td>
                                <td style="padding:3px 6px;">${loan.custNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan Account No.</td>
                                <td style="padding:3px 6px; font-weight:800;">${loan.accountNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Type of Loan</td>
                                <td style="padding:3px 6px;">Gold Loan [${loan.productCode}]</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purpose of Loan</td>
                                <td style="padding:3px 6px;">${loan.loanPurpose}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Sanctioned Loan Amount</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Disbursed Amount</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Tenure of Loan</td>
                                <td style="padding:3px 6px;">${tenureMonthsVal} Months</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Rate of Interest</td>
                                <td style="padding:3px 6px;">${interestRateClean}% p.a. (Fixed)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Annual Percentage Rate (APR)</td>
                                <td style="padding:3px 6px;">${interestRateClean}%</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Interest Recovery</td>
                                <td style="padding:3px 6px;">Monthly</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Type</td>
                                <td style="padding:3px 6px;">Bullet Repayment</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Terms</td>
                                <td style="padding:3px 6px; line-height: 1.2; text-align: justify;">The principal amount is repayable in one lump sum on or before the due date. Interest shall be paid as per the sanctioned terms.</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Due Date of Maturity</td>
                                <td style="padding:3px 6px; font-weight:700;">${maturityDateCustom}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Processing Charges</td>
                                <td style="padding:3px 6px;">₹ ${procCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Appraiser Charges</td>
                                <td style="padding:3px 6px;">₹ ${appraiserCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Documentation Charges</td>
                                <td style="padding:3px 6px;">₹ ${docCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Other Charges (if any)</td>
                                <td style="padding:3px 6px;">₹ ${otherChargesSum}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Penal Charges (in case of default)</td>
                                <td style="padding:3px 6px;">0.00</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Security</td>
                                <td style="padding:3px 6px;">Pledge of Gold Ornaments</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gross Weight / Net Weight of Gold</td>
                                <td style="padding:3px 6px;">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purity of Gold</td>
                                <td style="padding:3px 6px;">22 Carat</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan-to-Value (LTV)</td>
                                <td style="padding:3px 6px;">${ltvRatio}%</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Total Amount Payable at Maturity</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")} (Subject to interest accrued as per terms)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Prepayment / Foreclosure Charges</td>
                                <td style="padding:3px 6px;">0.00</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Consequences of Default</td>
                                <td style="padding:3px 6px; line-height: 1.25; text-align: justify;">In case of non-payment on the due date, penal charges will apply. If the default continues, the Bank may enforce the pledge and recover dues by sale/auction of the pledged gold in accordance with RBI guidelines and the loan agreement, after giving the required notice.</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Grievance Redressal Officer</td>
                                <td style="padding:3px 6px;">${loan.grievanceOfficer || 'Amrutlal Valjibhai Chavda'}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div style="border:1.5px solid #000000; padding:8px 12px; margin-top:10px; margin-bottom:12px; font-size:11px; line-height:1.4; text-align:justify; font-family:'Outfit', sans-serif;">
                        <strong style="display:block; margin-bottom:3px; text-decoration: underline; font-weight:800;">Borrower's Acknowledgement</strong>
                        I/We acknowledge that I/We have received and understood this Key Facts Statement before execution of the loan documents. The loan amount, interest rate, applicable charges, bullet repayment terms, security, and consequences of default have been explained to me/us.
                    </div>
                    
                    <div style="margin-top:20px; font-size:12px; font-weight:700; font-family:'Outfit', sans-serif; line-height:1.8;">
                        <div>Borrower's Signature : ________________________</div>
                        <div style="height:15px;"></div>
                        <div>Bank Official's Signature : ____________________</div>
                        <div style="margin-top:5px;">Date : ${kfsDate}</div>
                    </div>
                </div>
                ` : ''}

                <!-- PAGE 5: KEY FACTS STATEMENT (KFS) - OVERDRAFT FACILITY -->
                ${hasKfsOverdraft ? `
                <div class="print-page-layout print-kfs-layout" style="display:block !important; padding: 4mm 15mm; box-sizing:border-box; font-family:'Outfit', sans-serif; font-size:13.5px; line-height:1.35; color:#000000; background-color:#ffffff;">
                    <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                        <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS) – SUMMARY BOX</h2>
                        <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 6px 0;">(Gold Loan – Overdraft Facility)</h3>
                    </div>
                    
                    <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px; border:1.5px solid #000000; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; height:18px; text-align:left;">
                                <th style="border-right:1.5px solid #000000; padding:3px 6px; width:45%; font-weight:800;">Particulars</th>
                                <th style="padding:3px 6px; font-weight:800;">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Unique Proposal Number</td>
                                <td style="padding:3px 6px; font-weight:700;">${uniquePropNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Date of KFS</td>
                                <td style="padding:3px 6px;">${kfsDate}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Borrower Name</td>
                                <td style="padding:3px 6px; font-weight:800;">${loan.borrowerName}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Customer ID</td>
                                <td style="padding:3px 6px;">${loan.custNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan Account No.</td>
                                <td style="padding:3px 6px; font-weight:800;">${loan.accountNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Type of Facility</td>
                                <td style="padding:3px 6px;">Gold Loan – Overdraft (OD)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purpose of Loan</td>
                                <td style="padding:3px 6px;">${loan.loanPurpose}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Sanctioned Limit</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Available Drawing Limit</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Amount Disbursed / Utilised (Initial)</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Facility Validity / Maturity Date</td>
                                <td style="padding:3px 6px; font-weight:700;">${maturityDateCustom}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Rate of Interest</td>
                                <td style="padding:3px 6px;">${interestRateClean}% p.a. (Fixed)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Annual Percentage Rate (APR)</td>
                                <td style="padding:3px 6px;">${interestRateClean}%</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Interest Recovery Frequency</td>
                                <td style="padding:3px 6px;">Monthly</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Processing Charges</td>
                                <td style="padding:3px 6px;">₹ ${procCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gold Appraiser Charges</td>
                                <td style="padding:3px 6px;">₹ ${appraiserCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Documentation Charges</td>
                                <td style="padding:3px 6px;">₹ ${docCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Other Charges (if any)</td>
                                <td style="padding:3px 6px;">₹ ${otherChargesSum}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Penal Charges</td>
                                <td style="padding:3px 6px;">Nil</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Security</td>
                                <td style="padding:3px 6px;">Pledge of Gold Ornaments</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gross Weight / Net Weight of Gold</td>
                                <td style="padding:3px 6px;">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purity of Gold</td>
                                <td style="padding:3px 6px;">22 Carat</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan-to-Value (LTV)</td>
                                <td style="padding:3px 6px;">${ltvRatio}%</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Terms</td>
                                <td style="padding:3px 6px; line-height: 1.25; text-align: justify;">The overdraft facility is repayable on demand or on/before the maturity date. Interest is payable at the prescribed frequency on the amount utilized.</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Redraw Facility</td>
                                <td style="padding:3px 6px;">Permitted / Not Permitted (as per sanction terms)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Prepayment / Closure Charges</td>
                                <td style="padding:3px 6px;">Nil</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Consequences of Default</td>
                                <td style="padding:3px 6px; line-height: 1.25; text-align: justify;">Failure to service interest or repay the dues may attract penal charges. In case of continued default, the Bank may enforce the pledge and recover outstanding dues by sale/auction of the pledged gold in accordance with RBI guidelines and the loan agreement after giving the required notice.</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Grievance Redressal Officer</td>
                                <td style="padding:3px 6px;">${loan.grievanceOfficer || 'Amrutlal Valjibhai Chavda'}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div style="border:1.5px solid #000000; padding:8px 12px; margin-top:10px; margin-bottom:12px; font-size:11px; line-height:1.4; text-align:justify; font-family:'Outfit', sans-serif;">
                        <strong style="display:block; margin-bottom:3px; text-decoration: underline; font-weight:800;">Borrower's Acknowledgement</strong>
                        I/We acknowledge that I/We have received the Key Facts Statement prior to execution of the loan documents. I/We have understood the sanctioned limit, applicable interest rate, APR, charges, repayment terms, security, penal charges, and consequences of default.
                    </div>
                    
                    <div style="margin-top:20px; font-size:12px; font-weight:700; font-family:'Outfit', sans-serif; line-height:1.8;">
                        <div>Borrower's Signature : ________________________</div>
                        <div style="height:15px;"></div>
                        <div>Bank Official's Signature : ____________________</div>
                        <div style="margin-top:5px;">Date : ${kfsDate}</div>
                    </div>
                </div>
                ` : ''}

                <!-- PAGE 6: KEY FACTS STATEMENT (KFS) - INSTALLMENT / EMI REPAYMENT -->
                ${hasKfsInstallment ? `
                <div class="print-page-layout print-kfs-layout" style="display:block !important; padding: 4mm 15mm; box-sizing:border-box; font-family:'Outfit', sans-serif; font-size:13.5px; line-height:1.35; color:#000000; background-color:#ffffff;">
                    <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                        <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS) – SUMMARY BOX</h2>
                        <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 6px 0;">(Gold Loan – Installment / EMI Repayment)</h3>
                    </div>
                    
                    <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px; border:1.5px solid #000000; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; height:18px; text-align:left;">
                                <th style="border-right:1.5px solid #000000; padding:3px 6px; width:45%; font-weight:800;">Particulars</th>
                                <th style="padding:3px 6px; font-weight:800;">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Unique Proposal Number</td>
                                <td style="padding:3px 6px; font-weight:800;">${uniquePropNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Date of KFS</td>
                                <td style="padding:3px 6px;">${kfsDate}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Borrower Name</td>
                                <td style="padding:3px 6px; font-weight:800;">${loan.borrowerName}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Customer ID</td>
                                <td style="padding:3px 6px;">${loan.custNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan Account No.</td>
                                <td style="padding:3px 6px; font-weight:800;">${loan.accountNo}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Type of Loan</td>
                                <td style="padding:3px 6px;">Gold Loan (Instalment / EMI)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purpose of Loan</td>
                                <td style="padding:3px 6px;">${loan.loanPurpose}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Sanctioned Loan Amount</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Disbursed Amount</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan Tenure</td>
                                <td style="padding:3px 6px;">${loan.tenureMonths || 36} Months</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Rate of Interest</td>
                                <td style="padding:3px 6px;">${interestRateClean}% p.a. (Fixed)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Annual Percentage Rate (APR)</td>
                                <td style="padding:3px 6px;">${interestRateClean}%</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Frequency</td>
                                <td style="padding:3px 6px;">Monthly</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">No. of Instalments (EMIs)</td>
                                <td style="padding:3px 6px;">${loan.tenureMonths || 36}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">EMI Amount</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.emiAmount || 0).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">First EMI Due Date</td>
                                <td style="padding:3px 6px;">${getFirstEmiDueDate(loan.date)}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Last EMI / Maturity Date</td>
                                <td style="padding:3px 6px; font-weight:700;">${getMaturityDate(loan.date)}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Processing Charges</td>
                                <td style="padding:3px 6px;">₹ ${procCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gold Appraiser Charges</td>
                                <td style="padding:3px 6px;">₹ ${appraiserCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Documentation Charges</td>
                                <td style="padding:3px 6px;">₹ ${docCharges}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Other Charges (if any)</td>
                                <td style="padding:3px 6px;">₹ ${otherChargesSum}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Penal Charges</td>
                                <td style="padding:3px 6px;">Nil</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Security</td>
                                <td style="padding:3px 6px;">Pledge of Gold Ornaments</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gross Weight / Net Weight of Gold</td>
                                <td style="padding:3px 6px;">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purity of Gold</td>
                                <td style="padding:3px 6px;">22 Carat</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan-to-Value (LTV)</td>
                                <td style="padding:3px 6px;">${ltvRatio}%</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Total Amount Payable by Borrower</td>
                                <td style="padding:3px 6px; font-weight:700;">₹ ${(parseFloat(loan.emiAmount || 0) * (loan.tenureMonths || 36)).toLocaleString("en-IN")}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Prepayment / Foreclosure Charges</td>
                                <td style="padding:3px 6px;">Nil</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Consequences of Default</td>
                                <td style="padding:3px 6px; line-height: 1.25; text-align: justify;">Delay in payment of EMI(s) will attract applicable penal charges. Continued default may result in enforcement of the pledge and sale/auction of the pledged gold in accordance with RBI guidelines and the loan agreement after giving the required notice.</td>
                            </tr>
                            <tr style="border-bottom:1px solid #000000;">
                                <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Grievance Redressal Officer</td>
                                <td style="padding:3px 6px;">${loan.grievanceOfficer || 'Amrutlal Valjibhai Chavda'}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div style="border:1.5px solid #000000; padding:8px 12px; margin-top:10px; margin-bottom:12px; font-size:11px; line-height:1.4; text-align:justify; font-family:'Outfit', sans-serif;">
                        <strong style="display:block; margin-bottom:3px; text-decoration: underline; font-weight:800;">Borrower's Acknowledgement</strong>
                        I/We acknowledge that I/We have received the Key Facts Statement before execution of the loan agreement. I/We have understood the loan amount, interest rate, APR, EMI amount, repayment schedule, applicable charges, security, penal charges, and consequences of default.
                    </div>
                    
                    <div style="margin-top:20px; font-size:12px; font-weight:700; font-family:'Outfit', sans-serif; line-height:1.8;">
                        <div>Borrower's Signature : ________________________</div>
                        <div style="height:15px;"></div>
                        <div>Bank Official's Signature : ____________________</div>
                        <div style="margin-top:5px;">Date : ${kfsDate}</div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    // Key Facts Statement (KFS) Print Format
    if (format === "kfs") {
        const kfsDate = formatDateDMY(loan.date);
        const uniquePropNo = `PROP/${loan.branchCode}/${getBranchLoanSerial(loan.id, loan.branchCode)}`;
        const maturityDate = getMaturityDate(loan.date);
        const interestRateClean = loan.interestRate ? loan.interestRate.toString().replace(/%/g, "").trim() : "";
        
        // Processing Charges: serviceCharge
        const procCharges = parseFloat(loan.serviceCharge || 0).toFixed(2);
        // Appraiser Charges: valuationCharge
        const appraiserCharges = parseFloat(loan.valuationCharge || 0).toFixed(2);
        // Documentation Charges: docCharge
        const docCharges = parseFloat(loan.docCharge || 0).toFixed(2);
        // Other Charges: sum of insCharge, stampCharge, cgst, sgst, adjustment, shareA, shareB, memberFee
        const otherChargesSum = (
            parseFloat(loan.insCharge || 0) +
            parseFloat(loan.stampCharge || 0) +
            parseFloat(loan.cgst || 0) +
            parseFloat(loan.sgst || 0) +
            parseFloat(loan.adjustment || 0) +
            parseFloat(loan.shareA || 0) +
            parseFloat(loan.shareB || 0) +
            parseFloat(loan.memberFee || 0)
        ).toFixed(2);
        
        const ltvRatio = loan.marketValue > 0 ? Math.round((loan.loanAmount / loan.marketValue) * 100) : 0;

        const hasKfsBullet = loan.productCode && (loan.productCode.includes("3725") || loan.productCode.includes("3524"));
        const hasKfsOverdraft = loan.productCode && loan.productCode.includes("3553");
        const hasKfsInstallment = loan.productCode && loan.productCode.includes("3527");

        const tenureMonthsVal = loan.tenureMonths || 36;
        const emiAmountVal = parseFloat(loan.emiAmount || 0);
        const totalPayableVal = emiAmountVal * tenureMonthsVal;
        const firstEmiDate = getFirstEmiDueDate(loan.date);

        let maturityDateCustom = maturityDate;
        if (loan.productCode && loan.productCode.includes("3527")) {
            const matDate = new Date(loan.date);
            matDate.setMonth(matDate.getMonth() + tenureMonthsVal);
            const dd = String(matDate.getDate()).padStart(2, '0');
            const mm = String(matDate.getMonth() + 1).padStart(2, '0');
            const yyyy = matDate.getFullYear();
            maturityDateCustom = `${dd}-${mm}-${yyyy}`;
        }

        let kfsContent = "";

        if (hasKfsInstallment) {
            kfsContent = `
            <div class="print-voucher print-kfs-layout" style="width:100%; box-sizing:border-box; font-family:'Outfit', sans-serif; color:#000000; background-color:#ffffff; padding: 4mm 15mm; font-size: 13.5px; line-height: 1.35;">
                <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                    <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS) – SUMMARY BOX</h2>
                    <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 6px 0;">(Gold Loan – Installment / EMI Repayment)</h3>
                </div>
                
                <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px; border:1.5px solid #000000; color:#000000;">
                    <thead>
                        <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; height:18px; text-align:left;">
                            <th style="border-right:1.5px solid #000000; padding:3px 6px; width:45%; font-weight:800;">Particulars</th>
                            <th style="padding:3px 6px; font-weight:800;">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Unique Proposal Number</td>
                            <td style="padding:3px 6px; font-weight:800;">${uniquePropNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Date of KFS</td>
                            <td style="padding:3px 6px;">${kfsDate}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Borrower Name</td>
                            <td style="padding:3px 6px; font-weight:800;"><strong>${loan.borrowerName}</strong></td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Customer ID</td>
                            <td style="padding:3px 6px;">${loan.custNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan Account No.</td>
                            <td style="padding:3px 6px; font-weight:800;"><strong>${loan.accountNo}</strong></td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Type of Loan</td>
                            <td style="padding:3px 6px;">Gold Loan (Instalment / EMI)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purpose of Loan</td>
                            <td style="padding:3px 6px;">${loan.loanPurpose}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Sanctioned Loan Amount</td>
                            <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Disbursed Amount</td>
                            <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan Tenure</td>
                            <td style="padding:3px 6px;">${tenureMonthsVal} Months</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Rate of Interest</td>
                            <td style="padding:3px 6px;">${interestRateClean}% p.a. (Fixed)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Annual Percentage Rate (APR)</td>
                            <td style="padding:3px 6px;">${interestRateClean}%</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Frequency</td>
                            <td style="padding:3px 6px;">Monthly</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">No. of Instalments (EMIs)</td>
                            <td style="padding:3px 6px;">${tenureMonthsVal}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">EMI Amount</td>
                            <td style="padding:3px 6px; font-weight:700;">₹ ${emiAmountVal.toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">First EMI Due Date</td>
                            <td style="padding:3px 6px;">${firstEmiDate}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Last EMI / Maturity Date</td>
                            <td style="padding:3px 6px; font-weight:700;">${maturityDateCustom}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Processing Charges</td>
                            <td style="padding:3px 6px;">₹ ${procCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gold Appraiser Charges</td>
                            <td style="padding:3px 6px;">₹ ${appraiserCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Documentation Charges</td>
                            <td style="padding:3px 6px;">₹ ${docCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Other Charges (if any)</td>
                            <td style="padding:3px 6px;">₹ ${otherChargesSum}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Penal Charges</td>
                            <td style="padding:3px 6px;">Nil</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Security</td>
                            <td style="padding:3px 6px;">Pledge of Gold Ornaments</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gross Weight / Net Weight of Gold</td>
                            <td style="padding:3px 6px;">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purity of Gold</td>
                            <td style="padding:3px 6px;">22 Carat</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan-to-Value (LTV)</td>
                            <td style="padding:3px 6px;">${ltvRatio}%</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Total Amount Payable by Borrower</td>
                            <td style="padding:3px 6px; font-weight:700;">₹ ${totalPayableVal.toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Prepayment / Foreclosure Charges</td>
                            <td style="padding:3px 6px;">Nil</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Consequences of Default</td>
                            <td style="padding:4px 8px; line-height: 1.25; text-align: justify;">Delay in payment of EMI(s) will attract applicable penal charges. Continued default may result in enforcement of the pledge and sale/auction of the pledged gold in accordance with RBI guidelines and the loan agreement after giving the required notice.</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Grievance Redressal Officer</td>
                            <td style="padding:3px 6px;">${loan.grievanceOfficer || 'Amrutlal Valjibhai Chavda'}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="border:1.5px solid #000000; padding:8px 12px; margin-top:10px; margin-bottom:12px; font-size:11px; line-height:1.4; text-align:justify; font-family:'Outfit', sans-serif;">
                    <strong style="display:block; margin-bottom:3px; text-decoration: underline; font-weight:800;">Borrower's Acknowledgement</strong>
                    I/We acknowledge that I/We have received the Key Facts Statement before execution of the loan agreement. I/We have understood the loan amount, interest rate, APR, EMI amount, repayment schedule, applicable charges, security, penal charges, and consequences of default.
                </div>
                
                <div style="margin-top:20px; font-size:12px; font-weight:700; font-family:'Outfit', sans-serif; line-height:1.8;">
                    <div>Borrower's Signature : ________________________</div>
                    <div style="height:15px;"></div>
                    <div>Bank Official's Signature : ____________________</div>
                    <div style="margin-top:5px;">Date : ${kfsDate}</div>
                </div>
            </div>
            `;
        } else if (hasKfsOverdraft) {
            kfsContent = `
            <div class="print-voucher print-kfs-layout" style="width:100%; box-sizing:border-box; font-family:'Outfit', sans-serif; color:#000000; background-color:#ffffff; padding: 4mm 15mm; font-size: 13.5px; line-height: 1.35;">
                <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                    <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS) – SUMMARY BOX</h2>
                    <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 6px 0;">(Gold Loan – Overdraft Facility)</h3>
                </div>
                
                <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px; border:1.5px solid #000000; color:#000000;">
                    <thead>
                        <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; height:18px; text-align:left;">
                            <th style="border-right:1.5px solid #000000; padding:3px 6px; width:45%; font-weight:800;">Particulars</th>
                            <th style="padding:3px 6px; font-weight:800;">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Unique Proposal Number</td>
                            <td style="padding:3px 6px; font-weight:800;">${uniquePropNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Date of KFS</td>
                            <td style="padding:3px 6px;">${kfsDate}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Borrower Name</td>
                            <td style="padding:3px 6px; font-weight:800;"><strong>${loan.borrowerName}</strong></td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Customer ID</td>
                            <td style="padding:3px 6px;">${loan.custNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:800;">Loan Account No.</td>
                            <td style="padding:3px 6px; font-weight:800;"><strong>${loan.accountNo}</strong></td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Type of Facility</td>
                            <td style="padding:3px 6px;">Gold Loan - Overdraft (Running Account)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purpose of Facility</td>
                            <td style="padding:3px 6px;">${loan.loanPurpose}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Sanctioned Limit</td>
                            <td style="padding:3px 6px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Tenure of Facility</td>
                            <td style="padding:3px 6px;">12 Months (Subject to review/renewal)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Rate of Interest</td>
                            <td style="padding:3px 6px;">${interestRateClean}% p.a. (Fixed, charged on daily balance)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Annual Percentage Rate (APR)</td>
                            <td style="padding:3px 6px;">${interestRateClean}%</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Frequency</td>
                            <td style="padding:3px 6px;">Interest payable monthly. Principal is running account.</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Repayment Terms</td>
                            <td style="padding:3px 6px; line-height: 1.2; text-align: justify;">To service interest debited monthly. Account limit is reviewable and principal is repayable on demand.</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Processing Charges</td>
                            <td style="padding:3px 6px;">₹ ${procCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gold Appraiser Charges</td>
                            <td style="padding:3px 6px;">₹ ${appraiserCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Documentation Charges</td>
                            <td style="padding:3px 6px;">₹ ${docCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Other Charges (if any)</td>
                            <td style="padding:3px 6px;">₹ ${otherChargesSum}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Penal Charges</td>
                            <td style="padding:3px 6px;">Nil</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Security</td>
                            <td style="padding:3px 6px;">Pledge of Gold Ornaments</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Gross Weight / Net Weight of Gold</td>
                            <td style="padding:3px 6px;">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Purity of Gold</td>
                            <td style="padding:3px 6px;">22 Carat</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Loan-to-Value (LTV)</td>
                            <td style="padding:3px 6px;">${ltvRatio}%</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Redraw Facility</td>
                            <td style="padding:3px 6px;">Permitted / Not Permitted (as per sanction terms)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Prepayment / Closure Charges</td>
                            <td style="padding:3px 6px;">Nil</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Consequences of Default</td>
                            <td style="padding:3px 6px; line-height: 1.25; text-align: justify;">Failure to service interest or repay the dues may attract penal charges. In case of continued default, the Bank may enforce the pledge and recover outstanding dues by sale/auction of the pledged gold in accordance with RBI guidelines and the loan agreement after giving the required notice.</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:3px 6px; font-weight:700;">Grievance Redressal Officer</td>
                            <td style="padding:3px 6px;">${loan.grievanceOfficer || 'Amrutlal Valjibhai Chavda'}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="border:1.5px solid #000000; padding:8px 12px; margin-top:10px; margin-bottom:12px; font-size:11px; line-height:1.4; text-align:justify; font-family:'Outfit', sans-serif;">
                    <strong style="display:block; margin-bottom:3px; text-decoration: underline; font-weight:800;">Borrower's Acknowledgement</strong>
                    I/We acknowledge that I/We have received the Key Facts Statement prior to execution of the loan documents. I/We have understood the sanctioned limit, applicable interest rate, APR, charges, repayment terms, security, penal charges, and consequences of default.
                </div>
                
                <div style="margin-top:20px; font-size:12px; font-weight:700; font-family:'Outfit', sans-serif; line-height:1.8;">
                    <div>Borrower's Signature : ________________________</div>
                    <div style="height:15px;"></div>
                    <div>Bank Official's Signature : ____________________</div>
                    <div style="margin-top:5px;">Date : ${kfsDate}</div>
                </div>
            </div>
            `;
        } else {
            kfsContent = `
            <div class="print-voucher print-kfs-layout" style="width:100%; box-sizing:border-box; font-family:'Outfit', sans-serif; color:#000000; background-color:#ffffff; padding: 4mm 15mm; font-size: 13.5px; line-height: 1.35;">
                <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                    <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS) – SUMMARY BOX</h2>
                    <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 0 0;">(Gold Loan – Bullet Repayment)</h3>
                </div>
                
                <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:12px; border:1.5px solid #000000; color:#000000;">
                    <thead>
                        <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; height:20px; text-align:left;">
                            <th style="border-right:1.5px solid #000000; padding:4px 8px; width:45%; font-weight:800;">Particulars</th>
                            <th style="padding:4px 8px; font-weight:800;">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Unique Proposal Number</td>
                            <td style="padding:4px 8px; font-weight:700;">${uniquePropNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Date of KFS</td>
                            <td style="padding:4px 8px;">${kfsDate}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Borrower Name</td>
                            <td style="padding:4px 8px; font-weight:800;"><strong>${loan.borrowerName}</strong></td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Customer ID</td>
                            <td style="padding:4px 8px;">${loan.custNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Loan Account No.</td>
                            <td style="padding:4px 8px; font-weight:800;"><strong>${loan.accountNo}</strong></td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Type of Loan</td>
                            <td style="padding:4px 8px;">Gold Loan [${loan.productCode}]</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Purpose of Loan</td>
                            <td style="padding:4px 8px;">${loan.loanPurpose}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Sanctioned Loan Amount</td>
                            <td style="padding:4px 8px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Disbursed Amount</td>
                            <td style="padding:4px 8px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Tenure of Loan</td>
                            <td style="padding:4px 8px;">36 Months</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Rate of Interest</td>
                            <td style="padding:4px 8px;">${interestRateClean}% p.a. (Fixed)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Annual Percentage Rate (APR)</td>
                            <td style="padding:4px 8px;">${interestRateClean}%</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Interest Recovery</td>
                            <td style="padding:4px 8px;">Monthly</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Repayment Type</td>
                            <td style="padding:4px 8px;">Bullet Repayment</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Repayment Terms</td>
                            <td style="padding:4px 8px; line-height: 1.25; text-align: justify;">The principal amount is repayable in one lump sum on or before the due date. Interest shall be paid as per the sanctioned terms.</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Due Date of Maturity</td>
                            <td style="padding:4px 8px; font-weight:700;">${maturityDate}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Processing Charges</td>
                            <td style="padding:4px 8px;">₹ ${procCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Appraiser Charges</td>
                            <td style="padding:4px 8px;">₹ ${appraiserCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Documentation Charges</td>
                            <td style="padding:4px 8px;">₹ ${docCharges}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Other Charges (if any)</td>
                            <td style="padding:4px 8px;">₹ ${otherChargesSum}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Penal Charges (in case of default)</td>
                            <td style="padding:4px 8px;">0.00</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Security</td>
                            <td style="padding:4px 8px;">Pledge of Gold Ornaments</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Gross Weight / Net Weight of Gold</td>
                            <td style="padding:4px 8px;">${parseFloat(loan.goldWeightGross || loan.goldWeight).toFixed(3)} Grams (Gross) / ${parseFloat(loan.goldWeight).toFixed(3)} Grams (Net)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Purity of Gold</td>
                            <td style="padding:4px 8px;">22 Carat</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Loan-to-Value (LTV)</td>
                            <td style="padding:4px 8px;">${ltvRatio}%</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Total Amount Payable at Maturity</td>
                            <td style="padding:4px 8px; font-weight:700;">₹ ${parseFloat(loan.loanAmount).toLocaleString("en-IN")} (Subject to interest accrued as per terms)</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Prepayment / Foreclosure Charges</td>
                            <td style="padding:4px 8px;">0.00</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Consequences of Default</td>
                            <td style="padding:4px 8px; line-height: 1.3; text-align: justify;">In case of non-payment on the due date, penal charges will apply. If the default continues, the Bank may enforce the pledge and recover dues by sale/auction of the pledged gold in accordance with RBI guidelines and the loan agreement, after giving the required notice.</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 8px; font-weight:700;">Grievance Redressal Officer</td>
                            <td style="padding:4px 8px;">${loan.grievanceOfficer || 'Amrutlal Valjibhai Chavda'}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="border:1.5px solid #000000; padding:8px 12px; margin-top:10px; margin-bottom:12px; font-size:11px; line-height:1.4; text-align:justify; font-family:'Outfit', sans-serif;">
                    <strong style="display:block; margin-bottom:3px; text-decoration: underline; font-weight:800;">Borrower's Acknowledgement</strong>
                    I/We acknowledge that I/We have received and understood this Key Facts Statement before execution of the loan documents. The loan amount, interest rate, applicable charges, bullet repayment terms, security, and consequences of default have been explained to me/us.
                </div>
                
                <div style="margin-top:20px; font-size:12px; font-weight:700; font-family:'Outfit', sans-serif; line-height:1.8;">
                    <div>Borrower's Signature : ________________________</div>
                    <div style="height:15px;"></div>
                    <div>Bank Official's Signature : ____________________</div>
                    <div style="margin-top:5px;">Date : ${kfsDate}</div>
                </div>
            </div>
            `;
        }

        printArea.innerHTML = kfsContent;
    }

    triggerPrintWhenReady();
}

// Convert Number to Gujarati Words
function numberToGujaratiWords(amount) {
    if (amount === 0) return "શૂન્ય પુરા";
    
    const gujaratiNumbers = [
        '', 'એક', 'બે', 'ત્રણ', 'ચાર', 'પાંચ', 'છ', 'સાત', 'આઠ', 'નવ', 'દસ',
        'અગિયાર', 'બાર', 'તેર', 'ચૌદ', 'પંદર', 'સોળ', 'સત્તર', 'અઢાર', 'ઓગણીસ', 'વીસ',
        'એકવીસ', 'બાવીસ', 'ત્રેવીસ', 'ચોવીસ', 'પચ્ચીસ', 'છવ્વીસ', 'સત્તાવીસ', 'અઠ્ઠાવીસ', 'ઓગણત્રીસ', 'ત્રીસ',
        'એકત્રીસ', 'બત્રીસ', 'ત્રેત્રીસ', 'ચોત્રીસ', 'પાંત્રીસ', 'છત્રીસ', 'સાડત્રીસ', 'આડત્રીસ', 'ઓગણચાલીસ', 'ચાલીસ',
        'એકતાલીસ', 'બેતાલીસ', 'ત્રેતાલીસ', 'ચોતાલીસ', 'પિંચતાલીસ', 'છતાલીસ', 'સુડતાલીસ', 'અડતાલીસ', 'ઓગણપચાસ', 'પચાસ',
        'એકાવન', 'બાવન', 'ત્રેપન', 'ચોપન', 'પંચાવન', 'છપ્પન', 'સત્તાવન', 'અઠ્ઠાવન', 'ઓગણસાઈઠ', 'સાઈઠ',
        'એકસઠ', 'બાસઠ', 'ત્રેસઠ', 'ચોસઠ', 'પાંસઠ', 'છાસઠ', 'સડસઠ', 'અડસઠ', 'ઓગણસિત્તેર', 'સિત્તેર',
        'એકોતેર', 'બોતેર', 'ત્યોતેર', 'ચોતેર', 'પંચોતેર', 'છોતેર', 'સિત્યોતેર', 'ઇત્યોતેર', 'ઓગણએસી', 'એસી',
        'એક્યાસી', 'બ્યાસી', 'ત્યાસી', 'ચોર્યાસી', 'પંચાસી', 'છ્યાસી', 'સિત્યાસી', 'અઠ્યાસી', 'નેવ્યાસી', 'નેવુ',
        'એકાણુ', 'બાણુ', 'ત્રાણુ', 'ચોરાણુ', 'પંચાણુ', 'છન્નુ', 'સત્તાણુ', 'અઠ્ઠાણુ', 'નવાણુ'
    ];

    function convertLessThanThousand(n) {
        if (n === 0) return "";
        let str = "";
        if (n >= 100) {
            str += gujaratiNumbers[Math.floor(n / 100)] + " સો ";
            n %= 100;
        }
        if (n > 0) {
            str += gujaratiNumbers[n];
        }
        return str.trim();
    }

    let num = Math.floor(amount);
    let words = "";

    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;

    if (crore > 0) {
        words += convertLessThanThousand(crore) + " કરોડ ";
    }
    if (lakh > 0) {
        words += convertLessThanThousand(lakh) + " લાખ ";
    }
    if (thousand > 0) {
        words += convertLessThanThousand(thousand) + " હજાર ";
    }
    if (num > 0) {
        words += convertLessThanThousand(num);
    }

    return words.trim() + " પુરા";
}

// ==================== IMAGE CROPPER & COMPRESSION UTILITY ====================
// Open Cropper Modal for photo cropping
function openCropModal(file, source) {
    activeCropSource = source;
    const modal = document.getElementById("crop-modal");
    const cropImg = document.getElementById("crop-image-element");
    if (!modal || !cropImg) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        cropImg.src = event.target.result;
        modal.classList.remove("hidden");

        // Destroy previous instance if it exists
        if (cropperInstance) {
            cropperInstance.destroy();
        }

        // Initialize Cropper.js
        const isSquare = (source === 'cust' || source === 'master-cust');
        cropperInstance = new Cropper(cropImg, {
            aspectRatio: isSquare ? 1 : NaN, // square for customer, free for gold
            viewMode: 1,
            autoCropArea: 1,
            responsive: true,
            restore: false
        });
    };
    reader.readAsDataURL(file);
}

// Close Cropper Modal and clean up
function closeCropModal() {
    const modal = document.getElementById("crop-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    // Reset file inputs so change events fire again even for same files
    document.getElementById("cust-photo-upload").value = "";
    document.getElementById("gold-photo-upload").value = "";
    document.getElementById("m-cust-photo-upload").value = "";
    activeCropSource = null;
}

// Initialize Cropper Event Handlers
function initCropperHandlers() {
    const btnSave = document.getElementById("btn-crop-save");
    const btnCancel = document.getElementById("btn-crop-cancel");
    const btnClose = document.getElementById("close-crop-modal-btn");

    if (btnSave) {
        btnSave.onclick = () => {
            if (!cropperInstance || !activeCropSource) return;

            const isSquare = (activeCropSource === 'cust' || activeCropSource === 'master-cust');
            // Export cropped canvas - optimized sizes for database character limits
            const canvas = cropperInstance.getCroppedCanvas(
                isSquare ? { width: 150, height: 150 } : { maxWidth: 250, maxHeight: 250 }
            );

            if (canvas) {
                // Convert to compressed jpeg data URL with 0.6 quality
                const base64 = canvas.toDataURL("image/jpeg", 0.6);

                if (activeCropSource === 'cust') {
                    currentUploadedCustPhoto = base64;
                    const preview = document.getElementById("cust-photo-preview");
                    if (preview) {
                        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    }
                } else if (activeCropSource === 'gold') {
                    currentUploadedGoldPhoto = base64;
                    const preview = document.getElementById("gold-photo-preview");
                    if (preview) {
                        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    }
                } else if (activeCropSource === 'master-cust') {
                    currentUploadedMasterCustPhoto = base64;
                    const preview = document.getElementById("m-cust-photo-preview");
                    if (preview) {
                        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    }
                }
            }
            closeCropModal();
        };
    }

    if (btnCancel) {
        btnCancel.onclick = closeCropModal;
    }
    if (btnClose) {
        btnClose.onclick = closeCropModal;
    }
}

// ==================== PHOTO UPLOADS REGISTRY ====================
function initPhotoUploads() {
    const custPhotoUpload = document.getElementById("cust-photo-upload");
    const custPhotoPreview = document.getElementById("cust-photo-preview");
    if (custPhotoUpload && custPhotoPreview) {
        custPhotoUpload.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                openCropModal(file, 'cust');
            } else {
                currentUploadedCustPhoto = "";
                custPhotoPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
            }
        });
    }

    const goldPhotoUpload = document.getElementById("gold-photo-upload");
    const goldPhotoPreview = document.getElementById("gold-photo-preview");
    if (goldPhotoUpload && goldPhotoPreview) {
        goldPhotoUpload.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async function(event) {
                    const compressed = await compressBase64Image(event.target.result, false);
                    currentUploadedGoldPhoto = compressed;
                    goldPhotoPreview.innerHTML = `<img src="${compressed}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                };
                reader.readAsDataURL(file);
            } else {
                currentUploadedGoldPhoto = "";
                goldPhotoPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
            }
        });
    }

    const masterCustPhotoUpload = document.getElementById("m-cust-photo-upload");
    const masterCustPhotoPreview = document.getElementById("m-cust-photo-preview");
    if (masterCustPhotoUpload && masterCustPhotoPreview) {
        masterCustPhotoUpload.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                openCropModal(file, 'master-cust');
            } else {
                currentUploadedMasterCustPhoto = "";
                masterCustPhotoPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Photo Selected</span>`;
            }
        });
    }
}

function openPrintModal(loanId) {
    currentPrintLoanId = loanId;
    const loan = state.loans.find(l => l.id === loanId);
    
    const btnSingle = document.getElementById("btn-print-single-a4");
    const btnThree = document.getElementById("btn-print-three-in-one");
    
    if (loan) {
        const is3553 = (loan.productCode === "GOD-3553" || loan.productCode === "3553");
        if (btnSingle) {
            btnSingle.classList.remove("hidden");
        }
        if (btnThree) {
            if (is3553) {
                btnThree.classList.add("hidden");
            } else {
                btnThree.classList.remove("hidden");
            }
        }
    }

    const modal = document.getElementById("print-modal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

function closePrintModal() {
    const modal = document.getElementById("print-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
    currentPrintLoanId = null;
}

function initPrintModal() {
    const closeBtn = document.getElementById("close-print-modal-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", closePrintModal);
    }

    const modal = document.getElementById("print-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closePrintModal();
            }
        });
    }

    document.getElementById("btn-print-single-a4").addEventListener("click", () => {
        if (currentPrintLoanId) {
            printVoucher(currentPrintLoanId, "single");
            closePrintModal();
        }
    });

    const btnThree = document.getElementById("btn-print-three-in-one");
    if (btnThree) {
        btnThree.addEventListener("click", () => {
            if (currentPrintLoanId) {
                printVoucher(currentPrintLoanId, "three-in-one");
                closePrintModal();
            }
        });
    }

    document.getElementById("btn-print-application-form").addEventListener("click", () => {
        if (currentPrintLoanId) {
            printVoucher(currentPrintLoanId, "application_form");
            closePrintModal();
        }
    });
}

// ==================== CUSTOMER MASTER DATABASE CRUD ====================
function renderCustomerMasterList() {
    const tbody = document.getElementById("customer-list-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const query = document.getElementById("customer-dir-search").value.toLowerCase();

    const filtered = state.customers.filter(c => {
        return !query || 
            c.custNo.toLowerCase().includes(query) || 
            c.name.toLowerCase().includes(query) || 
            c.mobile.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No customers found.</td></tr>`;
        return;
    }

    filtered.forEach(c => {
        const photoHtml = c.photo 
            ? `<img src="${c.photo}" style="width:35px; height:35px; object-fit:cover; border-radius:50%; border:1px solid #ddd;" />`
            : `<div style="width:35px; height:35px; border-radius:50%; background:#eee; display:flex; align-items:center; justify-content:center;"><i class="fa-regular fa-user" style="font-size:12px; color:#999;"></i></div>`;
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="text-center">${photoHtml}</td>
            <td><strong>${c.custNo}</strong>${c.memberNo && c.memberNo !== "-" ? `<br><small class="text-muted">Mem: ${c.memberNo}</small>` : ""}</td>
            <td>${c.name}</td>
            <td>${c.mobile}</td>
            <td>${c.nomineeName || "-"} <br><small class="text-muted">${c.nomineeRelation || ""}</small></td>
            <td>
                <div class="action-group">
                    <button class="btn-icon btn-icon-green" onclick="editCustomerProfile('${c.custNo}')" title="Edit">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteCustomerProfile('${c.custNo}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function initCustomerMasterForm() {
    const form = document.getElementById("customer-master-form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const editId = document.getElementById("edit-customer-id").value;
        const custNo = document.getElementById("m-cust-no").value.trim();
        const memberNo = document.getElementById("m-cust-member-no").value.trim() || "-";
        const name = document.getElementById("m-cust-name").value.trim();
        const address = document.getElementById("m-cust-address").value.trim();
        const savingsAc = document.getElementById("m-cust-savings-ac").value.trim();
        const age = parseInt(document.getElementById("m-cust-age").value);
        const occupation = document.getElementById("m-cust-occupation").value.trim();
        const religion = document.getElementById("m-cust-religion").value.trim();
        const caste = document.getElementById("m-cust-caste").value.trim() || "-";
        const mobile = document.getElementById("m-cust-mobile").value.trim();
        const nomineeName = document.getElementById("m-cust-nominee-name").value.trim();
        const nomineeRelation = document.getElementById("m-cust-nominee-relation").value.trim();

        if (!editId) {
            const exists = state.customers.some(c => c.custNo === custNo);
            if (exists) {
                alert("Error: A customer with this Customer Number already exists!");
                return;
            }
        }

        const customerObj = {
            custNo,
            memberNo,
            name,
            address,
            savingsAc,
            age,
            occupation,
            religion,
            caste,
            mobile,
            nomineeName,
            nomineeRelation,
            photo: currentUploadedMasterCustPhoto
        };

        if (editId) {
            const index = state.customers.findIndex(c => c.custNo === editId);
            if (index !== -1) {
                if (editId !== custNo && state.customers.some(c => c.custNo === custNo)) {
                    alert("Error: The new Customer Number already exists!");
                    return;
                }
                state.customers[index] = customerObj;
                alert("Customer profile updated successfully.");
            }
        } else {
            state.customers.push(customerObj);
            alert("Customer profile registered successfully.");
        }

        saveState();
        resetCustomerMasterForm();
        renderCustomerMasterList();
    });

    const cancelBtn = document.getElementById("customer-cancel-edit-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", resetCustomerMasterForm);
    }

    const customerSearch = document.getElementById("customer-dir-search");
    if (customerSearch) {
        customerSearch.addEventListener("input", renderCustomerMasterList);
    }
}

function resetCustomerMasterForm() {
    const form = document.getElementById("customer-master-form");
    if (form) form.reset();
    document.getElementById("edit-customer-id").value = "";
    document.getElementById("customer-form-title").textContent = "Register New Customer";
    document.getElementById("customer-save-btn").innerHTML = '<i class="fa-solid fa-save"></i> Save Customer Profile';
    document.getElementById("customer-cancel-edit-btn").classList.add("hidden");
    document.getElementById("m-cust-no").disabled = false;
    currentUploadedMasterCustPhoto = "";
    document.getElementById("m-cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Photo Selected</span>`;
}

function editCustomerProfile(custNo) {
    const customer = state.customers.find(c => c.custNo === custNo);
    if (!customer) return;

    document.getElementById("edit-customer-id").value = customer.custNo;
    document.getElementById("m-cust-no").value = customer.custNo;
    document.getElementById("m-cust-no").disabled = true;
    document.getElementById("m-cust-member-no").value = customer.memberNo && customer.memberNo !== "-" ? customer.memberNo : "";

    document.getElementById("m-cust-name").value = customer.name || "";
    document.getElementById("m-cust-address").value = customer.address || "";
    document.getElementById("m-cust-savings-ac").value = customer.savingsAc || "";
    document.getElementById("m-cust-age").value = customer.age || "";
    document.getElementById("m-cust-occupation").value = customer.occupation || "";
    document.getElementById("m-cust-religion").value = customer.religion || "";
    document.getElementById("m-cust-caste").value = customer.caste || "";
    document.getElementById("m-cust-mobile").value = customer.mobile || "";
    document.getElementById("m-cust-nominee-name").value = customer.nomineeName || "";
    document.getElementById("m-cust-nominee-relation").value = customer.nomineeRelation || "";

    if (customer.photo) {
        currentUploadedMasterCustPhoto = customer.photo;
        document.getElementById("m-cust-photo-preview").innerHTML = `<img src="${customer.photo}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
    } else {
        currentUploadedMasterCustPhoto = "";
        document.getElementById("m-cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Photo Selected</span>`;
    }

    document.getElementById("customer-form-title").textContent = "Edit Customer Profile";
    document.getElementById("customer-save-btn").innerHTML = '<i class="fa-solid fa-check"></i> Update Customer Profile';
    document.getElementById("customer-cancel-edit-btn").classList.remove("hidden");
}

function deleteCustomerProfile(custNo) {
    if (confirm(`Are you sure you want to delete the profile for customer #${custNo}?`)) {
        state.customers = state.customers.filter(c => c.custNo !== custNo);
        saveState();
        renderCustomerMasterList();
    }
}

function upsertCustomerFromForm() {
    const custNo = document.getElementById("cust-no").value.trim();
    if (!custNo) return;

    const customerObj = {
        custNo: custNo,
        memberNo: document.getElementById("member-no").value.trim() || "-",
        name: document.getElementById("cust-name").value.trim(),
        address: document.getElementById("cust-address").value.trim(),
        savingsAc: document.getElementById("cust-savings-ac").value.trim(),
        age: parseInt(document.getElementById("cust-age").value) || 0,
        occupation: document.getElementById("cust-occupation").value.trim(),
        religion: document.getElementById("cust-religion").value.trim(),
        caste: document.getElementById("cust-caste").value.trim() || "-",
        mobile: document.getElementById("cust-mobile").value.trim(),
        nomineeName: document.getElementById("cust-nominee-name").value.trim(),
        nomineeRelation: document.getElementById("cust-nominee-relation").value.trim(),
        photo: currentUploadedCustPhoto
    };

    const index = state.customers.findIndex(c => c.custNo === custNo);
    if (index !== -1) {
        if (!customerObj.photo && state.customers[index].photo) {
            customerObj.photo = state.customers[index].photo;
        }
        state.customers[index] = customerObj;
    } else {
        state.customers.push(customerObj);
    }
    saveState();
}

// ==================== PENDING CUST NO REMINDER SYSTEM ====================
function checkPendingCustomerNumbers() {
    if (!state.currentSession) return;
    const branchCode = state.currentSession.code;
    
    // Check pending loans for current branch where custNo is empty
    const pendingLoans = state.loans.filter(l => l.branchCode === branchCode && (!l.custNo || l.custNo.trim() === ""));
    
    const reminderNav = document.getElementById("pending-reminder-nav");
    if (pendingLoans.length > 0) {
        if (reminderNav) {
            reminderNav.classList.remove("hidden");
            reminderNav.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ff9800;"></i> Pending Cust Nos (${pendingLoans.length})`;
        }
        
        // Show reminder modal automatically once per session
        if (!sessionStorage.getItem("jccb_reminder_shown")) {
            openPendingReminderModal();
            sessionStorage.setItem("jccb_reminder_shown", "true");
        }
    } else {
        if (reminderNav) {
            reminderNav.classList.add("hidden");
        }
        closePendingReminderModal();
    }
}

function openPendingReminderModal() {
    if (!state.currentSession) return;
    const branchCode = state.currentSession.code;
    const pendingLoans = state.loans.filter(l => l.branchCode === branchCode && (!l.custNo || l.custNo.trim() === ""));
    
    const tbody = document.getElementById("reminder-list-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    if (pendingLoans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 15px; color: #999;">No pending entries! All customer numbers are entered.</td></tr>`;
        const reminderNav = document.getElementById("pending-reminder-nav");
        if (reminderNav) reminderNav.classList.add("hidden");
        closePendingReminderModal();
        return;
    }
    
    pendingLoans.forEach(loan => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        tr.innerHTML = `
            <td style="padding: 8px 12px;">${formatDateDMY(loan.date)}</td>
            <td style="padding: 8px 12px;"><strong>${loan.accountNo}</strong></td>
            <td style="padding: 8px 12px;">${loan.borrowerName}</td>
            <td style="padding: 8px 12px; text-align: center;">
                <button class="btn btn-primary btn-sm" onclick="editLoanFromReminder('${loan.id}')" style="padding: 4px 10px; font-size: 11px;">
                    <i class="fa-solid fa-pencil"></i> Edit & Add
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    const modal = document.getElementById("reminder-modal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

function closePendingReminderModal() {
    const modal = document.getElementById("reminder-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

function editLoanFromReminder(loanId) {
    closePendingReminderModal();
    editLoanRecord(loanId);
    setTimeout(() => {
        const custNoInput = document.getElementById("cust-no");
        if (custNoInput) {
            custNoInput.focus();
            custNoInput.style.border = "2px solid #ff9800";
            custNoInput.style.boxShadow = "0 0 10px rgba(255, 152, 0, 0.5)";
            custNoInput.addEventListener("focusout", () => {
                custNoInput.style.border = "";
                custNoInput.style.boxShadow = "";
            }, { once: true });
        }
    }, 150);
}

function initPendingReminder() {
    const closeBtn = document.getElementById("close-reminder-modal-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", closePendingReminderModal);
    }
    
    const closeBtn2 = document.getElementById("btn-reminder-close");
    if (closeBtn2) {
        closeBtn2.addEventListener("click", closePendingReminderModal);
    }

    const modal = document.getElementById("reminder-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closePendingReminderModal();
            }
        });
    }

    const navBtn = document.getElementById("pending-reminder-nav");
    if (navBtn) {
        navBtn.addEventListener("click", () => {
            openPendingReminderModal();
        });
    }
}

window.editLoanFromReminder = editLoanFromReminder;
window.openPendingReminderModal = openPendingReminderModal;
window.printVoucher = printVoucher;
window.deleteLoanRecord = deleteLoanRecord;
window.editLoanRecord = editLoanRecord;
window.deleteBranch = deleteBranch;
window.deleteValuer = deleteValuer;
window.openPrintModal = openPrintModal;
window.closePrintModal = closePrintModal;
window.editCustomerProfile = editCustomerProfile;
window.deleteCustomerProfile = deleteCustomerProfile;

// ==================== BACKUP CENTER INITIALIZATION ====================
function initBackupCenter() {
    const btnSelect = document.getElementById("btn-ho-backup-select");
    const btnManual = document.getElementById("btn-ho-backup-manual");

    if (btnSelect) {
        btnSelect.addEventListener("click", async () => {
            if (savedDirHandle) {
                const permission = await savedDirHandle.queryPermission({ mode: 'readwrite' });
                if (permission !== 'granted') {
                    const req = await savedDirHandle.requestPermission({ mode: 'readwrite' });
                    if (req === 'granted') {
                        updateBackupUI(savedDirHandle.name, false);
                        await backupAllBranchesData(false);
                        return;
                    }
                }
            }
            await selectNewBackupFolder();
        });
    }

    if (btnManual) {
        btnManual.addEventListener("click", async () => {
            await backupAllBranchesData(false);
        });
    }

    loadSavedBackupHandle();
    initAutoBackupScheduler();
}

// ==================== DATABASE BACKUP & RESTORE SYSTEMS ====================
function initBackupRestoreView() {
    const btnExport = document.getElementById("btn-export-backup-excel");
    const btnImport = document.getElementById("btn-import-restore-excel");
    const fileInput = document.getElementById("restore-excel-file");

    if (btnExport) {
        btnExport.addEventListener("click", () => {
            exportFullBackupToExcel();
        });
    }

    if (btnImport) {
        btnImport.addEventListener("click", () => {
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                alert("મહેરબાની કરીને રીસ્ટોર કરવા માટે બેકઅપ એક્સેલ ફાઈલ (.xlsx) પસંદ કરો.");
                return;
            }
            const file = fileInput.files[0];
            const confirmRestore = confirm("ચેતવણી: શું તમે ખરેખર આ બેકઅપ ફાઈલમાંથી રીસ્ટોર કરવા માંગો છો?\n\nઆનાથી ચાલુ સીસ્ટમનો બધો ડેટા નાશ પામશે અને ફાઈલમાંનો નવો ડેટા સેટ થઈ જશે.");
            if (confirmRestore) {
                importFullBackupFromExcel(file);
            }
        });
    }
}

function exportFullBackupToExcel() {
    try {
        showSync();
        // 1. Branches Sheet
        const branchesData = state.branches.map(b => ({
            "Branch Code": b.code,
            "Branch Name": b.name
        }));

        // 2. Valuers Sheet
        const valuersData = state.valuers.map(v => ({
            "Valuer ID": v.id,
            "Valuer Name": v.name,
            "Mobile": v.mobile,
            "Address": v.address,
            "Savings A/c": v.savingsAc
        }));

        // 3. Products Sheet
        const productsData = state.products.map(p => ({
            "Product ID": p.id,
            "Product Code": p.code,
            "Min Amount": p.minAmt,
            "Max Amount": p.maxAmt,
            "Interest Rate": p.rate,
            "Description": p.desc
        }));

        // 4. Seeds Sheet (crucial for maintaining sequence during backup/restore)
        const seedsData = [];
        state.branches.forEach(b => {
            const bCode = b.code;
            const pSeed = (state.lastPacketSeed && state.lastPacketSeed[bCode]) || 100;
            state.products.forEach(p => {
                const pCode = p.code;
                const aSeed = (state.accountSeeds && state.accountSeeds[bCode] && state.accountSeeds[bCode][pCode]) || DEFAULT_ACCOUNT_SEEDS[pCode] || 1001;
                seedsData.push({
                    "Branch Code": bCode,
                    "Product Code": pCode,
                    "Account Seed": aSeed,
                    "Last Packet Seed": pSeed
                });
            });
        });

        // 5. Loans Sheet
        const loansData = state.loans.map(l => ({
            "ID": l.id,
            "Date": l.date || "",
            "Branch Code": l.branchCode || "",
            "Branch Name": l.branchName || "",
            "Loan Status": l.loanStatus || "",
            "Unique Proposal No": l.uniqueProposalNo || "",
            "Is Member": l.isMember || "No",
            "Member No": l.memberNo || "-",
            "Is New Member": l.isNewMember ? "true" : "false",
            "Packet No": l.packetNo || "",
            "Valuer ID": l.valuerId || "",
            "Borrower Name": l.borrowerName || "",
            "Loan Amount": l.loanAmount || 0,
            "Product Code": l.productCode || "",
            "Account No": l.accountNo || "",
            "Interest Rate": l.interestRate || "",
            "Gold Weight (Gross)": l.goldWeightGross || l.goldWeight || 0,
            "Gold Weight (Net)": l.goldWeight || 0,
            "Gold Weight (Fine)": l.goldWeightFine || 0,
            "Ornaments Desc": l.ornamentsDesc || "",
            "Market Rate": l.marketRate || 0,
            "Market Value": l.marketValue || 0,
            "Eligible Amount": l.eligibleAmount || 0,
            "Customer ID": l.custNo || "",
            "Address": l.custAddress || "",
            "Savings A/c": l.custSavingsAc || "",
            "Age": l.custAge || 0,
            "Occupation": l.custOccupation || "",
            "Religion": l.custReligion || "",
            "Caste": l.custCaste || "",
            "Mobile": l.custMobile || "",
            "Nominee Name": l.custNomineeName || "",
            "Nominee Relation": l.custNomineeRelation || "",
            "Loan Purpose": l.loanPurpose || "",
            "Share A": l.shareA || 0,
            "Share B": l.shareB || 0,
            "Member Fee": l.memberFee || 0,
            "Valuation Charge": l.valuationCharge || 0,
            "Stamp Duty": l.stampCharge || 0,
            "Service Charge": l.serviceCharge || 0,
            "Doc Charge": l.docCharge || 0,
            "Insurance": l.insCharge || 0,
            "CGST": l.cgst || 0,
            "SGST": l.sgst || 0,
            "Adjustment": l.adjustment || 0,
            "Total Charges": l.totalCharges || 0,
            "Net Disbursal": l.netDisbursal || 0
        }));

        // 5. Customers Sheet
        const customersData = state.customers.map(c => ({
            "Customer ID": c.custNo,
            "Member No": c.memberNo || "-",
            "Name": c.name || "",
            "Address": c.address || "",
            "Savings A/c": c.savingsAc || "",
            "Age": c.age || 0,
            "Occupation": c.occupation || "",
            "Religion": c.religion || "",
            "Caste": c.caste || "",
            "Mobile": c.mobile || "",
            "Nominee Name": c.nomineeName || "",
            "Nominee Relation": c.nomineeRelation || ""
        }));

        // 6. Gold Rates Sheet
        const goldRatesData = Object.keys(state.goldRates).map(dateStr => ({
            "Date": dateStr,
            "Rate": state.goldRates[dateStr]
        }));

        // 7. Seeds Sheet
        const wb = XLSX.utils.book_new();
        function appendSheet(dataArray, sheetName) {
            const ws = XLSX.utils.json_to_sheet(dataArray);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
        
        appendSheet(branchesData, "Branches");
        appendSheet(valuersData, "Valuers");
        appendSheet(productsData, "Products");
        appendSheet(seedsData, "Seeds");
        appendSheet(loansData, "Loans");
        appendSheet(customersData, "Customers");
        appendSheet(goldRatesData, "GoldRates");
        
        // 8. Photos Sheet
        const photosData = [];
        state.customers.forEach(c => {
            if (c.photo) {
                const chunks = c.photo.match(/.{1,30000}/g) || [];
                const row = { "Key ID": c.custNo, "Type": "customer_master" };
                chunks.forEach((chunk, i) => { row[`Chunk ${i+1}`] = chunk; });
                photosData.push(row);
            }
        });
        state.loans.forEach(l => {
            if (l.custPhoto) {
                const chunks = l.custPhoto.match(/.{1,30000}/g) || [];
                const row = { "Key ID": l.id, "Type": "borrower_loan" };
                chunks.forEach((chunk, i) => { row[`Chunk ${i+1}`] = chunk; });
                photosData.push(row);
            }
            if (l.goldPhoto) {
                const chunks = l.goldPhoto.match(/.{1,30000}/g) || [];
                const row = { "Key ID": l.id, "Type": "ornaments_loan" };
                chunks.forEach((chunk, i) => { row[`Chunk ${i+1}`] = chunk; });
                photosData.push(row);
            }
        });
        
        appendSheet(photosData, "Photos");

        const timestamp = getTodayDateStr() + "_" + Date.now();
        const filename = `JCCB_GoldLoan_Backup_${timestamp}.xlsx`;

        XLSX.writeFile(wb, filename);
        alert("બેકઅપ એક્સેલ ફાઈલ સફળતાપૂર્વક ડાઉનલોડ થઈ ગઈ છે!");
    } catch (e) {
        console.error("Backup export failed", e);
        alert("બેકઅપ ડાઉનલોડ કરવામાં ખામી આવી: " + e.message);
    } finally {
        hideSync();
    }
}

function compressBase64Image(base64Str, isSquare) {
    return new Promise((resolve) => {
        if (!base64Str || !base64Str.startsWith("data:image")) {
            resolve(base64Str);
            return;
        }
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            let width = img.width;
            let height = img.height;
            
            if (isSquare) {
                width = 150;
                height = 150;
            } else {
                const maxDim = 250;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
            resolve(compressedBase64);
        };
        img.onerror = function() {
            resolve(base64Str);
        };
        img.src = base64Str;
    });
}

function importFullBackupFromExcel(file) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            showSync();
            const data = new Uint8Array(e.target.result);
            // Use improved options: cellDates for proper date parsing, raw:false for formatted values
            const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false, dense: false });

            // Log all detected sheets for debugging
            console.log("📋 Detected sheets in backup file:", workbook.SheetNames);

            if (!workbook.Sheets["Branches"] || !workbook.Sheets["Loans"] || !workbook.Sheets["Products"]) {
                throw new Error("પસંદ કરેલ ફાઇલ JCCB ગોલ્ડ લોન બેકઅપ ફાઇલ નથી અથવા તેમાં જરૂરી સીટો ગેરહાજર છે. Available sheets: " + workbook.SheetNames.join(", "));
            }

            function getSheetJSON(sheetName) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) return [];
                return XLSX.utils.sheet_to_json(sheet);
            }

            // Parse & Compress Photos on the fly
            const photosRows = getSheetJSON("Photos");
            const photosMap = {};
            
            for (const row of photosRows) {
                const key = row["Key ID"] + "_" + row["Type"];
                let base64 = "";
                let index = 1;
                while (row[`Chunk ${index}`] !== undefined) {
                    base64 += row[`Chunk ${index}`];
                    index++;
                }
                const isSquare = (row["Type"] === "customer_master" || row["Type"] === "borrower_loan");
                try {
                    photosMap[key] = await compressBase64Image(base64, isSquare);
                } catch (err) {
                    photosMap[key] = base64;
                }
            }

            // Parse Branches
            const branchesRows = getSheetJSON("Branches");
            if (branchesRows.length === 0) throw new Error("Branches sheet is empty or missing.");
            const importedBranches = branchesRows.map(r => ({
                code: String(r["Branch Code"] || "").padStart(2, '0'),
                name: r["Branch Name"] || ""
            }));

            // Parse Valuers
            const valuersRows = getSheetJSON("Valuers");
            const importedValuers = valuersRows.map(r => ({
                id: r["Valuer ID"] || ("valuer_" + Date.now() + Math.random()),
                name: r["Valuer Name"] || "",
                mobile: String(r["Mobile"] || ""),
                address: r["Address"] || "",
                savingsAc: String(r["Savings A/c"] || "")
            }));
            alert("DEBUG: Parsed " + importedValuers.length + " valuers from your Excel file!");

            // Parse Products
            const productsRows = getSheetJSON("Products");
            const importedProducts = productsRows.map(r => ({
                id: r["Product ID"] || ("prod_" + Date.now() + Math.random()),
                code: r["Product Code"] || "",
                minAmt: parseFloat(r["Min Amount"]) || 0,
                maxAmt: parseFloat(r["Max Amount"]) || 0,
                rate: parseFloat(r["Interest Rate"]) || 0,
                desc: r["Description"] || ""
            }));

            // Parse Customers
            const customersRows = getSheetJSON("Customers");
            const importedCustomers = customersRows.map(r => {
                const custNo = String(r["Customer ID"]);
                const photoKey = custNo + "_customer_master";
                return {
                    custNo: custNo,
                    memberNo: r["Member No"] || "-",
                    name: r["Name"] || "",
                    address: r["Address"] || "",
                    savingsAc: String(r["Savings A/c"] || ""),
                    age: parseInt(r["Age"]) || 0,
                    occupation: r["Occupation"] || "",
                    religion: r["Religion"] || "",
                    caste: r["Caste"] || "",
                    mobile: String(r["Mobile"] || ""),
                    nomineeName: r["Nominee Name"] || "",
                    nomineeRelation: r["Nominee Relation"] || "",
                    photo: photosMap[photoKey] || ""
                };
            });

            // Parse Loans
            const loansRows = getSheetJSON("Loans");
            const importedLoans = loansRows.map(r => {
                const loanId = String(r["ID"]);
                const custPhotoKey = loanId + "_borrower_loan";
                const goldPhotoKey = loanId + "_ornaments_loan";
                return {
                    id: loanId,
                    date: r["Date"] || "",
                    branchCode: String(r["Branch Code"] || "").padStart(2, '0'),
                    branchName: r["Branch Name"] || "",
                    loanStatus: r["Loan Status"] || "",
                    uniqueProposalNo: r["Unique Proposal No"] || "",
                    isMember: r["Is Member"] || "No",
                    memberNo: r["Member No"] || "-",
                    isNewMember: String(r["Is New Member"]) === "true" || r["Is New Member"] === true,
                    packetNo: String(r["Packet No"] || ""),
                    valuerId: r["Valuer ID"] || "",
                    borrowerName: r["Borrower Name"] || "",
                    loanAmount: parseFloat(r["Loan Amount"]) || 0,
                    productCode: r["Product Code"] || "",
                    accountNo: r["Account No"] || "",
                    interestRate: r["Interest Rate"] || "",
                    goldWeightGross: parseFloat(r["Gold Weight (Gross)"]) || parseFloat(r["Gold Weight"]) || 0,
                    goldWeightFine: parseFloat(document.getElementById("gold-weight-fine") ? document.getElementById("gold-weight-fine").value : 0) || 0,
                    goldWeight: parseFloat(r["Gold Weight (Net)"]) || parseFloat(r["Gold Weight"]) || 0,
                    goldWeightFine: parseFloat(r["Gold Weight (Fine)"]) || 0,
                    ornamentsDesc: r["Ornaments Desc"] || "",
                    marketRate: parseFloat(r["Market Rate"]) || 0,
                    marketValue: parseFloat(r["Market Value"]) || 0,
                    eligibleAmount: parseFloat(r["Eligible Amount"]) || 0,
                    custNo: String(r["Customer ID"] || ""),
                    custAddress: r["Address"] || "",
                    custSavingsAc: String(r["Savings A/c"] || ""),
                    custAge: parseInt(r["Age"]) || 0,
                    custOccupation: r["Occupation"] || "",
                    custReligion: r["Religion"] || "",
                    custCaste: r["Caste"] || "",
                    custMobile: String(r["Mobile"] || ""),
                    custNomineeName: r["Nominee Name"] || "",
                    custNomineeRelation: r["Nominee Relation"] || "",
                    loanPurpose: r["Loan Purpose"] || "",
                    shareA: parseFloat(r["Share A"]) || 0,
                    shareB: parseFloat(r["Share B"]) || 0,
                    memberFee: parseFloat(r["Member Fee"]) || 0,
                    valuationCharge: parseFloat(r["Valuation Charge"]) || 0,
                    stampCharge: parseFloat(r["Stamp Duty"]) || 0,
                    serviceCharge: parseFloat(r["Service Charge"]) || 0,
                    docCharge: parseFloat(r["Doc Charge"]) || 0,
                    insCharge: parseFloat(r["Insurance"]) || 0,
                    cgst: parseFloat(r["CGST"]) || 0,
                    sgst: parseFloat(r["SGST"]) || 0,
                    adjustment: parseFloat(r["Adjustment"]) || 0,
                    totalCharges: parseFloat(r["Total Charges"]) || 0,
                    netDisbursal: parseFloat(r["Net Disbursal"]) || 0,
                    custPhoto: photosMap[custPhotoKey] || "",
                    goldPhoto: photosMap[goldPhotoKey] || ""
                };
            });

            // Parse Gold Rates
            const goldRatesRows = getSheetJSON("GoldRates");
            const importedGoldRates = {};
            goldRatesRows.forEach(r => {
                if (r["Date"] && r["Rate"] !== undefined) {
                    importedGoldRates[r["Date"]] = parseInt(r["Rate"]);
                }
            });

            // Parse Seeds
            const seedsRows = getSheetJSON("Seeds");
            const importedAccountSeeds = {};
            const importedLastPacketSeed = {};
            seedsRows.forEach(r => {
                const bCode = String(r["Branch Code"] || "").padStart(2, '0');
                const pCode = r["Product Code"];
                const accSeed = r["Account Seed"];
                const pktSeed = r["Last Packet Seed"];

                if (bCode) {
                    if (!importedAccountSeeds[bCode]) {
                        importedAccountSeeds[bCode] = {};
                    }
                    if (pCode && pCode !== "-") {
                        importedAccountSeeds[bCode][pCode] = parseInt(accSeed) || 1001;
                    }
                    if (pktSeed && pktSeed !== "-") {
                        importedLastPacketSeed[bCode] = parseInt(pktSeed) || 100;
                    }
                }
            });

            // Apply to global state
            state.branches = importedBranches;
            state.valuers = importedValuers;
            state.products = importedProducts;
            state.customers = importedCustomers;
            state.loans = importedLoans;
            state.goldRates = importedGoldRates;
            state.accountSeeds = importedAccountSeeds;
            state.lastPacketSeed = importedLastPacketSeed;

            // Pre-save all photos to localStorage BEFORE calling saveState
            // (saveState strips photos from Firebase to stay under the 1MB limit)
            const photosStore = {};
            importedLoans.forEach(l => {
                if (l.custPhoto) photosStore[l.id + "_cust"] = l.custPhoto;
                if (l.goldPhoto) photosStore[l.id + "_gold"] = l.goldPhoto;
            });
            importedCustomers.forEach(c => {
                if (c.photo) photosStore["cust_" + c.custNo] = c.photo;
            });
            try {
                localStorage.setItem("jccb_photos", JSON.stringify(photosStore));
            } catch(le) {
                console.warn("localStorage full, some photos may not be saved locally:", le);
            }

            // Sync with Firebase (throwOnError = true to catch failures)
            await saveState(false, true);

            alert("ડેટાબેઝ સફળતાપૂર્વક રીસ્ટોર થઈ ગયો છે! પોર્ટલ હવે રીલોડ થશે.");
            location.reload();
        } catch (e) {
            alert("DEBUG ERROR IN RESTORE: " + e.message + "\n" + e.stack);
            console.error("Restore failed", e);
            alert("રીસ્ટોર કરવામાં ખામી આવી: " + e.message);
        } finally {
            hideSync();
        }
    };
    reader.readAsArrayBuffer(file);
}

window.exportFullBackupToExcel = exportFullBackupToExcel;
window.importFullBackupFromExcel = importFullBackupFromExcel;
window.printSingleLoanExpenseVouchers = printSingleLoanExpenseVouchers;

function initDeleteAllLoansHandler() {
    const deleteAllBtn = document.getElementById("delete-all-loans-btn");
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", () => {
            if (state.currentSession.code !== "99") {
                alert("Permission Denied: Only Head Office can delete all loan records.");
                return;
            }
            const confirm1 = confirm("Warning: Are you sure you want to permanently delete all loan records across all branches?\n\nઆ ઓપરેશનથી તમામ બ્રાંચનો બધો લોન ડેટા કાયમ માટે નાશ પામશે!");
            if (!confirm1) return;
            const confirm2 = confirm("Final Confirmation: This action is irreversible! Are you absolutely sure you want to delete all loan data?");
            if (!confirm2) return;

            state.loans = [];
            renderLoanRegister();
            updateDashboardStats();
            
            saveState(true); // Sync in background
            alert("તમામ લોન રેકોર્ડ સફળતાપૂર્વક ડીલીટ કરવામાં આવ્યા છે.");
        });
    }
}

// ==================== APP INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
    // Synchronously initialize the UI first so it never hangs
    try { prepareEntryForm(); } catch (e) { console.error("prepareEntryForm failed:", e); }
    try { initTabs(); } catch (e) { console.error("initTabs failed:", e); }
    try { initAuth(); } catch (e) { console.error("initAuth failed:", e); }
    
    // Load state asynchronously without blocking
    loadState().then(() => {
          // Re-run initAuth to update branches if they were fetched from the cloud
          try { initAuth(); } catch(e){}
          try { prepareEntryForm(); } catch(e){} // Re-run to apply loaded seeds
      }).catch(e => console.error(e));

    initFormSubmit();
    initPrintModal();
    initPhotoUploads();
    initCropperHandlers();
    initCustomerMasterForm();
    initBackupCenter();
    initBackupRestoreView();
    initDeleteAllLoansHandler();
    initPendingReminder();

    // Check localStorage directly for session (don't wait for async Firebase load)
    // This ensures the user stays logged in on page refresh
    let bootSession = null;
    try {
        const raw = localStorage.getItem("jccb_current_session");
        if (raw) bootSession = JSON.parse(raw);
    } catch(e) {}

    if (bootSession) {
        state.currentSession = bootSession;
        enterApp();
    } else {
        exitApp();
    }
});


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
                    const searchDate = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
                    const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    const rate = state.goldRates[searchDate];
                    if (rate) {
                        historyRateResult.innerHTML = `Gold Rate on ${displayDate}: <strong>₹${rate.toLocaleString("en-IN")}</strong> per 10g`;
                    } else {
                        historyRateResult.innerHTML = `<span style='color:red'>No gold rate recorded for ${displayDate}</span>`;
                    }
                }
            });
        }
    }, 1000);
});

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
        let fineValWt = 0;
        if(orn.net && orn.carat) {
            fineValWt = (orn.net * orn.carat) / 22;
            if(goldRate) {
                fineVal = fineValWt * (goldRate / 10);
            }
        }
        orn.fineValue = fineVal;
        orn.fineValWt = fineValWt;
        
        totalGross += orn.gross || 0;
        totalNet += orn.net || 0;
        totalFineValue += fineVal;
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align:center; padding: 12px 6px;">${index + 1}</td>
            <td style="padding: 12px 6px;"><input type="text" class="orn-detail" value="${orn.detail || ''}" style="width:100%; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;"><input type="number" class="orn-qty" value="${orn.qty || ''}" style="width:65px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;"><input type="number" class="orn-gross" step="0.001" value="${orn.gross || ''}" style="width:85px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;"><input type="number" class="orn-net" step="0.001" value="${orn.net || ''}" style="width:85px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;" required></td>
            <td style="padding: 12px 6px;">
                <select class="orn-carat" style="width:65px; padding:8px 6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;">
                    <option value="16" ${orn.carat == 16 ? 'selected' : ''}>16</option>
                    <option value="17" ${orn.carat == 17 ? 'selected' : ''}>17</option>
                    <option value="18" ${orn.carat == 18 ? 'selected' : ''}>18</option>
                    <option value="19" ${orn.carat == 19 ? 'selected' : ''}>19</option>
                    <option value="20" ${orn.carat == 20 ? 'selected' : ''}>20</option>
                    <option value="21" ${orn.carat == 21 ? 'selected' : ''}>21</option>
                    <option value="22" ${orn.carat == 22 || !orn.carat ? 'selected' : ''}>22</option>
                </select>
            </td>
            <td class="orn-fine-wt-cell" style="padding: 12px 6px; text-align:center;">${fineValWt.toFixed(3)}</td>
            <td class="orn-fine-val-cell" style="text-align:right; font-weight:bold; color:#ff9800; padding: 12px 10px 12px 6px; font-size:15px;">₹${Math.round(fineVal).toLocaleString("en-IN")}</td>
            <td style="text-align:center; padding: 12px 6px;">
                <button type="button" class="btn-icon btn-icon-red orn-delete" data-index="${index}"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        
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
    let totalFineWt = 0;
    
    const goldRate = state.goldRates ? (state.goldRates[document.getElementById("loan-date").value] || 0) : 0;
    
    rows.forEach((tr, index) => {
        const orn = ornamentsList[index];
        if(!orn) return;
        
        let fineVal = 0;
        let fineValWt = 0;
        if(orn.net && orn.carat) {
            fineValWt = (orn.net * orn.carat) / 22;
            if(goldRate) {
                fineVal = fineValWt * (goldRate / 10);
            }
        }
        orn.fineValue = fineVal;
        orn.fineValWt = fineValWt;
        
        totalGross += orn.gross || 0;
        totalNet += orn.net || 0;
        totalFineValue += fineVal;
        totalFineWt += fineValWt;
        
        // Update the cells directly
        const fineWtCell = tr.querySelector('.orn-fine-wt-cell');
        if(fineWtCell) {
            fineWtCell.textContent = fineValWt.toFixed(3);
        }
        const fineCell = tr.querySelector('.orn-fine-val-cell');
        if(fineCell) {
            fineCell.textContent = "₹" + Math.round(fineVal).toLocaleString("en-IN");
        }
    });
    
    const tgEl = document.getElementById("orn-total-gross");
    if(tgEl) tgEl.textContent = totalGross.toFixed(3);
    const tnEl = document.getElementById("orn-total-net");
    if(tnEl) tnEl.textContent = totalNet.toFixed(3);
    const tfWtEl = document.getElementById("orn-total-fine-wt");
    if(tfWtEl) tfWtEl.textContent = totalFineWt.toFixed(3);
    const tfEl = document.getElementById("orn-total-fine");
    if(tfEl) {
        tfEl.innerHTML = "₹" + Math.round(totalFineValue).toLocaleString("en-IN");
    }
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
    // Start clock immediately so Date & Time is maintained
    if (typeof startClock === "function") {
        startClock();
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
    
    const loanDateInp = document.getElementById("loan-date");
    if(loanDateInp) {
        loanDateInp.addEventListener('change', () => {
            renderOrnamentsGrid();
        });
    }
    
    renderOrnamentsGrid();
});
// ----------------------------



function printVoucher3725(loanId) {
    try {
        const loan = state.loans.find(l => l.id === loanId);
        if (!loan) return;

        const printOverlay = document.getElementById("print-overlay");
        const printArea = document.getElementById("print-area");

        printOverlay.classList.add("active");

        const gujWords = numberToGujaratiWords(loan.loanAmount || 0);
        const marketVal = parseFloat(loan.marketValue) || 0;
        const ltv = marketVal > 0 ? Math.round((loan.loanAmount / marketVal) * 100) : 0;
        const gujNums = ['૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯', '૧૦'];
        const kfsDate = formatDateDMY(loan.date);
        const uniquePropNo = loan.uniqueProposalNo || `PROP/${loan.branchCode}/${getBranchLoanSerial(loan.id, loan.branchCode)}`;
        const tenureMonthsVal = loan.productCode && loan.productCode.includes("3527") ? (loan.tenureMonths || 36) : 12;

        let ornamentsRows = "";
        let totalQty = 0;
        let totalGross = 0;
        let totalNet = 0;
        let totalValue = 0;

        let orns = (loan.ornamentsList && Array.isArray(loan.ornamentsList)) ? loan.ornamentsList : [];
        for(let i=0; i<10; i++) {
            if(i < orns.length) {
                let o = orns[i];
                let rowValue = 0;
                
                let oGross = parseFloat(o.gross) || 0;
                let oNet = parseFloat(o.net) || 0;
                let oQty = parseInt(o.qty) || 0;
                let oCarat = parseFloat(o.carat) || 22;
                
                if (loan.marketRate) {
                    rowValue = (oNet * (oCarat / 24) * (loan.marketRate / 10));
                    totalValue += rowValue;
                }
                totalQty += oQty;
                totalGross += oGross;
                totalNet += oNet;

                let grossParts = oGross.toFixed(3).split(".");
                let grossG = grossParts[0] || "0";
                let grossMg = grossParts[1] ? grossParts[1].padEnd(3, '0') : "000";
                
                let netParts = oNet.toFixed(3).split(".");
                let netG = netParts[0] || "0";
                let netMg = netParts[1] ? netParts[1].padEnd(3, '0') : "000";

                ornamentsRows += `
                <tr style="border-bottom:1.5px solid #000000; height:20px;">
                    <td style="border-right:1.5px solid #000000; padding:2px; font-weight:700;">${gujNums[i] || (i+1)}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${o.detail || ''}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${oQty}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${grossG}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${grossMg}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${netG}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${netMg}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;">${oCarat}k</td>
                    <td style="padding:2px;">${Math.round(rowValue).toLocaleString("en-IN")}</td>
                </tr>`;
            } else {
                ornamentsRows += `
                <tr style="border-bottom:1.5px solid #000000; height:20px;">
                    <td style="border-right:1.5px solid #000000; padding:2px; font-weight:700;">${gujNums[i] || (i+1)}</td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                    <td style="padding:2px;"></td>
                </tr>`;
            }
        }

        let tGrossParts = totalGross.toFixed(3).split(".");
        let tGrossG = tGrossParts[0] || "0";
        let tGrossMg = tGrossParts[1] ? tGrossParts[1].padEnd(3, '0') : "000";

        let tNetParts = totalNet.toFixed(3).split(".");
        let tNetG = tNetParts[0] || "0";
        let tNetMg = tNetParts[1] ? tNetParts[1].padEnd(3, '0') : "000";

        ornamentsRows += `
        <tr style="font-weight:800; background-color:#f5f5f5; height:25px;">
            <td style="border-right:1.5px solid #000000; padding:2px;" colspan="2">કુલ (Total)</td>
            <td style="border-right:1.5px solid #000000; padding:2px;">${totalQty || ''}</td>
            <td style="border-right:1.5px solid #000000; padding:2px;">${totalGross > 0 ? tGrossG : ''}</td>
            <td style="border-right:1.5px solid #000000; padding:2px;">${totalGross > 0 ? tGrossMg : ''}</td>
            <td style="border-right:1.5px solid #000000; padding:2px;">${totalNet > 0 ? tNetG : ''}</td>
            <td style="border-right:1.5px solid #000000; padding:2px;">${totalNet > 0 ? tNetMg : ''}</td>
            <td style="border-right:1.5px solid #000000; padding:2px;"></td>
            <td style="padding:2px;">${Math.round(totalValue).toLocaleString("en-IN") || ''}</td>
        </tr>`;

        const valuer = state.valuers.find(v => v.id === loan.valuerId) || { name: loan.valuerId || 'VALUER NAME', savingsAc: "-" };

        let html = `
        <div class="print-voucher print-requisition-form" style="width:100%; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; color:#000000; background-color:#ffffff;">
            
            <!-- PAGE 1: NEW LAYOUT -->
            <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                <!-- Bank Letterhead -->
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                    <div style="flex: 0 0 55px;">
                        <img src="${LOGO_SRC}" alt="JCCB Logo" style="width: 55px; height: 55px; object-fit: contain; border-radius: 50%; border: 1.5px solid #000000;">
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <h1 style="font-size: 20px; font-weight: 800; color: #b30000; margin: 0 0 2px 0; letter-spacing: 0.5px; text-transform: uppercase;">Jamnagar Commercial Co-Op. Bank Ltd.</h1>
                        <h2 style="font-size: 13px; font-weight: 700; color: #000000; margin: 0 0 2px 0; letter-spacing: 0.2px;">(MULTI STATE SCHEDULED BANK)</h2>
                        <h3 style="font-size: 14px; font-weight: 700; color: #000000; margin: 0;">Branch: ${loan.branchName || ''}</h3>
                    </div>
                </div>

                <div style="text-align: center; margin-bottom: 8px; background-color: #f2f2f2; padding: 4px; border: 1px solid #000000; border-radius: 4px;">
                    <h2 style="font-size: 15px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Loan Requisition Form (GW-3725)</h2>
                </div>

                <table style="width: 100%; font-size: 12px; margin-bottom: 10px; border-collapse: collapse; border: 1.5px solid #000000;">
                    <tr>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; width: 25%; font-weight: 700;">Date</td>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1.5px solid #000000; width: 25%; font-weight: 800;">${formatDateDMY(loan.date)}</td>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; width: 25%; font-weight: 700;">Account No.</td>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; width: 25%; font-weight: 800;">${loan.accountNo || ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700;">Customer ID</td>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1.5px solid #000000; font-weight: 800;">${loan.custNo || ''}</td>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700;">Unique Prop No.</td>
                        <td style="padding: 3px 6px; border-bottom: 1px solid #000000; font-weight: 800;">${uniquePropNo}</td>
                    </tr>
                </table>

                <div style="display: flex; gap: 10px; margin-bottom: 10px; border: 1.5px solid #000000; padding: 6px; border-radius: 4px;">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; margin-bottom: 4px;"><span style="font-weight: 700;">Borrower Name:</span> <span style="font-weight: 800; font-size: 13px;">${loan.borrowerName || ''}</span></div>
                        <div style="font-size: 12px; margin-bottom: 4px;"><span style="font-weight: 700;">Address:</span> ${loan.address || ''}</div>
                        <div style="font-size: 12px; margin-bottom: 4px;"><span style="font-weight: 700;">Mobile No:</span> ${loan.mobileNo || ''}</div>
                        <div style="font-size: 12px; margin-bottom: 4px;"><span style="font-weight: 700;">PAN No:</span> ${loan.panNo || ''}</div>
                    </div>
                    <div style="width: 100px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 5px;">
                        <div style="width: 90px; height: 110px; border: 1.5px solid #000000; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: #f9f9f9; padding: 2px;">
                            ${loan.customerPhoto ? `<img src="${loan.customerPhoto}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : '<span style="font-size:10px; color:#666;">Photo</span>'}
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 10px;">
                    <h3 style="font-size: 13px; font-weight: 800; margin: 0 0 4px 0; background-color: #f2f2f2; padding: 3px 6px; border: 1px solid #000000; display: inline-block;">Loan Details</h3>
                    <table style="width: 100%; font-size: 12px; border-collapse: collapse; border: 1.5px solid #000000;">
                        <tr>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700; width: 25%;">Loan Amount</td>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1.5px solid #000000; font-weight: 800; width: 25%;">Rs. ${parseFloat(loan.loanAmount || 0).toLocaleString("en-IN")}</td>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700; width: 25%;">Interest Rate</td>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; width: 25%; font-weight: 800;">${loan.interestRate || ''}% p.a.</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 6px; border-right: 1px solid #000000; font-weight: 700; border-bottom: 1px solid #000000;">Amount in Words</td>
                            <td style="padding: 3px 6px; font-weight: 800; border-bottom: 1px solid #000000;" colspan="3">${gujWords}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 6px; border-right: 1px solid #000000; font-weight: 700;">Tenure</td>
                            <td style="padding: 3px 6px; border-right: 1.5px solid #000000; font-weight: 800;">${tenureMonthsVal} Months</td>
                            <td style="padding: 3px 6px; border-right: 1px solid #000000; font-weight: 700;">LTV</td>
                            <td style="padding: 3px 6px; font-weight: 800;">${ltv}%</td>
                        </tr>
                    </table>
                </div>

                <div style="font-size: 11px; margin-bottom: 15px; border: 1px solid #000000; padding: 6px; border-radius: 4px; background-color: #fdfdfd; line-height: 1.4;">
                    <p style="margin: 0 0 5px 0;"><strong>Declaration:</strong> I/We hereby request you to grant me/us a Gold Loan facility of Rs. <strong>${parseFloat(loan.loanAmount || 0).toLocaleString("en-IN")}</strong> against the pledge of gold ornaments detailed in this form.</p>
                    <p style="margin: 0;">I/We confirm that the ornaments pledged are my/our absolute property and are not subject to any prior charge or encumbrance. I/We have read, understood, and agree to abide by the terms and conditions of the Jamnagar Commercial Co-Op. Bank Ltd. governing this loan facility.</p>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; font-size: 12px; font-weight: 700; text-align: center;">
                    <div style="width: 30%;">
                        <div style="border-bottom: 1px dashed #000; margin-bottom: 4px; height: 1px;"></div>
                        <div>Signature of Valuer</div>
                    </div>
                    <div style="width: 30%;">
                        <div style="border-bottom: 1px dashed #000; margin-bottom: 4px; height: 1px;"></div>
                        <div>Signature of Borrower</div>
                    </div>
                    <div style="width: 30%;">
                        <div style="border-bottom: 1px dashed #000; margin-bottom: 4px; height: 1px;"></div>
                        <div>Authorised Signatory (Bank)</div>
                    </div>
                </div>
            </div>

            <!-- PAGE 2: VALUATION REPORT -->
            <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                    <div style="flex: 0 0 55px;">
                        <img src="${LOGO_SRC}" alt="JCCB Logo" style="width: 55px; height: 55px; object-fit: contain; border-radius: 50%; border: 1.5px solid #000000;">
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <h1 style="font-size: 20px; font-weight: 800; color: #b30000; margin: 0 0 2px 0; letter-spacing: 0.5px; text-transform: uppercase;">Jamnagar Commercial Co-Op. Bank Ltd.</h1>
                        <h3 style="font-size: 14px; font-weight: 700; color: #000000; margin: 0;">Branch: ${loan.branchName || ''}</h3>
                    </div>
                </div>
                
                <div style="text-align: center; margin-bottom: 8px; background-color: #f2f2f2; padding: 4px; border: 1px solid #000000; border-radius: 4px;">
                    <h2 style="font-size: 15px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Gold Valuation Report</h2>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <table style="flex: 1; font-size: 11.5px; border-collapse: collapse; border: 1.5px solid #000000;">
                        <tr>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700; width: 35%;">Borrower Name</td>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; font-weight: 800;">${loan.borrowerName || ''}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700;">Account No.</td>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; font-weight: 800;">${loan.accountNo || ''}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; border-right: 1px solid #000000; font-weight: 700;">Date of Valuation</td>
                            <td style="padding: 3px 6px; border-bottom: 1px solid #000000; font-weight: 800;">${formatDateDMY(loan.date)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 6px; border-right: 1px solid #000000; font-weight: 700;">Market Rate (10g)</td>
                            <td style="padding: 3px 6px; font-weight: 800;">Rs. ${parseFloat(loan.marketRate || 0).toLocaleString("en-IN")}</td>
                        </tr>
                    </table>
                    <div style="width: 130px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 5px;">
                        <div style="width: 120px; height: 95px; border: 1.5px solid #000000; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: #f9f9f9; padding: 2px;">
                            ${loan.goldPhoto ? `<img src="${loan.goldPhoto}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : '<span style="font-size:10px; color:#666;">Ornaments Photo</span>'}
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 15px; border: 1.5px solid #000000; border-radius: 2px; overflow: hidden;">
                    <table class="ornaments-table" style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:center;">
                        <thead>
                            <tr style="background-color:#f2f2f2; border-bottom:1.5px solid #000000;">
                                <th style="border-right:1.5px solid #000000; padding:4px 2px; font-weight:800; width:5%;" rowspan="2">ક્રમ</th>
                                <th style="border-right:1.5px solid #000000; padding:4px 2px; font-weight:800; width:22%;" rowspan="2">દાગીનાની વિગત</th>
                                <th style="border-right:1.5px solid #000000; padding:4px 2px; font-weight:800; width:7%;" rowspan="2">નંગ</th>
                                <th style="border-right:1.5px solid #000000; padding:4px 2px; font-weight:800; width:16%;" colspan="2">ગ્રોસ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:4px 2px; font-weight:800; width:16%;" colspan="2">નેટ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:4px 2px; font-weight:800; width:8%;" rowspan="2">કેરેટ</th>
                                <th style="padding:4px 2px; font-weight:800; width:15%;" rowspan="2">આશરે કિંમત (રૂ)</th>
                            </tr>
                            <tr style="background-color:#f2f2f2; border-bottom:1.5px solid #000000;">
                                <th style="border-right:1.5px solid #000000; border-top:1.5px solid #000000; padding:2px; font-weight:700;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; border-top:1.5px solid #000000; padding:2px; font-weight:700;">મી.ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; border-top:1.5px solid #000000; padding:2px; font-weight:700;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; border-top:1.5px solid #000000; padding:2px; font-weight:700;">મી.ગ્રામ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ornamentsRows}
                        </tbody>
                    </table>
                </div>
                
                <div style="font-size: 11px; margin-bottom: 15px; text-align: justify; line-height: 1.4;">
                    <p>I have verified the ornaments detailed above. The gross and net weights mentioned are accurate, and the gold purity matches the stated carat. The estimated market value is based on the current gold rate. The ornaments are safely packed in a packet and sealed in my presence.</p>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 25px; font-size: 12px; font-weight: 700; text-align: center; line-height: 1.3;">
                    <div style="width: 30%;">
                        <div>X..........................................</div>
                        <div style="margin-top: 4px;">${valuer.name}</div>
                        <div style="font-size: 10px; font-weight: 600; color: #444;">Valuer</div>
                    </div>
                    <div style="width: 30%;">
                        <div>X..........................................</div>
                        <div style="margin-top: 4px;">${loan.borrowerName || ''}</div>
                        <div style="font-size: 10px; font-weight: 600; color: #444;">Borrower</div>
                    </div>
                    <div style="width: 30%;">
                        <div>X..........................................</div>
                        <div style="margin-top: 4px;">Authorised Signatory</div>
                        <div style="font-size: 10px; font-weight: 600; color: #444;">For Bank Use</div>
                    </div>
                </div>
            </div>

            <!-- PAGE 3: KFS -->
            <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                <div style="text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000000; padding-bottom: 6px;">
                    <h2 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">KEY FACTS STATEMENT (KFS)</h2>
                    <h3 style="font-size: 14px; font-weight: 700; margin: 2px 0 6px 0;">(Gold Loan / Overdraft Facility)</h3>
                </div>
                
                <table class="kfs-table" style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px; border:1.5px solid #000000;">
                    <thead>
                        <tr style="border-bottom:1.5px solid #000000; background-color:#f2f2f2; font-weight:800; text-align:left;">
                            <th style="border-right:1.5px solid #000000; padding:4px 6px; width:45%;">Particulars</th>
                            <th style="padding:4px 6px;">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Unique Proposal Number</td>
                            <td style="padding:4px 6px; font-weight:800;">${uniquePropNo}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Date of KFS</td>
                            <td style="padding:4px 6px;">${kfsDate}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Borrower Name</td>
                            <td style="padding:4px 6px; font-weight:800;">${loan.borrowerName || ''}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Customer ID</td>
                            <td style="padding:4px 6px;">${loan.custNo || ''}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:800;">Loan Account No.</td>
                            <td style="padding:4px 6px; font-weight:800;">${loan.accountNo || ''}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Type of Facility</td>
                            <td style="padding:4px 6px;">Gold Loan</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Purpose of Facility</td>
                            <td style="padding:4px 6px;">${loan.loanPurpose || '-'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Loan Amount</td>
                            <td style="padding:4px 6px; font-weight:800;">Rs. ${parseFloat(loan.loanAmount || 0).toLocaleString("en-IN")}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Tenure of Loan</td>
                            <td style="padding:4px 6px;">${tenureMonthsVal} Months</td>
                        </tr>
                        <tr style="border-bottom:1px solid #000000;">
                            <td style="border-right:1.5px solid #000000; padding:4px 6px; font-weight:700;">Interest Rate (Annual)</td>
                            <td style="padding:4px 6px;">${loan.interestRate || ''}% p.a.</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="font-size:12px; margin-top: 20px; border-top: 1px dashed #000000; padding-top: 15px;">
                    <p style="margin-bottom: 25px;"><strong>Declaration:</strong> I/We agree to the terms and conditions mentioned above.</p>
                    <div style="display:flex; justify-content:space-between; margin-top:40px; font-weight:700;">
                        <div style="width:40%;">
                            <div style="border-bottom: 1px dashed #000; margin-bottom: 4px; height: 1px;"></div>
                            <div>(Borrower Signature)</div>
                        </div>
                        <div style="width:40%; text-align:right;">
                            <div style="border-bottom: 1px dashed #000; margin-bottom: 4px; height: 1px;"></div>
                            <div>(Bank Official Signature)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        printArea.innerHTML = html;

        setTimeout(() => {
            window.print();
            printOverlay.classList.remove("active");
        }, 500);
    } catch(e) {
        alert("Error in printVoucher3725: " + e.message);
        console.error(e);
        document.getElementById("print-overlay").classList.remove("active");
    }
}

