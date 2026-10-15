import { describe, expect, it } from "vitest";
import {
  CHAT_TEMPLATE_OVERHEAD_TOKENS,
  TOKEN_ESTIMATE,
  estimatePromptTokens,
  estimateTokens,
} from "./token-estimate";

// Samples of the kinds measured in the review. They are generated here, not copied from the
// measured samples, so the reference values below are PROXY tokens-per-character ratios taken
// from `bge-m3` (a different tokenizer from the chat model) on similar text. They are not
// Qwen measurements and not exact.
const PROXY_TOKENS_PER_CHAR = {
  english: 0.217,
  german: 0.198,
  denseSkills: 0.485,
  chinese: 0.573,
  symbols: 0.736,
} as const;

const repeatTo = (unit: string, length: number) =>
  unit.repeat(Math.ceil(length / unit.length)).slice(0, length);

function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function samples() {
  const random = lcg(7);
  const skills = [
    "TypeScript",
    "C++",
    "C#",
    "Node.js",
    "k8s",
    "CI/CD",
    ".NET",
    "PostgreSQL",
    "Redis",
    "GraphQL",
    "REST",
    "gRPC",
    "AWS",
    "GCP",
    "Terraform",
    "Docker",
    "Kafka",
    "Spark",
    "TensorFlow",
    "PyTorch",
    "scikit-learn",
    "Next.js",
    "React",
    "Vue",
    "SQL",
    "NoSQL",
    "OAuth2",
    "OpenAPI",
    "Linux",
    "Bash",
  ];
  let dense = "";
  while (dense.length < 20_000) {
    dense += (dense ? ", " : "") + skills[Math.floor(random() * skills.length)];
    if (random() < 0.4) dense += ` ${1 + Math.floor(random() * 12)}+ yrs`;
  }
  const symbolAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789-_/=+#%";
  let symbols = "";
  while (symbols.length < 20_000)
    symbols += symbolAlphabet[Math.floor(random() * symbolAlphabet.length)];
  return {
    english: repeatTo(
      "About the role: you will design, build and operate backend services that power our hiring platform. You will work closely with product managers and designers, review code, mentor colleagues and take part in an on-call rotation. We value clear communication, ownership and curiosity. ",
      20_000,
    ),
    german: repeatTo(
      "Wir suchen eine erfahrene Softwareentwicklerin für unser Team in München. Sie bringen mindestens fünf Jahre Berufserfahrung mit, sprechen fließend Deutsch und Englisch und kennen sich mit Datenbanken und Cloud-Diensten aus. ",
      20_000,
    ),
    denseSkills: dense.slice(0, 20_000),
    chinese: repeatTo(
      "我们正在寻找一位拥有五年以上经验的后端工程师，熟悉分布式系统、数据库和云平台，具备良好的沟通能力与团队合作精神。",
      11_200,
    ),
    symbols,
  };
}

describe("token estimate (approximate; calibrated against a proxy tokenizer)", () => {
  const text = samples();

  it.each(Object.keys(PROXY_TOKENS_PER_CHAR) as (keyof typeof PROXY_TOKENS_PER_CHAR)[])(
    "does not fall below the proxy-measured rate for %s text",
    (kind) => {
      expect(estimateTokens(text[kind])).toBeGreaterThanOrEqual(
        Math.ceil(PROXY_TOKENS_PER_CHAR[kind] * text[kind].length),
      );
    },
  );

  it("is not absurdly high for ordinary prose (so ordinary postings are not refused)", () => {
    for (const kind of ["english", "german"] as const) {
      expect(estimateTokens(text[kind])).toBeLessThanOrEqual(
        Math.ceil(PROXY_TOKENS_PER_CHAR[kind] * text[kind].length * 1.6),
      );
    }
  });

  it("orders content types sensibly: prose < dense skill list < non-Latin per character < symbols", () => {
    const perChar = (kind: keyof typeof text) => estimateTokens(text[kind]) / text[kind].length;
    expect(perChar("english")).toBeLessThan(perChar("denseSkills"));
    expect(perChar("denseSkills")).toBeLessThan(perChar("chinese") + 0.5);
    expect(perChar("chinese")).toBeLessThan(perChar("symbols"));
  });

  it("applies the documented safety factor", () => {
    expect(TOKEN_ESTIMATE.safetyFactor).toBeGreaterThan(1);
    // 1 000 letters: 1 000 x 0.22 x 1.25
    expect(estimateTokens("a".repeat(1000))).toBe(
      Math.ceil(1000 * TOKEN_ESTIMATE.letter * TOKEN_ESTIMATE.safetyFactor),
    );
  });

  it("never treats whitespace as free, and counts control characters as costly", () => {
    expect(estimateTokens(" ".repeat(10_000))).toBeGreaterThan(0);
    expect(estimateTokens("\n".repeat(10_000))).toBeGreaterThan(0);
    expect(estimateTokens("\u0000".repeat(100))).toBeGreaterThan(estimateTokens("a".repeat(100)));
  });

  it("counts emoji and other non-ASCII at least at the non-ASCII rate", () => {
    expect(estimateTokens("😀".repeat(100))).toBeGreaterThanOrEqual(
      Math.ceil(200 * TOKEN_ESTIMATE.nonAscii * TOKEN_ESTIMATE.safetyFactor),
    );
  });

  it("is zero for empty text and grows with length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(2000))).toBeGreaterThan(estimateTokens("a".repeat(1000)));
  });

  it("counts prompt overhead: both messages plus the chat template", () => {
    expect(estimatePromptTokens("sys", "usr")).toBe(
      estimateTokens("sys") + estimateTokens("usr") + CHAT_TEMPLATE_OVERHEAD_TOKENS,
    );
    expect(estimatePromptTokens("", "")).toBe(CHAT_TEMPLATE_OVERHEAD_TOKENS);
  });

  it("is linear and fast on very long input", () => {
    const started = Date.now();
    estimateTokens("x".repeat(5_000_000));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
