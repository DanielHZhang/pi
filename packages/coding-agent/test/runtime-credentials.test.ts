import type { CredentialStore } from "@earendil-works/pi-ai";
import { describe, expect, test, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { RuntimeCredentials } from "../src/core/runtime-credentials.ts";

describe("RuntimeCredentials", () => {
	test("runtime overrides mask stored credentials without persisting", async () => {
		const storage = AuthStorage.inMemory({ anthropic: { type: "api_key", key: "stored-key" } });
		const credentials = new RuntimeCredentials(storage);

		credentials.setRuntimeApiKey("anthropic", "runtime-key");
		expect(await credentials.read("anthropic")).toEqual({ type: "api_key", key: "runtime-key" });
		expect(await storage.read("anthropic")).toEqual({ type: "api_key", key: "stored-key" });

		credentials.removeRuntimeApiKey("anthropic");
		expect(await credentials.read("anthropic")).toEqual({ type: "api_key", key: "stored-key" });
	});

	test("enumeration merges overrides without exposing keys", async () => {
		const storage = AuthStorage.inMemory({
			anthropic: { type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 60_000 },
		});
		const credentials = new RuntimeCredentials(storage);
		credentials.setRuntimeApiKey("anthropic", "runtime-key");
		credentials.setRuntimeApiKey("openai", "other-runtime-key");

		expect(await credentials.list()).toEqual([
			{ providerId: "anthropic", type: "api_key" },
			{ providerId: "openai", type: "api_key" },
		]);
	});

	test("forwards operation signals to the persistent store", async () => {
		const controller = new AbortController();
		const received: AbortSignal[] = [];
		const storage: CredentialStore = {
			read: async (_providerId, options) => {
				received.push(options?.signal as AbortSignal);
				return undefined;
			},
			list: async (options) => {
				received.push(options?.signal as AbortSignal);
				return [];
			},
			modify: async (_providerId, _fn, options) => {
				received.push(options?.signal as AbortSignal);
				return undefined;
			},
			delete: async (_providerId, options) => {
				received.push(options?.signal as AbortSignal);
			},
		};
		const credentials = new RuntimeCredentials(storage);

		await credentials.read("anthropic", { signal: controller.signal });
		await credentials.list({ signal: controller.signal });
		await credentials.modify("anthropic", async () => undefined, { signal: controller.signal });
		await credentials.delete("anthropic", { signal: controller.signal });

		expect(received).toEqual([controller.signal, controller.signal, controller.signal, controller.signal]);
	});

	test("keeps a runtime override when persistent deletion is cancelled", async () => {
		const aborted = new Error("cancelled");
		aborted.name = "AbortError";
		const storage = AuthStorage.inMemory({ anthropic: { type: "api_key", key: "stored-key" } });
		const deleteSpy = vi.spyOn(storage, "delete").mockRejectedValueOnce(aborted);
		const credentials = new RuntimeCredentials(storage);
		credentials.setRuntimeApiKey("anthropic", "runtime-key");

		await expect(credentials.delete("anthropic", { signal: new AbortController().signal })).rejects.toBe(aborted);
		expect(deleteSpy).toHaveBeenCalledTimes(1);
		expect(await credentials.read("anthropic")).toEqual({ type: "api_key", key: "runtime-key" });
	});

	test("delete clears both the override and persisted credential", async () => {
		const storage = AuthStorage.inMemory({ anthropic: { type: "api_key", key: "stored-key" } });
		const credentials = new RuntimeCredentials(storage);
		credentials.setRuntimeApiKey("anthropic", "runtime-key");

		await credentials.delete("anthropic");

		expect(await credentials.read("anthropic")).toBeUndefined();
		expect(await credentials.list()).toEqual([]);
	});

	test("routes OpenAI Codex auth through the selected credential profile", async () => {
		const storage = AuthStorage.inMemory({
			"openai-codex": {
				type: "oauth",
				access: "personal",
				refresh: "personal-refresh",
				expires: Date.now() + 60_000,
				label: "P",
			},
			"openai-codex-2": {
				type: "oauth",
				access: "work",
				refresh: "work-refresh",
				expires: Date.now() + 60_000,
				label: "W",
			},
		});
		const credentials = new RuntimeCredentials(storage);
		await credentials.initializeSelections();

		expect(await credentials.read("openai-codex")).toMatchObject({ type: "oauth", access: "personal" });
		credentials.selectCredential("openai-codex", "openai-codex-2");
		expect(await credentials.read("openai-codex")).toMatchObject({ type: "oauth", access: "work" });
		expect(await credentials.listProfiles("openai-codex")).toEqual([
			{
				providerId: "openai-codex",
				credentialKey: "openai-codex",
				index: 1,
				selected: false,
				type: "oauth",
				label: "P",
			},
			{
				providerId: "openai-codex",
				credentialKey: "openai-codex-2",
				index: 2,
				selected: true,
				type: "oauth",
				label: "W",
			},
		]);
	});

	test("uses the first numbered OpenAI Codex credential when the canonical key is absent", async () => {
		const storage = AuthStorage.inMemory({
			"openai-codex-3": {
				type: "oauth",
				access: "third",
				refresh: "third-refresh",
				expires: Date.now() + 60_000,
			},
			"openai-codex-2": {
				type: "oauth",
				access: "second",
				refresh: "second-refresh",
				expires: Date.now() + 60_000,
			},
		});
		const credentials = new RuntimeCredentials(storage);
		await credentials.initializeSelections();

		expect(credentials.getSelectedCredentialKey("openai-codex")).toBe("openai-codex-2");
		expect(await credentials.read("openai-codex")).toMatchObject({ type: "oauth", access: "second" });
		expect(await credentials.nextCredentialKey("openai-codex")).toBe("openai-codex-4");
	});

	test("rejects non-numeric provider lookalikes as OpenAI Codex profiles", () => {
		const credentials = new RuntimeCredentials(AuthStorage.inMemory());
		expect(() => credentials.selectCredential("openai-codex", "openai-codex-work")).toThrow(/does not belong/u);
	});
});
