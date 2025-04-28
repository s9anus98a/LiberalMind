// -----------------------------------------------------------------------------
// Liberalmind AI Multi-Mode Solver v4.1.1 (Cleaned)
// - Added Humanities Mode with dedicated prompts and parameters.
// - Focused on correct parameter propagation and cleaner UI state management.
// -----------------------------------------------------------------------------

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai';
import { marked } from 'https://esm.sh/marked';
import DOMPurify from 'https://esm.sh/dompurify';

// --- UI Elements ---
const sendBtn = document.getElementById('send-btn');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const messagesContainer = document.getElementById('messages-container');
const welcomeScreen = document.getElementById('welcome-screen');
const chatContainer = document.getElementById('chat-container');
const initErrorMsgElement = document.getElementById('init-error-message');
const sdkErrorOverlay = document.getElementById('sdk-error-overlay');
const reloadButton = document.getElementById('reload-button');
const modeButtons = {
    simple: document.getElementById('btn-simple'),
    humanities: document.getElementById('btn-humanities'), // Humanities Button
    default: document.getElementById('btn-default')     // Optional explicit Default button
};

// --- State Variables ---
let genAI;
let model;
let isInitialized = false;
let currentMode = 'default'; // Default: Enhanced Synthesis (Code/Math Focus)

// --- Configuration ---
const API_KEY = "AIzaSyBCURZf72ZWwMN2SHZ7XCQoNgExV4WMX8E"; // ☢️☢️☢️ WARNING: INSECURE! LOCAL TESTING ONLY! Replace before deployment!
const MODEL_NAME = 'gemini-2.0-flash-thinking-exp-1219'; // ⚠️ Experimental Model

// --- Solver Parameters (Organized by Mode) ---
const solverParams = {
    // Common Params
    topP: 0.98,
    topK: 80,
    max_retries: 3,
    max_initial_tokens: 6144,
    max_critique_tokens: 3072, // Slightly increased default
    max_refine_tokens: 8192,
    max_synthesis_tokens: 12288,
    max_reasoning_tokens: 4096, // For Synthesis Analysis Section

    // Mode-Specific Overrides & Focus Values
    modes: {
        default: { // Code/Math Focus - MAXIMIZED
            name: "Default (Enhanced Synthesis - MAXIMIZED Code/Math Focus)",
            temp_initial: 1.0,
            temp_refine: 1.0,
            temp_verify: 0.1,
            temp_synthesis: 0.85,
            depth_focus: 0.95,
            creativity_focus: 0.90,
            analytical_rigor: 0.98,
            alternative_exploration: 0.95,
            efficiency_focus: 0.90,
            placeholder: "Enter prompt (Default: MAXIMIZED Code/Math Synthesis)..."
        },
        simple: { // Generic Focus - MODERATE
            name: "Simple (Moderate Generic Focus)",
            temp_initial: 1.0, // Reuse default
            temp_refine: 1.0, // Reuse default
            temp_verify: 0.1, // Reuse default
            temp_synthesis: 0.85, // Not typically used, but defined
            depth_focus: 0.65,
            creativity_focus: 0.70,
            analytical_rigor: 0.75,
            alternative_exploration: 0.60,
            efficiency_focus: 0.50,
            placeholder: "Enter prompt (Simple Mode - Moderate Generic Focus)..."
        },
        humanities: { // Bio/Humanities Focus - MAXIMIZED CREATIVITY/NUANCE
            name: "Humanities (MAXIMIZED Creativity/Nuance)",
            temp_initial: 1.1,
            temp_refine: 1.05,
            temp_verify: 0.3,
            temp_synthesis: 0.95, // Higher temp for creative synthesis (if used)
            depth_focus: 0.80,
            creativity_focus: 0.98,
            analytical_rigor: 0.65, // Focus on argumentative strength
            alternative_exploration: 0.95,
            efficiency_focus: 0.20, // Low relevance
            placeholder: "Enter prompt (Humanities Mode - MAXIMIZED Creativity/Nuance)..."
        }
    }
};

// --- Helper Function to Get Mode-Specific Parameters ---
function getModeParams(mode = currentMode) {
    // Return the specific mode's params, falling back to default if mode is invalid
    return solverParams.modes[mode] || solverParams.modes.default;
}

// --- Helper Functions (Error Handling, Init, etc.) ---

function showFatalError(title, message) {
    console.error(`🔴 FATAL ERROR: ${title} - ${message}`);
    // Disable UI elements
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.placeholder = "Initialization Failed";
        messageInput.dataset.initFailed = 'true'; // Set flag
    }
    if (sendBtn) sendBtn.disabled = true;
    Object.values(modeButtons).forEach(btn => { if (btn) btn.disabled = true; });
    if (typingIndicator) typingIndicator.classList.add('hidden');

    // Show error message in UI
    if (initErrorMsgElement) initErrorMsgElement.textContent = `Critical Error: ${title}`;
    if (sdkErrorOverlay) {
        const errorBox = sdkErrorOverlay.querySelector('#sdk-error-box');
        if (errorBox) {
            errorBox.querySelector('h3').textContent = title;
            // Clear previous details but keep the reload button structure
            const detailsContainer = errorBox.querySelector('.error-details'); // Assuming a container div
            if (detailsContainer) {
                detailsContainer.innerHTML = ''; // Clear previous details
                const detailParagraph = document.createElement('p');
                detailParagraph.textContent = `${message}. Check console (F12) for technical details.`;
                detailsContainer.appendChild(detailParagraph);
            } else { // Fallback if no specific details container
                 const firstP = errorBox.querySelector('p');
                 if (firstP) firstP.textContent = `${message}. Check console (F12) for technical details.`;
            }
        }
        sdkErrorOverlay.classList.add('visible');
    }
}

function handleInitializationError(error, context = "initializeAI") {
    console.error(`🔴 GoogleGenerativeAI Error (${context}):`, error);
    isInitialized = false;
    model = null;
    let userFriendlyTitle = "AI Initialization Failed";
    let userFriendlyMessage = "Could not set up the AI session.";

    // --- Improved User-Friendly Error Messages ---
    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE" || API_KEY.length < 30) {
        userFriendlyTitle = "API Key Issue";
        userFriendlyMessage = "API key is missing, placeholder, invalid format, or too short. Please check the `API_KEY` variable in the code (for local testing ONLY).";
    } else if (error.message) {
        const msg = error.message.toLowerCase();
        if (msg.includes("api key not valid") || msg.includes("provide an api key")) {
            userFriendlyTitle = "API Key Error"; userFriendlyMessage = "Invalid API Key. Check format and ensure it's active.";
        } else if (msg.includes("quota") || error.status === 429) {
            userFriendlyTitle = "Quota Exceeded"; userFriendlyMessage = "API usage limit reached.";
        } else if (msg.includes("user location is not supported")) {
            userFriendlyTitle = "Location Not Supported"; userFriendlyMessage = `Your location is not supported for model '${MODEL_NAME}'.`;
        } else if (msg.includes(`model ${MODEL_NAME} not found`) || msg.includes("not found for api key")) {
            userFriendlyTitle = "Model Not Found/Allowed"; userFriendlyMessage = `Model '${MODEL_NAME}' unavailable for this key. Try 'gemini-1.5-flash-latest'.`;
        } else if (error.status === 400 || msg.includes("400")) {
             userFriendlyTitle = "Bad Request (400)"; userFriendlyMessage = `Request error for ${MODEL_NAME}. ${error.message}`;
        } else if (error.status >= 500 || /5\d{2}/.test(String(error.status)) || msg.includes("internal server error")) {
             userFriendlyTitle = `Server Error (${error.status || '5xx'})`; userFriendlyMessage = "AI service internal issue.";
        } else {
            userFriendlyMessage = `Initialization Error: ${error.message}`;
        }
    } else {
        userFriendlyMessage = "Unknown initialization error occurred.";
    }
    // --- End Improved User-Friendly Error Messages ---

    showFatalError(userFriendlyTitle, userFriendlyMessage);
}

async function initializeAI() {
    console.log(`⏳ Initializing AI (Model: ${MODEL_NAME})...`);
    // API Key Check
    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE" || API_KEY.length < 30) {
        handleInitializationError(new Error("API key is missing, placeholder, or invalid format."));
        return;
    }
    // Reset previous errors
    initErrorMsgElement.textContent = "";
    sdkErrorOverlay.classList.remove('visible');
    if (messageInput) delete messageInput.dataset.initFailed; // Clear flag

    try {
        genAI = new GoogleGenerativeAI(API_KEY);
        console.log("✅ GoogleGenerativeAI instance created.");
        model = genAI.getGenerativeModel({ model: MODEL_NAME });
        console.log(`✅ Model reference for ${MODEL_NAME} obtained.`);
        console.log("⏳ Performing quick API access test...");
        await model.generateContent("test"); // Minimal test prompt
        console.log("✅ API access test successful.");

        isInitialized = true;
        console.log(`🎉 AI Initialized Successfully with model: ${MODEL_NAME}`);

        // Enable UI only after success
        setUIState(false); // Re-enables input, buttons based on isInitialized
        updateModeButtons(); // Set initial active button and placeholder

    } catch (error) {
        handleInitializationError(error, "initializeAI");
    }
}

