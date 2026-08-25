let quizData = [];
let curIdx = 0;
let isEditingQuestion = false;
let appsScriptUrl = "";
let globalNotes = null;
let tempEditOptions = [];
let tempEditAnswers = [];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SINGLE_ANSWER_SCHEMA = {
    type: "OBJECT",
    properties: {
        correctAnswers: { type: "ARRAY", items: { type: "INTEGER" } },
        explanation: { type: "STRING" }
    },
    required: ["correctAnswers", "explanation"]
};
const batchAnswerSchema = (batchLength) => ({
    type: "ARRAY",
    minItems: batchLength,
    maxItems: batchLength,
    items: SINGLE_ANSWER_SCHEMA
});
const NOTES_SCHEMA = {
    type: "OBJECT",
    properties: { notes: { type: "STRING" } },
    required: ["notes"]
};

const sunSvg = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const moonSvg = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('themeToggleBtn');
    const configThemeBtn = document.getElementById('themeToggleBtnConfig');
    
    if (localStorage.getItem('quizTheme') === 'dark') {
        setTheme(true);
    } else {
        setTheme(false); 
    }
    
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    if (configThemeBtn) configThemeBtn.addEventListener('click', toggleTheme);

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

function setTheme(isDark) {
    const themeBtn = document.getElementById('themeToggleBtn');
    const configThemeBtn = document.getElementById('themeToggleBtnConfig');
    
    if (isDark) {
        document.body.classList.add('dark-theme');
        localStorage.setItem('quizTheme', 'dark');
        if (themeBtn) themeBtn.innerHTML = sunSvg;
        if (configThemeBtn) configThemeBtn.innerHTML = sunSvg;
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('quizTheme', 'light');
        if (themeBtn) themeBtn.innerHTML = moonSvg;
        if (configThemeBtn) configThemeBtn.innerHTML = moonSvg;
    }
}

function toggleTheme() {
    const isDark = !document.body.classList.contains('dark-theme');
    setTheme(isDark);
}

function unlinkDrive() {
    if(!confirm("Are you sure? This will disconnect the app from Google Drive & clear your API key.")) return;
    localStorage.removeItem('gasWebUrl');
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem('geminiModelName');
    localStorage.removeItem('quizDataFull');
    localStorage.removeItem('quizProgress');
    localStorage.removeItem('quizNotes'); 
    localStorage.removeItem('checkAllProgress');
    location.reload();
}

function changeApiKey() {
    const currentKey = localStorage.getItem('geminiApiKey') || '';
    const newKey = prompt("Enter your Gemini API Key:\n\n(Leave blank to remove the key)", currentKey);
    
    if (newKey !== null) {
        const trimmed = newKey.trim();
        if (trimmed) {
            localStorage.setItem('geminiApiKey', trimmed);
            
            // New secondary prompt for custom model input
            const currentModel = localStorage.getItem('geminiModelName') || '';
            const newModel = prompt("Enter preferred Gemini Model Name (Optional):\n\n(Leave blank to use default 'gemini-3.7-flash')", currentModel);
            
            if (newModel !== null) {
                const trimmedModel = newModel.trim();
                if (trimmedModel) {
                    localStorage.setItem('geminiModelName', trimmedModel);
                } else {
                    localStorage.removeItem('geminiModelName');
                }
            }
            alert("API settings updated successfully!");
        } else {
            localStorage.removeItem('geminiApiKey');
            localStorage.removeItem('geminiModelName');
            alert("API Key removed. AI features will be disabled until you add a new one.");
        }
    }
}

