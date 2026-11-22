#!/usr/bin/env python3
"""Local-only WireGuard/1C diagnostics. No keys, credentials, notifications or restarts."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import time


def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=5).stdout.strip()


def peer_snapshot(interface, address):
    allowed = [line.split(None, 1) for line in command(['wg', 'show', interface, 'allowed-ips']).splitlines()]
    peers = [key for key, ips in allowed if address in ips.replace(',', ' ').split()]
    if len(peers) != 1:
        raise RuntimeError('Expected exactly one peer for the 1C address')
    key = peers[0]
    def field(name):
        values = dict(line.split(None, 1) for line in command(['wg', 'show', interface, name]).splitlines())
        return values.get(key, '')
    return {'endpoint': field('endpoints'), 'handshake': int(field('latest-handshakes')), 'transfer': field('transfer')}


def classify(handshake, reachable, now):
    if reachable:
        return 'healthy'
    if handshake > now + 60:
        return 'clock-skew'
    if handshake and now - handshake <= 240:
        return 'onec-unreachable-vpn-recent'
    return 'vpn-unresponsive'


def append_event(root, value):
    path = root / 'health.jsonl'
    if path.exists() and path.stat().st_size >= 1048576:
        for i in range(2, 0, -1):
            old = root / ('health.jsonl' if i == 1 else 'health.jsonl.1')
            if old.exists():
                old.replace(root / ('health.jsonl.%d' % i))
    with path.open('a', encoding='utf8') as stream:
        stream.write(json.dumps(value, ensure_ascii=False) + '\n')
    path.chmod(0o600)


def capture(root, now):
    # Packet summaries only; no decrypted traffic, payload, private keys or config dumps.
    try:
        result = subprocess.run(['tcpdump', '-nn', '-tt', '-i', 'any', '-c', '24', 'udp port 51820'],
                                capture_output=True, text=True, timeout=12)
        text = result.stdout
    except subprocess.TimeoutExpired as error:
        text = error.stdout or b''
        if isinstance(text, bytes):
            text = text.decode('utf8', errors='replace')
    except (FileNotFoundError, PermissionError):
        return False
    path = root / ('udp-%d.log' % now)
    path.write_text('\n'.join(text.splitlines()[:24]) + '\n', encoding='utf8')
    path.chmod(0o600)
    for old in sorted(root.glob('udp-*.log'), reverse=True)[4:]:
        old.unlink()
    return True


def check(root, now):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    state_path = root / 'state.json'
    try:
        previous = json.loads(state_path.read_text(encoding='utf8'))
    except (OSError, ValueError):
        previous = {}
    current = {'at': now}
    try:
        current.update(peer_snapshot('wg0', '10.0.0.3/32'))
        try:
            with socket.create_connection(('10.0.0.3', 80), timeout=3):
                current['tcpReachable'] = True
        except OSError as error:
            current['tcpReachable'] = False
            current['tcpError'] = error.__class__.__name__
        current['status'] = classify(current['handshake'], current['tcpReachable'], now)
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError) as error:
        current['status'] = 'local-monitor-error'
        current['errorType'] = error.__class__.__name__
    changed = any(current.get(key) != previous.get(key) for key in ('status', 'endpoint'))
    if changed or current['status'] != 'healthy' or now - previous.get('lastEvent', 0) >= 600:
        append_event(root, current)
        current['lastEvent'] = now
    else:
        current['lastEvent'] = previous.get('lastEvent', now)
    current['lastCapture'] = previous.get('lastCapture', 0)
    if current['status'] == 'vpn-unresponsive' and (changed or now - current['lastCapture'] >= 600):
        if capture(root, now):
            current['lastCapture'] = now
    temp = root / 'state.tmp'
    temp.write_text(json.dumps(current), encoding='utf8')
    temp.chmod(0o600)
    os.replace(temp, state_path)
    print(json.dumps(current))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='/root/ops/wireguard-health')
    args = parser.parse_args()
    os.umask(0o077)
    check(Path(args.directory), int(time.time()))
