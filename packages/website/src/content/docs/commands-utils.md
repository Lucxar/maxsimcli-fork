---
id: commands-utils
title: Utility Commands
group: Commands Reference
---

{% doctable headers=["Command", "Description", "Flags"] rows=[["/maxsim:health", "Diagnose .planning/ for missing files, bad frontmatter, orphaned phases", "--repair"], ["/maxsim:update", "Update MAXSIM to the latest version", "—"], ["/maxsim:settings", "Configure model profile and toggle workflow agents interactively", "—"], ["/maxsim:set-profile", "Switch model profile: quality, balanced, budget, tokenburner", "—"], ["/maxsim:reapply-patches", "Re-run install patches if templates were updated", "—"]] %}
{% /doctable %}

{% codeblock language="bash" %}
# Diagnose and auto-repair the .planning/ directory
/maxsim:health --repair

# Switch to the quality profile for a complex phase
/maxsim:set-profile quality

# Update MAXSIM to latest
/maxsim:update
{% /codeblock %}

{% callout type="tip" %}
Run /maxsim:health before starting execution on a new machine or after a team merge. It catches frontmatter corruption, missing phase files, and broken @-references that would otherwise cause cryptic errors during planning or execution.
{% /callout %}
