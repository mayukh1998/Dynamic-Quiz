let quizData = [];
let curIdx = 0;
let isEditingQuestion = false;
let appsScriptUrl = "";
let globalNotes = null;
// Temporary state for the inline editor
let tempEditOptions = [];
let tempEditAnswers = [];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (localStorage.getItem('quizTheme') === 'dark') {
        document.body.classList.add('dark-theme');
        themeBtn.innerText = '☀️';
    } else {
        themeBtn.innerText = '🌙';
    }
    themeBtn.addEventListener('click', toggleTheme);

    const savedUrl = localStorage.getItem('gasWebUrl');
    const savedApiKey = localStorage.getItem('geminiApiKey');
    if (savedUrl) document.getElementById('scriptUrlInput').value = savedUrl;
    if (savedApiKey) document.getElementById('geminiApiKeyInput').value = savedApiKey;

    document.getElementById('loadBtn').addEventListener('click', () => initiateLoad(true));
    document.getElementById('clearCacheBtn').addEventListener('click', unlinkDrive);
    document.getElementById('restartQuizBtn').addEventListener('click', restartQuiz);
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
    document.getElementById('copyQBtn').addEventListener('click', copyQuestion);
    
    document.getElementById('changeApiKeyBtn').addEventListener('click', changeApiKey);
    document.getElementById('checkAllBtn').addEventListener('click', checkAllWithGemini);
    
    document.getElementById('notesBtn').addEventListener('click', () => handleNotesGeneration(false));
    document.getElementById('regenerateNotesBtn').addEventListener('click', () => handleNotesGeneration(true));
    document.getElementById('closeNotesBtn').addEventListener('click', closeNotesModal);

    document.getElementById('reuploadBtn').addEventListener('click', showReuploadScreen);
    document.getElementById('saveNewJsonBtn').addEventListener('click', handleNewJsonSubmit);
    document.getElementById('cancelJsonBtn').addEventListener('click', cancelReupload);
    
    document.getElementById('submitBtn').addEventListener('click', submitAnswer);
    document.getElementById('nextBtn').addEventListener('click', nextQuestion);
    document.getElementById('markBtn').addEventListener('click', toggleMark);
    
    document.getElementById('editPenBtn').addEventListener('click', startEditQuestion);
    document.getElementById('fixJsonBtn').addEventListener('click', startEditQuestion);
    document.getElementById('saveDataBtn').addEventListener('click', saveEditedData);
    document.getElementById('cancelEditBtn').addEventListener('click', () => { isEditingQuestion = false; renderQ(); });
    document.getElementById('addOptionBtn').addEventListener('click', () => { tempEditOptions.push(""); renderEditOptionsUI(); });

    document.getElementById('geminiHelpBtn').addEventListener('click', fetchGeminiAnswer);
    document.getElementById('toggleExplanationBtn').addEventListener('click', toggleExplanation);

    document.getElementById('closeReviewBtn').addEventListener('click', closeReviewModal);

    if (savedUrl) initiateLoad(false);
});

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-theme');
    const btn = document.getElementById('themeToggleBtn');
    
    if (body.classList.contains('dark-theme')) {
        localStorage.setItem('quizTheme', 'dark');
        btn.innerText = '☀️';
    } else {
        localStorage.setItem('quizTheme', 'light');
        btn.innerText = '🌙';
    }
}

function unlinkDrive() {
    if(!confirm("Are you sure? This will disconnect the app from Google Drive & clear your API key.")) return;
    localStorage.removeItem('gasWebUrl');
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem('quizDataFull');
    localStorage.removeItem('quizProgress');
    localStorage.removeItem('quizNotes'); 
    location.reload();
}

function changeApiKey() {
    const currentKey = localStorage.getItem('geminiApiKey') || '';
    const newKey = prompt("Enter your Gemini API Key:\n\n(Leave blank to remove the key)", currentKey);
    
    if (newKey !== null) {
        const trimmed = newKey.trim();
        if (trimmed) {
            localStorage.setItem('geminiApiKey', trimmed);
            alert("API Key updated successfully!");
        } else {
            localStorage.removeItem('geminiApiKey');
            alert("API Key removed. AI features will be disabled until you add a new one.");
        }
    }
}

function updateSyncStatus(status) {
    const indicator = document.getElementById('syncIndicator');
    if(status === 'saving') {
        indicator.className = 'sync-status sync-active';
        indicator.innerText = '🔄 Saving to Drive...';
    } else if (status === 'success') {
        indicator.className = 'sync-status sync-success';
        indicator.innerText = '☁️ Synced to Drive';
    } else if (status === 'error') {
        indicator.className = 'sync-status';
        indicator.style.color = 'var(--danger)';
        indicator.innerText = '❌ Sync Failed';
    }
}

