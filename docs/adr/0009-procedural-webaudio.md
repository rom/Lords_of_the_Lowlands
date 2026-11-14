# 9. Procedural Web Audio sound effects and generative music

Date: 2026-11-14

## Status

Accepted

## Context

An RTS needs dozens of sound effects (combat per weapon technology, work,
construction, alerts, fanfares) and music whose character changes over 17
ages. Recorded audio would add megabytes of assets, licensing questions and
`media-src` exceptions, and still sound repetitive over a long campaign
(ASR-12, ASR-5).

## Decision

Synthesize everything at run time with the **Web Audio API**
(`web/js/audio.js`):

- a small graph: master gain → dynamics compressor → output; separate SFX
  and music buses; a convolution reverb with a generated impulse;
- effects composed from three primitives — enveloped oscillators, filtered
  noise bursts with frequency sweeps, and a "horn" (sawtooth partials
  through an opening low-pass);
- spatialisation by stereo panning from the event's screen position and
  distance attenuation; per-sound throttling;
- **generative music**: one style per era (mode, root, tempo, lead/pad/drum
  instruments), a randomly re-chosen chord progression, pads per bar,
  percussion patterns and a constrained random-walk melody, scheduled with
  a look-ahead timer on the audio clock;
- volumes persisted in `localStorage`; the `AudioContext` starts on the first
  user gesture.

## Consequences

- No audio files: zero download size for sound, no licensing, CSP stays
  strict.
- Music never repeats exactly and changes style with each era automatically.
- Sound design is code: tweaking requires a developer rather than an audio
  editor, and synthesized sounds are less realistic than recordings.
- CPU cost grows with simultaneous voices; throttling bounds it in large
  battles.
