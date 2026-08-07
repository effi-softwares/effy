/**
 * RENDER — (id, vars, audience) → { subject, preheader, html, text }.
 *
 * ⚠ PURE. No AWS, no network, no filesystem, no clock. That is what lets the preview harness, every
 * lint check and every unit test run with zero cloud access (spec FR-040 / SC-013), and it is why
 * `./send` is a separate entrypoint.
 */

import Handlebars from "handlebars";

import { COMPILED_TEMPLATES } from "../dist/templates.generated.js";
import { platformVars, profileFor, type Audience, type MailIdentity } from "./audience.js";
import { CATALOG, validateVars, type MessageEntry, type TemplateId, type VarsFor } from "./catalog.js";

export interface RenderedMessage {
  readonly templateId: TemplateId;
  readonly subject: string;
  readonly preheader: string;
  readonly html: string;
  readonly text: string;
}

/**
 * ⚠ Module scope, not per-invocation. Cognito abandons a trigger at 5 seconds and a cold start
 * already costs ~1s; recompiling a template on every call spends a budget shared with an SES send.
 * Compilation is lazy so a container that only ever sends one message never parses the other six.
 */
const compiled = new Map<string, HandlebarsTemplateDelegate>();

function template(key: string, source: string): HandlebarsTemplateDelegate {
  let fn = compiled.get(key);
  if (!fn) {
    // ⚠ `strict: false` deliberately: a missing OPTIONAL value renders empty rather than throwing.
    // Required values are already guaranteed by validateVars() before we get here, so throwing on a
    // lookup would only convert a caught problem into an uncaught one.
    fn = Handlebars.compile(source, { noEscape: false });
    compiled.set(key, fn);
  }
  return fn;
}

/**
 * ⚠ EVERY SUBSTITUTED VALUE IS ESCAPED. Handlebars' `{{ }}` escapes by default and templates never
 * use `{{{ }}}`. This matters because SES's own template engine does NOT escape — its documentation
 * says so explicitly — and on this platform product names, shop names and customer names are all
 * user-influenced. An unescaped engine is an HTML-injection primitive aimed at customers' inboxes.
 */
export function render<T extends TemplateId>(
  id: T,
  vars: VarsFor<T>,
  audience: Audience,
  identity: MailIdentity,
): RenderedMessage {
  // ⚠ Widened to the declared interface on purpose. Indexing CATALOG with a generic id yields a
  // UNION of the concrete entries, and calling a union of functions demands the INTERSECTION of
  // their signatures — so an entry whose preheader ignores its arguments (`() => "…"`) would make
  // every call site fail to compile. The interface is the contract; the union is an artefact.
  const entry = CATALOG[id] as MessageEntry;
  const profile = profileFor(audience);

  if (!entry.audiences.includes(audience)) {
    throw new Error(`email-kit: '${id}' is not addressed to the '${audience}' audience`);
  }

  // ⚠ Runtime validation as well as static typing — see catalog.validateVars.
  const problems = validateVars(id, vars);
  if (problems.length) {
    throw new Error(`email-kit: ${problems.join("; ")}`);
  }

  const artifact = COMPILED_TEMPLATES[id];
  if (!artifact) {
    // Unreachable through the type system; reachable if dist/ is stale. Name the template.
    throw new Error(
      `email-kit: '${id}' is in the catalogue but has no compiled artifact — run \`make email-gen\``,
    );
  }

  // ⚠ Platform values are merged UNDER the message's own, then the message's cannot be overridden by
  // a caller either: a call site that passed `effySupportEmail` would be silently ignored, which is
  // what stops a send site inventing a third address.
  const context = { ...vars, ...platformVars(profile, identity) };

  return {
    templateId: id,
    subject: entry.subject(vars as never, profile),
    preheader: entry.preheader(vars as never, profile),
    html: template(`${id}:html`, artifact.html)(context),
    text: template(`${id}:text`, artifact.text)(context),
  };
}
