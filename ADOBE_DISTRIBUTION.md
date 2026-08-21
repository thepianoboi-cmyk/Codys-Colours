# Adobe Distribution Notes

## Public Distribution Path

The easiest free public path for this Mac-only CEP extension is:

1. GitHub repository for the source and documentation.
2. GitHub Releases for the downloadable ZIP and ZXP files.
3. GitHub Pages for a simple install page.

This avoids paid marketplace tooling and keeps installation simple for users who are comfortable installing a Mac extension manually.

## Installable Package

Use:

```text
dist/Codys Colours.zxp
```

The package is signed with Adobe's `ZXPSignCmd` tool when available. The source ZIP is:

```text
dist/Codys Colours CEP Source.zip
```

## Supported Hosts

The manifest targets:

- Illustrator: `ILST` version `[27.0,99.9]`
- Photoshop: `PHXS` version `[24.0,99.9]`
- Photoshop: `PHSP` version `[24.0,99.9]`

## Public Data Position

The public build includes only generic starter colours. Users import their own authorised CSV or JSON colour libraries locally; imported data stays in the panel's local browser storage unless the user exports or shares it.

## Manual Install

Run:

```bash
./tools/install_adobe_assets.sh
```

Restart Illustrator or Photoshop, then open:

```text
Window > Extensions (Legacy) > Codys Colours
```
