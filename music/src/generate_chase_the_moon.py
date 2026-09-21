#!/usr/bin/env python3
"""Generate original 8-bit chiptune 'Chase the Moon' as a loopable WAV."""
import math
import struct
import wave
from pathlib import Path

SR = 22050
BPM = 84
# timeline unit = eighth note (matches ABC L:1/8)
BEAT = 60.0 / BPM / 2
EIGHTH = BEAT

# Note frequencies (Hz)
NAMES = {
    "C": 16.35, "C#": 17.32, "D": 18.35, "D#": 19.45,
    "E": 20.60, "F": 21.83, "F#": 23.12, "G": 24.50,
    "G#": 25.96, "A": 27.50, "A#": 29.14, "B": 30.87,
}

def freq(name: str, octave: int) -> float:
    return NAMES[name] * (2 ** octave)

# MIDI-ish note parser: "A4", "F#3", "C5"
def f(note: str) -> float:
    if len(note) >= 3 and note[1] == "#":
        return freq(note[:2], int(note[2:]))
    return freq(note[0], int(note[1:]))

# Event: (start_beat, duration_beats, frequency or None for rest, channel)
# channels: lead (square), bass (triangle), kick, snare, hat

def square(t, freq_hz, duty=0.5):
    period = 1.0 / freq_hz
    phase = (t % period) / period
    return 1.0 if phase < duty else -1.0

def triangle(t, freq_hz):
    period = 1.0 / freq_hz
    phase = (t % period) / period
    if phase < 0.25:
        return phase * 4
    elif phase < 0.75:
        return 2 - phase * 4
    else:
        return phase * 4 - 4

# Simple LCG noise
_noise_state = 12345

def noise_sample():
    global _noise_state
    _noise_state = (_noise_state * 1103515245 + 12345) & 0x7FFFFFFF
    return (_noise_state / 0x3FFFFFFF) - 1.0

# Build events
lead = []   # (start, dur, freq)
bass = []
kicks = []
snares = []
hats = []

# ---- A section (bars 1-4) ----
# LEAD: rest, A A G | F - E - | F F E D | C - A, -
lead += [
    # enter immediately — no opening rest
    (0, 2, f("A4")), (2, 2, f("A4")), (4, 2, f("G4")),
    (6, 3, f("F4")), (9, 3, f("E4")),
    (12, 2, f("F4")), (14, 2, f("F4")), (16, 2, f("E4")), (18, 2, f("D4")),
    (20, 3, f("C4")), (23, 5, f("A3")),
]
# BASS: D A | D F | C G | A E
bass += [
    (0, 4, f("D2")), (4, 4, f("A1")),
    (8, 4, f("D2")), (12, 4, f("F2")),
    (16, 4, f("C2")), (20, 4, f("G1")),
    (24, 4, f("A1")), (28, 4, f("E2")),
]
# drums light
for b in range(0, 16, 4):
    kicks.append(b)
hats += [0, 2, 4, 6, 8, 10, 12, 14]

# ---- A2 (bars 5-8) ----
lead += [
    (32, 2, f("A4")), (34, 2, f("A4")), (36, 2, f("G4")), (38, 2, f("F4")),
    (40, 4, f("E4")), (44, 4, f("G4")),
    (48, 2, f("F4")), (50, 2, f("E4")), (52, 2, f("D4")), (54, 2, f("C4")),
    (56, 6, f("D4")),
]
bass += [
    (32, 4, f("D2")), (36, 4, f("A1")),
    (40, 4, f("C2")), (44, 4, f("E2")),
    (48, 4, f("F1")), (52, 4, f("C2")),
    (56, 8, f("D2")),
]
for b in range(32, 56, 4):
    kicks.append(b)
snares.append(60)
hats += [32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58]

# ---- B section chase (bars 9-16, 32 beats more = total 96? wait)
# Actually TOTAL was 32 beats for A only. Full form is A(16) + A2(16) + B(16) + B2(16) + A'(16) + A2'(16)
# That's 96 beats. Let me expand.

# Recalculate - full arrangement is 8+8+8+8 = 32 bars = 128 eighth notes... wait
# Bars of 4/4 with L=1/8: each bar is 8 eighths = 4 beats
# ABC has: A (4 bars) + A2 (4 bars) + B (4 bars) + B2 (4 bars) + A' (4) + A2' (4) = 24 bars = 96 beats

# B section starting at beat 64
# d d c A | G - F - | e d c A | G - F -
lead += [
    (64, 2, f("D5")), (66, 2, f("D5")), (68, 2, f("C5")), (70, 2, f("A4")),
    (72, 4, f("G4")), (76, 4, f("F4")),
    (80, 2, f("E5")), (82, 2, f("D5")), (84, 2, f("C5")), (86, 2, f("A4")),
    (88, 4, f("G4")), (92, 4, f("F4")),
]
bass += [
    (64, 4, f("D2")), (68, 4, f("F2")),
    (72, 4, f("G1")), (76, 4, f("D2")),
    (80, 4, f("C2")), (84, 4, f("E1")),
    (88, 4, f("G1")), (92, 4, f("D2")),
]
for b in range(64, 96, 2):
    kicks.append(b)
snares += [66, 70, 74, 78, 82, 86, 90, 94]
hats += list(range(64, 96))

