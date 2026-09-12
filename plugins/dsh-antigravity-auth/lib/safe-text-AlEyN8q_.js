//#region src/safe-text.ts
/** Shared bounded text predicate for Host trust-boundary values. */
function isBoundedSafeText(value, maxLength, minLength = 1) {
	if (typeof value !== "string" || !Number.isSafeInteger(maxLength) || !Number.isSafeInteger(minLength) || minLength < 0 || maxLength < minLength || value.length < minLength || value.length > maxLength) return false;
	for (let index = 0; index < value.length; index += 1) {
		const codePoint = value.charCodeAt(index);
		if (codePoint < 32 || codePoint === 127) return false;
	}
	return true;
}
//#endregion
export { isBoundedSafeText as t };
