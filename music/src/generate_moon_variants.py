#!/usr/bin/env python3
"""Generate 4 elongated/ambient variants of original 'Chase the Moon' BGM."""
import math
import struct
import wave
from pathlib import Path

SR = 22050
OUT = Path(__file__).parent / "assets"
OUT.mkdir(exist_ok=True)

NAMES = {
    "C": 16.35, "C#": 17.32, "D": 18.35, "D#": 19.45,
    "E": 20.60, "F": 21.83, "F#": 23.12, "G": 24.50,
    "G#": 25.96, "A": 27.50, "A#": 29.14, "B": 30.87,
}

def f(note: str) -> float:
    if len(note) >= 3 and note[1] == "#":
        return NAMES[note[:2]] * (2 ** int(note[2:]))
    return NAMES[note[0]] * (2 ** int(note[1:]))


def square(t, hz, duty=0.5):
    p = 1.0 / hz
    return 1.0 if (t % p) / p < duty else -1.0

def pulse(t, hz, duty=0.25):
    p = 1.0 / hz
    return 1.0 if (t % p) / p < duty else -1.0

def triangle(t, hz):
    p = 1.0 / hz
    ph = (t % p) / p
    if ph < 0.25: return ph * 4
    if ph < 0.75: return 2 - ph * 4
    return ph * 4 - 4

def sine(t, hz):
    return math.sin(2 * math.pi * hz * t)

_noise = 1
def noise():
    global _noise
    _noise = (_noise * 1103515245 + 12345) & 0x7FFFFFFF
    return (_noise / 0x3FFFFFFF) - 1.0


def render(notes, bpm, unit_is_quarter=True, kind_fn="pulse",
           lead_gain=0.2, bass_gain=0.22, drums=None, echo_ms=None,
           echo_fb=0.35, lfo_depth=0.0, lfo_hz=0.15, soft=0.4):
    """notes: list of (start_units, dur_units, freq, channel)
    channel: 'lead' | 'bass' | 'pad'
    drums: list of (start_units, type) type in kick/snare/hat
    """
    unit = 60.0 / bpm if unit_is_quarter else 60.0 / bpm / 2
    # find end
    end_u = 0
    for s, d, hz, ch in notes:
        end_u = max(end_u, s + d)
    if drums:
        for s, t in drums:
            end_u = max(end_u, s + 1)
    total = end_u * unit + 1.2
    n = int(SR * total)
    mix = [0.0] * n

    def add(start, dur, hz, fn, gain, attack=0.08, release=0.35):
        s0 = int(start * unit * SR)
        ln = int(dur * unit * SR)
        a_n = max(1, int(attack * SR))
        r_n = max(1, int(release * SR))
        for i in range(ln):
            j = s0 + i
            if j >= n:
                break
            t = i / SR
            env = 1.0
            if i < a_n:
                env = i / a_n
            if ln - i < r_n:
                env = min(env, (ln - i) / r_n)
            # subtle vibrato / drift for elongated feel
            hz_i = hz
            if lfo_depth:
                hz_i = hz * (1.0 + lfo_depth * math.sin(2 * math.pi * lfo_hz * t))
            mix[j] += fn(t, hz_i) * gain * env

    for start, dur, hz, ch in notes:
        if ch == "lead":
            if kind_fn == "pulse":
                add(start, dur, hz, pulse, lead_gain, 0.12, 0.5)
            elif kind_fn == "square":
                add(start, dur, hz, square, lead_gain, 0.1, 0.4)
            elif kind_fn == "triangle":
                add(start, dur, hz, triangle, lead_gain, 0.15, 0.6)
            elif kind_fn == "sine":
                add(start, dur, hz, sine, lead_gain, 0.2, 0.7)
            elif kind_fn == "dual":
                add(start, dur, hz, pulse, lead_gain * 0.7, 0.12, 0.5)
                add(start, dur, hz * 1.003, triangle, lead_gain * 0.5, 0.15, 0.6)
        elif ch == "bass":
            add(start, dur, hz, triangle, bass_gain, 0.15, 0.5)
        elif ch == "pad":
            # detuned soft pad: two triangles slightly apart
            add(start, dur, hz, triangle, bass_gain * 0.45, 0.6, 0.8)
            add(start, dur, hz * 1.004, triangle, bass_gain * 0.4, 0.7, 0.9)
            add(start, dur, hz * 2, sine, bass_gain * 0.15, 0.5, 0.8)

    if drums:
        for start, typ in drums:
            s0 = int(start * unit * SR)
            if typ == "kick":
                ln = int(0.2 * SR)
                for i in range(ln):
                    if s0 + i >= n: break
                    t = i / SR
                    hz = 35 + 50 * math.exp(-t * 20)
                    mix[s0 + i] += math.sin(2 * math.pi * hz * t) * math.exp(-t * 10) * 0.3
            elif typ == "snare":
                ln = int(0.18 * SR)
                for i in range(ln):
                    if s0 + i >= n: break
                    t = i / SR
                    mix[s0 + i] += noise() * math.exp(-t * 16) * 0.18
            elif typ == "hat":
                ln = int(0.05 * SR)
                for i in range(ln):
                    if s0 + i >= n: break
                    t = i / SR
                    mix[s0 + i] += noise() * math.exp(-t * 70) * 0.08

    # one-pole lowpass (soften chip harshness)
    out = [0.0] * n
    prev = 0.0
    a = max(0.05, min(0.9, soft))
    for i, x in enumerate(mix):
        prev += a * (x - prev)
        out[i] = prev

    # multi-tap echo / "reverb"
    if echo_ms is None:
        delay = int((60.0 / bpm) * SR)  # one beat
    else:
        delay = int(echo_ms * SR / 1000)
    wet = [0.0] * n
    for i in range(n):
        wet[i] = out[i]
        if i - delay >= 0:
            wet[i] += out[i - delay] * echo_fb
        if i - 2 * delay >= 0:
            wet[i] += out[i - 2 * delay] * (echo_fb * 0.45)
        if i - 3 * delay >= 0:
            wet[i] += out[i - 3 * delay] * (echo_fb * 0.2)

    peak = max(abs(x) for x in wet) or 1.0
    scale = 0.85 / peak
    pcm = bytearray()
    for x in wet:
        v = int(max(-1.0, min(1.0, x * scale)) * 32767)
        pcm += struct.pack("<h", v)
    return pcm, total


