const fs = require('fs');

let content = fs.readFileSync('app_new.js', 'utf8');

const imports = `import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOIUkyCR_88wGGXb10qmdyK13xWPDSOCU",
  authDomain: "jccbgold.firebaseapp.com",
  projectId: "jccbgold",
  storageBucket: "jccbgold.firebasestorage.app",
  messagingSenderId: "665851575048",
  appId: "1:665851575048:web:a823afb8824c80abe14abd",
  measurementId: "G-KGRPF845CW"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// ==================== INITIAL SEED DATA ====================`;

content = content.replace('// ==================== INITIAL SEED DATA ====================', imports);

content = content.replace('const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwc_px0IQX27lExLyvFlpnhPg0xJHu8_8_16ULQAzG11RYGuE0bCD3XY5U1Va4XMi21/exec";', '');

const loadStateRegex = /    try \{\r?\n        const response = await fetch\(GOOGLE_SCRIPT_URL\);\r?\n        const data = await response\.text\(\);\r?\n        \r?\n        let stored = null;\r?\n        if \(data && data\.trim\(\) !== "" && data\.trim\(\) !== "\{\}"\) \{\r?\n            stored = data;\r?\n        \}/;

const loadStateReplacement = `    try {
        const docRef = doc(db, "jccb", "state");
        const docSnap = await getDoc(docRef);
        
        let stored = null;
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (Object.keys(data).length > 0) {
                stored = JSON.stringify(data);
            }
        }`;

content = content.replace(loadStateRegex, loadStateReplacement);


const saveStateRegex = /        const dataStr = JSON\.stringify\(stateToUpload\);\r?\n        \r?\n        if \(\!isBackground\) \{\r?\n            const response = await fetch\(GOOGLE_SCRIPT_URL, \{\r?\n                method: "POST",\r?\n                body: dataStr,\r?\n                headers: \{\r?\n                    "Content-Type": "text\/plain"\r?\n                \}\r?\n            \}\);\r?\n            if \(\!response\.ok\) \{\r?\n                const errText = await response\.text\(\);\r?\n                throw new Error\(errText \|\| \`HTTP Error \$\{response\.status\}\`\);\r?\n            \}\r?\n        \} else \{\r?\n            fetch\(GOOGLE_SCRIPT_URL, \{\r?\n                method: "POST",\r?\n                body: dataStr,\r?\n                headers: \{\r?\n                    "Content-Type": "text\/plain"\r?\n                \}\r?\n            \}\)\.catch\(e => console\.error\("Background state save failed", e\)\);\r?\n        \}/;

const saveStateReplacement = `        const cleanState = JSON.parse(JSON.stringify(stateToUpload));
        const docRef = doc(db, "jccb", "state");
        
        if (!isBackground) {
            await setDoc(docRef, cleanState);
        } else {
            setDoc(docRef, cleanState).catch(e => console.error("Background state save failed", e));
        }`;

content = content.replace(saveStateRegex, saveStateReplacement);

fs.writeFileSync('app_new.js', content, 'utf8');
console.log('Patch complete.');
