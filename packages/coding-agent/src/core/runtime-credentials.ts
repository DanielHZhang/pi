import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
const OPENAI_CODEX_PROFILE_PATTERN = /^openai-codex-([2-9]\d*)$/u;

export interface CredentialProfile extends CredentialInfo {
	providerId: string;
	credentialKey: string;
	index: number;
	selected: boolean;
}

/** Async credential store overlay for runtime API keys and session-scoped credential selection. */
export class RuntimeCredentials implements CredentialStore {
	private readonly store: CredentialStore;
	private readonly overrides = new Map<string, string>();
	private readonly selections = new Map<string, string>();

	constructor(store: CredentialStore) {
		this.store = store;
	}

	async initializeSelections(options?: AuthOperationOptions): Promise<void> {
		const credentials = await this.store.list(options);
		this.chooseDefaultSelection(OPENAI_CODEX_PROVIDER_ID, credentials);
	}

	setRuntimeApiKey(providerId: string, apiKey: string): void {
		this.overrides.set(providerId, apiKey);
	}

	removeRuntimeApiKey(providerId: string): void {
		this.overrides.delete(providerId);
	}

	hasRuntimeApiKey(providerId: string): boolean {
		return this.overrides.has(providerId);
	}

	getSelectedCredentialKey(providerId: string): string {
		return this.selections.get(providerId) ?? providerId;
	}

	getProviderIdForCredentialKey(credentialKey: string): string {
		return RuntimeCredentials.providerIdForCredentialKey(credentialKey);
	}

	isCredentialKeyForProvider(providerId: string, credentialKey: string): boolean {
		return RuntimeCredentials.providerIdForCredentialKey(credentialKey) === providerId;
	}

	selectCredential(providerId: string, credentialKey: string): void {
		if (!this.isCredentialKeyForProvider(providerId, credentialKey)) {
			throw new Error(`Credential "${credentialKey}" does not belong to provider "${providerId}"`);
		}
		this.selections.set(providerId, credentialKey);
	}

	async listProfiles(providerId: string, options?: AuthOperationOptions): Promise<CredentialProfile[]> {
		const selected = this.getSelectedCredentialKey(providerId);
		return (await this.list(options))
			.filter((credential) => this.isCredentialKeyForProvider(providerId, credential.providerId))
			.map((credential) => ({
				...credential,
				providerId,
				credentialKey: credential.providerId,
				index: RuntimeCredentials.profileIndex(providerId, credential.providerId),
				selected: credential.providerId === selected,
			}))
			.sort((a, b) => a.index - b.index);
	}

	async nextCredentialKey(providerId: string, options?: AuthOperationOptions): Promise<string> {
		const profiles = await this.listProfiles(providerId, options);
		if (providerId !== OPENAI_CODEX_PROVIDER_ID) {
			return providerId;
		}
		const nextIndex = Math.max(1, ...profiles.map((profile) => profile.index)) + 1;
		return `${providerId}-${nextIndex}`;
	}

	async hasCredentialKey(credentialKey: string, options?: AuthOperationOptions): Promise<boolean> {
		return (await this.list(options)).some((credential) => credential.providerId === credentialKey);
	}

	async restoreSelection(
		providerId: string,
		preferredCredentialKey?: string,
		options?: AuthOperationOptions,
	): Promise<void> {
		const credentials = await this.list(options);
		if (
			preferredCredentialKey &&
			this.isCredentialKeyForProvider(providerId, preferredCredentialKey) &&
			credentials.some((credential) => credential.providerId === preferredCredentialKey)
		) {
			this.selections.set(providerId, preferredCredentialKey);
			return;
		}
		this.chooseDefaultSelection(providerId, credentials);
	}

	providerIdsForCredentials(credentials: readonly CredentialInfo[]): Set<string> {
		return new Set(
			credentials.map((credential) => RuntimeCredentials.providerIdForCredentialKey(credential.providerId)),
		);
	}

	async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
		options?.signal?.throwIfAborted();
		const override = this.overrides.get(providerId);
		return override
			? { type: "api_key", key: override }
			: this.store.read(this.getSelectedCredentialKey(providerId), options);
	}

	async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
		const entries = new Map((await this.store.list(options)).map((entry) => [entry.providerId, entry]));
		options?.signal?.throwIfAborted();
		for (const providerId of this.overrides.keys()) {
			entries.set(providerId, { providerId, type: "api_key" });
		}
		return [...entries.values()];
	}

	modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
		options?: AuthOperationOptions,
	): Promise<Credential | undefined> {
		return this.store.modify(this.getSelectedCredentialKey(providerId), fn, options);
	}

	async delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
		options?.signal?.throwIfAborted();
		await this.store.delete(this.getSelectedCredentialKey(providerId), options);
		this.overrides.delete(providerId);
	}

	private chooseDefaultSelection(providerId: string, credentials: readonly CredentialInfo[]): void {
		const keys = credentials
			.filter((credential) => this.isCredentialKeyForProvider(providerId, credential.providerId))
			.map((credential) => credential.providerId)
			.sort(
				(a, b) => RuntimeCredentials.profileIndex(providerId, a) - RuntimeCredentials.profileIndex(providerId, b),
			);
		if (keys.length === 0) {
			this.selections.delete(providerId);
			return;
		}
		this.selections.set(providerId, keys.includes(providerId) ? providerId : keys[0]!);
	}

	private static providerIdForCredentialKey(credentialKey: string): string {
		const match = OPENAI_CODEX_PROFILE_PATTERN.exec(credentialKey);
		if (!match) return credentialKey;
		const index = Number(match[1]);
		return Number.isSafeInteger(index) && index >= 2 ? OPENAI_CODEX_PROVIDER_ID : credentialKey;
	}

	private static profileIndex(providerId: string, credentialKey: string): number {
		if (credentialKey === providerId) return 1;
		if (providerId !== OPENAI_CODEX_PROVIDER_ID) return Number.MAX_SAFE_INTEGER;
		const match = OPENAI_CODEX_PROFILE_PATTERN.exec(credentialKey);
		const index = match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
		return Number.isSafeInteger(index) && index >= 2 ? index : Number.MAX_SAFE_INTEGER;
	}
}
