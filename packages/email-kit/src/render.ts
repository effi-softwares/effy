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

const compiled = new Map<string, HandlebarsTemplateDelegate>();

function compile(key: string, source: string, escape: boolean): HandlebarsTemplateDelegate {
  let fn = compiled.get(key);
  if (!fn) {
    fn = Handlebars.compile(source, { noEscape: !escape });
    compiled.set(key, fn);
  }
  return fn;
}

export function render<T extends TemplateId>(
  id: T,
  vars: VarsFor<T>,
  audience: Audience,
  identity: MailIdentity,
): RenderedMessage {
  const entry = CATALOG[id] as MessageEntry;
  const profile = profileFor(audience);

  if (!entry.audiences.includes(audience)) {
    throw new Error(`email-kit: '${id}' is not addressed to the '${audience}' audience`);
  }
  const problems = validateVars(id, vars);
  if (problems.length) throw new Error(`email-kit: ${problems.join("; ")}`);

  const artifact = COMPILED_TEMPLATES[id];
  if (!artifact) throw new Error(`email-kit: '${id}' has no compiled artifact - run \`make email-gen\``);

  const context = { ...vars, ...platformVars(profile, identity) };
  return {
    templateId: id,
    subject: entry.subject(vars as never, profile),
    preheader: entry.preheader(vars as never, profile),
    html: compile(`${id}:html`, artifact.html, true)(context),
    text: compile(`${id}:text`, artifact.text, false)(context),
  };
}
