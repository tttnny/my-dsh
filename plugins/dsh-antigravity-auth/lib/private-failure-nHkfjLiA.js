import { m as PrivateTransportError } from "./private-transport-DvkyFFK_.js";
//#region src/private-failure.ts
/** One closed classifier shared by every capability's public error vocabulary. */
function classifyPrivateFailure(error) {
	if (!(error instanceof PrivateTransportError)) return "failed";
	switch (error.code) {
		case "authentication": return "authentication";
		case "forbidden": return "forbidden";
		case "rate-limited": return "rate-limited";
		case "cancelled": return "cancelled";
		case "timeout": return "timeout";
		case "attribution-rejected": return "attribution-rejected";
		case "protocol-drift":
		case "invalid-response": return "protocol-drift";
		case "response-too-large":
		case "frame-too-large": return "response-limit";
		case "request-too-large": return "request-limit";
		case "upstream": return "upstream";
		case "offline": return "network";
	}
}
//#endregion
export { classifyPrivateFailure as t };