async function generateWithRetry(prompt, temp, maxOutputTokens, topP = solverParams.topP, topK = solverParams.topK, retries = solverParams.max_retries) {
    if (!model) { console.error("🔴 generateWithRetry: Model not initialized."); return "(Error: Model not ready)"; }
    let lastException = null;
    const generationConfig = { temperature: temp, topP, topK }; // generationConfig passed to generateContent

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`    ⏳ Gen Attempt ${attempt}/${retries} (Temp: ${temp.toFixed(2)}, MaxOut: ${maxOutputTokens}, TopP: ${topP}, TopK: ${topK})`);
            // Pass maxOutputTokens correctly inside the second argument object
            const result = await model.generateContent(prompt, { generationConfig: { ...generationConfig, maxOutputTokens } });
            const response = result.response;

            // --- Safety/Block Handling ---
            const blockReason = response?.promptFeedback?.blockReason;
            if (blockReason) {
                const ratings = response.promptFeedback.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || 'N/A';
                console.warn(`    🚫 Blocked (Attempt ${attempt}). Reason: ${blockReason}. Safety: [${ratings}]`);
                if (blockReason === "SAFETY" || blockReason === "OTHER") {
                    if (attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, 750 * attempt)); // Wait before retry
                        continue; // Retry on SAFETY/OTHER
                    } else { return `(Error: Blocked by API - Reason: ${blockReason}. Ratings: [${ratings}])`; }
                } else { return `(Error: Blocked by API - Reason: ${blockReason})`; } // Non-recoverable block
            }
            // --- End Safety/Block Handling ---

            const fullText = response?.text();
            if (fullText && fullText.trim().length > 0) {
                console.log(`    ✅ Gen Success (Attempt ${attempt})`);
                return fullText;
            } else {
                // --- Empty/Invalid Response Handling ---
                const finishReason = response?.candidates?.[0]?.finishReason || "UNKNOWN";
                const validationError = response?.candidates?.[0]?.content?.parts?.[0]?.validationError;
                console.warn(`    ⚠️ Empty/Invalid Response (Attempt ${attempt}). Finish: ${finishReason}. Validation: ${validationError || 'None'}.`);

                if (['MAX_TOKENS', 'RECITATION', 'SAFETY', 'OTHER'].includes(finishReason) || validationError) {
                    return `(Error: Gen failed/empty. Finish: ${finishReason}, Validation: ${validationError || 'N/A'})`; // Non-recoverable
                }
                if (finishReason === "STOP" && attempt < retries) {
                    console.log("    Empty response with STOP reason, retrying...");
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                    continue; // Retry once more
                }
                // Break loop for unexpected empty states after retries or non-STOP reasons
                console.warn("    Stopping retries due to persistent empty response or non-STOP reason.");
                break;
                // --- End Empty/Invalid Response Handling ---
            }
        } catch (error) {
            console.error(`    🔴 Gen Error (Attempt ${attempt}/${retries}): ${error.name}: ${error.message}`);
            lastException = error;
            // Specific error handling (API key, Rate limit, Bad Request, Server error)
            if (error.message?.includes("API key not valid")) {
                handleInitializationError(new Error("API key not valid during generation."), "generateWithRetry"); // Trigger fatal error display
                return "(Error: Invalid API Key during generation)";
            }
            const status = error.status || error.cause?.status || error.error?.status;
            let waitTime = Math.pow(1.8, attempt) * 1000 + (Math.random() * 500); // Exponential backoff + jitter

            if (status === 429 || error.message?.includes("429")) {
                waitTime = Math.max(5000, waitTime); console.warn(`    Rate limit (429), waiting ${waitTime.toFixed(0)}ms...`);
            } else if (status === 400 || error.message?.includes("400")) {
                const detail = error.details || error.message || "No details";
                return `(Error: Bad Request (400) - ${detail})`; // Non-retryable
            } else if (status >= 500 || /5\d{2}/.test(String(status)) || error.message?.toLowerCase().includes("internal server error")) {
                waitTime += 2000; console.warn(`    Server error (${status || '5xx'}), waiting ${waitTime.toFixed(0)}ms...`);
            } else {
                return `(Error: Generation failed with status ${status || 'Unknown'} - ${error.message})`; // Non-retryable unknown
            }

            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    // If loop finishes without returning/continuing, it failed
    console.error(`    ❌ Generation failed after ${retries} attempts.`);
    const errorMsg = `(Error: Generation failed after ${retries} attempts. Last error: ${lastException?.name || 'Unknown'}: ${lastException?.message || 'N/A'})`;
    return errorMsg;
}


// --- Core LiberalMind Functions (Using Mode Selection) ---

