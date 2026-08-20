import { describe, expect, it } from "vitest";
import { parseSkillInvocation } from "../src/core/agent-session.ts";

describe("parseSkillInvocation", () => {
	it("parses consecutive skill blocks and the user prompt", () => {
		const invocation = parseSkillInvocation(
			'<skill name="first" location="/skills/first/SKILL.md">\nFirst body\n</skill>\n\n' +
				'<skill name="second" location="/skills/second/SKILL.md">\nSecond body\n</skill>\n\n' +
				"Review this code",
		);

		expect(invocation).toEqual({
			skills: [
				{ name: "first", location: "/skills/first/SKILL.md", content: "First body" },
				{ name: "second", location: "/skills/second/SKILL.md", content: "Second body" },
			],
			userMessage: "Review this code",
		});
	});

	it("parses skill blocks without a trailing user prompt", () => {
		const invocation = parseSkillInvocation(
			'<skill name="first" location="/skills/first/SKILL.md">\nFirst body\n</skill>\n\n' +
				'<skill name="second" location="/skills/second/SKILL.md">\nSecond body\n</skill>',
		);

		expect(invocation?.skills.map((skill) => skill.name)).toEqual(["first", "second"]);
		expect(invocation?.userMessage).toBeUndefined();
	});
});
