import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  Image as ImageIcon,
  PenSquare,
  ShieldCheck,
  Users2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import EmployeeAvatar from "@/components/employee-avatar";
import {
  Chip,
  Panel,
  PrimaryLink,
  QuietLink,
  ROLE_TONE,
  SectionTitle,
} from "@/components/orchestra-ui";
import { localAvatar } from "@/lib/orchestra/avatars";
import { dailyCapUsd } from "@/lib/orchestra/ledger";
import { displayName, EMPLOYEES } from "@/lib/orchestra/registry";
import { PLATFORM_IDS, platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// /company/guide — the manual.
//
// Written to answer the questions someone actually has in front of the screen,
// in the order they hit them: what is this, what do I do first, what does it
// cost me, what happens when it goes wrong. Everything is anchored so the two
// product pages can deep-link into the exact answer (#studio, #cost, #trouble).

function Step({
  n,
  title,
  who,
  children,
  you,
}: {
  n: number;
  title: string;
  who?: string;
  children: ReactNode;
  you?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Rail */}
      <span className="absolute left-[15px] top-9 bottom-0 w-px bg-border/70 last:hidden" />
      <span
        className={cn(
          "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
          you
            ? "bg-brand-500 text-brand-950 shadow-sm"
            : "border border-border bg-card text-muted-foreground",
        )}
      >
        {you ? <Check size={14} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-[15px] font-bold tracking-tight text-foreground">
            {title}
          </p>
          {you ? (
            <Chip tone="accent">your call</Chip>
          ) : who ? (
            <Chip className={ROLE_TONE[who]}>{displayName(who)}</Chip>
          ) : null}
        </div>
        <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border/60 bg-card px-4 py-3">
      <summary className="cursor-pointer list-none text-[13px] font-bold text-foreground marker:hidden">
        <span className="mr-2 text-muted-foreground/50 group-open:hidden">+</span>
        <span className="mr-2 hidden text-muted-foreground/50 group-open:inline">-</span>
        {q}
      </summary>
      <div className="mt-2 pl-5 text-[13px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

export default function GuidePage() {
  const cap = dailyCapUsd();
  const gtm = EMPLOYEES.filter(
    (e) => e.team === "GTM & Socials" && e.status === "active",
  );
  const oversight = EMPLOYEES.filter(
    (e) => (e.team === "Ops & Quality" || e.team === "Executive") && e.status === "active",
  );

  return (
    <div className="mx-auto max-w-3xl stagger-load pb-16">
      <PageHeader
        eyebrow="Guide"
        icon={<BookOpen size={14} />}
        title="How this works"
        description="You run a small company of agents. They research, plan, write and check each other's work. You make three decisions and press the button that puts anything into the world. Nothing here can post, send, or spend past its ceiling on its own."
        actions={
          <>
            <QuietLink href="/company">
              <ArrowLeft size={14} /> Board
            </QuietLink>
            <PrimaryLink href="/company/studio">
              <PenSquare size={15} /> Open the Studio
            </PrimaryLink>
          </>
        }
      />

      {/* ---- The two loops ------------------------------------------------ */}
      <section className="mb-12">
        <SectionTitle
          eyebrow="Start here"
          title="There are two loops, and they do different jobs"
          hint="Most confusion comes from expecting one page to do the other's work."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel>
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-brand-500" />
              <p className="font-display text-base font-bold text-foreground">
                The daily run
              </p>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              One button on the <strong className="text-foreground">Company</strong>{" "}
              board. The team decides for itself what is worth your attention
              today: it researches the job feed and the web, verifies what it
              found, and may propose a post or two and some outreach.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Use it</strong> as a daily
              heartbeat. It takes a few minutes and lands a report.
            </p>
            <QuietLink href="/company" className="mt-3">
              <Bot size={14} /> Go to the board
            </QuietLink>
          </Panel>
          <Panel tone="accent">
            <div className="flex items-center gap-2">
              <PenSquare size={16} className="text-brand-500" />
              <p className="font-display text-base font-bold text-foreground">
                A Studio campaign
              </p>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              You define the job: a goal, a date range, which platforms, how many
              posts, and any topics you already want. The team plans a schedule
              and works it - and stops at three points to ask you.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Use it</strong> when you want a
              week of content, not a suggestion.
            </p>
            <QuietLink href="/company/studio" className="mt-3">
              <PenSquare size={14} /> Go to the Studio
            </QuietLink>
          </Panel>
        </div>
      </section>

      {/* ---- The campaign lifecycle --------------------------------------- */}
      <section id="studio" className="mb-12 scroll-mt-6">
        <SectionTitle
          eyebrow="Content Studio"
          title="A campaign, start to finish"
          hint="Nine steps. Three of them are yours - and the work pauses until you take them, so nothing runs up a bill while you're away."
        />
        <Panel>
          <ol className="flex flex-col">
            <Step n={1} title="You define the campaign">
              Objective, date range, platforms, how many posts, and any topics
              you already have in mind. Your topics are kept in your exact words - they get ranked, never rewritten and never dropped.
            </Step>
            <Step n={2} title="Scouting the week" who="radar">
              Ten to fourteen candidate topics off the web, each with a source
              that was actually opened. Anything with no source is not a
              candidate.
            </Step>
            <Step n={3} title="Ranking and planning" who="compass">
              Merges your ideas with the research, ranks the shortlist, then lays
              out an actual schedule: which topic, on which day, on which
              platform, and whether it wants an image.
            </Step>
            <Step n={4} title="You edit the plan" you>
              Switch slots off, move dates, change the platform, retarget a
              subreddit, toggle images. <strong className="text-foreground">Only
              enabled slots cost money</strong> - this screen is your main cost
              control.
            </Step>
            <Step n={5} title="Deep research and hooks" who="delve">
              One researcher per topic, all at once. Then {displayName("spark")}{" "}
              writes five different opening lines for every slot in a single
              pass. A topic running on three platforms is researched once and
              hooked three times.
            </Step>
            <Step n={6} title="You pick the hooks" you>
              The first line is the only thing most people will ever read, so the
              choice stays with you. &ldquo;Let the writer choose&rdquo; is a
              real option, not a skip.
            </Step>
            <Step n={7} title="Writing, editing, checking" who="quill">
              Each slot is drafted to its own platform&apos;s rules, then{" "}
              {displayName("hone")} tightens every draft,{" "}
              {displayName("easel")} writes an image brief where one is wanted,
              and {displayName("sentinel")} audits the lot against the sources.
            </Step>
            <Step n={8} title="You approve, revise, or skip" you>
              Edit in place and approve, or say what&apos;s wrong and let the
              editor fix exactly that, or skip it with a reason - which becomes
              a lesson the team reads next time.
            </Step>
            <Step n={9} title="Post it, then log what happened">
              Approved posts wait on the calendar with a copy button. After you
              put one live, log its numbers. That log is the only evidence{" "}
              {displayName("pulse")} is allowed to reason from.
            </Step>
          </ol>
        </Panel>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Panel tone="quiet">
            <CalendarDays size={15} className="text-brand-500" />
            <p className="mt-1.5 text-[13px] font-bold text-foreground">Calendar</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Every post across every platform - planned, waiting on you, ready,
              or shipped.
            </p>
          </Panel>
          <Panel tone="quiet">
            <ImageIcon size={15} className="text-brand-500" />
            <p className="mt-1.5 text-[13px] font-bold text-foreground">Images</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              The team writes the brief; you generate the picture and tick
              &ldquo;ready&rdquo;. It never invents data or faces.
            </p>
          </Panel>
          <Panel tone="quiet">
            <ShieldCheck size={15} className="text-brand-500" />
            <p className="mt-1.5 text-[13px] font-bold text-foreground">Memory</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Anything the Studio adds - a lesson, a voice sample - you can also
              remove.
            </p>
          </Panel>
        </div>
      </section>

      {/* ---- Platforms ----------------------------------------------------- */}
      <section className="mb-12">
        <SectionTitle
          eyebrow="Platforms"
          title="Each surface has its own contract"
          hint="The writer, the editor and the auditor all read the same rules, so a Reddit post is never a LinkedIn post with the hashtags removed."
        />
        <Panel flush className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-[13px]">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/30 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Platform</th>
                <th className="px-3 py-2.5">Length</th>
                <th className="px-3 py-2.5">Needs</th>
                <th className="px-4 py-2.5">Hashtags</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORM_IDS.map((p) => {
                const s = platformSpec(p);
                return (
                  <tr key={p} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-foreground">
                      {s.label}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {s.maxChars
                        ? `≤${s.maxChars} characters`
                        : s.wordBand
                          ? `${s.wordBand[0]}-${s.wordBand[1]} words`
                          : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {[s.needsTitle ? "a title" : null, s.channelLabel]
                        .filter(Boolean)
                        .join(" + ") || "just the post"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {s.hashtagMax === 0 ? "never" : `≤${s.hashtagMax}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Reddit is the strictest, because the failure there isn&apos;t a weak
          post - it&apos;s a ban. Marketing cadence, hashtags, engagement bait
          and undisclosed self-promotion are forbidden outright.
        </p>
      </section>

      {/* ---- Who's who ------------------------------------------------------ */}
      <section className="mb-12">
        <SectionTitle
          eyebrow="The team"
          title="Who does what"
          hint="Every one of them works under a written contract with a definition of done, and none of them can mark their own work as verified."
          action={
            <QuietLink href="/company/team">
              <Users2 size={14} /> Team page
            </QuietLink>
          }
        />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[...gtm, ...oversight].map((e) => (
            <Link
              key={e.id}
              href={`/company/team/${e.id}`}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3 transition-colors hover:bg-muted"
            >
              <EmployeeAvatar
                name={e.name}
                avatar={localAvatar(e)}
                avatarFocus={e.avatarFocus}
                avatarZoom={e.avatarZoom}
                className="h-10 w-10"
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-foreground">
                  {e.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {e.title}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Money ---------------------------------------------------------- */}
      <section id="cost" className="mb-12 scroll-mt-6">
        <SectionTitle
          eyebrow="Money"
          icon={<CircleDollarSign size={12} />}
          title="What this costs, and what stops it"
          hint="Every model call is metered before it happens, not billed after."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Panel>
            <p className="font-display text-2xl font-semibold text-foreground">
              ${cap.toFixed(2)}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Standing daily ceiling for the whole company. At the ceiling, work
              stops rather than overspending.
            </p>
          </Panel>
          <Panel>
            <p className="font-display text-2xl font-semibold text-foreground">
              ~$1.15
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              A measured two-post campaign, end to end. Bigger campaigns scale
              far better than linearly.
            </p>
          </Panel>
          <Panel>
            <p className="font-display text-2xl font-semibold text-foreground">
              1 tap
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Raise today&apos;s ceiling from the spend tile on the board. It
              expires by itself overnight.
            </p>
          </Panel>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          The cost dial is the model tier on the{" "}
          <Link
            href="/company/team"
            className="font-semibold text-brand-600 underline-offset-4 hover:underline dark:text-brand-400"
          >
            Team page
          </Link>
          . Quality puts the strongest model where mistakes compound - planning,
          verification, strategy - and a cheaper one everywhere else.
        </p>
      </section>

      {/* ---- Guardrails ----------------------------------------------------- */}
      <section className="mb-12">
        <SectionTitle
          eyebrow="Guardrails"
          icon={<ShieldCheck size={12} />}
          title="What the system will not do, by construction"
          hint="These are enforced in code, not requested in a prompt - so no amount of clever wording gets around them."
        />
        <Panel>
          <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {[
              "Nothing is posted, sent, or published by an agent. Approval produces a copy button - the last step is always your hands.",
              "No agent can mark its own work verified. Only the independent verifier can, and it never grades its own output.",
              "A claim about the outside world without a source it opened this run gets deleted, not softened.",
              "Memory proposals can only add a line. Rewriting or deleting what you wrote is a human action.",
              "A stage that fails says so and stops. Work that quietly went missing is reported above the drafts, never omitted.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" strokeWidth={3} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {/* ---- Troubleshooting ------------------------------------------------ */}
      <section id="trouble" className="scroll-mt-6">
        <SectionTitle
          eyebrow="When something looks wrong"
          icon={<AlertTriangle size={12} />}
          title="The five things people ask"
        />
        <div className="flex flex-col gap-2">
          <Q q="A stage has been spinning for minutes. Is it stuck?">
            Probably not - research and drafting stages make several model calls
            and can take two to four minutes. The panel shows elapsed time and
            what the stage is doing. After twelve minutes with no movement it is
            treated as dead and offers to run again. You can close the tab; the
            work continues on the server.
          </Q>
          <Q q="The verifier says REFUTED but I can still approve. Which is it?">
            Both. In the Studio you are the gate, so the verdict is evidence, not
            a lock. Fabrications and unsourced numbers are a stop - those are
            false statements going out under your name. Engagement bait and
            length are taste; overrule them if you disagree. One caveat: the
            verdict is a snapshot from draft time and does not re-run after a
            revision, so read it against the current text.
          </Q>
          <Q q="Why did I get fewer drafts than slots I planned?">
            A slot whose draft failed is reported in a panel above the drafts,
            with the reason. The rest of the campaign continues rather than dying
            with it. Failed slots also show on the task board with their error.
          </Q>
          <Q q="Everything stopped and mentions a budget.">
            The company hit its daily ceiling. Raise today&apos;s ceiling from
            the spend tile on the board (it expires overnight on its own), or
            wait for the reset. Nothing is lost - the campaign resumes from the
            stage it stopped at.
          </Q>
          <Q q="The posts don't sound like me.">
            That is a memory problem, not a writing problem. On the{" "}
            <Link
              href="/company/team"
              className="font-semibold text-brand-600 underline-offset-4 hover:underline dark:text-brand-400"
            >
              Team page
            </Link>
            , paste three to five posts you actually wrote into voice samples,
            and fill the story bank with real moments. With an empty story bank
            the writers are forbidden from inventing anecdotes, so drafts come
            out observational and flat - which is the correct failure, but not a
            good post.
          </Q>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 border-t border-border/40 pt-8">
        <PrimaryLink href="/company/studio?new=1">
          <PenSquare size={15} /> Start a campaign
        </PrimaryLink>
        <QuietLink href="/company/team">
          <Users2 size={14} /> Set up your voice first
        </QuietLink>
      </div>
    </div>
  );
}
