// Trust-boundary helpers for the admin RPC wrappers in `./rpc.ts`.
//
// `readUuidRpcData` now lives in `@/lib/shared/uuid` so the leader RPC
// wrappers can enforce the same uuid contract. Re-exported here to keep
// the admin wrappers' import path stable.

export { readUuidRpcData } from "@/lib/shared/uuid";
