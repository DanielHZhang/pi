import type { Component } from "@earendil-works/pi-tui";
import { beforeAll, expect, test } from "vitest";
import { BranchSummaryMessageComponent } from "../src/modes/interactive/components/branch-summary-message.ts";
import { CompactionSummaryMessageComponent } from "../src/modes/interactive/components/compaction-summary-message.ts";
import { CustomMessageComponent } from "../src/modes/interactive/components/custom-message.ts";
import { SkillInvocationMessageComponent } from "../src/modes/interactive/components/skill-invocation-message.ts";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

beforeAll(() => {
	initTheme("dark");
});

function expectNoOuterVerticalPadding(name: string, component: Component, leadingSpacerLines = 0): void {
	const lines = component.render(80).map(stripAnsi).slice(leadingSpacerLines);
	expect(lines.length).toBeGreaterThan(0);
	expect(lines[0]?.trim(), `${name} should not start with vertical padding`).not.toBe("");
	expect(lines[lines.length - 1]?.trim(), `${name} should not end with vertical padding`).not.toBe("");
}

test("renders chat message cards without vertical padding inside the card", () => {
	const timestamp = Date.now();

	expectNoOuterVerticalPadding("user", new UserMessageComponent("hello"));
	expectNoOuterVerticalPadding(
		"custom",
		new CustomMessageComponent({
			role: "custom",
			customType: "note",
			content: "hello",
			display: true,
			timestamp,
		}),
		1,
	);
	expectNoOuterVerticalPadding(
		"branch summary",
		new BranchSummaryMessageComponent({
			role: "branchSummary",
			summary: "hello",
			fromId: "branch-1",
			timestamp,
		}),
	);
	expectNoOuterVerticalPadding(
		"compaction summary",
		new CompactionSummaryMessageComponent({
			role: "compactionSummary",
			summary: "hello",
			tokensBefore: 1234,
			timestamp,
		}),
	);
	expectNoOuterVerticalPadding(
		"skill invocation",
		new SkillInvocationMessageComponent({
			name: "example-skill",
			location: "/tmp/example-skill/SKILL.md",
			content: "# Example skill\n\nUse this skill.",
			userMessage: undefined,
		}),
	);
});