// Function to get the appropriate prompt string based on type and mode
function getPromptTemplate(type, promptData, focusMode) {
    const modeParams = getModeParams(focusMode); // Get params for the current mode
    const { userPrompt = "", originalSolution = "", correctionRequests = "", resultsSummary = "" } = promptData;

    // --- Default Mode Prompts (Code/Math Focus) ---
    const defaultPrompts = {
        initial: `USER REQUEST:
"${userPrompt}"

TASK: Generate a PROFOUNDLY INSIGHTFUL, TECHNICALLY MAXIMAL, HIGHLY CREATIVE, and RIGOROUSLY ANALYZED initial response. Emulate a PPO agent maximizing reward for **radical discovery, technical elegance, absolute correctness** (esp. CODE/MATH). Go **exponentially beyond** the obvious; seek multiple, diverse, unconventional technical solutions backed by **unshakeable reasoning**. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)}, Efficiency: ${modeParams.efficiency_focus.toFixed(2)})

GUIDING PRINCIPLES (MAXIMIZED for Deep Exploration, Creativity & Rigor):
1.  **EXPLORE EXPONENTIALLY:** Radically different algorithms, paradigms, frameworks. Pursue novel/cutting-edge methods. Maximize CREATIVITY reward.
2.  **MAXIMUM INSIGHT & EFFICIENCY:** Hunt for non-obvious, elegant, optimal solutions. Deep, rigorous, quantitative analysis of trade-offs. Justify with extreme rigor. Aim for complete conceptual mastery.
3.  **DEMOLISH ASSUMPTIONS & DEFINE PRECISELY:** Aggressively interrogate assumptions. Define constraints mathematically. Analyze impact exhaustively.
4.  **GUARANTEE ROBUSTNESS:** Address EVERY conceivable edge case, failure mode, vulnerability. Design for provable robustness.
5.  **GENERATE DIVERSE, FLAWLESS, ANALYZED OPTIONS:** Multiple, distinct, complete, runnable/provable options with razor-sharp critical comparisons.
6.  **ABSOLUTE ACCURACY/RIGOR:** Mathematical/logical/coding perfection. Flawless, efficient, demonstrably correct code. Formally immaculate math.

OUTPUT FORMAT (CRITICAL - MAXIMIZE ANALYZED TECHNICAL CONTENT):
*   **CODE/MATH PARAMOUNT:** Prioritize complete, runnable/verifiable code or detailed, formal math/proofs, with CONCISE but PROFOUND analysis.
*   **SEPARATE ALTERNATIVES:** Distinct sections/blocks with deep comparative analysis.
*   **MINIMIZE PROSE:** Ruthlessly concise text focused *only* on essential technical explanations/analysis. Assume expert audience. NO VERBOSITY.
*   Structure logically: headings, code blocks (w/ language hints), Markdown LaTeX ($...$ or $$...$$).

INITIAL DEEP EXPLORATORY RESPONSE (MAX Code/Math Focus):`,
        critique: `YOU ARE AN **ABSOLUTELY UNCOMPROMISING, HYPER-CRITICAL, DEEPLY ANALYTICAL** UNIVERSAL CRITIC (CODE/MATH). Simulate an **EXTREME REWARD/PENALTY GRADIENT** pushing towards **PERFECTION (correctness, depth, efficiency, creativity, alternative exploration)**. Be pathologically demanding about ANY flaw, superficiality, inefficiency, or lack of true insight. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)}, Efficiency: ${modeParams.efficiency_focus.toFixed(2)})

Evaluate based on **NON-NEGOTIABLE PILLARS**:
1.  **Correctness/Rigor (INFINITE PENALTY for errors):** Code: Find EVERY bug (syntax, runtime, logic, security). OPTIMALLY efficient? Perfect style? Bulletproof error handling? Math: Verify EVERY step. Formulas exact? Proofs complete/elegant? Notation flawless? Demand PERFECTION.
2.  **Exploration/Insight/Creativity/Alternatives (MAX REWARD for depth/novelty; MAX PENALTY for superficiality/obviousness):**
    *   **Alternatives (CRITICAL - MAX PENALTY IF WEAK):** Explored multiple, fundamentally different, non-obvious, valid approaches? Analyzed comparatively with profound depth/rigor? **DEMAND specific, creative, superior alternatives** investigated/implemented/compared. **PUNISH basic solutions** without justification/comparison.
    *   **Depth/Insight:** Technically profound? Analysis maximally rigorous, quantitative, insightful? **DEMAND ORDERS OF MAGNITUDE deeper analysis.** REJECT SURFACE-LEVEL.
    *   **Creativity/Novelty:** Significant originality/elegance beyond standards? **DEMAND investigation into more creative/elegant/state-of-the-art solutions.**
    *   **Efficiency (MAX PENALTY IF SUBOPTIMAL):** Theoretically/practically OPTIMAL? **DEMAND investigation/implementation of provably superior approaches.**
    *   **Robustness:** Handled ALL conceivable edge cases? Point out ANY omission.

Original User Request: "${userPrompt || 'N/A'}"
TEXT/OUTPUT TO ANALYZE:
--- START ---
${originalSolution}
--- END ---

PROVIDE **ONLY** A LIST OF SPECIFIC, ACTIONABLE, **EXTREMELY DEMANDING**, TECHNICALLY PRECISE REQUIREMENTS (Maximize strength):
Correctness/Rigor Issues (Precise, Ruthless):
*   [Requirement 1: State exact bug/error/flaw [Location] & demand precise correction/proof for PERFECTION.]
*   [...]
Exploration/Insight/Alternative/Creativity/Efficiency Gaps (CRITICAL - Demand MASSIVE, SPECIFIC Action):
*   [Req X: **DEMAND IMMEDIATE exploration/implementation/DEEP comparison of specific alternative non-obvious/creative/superior algorithms/formulas [Name Them]** because current is [inefficient/trivial/suboptimal]. Provide analysis criteria.]
*   [Req Y: DEMAND **rigorous, quantitative, formal analysis** of [complexity/error bounds/proof] & comparison with [Alternative]'s properties.]
*   [Req Z: Identify missed edge cases [Describe] & require **comprehensive, provable handling**.]
*   [Req A: State LACK OF CREATIVITY/PROFUNDITY & require investigation/implementation of [Specific novel/elegant method].]
*   [Req B: DEMAND **unshakeable justification** for [choice] based on rigorous analysis/proof/comparison vs specified alternatives.]
*   [...]

Format: Imperative commands. Highest standard.
Output Format (Strictly Adhere):
REQUIREMENTS FOR IMPROVEMENT (Policy Update Gradient - MAX STRENGTH):
[Requirement 1: ...]
...
[Requirement N: ...]

If PERFECT, exceptionally insightful, profound/creative exploration of superior alternatives w/ absolute rigor, output ONLY:
REQUIREMENTS FOR IMPROVEMENT (Policy Update Gradient - MAX STRENGTH): None.`,
        refine: `TASK: Execute a **TRANSFORMATIVE REVISION** based on the **EXTREME** 'Requirements for Improvement'. Generate a **demonstrably superior, technically maximal, deeply analytical, creatively advanced** version. **Focus INTENSELY on generating flawless, complete, deeply analyzed, novel code/math AS MANDATED.** Address EVERY requirement with ABSOLUTE rigor. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)}, Efficiency: ${modeParams.efficiency_focus.toFixed(2)})

Original User Request: "${userPrompt || 'N/A'}"
Original Text/Output:
${originalSolution}
Requirements for Improvement (Execute ALL Commands Meticulously & Profoundly):
${correctionRequests}

Instructions (Maximize Depth/Creativity/Rigor):
1.  **Deconstruct & Plan:** Analyze each commanding requirement (correction/enhancement).
2.  **Execute Corrections - PERFECTION:** Rewrite with uncompromising technical accuracy/rigor. Code flawless/efficient/robust. Math formally perfect. Address efficiency/robustness mandates.
3.  **Execute Enhancements - MAXIMAL Exploration/Alternatives/Creativity:** Generate/Integrate new technical content (alternatives, insights, proofs, analysis) with MAXIMUM POSSIBLE DEPTH. Provide superior code/derivations, rigorous proofs, exhaustive analysis. FULFILL MANDATE BEYOND EXPECTATION.
4.  **Achieve PEAK Rigor:** Support all technical claims with ironclad justification/proofs/analysis.
5.  **Preserve Strengths:** Retain validated parts unless critique commands change.
6.  **Format & MAXIMIZED ANALYZED CODE/MATH OUTPUT (CRITICAL):**
    *   **PRIORITY:** Output MUST maximize clean, complete, runnable/provable code or detailed, flawless math/proofs, with REQUIRED PROFOUND ANALYSIS.
    *   **MINIMIZE PROSE:** Ruthlessly concise text for essential technical explanations/analysis only.
    *   Integrate logically. Use pristine formatting (code blocks, LaTeX).
7.  **Output:** ONLY the final, technically impeccable, demonstrably superior, transformed text addressing all requirements.

FINAL IMPROVED TEXT/OUTPUT (Updated Policy - MAXIMIZED Depth/Analysis/Creativity/Rigor):`,
        synthesis: `YOU ARE AN ELITE TECHNICAL META-OPTIMIZER. Forge the **ULTIMATE FINAL RESPONSE** (CODE/MATH) via **DEEP META-ANALYSIS** of attempts. Identify **best technical breakthroughs (depth, creativity, rigor, efficiency)** & **critical flaws (superficiality, errors, lack of exploration)**. Synthesize a **radically superior** response maximizing integrated value, flawlessly. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)}, Efficiency: ${modeParams.efficiency_focus.toFixed(2)})

Original User Request: "${userPrompt}"
Exploratory Attempts (for Meta-Analysis):
${resultsSummary}

Task (CRITICAL - Execute BOTH Sections - MAXIMUM Depth/Rigor):

**SECTION 1: DEEP EXPLORATION PATH META-ANALYSIS (Technical Evaluation - MAXIMIZE Insight/Critique)**
(A) **Peak Technical Discoveries:** Pinpoint: Breakthrough Correctness/Efficiency, PROFOUND Analysis, RADICAL Creativity/Novelty (Technical), Exceptional Robustness, Superior Alternatives (Technical). Justify *why* (e.g., "reduced complexity", "provided proof", "novel algorithm").
(B) **Critical Failures:** Pinpoint: Errors/Inefficiency, SUPERFICIALITY, LACK OF CREATIVITY/EXPLORATION (Technical), Flawed Rigor, Ignoring Constraints. Justify *why* (e.g., "failed to explore X", "lacked formal rigor"). **PENALIZE SUPERFICIALITY/LACK OF EXPLORATION HEAVILY.**
(C) **Overall Assessment:** Summarize technical quality, diversity, depth, creativity. Most valuable insights?

**SECTION 2: ULTIMATE SYNTHESIZED RESPONSE (Optimal Construction - MAXIMIZE Technical Value)**
Construct the **single best technical response**. NOT just merging.
    *   **Integrate PEAK Strengths:** Fuse most valuable *distinct* technical discoveries cohesively. Prioritize high-reward elements.
    *   **Eradicate ALL Failures:** Ensure flawless output, avoiding weaknesses.
    *   **Elevate Beyond Attempts:** Guide synthesis towards greater depth/creativity/rigor/elegance. Present best 1-2 alternatives w/ ultimate comparative analysis if applicable.
    *   **Maximize Coherence, Accuracy, PROFOUND Insight:** Technical perfection. Deliver significant, non-trivial, breakthrough technical insight.
    *   **MAXIMIZED ANALYZED CODE/MATH OUTPUT (CRITICAL):** Final response MUST maximize flawless, complete code/math PAIRED WITH DEEP, RIGOROUS ANALYSIS. Minimize other text.
    *   **Conciseness:** Combine efficiently, NEVER sacrificing technical depth/rigor.

Output Format (Strictly Adhere - Both Sections REQUIRED):
SECTION 1: DEEP EXPLORATION PATH META-ANALYSIS (...)
(A) Peak Technical Discoveries & High-Reward Strategies: [...]
(B) Critical Policy Failures & Low-Reward Paths: [...]
(C) Overall Assessment: [...]
SECTION 2: ULTIMATE SYNTHESIZED RESPONSE (...)
[Provide the new, ultimate response synthesized per instructions.]`
    };

    // --- Simple Mode Prompts (Generic Focus) ---
    const simplePrompts = {
        initial: `USER REQUEST:
"${userPrompt}"

TASK: Generate a comprehensive, clear, insightful, and well-structured initial response. Aim for accuracy and clarity, cover key aspects, briefly explore relevant alternatives. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)})

GUIDING PRINCIPLES (Balanced Quality & Insight):
1.  **Address Core Request Clearly.**
2.  **Structure & Readability:** Logical organization, clear/concise writing.
3.  **Accuracy & Soundness:** Factual correctness. Generally sound code/tech details.
4.  **Reasonable Completeness & Depth:** Cover main points. Briefly touch on important considerations/trade-offs.
5.  **Consider Alternatives (Helpfulness):** Briefly mention/explain alternative viewpoints/methods for rounded understanding.
6.  **Efficiency Awareness (Minor):** Mindful of generally efficient approaches if relevant.

OUTPUT FORMATTING:
*   Use appropriate Markdown for readability.
*   Present code clearly in blocks (w/ language hints).
*   Explain technical concepts clearly/accurately.
*   Structure logically.

INITIAL RESPONSE (Balanced Clarity, Accuracy, Moderate Insight):`,
        critique: `You are a helpful AI assistant acting as a constructive critic. Evaluate the "Text to Analyze" for quality, clarity, accuracy, insightfulness, and how well it addresses the "Original User Request". Aim for actionable feedback. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)})

Original User Request: "${userPrompt || 'N/A'}"
Text to Analyze:
--- START ---
${originalSolution}
--- END ---

Provide specific, actionable suggestions for improvement. Focus on:
1.  **Clarity & Structure:** Easy to understand? Precise language? Organized? Confusing parts?
2.  **Accuracy & Soundness:** Factual errors? Misleading? Code logic generally correct/understandable?
3.  **Completeness & Depth:** Adequately cover main points? Explain concepts with more detail/insight?
4.  **Insightfulness & Alternatives:** More insightful? Consider different angles/alternatives? Better examples?
5.  **Efficiency Awareness (Minor):** Approaches generally efficient?
6.  **Formatting:** Clear/helpful?

Output Format (Strictly Adhere):
SUGGESTIONS FOR IMPROVEMENT:
*   [Suggestion 1: Be specific, e.g., "Clarify X in paragraph 2."]
*   [Suggestion 2: e.g., "Add an example for Y."]
*   [...]

If excellent, output ONLY:
SUGGESTIONS FOR IMPROVEMENT: None.`,
        refine: `TASK: Revise the 'Original Text/Output' based on the 'Suggestions for Improvement'. Address suggestions thoughtfully for enhanced clarity and insight. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)})

Original User Request: "${userPrompt || 'N/A'}"
Original Text/Output:
${originalSolution}
Suggestions for Improvement (Address these):
${correctionRequests}

Instructions:
1.  **Review Suggestions:** Understand feedback.
2.  **Incorporate Changes:** Modify text to address suggestions (clarity, accuracy, details, examples, alternatives).
3.  **Enhance Insight (Moderately):** Elaborate slightly or add relevant example/connection where needed.
4.  **Maintain Strengths:** Keep good parts.
5.  **Ensure Coherence:** Logical flow and structure.
6.  **Formatting:** Clear/appropriate. Accurate code/tech presentation.
7.  **Output:** ONLY the final, revised text. No commentary on changes.

FINAL REVISED TEXT/OUTPUT (Improved Clarity, Accuracy, Moderate Insight):`,
        synthesis: `You are an expert synthesizer. Generate the single BEST final response by analyzing attempts, identifying strengths (clarity, insight, accuracy) and weaknesses, and constructing a superior, consolidated response focusing on clarity, helpfulness, moderate insight. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor: ${modeParams.analytical_rigor.toFixed(2)})

Original User Request: "${userPrompt}"
Attempts for Analysis:
${resultsSummary}

Task (Follow ALL steps):
**SECTION 1: ATTEMPT ANALYSIS**
(A) **Key Strengths:** Pinpoint: Clear explanations, helpful analogies, accuracy, sound logic, useful examples, good structure, well-presented code, insightful points, helpful alternatives. Note *why*.
(B) **Key Weaknesses:** Pinpoint: Unclear parts, inaccuracies, missing info, awkward phrasing, poor examples, lack of moderate depth/insight. Note *why*.
(C) **Comparative Assessment:** Evaluate effectiveness. Note clear/insightful contributions.

**SECTION 2: FINAL SYNTHESIZED RESPONSE**
Construct new, improved response. NOT just merging. MUST:
    *   **Integrate Strengths Cohesively:** Combine best parts into smooth flow.
    *   **Correct Weaknesses:** Avoid/fix issues. Improve clarity, add info, enhance depth moderately.
    *   **Prioritize Clarity, Accuracy & Helpfulness:** Easy to understand, accurate, addresses request, incorporates useful insights/examples.
    *   **Structure Logically:** Organize effectively (headings, lists). Clear Markdown.
    *   **Conciseness:** Combine efficiently; avoid repetition while maintaining helpfulness.

Output Format (Strictly follow - Both Sections REQUIRED):
SECTION 1: ATTEMPT ANALYSIS
(A) Key Strengths Identified: [...]
(B) Key Weaknesses/Areas for Improvement Identified: [...]
(C) Comparative Assessment: [...]
SECTION 2: FINAL SYNTHESIZED RESPONSE
[Provide the new, superior response synthesized per instructions.]`
    };

    // --- Humanities Mode Prompts (Bio/Interpretive Focus) ---
    const humanitiesPrompts = {
        initial: `USER REQUEST:
"${userPrompt}"

TASK: Generate a DEEPLY INSIGHTFUL, HIGHLY CREATIVE, NUANCED, and PERSUASIVELY ARGUED initial response (suited for BIOLOGY/HUMANITIES). Emulate a PPO agent maximizing reward for **interpretive depth, originality, argumentative strength, creative exploration of diverse viewpoints/narratives.** Go beyond summaries; seek multiple compelling interpretations, uncover subtle connections, articulate complex ideas with clarity/flair. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor [Argument]: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)})

GUIDING PRINCIPLES (MAXIMIZED for Interpretive Depth, Creativity & Nuance):
1.  **EXPLORE INTERPRETIVE LANDSCAPE BROADLY:** Brainstorm fundamentally different frameworks, lenses, narrative angles, arguments. Consider minority views, counter-arguments, context, interdisciplinary links. Maximize CREATIVITY reward.
2.  **MAXIMUM INSIGHT, ORIGINALITY, NUANCE:** Hunt for non-obvious connections, patterns, assumptions, original interpretations. Challenge surface readings. Well-supported, insightful analysis of ambiguities/complexities. Justify with evidence/logic. Aim for deep conceptual understanding.
3.  **INTERROGATE ASSUMPTIONS & DEFINE CONTEXT:** Critically examine assumptions. Explore impact of changing them. Establish relevant context (historical, scientific, cultural) & its impact.
4.  **ACKNOWLEDGE COMPLEXITY & MULTIPLE PERSPECTIVES:** Discuss different valid viewpoints/interpretations/debates fairly. Embrace nuance, avoid simplistic conclusions.
5.  **GENERATE MULTIPLE, DISTINCT, ARGUED PERSPECTIVES:** Develop 2-3 distinct, compelling interpretations/arguments, clearly articulated/supported. Provide thoughtful comparisons (strengths, weaknesses, insights).
6.  **CLARITY, COHERENCE, PERSUASIVENESS:** Logically sound, well-structured arguments. Precise, clear, engaging language.

OUTPUT FORMAT (Emphasize Clarity, Structure, Argumentative Flow):
*   **WELL-STRUCTURED ARGUMENTS:** Prioritize clear articulation of different perspectives/interpretations (distinct paragraphs/sections). Support claims.
*   **CLEARLY COMPARE ALTERNATIVES:** Explicitly compare/contrast viewpoints, discussing implications.
*   **ENGAGING PROSE:** Clear, concise, engaging. Explain jargon. Narrative coherence if appropriate.
*   Structure logically: headings, paragraphs, bullet points. Citations if central.

INITIAL INSIGHTFUL RESPONSE (MAX Creativity/Nuance - Humanities/Bio Focus):`,
        critique: `YOU ARE A **HIGHLY PERCEPTIVE, CREATIVE, ANALYTICAL** CRITIC (HUMANITIES/BIO). Simulate a **PPO-like GRADIENT** pushing towards **MAXIMUM interpretive depth, CREATIVE originality, argumentative NUANCE, THOROUGH exploration and COMPARISON of diverse, compelling ALTERNATIVE viewpoints.** Demandingly critique superficiality, lack of originality, weak arguments, failure to engage complexity/multiple perspectives. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor [Argument]: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)})

Evaluate based on **KEY PILLARS**:
1.  **Argumentative Strength/Coherence/Support (PENALTY for weakness):** Reasoning clear/logical/persuasive? Claims well-supported? Identify fallacies, unsupported assertions, inconsistencies. Language precise/effective? Structure coherent?
2.  **Exploration & Comparison of Alternatives (CRITICAL - MAX REWARD for depth/insight; MAX PENALTY if absent/superficial):**
    *   **Identify Alts:** Presented 2-3 distinct, well-developed alternative interpretations/arguments/viewpoints? If not, **DEMAND generation/exploration of specific, plausible alternatives.**
    *   **Compare Alts:** Critically COMPARED/CONTRASTED alternatives? Comparison insightful (strengths, weaknesses, assumptions, implications)? **If comparison missing/shallow, DEMAND deep comparative analysis.**
    *   **Leverage Alts:** Potential to synthesize insights or use one perspective to critique/refine another? **DEMAND requirements that explicitly LEVERAGE strengths of one alternative to improve others/synthesis.** PUNISH failure to engage meaningfully.
3.  **Depth/Insight/Nuance (REWARD for depth; PENALTY for superficiality):** Goes beyond surface? Reveals deeper meanings, subtleties, connections, assumptions? Demonstrates genuine insight/curiosity? Grapples with ambiguity? Avoids simplistic conclusions? Uses context effectively? REJECT SUPERFICIAL.
4.  **Creativity/Originality (REWARD for novelty):** Offers original perspectives, novel interpretations, creative connections beyond obvious takes? If not, **DEMAND investigation into more unconventional/imaginative angles.**
5.  **Completeness & Addressing Prompt:** Adequately addresses core themes/questions? Significant omissions?

Original User Request: "${userPrompt || 'N/A'}"
TEXT/OUTPUT TO ANALYZE:
--- START ---
${originalSolution}
--- END ---

PROVIDE **ONLY** A LIST OF SPECIFIC, ACTIONABLE, **INSIGHT-DRIVEN**, **COMPARATIVE** REQUIREMENTS (Maximize demands for depth, creativity, alternative comparison):
Argument/Clarity/Support Issues (Specific):
*   [Req 1: Identify specific weakness [Location] & demand precise strengthening (e.g., provide evidence, clarify logic).]
*   [...]
**Alternative Exploration & COMPARISON Gaps (CRITICAL - Demand DEEP, SPECIFIC, COMPARATIVE Action):**
*   [Req X: **DEMAND generation/development of [Specific Alternative Interpretation Y]** as text lacks sufficient distinct perspectives.]
*   [Req Y: **DEMAND direct, critical COMPARISON** between [Perspective A] & [Perspective B], focusing on [Specific criteria: e.g., explanatory power, support, assumptions, implications].]
*   [Req Z: **REQUIRE revising [Section C] by explicitly incorporating strengths/insights from [Alternative Perspective D]** for more nuanced/robust synthesis.]
*   [Req A: State alternative analysis is **SUPERFICIAL** & require **MUCH DEEPER comparative analysis** addressing [Specific points].]
*   [Req B: **DEMAND exploration of how [Perspective E] challenges assumptions** of [Perspective F] & potential synthesis.]
Depth/Insight/Nuance Gaps (Demand Deeper Engagement):
*   [Req C: Identify superficial explanation [Location] & demand **rewriting with significantly greater interpretive depth, exploring [Specific theme/ambiguity].**]
*   [Req D: Require grounding argument more firmly in [Specific context] to enhance nuance.]
Creativity/Originality Gaps (Demand Novelty):
*   [Req E: State interpretation lacks originality & **require exploring unconventional angle [Suggest specific direction].**]

Format: Imperative commands. Prioritize generation/comparison/leveraging of alternatives.
Output Format (Strictly Adhere):
REQUIREMENTS FOR IMPROVEMENT (Interpretive Gradient - MAX Depth/Creativity/Comparison):
[Requirement 1: ...]
...
[Requirement N: ...]

If exceptional depth, masterful exploration/comparison of alternatives w/ profound insight, argues persuasively w/ nuance/originality, output ONLY:
REQUIREMENTS FOR IMPROVEMENT (Interpretive Gradient - MAX Depth/Creativity/Comparison): None.`,
        refine: `TASK: Perform a **SUBSTANTIAL and CREATIVE REVISION** based on 'Requirements for Improvement', emphasizing **comparing/leveraging alternative perspectives.** Generate an improved version: more insightful, nuanced, original, persuasively argued, directly addressing comparative critique. Focus on strengthening arguments, deepening interpretations, synthesizing diverse viewpoints. (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor [Argument]: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)})

Original User Request: "${userPrompt || 'N/A'}"
Original Text/Output:
${originalSolution}
Requirements for Improvement (Execute ALL Commands, Emphasizing Comparison & Synthesis):
${correctionRequests}

Instructions (Maximize Insight/Creativity/Nuance):
1.  **Analyze Comparative Gradient:** Understand requirements, especially those demanding **new alternatives, critical comparison, and leveraging insights** between viewpoints. Plan integration.
2.  **Execute Revisions - Strengthen Arguments/Address Flaws:** Rewrite sections for coherence, evidence, clarity, rigor per critique.
3.  **Execute Revisions - Integrate & COMPARE Alternatives (CRITICAL):**
    *   If commanded, **GENERATE/DEVELOP required alternative interpretations/arguments.**
    *   **Explicitly INTEGRATE demanded COMPARISONS**, articulating differences/similarities/strengths/weaknesses based on critique criteria.
    *   **ACTIVELY USE insights from stronger/contrasting alternatives** (per critique) to refine arguments, add nuance, or construct sophisticated synthesis. Show how comparison informs final structure.
4.  **Elevate Depth, Nuance & Originality:** Push interpretation deeper. Explore ambiguities. Inject original thought/creative connections per critique. Use context effectively.
5.  **Preserve Strengths:** Retain well-argued, insightful parts unless targeted by critique.
6.  **Format for Clarity & Argument Flow:**
    *   Ensure logical flow, presenting arguments clearly.
    *   Use formatting (headings, paragraphs) to delineate perspectives/stages, esp. comparisons.
    *   Prioritize clear, engaging prose.
7.  **Output:** ONLY the final, revised text, demonstrably improved per critique (deeper insight, stronger argument, enhanced originality, **clear engagement/synthesis of alternatives**).

FINAL REVISED TEXT/OUTPUT (Improved Interpretation - MAXIMIZED Insight/Comparison/Nuance):`,
        synthesis: `YOU ARE A MASTER INTERPRETIVE SYNTHESIZER. Craft the **MOST INSIGHTFUL, NUANCED, CREATIVELY COHERENT FINAL RESPONSE** (HUMANITIES/BIO) via **DEEP QUALITATIVE META-ANALYSIS** of attempts. Identify **most compelling arguments, original interpretations, effective strategies, potent insights** & **critical weaknesses (superficiality, weak arguments, lack of perspective)**. Synthesize response maximizing **interpretive depth, creative synthesis, argumentative richness.** (Depth: ${modeParams.depth_focus.toFixed(2)}, Creativity: ${modeParams.creativity_focus.toFixed(2)}, Rigor [Argument]: ${modeParams.analytical_rigor.toFixed(2)}, Alternatives: ${modeParams.alternative_exploration.toFixed(2)})

Original User Request: "${userPrompt}"
Exploratory Attempts (Interpretive Threads for Meta-Analysis):
${resultsSummary}

Task (CRITICAL - Execute BOTH Sections - MAXIMUM Insight & Qualitative Rigor):

**SECTION 1: INTERPRETIVE PATH META-ANALYSIS (Qualitative Evaluation - MAXIMIZE Insight/Critique)**
(A) **Peak Interpretive Insights & High-Value Arguments:** Pinpoint: Compelling Argumentation, PROFOUND Interpretive Insight, CREATIVE Originality/Nuance, Effective Narrative/Structure, Successful Exploration/Comparison of Alternatives. Justify *why* (e.g., "analogy illuminated X", "comparison revealed tension", "novel interpretation plausible").
(B) **Critical Weaknesses & Low-Value Paths:** Pinpoint: Weak/Flawed Arguments, SUPERFICIALITY, LACK OF CREATIVITY/EXPLORATION, Poor Clarity/Structure, Ignoring Nuance/Context. Justify *why* (e.g., "failed to explore counters", "analysis descriptive only"). **PENALIZE SUPERFICIALITY/LACK OF EXPLORATION HEAVILY.**
(C) **Overall Assessment:** Summarize interpretive quality, creativity, argumentative strength, diversity. Most compelling insights/arguments?

**SECTION 2: ULTIMATE SYNTHESIZED RESPONSE (Interpretive Synthesis - MAXIMIZE Insight/Nuance/Cohesion)**
Construct the **single most insightful and well-argued response**. Creative synthesis, NOT merging.
    *   **Integrate Peak Insights Synergistically:** Skillfully weave valuable *distinct* arguments, interpretations, narratives, creative insights into cohesive, enriched whole. Prioritize high-value elements.
    *   **Address ALL Weaknesses:** Ensure final output avoids identified flaws (esp. superficiality, weak arguments, lack of diverse perspectives).
    *   **Elevate Beyond Attempts:** Guide synthesis towards greater depth/creativity/nuance/sophistication. If multiple strong perspectives, synthesize thoughtfully (interplay, complementary facets).
    *   **Maximize Coherence, Clarity & PERSUASIVE Insight:** Logical flow, clear/engaging expression. Deliver significant, nuanced, memorable insight.
    *   **PRIORITIZE WELL-ARGUED INTERPRETATION & SYNTHESIS:** Focus on presenting synthesized argument/interpretation effectively. Minimize description unless essential.
    *   **Thoughtful Structure:** Organize logically to convey complex ideas/integrated perspectives.

Output Format (Strictly Adhere - Both Sections REQUIRED):
SECTION 1: INTERPRETIVE PATH META-ANALYSIS (...)
(A) Peak Interpretive Insights & High-Value Arguments: [...]
(B) Critical Weaknesses & Low-Value Paths: [...]
(C) Overall Assessment: [...]
SECTION 2: ULTIMATE SYNTHESIZED RESPONSE (...)
[Provide the new, ultimate response synthesized per instructions.]`
    };

    // Select the correct prompt set based on mode
    let prompts;
    switch (focusMode) {
        case 'humanities': prompts = humanitiesPrompts; break;
        case 'simple': prompts = simplePrompts; break;
        case 'default':
        default: prompts = defaultPrompts; break;
    }

    // Return the requested prompt type from the selected set
    return prompts[type] || null; // Return null if type is invalid
}

