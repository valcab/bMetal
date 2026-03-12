# Black Metal Typography for Figma

This is a zero-build Figma plugin scaffold that turns a selected text layer into procedural black metal style typography while keeping the original text editable.

## How it works

The plugin does not outline or flatten the source text. Instead it:

- keeps the original text node inside a generated frame as `Editable Source`
- layers duplicate text copies for rough ink mass and blur
- adds mirrored thorn branches, frost noise, haze, and drips around the text
- stores the settings on the generated frame so you can re-run and regenerate

That means the result stays editable in a practical plugin sense: change the `Editable Source` text, run the plugin again, and it rebuilds the logo treatment.

## Files

- `manifest.json`: Figma plugin manifest
- `code.js`: plugin runtime
- `ui.html`: settings UI

## Install

1. In Figma, go to `Plugins` -> `Development` -> `Import plugin from manifest...`
2. Choose [manifest.json](/Users/valentincabioch/dev/bmetal/manifest.json)
3. Select a text layer in a file
4. Run the plugin and tweak the settings

## Suggested workflow

1. Start with a heavy serif, blackletter, or sharp display font.
2. Use the `Frostbitten` preset for more symmetry and crystalline detail.
3. Use the `Feral` preset for denser, wetter, less legible forms.
4. After editing the text, select either the generated frame or the source text and run the plugin again.

## Inspiration notes

The generator leans on recurring traits common in classic black metal logos:

- near-bilateral symmetry
- upward and downward thorn growth
- dense central ink mass with softer haze around it
- long hanging drips or root-like appendages
- occasional cold white highlights to suggest frost or bark sheen

For visual reference, study examples from bands and labels such as:

- [Mayhem on Peaceville](https://peaceville.com/bands/)
- [Darkthrone on Peaceville](https://peaceville.com/bands/darkthrone/)
- [Emperor on Candlelight Records](https://www.candlelightrecords.co.uk/artist/emperor/emperor/)

Those references informed the plugin direction, but the output here is generated procedurally rather than imitating any one band mark.

## Current limitations

- it works best on a single selected text layer
- mixed-font compositions are only partially supported
- the effect is stylized through generated geometry, not true glyph warping
- if you manually delete the `Editable Source` layer inside the generated frame, regeneration will fail
