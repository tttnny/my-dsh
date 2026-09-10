export declare const name = "@lynn123411/dsh-a6api";
export declare const inject: string[];
export { fetchBalance, fetchTokenModels, fetchRecentLogs, fetchChannelDetails, fetchMarketplacePins, } from './server/a6api-client.js';
export { probeSingleModel, getKnownMerchantsFromLogs } from './server/probe.js';
export { resolveModelMeta, inferBrand, getCatalog, getCatalogEntry, clearCatalog, queryOpenRouter, fetchMarketplaceModels, updateCatalogEntry, } from './server/catalog.js';
export { createConfigAccess, A6API_CRED_REF, A6API_TOKEN_REF, A6API_USER_REF } from './server/sync.js';
export declare function apply(ctx: any): void;