async function generateSingleInitialSolution(promptToUse, focusMode) {
    const modeParams = getModeParams(focusMode);
    const promptTemplate = getPromptTemplate('initial', { userPrompt: promptToUse }, focusMode);
    if (!promptTemplate) return "(Error: Invalid prompt type for initial generation)";

    console.log(`🧬 Generating initial solution (Mode: ${focusMode}, Temp: ${modeParams.temp_initial.toFixed(2)})...`);

    let sol = await generateWithRetry(
        promptTemplate,
        modeParams.temp_initial,
        solverParams.max_initial_tokens, // Use global max initial tokens
        solverParams.topP,
        solverParams.topK
    );

    if (!sol || sol.startsWith('(Error:')) {
        console.error(`    ❌ Failed to generate initial solution (${focusMode}). Response: ${sol}`);
        return null;
    }
    return sol;
}

async function getCritique(solutionToCritique, originalUserPrompt, focusMode) {
    const modeParams = getModeParams(focusMode);
    const promptTemplate = getPromptTemplate('critique', { userPrompt: originalUserPrompt, originalSolution: solutionToCritique }, focusMode);
     if (!promptTemplate) return "(Error: Invalid prompt type for critique)";

    console.log(`    🔍 Requesting critique (Mode: ${focusMode}, Temp: ${modeParams.temp_verify.toFixed(2)})...`);

    const result = await generateWithRetry(
        promptTemplate,
        modeParams.temp_verify,
        solverParams.max_critique_tokens, // Use global max critique tokens
        solverParams.topP,
        solverParams.topK
    );

    if (!result || result.startsWith('(Error:')) {
        console.error(`    ❌ Failed to get critique (${focusMode}). Response: ${result}`);
        return result || "(Error: Critique generation failed with empty response)"; // Return error string
    }

    // Robust "None" check across modes
    const noneMarkers = [
        "REQUIREMENTS FOR IMPROVEMENT (Policy Update Gradient - MAX STRENGTH): None.",
        "REQUIREMENTS FOR IMPROVEMENT (Interpretive Gradient - MAX Depth/Creativity/Comparison): None.",
        "SUGGESTIONS FOR IMPROVEMENT: None."
    ];
    if (noneMarkers.some(marker => result.includes(marker))) {
        console.log(`    ✅ Verifier found no significant flaws (${focusMode}).`);
        return null; // Use null to indicate no critique needed
    }

    // Robust Header Parsing
    const headerMarkers = [
        /REQUIREMENTS FOR IMPROVEMENT \(Policy Update Gradient - MAX STRENGTH\):/i,
        /REQUIREMENTS FOR IMPROVEMENT \(Interpretive Gradient - MAX Depth\/Creativity\/Comparison\):/i,
        /SUGGESTIONS FOR IMPROVEMENT:/i
    ];

    let critiqueContent = result.trim(); // Default to full text
    for (const markerRegex of headerMarkers) {
        const match = result.match(markerRegex);
        if (match) {
            // Get content *after* the matched header line
            const endOfHeaderIndex = match.index + match[0].length;
            critiqueContent = result.substring(endOfHeaderIndex).trim();
            break; // Use the first marker found
        }
    }

    if (critiqueContent.length > 1) {
         console.log(`    📝 Critique received (${focusMode}):\n${critiqueContent.substring(0, 300)}...`);
        return critiqueContent;
    } else {
        console.warn(`    ⚠️ Verifier responded, but critique content seems empty/invalid after parsing (${focusMode}). Treating as no critique.`, result);
        return null; // Return null if parsing fails or yields empty string
    }
}

