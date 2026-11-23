#!/usr/bin/env python3
"""Local VPN diagnostics and optional guarded peer recovery; no secret logging or service restarts."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import socket
import re
import subprocess
import time


def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=5).stdout.strip()


def peer_snapshot(interface, address):
    key = peer_key(interface, address)
    def field(name):
        values = dict(line.split(None, 1) for line in command(['wg', 'show', interface, name]).splitlines())
        return values.get(key, '')
    return {'endpoint': field('endpoints'), 'handshake': int(field('latest-handshakes')), 'transfer': field('transfer')}


def peer_key(interface, address):
    allowed = [line.split(None, 1) for line in command(['wg', 'show', interface, 'allowed-ips']).splitlines()]
    peers = [key for key, ips in allowed if address in ips.replace(',', ' ').split()]
    if len(peers) != 1:
        raise RuntimeError('Expected exactly one peer for the 1C address')
    return peers[0]


def save_state(root, current):
    temp = root / 'state.tmp'
    temp.write_text(json.dumps(current), encoding='utf8')
    temp.chmod(0o600)
    os.replace(temp, root / 'state.json')


def restore_pending(interface, root, address='10.0.0.3/32'):
    backup = root / 'peer-recovery.conf'
    if backup.exists():
        text = backup.read_text(encoding='utf8')
        allowed = re.search(r'(?m)^AllowedIPs\s*=\s*(.*)$', text)
        key = re.search(r'(?m)^PublicKey\s*=\s*(\S+)', text)
        if '[Interface]' in text or text.count('[Peer]') != 1 or not key or not allowed or address not in allowed[1].replace(',', ' ').split():
            raise RuntimeError('Refusing an unexpected peer recovery snapshot')
        live = [line.split(None, 1) for line in command(['wg', 'show', interface, 'allowed-ips']).splitlines()]
        target = [peer for peer, ips in live if address in ips.replace(',', ' ').split()]
        if target and target != [key[1]]:
            raise RuntimeError('The 1C peer was replaced by an administrator; refusing old snapshot')
        if key[1] in command(['wg', 'show', interface, 'peers']).splitlines():
            # Killed before removal, or an administrator already restored it.
            backup.unlink()
            return
        # addconf touches only the recorded peer, including its optional PSK.
        command(['wg', 'addconf', interface, str(backup)])
        backup.unlink()


def recover_peer(interface, address, root):
    key = peer_key(interface, address)
    config = command(['wg', 'showconf', interface])
    backup = root / 'peer-recovery.conf'
    if backup.exists():
        raise RuntimeError('An incomplete peer recovery must be restored first')
    sections = re.split(r'(?m)^\[Peer\]\s*$', config)[1:]
    selected = [part for part in sections if re.search(r'(?m)^PublicKey\s*=\s*' + re.escape(key) + r'\s*$', part)]
    if len(selected) != 1:
        raise RuntimeError('Peer snapshot does not match the live target')
    peer_config = '[Peer]\n' + selected[0].strip() + '\n'
    # Keep a protected recovery copy BEFORE removing the one failed peer. If the
    # process is killed, the next run restores it before doing anything else.
    temp = root / 'peer-recovery.tmp'
    with temp.open('w', encoding='utf8') as stream:
        os.chmod(temp, 0o600)
        stream.write(peer_config)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, backup)
    try:
        command(['wg', 'set', interface, 'peer', key, 'remove'])
    finally:
        restore_pending(interface, root, address)


def recovery_due(current, previous, now):
    recent = [at for at in previous.get('recoveries', []) if now - at < 3600]
    return (current['status'] == 'vpn-unresponsive'
            and current.get('consecutiveFailures', 0) >= 2
            and now - previous.get('lastRecovery', 0) >= 600
            and len(recent) < 3)


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
        result = subprocess.run(['tcpdump', '-l', '-nn', '-tt', '-i', 'any', '-c', '24', 'udp port 51820'],
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


def check(root, now, recover=False):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    state_path = root / 'state.json'
    try:
        previous = json.loads(state_path.read_text(encoding='utf8'))
    except (OSError, ValueError):
        previous = {}
    current = {'at': now}
    try:
        if recover:
            restore_pending('wg0', root)
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
    current['consecutiveFailures'] = previous.get('consecutiveFailures', 0) + 1 if current['status'] == 'vpn-unresponsive' else 0
    current['lastRecovery'] = previous.get('lastRecovery', 0)
    current['recoveries'] = [at for at in previous.get('recoveries', []) if now - at < 3600]
    if current['status'] == 'vpn-unresponsive' and (changed or now - current['lastCapture'] >= 600):
        if capture(root, now):
            current['lastCapture'] = now
    if recover and recovery_due(current, previous, now):
        current['lastRecovery'] = now
        current['recoveries'].append(now)
        current['recoveryAttempted'] = True
        save_state(root, current)  # Reserve the cooldown before changing live state.
        try:
            recover_peer('wg0', '10.0.0.3/32', root)
            current['recoveryResult'] = 'peer-session-reset'
        except (OSError, subprocess.SubprocessError, RuntimeError, ValueError) as error:
            current['recoveryResult'] = error.__class__.__name__
        append_event(root, current)
    save_state(root, current)
    print(json.dumps(current))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='/root/ops/wireguard-health')
    parser.add_argument('--recover-peer', action='store_true', help='Reset only a confirmed stale 1C peer, with cooldown/rate limits')
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(args.directory)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (root / 'monitor.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(0)
        check(root, int(time.time()), args.recover_peer)
