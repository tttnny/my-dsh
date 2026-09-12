import { i as LLM_FAMILY_IDS } from "./status-D0-em3Ru.js";
//#region src/live-gates.ts
/** Explicit, one-gate-at-a-time CLI boundary for live private endpoint verification. */
const LIVE_ACKNOWLEDGEMENT = "I_ACKNOWLEDGE_UNOFFICIAL_ANTIGRAVITY_PRIVATE_ENDPOINT_RISK";
const LIVE_GATE_IDS = [
	"A",
	"0L",
	"S",
	"I",
	"V"
];
/** Parse and enforce opt-in before constructing anything that can read credentials or use the network. */
async function runLiveGateCli(argv, env = process.env, dependencies = {}) {
	const output = dependencies.output ?? ((line) => {
		process.stdout.write(`${line}\n`);
	});
	const error = dependencies.error ?? ((line) => {
		process.stderr.write(`${line}\n`);
	});
	const parsed = parseArguments(argv);
	if (parsed.error !== void 0) {
		error(parsed.error);
		return 2;
	}
	if (!parsed.acknowledged || env.DSH_ANTIGRAVITY_LIVE_ACK !== "I_ACKNOWLEDGE_UNOFFICIAL_ANTIGRAVITY_PRIVATE_ENDPOINT_RISK") {
		error("Live gates require explicit acknowledgement via both --acknowledge-private-risk and DSH_ANTIGRAVITY_LIVE_ACK.");
		return 2;
	}
	const createRunner = dependencies.createRunner ?? (async () => {
		return (await import("./live-gate-runner.js")).createProductionLiveGateRunner({ output });
	});
	let runner;
	try {
		runner = await createRunner();
		const result = await runner.run(parsed.gate, parsed.options);
		output(JSON.stringify(result));
		return result.outcome === "passed" ? 0 : 1;
	} catch {
		error("The selected Antigravity live gate failed safely.");
		return 1;
	} finally {
		await runner?.dispose().catch(() => {});
	}
}
function parseArguments(argv) {
	let acknowledged = false;
	let gate;
	let videoFile;
	let llmFamily;
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (value === "--acknowledge-private-risk") {
			if (acknowledged) return { error: "The acknowledgement flag may be supplied only once." };
			acknowledged = true;
			continue;
		}
		if (value === "--gate") {
			if (gate !== void 0) return { error: "Select exactly one live gate per invocation." };
			const candidate = argv[index + 1];
			if (candidate === void 0 || !LIVE_GATE_IDS.includes(candidate)) return { error: "Select one live gate: A, 0L, S, I, or V." };
			gate = candidate;
			index += 1;
			continue;
		}
		if (value === "--family") {
			if (llmFamily !== void 0) return { error: "The LLM family may be supplied only once." };
			const candidate = argv[index + 1];
			if (candidate === void 0 || !LLM_FAMILY_IDS.includes(candidate)) return { error: "Select one LLM family: gemini, claude, or gpt-oss." };
			llmFamily = candidate;
			index += 1;
			continue;
		}
		if (value === "--video-file") {
			if (videoFile !== void 0) return { error: "The video fixture may be supplied only once." };
			const candidate = argv[index + 1];
			if (candidate === void 0 || candidate.length === 0 || candidate.length > 4096) return { error: "Gate V requires a bounded video fixture path." };
			videoFile = candidate;
			index += 1;
			continue;
		}
		return { error: "The live gate arguments are invalid." };
	}
	if (gate === void 0) return { error: "Select exactly one live gate per invocation." };
	if (gate === "V" && videoFile === void 0) return { error: "Gate V requires --video-file." };
	if (gate !== "V" && videoFile !== void 0) return { error: "--video-file is valid only for Gate V." };
	if (gate !== "0L" && llmFamily !== void 0) return { error: "--family is valid only for Gate 0/L." };
	return {
		acknowledged,
		gate,
		options: {
			...videoFile === void 0 ? {} : { videoFile },
			...llmFamily === void 0 ? {} : { llmFamily }
		}
	};
}
//#endregion
export { LIVE_ACKNOWLEDGEMENT, LIVE_GATE_IDS, runLiveGateCli };
