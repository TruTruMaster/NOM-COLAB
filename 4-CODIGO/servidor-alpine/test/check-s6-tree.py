#!/usr/bin/env python3
"""Offline checks of rootfs/etc/s6-rc/source, mirroring what s6-rc-compile rejects.

Run before committing (s6-rc-compile itself runs at install time on Alpine):
    python3 test/check-s6-tree.py [source dir]

Checks: valid type per service, run/up files present and executable where
needed, every dependency/bundle member exists, producer-for/consumer-for are
symmetric, one pipeline-name at the end of each pipeline, no dependency cycles,
and every script referenced by an oneshot exists and is executable.
"""
import os
import stat
import sys

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "rootfs", "etc", "s6-rc", "source")
rootfs = os.path.join(here, "..", "rootfs")
errors = []


def err(msg):
    errors.append(msg)


def read(path):
    with open(path) as f:
        return f.read()


def names(svc, sub):
    d = os.path.join(src, svc, sub)
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


def is_exec(path):
    return os.path.isfile(path) and os.stat(path).st_mode & stat.S_IXUSR


services = {}
for name in sorted(os.listdir(src)):
    t = os.path.join(src, name, "type")
    if not os.path.isfile(t):
        err(f"{name}: no type file")
        continue
    services[name] = read(t).strip()

# configure.sh writes "default" at install time; emulate the fullest variant
if "default" not in services:
    services["default"] = "bundle"
    default_contents = ["base", "wifi", "web", "nomcolab-app"]
else:
    default_contents = names("default", "contents.d")

deps, producer, consumers = {}, {}, {}
for name, typ in services.items():
    d = os.path.join(src, name)
    if typ not in ("oneshot", "longrun", "bundle"):
        err(f"{name}: bad type {typ!r}")
    if typ == "bundle":
        contents = default_contents if name == "default" else names(name, "contents.d")
        if not contents:
            err(f"{name}: empty bundle")
        for c in contents:
            if c not in services:
                err(f"{name}: bundle member {c} does not exist")
        deps[name] = contents
        continue
    deps[name] = names(name, "dependencies.d")
    for dep in deps[name]:
        if dep not in services:
            err(f"{name}: dependency {dep} does not exist")
    if typ == "oneshot":
        if not os.path.isfile(os.path.join(d, "up")):
            err(f"{name}: oneshot without up")
        else:
            cmd = read(os.path.join(d, "up")).split()
            script = os.path.join(rootfs, cmd[0].lstrip("/"))
            if cmd[0].startswith("/etc/") and not is_exec(script):
                err(f"{name}: up runs {cmd[0]}, missing or not executable in rootfs")
    if typ == "longrun":
        if not is_exec(os.path.join(d, "run")):
            err(f"{name}: run missing or not executable")
        elif not read(os.path.join(d, "run")).startswith("#!"):
            err(f"{name}: run has no #! line")
        nf = os.path.join(d, "notification-fd")
        if os.path.isfile(nf) and not read(nf).strip().isdigit():
            err(f"{name}: notification-fd is not a number")
        pf = os.path.join(d, "producer-for")
        if os.path.isfile(pf):
            producer[name] = read(pf).strip()
        cf = os.path.join(d, "consumer-for")
        if os.path.isfile(cf):
            consumers[name] = read(cf).split()

for p, c in producer.items():
    if services.get(c) != "longrun":
        err(f"{p}: producer-for {c}, which is not a longrun")
    elif p not in consumers.get(c, []):
        err(f"{p}: producer-for {c}, but {c}/consumer-for does not list it")
for c, ps in consumers.items():
    for p in ps:
        if producer.get(p) != c:
            err(f"{c}: consumer-for {p}, but {p}/producer-for is not {c}")
    if c not in producer and not os.path.isfile(os.path.join(src, c, "pipeline-name")):
        err(f"{c}: last consumer of a pipeline without pipeline-name")

# A producer implicitly depends on its consumer
graph = {n: list(d) + ([producer[n]] if n in producer else []) for n, d in deps.items()}
state = {}


def visit(n, path):
    if state.get(n) == 1:
        err("dependency cycle: " + " -> ".join(path + [n]))
        return
    if state.get(n) == 2:
        return
    state[n] = 1
    for m in graph.get(n, []):
        if m in services:
            visit(m, path + [n])
    state[n] = 2


for n in services:
    visit(n, [])

# Everything the scripts directory holds must be executable
scripts = os.path.join(rootfs, "etc", "s6-rc", "scripts")
for s in sorted(os.listdir(scripts)):
    if not is_exec(os.path.join(scripts, s)):
        err(f"scripts/{s} is not executable")

kinds = {k: sum(1 for t in services.values() if t == k) for k in ("oneshot", "longrun", "bundle")}
if errors:
    print("\n".join("FAIL " + e for e in errors))
    sys.exit(1)
print(f"s6-rc source OK: {kinds['oneshot']} oneshots, {kinds['longrun']} longruns, {kinds['bundle']} bundles")
