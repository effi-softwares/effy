/** (id, vars, audience) → { subject, preheader, html, text }. Pure: no AWS, network, filesystem or clock. */

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

/** Compiled lazily at module scope: Cognito abandons a trigger at 5 seconds and a cold start costs ~1s. */
const compiled = new Map<string, HandlebarsTemplateDelegate>();

/**
 * @param escape HTML-escape substituted values: true for the HTML part, false for the text part.
 * Escaping the text part would turn `?token=ABC` into `?token&#x3D;ABC`, a broken link that nothing
 * decodes in text/plain.
 */
function template(key: string, source: string, escape: boolean): HandlebarsTemplateDelegate {
  let fn = compiled.get(key);
  if (!fn) {
    // `strict: false`: a missing optional value renders empty; validateVars already checked required ones.
    fn = Handlebars.compile(source, { noEscape: !escape });
    compiled.set(key, fn);
  }
  return fn;
}

/**
 * Every substituted value in the HTML part is escaped (`{{ }}`, never `{{{ }}}`): Ses's own engine does
 * not escape, and names here are user-influenced. The text part has no markup to escape into.
 */
export function render<T extends TemplateId>(
  id: T,
  vars: VarsFor<T>,
  audience: Audience,
  identity: MailIdentity,
): RenderedMessage {
  // Widened to the declared interface: indexing catalog with a generic id yields a union of entries,
  // and calling a union of functions would demand the intersection of their signatures.
  const entry = CATALOG[id] as MessageEntry;
  const profile = profileFor(audience);

  if (!entry.audiences.includes(audience)) {
    throw new Error(`email-kit: '${id}' is not addressed to the '${audience}' audience`);
  }

  // Runtime validation as well as static typing.
  const problems = validateVars(id, vars);
  if (problems.length) {
    throw new Error(`email-kit: ${problems.join("; ")}`);
  }

  const artifact = COMPILED_TEMPLATES[id];
  if (!artifact) {
    // Reachable only if dist/ is stale. Name the template.
    throw new Error(
      `email-kit: '${id}' is in the catalogue but has no compiled artifact — run \`make email-gen\``,
    );
  }

  // Platform values are merged under the message's own and cannot be overridden by a caller.
  const context = { ...vars, ...platformVars(profile, identity) };

  return {
    templateId: id,
    subject: entry.subject(vars as never, profile),
    preheader: entry.preheader(vars as never, profile),
    html: template(`${id}:html`, artifact.html, true)(context),
    // Not escaped: plain text is not HTML.
    text: template(`${id}:text`, artifact.text, false)(context),
  };
}
