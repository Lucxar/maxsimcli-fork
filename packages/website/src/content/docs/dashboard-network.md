---
id: dashboard-network
title: Network Sharing
group: Dashboard
---

Add `--network` to share the dashboard over your local network or Tailscale VPN. This lets teammates view your project progress from their own machines, or lets you check progress from your phone.

{% codeblock language="bash" %}
npx maxsimcli dashboard --network
{% /codeblock %}

MAXSIM detects your LAN IP and Tailscale IP automatically. It prints both URLs with QR codes in the terminal — scan the QR code from your phone to open the dashboard instantly.

### Firewall automation

Opening a port for LAN access requires a firewall rule on most systems. MAXSIM creates the rule automatically:

{% doctable headers=["Platform", "Method", "Notes"] rows=[["Windows", "netsh advfirewall", "Prompts UAC elevation — accept to allow rule creation"], ["Linux (ufw)", "ufw allow [port]", "Requires sudo — MAXSIM will prompt for password"], ["Linux (iptables)", "iptables -A INPUT", "Fallback if ufw not available"], ["macOS", "No action needed", "macOS allows inbound on LAN by default"]] %}
{% /doctable %}

{% callout type="note" %}
Firewall rules created by MAXSIM are scoped to the dashboard port only. They are not removed when you stop the server — you can remove them manually or leave them in place.
{% /callout %}
