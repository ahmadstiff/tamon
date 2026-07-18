import {describe, expect, it} from "vitest";
import {classify, decodeTokenUri, erosion, State, timeLeft, validateRepo} from "./tamon";
import type {Commitment, StateValue} from "./tamon";

/// A 100-second span starting at t=1000 makes every percentage threshold readable as a
/// literal timestamp: t=1050 is exactly 50%, t=1080 exactly 80%.
const START = 1000;
const DEADLINE = 1100;

function stone(overrides: Partial<Pick<Commitment, "state" | "start" | "deadline">> = {}) {
  return {
    state: State.Active as StateValue,
    start: BigInt(START),
    deadline: BigInt(DEADLINE),
    ...overrides,
  };
}

/// Builds the exact two-layer envelope tokenURI produces: base64 JSON whose image field is a
/// base64 SVG data URI.
function tokenUri(meta: Record<string, unknown>): string {
  return "data:application/json;base64," + Buffer.from(JSON.stringify(meta)).toString("base64");
}

function svgDataUri(svg: string): string {
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// ---------------------------------------------------------------- validateRepo
//
// These cases are the client-side half of a rule enforced twice. The contract's _validateRepo
// reverts with BadRepo on exactly this set, so any case here that starts returning null is a
// user staring at a raw wallet revert instead of a form message.

describe("validateRepo", () => {
  describe("accepts", () => {
    it("returns null for a plain owner/name", () => {
      expect(validateRepo("monad/tamon")).toBeNull();
    });

    it("returns null for dots, dashes, and underscores inside segments", () => {
      expect(validateRepo("my-org.io/some_repo.v2")).toBeNull();
    });

    it("returns null for digits and mixed case", () => {
      expect(validateRepo("Owner99/Repo00")).toBeNull();
    });

    it("returns null at exactly 100 characters, the contract's MAX_REPO_LEN", () => {
      const repo = "a".repeat(89) + "/" + "b".repeat(10);
      expect(repo).toHaveLength(100);
      expect(validateRepo(repo)).toBeNull();
    });

    it("returns null for segments that merely contain dots, like 'a/..b'", () => {
      // Only a segment that is exactly "." or ".." is traversal. "..b" is a real repo name.
      expect(validateRepo("a/..b")).toBeNull();
      expect(validateRepo("a/.b")).toBeNull();
    });
  });

  describe("rejects", () => {
    it("returns the prompt message for an empty string", () => {
      expect(validateRepo("")).toBe("Enter a repository as owner/name.");
    });

    it("returns the length message at 101 characters", () => {
      const repo = "a".repeat(90) + "/" + "b".repeat(10);
      expect(repo).toHaveLength(101);
      expect(validateRepo(repo)).toBe("Repository name is too long.");
    });

    it.each([
      ["a space", "owner/my repo"],
      ["a double quote", 'owner/na"me'],
      ["a backslash", "owner\\name"],
      ["a newline", "owner/name\n"],
      ["an angle bracket", "owner/<script>"],
      ["an at sign", "owner/name@v1"],
      ["a colon", "https://owner/name"],
    ])("returns the charset message for %s", (_label, repo) => {
      expect(validateRepo(repo)).toBe("Use only letters, numbers, and - _ . /");
    });

    it("returns the slash message when there is no slash", () => {
      expect(validateRepo("ownername")).toBe("Use exactly one slash, as in owner/name.");
    });

    it("returns the slash message for two slashes", () => {
      expect(validateRepo("owner/group/name")).toBe("Use exactly one slash, as in owner/name.");
    });

    it("returns the both-required message for an empty owner segment", () => {
      expect(validateRepo("/name")).toBe("Both the owner and the name are required.");
    });

    it("returns the both-required message for an empty name segment", () => {
      expect(validateRepo("owner/")).toBe("Both the owner and the name are required.");
    });

    it("returns the both-required message for a lone slash", () => {
      expect(validateRepo("/")).toBe("Both the owner and the name are required.");
    });

    it.each([
      ["owner is '.'", "./name"],
      ["name is '.'", "owner/."],
    ])("returns the invalid-path message when %s", (_label, repo) => {
      expect(validateRepo(repo)).toBe("That is not a valid repository path.");
    });

    // Path traversal is the security-relevant case: the repo string reaches a backend that
    // builds GitHub API paths from it, so "../" segments must never survive validation.
    it.each([
      ["owner is '..'", "../name"],
      ["name is '..'", "owner/.."],
    ])("returns the invalid-path message when %s (traversal)", (_label, repo) => {
      expect(validateRepo(repo)).toBe("That is not a valid repository path.");
    });
  });
});

// -------------------------------------------------------------------- classify

describe("classify", () => {
  it("returns kristal for a Succeeded commitment regardless of the clock", () => {
    expect(classify(stone({state: State.Succeeded}), START)).toBe("kristal");
    expect(classify(stone({state: State.Succeeded}), 99_999)).toBe("kristal");
  });

  it("returns hancur for a Failed commitment regardless of the clock", () => {
    expect(classify(stone({state: State.Failed}), START)).toBe("hancur");
    expect(classify(stone({state: State.Failed}), 99_999)).toBe("hancur");
  });

  it("returns utuh at 0% elapsed", () => {
    expect(classify(stone(), START)).toBe("utuh");
  });

  it("returns utuh when now precedes start", () => {
    expect(classify(stone(), START - 500)).toBe("utuh");
  });

  it("returns utuh at 49% elapsed", () => {
    expect(classify(stone(), 1049)).toBe("utuh");
  });

  it("returns lapuk at exactly 50% elapsed", () => {
    expect(classify(stone(), 1050)).toBe("lapuk");
  });

  it("returns lapuk at 79% elapsed", () => {
    expect(classify(stone(), 1079)).toBe("lapuk");
  });

  it("returns retak at exactly 80% elapsed", () => {
    expect(classify(stone(), 1080)).toBe("retak");
  });

  it("returns retak at 99% elapsed", () => {
    expect(classify(stone(), 1099)).toBe("retak");
  });

  // The one case where time and state disagree. Shattering requires a reap transaction, so an
  // Active commitment whose deadline has passed is still only cracked. Returning "hancur" here
  // would tell the user the stone is gone while the chain still says otherwise.
  it("returns retak, not hancur, at exactly the deadline while still Active", () => {
    expect(classify(stone(), DEADLINE)).toBe("retak");
  });

  it("returns retak, not hancur, long past the deadline while still Active", () => {
    expect(classify(stone(), DEADLINE + 86_400)).toBe("retak");
  });

  it("returns retak for a zero-length span", () => {
    expect(classify(stone({deadline: BigInt(START)}), START)).toBe("retak");
  });

  it("returns retak for a negative span (deadline before start)", () => {
    expect(classify(stone({deadline: BigInt(START - 100)}), START)).toBe("retak");
  });

  it("still returns kristal for a Succeeded commitment with a zero span", () => {
    expect(classify(stone({state: State.Succeeded, deadline: BigInt(START)}), START)).toBe("kristal");
  });
});

// --------------------------------------------------------------------- erosion

describe("erosion", () => {
  const span = {start: BigInt(START), deadline: BigInt(DEADLINE)};

  it("returns 0 at start", () => {
    expect(erosion(span, START)).toBe(0);
  });

  it("clamps to 0 before start", () => {
    expect(erosion(span, START - 1_000)).toBe(0);
  });

  it("returns 0.25 a quarter of the way through", () => {
    expect(erosion(span, 1025)).toBeCloseTo(0.25, 10);
  });

  it("returns 0.5 at the midpoint", () => {
    expect(erosion(span, 1050)).toBeCloseTo(0.5, 10);
  });

  it("returns 0.99 just before the deadline", () => {
    expect(erosion(span, 1099)).toBeCloseTo(0.99, 10);
  });

  it("returns 1 at the deadline", () => {
    expect(erosion(span, DEADLINE)).toBe(1);
  });

  it("clamps to 1 past the deadline", () => {
    expect(erosion(span, DEADLINE + 100_000)).toBe(1);
  });

  it("returns 1 for a zero-length span", () => {
    expect(erosion({start: BigInt(START), deadline: BigInt(START)}, START)).toBe(1);
  });

  it("returns 1 for a negative span", () => {
    expect(erosion({start: BigInt(START), deadline: BigInt(START - 50)}, START)).toBe(1);
  });

  it("distinguishes 51% from 79%, which classify collapses into one label", () => {
    const a = erosion(span, 1051);
    const b = erosion(span, 1079);
    expect(a).toBeLessThan(b);
    expect(a).toBeCloseTo(0.51, 10);
    expect(b).toBeCloseTo(0.79, 10);
  });
});

// -------------------------------------------------------------------- timeLeft

describe("timeLeft", () => {
  it("formats 1h 1m 1s as 01:01:01", () => {
    expect(timeLeft(3661n, 0)).toBe("01:01:01");
  });

  it("zero-pads single-digit seconds", () => {
    expect(timeLeft(9n, 0)).toBe("00:00:09");
  });

  it("zero-pads single-digit minutes", () => {
    expect(timeLeft(540n, 0)).toBe("00:09:00");
  });

  it("formats exactly one hour as 01:00:00", () => {
    expect(timeLeft(3600n, 0)).toBe("01:00:00");
  });

  it("formats 59 seconds as 00:00:59", () => {
    expect(timeLeft(59n, 0)).toBe("00:00:59");
  });

  it("formats 23:59:59", () => {
    expect(timeLeft(86_399n, 0)).toBe("23:59:59");
  });

  it("lets the hour field exceed two digits rather than wrapping at a day", () => {
    // 100 hours. A 90-day commitment is the norm here, so hours must not roll over.
    expect(timeLeft(360_000n, 0)).toBe("100:00:00");
  });

  it("subtracts now from the deadline rather than treating the deadline as a duration", () => {
    expect(timeLeft(5000n, 4400)).toBe("00:10:00");
  });

  it("returns 00:00:00 exactly at the deadline", () => {
    expect(timeLeft(1000n, 1000)).toBe("00:00:00");
  });

  it("returns 00:00:00 past the deadline rather than a negative duration", () => {
    expect(timeLeft(1000n, 9999)).toBe("00:00:00");
  });
});

// -------------------------------------------------------------- decodeTokenUri

describe("decodeTokenUri", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';

  it("unwraps both base64 layers and returns svg, name, and description", () => {
    const uri = tokenUri({
      name: "TAMON #7",
      description: "A stone bound to monad/tamon.",
      image: svgDataUri(SVG),
    });

    expect(decodeTokenUri(uri)).toEqual({
      svg: SVG,
      name: "TAMON #7",
      description: "A stone bound to monad/tamon.",
    });
  });

  it("returns raw markup, not a data URI, so it can be injected inline", () => {
    const uri = tokenUri({name: "n", description: "d", image: svgDataUri(SVG)});
    const decoded = decodeTokenUri(uri);
    expect(decoded?.svg.startsWith("<svg")).toBe(true);
    expect(decoded?.svg).not.toContain("base64");
  });

  it("ignores extra metadata fields it does not model", () => {
    const uri = tokenUri({
      name: "n",
      description: "d",
      image: svgDataUri(SVG),
      attributes: [{trait_type: "Classification", value: "UTUH"}],
    });
    expect(decodeTokenUri(uri)?.svg).toBe(SVG);
  });

  it("returns null for malformed base64", () => {
    expect(decodeTokenUri("data:application/json;base64,%%%not base64%%%")).toBeNull();
  });

  it("returns null for valid base64 that is not JSON", () => {
    const uri = "data:application/json;base64," + Buffer.from("this is not json").toString("base64");
    expect(decodeTokenUri(uri)).toBeNull();
  });

  it("returns null when the image field is missing", () => {
    expect(decodeTokenUri(tokenUri({name: "n", description: "d"}))).toBeNull();
  });

  it("returns null when the image field is not a string", () => {
    expect(decodeTokenUri(tokenUri({name: "n", description: "d", image: 42}))).toBeNull();
  });

  it("returns null when the image is not valid base64", () => {
    const uri = tokenUri({name: "n", description: "d", image: "data:image/svg+xml;base64,%%%"});
    expect(decodeTokenUri(uri)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeTokenUri("")).toBeNull();
  });

  it("returns null for a JSON array where an object is expected", () => {
    const uri = "data:application/json;base64," + Buffer.from("[1,2,3]").toString("base64");
    expect(decodeTokenUri(uri)).toBeNull();
  });
});