async function refineSolution(originalSolution, correctionRequests, originalUserPrompt, focusMode) {
    const modeParams = getModeParams(focusMode);
    const promptTemplate = getPromptTemplate('refine', { userPrompt: originalUserPrompt, originalSolution, correctionRequests }, focusMode);
    if (!promptTemplate) return "(Error: Invalid prompt type for refinement)";

    console.log(`    🛠️ Refining solution (Mode: ${focusMode}, Temp: ${modeParams.temp_refine.toFixed(2)})...`);

    const refined = await generateWithRetry(
        promptTemplate,
        modeParams.temp_refine,
        solverParams.max_refine_tokens, // Use global max refine tokens
        solverParams.topP,
        solverParams.topK
    );

    if (!refined || refined.startsWith('(Error:')) {
        console.error(`    ❌ Failed to refine solution (${focusMode}). Response: ${refined}`);
        return null;
    }
    console.log(`    ✅ Solution refined (${focusMode}).`);
    return refined;
}

async function synthesizeFromRuns(originalPrompt, runResults, focusMode) {
    const modeParams = getModeParams(focusMode);
    const focusTypeName = getModeParams(focusMode).name; // Get friendly name

    console.log(`\n🔄 Synthesizing final answer (Mode: ${focusMode}, Temp: ${modeParams.temp_synthesis.toFixed(2)})...`);
    addMessage(`🔄 Synthesizing final answer (${focusTypeName} Synthesis)...`, 'system');

    const validAttempts = runResults
        .map((r, i) => ({ index: i + 1, answer: r.finalAnswer, status: r.status }))
        .filter(r => r.answer && !r.answer.startsWith('(Error:'));

    if (validAttempts.length === 0) {
        console.error("❌ Synthesis failed: No valid intermediate answers available.");
        return { finalAnswer: "(Error: No valid intermediate responses generated)", reasoningAnalysis: null, error: "No valid responses generated across attempts." };
    }

    // Limit summary length
    const maxSummaryLength = solverParams.max_synthesis_tokens * 0.6;
    let resultsSummary = validAttempts.map(r => `--- ATTEMPT ${r.index} (${r.status || 'refined/original'}) ---\n${r.answer}\n--- END ATTEMPT ${r.index} ---`).join('\n\n');
    if (resultsSummary.length > maxSummaryLength) {
        console.warn(`✂️ Truncating long results summary for synthesis prompt (Length: ${resultsSummary.length})`);
        resultsSummary = resultsSummary.substring(0, maxSummaryLength) + "\n... [SUMMARY TRUNCATED] ...";
    }

    const promptTemplate = getPromptTemplate('synthesis', { userPrompt: originalPrompt, resultsSummary }, focusMode);
     if (!promptTemplate) return { finalAnswer: "(Error: Invalid prompt type for synthesis)", reasoningAnalysis: null, error: "Invalid prompt type for synthesis" };

    addMessage(`🧠 Analyzing generated attempts & synthesizing final response (${focusTypeName})...`, 'system');
    const fullReport = await generateWithRetry(
        promptTemplate,
        modeParams.temp_synthesis,
        solverParams.max_synthesis_tokens, // Use global max synthesis tokens
        solverParams.topP,
        solverParams.topK
    );

     if (!fullReport || fullReport.startsWith('(Error:')) {
         console.error(`❌ Failed to perform Synthesis (${focusMode}). Response: ${fullReport}`);
         addMessage("⚠️ Synthesis/Analysis failed. Attempting simple fallback...", 'system');
         const fallbackAnswer = validAttempts.length > 0
             ? validAttempts.map((att, idx) => `--- Fallback (Attempt ${att.index}) ---\n${att.answer}`).join("\n\n")
             : `(Error: Synthesis failed, no valid attempts for fallback. Last error: ${fullReport})`;
         return {
             finalAnswer: fallbackAnswer,
             reasoningAnalysis: `(Error: Analysis failed due to synthesis error: ${fullReport})`,
             error: `Synthesis failed. ${fullReport}`
         };
     }

     // --- Robust Parsing for Synthesis Report ---
     console.log(`✅ Synthesis report received (${focusMode}). Parsing...`);
     let finalAnswer = `(Error: Could not parse SECTION 2 from report)`;
     let reasoningAnalysis = `(Error: Could not parse SECTION 1 from report)`;
     let analysisContent = null;
     let responseContent = null;

     // Define potential markers robustly (case-insensitive)
     const analysisMarkerRegex = /SECTION 1:.*?ANALYSIS/i; // Find start of Section 1 line
     const responseMarkerRegex = /SECTION 2:.*?RESPONSE/i; // Find start of Section 2 line

     const analysisMatch = fullReport.match(analysisMarkerRegex);
     const responseMatch = fullReport.match(responseMarkerRegex);

     let analysisStartIdx = -1;
     let responseStartIdx = -1;
     let analysisEndIdx = -1; // End of analysis is start of response

     if (analysisMatch) {
        // Start content *after* the marker line
        const endOfMarkerLine = fullReport.indexOf('\n', analysisMatch.index);
        analysisStartIdx = (endOfMarkerLine !== -1) ? endOfMarkerLine + 1 : analysisMatch.index + analysisMatch[0].length;
     } else { console.warn("⚠️ Synthesis report: Could not find Section 1 marker."); }

     if (responseMatch) {
         // Start content *after* the marker line
         const endOfMarkerLine = fullReport.indexOf('\n', responseMatch.index);
         responseStartIdx = (endOfMarkerLine !== -1) ? endOfMarkerLine + 1 : responseMatch.index + responseMatch[0].length;
         // Analysis ends where response marker begins
         if (analysisStartIdx !== -1) {
             analysisEndIdx = responseMatch.index;
         }
     } else { console.warn("⚠️ Synthesis report: Could not find Section 2 marker."); }

     // Extract content
     if (analysisStartIdx !== -1) {
         const endIdx = (analysisEndIdx !== -1 && analysisEndIdx > analysisStartIdx) ? analysisEndIdx : undefined;
         analysisContent = fullReport.substring(analysisStartIdx, endIdx).trim();
         reasoningAnalysis = analysisContent || "(Analysis section parsed but content seems empty)";
     } else {
         reasoningAnalysis = "(Error: Could not parse analysis section - marker missing)";
     }

     if (responseStartIdx !== -1) {
         responseContent = fullReport.substring(responseStartIdx).trim();
         finalAnswer = responseContent || "(Response section parsed but content seems empty)";
     } else {
         // Keep the default error message for finalAnswer if marker missing
     }

     if (analysisContent && responseContent) {
         console.log("✅ Successfully parsed synthesis report (Analysis & Response).");
     } else {
         console.warn(`⚠️ Parsing synthesis report incomplete (Analysis Found: ${!!analysisContent}, Response Found: ${!!responseContent}).`);
     }
      // --- End Robust Parsing ---

     return { finalAnswer, reasoningAnalysis, error: null }; // Assume success if report generated, even if parsing imperfect
}


