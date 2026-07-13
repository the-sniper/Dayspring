// Role-type taxonomy — single source of truth, shared between the Next app
// (via lib/types re-exports) and Convex functions (convex/tsconfig includes
// ../shared). Covers the breadth of tech roles the product serves, not just
// core software engineering. Keys are stored on jobs/companies — never rename
// or remove one without a data migration; adding new ones is safe.
export const ROLE_TYPES = [
  "FS",
  "FE",
  "BE",
  "FDE",
  "MOBILE",
  "DATA",
  "AIML",
  "INFRA",
  "SEC",
  "QA",
  "EMB",
  "XR",
  "GAME",
  "PM",
  "DESIGN",
] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  FS: "Fullstack",
  FE: "Frontend",
  BE: "Backend",
  FDE: "Forward Deployed",
  MOBILE: "Mobile",
  DATA: "Data",
  AIML: "AI / ML",
  INFRA: "DevOps / Infra",
  SEC: "Cybersecurity",
  QA: "QA / Testing",
  EMB: "Embedded / Hardware",
  XR: "AR / VR",
  GAME: "Game Dev",
  PM: "Product",
  DESIGN: "Design",
};

// First match wins — ordered specific → general. Titles that miss every
// pattern return null and get batched through the cheap Claude classifier
// after a pull (or set manually on the job detail page).
// NB: no bare \bar\b for XR (collides with accounts-receivable titles), and
// MOBILE precedes FE so "React Native" doesn't land on the "react" rule.
const RULES: [RoleType, RegExp][] = [
  [
    "FDE",
    /forward[- ]deployed|solutions? (engineer|architect)|field engineer|customer engineer/i,
  ],
  [
    "SEC",
    /security|infosec|appsec|cyber|penetration test|red team|threat|vulnerabilit|cryptograph/i,
  ],
  [
    "MOBILE",
    /\bios\b|\bandroid\b|mobile (engineer|developer)|react native|flutter/i,
  ],
  ["GAME", /game(play)? (engineer|developer|programmer)|unreal engine/i],
  [
    "XR",
    /augmented reality|virtual reality|mixed reality|\bxr\b|\bvr\b|spatial computing/i,
  ],
  ["EMB", /embedded|firmware|\bfpga\b|\basic\b|silicon|robotics/i],
  ["QA", /\bqa\b|quality (assurance|engineer)|\bsdet\b|test engineer/i],
  [
    "AIML",
    /machine learning|\bml (engineer|scientist|researcher)\b|deep learning|\bllm\b|computer vision|\bnlp\b|\bai (engineer|researcher|scientist)\b|research (engineer|scientist)/i,
  ],
  ["DATA", /data (engineer|scientist|analyst)|analytics|business intelligence/i],
  [
    "INFRA",
    /site reliability|\bsre\b|devops|infrastructure|platform engineer|cloud engineer|kubernetes/i,
  ],
  ["FE", /front[- ]?end|\bui engineer\b|react|design engineer/i],
  ["BE", /back[- ]?end|distributed systems|api engineer/i],
  ["PM", /product manager|product owner|technical program manager/i],
  [
    "DESIGN",
    /product design|ux design|\bux\b|visual designer|interaction designer|brand designer/i,
  ],
  ["FS", /full[- ]?stack|product engineer|generalist/i],
];

export function heuristicRoleType(title: string): RoleType | null {
  for (const [role, re] of RULES) {
    if (re.test(title)) return role;
  }
  return null;
}
