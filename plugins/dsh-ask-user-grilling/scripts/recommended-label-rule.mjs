/**
 * 界面侧「哪个 label 算推荐」的判定规则。
 *
 * 逐字抄自安装副本 `@deepseek-ai/dsh-client-ui-user-questions/lib/client.js` 里
 * `parseRecommendedLabel` 的 `suffix` 常量。它只有一条规则：label 以半角或全角括号的
 * 推荐字样收尾。scripts/smoke-host.mjs 断言这条抄本仍与安装副本逐字相同——上游一改，
 * 这条断言当场失败，而不是让测试继续通过而徽标实际不再渲染。
 */
export const CLIENT_ACCEPTS = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