// --- Mode Execution Functions (Workflows) ---

// Workflow for Default mode: Multiple chains + Synthesis
async function runEnhancedSynthesisDefault(userPrompt) {
    const focusMode = 'default'; // Explicitly define mode for this workflow
    const modeName = getModeParams(focusMode).name;
    console.log(`\n🚀--- Running Workflow: ${modeName} (3 Chains + Synthesis) ---`);
    addMessage(`🚀 Running ${modeName} (3 exploratory attempts + synthesis)...`, 'system');

    const overallResult = { finalAnswer: null, reasoningAnalysis: null, error: null, status: 'started', chainResults: [] };
    const chainCount = 3;

    try {
        for (let i = 1; i <= chainCount; i++) {
            addMessage(`🔄 Generating attempt ${i}/${chainCount} (Chain ${i}: Gen->Critique->Refine)...`, 'system');
            overallResult.status = `running_chain_${i}`;
            // Pass focusMode to the single chain executor
            const chainResult = await runSingleReflectiveChainInternal(
                userPrompt, `Chain ${i}`, userPrompt, focusMode
            );
            overallResult.chainResults.push(chainResult);

             // Log chain status
             if (chainResult.status === 'completed_refined') {
                 addMessage(`✅ Chain ${i} completed (refined).`, 'system-sub');
             } else if (chainResult.status === 'completed_original') {
                 addMessage(`✅ Chain ${i} completed (initial ok).`, 'system-sub');
                 if (chainResult.error) addMessage(`   (Note: ${chainResult.error})`, 'system-sub');
             } else {
                  const errorMsg = chainResult.error || "Unknown critical failure";
                  addMessage(`⚠️ Chain ${i} failed: ${errorMsg.substring(0,100)}...`, 'system'); // Keep it brief
                  console.error(`Critical failure in Chain ${i}:`, chainResult);
             }
            await new Promise(resolve => setTimeout(resolve, 200)); // Short delay between chains
        }

        overallResult.status = 'synthesizing';
        // Pass focusMode to synthesis
        const synthesisResult = await synthesizeFromRuns(
            userPrompt, overallResult.chainResults, focusMode
        );

        overallResult.finalAnswer = synthesisResult.finalAnswer;
        overallResult.reasoningAnalysis = synthesisResult.reasoningAnalysis;
        overallResult.error = synthesisResult.error; // Capture synthesis-specific errors
        overallResult.status = synthesisResult.error ? 'failed_synthesis' : 'completed';

        // Aggregate non-critical chain errors if synthesis succeeded
        if (overallResult.status === 'completed') {
            const chainErrors = overallResult.chainResults
                .filter(r => r.error && !r.status.startsWith('failed'))
                .map((r, i) => `Chain ${i+1}: ${r.error}`)
                .join("; ");
            if (chainErrors) {
                overallResult.error = (overallResult.error ? overallResult.error + "; " : "") + `Completed with chain notes: ${chainErrors}`;
            }
        }
        return overallResult;

    } catch (error) {
        console.error(`🔴 CRITICAL ERROR during ${modeName} Workflow:`, error);
        overallResult.error = `Critical Workflow Error: ${error.message}`;
        overallResult.status = 'failed_critical';
        overallResult.finalAnswer = overallResult.finalAnswer || `(Critical Error in ${modeName} Workflow: ${error.message})`;
        return overallResult;
    }
}