function updateSyncStatus(status) {
    const indicator = document.getElementById('syncIndicator');
    if(status === 'saving') {
        indicator.innerHTML = 'Saving to Drive... <span class="dot warning-dot"></span>';
    } else if (status === 'success') {
        indicator.innerHTML = 'Active & Connected <span class="dot success-dot"></span>';
    } else if (status === 'error') {
        indicator.innerHTML = 'Sync Failed <span class="dot error-dot"></span>';
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
    
    loadProgressContainer.classList.remove('hidden');
    loadErrorText.classList.add('hidden');
    loadProgressBar.style.width = '15%';
    loadProgressBar.style.backgroundColor = 'var(--indigo)';
    loadProgressText.innerHTML = "<span>⏳ Preparing...</span>";
    loadBtn.disabled = true;

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
            loadProgressText.innerHTML = "<span style='color: var(--green);'>✅ Cloud Sync Complete!</span>";
            localStorage.setItem('gasWebUrl', appsScriptUrl);
            
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
            loadProgressText.innerHTML = "<span style='color: var(--green);'>✅ Data Fetched!</span>";
            
            let loadedQuizData = [];
            let loadedIdx = 0;

            if (Array.isArray(data)) {
                loadedQuizData = data;
            } else if (data.quizData) {
                loadedQuizData = data.quizData;
                loadedIdx = data.curIdx || 0;
                globalNotes = data.quizNotes || null; 
            }

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
        loadProgressBar.style.backgroundColor = 'var(--red)';
        loadProgressText.innerHTML = "<span style='color: var(--red);'>❌ Connection Failed</span>";
        loadErrorText.innerText = `Error: ${error.message || 'Failed to communicate.'}`;
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
        const response = await fetch(appsScriptUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

async function executeGeminiRequest(prompt, apiKey, responseSchema, maxOutputTokens = 4096) {
    let defaultModel = 'gemini-3.7-flash'; 
    let fallbackModel = 'gemini-3.5-flash-lite';
    
    let customModel = localStorage.getItem('geminiModelName');
    let model = customModel || defaultModel;
    
    const modelDisplay = document.getElementById('progressModelText');
    const errorDisplay = document.getElementById('progressErrorText');
    
    // ALWAYS force the UI to show the exact model we are about to ping
    if (modelDisplay) {
        modelDisplay.innerText = `Model: ${model}`;
    }

    const buildBody = () => ({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            response_mime_type: "application/json",
            ...(responseSchema ? { response_schema: responseSchema } : {}),
            temperature: 0.0, 
            maxOutputTokens: maxOutputTokens
        }
    });

    const callModel = (m) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(buildBody())
    });

    // Helper to safely parse Google's error format
    const parseError = async (res) => {
        const text = await res.clone().text();
        let msg = `HTTP Status ${res.status}`;
        try {
            const errData = JSON.parse(text);
            msg = errData.error?.message || msg;
        } catch(e) {}
        return msg;
    };

    let response = await callModel(model);

    if (!response.ok) {
        let errorMessage = await parseError(response);
        console.warn(`Primary model (${model}) failed:`, response.status, errorMessage);
        
        // ONLY trigger the retry/fallback process if NO custom model is set AND it's a server/rate issue
        if (!customModel && (response.status === 429 || response.status >= 500)) {
            
            // PHASE 1: Wait 30 seconds and retry the primary model
            if (errorDisplay) {
                for (let sec = 30; sec > 0; sec--) {
                    errorDisplay.style.color = "var(--yellow)";
                    errorDisplay.innerText = `High demand (${errorMessage}). Retrying primary model in ${sec}s...`;
                    await delay(1000);
                }
                errorDisplay.innerText = "Retrying primary model...";
            }

            response = await callModel(model);

            // PHASE 2: If the retry STILL fails, switch to the fallback
            if (!response.ok && (response.status === 429 || response.status >= 500)) {
                errorMessage = await parseError(response);
                
                if (errorDisplay) {
                    for (let sec = 10; sec > 0; sec--) {
                        errorDisplay.style.color = "var(--orange)";
                        errorDisplay.innerText = `Retry failed. Switching to fallback model in ${sec}s...`;
                        await delay(1000);
                    }
                    errorDisplay.innerText = "Switching to fallback model...";
                }

                if (modelDisplay) {
                    modelDisplay.innerText = `Model: ${fallbackModel} (Fallback)`;
                }
                
                response = await callModel(fallbackModel);
            }
            
            // Clear the switching/retrying text once a successful response comes through
            if (response.ok && errorDisplay) {
                errorDisplay.innerText = "";
            }
            
        } else {
            // If custom model is set, OR error is 400/403/404, throw the error directly
            throw new Error(errorMessage);
        }
    }

    // Check if the fallback ALSO failed
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP Status ${response.status}`);
    }
    
    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
        const reason = candidate?.finishReason || data.promptFeedback?.blockReason;
        if (reason === 'MAX_TOKENS') throw new Error("AI response was cut off (ran out of output tokens). Try a smaller batch size.");
        if (reason) throw new Error(`AI returned no usable content (reason: ${reason}).`);
        throw new Error("AI returned an empty response.");
    }
    return text;
}

async function handleNotesGeneration(force = false) {
    if (globalNotes && !force) {
        renderNotesModal(globalNotes);
        return;
    }
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("No API key found. Please click the key icon to add it.");
        return;
    }

    const explanations = quizData.map(q => q.explanation).filter(exp => exp && exp.trim() !== "");
    if (explanations.length === 0) {
        alert("No explanations found. Please generate explanations using AI first.");
        return;
    }

    const combinedExplanations = explanations.join("\n\n");
    const prompt = `You are an expert exam prep assistant. Combine the following quiz explanations and synthesize them into a highly organized, beautifully formatted study guide. \n\nFORMATTING RULES:\n1. Use clear Markdown Headings (### Topic Name) to group similar concepts logically.\n2. Use bullet points (-) for key facts under each heading.\n3. Bold (**text**) the most critical terms, tool names, or formulas.\n4. Keep explanations incredibly concise and punchy. No fluff.\n\nReturn strictly a valid JSON object matching this schema:\n{\n"notes": "string (your formatted markdown string containing headers, bullets, and bold text)"\n}\n\nExplanations:\n${combinedExplanations}`;

    const notesBtn = document.getElementById('notesBtn');
    const regenBtn = document.getElementById('regenerateNotesBtn');
    const originalNotesBtnHTML = notesBtn.innerHTML;
    const originalRegenBtnHTML = regenBtn.innerHTML;
    
    // Set loading state on buttons
    notesBtn.innerHTML = '⏳';
    notesBtn.disabled = true;
    regenBtn.innerHTML = '⏳';
    regenBtn.disabled = true;

    // Utilize the unified Progress Modal
    const overlay = document.getElementById('progressOverlay');
    const modal = document.getElementById('progressModal');
    const title = document.getElementById('progressTitle');
    const desc = document.getElementById('progressDesc');
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const errorText = document.getElementById('progressErrorText');
    const modelDisplay = document.getElementById('progressModelText');

    title.innerText = "✨ Generating Study Notes...";
    desc.innerText = "AI is synthesizing all explanations into a formatted markdown guide.";
    bar.style.width = '100%';
    bar.classList.add('pulsing');
    text.innerText = "Compiling Notes";
    errorText.innerText = "";
    
    let displayModel = localStorage.getItem('geminiModelName') || 'gemini-3.7-flash';
    modelDisplay.innerText = `Model: ${displayModel}`;

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    await delay(50);
    void modal.offsetWidth; 
    await delay(300);

    try {
        const rawOutput = await executeGeminiRequest(prompt, apiKey, NOTES_SCHEMA, 8192);
        const result = JSON.parse(rawOutput);

        // Hide the modal immediately upon success
        bar.classList.remove('pulsing');
        overlay.classList.add('hidden');
        modal.classList.add('hidden');

        if (result && result.notes) {
            globalNotes = result.notes;
            syncStateToDrive(); 
            renderNotesModal(globalNotes);
        } else {
            throw new Error("Invalid output format returned by AI.");
        }
    } catch (err) {
        console.error("Notes Generation Error:", err);
        bar.classList.remove('pulsing');
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        alert(`Failed to generate notes: ${err.message}`);
    } finally {
        notesBtn.innerHTML = originalNotesBtnHTML;
        notesBtn.disabled = false;
        regenBtn.innerHTML = originalRegenBtnHTML;
        regenBtn.disabled = false;
    }
}

function renderNotesModal(notesText) {
    let html = notesText;

    // 1. Format Bold Text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text);">$1</strong>');
    
    // 2. Format Headers (### Topic Name)
    html = html.replace(/^###\s+(.*$)/gim, '<h3 style="color: var(--indigo); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 24px 0 12px 0;">$1</h3>');
    html = html.replace(/^##\s+(.*$)/gim, '<h2 style="color: var(--indigo); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 24px 0 12px 0;">$1</h2>');
    html = html.replace(/^#\s+(.*$)/gim, '<h1 style="color: var(--indigo); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 24px 0 12px 0;">$1</h1>');
    
    // 3. Format Bullet Points (- item or * item)
    html = html.replace(/^[ \t]*[-*]\s+(.*)$/gim, '<li style="margin-bottom: 8px; line-height: 1.6;">$1</li>');
    
    // Wrap consecutive <li> tags into a parent <ul> tag
    html = html.replace(/(<li.*?>.*?<\/li>\s*)+/gim, '<ul style="padding-left: 24px; margin: 12px 0;">$&</ul>');

    // 4. Convert double line-breaks into paragraph spaces
    html = html.replace(/\n\n/g, '<br><br>');

    const contentDiv = document.getElementById('notesContent');
    contentDiv.innerHTML = html;
    
    // CRITICAL FIX: Disable pre-wrap so raw newlines from the AI don't break sentences in half
    contentDiv.style.whiteSpace = 'normal'; 
    
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
        alert("No API key found. Please click the key icon to add it.");
        return;
    }

    const total = quizData.length;
    let savedProgress = parseInt(localStorage.getItem('checkAllProgress')) || 0;
    
    if (savedProgress >= total) {
        savedProgress = 0;
    }

    let confirmMsg = "Are you sure you want to proceed? This will check ALL questions in batches. It may take some time depending on quiz length.";
    if (savedProgress > 0) {
        confirmMsg = `Resume pending AI check from question ${savedProgress + 1}?\n\nClick OK to continue where you left off.`;
    }

    if(!confirm(confirmMsg)) return;

    const overlay = document.getElementById('progressOverlay');
    const modal = document.getElementById('progressModal');
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const errorText = document.getElementById('progressErrorText');
    const modelDisplay = document.getElementById('progressModelText');
    
    document.getElementById('progressTitle').innerText = "Syncing...";
    document.getElementById('progressDesc').innerText = "Processing sequentially in batches. Please do not close the page.";
    bar.classList.remove('pulsing');

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    let completed = savedProgress;
    bar.style.width = `${Math.round((completed / total) * 100)}%`;
    text.innerText = `${completed} / ${total}`;
    errorText.innerText = "";
    
    let displayModel = localStorage.getItem('geminiModelName') || 'gemini-2.5-flash';
    modelDisplay.innerText = `Model: ${displayModel}`;
    
    await delay(50);
    void modal.offsetWidth; 
    await delay(300); 

    let dataUpdated = false;
    let changedQuestions = [];
    const batchSize = 20;

    for (let i = savedProgress; i < total; i += batchSize) {
        const batch = quizData.slice(i, i + batchSize);
        const batchPrompt = batch.map((q, idx) => {
            const optionsString = (q.options || []).length > 0 ? q.options.map((opt, oIdx) => `[Index ${oIdx}]: ${opt}`).join('\n') : "No options provided.";
            return `Question ID: ${i + idx}\nQuestion: ${q.question}\nOptions:\n${optionsString}`;
        }).join('\n\n');

        const prompt = `You are an expert technical exam evaluator. Given the following batch of questions, evaluate each question carefully against official documentation.

Questions:
${batchPrompt}

Instructions:
1. Identify the exact correct option index or indices for each question. If options are missing, return an empty array.
2. Provide a concise explanation (under 600 characters) stating why the chosen option is correct and why the alternatives are incorrect.
3. Return strictly a JSON array of objects in the exact question order:
[
  {
    "correctAnswers": [number],
    "explanation": "string"
  }
]`;
        let success = false;
        while (!success) {
            try {
                errorText.innerText = "";
                const rawOutput = await executeGeminiRequest(prompt, apiKey, batchAnswerSchema(batch.length), 16384);
                const results = JSON.parse(rawOutput);

                if (!Array.isArray(results) || results.length !== batch.length) {
                        throw new Error("AI returned incorrect number of results in batch array.");
                }

                results.forEach((result, idx) => {
                    const q = quizData[i + idx];
                    const oldAnswers = q.correctAnswers || [];
                    
                    let rawNewAnswers = result.correctAnswers || [];
                    const maxIdx = (q.options || []).length - 1;
                    const newAnswers = rawNewAnswers.filter(val => val >= 0 && val <= maxIdx);

                    const isSame = newAnswers.length === oldAnswers.length && newAnswers.every(val => oldAnswers.includes(val));

                    if (!isSame && (q.options || []).length > 0) {
                        changedQuestions.push({
                            index: i + idx, question: q.question, options: q.options || [],
                            oldAnswers: [...oldAnswers], newAnswers: [...newAnswers]
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
                    errorText.style.color = "var(--red)";
                    errorText.innerText = `Request failed (${err.message}). Retrying in ${sec}s...`;
                    await delay(1000);
                }
                errorText.innerText = "Retrying now...";
            }
        }

        completed += batch.length;
        
        localStorage.setItem('checkAllProgress', completed);
        if (dataUpdated) {
            await syncStateToDrive(); 
            dataUpdated = false; 
        } else {
            saveState(); 
        }

        bar.style.width = `${Math.round((completed / total) * 100)}%`;
        text.innerText = `${completed} / ${total}`;

        if (completed < total) {
            for (let sec = 15; sec > 0; sec--) {
                errorText.style.color = "var(--yellow)";
                errorText.innerText = `Rate limit: Waiting ${sec}s before next batch...`;
                await delay(1000);
            }
            errorText.style.color = "var(--red)";
            errorText.innerText = "";
        }
    }

    localStorage.removeItem('checkAllProgress');

    overlay.classList.add('hidden');
    modal.classList.add('hidden');
    
    renderQ();
    renderSidebar();
    
    if (changedQuestions.length > 0) showReviewModal(changedQuestions);
    else alert("Answers and explanations have been successfully synced!");
}

function showReviewModal(changes) {
    const content = document.getElementById('reviewContent');
    content.innerHTML = '';
    changes.forEach(change => {
        const oldText = change.oldAnswers.map(idx => change.options[idx]).join(' <br> ') || 'None';
        const newText = change.newAnswers.map(idx => change.options[idx]).join(' <br> ') || 'None';
        const div = document.createElement('div');
        div.style.padding = '20px'; div.style.border = '1px solid var(--border)';
        div.style.borderRadius = '8px'; div.style.background = 'var(--bg)';
        div.innerHTML = `
            <p style="font-weight: 600; margin-top: 0; font-size: 1.1em; color: var(--text);">Question ${change.index + 1}: ${change.question}</p>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px;">
                <div style="flex: 1; min-width: 200px; padding: 15px; background: rgba(239, 68, 68, 0.15); border-radius: 6px; border: 1px solid var(--red); color: var(--text);">
                    <strong style="display: block; margin-bottom: 8px; color: var(--red);">Old Answer: ${formatIndicesToLetters(change.oldAnswers)}</strong>${oldText}
                </div>
                <div style="flex: 1; min-width: 200px; padding: 15px; background: rgba(16, 185, 129, 0.15); border-radius: 6px; border: 1px solid var(--green); color: var(--text);">
                    <strong style="display: block; margin-bottom: 8px; color: var(--green);">New Answer: ${formatIndicesToLetters(change.newAnswers)}</strong>${newText}
                </div>
            </div>`;
        content.appendChild(div);
    });
    document.getElementById('reviewOverlay').classList.remove('hidden');
    document.getElementById('reviewModal').classList.remove('hidden');
}

function closeReviewModal() {
    document.getElementById('reviewOverlay').classList.add('hidden');
    document.getElementById('reviewModal').classList.add('hidden');
}

/* Accordion Toggle Logic */
function toggleExplanation() {
    const expText = document.getElementById('explanationText');
    const toggleBtnSpan = document.querySelector('#toggleExplanationBtn span');
    const toggleBtn = document.getElementById('toggleExplanationBtn');
    
    if (expText.classList.contains('expanded')) {
        expText.classList.remove('expanded');
        if (toggleBtn) toggleBtn.classList.remove('open');
        if (toggleBtnSpan) toggleBtnSpan.innerText = "Show Explanation";
    } else {
        expText.classList.add('expanded');
        if (toggleBtn) toggleBtn.classList.add('open');
        if (toggleBtnSpan) toggleBtnSpan.innerText = "Hide Explanation";
    }
}

async function fetchGeminiAnswer() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) { 
        alert("No API key found. Please click the key icon to add it."); 
        return; 
    }
    
    const q = quizData[curIdx];
    if (!q.options || q.options.length === 0) { 
        alert("Cannot use AI because this question has no options. Please use the edit tool to add options first."); 
        return; 
    }

    const geminiBtn = document.getElementById('geminiHelpBtn');
    const originalGeminiBtnHTML = geminiBtn.innerHTML;
    
    geminiBtn.innerHTML = '⏳';
    geminiBtn.style.opacity = '0.8';
    geminiBtn.disabled = true;

    const overlay = document.getElementById('progressOverlay');
    const modal = document.getElementById('progressModal');
    const title = document.getElementById('progressTitle');
    const desc = document.getElementById('progressDesc');
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const errorText = document.getElementById('progressErrorText');
    const modelDisplay = document.getElementById('progressModelText');

    title.innerText = "✨ Analyzing Question...";
    desc.innerText = "AI is evaluating the options against official documentation.";
    bar.style.width = '100%';
    bar.classList.add('pulsing');
    text.innerText = "Single Verification";
    errorText.innerText = "";
    
    let displayModel = localStorage.getItem('geminiModelName') || 'gemini-2.5-flash';
    modelDisplay.innerText = `Model: ${displayModel}`;

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    await delay(50);
    void modal.offsetWidth; 
    await delay(300);

    const cleanQuestion = decodeHTMLEntities(q.question).trim();
    const optionsString = q.options.map((opt, i) => `[Index ${i}]: ${decodeHTMLEntities(opt)}`).join('\n');
    
    const prompt = `You are an expert technical exam evaluator. 

Evaluate the following question and options carefully:
Question: ${cleanQuestion}

Options:
${optionsString}

Instructions:
1. Determine the exact correct option index or indices based strictly on official documentation and best practices.
2. Provide a concise, clear explanation (under 600 characters) stating why the chosen option is correct and briefly why the alternatives are incorrect.
3. Return ONLY a valid JSON object matching this schema:
{
  "correctAnswers": [number],
  "explanation": "string"
}`;

    try {
        const rawOutput = await executeGeminiRequest(prompt, apiKey, SINGLE_ANSWER_SCHEMA);
        const result = JSON.parse(rawOutput);

        bar.classList.remove('pulsing');
        overlay.classList.add('hidden');
        modal.classList.add('hidden');

        const oldAnswers = q.correctAnswers || [];
        let rawNewAnswers = result.correctAnswers || [];
        const maxIdx = (q.options || []).length - 1;
        const newAnswers = rawNewAnswers.filter(val => val >= 0 && val <= maxIdx);

        const isSame = newAnswers.length === oldAnswers.length && newAnswers.every(val => oldAnswers.includes(val));

        let dataUpdated = false;
        let applyExplanation = true; 
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
            } else {
                applyExplanation = false;
            }
        }
        if (applyExplanation && q.explanation !== result.explanation) {
            q.explanation = result.explanation;
            dataUpdated = true;
        }
        if (dataUpdated) syncStateToDrive(); else saveState();
        
        renderQ();
        
        const expText = document.getElementById('explanationText');
        const toggleBtn = document.getElementById('toggleExplanationBtn');
        const toggleBtnSpan = document.querySelector('#toggleExplanationBtn span');
        
        if (expText) expText.classList.add('expanded');
        if (toggleBtn) toggleBtn.classList.add('open');
        if (toggleBtnSpan) toggleBtnSpan.innerText = "Hide Explanation";

    } catch (err) {
        console.error("AI Error:", err);
        bar.classList.remove('pulsing');
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        alert(`Failed to reach AI: ${err.message}`);
    } finally {
        geminiBtn.innerHTML = originalGeminiBtnHTML;
        geminiBtn.style.opacity = '1';
        geminiBtn.disabled = false;
        bar.classList.remove('pulsing');
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
    }
}

function showReuploadScreen() {
    if(!confirm("Warning: Pasting new JSON will overwrite your current cloud file and reset all progress. Do you wish to continue?")) return;
    document.getElementById('quizApp').classList.add('hidden');
    document.getElementById('jsonInputScreen').classList.remove('hidden');
    document.getElementById('jsonInput').value = ""; 
}

function cancelReupload() {
    document.getElementById('jsonInputScreen').classList.add('hidden');
    startApp();
}

function handleNewJsonSubmit() {
    try {
        const rawData = JSON.parse(document.getElementById('jsonInput').value);
        if(!Array.isArray(rawData) || rawData.length === 0) throw new Error("Data must be a non-empty array");

        quizData = rawData.map(q => ({
            ...q, options: q.options || [], correctAnswers: q.correctAnswers || [],
            userAnswer: null, status: null, marked: false, explanation: null
        }));
        curIdx = 0; globalNotes = null; 
        
        localStorage.removeItem('checkAllProgress'); 
        document.getElementById('jsonInputScreen').classList.add('hidden');
        syncStateToDrive(); startApp();
    } catch(e) { 
        alert("Invalid JSON format! Please ensure you pasted a valid JSON array matching the placeholder structure."); 
        console.error(e);
    }
}

function startApp() {
    document.getElementById('configScreen').classList.add('hidden');
    document.getElementById('jsonInputScreen').classList.add('hidden');
    document.getElementById('quizApp').classList.remove('hidden');
    renderSidebar(); renderQ();
}

function restartQuiz() {
    if(!confirm("Restart the quiz? Progress will be lost, but your modified JSON answers and marked questions will be kept.")) return;
    quizData.forEach(q => { q.userAnswer = null; q.status = null; });
    curIdx = 0; isEditingQuestion = false;
    syncStateToDrive(); renderSidebar(); renderQ();
}

function decodeHTMLEntities(text) {
    if (!text) return "";
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
}

function fallbackCopy(text, onSuccess, onError) {
    const el = document.createElement('div');
    el.textContent = text;
    
    el.style.whiteSpace = 'pre-wrap';
    
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    
    document.body.appendChild(el);
    
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    
    try {
        const successful = document.execCommand('copy');
        if (successful && onSuccess) {
            onSuccess();
        } else if (onError) {
            onError(new Error("Browser rejected copy."));
        }
    } catch (err) {
        if (onError) onError(err);
    }
    
    selection.removeAllRanges();
    document.body.removeChild(el);
}

function copyToClipboard(text, onSuccess, onError) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess, onError));
    } else {
        fallbackCopy(text, onSuccess, onError);
    }
}