def save(name, pcm, total):
    path = OUT / name
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(bytes(pcm))
    print(f"  {name}: {total:.1f}s, {len(pcm)//1024}KB")


# Shared melodic skeleton (long notes, floating) in quarter-note units
# Same original motif, stretched
# Form: A (8 bars) | B lift (8 bars) | A' (8 bars)  = 24 bars

def skeleton_A(start=0):
    """8 bars, long tones. Units = quarter notes at this bpm."""
    s = start
    # bar 1-2: A held, then G F E descending slowly
    out = [
        (s+0, 6, f("A4"), "lead"),
        (s+6, 2, f("G4"), "lead"),
        (s+8, 4, f("F4"), "lead"),
        (s+12, 4, f("E4"), "lead"),
        # bar 3-4
        (s+16, 6, f("F4"), "lead"),
        (s+22, 2, f("E4"), "lead"),
        (s+24, 8, f("D4"), "lead"),
    ]
    bass = [
        (s+0, 8, f("D2"), "bass"),
        (s+8, 8, f("F2"), "bass"),
        (s+16, 8, f("C2"), "bass"),
        (s+24, 8, f("A1"), "bass"),
    ]
    pad = [
        (s+0, 16, f("D3"), "pad"),
        (s+16, 16, f("A2"), "pad"),
    ]
    return out, bass, pad


def skeleton_B(start):
    """8 bars, slight lift — chase without energy."""
    s = start
    lead = [
        (s+0, 4, f("D5"), "lead"),
        (s+4, 4, f("C5"), "lead"),
        (s+8, 4, f("A4"), "lead"),
        (s+12, 4, f("G4"), "lead"),
        (s+16, 6, f("A4"), "lead"),
        (s+22, 2, f("C5"), "lead"),
        (s+24, 8, f("D5"), "lead"),
    ]
    bass = [
        (s+0, 8, f("D2"), "bass"),
        (s+8, 8, f("G1"), "bass"),
        (s+16, 8, f("F1"), "bass"),
        (s+24, 8, f("A1"), "bass"),
    ]
    pad = [
        (s+0, 16, f("F3"), "pad"),
        (s+16, 16, f("A2"), "pad"),
    ]
    return lead, bass, pad