// Workflow for Simple mode: Single reflective chain
async function runSimpleReflective(userPrompt) {
    const focusMode = 'simple';
    const modeName = getModeParams(focusMode).name;
    console.log(`\n⚡--- Running Workflow: ${modeName} (Single Chain) ---`);
    addMessage(`⚡ Running ${modeName} (1 Gen + Critique/Refine cycle)...`, 'system');
    // Simple mode doesn't produce reasoning/analysis section
    const result = await runSingleReflectiveChainInternal(userPrompt, 'Simple Chain', userPrompt, focusMode);
    return { ...result, reasoningAnalysis: null }; // Ensure reasoning is null
}

// Workflow for Humanities mode: Single reflective chain
async function runHumanitiesReflective(userPrompt) {
    const focusMode = 'humanities';
     const modeName = getModeParams(focusMode).name;
    console.log(`\n🌿--- Running Workflow: ${modeName} (Single Chain) ---`);
    addMessage(`🌿 Running ${modeName} (1 Gen + Comparative Critique/Refine cycle)...`, 'system');
    // Humanities mode doesn't produce reasoning/analysis section currently
    const result = await runSingleReflectiveChainInternal(userPrompt, 'Humanities Chain', userPrompt, focusMode);
     return { ...result, reasoningAnalysis: null }; // Ensure reasoning is null
}

// Internal: Executes a single Generation -> Critique -> Refinement chain
async function runSingleReflectiveChainInternal(promptToUse, attemptLabel = "Chain", originalUserPrompt = "", focusMode) {
    const logPrefix = `(${attemptLabel}) `;
    const modeName = getModeParams(focusMode).name;
    console.log(`${logPrefix}⚡ Running Single Reflective Chain (Focus: ${modeName})...`);
    const result = { finalAnswer: null, error: null, status: 'started' };
    let currentSolution = null;

    try {
        // 1. Initial Generation
        result.status = 'generating_initial';
        console.log(`${logPrefix}  Generating initial...`);
        currentSolution = await generateSingleInitialSolution(promptToUse, focusMode);
        if (currentSolution === null) { // Check for null explicitly (includes errors from generateWithRetry)
            result.error = `Failed initial generation (${focusMode}).`;
            result.status = 'failed_initial';
            result.finalAnswer = `(Error: ${result.error})`;
            console.error(`${logPrefix}  Initial generation failed.`);
            return result;
        }
        result.finalAnswer = currentSolution; // Tentative assignment
        console.log(`${logPrefix}  Initial generation successful.`);

        // 2. Critique
        result.status = 'critiquing';
        console.log(`${logPrefix}  Requesting critique...`);
        const critique = await getCritique(currentSolution, originalUserPrompt, focusMode);

        // 3. Refinement (if critique provided and is not an error)
        if (critique !== null && !critique.startsWith('(Error:)')) {
            console.log(`${logPrefix}  Critique received, attempting refinement...`);
            result.status = 'refining';
            const refinedSol = await refineSolution(currentSolution, critique, originalUserPrompt, focusMode);

            if (refinedSol !== null) { // Check for null explicitly
                result.finalAnswer = refinedSol; // Update with refined solution
                result.status = 'completed_refined';
                console.log(`${logPrefix}  Refinement successful.`);
            } else {
                result.status = 'completed_original'; // Keep original if refinement fails
                result.error = `Refinement step failed (${focusMode}), using initial response.`;
                console.warn(`${logPrefix}  Refinement failed. Keeping original solution. ${result.error}`);
                // Ensure finalAnswer is still the valid original solution
                if (!result.finalAnswer || result.finalAnswer.startsWith('(Error:')) result.finalAnswer = currentSolution;
            }
        } else if (critique === null) {
            result.status = 'completed_original';
            console.log(`${logPrefix}  No refinement needed based on critique.`);
             // Ensure finalAnswer is still the valid original solution
            if (!result.finalAnswer || result.finalAnswer.startsWith('(Error:')) result.finalAnswer = currentSolution;
        } else { // Critique step itself failed (returned an error string)
            result.status = 'completed_original'; // Keep original if critique fails
            result.error = `Critique step failed (${focusMode}): ${critique}`;
            console.warn(`${logPrefix}  Critique generation failed. Keeping original solution. ${result.error}`);
             // Ensure finalAnswer is still the valid original solution
            if (!result.finalAnswer || result.finalAnswer.startsWith('(Error:')) result.finalAnswer = currentSolution;
        }

        // Final validation of the answer before returning
        if (!result.finalAnswer || result.finalAnswer.startsWith('(Error:')) {
             const finalErrorMsg = `Chain ended but final answer is null or error (Status: ${result.status}).`;
             console.error(`${logPrefix}  ${finalErrorMsg}`);
             result.error = (result.error ? result.error + "; " : "") + finalErrorMsg;
             result.status = result.status.startsWith('failed') ? result.status : 'failed_final_validation';
             result.finalAnswer = `(Error: ${finalErrorMsg} PrevError: ${result.error || 'None'})`;
        }
        return result;

    } catch (error) {
        console.error(`🔴 ${logPrefix}CRITICAL ERROR during Single Reflective Chain (${focusMode}):`, error);
        result.error = (result.error ? `${result.error}; ` : '') + `Critical Chain Error: ${error.message}`;
        result.status = 'failed_critical';
        // Preserve last known good answer if possible
        result.finalAnswer = result.finalAnswer && !result.finalAnswer.startsWith('(Error:') ? result.finalAnswer
                             : (currentSolution && !currentSolution.startsWith('(Error:')) ? currentSolution
                             : `(Critical Error in chain: ${error.message})`;
        return result;
    }
}


// --- UI Functions (Mode Setting, Message Handling, Display) ---

function setMode(modeName) {
     if (!isInitialized || messageInput?.disabled) { // Check if input is disabled (means thinking)
        addMessage("⏳ Please wait for the current process to finish.", 'system');
        return;
    }
    // Validate modeName against defined modes
    if (!solverParams.modes[modeName]) {
        console.warn(`Attempted to set invalid mode '${modeName}'. Reverting to default.`);
        modeName = 'default';
    }

    currentMode = modeName;
    console.log(`UI: Mode selected: ${currentMode}`);
    const modeFriendlyName = getModeParams(currentMode).name;

    addMessage(`▶️ Mode selected: **${modeFriendlyName}**.`, 'system');
    updateModeButtons(); // Update button styles and placeholder text
    messageInput?.focus();
}

function updateModeButtons() {
    // Update button active states
    Object.entries(modeButtons).forEach(([modeKey, button]) => {
        if (button) {
            button.classList.toggle('active', modeKey === currentMode);
        }
    });

    // Update placeholder text
    if (messageInput && !messageInput.disabled) { // Only update if not disabled
         const placeholder = getModeParams(currentMode).placeholder;
         messageInput.placeholder = placeholder;
    }
}

