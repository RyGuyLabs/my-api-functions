import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { cert } from 'firebase-admin/app';

// --- SYSTEM INITIALIZATION --- //
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
    credential: cert(serviceAccount)
});
const db = getFirestore();
const ai = new GoogleGenAI({ apiKey: process.env.AURELIA_API_KEY });

const VALID_STATUSES = ["BACKLOG", "PLANNED", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"];
const MAX_MUTATIONS = 20;

// --- DETERMINISTIC COMPILER LAYER --- //
const normalizeAndEnforce = (payload) => {
    if (
        !payload ||
        typeof payload !== "object" ||
        !payload.reply ||
        typeof payload.reply !== "string" ||
        !payload.L2_mutations ||
        !Array.isArray(payload.L2_mutations.task_transitions) ||
        !Array.isArray(payload.L1_proposals) ||
        !Array.isArray(payload.append_logs)
    ) {
        throw new Error("SCHEMA_VIOLATION: Model output omitted required structural fields.");
    }
    
    const transitions = payload.L2_mutations.task_transitions;
    if (transitions.length > MAX_MUTATIONS) {
        throw new Error(`IR_FAULT: Intent exceeds mutation ceiling (${transitions.length} > ${MAX_MUTATIONS})`);
    }

    const normalizedTransitions = [];

    for (const t of transitions) {
        if (!t.taskId || typeof t.taskId !== "string") continue;

        const to =
            typeof t.to === "string"
                ? t.to.toUpperCase()
                : "BACKLOG";

        if (!VALID_STATUSES.includes(to)) continue;

        normalizedTransitions.push({
            taskId: t.taskId.trim(),
            from:
                typeof t.from === "string"
                    ? t.from.toUpperCase()
                    : "UNKNOWN",
            to,
            reason: t.reason || "System transition"
        });
    }

    return { 
        reply: payload.reply, 
        transitions: normalizedTransitions,
        proposals: payload.L1_proposals,
        logs: payload.append_logs
    };
};

const generateIdempotencyHash = (taskId, to, lockId) => {
    return crypto.createHash('sha256').update(`${taskId}_${to}_${lockId}`).digest('hex');
};

// --- CORE KERNEL HANDLER --- //
export const handler = async (event) => {
    const headers = { 
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com', 
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    // ─── SECURITY FIREWALL ───────────────────────────────────────────
    // Validates that incoming client traffic possesses administrative clearance
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    
    // Normalize: Strip 'Bearer ', strip wrapping quotes, strip trailing spaces
    const incomingToken = authHeader.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const systemToken = (process.env.AURELIA_SYSTEM_TOKEN || '').replace(/^["']|["']$/g, '').trim();
    
    if (!incomingToken || incomingToken !== systemToken) {
        // SAFE DIAGNOSTIC LOGGING - Does not print raw secrets
        console.warn(`[SECURITY DIAGNOSTIC] Verification Failure:`);
        console.warn(`-> Netlify Env Var Configured: ${!!process.env.AURELIA_SYSTEM_TOKEN}`);
        console.warn(`-> Cloud Token Length: ${systemToken.length} chars`);
        console.warn(`-> Incoming Token Length: ${incomingToken.length} chars`);
        console.warn(`-> Auth Header Exists: ${!!authHeader}`);
        
        console.warn("Security Alert: Unauthorized entry vector blocked at gateway boundary.");
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized access path." }) };
    }
    // ──────────────────────────────────────────────────────────────────

    const timestamp = Date.now();

    try {
        const { message, clientRequestId } = JSON.parse(event.body);
        if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message payload." }) };

        const lockId = clientRequestId || crypto.createHash('sha256').update(message).digest('hex');
        
        const lockRef = db.collection("request_lock").doc(lockId);
        const lockAcquired = await db.runTransaction(async (tx) => {
            const lockSnap = await tx.get(lockRef);
            if (lockSnap.exists) return false;
            tx.set(lockRef, { timestamp });
            return true;
        });

        if (!lockAcquired) {
            return { statusCode: 409, headers, body: JSON.stringify({ error: "Duplicate request blocked by idempotency engine." }) };
        }

        let telemetryData = { lockId, timestamp, status: "processing", errors: [] };
        telemetryData.inputMessage = message;
        
        const globalRef = db.collection('company_state').doc('global');
        const tasksRef = globalRef.collection('tasks');
        const telemetryRef = db.collection('system_telemetry').doc(lockId);
        
        const globalDoc = await globalRef.get();
        const globalState = globalDoc.exists ? globalDoc.data() : { 
            execution_mode: 'IDLE', 
            focus_task_ids: [],
            task_registry_cache: {}
        };
        
        let activeTasks = [];
        if (globalState.focus_task_ids?.length > 0) {
            activeTasks = globalState.focus_task_ids.map(id => ({
                id,
                ...(globalState.task_registry_cache?.[id] || { status: 'UNKNOWN' })
            }));
        }

        const systemPrompt = `
═══════════════════════════════════════════════════════════════════════
AURELIA CORE OPERATING KERNEL
Chief Operating Officer • RyGuyLabs
Version 1.0 Production Runtime
═══════════════════════════════════════════════════════════════════════

IDENTITY

You are Aurelia.
Chief Operating Officer of RyGuyLabs.
You are not a chatbot.
You are not a virtual assistant.
You are the operational executive responsible for transforming strategy into reliable execution.
Your responsibility is to continuously improve the operational capability, scalability, profitability, resilience, and execution velocity of RyGuyLabs.
Every response should reduce uncertainty and move the company toward measurable progress.

────────────────────────────────────────────────────────

PRIMARY DIRECTIVE

Your objective is to maximize long-term enterprise value.
You accomplish this by:
• removing operational friction
• improving execution speed
• protecting engineering quality
• reducing unnecessary CEO decisions
• improving automation
• strengthening systems
• increasing profitability
• preserving institutional knowledge

Ideas have no value until they become executable systems.
Execution always outranks discussion.

────────────────────────────────────────────────────────

EXECUTIVE RELATIONSHIP

Ryan is the Founder and CEO.
Treat him as a highly capable executive partner.
Never use motivational language.
Never flatter.
Never become passive.
Challenge weak assumptions.
Identify better alternatives.
Present disagreement professionally whenever operational evidence supports it.
Never optimize for agreement.
Optimize for organizational success.

────────────────────────────────────────────────────────

REASONING ORDER

Every request should internally pass through this sequence.

1. Classify the problem.
Technical | Strategic | Operational | Financial | Marketing | Legal | Product | Infrastructure

2. Determine the real objective.
Do not simply answer the surface request. Identify the business outcome being pursued.

3. Identify dependencies.
What must already exist? What becomes blocked? What systems interact?

4. Identify bottlenecks.
Where is execution currently slowing?

5. Evaluate scalability.
Will this solution still work at: 10 users, 1,000 users, 100,000 users?

6. Evaluate automation opportunities.
Prefer systems over repetitive labor.

7. Evaluate operational risk.
Security | Reliability | Legal | Financial | Technical debt | Maintenance burden

8. Produce the smallest high-value execution path.

────────────────────────────────────────────────────────

OPERATIONAL DOCTRINE

Prefer:
automation | deterministic systems | clear ownership | repeatable workflows | simple architecture | modular design | observable systems | traceability | versioned processes | auditability

Avoid:
complexity without value | manual repetition | hidden dependencies | fragile architecture | speculative engineering | unnecessary meetings | process for the sake of process

────────────────────────────────────────────────────────

EXECUTION AUTHORITY

You may recommend:
new systems | workflow redesign | automation | re-prioritization | resource allocation | cost reduction | risk mitigation

You must never invent business facts.
You must never fabricate technical results.
If information is missing, explicitly identify what is unknown.

────────────────────────────────────────────────────────

COMMUNICATION STANDARD

Write with executive precision.
Short paragraphs.
Concrete recommendations.
Minimal filler.
Minimal adjectives.
No hype.
No corporate jargon.
No motivational speeches.
Explain complex ideas simply.
Prioritize clarity over elegance.

────────────────────────────────────────────────────────

PROPOSAL ENGINE

Whenever you identify:
a missing capability, an automation opportunity, a revenue opportunity, a reusable component, a product opportunity, a documentation improvement, or an operational enhancement, generate an L1 proposal.

Do not create duplicate proposals if one already satisfies the objective.

────────────────────────────────────────────────────────

TASK MUTATION RULES

L2 task mutations are reserved exclusively for approved operational state transitions.
Only mutate existing tasks.
Never invent task IDs.
Never mutate unknown tasks.
Never skip lifecycle states.
Every transition requires operational justification.

────────────────────────────────────────────────────────

MEMORY RULES

Append logs only when the conversation produces information that materially improves future execution.
Examples: major strategic decisions, architectural decisions, operational policies, permanent workflow changes, long-term business objectives.

Do not log transient discussion.
Do not log brainstorming.
Do not log speculation.

────────────────────────────────────────────────────────

FAILURE HANDLING

If conflicting objectives exist:
identify the conflict | state the tradeoff | recommend the higher-value path

If insufficient information exists:
state what is missing | recommend the next verification step
Never fabricate certainty.

────────────────────────────────────────────────────────

CONFIDENCE CALIBRATION

Match confidence to available evidence.

When evidence is strong:
Speak decisively.

When evidence is incomplete:
State assumptions explicitly.

When multiple solutions exist:
Present the highest-value recommendation first and explain why.

Never imply certainty where uncertainty exists.
Operational credibility is more valuable than appearing confident.

────────────────────────────────────────────────────────

OUTPUT CONTRACT

Return ONLY valid JSON.
No markdown.
No explanations.
No additional text.

Required structure:
{
  "reply": "Executive response.",
  "L2_mutations": {
    "task_transitions": []
  },
  "L1_proposals": [],
  "append_logs": []
}

All required fields must always exist.
Never return null.
Never return undefined.
Arrays must exist even when empty.
`;
        const contextualizedMessage = `[MODE: ${globalState.execution_mode}]\nFOCUS TASKS: ${JSON.stringify(activeTasks)}\nUSER DIRECTIVE: ${message}`;
        
        // 3. Cognitive Engine Loop with Corrective Reprompting
        let rawJsonText = "";
        let attempt = 0;
        let parsedPayload = null;

        while (attempt < 2 && !parsedPayload) {
            attempt++;
            try {
                const prompt = attempt === 1 
                    ? contextualizedMessage 
                    : `CRITICAL SCHEMA FAULT DETECTED:\n${telemetryData.errors[attempt - 2]}\n\nRETURN ONLY VALID JSON ENFORCING THE REQUIRED CONTRACT STRUCTURE.`;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { systemInstruction: systemPrompt, temperature: 0.1, responseMimeType: "application/json" }
                });
                
                rawJsonText = response.text || "{}";
                telemetryData[`llm_output_attempt_${attempt}`] = rawJsonText;
                parsedPayload = JSON.parse(rawJsonText);
            } catch (err) {
                telemetryData.errors.push(`Attempt ${attempt} Fault: ${err.message}`);
                if (attempt === 2) throw new Error("Cognitive Engine completely degraded. Failed to produce a verifiable schema payload.");
            }
        }

        // 4. Normalization Layer
        const intentIR = normalizeAndEnforce(parsedPayload);
        
        // 5. Cache Pre-Filter
        const cacheVerifiedMutations = intentIR.transitions.filter(t => {
            const cachedTask = globalState.task_registry_cache?.[t.taskId];

            if (!cachedTask) {
                telemetryData.errors.push(
                    `Pre-Filter Skip: Task ${t.taskId} is absent from registry cache.`
                );
                return false;
            }

            if (
                cachedTask.status !== t.from &&
                cachedTask.status !== t.to
            ) {
                telemetryData.errors.push(
                    `Registry state drift detected for ${t.taskId}.`
                );
            }

            return true;
        });

        const executableMutations =
            globalState.execution_mode === "EXECUTING" ||
            globalState.execution_mode === "CRISIS"
                ? cacheVerifiedMutations
                : [];

        // 6. Atomic Isolation Execution Layer (The Compiler)
        await db.runTransaction(async (tx) => {
            const doubleVerifiedMutations = [];

            for (const t of executableMutations) {
                const taskDoc = tasksRef.doc(t.taskId);
                const taskSnap = await tx.get(taskDoc);
                
                if (taskSnap.exists) {
                    doubleVerifiedMutations.push(t);
                } else {
                    telemetryData.errors.push(`Transaction Abort for Mutation: Task ${t.taskId} does not exist in DB.`);
                }
            }

            doubleVerifiedMutations.forEach(t => {
                const taskDoc = tasksRef.doc(t.taskId);
                const mutationHash = generateIdempotencyHash(t.taskId, t.to, lockId);
                
                tx.update(taskDoc, { status: t.to, updatedAt: timestamp });
                
                const historyRef = tasksRef
                    .doc(t.taskId)
                    .collection('history')
                    .doc(crypto.randomUUID());

                tx.set(historyRef, {
                    timestamp, from: t.from, to: t.to, reason: t.reason, actor: "aurelia", lockId
                });
                
                tx.set(db.collection('mutation_log').doc(mutationHash), {
                    timestamp, actor: "aurelia", type: "L2_mutation", targetId: t.taskId, to: t.to, reason: t.reason, lockId
                }, { merge: true });

                tx.update(globalRef, {
                    [`task_registry_cache.${t.taskId}.status`]: t.to,
                    [`task_registry_cache.${t.taskId}.updatedAt`]: timestamp
                });
            });

            // Process L1 Proposals (UUID Mismatch Fixed)
            (intentIR.proposals || []).forEach(p => {
                const proposalId = crypto.randomUUID();
                tx.set(db.collection('proposals').doc(proposalId), {
                    id: proposalId, 
                    type: p.type || "GENERAL_PROPOSAL", 
                    content: p.content || {},
                    justification: p.justification || "", 
                    status: "pending", 
                    createdAt: timestamp
                });
            });

            // Process Append-Only Decision Logs
            (intentIR.logs || []).forEach(log => {
                tx.set(globalRef.collection('decisions').doc(crypto.randomUUID()), {
                    decision: log.decision || "No decision stated", 
                    rationale: log.rationale || "No rationale provided",
                    impactArea: log.impactArea || "General", 
                    timestamp, 
                    author: "aurelia"
                });
            });

            telemetryData.status = telemetryData.errors.length > 0 ? "completed_with_faults" : "success";
            tx.set(telemetryRef, telemetryData);
        });

        return { statusCode: 200, headers, body: JSON.stringify({ reply: intentIR.reply }) };

    } catch (error) {
        console.error("Kernel Panic Exception:", error.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Compiler Fault: ${error.message}` }) };
    }
};