async function initiateLoad(isManual) {
    const urlInput = document.getElementById('scriptUrlInput').value.trim();
    const geminiInput = document.getElementById('geminiApiKeyInput').value.trim();

    if (!urlInput) {
        alert("Please paste the Google Apps Script URL.");
        return;
    }
    
    appsScriptUrl = urlInput;
    if (geminiInput) localStorage.setItem('geminiApiKey', geminiInput);

    const loadProgressContainer = document.getElementById('loadProgressContainer');
    const loadProgressText = document.getElementById('loadProgressText');
    const loadProgressBar = document.getElementById('loadProgressBar');
    const loadErrorText = document.getElementById('loadErrorText');
    const loadBtn = document.getElementById('loadBtn');
    
    // 1. Show the Progress UI instantly
    loadProgressContainer.classList.remove('hidden');
    loadErrorText.classList.add('hidden');
    loadProgressBar.style.width = '15%';
    loadProgressBar.style.backgroundColor = 'var(--primary)';
    loadProgressText.innerHTML = "<span>⏳ Preparing...</span>";
    loadBtn.disabled = true;

    // 2. CRITICAL FIX: Force the browser to render the progress bar BEFORE doing anything else.
    // Without this brief delay, the browser freezes to show the confirm() popup or fetch data 
    // before it has a chance to visually draw the bar on your screen!
    await delay(150); 

    try {
        const cachedData = localStorage.getItem('quizDataFull');
        let useLocalCache = false;

        if (isManual && cachedData && cachedData !== "[]" && cachedData !== "null") {
            useLocalCache = confirm("Local saved progress was found on this device.\n\nClick 'OK' to upload and sync this local data TO the cloud.\nClick 'Cancel' to overwrite it and fetch data FROM the cloud.");
        }

        if (useLocalCache) {
            loadProgressText.innerHTML = "<span>⏳ Uploading local save to Google Drive...</span>";
            loadProgressBar.style.width = '40%';
            
            quizData = JSON.parse(cachedData);
            curIdx = parseInt(localStorage.getItem('quizProgress')) || 0;
            globalNotes = localStorage.getItem('quizNotes') || null;
            
            const payload = { curIdx: curIdx, quizData: quizData, quizNotes: globalNotes };
            
            setTimeout(() => { if (loadProgressBar.style.width !== '100%') loadProgressBar.style.width = '70%'; }, 1000);

            const response = await fetch(appsScriptUrl, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
            });
            
            if (!response.ok) throw new Error(`HTTP Status ${response.status}`);
            
            loadProgressBar.style.width = '100%';
            loadProgressText.innerHTML = "<span style='color: var(--success);'>✅ Cloud Sync Complete!</span>";
            localStorage.setItem('gasWebUrl', appsScriptUrl);
            
            // Give user time to see 100% completion before screen switches
            await delay(600);
            startApp();
            
        } else {
            loadProgressText.innerHTML = "<span>⏳ Fetching from Google Drive...</span>";
            loadProgressBar.style.width = '45%';
            
            setTimeout(() => { if (loadProgressBar.style.width !== '100%') loadProgressBar.style.width = '80%'; }, 1000);
            
            const response = await fetch(appsScriptUrl);
            if (!response.ok) throw new Error(`HTTP Status ${response.status}`);
            const data = await response.json();
            
            loadProgressBar.style.width = '100%';
            loadProgressText.innerHTML = "<span style='color: var(--success);'>✅ Data Fetched!</span>";
            
            let loadedQuizData = [];
            let loadedIdx = 0;

            if (Array.isArray(data)) {
                loadedQuizData = data;
            } else if (data.quizData) {
                loadedQuizData = data.quizData;
                loadedIdx = data.curIdx || 0;
                globalNotes = data.quizNotes || null; 
            }

            // Give user time to see 100% completion before screen switches
            await delay(600);

            if (loadedQuizData.length === 0) {
                localStorage.setItem('gasWebUrl', appsScriptUrl);
                document.getElementById('configScreen').classList.add('hidden');
                document.getElementById('jsonInputScreen').classList.remove('hidden');
                document.getElementById('jsonScreenTitle').innerText = "Initialize Cloud File";
                document.getElementById('jsonScreenDesc').innerText = "Your Google Drive file is currently empty. Paste your JSON array below to initialize it.";
                document.getElementById('cancelJsonBtn').classList.add('hidden');
                
                setTimeout(() => loadProgressContainer.classList.add('hidden'), 500);
            } else {
                quizData = loadedQuizData.map(q => ({ 
                    ...q,
                    options: q.options || [],
                    correctAnswers: q.correctAnswers || [],
                    userAnswer: q.userAnswer || null, 
                    status: q.status || null, 
                    marked: q.marked || false,
                    explanation: q.explanation || null
                }));
                curIdx = loadedIdx;
                saveState();
                localStorage.setItem('gasWebUrl', appsScriptUrl);
                startApp();
            }
        }
    } catch (error) {
        console.error(error);
        loadProgressBar.style.width = '100%';
        loadProgressBar.style.backgroundColor = 'var(--danger)';
        loadProgressText.innerHTML = "<span style='color: var(--danger);'>❌ Connection Failed</span>";
        loadErrorText.innerText = `Error: ${error.message || 'Failed to communicate with Google Drive.'} Please ensure your Web App URL is correct, deployed as 'Anyone', and you are connected to the internet.`;
        loadErrorText.classList.remove('hidden');
    } finally {
        loadBtn.disabled = false;
    }
}

