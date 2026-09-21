#!/usr/bin/env python3
"""Original Mid-Autumn pentatonic 8-bit BGM (title/transition).
NOT a transcription of any traditional tune — new melody, 五声音阶气质.
"""
import math
import struct
import wave
from pathlib import Path

SR = 22050
OUT = Path(__file__).parent / "assets"
OUT.mkdir(exist_ok=True)

NAMES = {
    "C": 16.35, "D": 18.35, "E": 20.60, "F": 21.83, "G": 24.50,
    "A": 27.50, "B": 30.87, "c": 32.70, "d": 36.71, "e": 41.20,
    "g": 49.00, "a": 55.00, "b": 61.74,
}

def f(note: str) -> float:
    # accept G3, D4, e5 style with optional octave digit at end
    if note[-1].isdigit():
        base, octv = note[:-1], int(note[-1])
    else:
        # lowercase = one octave up from uppercase same letter
        base, octv = note, 4
    # Map scientific: C4=261.63 — use NAMES for C1=16.35 so C4 = 16.35*2^3
    # Simpler table:
    TABLE = {
        "C": 261.63, "D": 293.66, "E": 329.63, "F": 349.23, "G": 392.00,
        "A": 440.00, "B": 493.88, "c": 523.25, "d": 587.33, "e": 659.25,
        "g": 783.99, "a": 880.00, "b": 987.77,
    }
    if base in TABLE:
        hz = TABLE[base]
        # octave digit shifts from base octave 4 (or 5 for lowercase already in table)
        # For uppercase letters TABLE is octave 4; for lowercase TABLE is octave 5.
        # If user writes G3, D5 etc.
        if base.isupper():
            hz = TABLE[base] * (2 ** (octv - 4))
        else:
            hz = TABLE[base] * (2 ** (octv - 5))
        return hz
    raise ValueError(note)


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

_noise = 1
def noise():
    global _noise
    _noise = (_noise * 1103515245 + 12345) & 0x7FFFFFFF
    return (_noise / 0x3FFFFFFF) - 1.0


BPM = 96
UNIT = 60.0 / BPM  # quarter note

# --- Original melody, G major pentatonic (G A B D E) ---
# Clear A-B-A', 16 bars, good for title / transition loop
# Units in quarter notes

# LEAD (dizi-like, pulse)
lead = [
    # A (bars 1-4)
    (0, 2, f("B4")), (2, 1, f("A4")), (3, 1, f("G4")),
    (4, 4, f("A4")),
    (8, 2, f("G4")), (10, 1, f("E4")), (11, 1, f("D4")),
    (12, 4, f("E4")),
    # bars 5-8
    (16, 1, f("G4")), (17, 1, f("A4")), (18, 2, f("B4")),
    (20, 2, f("d5")), (22, 2, f("B4")),
    (24, 4, f("A4")), (28, 4, f("G4")),
    # B lift (bars 9-12)
    (32, 2, f("d5")), (34, 1, f("e5")), (35, 1, f("d5")),
    (36, 2, f("B4")), (38, 2, f("A4")),
    (40, 2, f("B4")), (42, 2, f("d5")),
    (44, 4, f("e5")),
    # bars 13-16
    (48, 1, f("d5")), (49, 1, f("B4")), (50, 1, f("A4")), (51, 1, f("G4")),
    (52, 2, f("A4")), (54, 2, f("B4")),
    (56, 2, f("A4")), (58, 2, f("G4")),
    (60, 4, f("E4")),
    # A' return (bars 17-20) — resolve
    (64, 2, f("G4")), (66, 1, f("A4")), (67, 1, f("B4")),
    (68, 4, f("d5")),
    (72, 2, f("B4")), (74, 2, f("A4")),
    (76, 4, f("G4")),
    (80, 8, f("G4")),  # hold / loop point
]

# BASS (triangle, roots)
bass = [
    (0, 8, f("G2")), (8, 8, f("E2")),
    (16, 8, f("D2")), (24, 8, f("G2")),
    (32, 8, f("G2")), (40, 8, f("D2")),
    (48, 8, f("E2")), (56, 8, f("D2")),
    (64, 8, f("G2")), (72, 8, f("D2")),
    (80, 8, f("G2")),
]

# GUZHENG-like broken chords (square, short, arpeggio) — every half bar
# G: G B D | Em: E G B | D: D F# A but stay pentatonic → D A d | C-ish skip
arp = []
# pattern per chord root
def add_arp(start, notes, n=4):
    # eighth-note-ish: 4 notes over 2 quarters
    for i, name in enumerate(notes):
        arp.append((start + i * 0.5, 0.45, f(name)))