def skeleton_Ap(start):
    """Return, even more stretched — final descent."""
    s = start
    lead = [
        (s+0, 8, f("A4"), "lead"),
        (s+8, 8, f("G4"), "lead"),
        (s+16, 8, f("F4"), "lead"),
        (s+24, 8, f("E4"), "lead"),
        (s+32, 16, f("D4"), "lead"),
    ]
    bass = [
        (s+0, 8, f("D2"), "bass"),
        (s+8, 8, f("C2"), "bass"),
        (s+16, 8, f("F1"), "bass"),
        (s+24, 8, f("A1"), "bass"),
        (s+32, 16, f("D2"), "bass"),
    ]
    pad = [
        (s+0, 16, f("D3"), "pad"),
        (s+16, 16, f("F3"), "pad"),
        (s+32, 16, f("D3"), "pad"),
    ]
    return lead, bass, pad


def build_full_notes():
    a_l, a_b, a_p = skeleton_A(0)
    b_l, b_b, b_p = skeleton_B(32)
    ap_l, ap_b, ap_p = skeleton_Ap(64)
    return a_l + b_l + ap_l, a_b + b_b + ap_b, a_p + b_p + ap_p


def combine(*lists):
    out = []
    for L in lists:
        out.extend(L)
    return out


print("Generating variants...")

lead, bass, pad = build_full_notes()

# ---- 1. Ambient Chip ----
# slow, sparse, pulse lead, almost no drums, heavy echo
notes = combine(lead, bass, pad)
pcm, dur = render(
    notes, bpm=62, unit_is_quarter=True, kind_fn="pulse",
    lead_gain=0.22, bass_gain=0.2,
    drums=[(0, "kick"), (16, "kick"), (32, "kick"), (48, "kick"),
           (64, "kick"), (80, "kick")],
    echo_ms=480, echo_fb=0.4, lfo_depth=0.004, lfo_hz=0.25, soft=0.28,
)
save("moon_ambient_chip.wav", pcm, dur)

# ---- 2. Lo-fi Dream ----
# triangle lead, pad-heavy, very soft, slow
pcm, dur = render(
    notes, bpm=58, unit_is_quarter=True, kind_fn="dual",
    lead_gain=0.18, bass_gain=0.26,
    drums=[(0, "kick"), (16, "hat"), (32, "kick"), (48, "hat"),
           (64, "kick"), (80, "hat")],
    echo_ms=520, echo_fb=0.45, lfo_depth=0.006, lfo_hz=0.12, soft=0.18,
)
save("moon_lofi_dream.wav", pcm, dur)

# ---- 3. Pure Ambient Synth ----
# sine/triangle only, no drums, longest, most spacious
pcm, dur = render(
    notes, bpm=54, unit_is_quarter=True, kind_fn="sine",
    lead_gain=0.2, bass_gain=0.24,
    drums=None,
    echo_ms=700, echo_fb=0.5, lfo_depth=0.003, lfo_hz=0.08, soft=0.22,
)
save("moon_pure_ambient.wav", pcm, dur)

# ---- 4. Vocal-style long lines ----
# almost all whole/half notes, soft pulse, one distant kick per 2 bars
pcm, dur = render(
    notes, bpm=60, unit_is_quarter=True, kind_fn="triangle",
    lead_gain=0.24, bass_gain=0.18,
    drums=[(0, "kick"), (16, "kick"), (32, "kick"), (48, "kick"),
           (64, "kick"), (80, "kick"), (96, "kick")],
    echo_ms=400, echo_fb=0.38, lfo_depth=0.005, lfo_hz=0.3, soft=0.32,
)
save("moon_vocal_lines.wav", pcm, dur)

print("Done.")