async function syncStateToDrive() {
    if (!appsScriptUrl) return;
    updateSyncStatus('saving');
    saveState();
    const payload = { curIdx: curIdx, quizData: quizData, quizNotes: globalNotes };

    try {
        await fetch(appsScriptUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        updateSyncStatus('success');
    } catch (e) {
        console.error("Sync failed", e);
        updateSyncStatus('error');
    }
}

function saveState() {
    localStorage.setItem('quizDataFull', JSON.stringify(quizData));
    localStorage.setItem('quizProgress', curIdx);
    localStorage.setItem('quizNotes', globalNotes || "");
}

function formatIndicesToLetters(indicesArray) {
    if (!indicesArray || indicesArray.length === 0) return "None";
    const letters = indicesArray.map(i => String.fromCharCode(65 + i)).join(', ');
    return indicesArray.length > 1 ? `Options ${letters}` : `Option ${letters}`;
}

async function executeGeminiRequest(prompt, apiKey) {
    let model = 'gemini-3.6-flash';
    
    let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: "application/json" }
        })
    });

    if (response.status === 459) {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        if (response.status === 459 || !response.ok) {
            model = 'gemini-3-flash-preview';
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { response_mime_type: "application/json" }
                })
            });
        }
    }

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP Status ${response.status}`);
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

async function handleNotesGeneration(force = false) {
    if (globalNotes && !force) {
        renderNotesModal(globalNotes);
        return;
    }

    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("No API key found. Please click the '🔑' button at the top to add your API Key to generate notes.");
        return;
    }

    const explanations = quizData.map(q => q.explanation).filter(exp => exp && exp.trim() !== "");
    
    if (explanations.length === 0) {
        alert("No explanations found in the quiz data. Please generate explanations using AI (✨ or ⭐ Check All) first.");
        return;
    }

    const combinedExplanations = explanations.join("\n\n");

    const prompt = `You are an expert exam prep assistant. Combine the following quiz explanations and summarize them into a highly precise, concise set of study notes using standard markdown bullet points. 
Crucial requirement: Identify and explicitly mark the core concepts, patterns, or facts most critical for passing the exam as **IMPORTANT**. Keep only crucial facts to easily remember.

Return strictly a valid JSON object matching this schema:
{
"notes": "string (your formatted markdown bullet points)"
}

Explanations:
${combinedExplanations}`;

    const notesBtn = document.getElementById('notesBtn');
    const regenBtn = document.getElementById('regenerateNotesBtn');
    const originalText = notesBtn.innerText;
    const originalRegenText = regenBtn.innerText;
    
    notesBtn.innerText = '⏳ Generating...';
    notesBtn.disabled = true;
    regenBtn.innerText = '⏳ Generating...';
    regenBtn.disabled = true;

    try {
        const rawOutput = await executeGeminiRequest(prompt, apiKey);
        const result = JSON.parse(rawOutput);

        if (result && result.notes) {
            globalNotes = result.notes;
            syncStateToDrive(); 
            renderNotesModal(globalNotes);
        } else {
            throw new Error("Invalid output format returned by AI.");
        }
    } catch (err) {
        console.error("Notes Generation Error:", err);
        alert(`Failed to generate notes: ${err.message}`);
    } finally {
        notesBtn.innerText = originalText;
        notesBtn.disabled = false;
        regenBtn.innerText = originalRegenText;
        regenBtn.disabled = false;
    }
}

function renderNotesModal(notesText) {
    let htmlContent = notesText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    document.getElementById('notesContent').innerHTML = htmlContent;
    
    document.getElementById('notesOverlay').classList.remove('hidden');
    document.getElementById('notesModal').classList.remove('hidden');
}

function closeNotesModal() {
    document.getElementById('notesOverlay').classList.add('hidden');
    document.getElementById('notesModal').classList.add('hidden');
}

async function checkAllWithGemini() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("No API key found. Please click the '🔑' button at the top to add your API Key.");
        return;
    }

    if(!confirm("Are you sure you want to proceed? This will check ALL questions in batches to respect free tier limits and automatically update JSON data. It may take some time depending on quiz length.")) return;

    const overlay = document.getElementById('progressOverlay');
    const modal = document.getElementById('progressModal');
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const errorText = document.getElementById('progressErrorText');
    
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    let completed = 0;
    const total = quizData.length;
    bar.style.width = '0%';
    text.innerText = `0 / ${total}`;
    errorText.innerText = "";

    let dataUpdated = false;
    let changedQuestions = [];
    const batchSize = 20;

    for (let i = 0; i < total; i += batchSize) {
        const batch = quizData.slice(i, i + batchSize);
        
        const batchPrompt = batch.map((q, idx) => {
            const optionsString = (q.options || []).length > 0 
                ? q.options.map((opt, oIdx) => `[Index ${oIdx}]: ${opt}`).join('\n')
                : "No options provided.";
            return `Question ID: ${i + idx}\nQuestion: ${q.question}\nOptions:\n${optionsString}`;
        }).join('\n\n');

        const prompt = `You are a technical quiz assistant. Given the following batch of questions, return the correct option index (or indices if multiple) and a brief explanation (max 400 characters) for each. If a question is entirely missing options, return an empty array for correctAnswers.