# B2 (beats 96-128)
# A c d e | f - e - | d c A G | A -
lead += [
    (96, 2, f("A4")), (98, 2, f("C5")), (100, 2, f("D5")), (102, 2, f("E5")),
    (104, 4, f("F5")), (108, 4, f("E5")),
    (112, 2, f("D5")), (114, 2, f("C5")), (116, 2, f("A4")), (118, 2, f("G4")),
    (120, 6, f("A4")),
]
bass += [
    (96, 4, f("F1")), (100, 4, f("C2")),
    (104, 4, f("A1")), (108, 4, f("E2")),
    (112, 4, f("D2")), (116, 4, f("G1")),
    (120, 8, f("A1")),
]
for b in range(96, 128, 2):
    kicks.append(b)
snares += [98, 102, 106, 110, 114, 118, 122, 126]
hats += list(range(96, 128))

# A' return (beats 128-160) - same as first A
lead += [
    (130, 2, f("A4")), (132, 2, f("A4")), (134, 2, f("G4")),
    (136, 4, f("F4")), (140, 4, f("E4")),
    (144, 2, f("F4")), (146, 2, f("F4")), (148, 2, f("E4")), (150, 2, f("D4")),
    (152, 4, f("C4")), (156, 4, f("A3")),
]
bass += [
    (128, 4, f("D2")), (132, 4, f("A1")),
    (136, 4, f("D2")), (140, 4, f("F2")),
    (144, 4, f("C2")), (148, 4, f("G1")),
    (152, 4, f("A1")), (156, 4, f("E2")),
]
for b in range(128, 160, 4):
    kicks.append(b)
hats += list(range(128, 160, 2))

# A2' final (beats 160-192)
lead += [
    (160, 2, f("A4")), (162, 2, f("A4")), (164, 2, f("G4")), (166, 2, f("F4")),
    (168, 4, f("E4")), (172, 4, f("G4")),
    (176, 2, f("F4")), (178, 2, f("E4")), (180, 2, f("D4")), (182, 2, f("C4")),
    (184, 8, f("D4")),
]
bass += [
    (160, 4, f("D2")), (164, 4, f("A1")),
    (168, 4, f("C2")), (172, 4, f("E2")),
    (176, 4, f("F1")), (180, 4, f("C2")),
    (184, 8, f("D2")),
]
for b in range(160, 184, 4):
    kicks.append(b)
hats += list(range(160, 192, 2))

# 24 bars * 8 eighths = 192 units
DURATION = 192 * BEAT + 0.8

n_samples = int(SR * DURATION)
mix = [0.0] * n_samples

def add_tone(start, dur, freq_hz, kind, gain):
    s0 = int(start * BEAT * SR)
    n = int(dur * BEAT * SR)
    for i in range(n):
        if s0 + i >= n_samples:
            break
        t = i / SR
        # simple attack/release envelope
        env = 1.0
        if i < 80:
            env = i / 80
        if n - i < 200:
            env = min(env, (n - i) / 200)
        if kind == "square":
            mix[s0 + i] += square(t, freq_hz) * gain * env
        elif kind == "triangle":
            mix[s0 + i] += triangle(t, freq_hz) * gain * env

def add_kick(start):
    s0 = int(start * BEAT * SR)
    n = int(0.12 * SR)
    for i in range(n):
        if s0 + i >= n_samples:
            break
        t = i / SR
        # pitch drop 120 -> 40
        fnow = 40 + 80 * math.exp(-t * 30)
        sample = math.sin(2 * math.pi * fnow * t) * math.exp(-t * 18)
        mix[s0 + i] += sample * 0.45

def add_snare(start):
    s0 = int(start * BEAT * SR)
    n = int(0.10 * SR)
    for i in range(n):
        if s0 + i >= n_samples:
            break
        t = i / SR
        sample = noise_sample() * math.exp(-t * 25)
        mix[s0 + i] += sample * 0.25

def add_hat(start):
    s0 = int(start * BEAT * SR)
    n = int(0.04 * SR)
    for i in range(n):
        if s0 + i >= n_samples:
            break
        t = i / SR
        sample = noise_sample() * math.exp(-t * 80)
        mix[s0 + i] += sample * 0.12

for start, dur, hz in lead:
    add_tone(start, dur, hz, "square", 0.22)

for start, dur, hz in bass:
    add_tone(start, dur, hz, "triangle", 0.28)

for b in kicks:
    add_kick(b)
for b in snares:
    add_snare(b)
for b in hats:
    add_hat(b)

# soft lowpass-ish (one-pole) and gentle echo
out = [0.0] * n_samples
prev = 0.0
a = 0.35  # lerp
for i, x in enumerate(mix):
    prev = prev + a * (x - prev)
    out[i] = prev

# echo (1/8 note delay, 25%)
delay = int(EIGHTH * SR)
echo = [0.0] * n_samples
for i in range(n_samples):
    echo[i] = out[i]
    if i - delay >= 0:
        echo[i] += out[i - delay] * 0.22
    if i - 2 * delay >= 0:
        echo[i] += out[i - 2 * delay] * 0.08

# normalize
peak = max(abs(x) for x in echo) or 1.0
scale = 0.85 / peak
pcm = bytearray()
for x in echo:
    v = int(max(-1.0, min(1.0, x * scale)) * 32767)
    pcm += struct.pack("<h", v)

out_path = Path(__file__).parent / "assets" / "chase_the_moon.wav"
out_path.parent.mkdir(exist_ok=True)
with wave.open(str(out_path), "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(bytes(pcm))

print(f"wrote {out_path} ({DURATION:.1f}s, {len(pcm)//2} samples)")