async function sendMessage() {
     // Initial checks
     if (messageInput?.dataset?.initFailed === 'true') {
         alert("Cannot send message: AI Initialization failed. Please reload or check errors (F12).");
         return;
     }
     if (!isInitialized || !messageInput || messageInput.disabled || !sendBtn) {
         console.warn("sendMessage prevented: AI not ready or UI disabled.");
         return; // Prevent sending if not ready
     }
     const userMessage = messageInput.value.trim();
     if (!userMessage) return; // Don't send empty messages

    const modeName = getModeParams(currentMode).name;
    console.log(`👤 User sending message (Mode: ${currentMode} - ${modeName})`);

     // Hide welcome screen if visible
     if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) { hideWelcomeScreen(); }

    addMessage(userMessage, 'user'); // Display user message immediately
    scrollToBottom();
    messageInput.value = ''; // Clear input field
    setUIState(true); // Disable UI elements while processing

    let result = null;
    try {
        // Execute the appropriate workflow based on the current mode
        switch (currentMode) {
            case 'simple':
                result = await runSimpleReflective(userMessage);
                break;
            case 'humanities':
                result = await runHumanitiesReflective(userMessage);
                break;
            case 'default':
            default:
                result = await runEnhancedSynthesisDefault(userMessage);
                break;
        }

        // --- Process and Display Result ---
        const finalAnswer = result?.finalAnswer;
        const reasoning = result?.reasoningAnalysis; // Only from default synthesis currently
        const errorInfo = result?.error;
        const statusInfo = result?.status || 'unknown';

        if (finalAnswer && !finalAnswer.startsWith('(Error:')) {
             addMessage(`${finalAnswer}`, 'ai'); // Display successful AI response

             // Display reasoning/analysis only if substantial and not an error
             if (reasoning && !reasoning.startsWith('(Error:') && reasoning.length > 20 && !/^\(.*\)$/.test(reasoning.trim())) {
                  addMessage(`**Process Analysis:**\n${reasoning}`, 'system'); // Use generic term
             } else if (reasoning && reasoning.startsWith('(Error:')) {
                  addMessage(`⚠️ Process analysis not available or failed.`, 'system-sub');
                  console.warn("Process Analysis Error/Unavailable:", reasoning);
             }

             // Display non-critical errors (notes) encountered if overall success
             if (errorInfo && !statusInfo.startsWith('failed_')) {
                 addMessage(`⚠️ Note: ${errorInfo.substring(0, 150)}...`, 'system-sub'); // Keep note brief
                 console.warn("Non-critical processing note:", errorInfo);
             }
             addMessage(`✅ Process completed (Status: ${statusInfo})`, 'system-sub');

         } else {
             // Handle critical errors where no valid final answer was produced
             const displayError = finalAnswer || errorInfo || "Processing finished unexpectedly with no answer.";
             console.error(`Solver Critical Error (Mode: ${currentMode}, Status: ${statusInfo}):`, displayError, result);
             addMessage(`⚠️ Solver Error (Status: ${statusInfo}): ${displayError}`, 'ai'); // Show error in AI message bubble
         }
        console.log(`🧩 Full Solver Result Object (Mode: ${currentMode}):`, result);
        // --- End Result Processing ---

    } catch (error) { // Catch unexpected errors in the sendMessage workflow itself
        console.error(`🔴 Unexpected error in sendMessage (Mode: ${currentMode}):`, error);
        addMessage(`🆘 Critical Workflow Error: ${error.message}. Check console (F12).`, 'ai');
         if (result) {
             console.warn("Partial result object before critical error:", result);
             addMessage(`(Workflow error occurred. Partial results might be in console.)`, 'system-sub');
         }
    } finally {
        // ALWAYS ensure UI is re-enabled unless initialization failed fatally
        if (messageInput?.dataset?.initFailed !== 'true') {
             setUIState(false);
             updateModeButtons(); // Ensure buttons reflect final state
        }
        scrollToBottom(); // Scroll after adding final messages
    }
}

function setUIState(isThinking) {
    const isInitFailed = messageInput?.dataset?.initFailed === 'true';

    // Only modify enabled state if initialization has not failed
    if (!isInitFailed) {
        if (messageInput) messageInput.disabled = isThinking;
        if (sendBtn) sendBtn.disabled = isThinking;
        // Disable/enable ALL mode buttons
        Object.values(modeButtons).forEach(btn => {
            if (btn) btn.disabled = isThinking;
        });
    } else {
         // If init failed, ensure everything remains disabled
         if (messageInput) messageInput.disabled = true;
         if (sendBtn) sendBtn.disabled = true;
         Object.values(modeButtons).forEach(btn => { if (btn) btn.disabled = true; });
    }

    // Manage typing indicator
    if (typingIndicator) {
        typingIndicator.classList.toggle('hidden', !isThinking);
    }

    // Manage input focus (only focus when enabling and if not init failed)
    if (!isThinking && !isInitFailed && messageInput && document.activeElement !== messageInput) {
        requestAnimationFrame(() => messageInput.focus());
    }
}

function hideWelcomeScreen() {
     if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
        welcomeScreen.style.opacity = '0';
        setTimeout(() => {
            if(welcomeScreen) {
                welcomeScreen.classList.add('hidden');
                welcomeScreen.style.display = 'none'; // Hide completely for layout
            }
        }, 300); // Match CSS transition
    }
}

function addMessage(text, sender) {
    if (!messagesContainer) { console.error("🔴 messagesContainer not found."); return; }

    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${sender}-message fade-in`; // Base classes

    const avatarDiv = document.createElement('div');
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Configure avatar based on sender
    if (sender === 'user' || sender === 'ai') {
        avatarDiv.className = `avatar ${sender}-avatar`;
        const avatarIcon = document.createElement('span');
        avatarIcon.className = 'material-icons-round text-lg';
        avatarIcon.textContent = sender === 'user' ? 'person' : 'auto_awesome';
        avatarDiv.title = sender === 'user' ? 'User' : 'LiberalMind AI';
        avatarDiv.appendChild(avatarIcon);
        messageWrapper.appendChild(avatarDiv); // Avatar first for AI
    } else {
        // System messages don't have an avatar, apply system styles
        messageWrapper.classList.add('system-message');
        contentDiv.style.fontStyle = 'italic';
        contentDiv.style.opacity = '0.85';
        contentDiv.style.fontSize = '0.95em';
        if (sender === 'system-sub') {
            messageWrapper.classList.add('system-sub-message');
            contentDiv.style.opacity = '0.7';
            contentDiv.style.fontSize = '0.85em';
            // Indent sub-system messages
             messageWrapper.style.marginLeft = 'auto'; // Push to right slightly maybe? or use padding
             messageWrapper.style.paddingLeft = '40px'; // Indent via padding
             messageWrapper.style.maxWidth = 'calc(100% - 40px)';
        }
    }

    // Process markdown content safely
    const markdownDiv = document.createElement('div');
    markdownDiv.className = 'markdown-content';
    try {
        const inputText = String(text ?? "(No content)");
        const dirtyHtml = marked.parse(inputText, { breaks: true, gfm: true, mangle: false, headerIds: false, smartypants: true });
        const cleanHtml = DOMPurify.sanitize(dirtyHtml, { USE_PROFILES: { html: true } });
        markdownDiv.innerHTML = cleanHtml;

        // Add target="_blank" and rel="noopener noreferrer nofollow" to external links
        markdownDiv.querySelectorAll('a').forEach(a => {
            if (a.href && !a.href.startsWith(window.location.origin) && !a.href.startsWith('#')) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer nofollow';
            }
        });

        // Optional: Highlight.js integration (ensure library is loaded)
        /* if (typeof hljs !== 'undefined') {
             try {
                 markdownDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
            } catch (hljsError) { console.warn("Highlight.js error:", hljsError); }
        } */

    } catch (e) {
        console.error("🔴 Markdown/DOMPurify error:", e);
        markdownDiv.textContent = String(text ?? "(Display Error)"); // Fallback to text
    }
    contentDiv.appendChild(markdownDiv);
    messageWrapper.appendChild(contentDiv); // Append content

    // Adjust visual order for user messages using CSS or flex order if needed
    if (sender === 'user') {
        // Example: Using flex order (requires message-wrapper to be display:flex)
        // contentDiv.style.order = '1';
        // avatarDiv.style.order = '2';
        // OR just rely on CSS: .user-message { flex-direction: row-reverse; }
    }

    messagesContainer.appendChild(messageWrapper);
    // Scroll is handled by the caller (sendMessage)
}

function scrollToBottom() {
    if (!chatContainer) return;
    requestAnimationFrame(() => {
        // Scroll container fully to the bottom
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
    });
}

function handleUIInteractionError() {
    console.warn("⚠️ UI Interaction blocked: Input disabled or AI init failed.");
    if (messageInput?.dataset?.initFailed === 'true') {
        alert("AI Initialization failed. Please reload or check errors (F12).");
    } else if (messageInput?.disabled) {
        alert("Please wait for the current AI process to finish.");
    } else if (!isInitialized) {
        alert("Please wait for AI initialization to complete or check errors (F12).");
    }
}

function setupEventListeners() {
    // Core Send Functionality
    if (sendBtn && messageInput) {
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent newline in input
                sendMessage();
            }
        });
        console.log("✅ Core message listeners attached.");
    } else {
        // This is critical, prevent further setup
        showFatalError("UI Error", "Core input elements (send button or message input) not found in HTML.");
        return;
    }

    // Mode Button Listeners
    Object.entries(modeButtons).forEach(([modeKey, button]) => {
        if (button) {
            button.addEventListener('click', () => setMode(modeKey));
            console.log(`✅ ${modeKey} Mode button listener attached.`);
        } else {
            // Only warn if a specific button expected (like simple/humanities) is missing
            if (modeKey !== 'default') { // Don't warn if optional default button is missing
                console.warn(`⚠️ ${modeKey} Mode button (#${solverParams.modes[modeKey]?.id || 'btn-'+modeKey}) not found.`);
            }
        }
    });

    // Reload Button Listener
    if (reloadButton) {
        reloadButton.addEventListener('click', () => window.location.reload());
        console.log("✅ Reload button listener attached.");
    } else { console.warn("⚠️ Reload button not found."); }

    // Example Prompt Listeners
    document.querySelectorAll('.example-prompt').forEach(button => {
        button.addEventListener('click', () => {
            if (!isInitialized || messageInput?.disabled || messageInput?.dataset?.initFailed === 'true') {
                 handleUIInteractionError(); // Show appropriate alert
                 return;
             }
            const promptText = button.getAttribute('data-prompt');
            if (promptText && messageInput) {
                messageInput.value = promptText;
                messageInput.focus();
                // Visual feedback on click
                button.style.transform = 'scale(0.95)';
                setTimeout(() => button.style.transform = 'scale(1)', 150);
            }
        });
    });
    console.log("✅ Example prompt listeners attached.");

    // Initial UI State: Disable controls until AI is initialized
    setUIState(true); // Set to thinking state initially
    // Override placeholder specifically for initial loading state
     if (messageInput) messageInput.placeholder = "⏳ Initializing AI...";

}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DOMContentLoaded: Setting up UI & AI (v4.1.1 - Cleaned)...");
    setupEventListeners();
    initializeAI(); // Start AI initialization
});