Return strictly a valid JSON array of objects matching this schema, exactly in the order the questions were provided, no markdown blocks:
[
{
"correctAnswers": [number, ...],
"explanation": "string (under 400 chars)"
}
]

Questions:
${batchPrompt}`;

        let success = false;
        while (!success) {
            try {
                errorText.innerText = "";
                
                const rawOutput = await executeGeminiRequest(prompt, apiKey);
                const results = JSON.parse(rawOutput);

                if (!Array.isArray(results) || results.length !== batch.length) {
                        throw new Error("AI returned incorrect number of results in batch array.");
                }

                results.forEach((result, idx) => {
                    const q = quizData[i + idx];
                    const oldAnswers = q.correctAnswers || [];
                    const newAnswers = result.correctAnswers || [];
                    const isSame = newAnswers.length === oldAnswers.length && newAnswers.every(val => oldAnswers.includes(val));

                    if (!isSame && (q.options || []).length > 0) {
                        changedQuestions.push({
                            index: i + idx,
                            question: q.question,
                            options: q.options || [],
                            oldAnswers: [...oldAnswers],
                            newAnswers: [...newAnswers]
                        });

                        q.correctAnswers = newAnswers;
                        if (q.userAnswer !== null) {
                            const isUserCorrect = q.userAnswer.length === q.correctAnswers.length && q.userAnswer.every(val => q.correctAnswers.includes(val));
                            q.status = isUserCorrect ? 'correct' : 'incorrect';
                        }
                        dataUpdated = true;
                    }
                    
                    if (q.explanation !== result.explanation) {
                        q.explanation = result.explanation;
                        dataUpdated = true; 
                    }
                });
                
                success = true; 
            } catch (err) {
                console.error("Batch Check Error:", err);
                for(let sec = 60; sec > 0; sec--) {
                    errorText.style.color = "var(--danger)";
                    errorText.innerText = `Request failed (${err.message}). Retrying in ${sec}s...`;
                    await delay(1000);
                }
                errorText.innerText = "Retrying now...";
            }
        }

        completed += batch.length;
        bar.style.width = `${Math.round((completed / total) * 100)}%`;
        text.innerText = `${completed} / ${total}`;

        if (completed < total) {
            for (let sec = 15; sec > 0; sec--) {
                errorText.style.color = "var(--warning)";
                errorText.innerText = `Rate limit: Waiting ${sec}s before next batch...`;
                await delay(1000);
            }
            errorText.style.color = "var(--danger)";
            errorText.innerText = "";
        }
    }

    overlay.classList.add('hidden');
    modal.classList.add('hidden');

    if (dataUpdated) {
        syncStateToDrive();
    } else {
        saveState();
    }
    
    renderQ();
    renderSidebar();
    
    if (changedQuestions.length > 0) {
        showReviewModal(changedQuestions);
    } else {
        alert("Answers and explanations have been successfully synced! No correct answers needed to be updated.");
    }
}

function showReviewModal(changes) {
    const overlay = document.getElementById('reviewOverlay');
    const modal = document.getElementById('reviewModal');
    const content = document.getElementById('reviewContent');
    
    content.innerHTML = '';
    
    changes.forEach(change => {
        const oldText = change.oldAnswers.map(idx => change.options[idx]).join(' <br> ') || 'None';
        const newText = change.newAnswers.map(idx => change.options[idx]).join(' <br> ') || 'None';
        
        const div = document.createElement('div');
        div.style.padding = '20px';
        div.style.border = '1px solid var(--border)';
        div.style.borderRadius = '8px';
        div.style.background = 'var(--bg)';
        
        div.innerHTML = `
            <p style="font-weight: 600; margin-top: 0; font-size: 1.1em; color: var(--text);">Question ${change.index + 1}: ${change.question}</p>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px;">
                <div style="flex: 1; min-width: 200px; padding: 15px; background: var(--error-bg); border-radius: 6px; border: 1px solid var(--error); color: var(--status-text);">
                    <strong style="display: block; margin-bottom: 8px;">Old Answer: ${formatIndicesToLetters(change.oldAnswers)}</strong>
                    ${oldText}
                </div>
                <div style="flex: 1; min-width: 200px; padding: 15px; background: var(--success-bg); border-radius: 6px; border: 1px solid var(--success); color: var(--status-text);">
                    <strong style="display: block; margin-bottom: 8px;">New Answer: ${formatIndicesToLetters(change.newAnswers)}</strong>
                    ${newText}
                </div>
            </div>
        `;
        content.appendChild(div);
    });
    
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function closeReviewModal() {
    document.getElementById('reviewOverlay').classList.add('hidden');
    document.getElementById('reviewModal').classList.add('hidden');
}

async function fetchGeminiAnswer() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("No API key found. Please click the '🔑' button at the top to add your API Key.");
        return;
    }
    
    const q = quizData[curIdx];
    if (!q.options || q.options.length === 0) {
        alert("Cannot use AI because this question has no options. Please use the ✏️ edit tool to add options first.");
        return;
    }

    const geminiBtn = document.getElementById('geminiHelpBtn');
    geminiBtn.innerText = '⏳';
    geminiBtn.disabled = true;

    const optionsString = q.options.map((opt, i) => `[Index ${i}]: ${opt}`).join('\n');
    const prompt = `