function copyQuestion() {
    const q = quizData[curIdx];
    
    let decodedQ = decodeHTMLEntities(q.question).trim();
    let copyText = "";
    
    if (/^[^a-zA-Z]*question/i.test(decodedQ)) {
        copyText = `${decodedQ}\n\n`;
    } else {
        copyText = `Question: ${decodedQ}\n\n`;
    }
    
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    (q.options || []).forEach((opt, i) => { 
        copyText += `${letters[i] || (i+1)}) ${decodeHTMLEntities(opt).trim()}\n`; 
    });
    
    copyToClipboard(
        copyText, 
        () => {
            const btn = document.getElementById('copyQBtn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
        }, 
        (err) => alert("Failed to copy question. Check permissions.")
    );
}

function exportJSON() {
    const cleanData = quizData.map(({ userAnswer, status, marked, explanation, ...rest }) => rest);
    copyToClipboard(JSON.stringify(cleanData, null, 4), () => alert("Cleaned JSON copied to clipboard!"), (err) => alert("Failed to copy."));
}

function goToQuestion(index) {
    if (isEditingQuestion) {
        if(!confirm("You have unsaved edits. Discard changes?")) return;
        isEditingQuestion = false;
    }
    curIdx = index; syncStateToDrive(); renderSidebar(); renderQ();
}

function renderSidebar() {
    const navGrid = document.getElementById('navGrid');
    navGrid.innerHTML = '';
    
    document.getElementById('progressMeta').innerText = `(${curIdx + 1}/${quizData.length})`;
    
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

    setTimeout(() => {
        const activeBtn = navGrid.querySelector('.nav-btn.active');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 50);
}

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
    if (tempEditOptions.length === 0) container.innerHTML = `<em style="color: var(--secondary); font-size: 0.9em;">No options exist. Click "+ Add Option" below.</em>`;

    tempEditOptions.forEach((opt, idx) => {
        const row = document.createElement('div');
        row.style = "display: flex; gap: 10px; align-items: center; margin-bottom: 10px;";
        const isCorrect = tempEditAnswers.includes(idx);
        
        const check = document.createElement('input'); check.type = 'checkbox'; check.checked = isCorrect; check.style = "transform: scale(1.3); cursor: pointer;";
        check.onchange = (e) => { if(e.target.checked) tempEditAnswers.push(idx); else tempEditAnswers = tempEditAnswers.filter(val => val !== idx); };
        
        const textIn = document.createElement('input'); textIn.type = 'text'; textIn.value = opt; textIn.style = "flex: 1; margin: 0; padding: 10px;";
        textIn.oninput = (e) => tempEditOptions[idx] = e.target.value;
        
        const delBtn = document.createElement('button'); 
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="var(--red)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>'; 
        delBtn.className = 'icon-btn'; 
        delBtn.title = "Delete Option";
        delBtn.onclick = () => {
            tempEditOptions.splice(idx, 1);
            tempEditAnswers = tempEditAnswers.filter(val => val !== idx).map(val => val > idx ? val - 1 : val);
            renderEditOptionsUI();
        };
        row.appendChild(check); row.appendChild(textIn); row.appendChild(delBtn); container.appendChild(row);
    });
}

function saveEditedData() {
    const q = quizData[curIdx];
    q.question = document.getElementById('editQTextInput').value.trim();
    q.options = tempEditOptions.map(o => o.trim());
    q.correctAnswers = [...tempEditAnswers];
    if (q.options.length === 0) { alert("Please add at least one option."); return; }

    q.userAnswer = null; q.status = null; isEditingQuestion = false;
    syncStateToDrive(); renderQ(); renderSidebar();
}

function renderQ() {
    const q = quizData[curIdx];
    const currentScore = quizData.filter(x => x.status === 'correct').length;
    const hasMissingOptions = !q.options || q.options.length === 0;
    const hasMissingAnswer = !q.correctAnswers || q.correctAnswers.length === 0;
    
    let metaText = `Score: ${currentScore} &middot; Question: ${curIdx + 1}`;
    if (isEditingQuestion) metaText += ` <span class="edit-badge" style="margin-left: 10px;">EDITING</span>`;
    document.getElementById('qMetaText').innerHTML = metaText;
    
    const qTextNode = document.getElementById('qText');
    const editPenBtn = document.getElementById('editPenBtn');
    const optionsDiv = document.getElementById('options');
    const editFormContainer = document.getElementById('editFormContainer');
    const warningEl = document.getElementById('missingAnswerWarning');
    const explanationContainer = document.getElementById('explanationContainer');

    warningEl.style.background = "";
    warningEl.style.color = "";
    warningEl.style.borderColor = "";

    if (isEditingQuestion) {
        qTextNode.classList.add('hidden'); editPenBtn.classList.add('hidden'); 
        optionsDiv.classList.add('hidden'); warningEl.classList.add('hidden'); explanationContainer.classList.add('hidden');
        editFormContainer.classList.remove('hidden');
        document.getElementById('editQTextInput').value = q.question || "";
        renderEditOptionsUI();
    } else {
        qTextNode.classList.remove('hidden'); editPenBtn.classList.remove('hidden'); 
        optionsDiv.classList.remove('hidden'); editFormContainer.classList.add('hidden');
        
        qTextNode.innerText = q.question;
        
        if (hasMissingOptions && hasMissingAnswer) { warningEl.innerText = "⚠️ Options and correct answer are missing. Click the pencil icon to fix."; warningEl.classList.remove('hidden'); }
        else if (hasMissingOptions) { warningEl.innerText = "⚠️ Options are missing. Click the pencil icon to fix."; warningEl.classList.remove('hidden'); }
        else if (hasMissingAnswer) { warningEl.innerText = "⚠️ Correct answer not provided. Use AI to fetch it, or click the pencil icon to fix."; warningEl.classList.remove('hidden'); }
        else { warningEl.classList.add('hidden'); }

        optionsDiv.innerHTML = '';
        const inputType = (!hasMissingAnswer && q.correctAnswers.length > 1) ? 'checkbox' : 'radio';
        const isAnswered = q.status !== null;
        
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        (q.options || []).forEach((o, i) => {
            const label = document.createElement('label'); label.className = 'option-label';
            const input = document.createElement('input'); input.type = inputType; input.name = 'quizOption'; input.value = i;
            
            if (isAnswered) {
                input.disabled = true; label.classList.add('disabled');
                if (q.userAnswer && q.userAnswer.includes(i)) input.checked = true;
                if (!hasMissingAnswer && q.correctAnswers.includes(i)) label.classList.add('correct');
                else if (q.userAnswer && q.userAnswer.includes(i)) label.classList.add('incorrect');
            } else if (hasMissingAnswer || hasMissingOptions) {
                input.disabled = true; label.classList.add('disabled');
            }
            
            label.appendChild(input); 
            const strongLetter = document.createElement('strong');
            strongLetter.style = "margin-right: 15px; color: var(--text);";
            strongLetter.innerText = letters[i] || '';
            label.appendChild(strongLetter);
            
            label.appendChild(document.createTextNode(o));
            optionsDiv.appendChild(label);
        });
        
        const explanationText = document.getElementById('explanationText');
        const toggleBtnSpan = document.querySelector('#toggleExplanationBtn span');
        const toggleBtn = document.getElementById('toggleExplanationBtn');
        
        if (explanationText) explanationText.classList.remove('expanded');
        if (toggleBtn) toggleBtn.classList.remove('open');
        if (toggleBtnSpan) toggleBtnSpan.innerText = "Show Explanation";

        if (q.explanation && q.explanation.trim() !== "") {
            explanationContainer.classList.remove('hidden');
            if (explanationText) explanationText.innerText = q.explanation; 
        } else {
            explanationContainer.classList.add('hidden');
        }
    }

    const submitBtn = document.getElementById('submitBtn');
    const nextBtn = document.getElementById('nextBtn');
    const markBtn = document.getElementById('markBtn');
    const fixJsonBtn = document.getElementById('fixJsonBtn');
    const saveDataBtn = document.getElementById('saveDataBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    
    if (q.marked) {
        markBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Unmark Question';
    } else {
        markBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> Mark Question';
    }

    if (isEditingQuestion) {
        submitBtn.classList.add('hidden'); nextBtn.classList.add('hidden'); markBtn.classList.add('hidden');
        fixJsonBtn.classList.add('hidden'); saveDataBtn.classList.remove('hidden'); cancelEditBtn.classList.remove('hidden');
    } else if (hasMissingAnswer || hasMissingOptions) {
        submitBtn.classList.add('hidden'); fixJsonBtn.classList.remove('hidden'); nextBtn.classList.remove('hidden'); markBtn.classList.remove('hidden');
        saveDataBtn.classList.add('hidden'); cancelEditBtn.classList.add('hidden');
        nextBtn.innerHTML = 'Skip Question';
    } else if (q.status !== null) { 
        submitBtn.classList.add('hidden'); fixJsonBtn.classList.remove('hidden'); nextBtn.classList.remove('hidden'); markBtn.classList.remove('hidden');
        saveDataBtn.classList.add('hidden'); cancelEditBtn.classList.add('hidden');
        nextBtn.innerHTML = (curIdx === quizData.length - 1) ? 'Finish Quiz' : '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Next Question';
    } else {
        submitBtn.classList.remove('hidden'); fixJsonBtn.classList.add('hidden'); nextBtn.classList.add('hidden'); markBtn.classList.remove('hidden');
        saveDataBtn.classList.add('hidden'); cancelEditBtn.classList.add('hidden');
    }
}

function toggleMark() {
    quizData[curIdx].marked = !quizData[curIdx].marked;
    syncStateToDrive(); renderQ(); renderSidebar(); 
}

function submitAnswer() {
    const q = quizData[curIdx];
    const inputs = document.querySelectorAll('input[name="quizOption"]');
    const selected = Array.from(inputs).filter(i => i.checked).map(i => parseInt(i.value));
    
    if(selected.length === 0) { alert("Please select an answer before submitting."); return; }

    const isCorrect = selected.length === q.correctAnswers.length && selected.every(val => q.correctAnswers.includes(val));
    q.userAnswer = selected; q.status = isCorrect ? 'correct' : 'incorrect';
    
    syncStateToDrive(); renderQ(); renderSidebar();
}

function nextQuestion() {
    if (curIdx < quizData.length - 1) goToQuestion(curIdx + 1);
    else {
        const finalScore = quizData.filter(x => x.status === 'correct').length;
        alert(`Quiz Finished! Final Score: ${finalScore} out of ${quizData.length}`);
    }
}