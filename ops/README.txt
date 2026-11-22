1C VPN operations (22 November 2026)

VPS wg0: 10.0.0.1 -> Windows 1C peer 10.0.0.3/32. PersistentKeepalive=25 was enabled on the VPS without restarting the interface. Protected backup: /root/ops/wg-backups/.

The owner prefers recovery without installing software on Windows. The Windows ZIP is optional and its installation has NOT been confirmed.

Server-only option:
- /root/ops/wireguard-health.py
- /etc/systemd/system/kosmetichka-wireguard-health.service and .timer (source files in this directory).
- root-only state, bounded logs and UDP summaries: /root/ops/wireguard-health/.
- --recover-peer is explicit: two consecutive failures with a handshake older than four minutes, cooldown 10 minutes, maximum three attempts/hour.
- Only the one failed peer is removed/re-added; the interface, host services, 1C process and other peers remain running. A protected peer-only snapshot is restored after interruptions. The interface private key is never persisted in that snapshot.
- A recent handshake with an unreachable TCP service is logged without resetting the peer.

This cannot restart a hung Windows tunnel service, power on the Windows machine, repair an internet outage or resolve duplicated VPN identities. If the fault recurs, inspect root-only health.jsonl/udp-*.log and the Windows WireGuard journal. Do not claim that the underlying cause or duplicate configurations have been ruled out.

Checks: python3 -m unittest discover -s ops/tests -p 'test_*.py' -v
Optional real-kernel check (root with iproute2/WireGuard): python3 ops/tests/check_wireguard_namespace.py
The integration check uses disposable namespaces and never touches production wg0.