You are a technical quiz assistant. Given the question and options below, return the correct option index (or indices if multiple) and a brief explanation (max 400 characters). 
Question: ${q.question}
Options:
${optionsString}

Return strictly a valid JSON object matching this schema, no markdown blocks:
{
"correctAnswers": [number, ...],
"explanation": "string (under 400 chars)"
}`;

    try {
        const rawOutput = await executeGeminiRequest(prompt, apiKey);
        const result = JSON.parse(rawOutput);

        const oldAnswers = q.correctAnswers || [];
        const newAnswers = result.correctAnswers || [];
        const isSame = newAnswers.length === oldAnswers.length && newAnswers.every(val => oldAnswers.includes(val));

        let dataUpdated = false;
        
        if (!isSame) {
            const formattedNew = formatIndicesToLetters(newAnswers);
            const formattedOld = formatIndicesToLetters(oldAnswers);
            
            const userConfirmed = confirm(`The AI suggests the correct answer is: ${formattedNew}.\nYour JSON currently has: ${formattedOld}.\n\nDo you want to update your JSON DB with this answer?`);
            
            if (userConfirmed) {
                q.correctAnswers = newAnswers;
                if (q.userAnswer !== null) {
                    const isUserCorrect = q.userAnswer.length === q.correctAnswers.length && q.userAnswer.every(val => q.correctAnswers.includes(val));
                    q.status = isUserCorrect ? 'correct' : 'incorrect';
                }
                dataUpdated = true;
            }
        }

        q.explanation = result.explanation;
        
        if (dataUpdated) {
            syncStateToDrive();
        } else {
            saveState();
        }
        
        renderQ();
        
        document.getElementById('explanationText').classList.remove('hidden');
        document.getElementById('toggleExplanationBtn').innerText = "Hide Explanation";

    } catch (err) {
        console.error("AI Error:", err);
        alert(`Failed to reach AI: ${err.message}\n\nPlease check your console or ensure your API key is valid by clicking the '🔑' button above.`);
    } finally {
        geminiBtn.innerText = '✨';
        geminiBtn.disabled = false;
    }
}

function toggleExplanation() {
    const expText = document.getElementById('explanationText');
    const toggleBtn = document.getElementById('toggleExplanationBtn');
    if (expText.classList.contains('hidden')) {
        expText.classList.remove('hidden');
        toggleBtn.innerText = "Hide Explanation";
    } else {
        expText.classList.add('hidden');
        toggleBtn.innerText = "Show Explanation";
    }
}

function showReuploadScreen() {
    if(!confirm("Warning: Pasting new JSON will overwrite your current cloud file and reset all progress. Do you wish to continue?")) return;
    
    document.getElementById('quizApp').classList.add('hidden');
    document.getElementById('exportJsonBtn').classList.add('hidden');
    document.getElementById('restartQuizBtn').classList.add('hidden');
    document.getElementById('reuploadBtn').classList.add('hidden');
    document.getElementById('changeApiKeyBtn').classList.add('hidden');
    document.getElementById('checkAllBtn').classList.add('hidden');
    document.getElementById('notesBtn').classList.add('hidden');
    
    document.getElementById('jsonInputScreen').classList.remove('hidden');
    document.getElementById('jsonScreenTitle').innerText = "Upload New JSON";
    document.getElementById('jsonScreenDesc').innerText = "Paste your new JSON array below to completely overwrite your existing cloud file:";
    document.getElementById('cancelJsonBtn').classList.remove('hidden');
    document.getElementById('jsonInput').value = ""; 
}

function cancelReupload() {
    document.getElementById('jsonInputScreen').classList.add('hidden');
    startApp();
}

function handleNewJsonSubmit() {
    try {
        const rawData = JSON.parse(document.getElementById('jsonInput').value);
        
        if(!Array.isArray(rawData) || rawData.length === 0) {
            throw new Error("Data must be a non-empty array");
        }

        quizData = rawData.map(q => ({
            ...q,
            options: q.options || [],
            correctAnswers: q.correctAnswers || [],
            userAnswer: null, 
            status: null,
            marked: false,
            explanation: null
        }));
        curIdx = 0;
        globalNotes = null; 
        
        document.getElementById('jsonInputScreen').classList.add('hidden');
        
        syncStateToDrive(); 
        startApp();
        
    } catch(e) { 
        alert("Invalid JSON format! Please ensure you pasted a valid JSON array matching the placeholder structure."); 
        console.error(e);
    }
}

function startApp() {
    document.getElementById('configScreen').classList.add('hidden');
    document.getElementById('jsonInputScreen').classList.add('hidden');
    document.getElementById('quizApp').classList.remove('hidden');
    
    document.getElementById('syncIndicator').classList.remove('hidden');
    updateSyncStatus('success');
    
    document.getElementById('reuploadBtn').classList.remove('hidden');
    document.getElementById('changeApiKeyBtn').classList.remove('hidden');
    document.getElementById('checkAllBtn').classList.remove('hidden');
    document.getElementById('notesBtn').classList.remove('hidden');
    document.getElementById('clearCacheBtn').classList.remove('hidden');
    document.getElementById('restartQuizBtn').classList.remove('hidden');
    document.getElementById('exportJsonBtn').classList.remove('hidden');
    
    renderSidebar();
    renderQ();
}

function restartQuiz() {
    if(!confirm("Restart the quiz? Progress will be lost, but your modified JSON answers and marked questions will be kept.")) return;
    
    quizData.forEach(q => {
        q.userAnswer = null;
        q.status = null;
    });
    
    curIdx = 0;
    isEditingQuestion = false;
    
    syncStateToDrive();
    renderSidebar();
    renderQ();
}

function copyToClipboard(text, onSuccess, onError) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess, onError));
    } else {
        fallbackCopy(text, onSuccess, onError);
    }
}

function fallbackCopy(text, onSuccess, onError) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus(); textArea.select();
    textArea.setSelectionRange(0, 999999); 
    try {
        if (document.execCommand('copy') && onSuccess) onSuccess();
        else if (onError) onError(new Error("Browser rejected copy."));
    } catch (err) { if(onError) onError(err); }
    document.body.removeChild(textArea);
}

function exportJSON() {
    const cleanData = quizData.map(({ userAnswer, status, marked, explanation, ...rest }) => rest);
    const textToCopy = JSON.stringify(cleanData, null, 4);
    
    copyToClipboard(
        textToCopy,
        () => alert("Cleaned JSON copied to clipboard!"),
        (err) => alert("Failed to copy.")
    );
}

function copyQuestion() {
    const q = quizData[curIdx];
    let copyText = `Question: ${q.question}\n\n`;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    (q.options || []).forEach((opt, i) => {
        copyText += `${letters[i] || (i+1)}) ${opt}\n`;
    });

    copyToClipboard(
        copyText,
        () => {
            const btn = document.getElementById('copyQBtn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
        },
        (err) => alert("Failed to copy question.")
    );
}

function goToQuestion(index) {
    if (isEditingQuestion) {
        if(!confirm("You have unsaved edits. Discard changes?")) return;
        isEditingQuestion = false;
    }
    curIdx = index;
    syncStateToDrive(); 
    renderSidebar(); 
    renderQ();
}

function renderSidebar() {
    const navGrid = document.getElementById('navGrid');
    navGrid.innerHTML = '';
    
    quizData.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.innerText = i + 1;
        
        if (q.marked) btn.classList.add('marked');
        else if (q.status === 'correct') btn.classList.add('correct');
        else if (q.status === 'incorrect') btn.classList.add('incorrect');
        
        if (i === curIdx) btn.classList.add('active');
        
        btn.addEventListener('click', () => goToQuestion(i));
        navGrid.appendChild(btn);
    });
}

// Inline Editing Logic
function startEditQuestion() {
    const q = quizData[curIdx];
    isEditingQuestion = true;
    tempEditOptions = [...(q.options || [])];
    tempEditAnswers = [...(q.correctAnswers || [])];
    renderQ();
}

function renderEditOptionsUI() {
    const container = document.getElementById('editOptionsList');
    container.innerHTML = '';
    
    if (tempEditOptions.length === 0) {
        container.innerHTML = `<em style="color: var(--secondary); font-size: 0.9em;">No options exist. Click "+ Add Option" below.</em>`;
    }

    tempEditOptions.forEach((opt, idx) => {
        const row = document.createElement('div');
        row.style = "display: flex; gap: 10px; align-items: center; margin-bottom: 10px;";
        
        const isCorrect = tempEditAnswers.includes(idx);
        
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = isCorrect;
        check.style = "transform: scale(1.3); cursor: pointer;";
        check.onchange = (e) => {
            if(e.target.checked) tempEditAnswers.push(idx);
            else tempEditAnswers = tempEditAnswers.filter(val => val !== idx);
        };
        
        const textIn = document.createElement('input');
        textIn.type = 'text';
        textIn.value = opt;
        textIn.style = "flex: 1; margin: 0; padding: 10px;";
        textIn.oninput = (e) => tempEditOptions[idx] = e.target.value;
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.className = 'copy-btn';
        delBtn.title = "Delete Option";
        delBtn.onclick = () => {
            tempEditOptions.splice(idx, 1);
            // Adjust correct answers down if they were above deleted index
            tempEditAnswers = tempEditAnswers
                .filter(val => val !== idx)
                .map(val => val > idx ? val - 1 : val);
            renderEditOptionsUI();
        };
        
        row.appendChild(check);
        row.appendChild(textIn);
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}

function saveEditedData() {
    const q = quizData[curIdx];
    q.question = document.getElementById('editQTextInput').value.trim();
    q.options = tempEditOptions.map(o => o.trim());
    q.correctAnswers = [...tempEditAnswers];
    
    if (q.options.length === 0) {
        alert("Please add at least one option."); return;
    }

    // Reset user progress on this question since they changed options
    q.userAnswer = null;
    q.status = null;
    
    isEditingQuestion = false;
    syncStateToDrive(); 
    
    renderQ();
    renderSidebar();
    
    const qMeta = document.getElementById('qCount');
    qMeta.innerHTML = `<span style="color: var(--success);">Saved Successfully!</span>`;
    setTimeout(() => renderQ(), 2000);
}

function renderQ() {
    const q = quizData[curIdx];
    const currentScore = quizData.filter(x => x.status === 'correct').length;
    
    const hasMissingOptions = !q.options || q.options.length === 0;
    const hasMissingAnswer = !q.correctAnswers || q.correctAnswers.length === 0;
    
    let metaText = `Question ${curIdx + 1} of ${quizData.length}`;
    if (isEditingQuestion) metaText += ` <span class="edit-badge">EDITING</span>`;
    
    document.getElementById('qCount').innerHTML = metaText;
    document.getElementById('qScore').innerText = `Score: ${currentScore}`;
    
    const qTextNode = document.getElementById('qText');
    const editPenBtn = document.getElementById('editPenBtn');
    const optionsDiv = document.getElementById('options');
    const editFormContainer = document.getElementById('editFormContainer');
    const warningEl = document.getElementById('missingAnswerWarning');
    const explanationContainer = document.getElementById('explanationContainer');

    if (isEditingQuestion) {
        qTextNode.classList.add('hidden');
        editPenBtn.classList.add('hidden'); // Hide pen while editing
        optionsDiv.classList.add('hidden');
        warningEl.classList.add('hidden');
        explanationContainer.classList.add('hidden');
        
        editFormContainer.classList.remove('hidden');
        document.getElementById('editQTextInput').value = q.question || "";
        renderEditOptionsUI();
    } else {
        qTextNode.classList.remove('hidden');
        editPenBtn.classList.remove('hidden'); // Show pen when not editing
        optionsDiv.classList.remove('hidden');
        editFormContainer.classList.add('hidden');
        explanationContainer.classList.remove('hidden');
        
        qTextNode.innerText = q.question;
        
        // Build warning banner
        if (hasMissingOptions && hasMissingAnswer) {
            warningEl.innerText = "⚠️ Options and correct answer are missing. Click the ✏️ icon to fix.";
            warningEl.classList.remove('hidden');
        } else if (hasMissingOptions) {
            warningEl.innerText = "⚠️ Options are missing. Click the ✏️ icon to fix.";
            warningEl.classList.remove('hidden');
        } else if (hasMissingAnswer) {
            warningEl.innerText = "⚠️ Correct answer not provided. Use AI (✨) to fetch it, or click the ✏️ icon to fix.";
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }

        // Build Options View
        optionsDiv.innerHTML = '';
        const inputType = (!hasMissingAnswer && q.correctAnswers.length > 1) ? 'checkbox' : 'radio';
        const isAnswered = q.status !== null;
        
        (q.options || []).forEach((o, i) => {
            const label = document.createElement('label');
            label.className = 'option-label';
            
            const input = document.createElement('input');
            input.type = inputType;
            input.name = 'quizOption';
            input.value = i;
            
            if (isAnswered) {
                input.disabled = true;
                label.classList.add('disabled');
                
                if (q.userAnswer && q.userAnswer.includes(i)) input.checked = true;
                if (!hasMissingAnswer && q.correctAnswers.includes(i)) label.classList.add('correct');
                else if (q.userAnswer && q.userAnswer.includes(i)) label.classList.add('incorrect');
            } else if (hasMissingAnswer || hasMissingOptions) {
                input.disabled = true;
                label.classList.add('disabled');
            }
            
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + o));
            optionsDiv.appendChild(label);
        });
        
        const explanationText = document.getElementById('explanationText');
        const toggleExplanationBtn = document.getElementById('toggleExplanationBtn');
        explanationText.classList.add('hidden'); 
        toggleExplanationBtn.innerText = "Show Explanation";
        explanationText.innerText = q.explanation ? q.explanation : ""; 
    }

    // Button Visibility Logic
    const submitBtn = document.getElementById('submitBtn');
    const nextBtn = document.getElementById('nextBtn');
    const markBtn = document.getElementById('markBtn');
    const fixJsonBtn = document.getElementById('fixJsonBtn');
    const saveDataBtn = document.getElementById('saveDataBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    
    if (q.marked) {
        markBtn.innerText = 'Unmark Question';
        markBtn.classList.add('is-marked');
    } else {
        markBtn.innerText = 'Mark Question';
        markBtn.classList.remove('is-marked');
    }

    if (isEditingQuestion) {
        submitBtn.classList.add('hidden'); nextBtn.classList.add('hidden'); markBtn.classList.add('hidden');
        fixJsonBtn.classList.add('hidden'); saveDataBtn.classList.remove('hidden'); cancelEditBtn.classList.remove('hidden');
    } else if (hasMissingAnswer || hasMissingOptions) {
        submitBtn.classList.add('hidden'); fixJsonBtn.classList.remove('hidden'); nextBtn.classList.remove('hidden'); markBtn.classList.remove('hidden');
        saveDataBtn.classList.add('hidden'); cancelEditBtn.classList.add('hidden');
        nextBtn.innerText = "Skip Question";
    } else if (q.status !== null) { // isAnswered
        submitBtn.classList.add('hidden'); fixJsonBtn.classList.remove('hidden'); nextBtn.classList.remove('hidden'); markBtn.classList.remove('hidden');
        saveDataBtn.classList.add('hidden'); cancelEditBtn.classList.add('hidden');
        nextBtn.innerText = (curIdx === quizData.length - 1) ? "Finish Quiz" : "Next Question";
    } else {
        submitBtn.classList.remove('hidden'); fixJsonBtn.classList.add('hidden'); nextBtn.classList.add('hidden'); markBtn.classList.remove('hidden');
        saveDataBtn.classList.add('hidden'); cancelEditBtn.classList.add('hidden');
    }
}

function toggleMark() {
    quizData[curIdx].marked = !quizData[curIdx].marked;
    syncStateToDrive();
    renderQ(); 
    renderSidebar(); 
}

function submitAnswer() {
    const q = quizData[curIdx];
    const inputs = document.querySelectorAll('input[name="quizOption"]');
    const selected = Array.from(inputs).filter(i => i.checked).map(i => parseInt(i.value));
    
    if(selected.length === 0) { alert("Please select an answer before submitting."); return; }

    const isCorrect = selected.length === q.correctAnswers.length && selected.every(val => q.correctAnswers.includes(val));
    
    q.userAnswer = selected;
    q.status = isCorrect ? 'correct' : 'incorrect';
    
    syncStateToDrive();
    renderQ(); 
    renderSidebar();
}

function nextQuestion() {
    if (curIdx < quizData.length - 1) {
        goToQuestion(curIdx + 1);
    } else {
        const finalScore = quizData.filter(x => x.status === 'correct').length;
        alert(`Quiz Finished! Final Score: ${finalScore} out of ${quizData.length}`);
    }
}
