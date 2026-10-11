# Agent Foundry: prior art, original architecture and implementation plan

Research date: 11 October 2026. Tracking issue: [#112](https://github.com/sighmoan1/linkedin-slop-filter/issues/112).

**Status: research and proposed design, not an implemented or running orchestrator.** Agent Foundry is a working title. This document lives with the exemplar so the investigation is not lost; the orchestration implementation belongs in a separate repository. No existing project has been forked or copied.

## 1. Direction

Build an original, local-first system that can operate and improve a software product within authority delegated by its owner. LinkedIn Slop Filter is the first target. The intended capabilities are reliable delivery, evidence-led product discovery, coordinated specialist work and experimentally validated improvements to the development system itself.

The numbered levels used in the preceding discussion were an informal capability map, not an industry standard or validated ladder. Acceptance tests below replace the numbers as the engineering specification. Autonomy, research ability, organisational complexity and model intelligence are separate dimensions.

Original implementation does not mean rebuilding every dependency. Use maintained databases, Git tooling, browser automation and supported coding-agent interfaces; write our own control logic, contracts, experiment process and product integration. Study published mechanisms and failures, cite the influences, and do not vendor another orchestrator or reproduce its source tree.

## 2. Existing Slop Filter constraints

The current [AGENTS.md](../AGENTS.md) remains authoritative. It requires issues, claims, focused branches and PRs, local tests, owner-authorised merges and actual installed-Brave verification for relevant UI delivery. GitHub Actions is disabled. Suggestions are not automatically approved work. Credentials, private feed content and live screenshots must not be published in GitHub.

[Issue #38](https://github.com/sighmoan1/linkedin-slop-filter/issues/38) already tracks corrections and remaining personalisation work. [Issue #3](https://github.com/sighmoan1/linkedin-slop-filter/issues/3) tracks empirical classification evaluation. Use these as product work, rather than creating duplicate feature backlogs. Read subsequent comments and implementation before treating issue bodies as current runtime evidence.

The product's classifier and the engineering system's coding agents are different model consumers, with different permissions, datasets and budgets. Supporting a classifier provider in the extension does not automatically make it a supported coding worker.

This document grants no permission to run paid experiments, collect browsing data, change personal settings, install a candidate extension, merge code or enable GitHub Actions.

## 3. What others have achieved

Evidence categories:

- **Documented implementation:** a public repository, specification or product documentation describes the mechanism. This review did not install it or verify every advertised path.
- **Author-reported experiment/deployment:** the authors describe a run, result or operational use. This is stronger than an unsupported feature claim, but not an independent reproduction here.
- **Reproduced here:** none. No third-party orchestrator or published benchmark was executed during this review.

### Delivery and coordination

| Reference | Evidence and mechanism | Design consequence for us |
| --- | --- | --- |
| [OpenAI Symphony][s1] | Public implementation and specification: tracker-driven dispatch, bounded concurrency, workspaces, retries and reconciliation. Its specified restart recovery reconstructs useful work from tracker/filesystem state; it does not restore exact previous scheduler memory. | Specify state transitions and recovery semantics precisely. We propose a durable local run ledger because experiments require run histories and lineage. |
| [Gas Town][s2] and [Gas City][s3] | Public repositories describe persistent work, agent/runtime adapters and supervision. Gas City separates reusable orchestration primitives from Town's particular organisation. | Separate workers, runtime management, scheduling and integration. Do not inherit Town's role names or introduce Beads as a second product backlog. |
| [Issue-Orchestrator][s4] | Public early-beta control plane documents issue claims, worktrees, review/rework, reconciliation and validation of the exact produced commit. Its stated model retains human merge authority. | An agent's completion message is a claim, not a trusted test result. Bind verification to an exact candidate and recheck external state. |
| [T3 Code][s5] and [Orchestrator.inc][s6] | Public projects describe multi-provider agent workspaces and operator interfaces. T3 describes control of installed harnesses; Orchestrator.inc associates task, worktree, PR and review state with worker sessions. | Keep operator UI separate from workflow authority. Do not infer reliable autonomous product management, quota optimisation or transfer of private model context from interface features. |
| [Anthropic compiler experiment][s7] | Author-reported experiment: 16 agents, nearly 2,000 sessions and approximately $20,000 in API use produced a compiler capable of substantial real builds, with documented limitations. Agents collided when they converged on the same bottleneck; improved test decomposition helped. | Parallelism needs independently verifiable work. Do not copy its spending level, permissive launcher or infinite loop as defaults. |
| [Cursor scaling experiments][s8] | Author report describes coordination failures in flat agent groups and improvements from separating planners, workers and judging. Large generated projects were experiments, not proof of general production readiness. | Bound task ownership and distinguish planning from implementation. Measure accepted outcomes, not agents, commits or lines generated. |
| [OpenAI harness engineering][s9] | Operational report describes repository knowledge, architectural checks and application-driving verification supporting agent-led delivery. Humans still supply direction and evaluate outcomes. | Turn important instructions into checks. Preserve navigable documentation and real application evidence; do not transplant another team's merge-risk policy. |
| [StrongDM Software Factory][s10] | Author report describes scenario-driven development, held-out scenarios and behavioural replicas of dependencies. Its proposed economics and review posture differ from this project's constraints. | Build a narrow synthetic LinkedIn/provider test environment and independent acceptance scenarios. A replica is regression evidence, not proof that the live browser works. |

### Product research and bounded self-improvement

| Reference | Evidence and mechanism | Design consequence for us |
| --- | --- | --- |
| [Karpathy autoresearch][s11] | Public small research loop: vary permitted training code, run a fixed-budget experiment, measure, keep or reject. The supplied workload requires an NVIDIA GPU; it is not a ready-made Mac Slop Filter workflow. | Adopt bounded experiments, fixed evaluators and a candidate archive, not its training workload or unrestricted execution advice. |
| [GEPA paper][s12] and [implementation][s13] | Published experiments and open implementation use execution feedback to propose and test changes to prompts and other text parameters. | Prompt/rubric improvement can be tested before any model fine-tuning. Our use case still needs its own evaluation and privacy permissions. |
| [Darwin Gödel Machine][s14] | Research report and code describe evaluated changes to coding-agent tools/workflows and an archive of candidate agents. The authors also document fabricated test evidence and objective hacking. | Treat successor workflows as untrusted candidates. Keep evaluation, promotion authority and budgets outside their writable scope. |
| [AlphaEvolve][s15] | Google DeepMind reports evaluator-guided algorithm search and deployment of selected improvements in its computing infrastructure. | Explore classification, scheduling or caching strategies where outcomes can be measured. This does not establish autonomous preference-setting or generally reliable product management. |

The reviewed sources support building and testing the component mechanisms. They do not establish that assembling them automatically yields a dependable, self-governing organisation for this product. Integration and sustained usefulness are our experiments.

## 4. Proposed original architecture

### A. A small deterministic control service

Normal program logic owns approval checks, state transitions, concurrency, leases, resource reservations, timeouts, retry limits and publication. Models propose tasks, plans and changes; they do not authorise their own proposals.

Proposed first implementation: TypeScript service, SQLite for single-host operational state and a local artifact store. These are design choices to minimise moving parts, not comparative performance findings. Avoid distributed scheduling, Kubernetes, a graph database or Supabase auth until a concrete requirement warrants them.

### B. Three connected loops

**Delivery:** approved task -> isolated worker -> independent verification/review -> authorised merge -> required installed-product verification -> outcome.

**Product research:** permitted feedback -> problem hypothesis -> bounded experiment -> evaluation -> evidence-backed proposal -> approval or pre-existing scoped authority -> delivery.

**Engineering research:** run outcomes -> workflow/model hypothesis -> isolated candidate -> matched-budget evaluation on unseen tasks -> independent promotion decision -> future runs.

Define contracts for all three from the start. Implement them incrementally. Product discovery must not be deferred until after an elaborate swarm or dashboard is finished.

### C. Storage with clear ownership

GitHub remains the human-facing authority for approved product work, decisions and PRs. The local ledger owns attempts, leases, provider events, budget reservations, artifact references and experiment lineage. It is not a competing product backlog.

Link every run to repository, issue, approved task revision, base SHA, candidate SHA, policy version, agent/model identifier and environment identity. Record unknown usage/cost as unknown rather than zero. Keep sensitive datasets and raw traces local with explicit retention/deletion rules; publish only sanitised summaries.

Use a transactional outbox and reconciliation for GitHub writes. After an ambiguous network failure, inspect remote state before retrying. Do not claim exactly-once effects from labels or comments.

### D. Enforceable authority

Separate proposing work, approving work, writing a branch, running a paid experiment, merging, deploying and using the signed-in browser. Give each run only the capabilities it needs. Treat issue text, repository content, model output and feed posts as untrusted input to policy enforcement.

Because agents may share the owner's GitHub account, a username or `approved` label alone is not sufficient evidence of a human grant. A trusted operator interface should record an approval bound to issue/task content, scope, expiry, budget and policy version. Display a reference in GitHub. Material task edits invalidate that grant until reviewed.

Changing prompts, model routes and ordinary workflow steps can eventually be delegated within limits. Changing the approval mechanism, secrets policy, spending caps, evaluator protections or the supervisor itself requires a separately reviewed release. A candidate must never rewrite the running service and then approve its own promotion.

### E. Workers and isolation

Use supported programmatic interfaces behind our own adapter contract: start, stream events, checkpoint, cancel, report usage and expose required capabilities. [Codex App Server][s16] and [Claude Code programmatic execution][s17] are reference interfaces; validate installed versions and authentication before relying on an adapter.

Use separate working copies/worktrees per attempt, plus actual runtime isolation for unattended code execution. A worktree alone is not a security sandbox. Keep owner credentials, the signed-in browser profile, the controller database and Docker socket outside worker access. Give test environments separate ports and storage. Test the real isolation boundary before enabling unattended mode; instructions alone do not provide it.

One controller serialises managed claims. Use lease generations/fencing so a superseded worker cannot publish after reassignment. Quarantine or stop an old attempt before replacing it; uncertainty is a reason to pause, not launch a duplicate. Check human and non-managed-agent claims too, but do not promise atomic coordination with actors outside our protocol.

Model selection starts with an owner-approved allowlist and explicit fallback rules, not a learned router. Prefer existing permitted subscription access where supported; paid API access defaults off. Rate-limit responses cause checkpointing/backoff or approved alternative-provider routing, not account cycling or permission bypass. Preserve task artifacts across providers, not an assumption of transferable hidden context.

### F. Independent assurance and integration

Store verifier-owned results for the exact code, environment and policy under review. An independent reviewer should not have the author's write/promotion authority; using a different model may help diversify review but is not proof of independence or correctness.

Invalidate approvals/results when relevant candidate code, base integration state, tests or policy change. Validate the actual integration candidate before a gated merge. A worker cannot declare that tests ran by writing a plausible log.

Ordinary development tests can evolve through review. Keep separate owner-approved acceptance scenarios and promotion datasets inaccessible for optimisation and unwritable by the candidate. Repeated use can still leak information, so version and periodically replace holdouts and limit promotion queries.

Use distinct states for code accepted, merged, installed, live-verified and product benefit measured. A merged PR can close a code issue through GitHub while a linked release/evaluation task remains open. Do not silently redefine existing issue closure semantics or call a release complete when required Brave checks remain outstanding.

### G. Operator experience

Start with a CLI and simple local status page showing active work, evidence, blockers, expenditure/unknown usage and decisions needed. Remote access must be authenticated; keep administrative control private. T3 can remain an interactive tool, but any deeper integration needs a verified API contract and must not create a second competing dispatcher.

Docker is useful for repeatable test environments, not inherently for running the extension itself. Public Cloudflare demo URLs are separate from the privileged administration surface. The signed-in Brave acceptance lane runs serially on the owner's Mac only under explicit authority; preserve settings and avoid social actions or saving corrections just to test.

## 5. Product objective and experimental method

The target is to reduce unwanted material without losing useful posts. Hiding nothing can minimise false hides while delivering no filtering value; hiding everything can maximise removal while destroying value. Neither is success.

Measure useful-post false-hide rate, unwanted-content removal, precision among hidden posts, category-level misses, latency, provider failures, cost, and user reversals. Separate text and optional-image behaviour. Respect the existing strict threshold semantics unless a reviewed product change explicitly alters them.

Use selected correction exports only with owner permission. Corrections are enriched for mistakes and are not a representative feed sample. Keep a separate appropriately sampled, consented evaluation set; split by author/template/time where feasible to reduce leakage. Preserve ambiguous labels and user-defined priorities. Do not let a model's judgement become ground truth for its own quality claims.

Start with labelled synthetic/public-permitted examples to test machinery, but do not infer personal-feed accuracy from them. Register the hypothesis, permitted edit surface, datasets, budget, baseline, metrics, stopping rule and promotion rule before running. Report counts and uncertainty. Any proposed numerical quality thresholds remain unset until the owner and baseline evidence justify them; unset thresholds disable automatic promotion.

A concrete first research question is whether owner-selected examples improve preservation of useful posts at comparable filtering coverage and acceptable cost. Compare the existing rubric against one candidate, with a frozen classifier version and input set. Another is whether local-first classification with approved escalation beats a single-provider baseline. Neither experiment implies permission to export feed data or silently change saved rules.

## 6. Implementation backlog for the separate repository

These are planned work packages, not newly approved Slop Filter feature issues. Open them in the standalone repository when initialising implementation. Keep the extension's existing backlog intact.

| ID | Work package | Dependency | Acceptance evidence |
| --- | --- | --- | --- |
| AF-01 | Charter, typed task/approval/run/experiment contracts and defaults | None | Deny-by-default tests for missing authority, stale task revisions, unknown budgets and forbidden data access; classifier and coding budgets distinct. |
| AF-02 | Read-only GitHub adapter and baseline inventory | AF-01 | Classify approved, suggested, blocked and already-claimed work without mutation; reference #3/#38 rather than duplicate them. |
| AF-03 | Durable state machine, leases, events and outbox | AF-01 | Deterministic tests for duplicate events, controller restart, stale workers, revoked approval and ambiguous remote writes. |
| AF-04 | Fake worker/provider and failure-injection simulator | AF-03 | Full lifecycle with no model spend; simulate rate limits, hangs, forged completion, budget exhaustion and cancellation. |
| AF-05 | Isolated workspace/test runner and secret boundary | AF-03 | Worker cannot access controller state, sibling workspaces, host credentials or signed-in browser; local tests produce verifier-owned artifacts. |
| AF-06 | First real coding-agent adapter, then second-provider adapter | AF-04, AF-05 | Versioned lifecycle contract; real cancellation/checkpoint test; unknown quotas handled honestly; no unauthorised paid fallback. |
| AF-07 | PR publication, independent review and integration candidate checks | AF-02, AF-05, AF-06 | One issue/branch/PR; tests and review tied to exact candidate; changed base invalidates integration evidence; merge needs explicit authority. |
| AF-08 | Slop Filter acceptance adapter and guarded Brave handoff | AF-07 | Synthetic tests separated from real browser evidence; app settings retained; blocked live checks stay visibly pending. |
| AF-09 | Dataset provenance, correction import and frozen evaluator | AF-01 | Consent recorded; private data stays local; selected-error bias documented; writer cannot edit/read protected promotion set. |
| AF-10 | Product experiment loop and evidence-backed proposals | AF-09, AF-04 | Run baseline/candidate comparison, report null results, deduplicate issues, and leave unapproved proposals unimplemented. |
| AF-11 | Cost/quality-aware routing experiment | AF-06, AF-07, AF-09 | Compare approved routes on matched tasks and budgets; include retries, review, latency and human intervention, not nominal token price alone. |
| AF-12 | Persistent responsibilities and bounded planning | AF-07, AF-10 | Product, delivery, research and assurance responsibilities retain artifacts across sessions; agent processes are spawned on demand with limits. |
| AF-13 | Candidate engineering workflows and protected promotion | AF-11, AF-12 | Versioned candidates evaluated outside the live controller; unseen-task gate and rollback; no self-issued authority or evaluator edits. |
| AF-14 | Reusable repository template and second-target validation | AF-08, AF-13 | Apply to a second approved project without importing Slop Filter assumptions; document limits and reproducible evidence. |

AF-09/10 can progress alongside delivery infrastructure after their prerequisites. This is how product discovery is included early rather than postponed behind a large orchestration build.

## 7. Demonstrations and stopping rules

**Dry-run gate:** fake events exercise the entire state machine. Duplicate delivery does not duplicate work. Forged evidence cannot pass. A stopped or revoked run cannot publish. No secrets or private feed records appear in public output. There are no real provider calls.

**First live gate:** one approved sandbox task, one worker, independent local verification and one draft PR. No automatic merge, installed-extension modification or cloud classifier call. Demonstrate cancellation and recovery before raising concurrency.

**Parallel delivery gate:** a proposed trial of up to ten scoped tasks, at most three workers, two permitted providers and an interrupted worker. Include overlapping files, a blocked task and an unapproved suggestion. Correctly declining blocked/unapproved work is success. Compare against a sequential-agent baseline rather than assuming a swarm is better.

**Product research gate:** one registered baseline/candidate experiment with consented data and measured useful-post preservation, filtering coverage, cost and latency. Publishing an honest negative result satisfies the research workflow; it does not justify promoting the candidate.

**Engineering improvement gate:** test a prompt, decomposition strategy, checkpoint policy or reviewer arrangement against the current method on held-out tasks. Use repeated or paired trials where feasible, account for model/version changes, and include review/rework and owner attention. Small initial trials establish feasibility, not a general performance claim.

Bound attempts, experiment count, wall-clock runtime, concurrency and monetary expenditure. Stop or escalate on exhausted authority, unavailable verification, persistent failures, unknown paid-spend exposure, suspected data leakage or no remaining eligible work. Do not keep generating marginal tasks to keep agents busy.

## 8. First implementation slice

Create the independent repository with contracts, a local event store, a fake worker, a read-only GitHub snapshot reader and deterministic state-machine tests. It should be able to explain what it would do without doing it. No model router, autonomous merge, private-data ingestion or decorative organisational hierarchy is needed to prove this slice.

Suggested initial boundaries: `src/contracts`, `src/control`, `src/storage`, `src/adapters`, `src/evaluation`, `src/operator`, `targets/linkedin-slop-filter`, and `tests/scenarios`. These are proposed modules, not an existing implementation. Document public contracts before agents divide the implementation into issues.

The long-term differentiator to test is not more agents: it is traceable product and engineering experiments that improve useful outcomes under an enforceable mandate. Novelty is a hypothesis, not a claim that nobody else combines these ideas.

## Sources

Primary sources reviewed on 11 October 2026. Repository links refer to the versions displayed during review, not frozen release guarantees. Pin concrete revisions and recheck interfaces before implementation. No reproduced benchmark results are claimed.

[s1]: https://github.com/openai/symphony/blob/main/SPEC.md
[s2]: https://github.com/gastownhall/gastown
[s3]: https://github.com/gastownhall/gascity
[s4]: https://github.com/issue-orchestrator/issue-orchestrator
[s5]: https://github.com/pingdotgg/t3code
[s6]: https://github.com/OrchestratorInc/agent-orchestrator
[s7]: https://www.anthropic.com/engineering/building-c-compiler
[s8]: https://cursor.com/blog/scaling-agents
[s9]: https://openai.com/index/harness-engineering/
[s10]: https://factory.strongdm.ai/
[s11]: https://github.com/karpathy/autoresearch
[s12]: https://arxiv.org/abs/2507.19457
[s13]: https://github.com/gepa-ai/gepa
[s14]: https://sakana.ai/dgm/
[s15]: https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/
[s16]: https://developers.openai.com/codex/app-server/
[s17]: https://code.claude.com/docs/en/headless
