# Stitch Studio

A phone-first embroidery digitizing app built for the Brother NV880E (single needle, 5"×7" max). Draw, letter, import pictures, or describe a design to the AI digitizer, then save a `.pes` file for the machine.

## What it does

- **Draw** with a finger or stylus: running line, bold triple line, satin column, or filled shape. Strokes are smoothed for clean stitching.
- **Shapes:** circle/oval, rectangle, heart, star, stitched as fill, appliqué, satin border or outline.
- **Lettering:** 8 embroidery-friendly fonts, exact letter height in mm, arched text, and warnings when text is too small to sew.
- **Picture to stitches:** photos, PNG, screenshots, logos and PDFs (first page). The app reduces the picture to thread colours, removes the background, and fills each colour at its own stitch angle.
- **AI digitizer** (inside Claude): talk or type what you want, attach inspiration pictures, and it builds and edits the design with expert rules. It can also answer embroidery questions (stabilizer, needles, hooping).
- **Stitch engine**, with the rules a professional digitizer applies:
  - tatami fill with staggered needle points
  - narrow areas turn into satin automatically
  - satin columns, split satin above 7 mm, running and triple stitches
  - underlay matched to the fabric, and pull compensation
  - tie-ins and tie-offs
  - trims between separate pieces
  - same-colour grouping to reduce thread changes on a single-needle machine
- **Fabric presets** for woven cotton, knit, fleece, towel, denim, felt and vinyl. Each one sets density, underlay and compensation, and comes with stabilizer advice.
- **Stitch preview** with a "watch it sew" player, stitch count, real size in mm and inches, sewing time, the thread order with Brother thread names, and a quality check.
- **Measure tool**, rulers in mm or inches, real-size zoom, undo/redo, and saved designs on the device.

## Getting a design onto the NV880E

1. Tap **Save → Save .PES file for my machine**.
2. Copy the file to a USB stick. A USB-C stick plugs straight into most phones.
3. Plug the stick into the NV880E and pick the design from the embroidery screen.

## Files

- `src/engine.js`: geometry, stitch generation, quality checks, image tracing, and the PES/PEC writer. It has no DOM dependencies.
- `src/app.html`: the app UI.
- `build.js`: inlines the engine into `index.html`, a single file you can open anywhere.
- `tests/`: a sample design that writes a PES file, plus browser tests. To check files independently, use `pip install pyembroidery`.

```bash
node build.js
```

```bash
node tests/sample.js out.pes && python3 -c "import pyembroidery as p; print(len(p.read('out.pes').stitches))"
```

The PES writer follows the format as implemented by pyembroidery (MIT licence): PES v1 with a PEC block and thumbnails, using Brother's 64-colour thread chart.
