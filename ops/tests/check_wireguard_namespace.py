#!/usr/bin/env python3
"""Optional real-kernel check in two disposable namespaces, never the production wg0."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile

def run(args, data=None, timeout=10):
    return subprocess.run(args, input=data, text=True, capture_output=True, check=True, timeout=timeout).stdout.strip()


if __name__ == '__main__':
    suffix = str(os.getpid())
    names = ['kwg-a-' + suffix, 'kwg-b-' + suffix]
    links = ['kwga' + suffix, 'kwgb' + suffix]
    created = []
    interface = 'wgtest'
    try:
        for name in names:
            run(['ip', 'netns', 'add', name]); created.append(name)
        run(['ip', 'link', 'add', links[0], 'type', 'veth', 'peer', 'name', links[1]])
        for index, name in enumerate(names):
            run(['ip', 'link', 'set', links[index], 'netns', name])
            prefix = ['ip', 'netns', 'exec', name]
            run(prefix + ['ip', 'link', 'set', 'lo', 'up'])
            run(prefix + ['ip', 'addr', 'add', '192.0.2.%d/30' % (index + 1), 'dev', links[index]])
            run(prefix + ['ip', 'link', 'set', links[index], 'up'])
            run(prefix + ['ip', 'link', 'add', interface, 'type', 'wireguard'])
            run(prefix + ['ip', 'addr', 'add', '10.200.0.%d/30' % (index + 1), 'dev', interface])
        private = [run(['wg', 'genkey']) for _ in range(3)]
        public = [run(['wg', 'pubkey'], data=key + '\n') for key in private]
        for index, name in enumerate(names):
            other = 1 - index
            prefix = ['ip', 'netns', 'exec', name]
            run(prefix + ['wg', 'set', interface, 'private-key', '/dev/stdin', 'listen-port', str(51820),
                          'peer', public[other], 'allowed-ips', '10.200.0.%d/32' % (other + 1),
                          'endpoint', '192.0.2.%d:%d' % (other + 1, 51820)], data=private[index] + '\n')
            run(prefix + ['ip', 'link', 'set', interface, 'up'])
        # An unrelated peer must survive recovery unchanged.
        prefix = ['ip', 'netns', 'exec', names[0]]
        run(prefix + ['wg', 'set', interface, 'peer', public[2], 'allowed-ips', '10.200.0.3/32'])
        run(prefix + ['ping', '-n', '-c', '1', '-W', '3', '10.200.0.2'])
        with tempfile.TemporaryDirectory(prefix='kosmetichka-wg-check-') as directory:
            module = Path(__file__).parents[1] / 'wireguard-health.py'
            code = ('import importlib.util; from pathlib import Path; '
                    'spec=importlib.util.spec_from_file_location("health",%r); '
                    'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m); '
                    'm.recover_peer("wgtest","10.200.0.2/32",Path(%r)); '
                    'import threading,time; '
                    't=threading.Thread(target=lambda:(time.sleep(0.5),__import__("subprocess").run(["ping","-n","-c","3","-i","0.2","-W","1","10.200.0.2"],capture_output=True,timeout=6))); '
                    't.start();m.capture(Path(%r),int(time.time()));t.join(); '
                    'assert "UDP" in next(Path(%r).glob("udp-*.log")).read_text()' % (str(module), directory, directory, directory))
            run(prefix + ['python3', '-c', code], timeout=25)
            assert not (Path(directory) / 'peer-recovery.conf').exists()
        run(prefix + ['ping', '-n', '-c', '1', '-W', '3', '10.200.0.2'])
        peers = run(prefix + ['wg', 'show', interface, 'peers']).splitlines()
        assert set(peers) == {public[1], public[2]}
        current_public = run(prefix + ['wg', 'show', interface, 'public-key'])
        assert current_public == public[0]
        print('PASS: real UDP summaries survive capture timeout; traffic, unrelated peer and interface identity preserved')
    finally:
        for name in reversed(created):
            subprocess.run(['ip', 'netns', 'delete', name], capture_output=True, timeout=10)
        # Only our temporary veth names, if setup stopped before moving both ends.
        for link in links:
            subprocess.run(['ip', 'link', 'delete', link], capture_output=True, timeout=5)
