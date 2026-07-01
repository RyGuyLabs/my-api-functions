import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import crypto from 'crypto';

// --- SYSTEM INITIALIZATION --- //
initializeApp();
const db = getFirestore();
const ai = new GoogleGenAI({ apiKey: process.env.AURELIA_API_KEY });

const VALID_STATUSES = ["BACKLOG", "PLANNED", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"];
const MAX_MUTATIONS = 20;

// --- DETERMINISTIC COMPILER LAYER --- //
const normalizeAndEnforce = (payload) => {
    // Strict Contract Enforcement Firewall
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
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    const timestamp = Date.now();

    try {
        const { message, clientRequestId } = JSON.parse(event.body);
        if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message payload." }) };

        // Deterministic Lock ID Generation (Client key fallback to content hash to stop rapid-fire submission loops)
        const lockId = clientRequestId || crypto.createHash('sha256').update(message).digest('hex');
        
        // 1. Request Lock Barrier (Prevents Double Execution / Webhook Replays)
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
        
        // 2. Read Stage: Load Operational Context
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

        const systemPrompt = `AURELIA CORE OPERATING KERNEL • Chief Operating Officer • RyGuyLabs\nYou are an Intent Engine. Return ONLY JSON matching the requested contract.`;
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
        
        // 5. Cache Pre-Filter (Saves unneeded transactional DB reads)
        const cacheVerifiedMutations = intentIR.transitions.filter(t => {
            const existsInCache = globalState.task_registry_cache?.[t.taskId];
            if (!existsInCache) {
                telemetryData.errors.push(`Pre-Filter Skip: Task ${t.taskId} is absent from registry cache.`);
            }
            return !!existsInCache;
        });

        // 6. Atomic Isolation Execution Layer (The Compiler)
        await db.runTransaction(async (tx) => {
            const doubleVerifiedMutations = [];

            // Hard DB Existence Verification within Transaction Boundary
            for (const t of cacheVerifiedMutations) {
                const taskDoc = tasksRef.doc(t.taskId);
                const taskSnap = await tx.get(taskDoc);
                
                if (taskSnap.exists) {
                    doubleVerifiedMutations.push(t);
                } else {
                    telemetryData.errors.push(`Transaction Abort for Mutation: Task ${t.taskId} does not exist in DB.`);
                }
            }

            // Execute State Mutators
            doubleVerifiedMutations.forEach(t => {
                const taskDoc = tasksRef.doc(t.taskId);
                const mutationHash = generateIdempotencyHash(t.taskId, t.to, lockId);
                
                // Authoritative State Write
                tx.update(taskDoc, { status: t.to, updatedAt: timestamp });
                
                // Append-Only Event Stream
                tx.set(taskDoc.collection('history').doc(crypto.randomUUID()), {
                    timestamp, from: t.from, to: t.to, reason: t.reason, actor: "aurelia", lockId
                });
                
                // Idempotent Audit Log Write
                tx.set(db.collection('mutation_log').doc(mutationHash), {
                    timestamp, actor: "aurelia", type: "L2_mutation", targetId: t.taskId, to: t.to, reason: t.reason, lockId
                }, { merge: true });

                // Synchronous Cache Registry Sync (Protected by Tx lock boundary)
                tx.update(globalRef, {
                    [`task_registry_cache.${t.taskId}.status`]: t.to,
                    [`task_registry_cache.${t.taskId}.updatedAt`]: timestamp
                });
            });

            // Process L1 Proposals
            intentIR.proposals.forEach(p => {
                tx.set(db.collection('proposals').doc(crypto.randomUUID()), {
                    id: crypto.randomUUID(), type: p.type, content: p.content || {},
                    justification: p.justification || "", status: "pending", createdAt: timestamp
                });
            });

            // Process Append-Only Decision Logs
            intentIR.logs.forEach(log => {
                tx.set(globalRef.collection('decisions').doc(crypto.randomUUID()), {
                    decision: log.decision, rationale: log.rationale,
                    impactArea: log.impactArea, timestamp, author: "aurelia"
                });
            });

            // Write Telemetry State Log inside transaction scope
            telemetryData.status = telemetryData.errors.length > 0 ? "completed_with_faults" : "success";
            tx.set(telemetryRef, telemetryData);
        });

        return { statusCode: 200, headers, body: JSON.stringify({ reply: intentIR.reply }) };

    } catch (error) {
        console.error("Kernel Panic Exception:", error.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Compiler Fault: ${error.message}` }) };
    }
};