# bars of 2 chord hits each (2 quarters per arpeggio burst)
for bar_start, notes in [
    (0, ["G3", "B3", "d4", "B3"]),
    (2, ["G3", "B3", "d4", "B3"]),
    (4, ["E3", "G3", "B3", "G3"]),
    (6, ["E3", "G3", "B3", "G3"]),
    (8, ["D3", "A3", "d4", "A3"]),
    (10, ["D3", "A3", "d4", "A3"]),
    (12, ["G3", "B3", "d4", "B3"]),
    (14, ["G3", "B3", "d4", "B3"]),
    (16, ["G3", "d4", "g4", "d4"]),
    (18, ["G3", "d4", "g4", "d4"]),
    (20, ["E3", "B3", "e4", "B3"]),
    (22, ["E3", "B3", "e4", "B3"]),
    (24, ["D3", "A3", "d4", "A3"]),
    (26, ["D3", "A3", "d4", "A3"]),
    (28, ["G3", "B3", "d4", "B3"]),
    (30, ["G3", "B3", "d4", "B3"]),
    (32, ["G3", "d4", "g4", "d4"]),
    (34, ["G3", "d4", "g4", "d4"]),
    (36, ["D3", "A3", "d4", "A3"]),
    (38, ["D3", "A3", "d4", "A3"]),
    (40, ["E3", "B3", "e4", "B3"]),
    (42, ["E3", "B3", "e4", "B3"]),
    (44, ["G3", "d4", "g4", "d4"]),
    (46, ["G3", "d4", "g4", "d4"]),
    (48, ["E3", "B3", "e4", "B3"]),
    (50, ["E3", "B3", "e4", "B3"]),
    (52, ["D3", "A3", "d4", "A3"]),
    (54, ["D3", "A3", "d4", "A3"]),
    (56, ["D3", "A3", "d4", "A3"]),
    (58, ["D3", "A3", "d4", "A3"]),
    (60, ["E3", "G3", "B3", "G3"]),
    (62, ["E3", "G3", "B3", "G3"]),
    (64, ["G3", "B3", "d4", "B3"]),
    (66, ["G3", "B3", "d4", "B3"]),
    (68, ["D3", "A3", "d4", "A3"]),
    (70, ["D3", "A3", "d4", "A3"]),
    (72, ["G3", "B3", "d4", "B3"]),
    (74, ["G3", "B3", "d4", "B3"]),
    (76, ["E3", "G3", "B3", "G3"]),
    (78, ["E3", "G3", "B3", "G3"]),
    (80, ["G3", "B3", "d4", "g4"]),
    (82, ["G3", "B3", "d4", "g4"]),
]:
    add_arp(bar_start, notes)

# Light drums: soft kick on 1, hat on off — festive but not loud
drums = []
for i in range(0, 84, 4):
    drums.append((i, "kick"))
for i in range(2, 84, 4):
    drums.append((i, "hat"))
# a few snares in B section
for i in range(32, 64, 8):
    drums.append((i + 4, "snare"))


end_u = 88
total = end_u * UNIT + 1.0
n = int(SR * total)
mix = [0.0] * n

def add_note(start, dur, hz, fn, gain, attack=0.02, release=0.12):
    s0 = int(start * UNIT * SR)
    ln = max(1, int(dur * UNIT * SR))
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
        mix[j] += fn(t, hz) * gain * env

for start, dur, hz in lead:
    add_note(start, dur, hz, pulse, 0.2, 0.015, 0.1)

for start, dur, hz in bass:
    add_note(start, dur, hz, triangle, 0.22, 0.04, 0.15)

for start, dur, hz in arp:
    add_note(start, dur, hz, square, 0.08, 0.005, 0.06)

for start, typ in drums:
    s0 = int(start * UNIT * SR)
    if typ == "kick":
        ln = int(0.12 * SR)
        for i in range(ln):
            if s0 + i >= n: break
            t = i / SR
            hz = 40 + 40 * math.exp(-t * 25)
            mix[s0 + i] += math.sin(2 * math.pi * hz * t) * math.exp(-t * 18) * 0.28
    elif typ == "snare":
        ln = int(0.1 * SR)
        for i in range(ln):
            if s0 + i >= n: break
            t = i / SR
            mix[s0 + i] += noise() * math.exp(-t * 30) * 0.12
    elif typ == "hat":
        ln = int(0.03 * SR)
        for i in range(ln):
            if s0 + i >= n: break
            t = i / SR
            mix[s0 + i] += noise() * math.exp(-t * 90) * 0.06

# gentle LP + short echo (not the huge ambient wash)
out = [0.0] * n
prev = 0.0
a = 0.45
for i, x in enumerate(mix):
    prev += a * (x - prev)
    out[i] = prev

delay = int(UNIT * SR)  # one beat
final = [0.0] * n
for i in range(n):
    final[i] = out[i]
    if i - delay >= 0:
        final[i] += out[i - delay] * 0.18

peak = max(abs(x) for x in final) or 1.0
scale = 0.85 / peak
pcm = bytearray()
for x in final:
    v = int(max(-1.0, min(1.0, x * scale)) * 32767)
    pcm += struct.pack("<h", v)

path = OUT / "moon_midautumn_8bit.wav"
with wave.open(str(path), "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(bytes(pcm))
print(f"wrote {path.name}: {total:.1f}s, {len(pcm)//1024}KB")
