# Codys Colours

Free Mac colour workflow panel for Adobe Illustrator and Adobe Photoshop.

Codys Colours helps you search, compare, save, convert, extract, favourite, and apply colours inside Adobe apps. The public build includes only a small generic starter library. Import your own CSV or JSON colour libraries that you are authorised to use.

## Licence

Codys Colours is free to use, including for commercial design work, but it is
not open-source for resale or rebranding.

You can use the plugin and its outputs for free. You cannot sell, repackage,
rename, white-label, upload, mirror, or redistribute Codys Colours or modified
copies as your own product. Commercial public use must keep visible credit to:

```text
Codys Colours by Cody Harker
https://github.com/thepianoboi-cmyk/Codys-Colours
```

See `LICENSE` for the full Codys Colours Free Use and Attribution License.

## Mac Install

1. Download the latest release ZIP.
2. Unzip it.
3. Double-click `Install Codys Colours.command`.
4. Restart Illustrator or Photoshop.
5. Open `Window > Extensions (Legacy) > Codys Colours`.

If macOS blocks the installer, right-click it, choose `Open`, then confirm.

## Import A Colour Library

Use the `Import` button in the panel and choose a CSV or JSON file.

Recommended CSV columns:

```text
Name,Hex,R,G,B,C,M,Y,K,Lab,Source,Suffix,Alias
```

Minimum useful CSV columns:

```text
Name,Hex
```

JSON can be either an array of colour objects or an object with a `records` array.

## Features

- Search by name, code, suffix, or hex value.
- Pick or find colours from Illustrator and Photoshop.
- Compare selected colour stats with the closest library colours.
- Convert Hex, RGB, CMYK, and Lab values to nearest library matches.
- Extract colours from images or selected artwork.
- Add colours to palettes, favourites, swatches, artwork, and recent history.
- Add an Illustrator colour square in the centre of the active view.
- Keep pattern and colour history locally in the panel.

## Included Data

The public download intentionally does not bundle commercial third-party colour guide data. It includes a small generic starter library so the panel opens cleanly, plus local import tools so each user can load data they have rights to use.

## Development

Build the installable package:

```bash
./tools/build_adobe_package.sh
```

Install locally:

```bash
./tools/install_adobe_assets.sh
```

The signed ZXP is created at:

```text
dist/Codys Colours.zxp
```
