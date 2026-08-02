// Meaning tags for screening questions, plus the rule for whether an answer is
// safe to replay at a different company.
//
// Why classes at all: the answer bank keys on normalized question TEXT, so
// "Will you require sponsorship?" and "Do you now or in the future require visa
// sponsorship for employment?" are two different keys and the second one costs
// a model call. Every board words these differently and there are only about a
// dozen questions that actually recur, so a small closed enum captures nearly
// all of the repeat volume.
//
// Why regex and not a model call: these phrasings are stable and the set is
// closed. A deterministic classifier is free, instant, and explainable in the
// review summary ("answered from your saved sponsorship answer"), which a
// similarity score is not. Anything that doesn't match falls through to
// "other" and still works exactly as it does today.

export const ANSWER_CLASSES = [
  "sponsorship",
  "work_authorization",
  "relocation",
  "remote_preference",
  "notice_period",
  "start_date",
  "salary_expectation",
  "years_experience",
  "referral_source",
  "previously_employed",
  "clearance",
  "non_compete",
  "other",
] as const;

export type AnswerClass = (typeof ANSWER_CLASSES)[number];

// Ordered: the first match wins, so narrower patterns come before broader ones.
// Sponsorship must beat work_authorization, because "Are you authorized to work
// … without sponsorship?" mentions both and the sponsorship answer is the one
// that carries the actual information.
const RULES: { cls: AnswerClass; rx: RegExp }[] = [
  { cls: "sponsorship", rx: /sponsor|h-?1b|visa status|immigration status|require.*visa/i },
  {
    cls: "work_authorization",
    rx: /authoriz(?:ed|ation) to work|legally (?:able|authorized|eligible) to work|right to work|work permit|eligible to work/i,
  },
  { cls: "clearance", rx: /security clearance|government clearance|clearance level|polygraph/i },
  { cls: "relocation", rx: /relocat/i },
  {
    cls: "remote_preference",
    rx: /work (?:from|in) (?:the )?office|hybrid|on-?site|commute|remote work preference/i,
  },
  { cls: "notice_period", rx: /notice period|how much notice|weeks.? notice/i },
  {
    cls: "start_date",
    rx: /start date|when (?:can|could|would) you start|available to start|earliest.*start/i,
  },
  {
    cls: "salary_expectation",
    rx: /salary|compensation expectation|expected pay|desired (?:pay|rate|compensation)|hourly rate/i,
  },
  {
    cls: "years_experience",
    rx: /how many years|years of experience|years.{0,20}experience/i,
  },
  {
    cls: "referral_source",
    rx: /how did you (?:hear|find)|where did you (?:hear|find)|referred by|referral source|who referred/i,
  },
  {
    cls: "previously_employed",
    rx: /previously (?:employed|worked)|former employee|ever worked (?:for|at)|worked here before|family member.*employ/i,
  },
  { cls: "non_compete", rx: /non-?compete|restrictive covenant|non-?solicit/i },
];

export function classifyQuestion(label: string): AnswerClass {
  const l = label.trim();
  if (!l) return "other";
  for (const rule of RULES) {
    if (rule.rx.test(l)) return rule.cls;
  }
  return "other";
}

// Answers whose text is about a SPECIFIC employer. Replaying one of these at
// another company is the failure mode this whole module exists to prevent:
// it is not a missed field, it is a confidently wrong one addressed to the
// wrong company, sitting in a submitted application.
const ESSAY_RX =
  /\bwhy\b|interest(?:ed|s)? in|excit(?:ed|es|ing)|draw(?:n|s)? (?:you|to)|passion|tell us|what (?:do you know|appeals)|describe|in your own words|cover letter|motivat/i;

// Classes whose answers are facts about the applicant, not opinions about an
// employer, so they carry across companies unchanged.
const PORTABLE: ReadonlySet<AnswerClass> = new Set<AnswerClass>([
  "sponsorship",
  "work_authorization",
  "relocation",
  "remote_preference",
  "notice_period",
  "start_date",
  "salary_expectation",
  "years_experience",
  "clearance",
  "non_compete",
]);

// Classes that are company-specific BY DEFINITION, even though their answers
// are short and factual-looking. These have to be rejected explicitly: they
// would otherwise sail through the length/essay heuristic below, and "a friend
// who works there" replayed at a company where you know nobody is a false
// statement in a submitted application, not a cosmetic miss.
const NEVER_PORTABLE: ReadonlySet<AnswerClass> = new Set<AnswerClass>([
  "referral_source",
  "previously_employed",
]);

export function isReusableAnswer(label: string, answer: string, cls?: AnswerClass): boolean {
  const c = cls ?? classifyQuestion(label);
  if (NEVER_PORTABLE.has(c)) return false;
  if (PORTABLE.has(c)) return true;
  // Unclassified: allow only short, factual-looking answers, and never
  // anything phrased as an essay prompt.
  if (ESSAY_RX.test(label)) return false;
  if (answer.trim().length > 120) return false;
  return true;
}
