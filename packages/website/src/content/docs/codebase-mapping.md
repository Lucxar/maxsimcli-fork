---
id: codebase-mapping
title: Codebase Mapping
group: Advanced
---

`/maxsim:map-codebase` analyzes an existing codebase using parallel mapper agents. This is useful when onboarding MAXSIM to a project that already has code — the mappers produce structured analysis that subsequent planning agents use as context.

{% codeblock language="bash" %}
/maxsim:map-codebase
{% /codeblock %}

Multiple codebase-mapper agents run in parallel, each covering a different area of the codebase. One covers data models, another covers API routes, another covers frontend components, another covers infrastructure. Their outputs are synthesized into a unified analysis in `.planning/codebase/`.

The codebase analysis is automatically loaded by phase-researcher agents. When planning a phase in an existing codebase, the researcher reads the analysis to understand existing patterns, conventions, and potential integration points — rather than re-discovering them from scratch.
