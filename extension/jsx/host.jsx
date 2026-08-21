/* Codys Colours host actions for Illustrator and Photoshop. */

function SCA_parse(payload) {
    if (typeof payload !== "string") return payload;
    try {
        if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(payload);
    } catch (ignore) {}
    return eval("(" + payload + ")");
}

function SCA_escapeJsonString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function SCA_stringify(value) {
    try {
        if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(value);
    } catch (ignore) {}
    if (value === null) return "null";
    var type = typeof value;
    if (type === "number" || type === "boolean") return String(value);
    if (type === "string") return '"' + SCA_escapeJsonString(value) + '"';
    if (value instanceof Array) {
        var arrayParts = [];
        for (var i = 0; i < value.length; i++) arrayParts.push(SCA_stringify(value[i]));
        return "[" + arrayParts.join(",") + "]";
    }
    var parts = [];
    for (var key in value) {
        if (value.hasOwnProperty(key)) parts.push('"' + SCA_escapeJsonString(key) + '":' + SCA_stringify(value[key]));
    }
    return "{" + parts.join(",") + "}";
}

function SCA_isPhotoshop() {
    return String(app.name).toLowerCase().indexOf("photoshop") >= 0;
}

function SCA_isIllustrator() {
    return String(app.name).toLowerCase().indexOf("illustrator") >= 0;
}

function SCA_num(value, fallback) {
    var num = Number(value);
    return isNaN(num) ? fallback : num;
}

function SCA_channel(value) {
    var num = Math.round(SCA_num(value, 0));
    if (num < 0) return 0;
    if (num > 255) return 255;
    return num;
}

function SCA_round(value, decimals) {
    var places = decimals === undefined ? 2 : decimals;
    var factor = Math.pow(10, places);
    return Math.round(SCA_num(value, 0) * factor) / factor;
}

function SCA_cmykObject(c, m, y, k) {
    return {
        c: SCA_round(c, 2),
        m: SCA_round(m, 2),
        y: SCA_round(y, 2),
        k: SCA_round(k, 2)
    };
}

function SCA_labObject(l, a, b) {
    return {
        l: SCA_round(l, 2),
        a: SCA_round(a, 2),
        b: SCA_round(b, 2)
    };
}

function SCA_rgbToCmykFallback(r, g, b) {
    var red = SCA_channel(r) / 255;
    var green = SCA_channel(g) / 255;
    var blue = SCA_channel(b) / 255;
    var k = 1 - Math.max(red, green, blue);
    if (k >= 0.9999) return SCA_cmykObject(0, 0, 0, 100);
    return SCA_cmykObject(
        ((1 - red - k) / (1 - k)) * 100,
        ((1 - green - k) / (1 - k)) * 100,
        ((1 - blue - k) / (1 - k)) * 100,
        k * 100
    );
}

function SCA_cmykToRgbFallback(c, m, y, k) {
    var cyan = SCA_num(c, 0) / 100;
    var magenta = SCA_num(m, 0) / 100;
    var yellow = SCA_num(y, 0) / 100;
    var black = SCA_num(k, 0) / 100;
    return {
        r: SCA_channel(255 * (1 - cyan) * (1 - black)),
        g: SCA_channel(255 * (1 - magenta) * (1 - black)),
        b: SCA_channel(255 * (1 - yellow) * (1 - black))
    };
}

function SCA_convertSampleColorSafe(sourceSpace, values, destSpace) {
    try {
        if (app.convertSampleColor) {
            return app.convertSampleColor(sourceSpace, values, destSpace, ColorConvertPurpose.previewpurpose);
        }
    } catch (err) {
        try {
            return app.convertSampleColor(sourceSpace, values, destSpace, ColorConvertPurpose.defaultpurpose);
        } catch (ignore) {}
    }
    return null;
}

function SCA_deriveLab(sourceSpace, values, fallbackRgb) {
    var lab = SCA_convertSampleColorSafe(sourceSpace, values, ImageColorSpace.LAB);
    if (lab && lab.length >= 3) return SCA_labObject(lab[0], lab[1], lab[2]);
    if (fallbackRgb) {
        var labFromRgb = SCA_convertSampleColorSafe(ImageColorSpace.RGB, [fallbackRgb.r, fallbackRgb.g, fallbackRgb.b], ImageColorSpace.LAB);
        if (labFromRgb && labFromRgb.length >= 3) return SCA_labObject(labFromRgb[0], labFromRgb[1], labFromRgb[2]);
    }
    return null;
}

function SCA_payloadFromRgbValues(r, g, b, sourceLabel) {
    var rgb = { r: SCA_channel(r), g: SCA_channel(g), b: SCA_channel(b) };
    var convertedCmyk = SCA_convertSampleColorSafe(ImageColorSpace.RGB, [rgb.r, rgb.g, rgb.b], ImageColorSpace.CMYK);
    var payload = {
        ok: true,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        colorModel: "RGB",
        colorSource: sourceLabel || "Illustrator RGB",
        cmykSource: "Adobe profile conversion"
    };
    if (convertedCmyk && convertedCmyk.length >= 4) {
        payload.cmyk = SCA_cmykObject(convertedCmyk[0], convertedCmyk[1], convertedCmyk[2], convertedCmyk[3]);
    } else {
        payload.cmyk = SCA_rgbToCmykFallback(rgb.r, rgb.g, rgb.b);
        payload.cmykSource = "RGB approximation";
    }
    payload.lab = SCA_deriveLab(ImageColorSpace.RGB, [rgb.r, rgb.g, rgb.b], rgb);
    return payload;
}

function SCA_payloadFromCmykValues(c, m, y, k, sourceLabel) {
    var cmyk = SCA_cmykObject(c, m, y, k);
    var rgbArray = SCA_convertSampleColorSafe(ImageColorSpace.CMYK, [cmyk.c, cmyk.m, cmyk.y, cmyk.k], ImageColorSpace.RGB);
    var rgb = rgbArray && rgbArray.length >= 3 ? {
        r: SCA_channel(rgbArray[0]),
        g: SCA_channel(rgbArray[1]),
        b: SCA_channel(rgbArray[2])
    } : SCA_cmykToRgbFallback(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
    return {
        ok: true,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        cmyk: cmyk,
        lab: SCA_deriveLab(ImageColorSpace.CMYK, [cmyk.c, cmyk.m, cmyk.y, cmyk.k], rgb),
        colorModel: "CMYK",
        colorSource: sourceLabel || "Illustrator CMYK",
        cmykSource: sourceLabel || "Illustrator CMYK"
    };
}

function SCA_payloadFromLabValues(l, a, b, sourceLabel) {
    var lab = SCA_labObject(l, a, b);
    var rgbArray = SCA_convertSampleColorSafe(ImageColorSpace.LAB, [lab.l, lab.a, lab.b], ImageColorSpace.RGB);
    var rgb = rgbArray && rgbArray.length >= 3 ? {
        r: SCA_channel(rgbArray[0]),
        g: SCA_channel(rgbArray[1]),
        b: SCA_channel(rgbArray[2])
    } : { r: 0, g: 0, b: 0 };
    var cmykArray = SCA_convertSampleColorSafe(ImageColorSpace.LAB, [lab.l, lab.a, lab.b], ImageColorSpace.CMYK);
    var payload = {
        ok: true,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        lab: lab,
        colorModel: "Lab",
        colorSource: sourceLabel || "Illustrator Lab",
        cmykSource: "Adobe profile conversion"
    };
    payload.cmyk = cmykArray && cmykArray.length >= 4 ? SCA_cmykObject(cmykArray[0], cmykArray[1], cmykArray[2], cmykArray[3]) : SCA_rgbToCmykFallback(rgb.r, rgb.g, rgb.b);
    return payload;
}

function SCA_clonePayload(payload) {
    var out = {};
    for (var key in payload) {
        if (payload.hasOwnProperty(key)) out[key] = payload[key];
    }
    if (payload.cmyk) out.cmyk = SCA_cmykObject(payload.cmyk.c, payload.cmyk.m, payload.cmyk.y, payload.cmyk.k);
    if (payload.lab) out.lab = SCA_labObject(payload.lab.l, payload.lab.a, payload.lab.b);
    return out;
}

function SCA_applyTintToPayload(payload, tint) {
    var amount = Math.max(0, Math.min(100, SCA_num(tint, 100)));
    var factor = amount / 100;
    var out = SCA_clonePayload(payload);
    out.r = SCA_channel(255 - ((255 - payload.r) * factor));
    out.g = SCA_channel(255 - ((255 - payload.g) * factor));
    out.b = SCA_channel(255 - ((255 - payload.b) * factor));
    if (payload.cmyk) {
        out.cmyk = SCA_cmykObject(payload.cmyk.c * factor, payload.cmyk.m * factor, payload.cmyk.y * factor, payload.cmyk.k * factor);
        out.cmykSource = "Illustrator spot tint";
    } else {
        out.cmyk = SCA_rgbToCmykFallback(out.r, out.g, out.b);
        out.cmykSource = "Tint approximation";
    }
    out.lab = SCA_deriveLab(ImageColorSpace.RGB, [out.r, out.g, out.b], out);
    out.tint = SCA_round(amount, 2);
    return out;
}

function SCA_makeIllustratorCMYK(record) {
    var color = new CMYKColor();
    color.cyan = SCA_num(record.c, 0);
    color.magenta = SCA_num(record.m, 0);
    color.yellow = SCA_num(record.y, 0);
    color.black = SCA_num(record.k, 0);
    return color;
}

function SCA_makeIllustratorRGB(record) {
    return SCA_makeIllustratorRGBValues(record.r, record.g, record.b);
}

function SCA_makeIllustratorRGBValues(r, g, b) {
    var color = new RGBColor();
    color.red = SCA_channel(r);
    color.green = SCA_channel(g);
    color.blue = SCA_channel(b);
    return color;
}

function SCA_illustratorSpot(record) {
    if (app.documents.length === 0) app.documents.add();
    var doc = app.activeDocument;
    var spot;
    try {
        spot = doc.spots.getByName(record.name);
    } catch (err) {
        spot = doc.spots.add();
        spot.name = record.name;
    }
    spot.colorType = ColorModel.SPOT;
    try {
        spot.color = SCA_makeIllustratorRGB(record);
    } catch (err2) {
        spot.color = SCA_makeIllustratorCMYK(record);
    }
    return spot;
}

function SCA_illustratorSpotFill(record) {
    var spot = SCA_illustratorSpot(record);
    var color = new SpotColor();
    color.spot = spot;
    color.tint = 100;
    return color;
}

function SCA_applyFillToItem(item, color) {
    try {
        if (item.typename === "GroupItem") {
            for (var i = 0; i < item.pageItems.length; i++) SCA_applyFillToItem(item.pageItems[i], color);
        } else if (item.typename === "CompoundPathItem") {
            for (var j = 0; j < item.pathItems.length; j++) {
                item.pathItems[j].filled = true;
                item.pathItems[j].fillColor = color;
            }
        } else if (item.typename === "TextFrame") {
            item.textRange.characterAttributes.fillColor = color;
        } else if (item.filled !== undefined) {
            item.filled = true;
            item.fillColor = color;
        }
    } catch (ignore) {}
}

function SCA_addIllustratorSwatch(record) {
    SCA_illustratorSpot(record);
    return "Added Illustrator spot swatch: " + record.name;
}

function SCA_layerUsable(layer) {
    try {
        return layer && layer.visible && !layer.locked && !layer.template;
    } catch (ignore) {}
    return false;
}

function SCA_itemLayer(item) {
    try {
        var current = item;
        while (current && current.parent) {
            if (current.parent.typename === "Layer") return current.parent;
            current = current.parent;
        }
    } catch (ignore) {}
    return null;
}

function SCA_selectedIllustratorLayer(doc) {
    try {
        if (doc.selection && doc.selection.length) return SCA_itemLayer(doc.selection[0]);
    } catch (ignore) {}
    return null;
}

function SCA_getWritableIllustratorLayer(doc, preferSelection) {
    if (preferSelection) {
        var selectedLayer = SCA_selectedIllustratorLayer(doc);
        if (SCA_layerUsable(selectedLayer)) return selectedLayer;
    }
    try {
        if (SCA_layerUsable(doc.activeLayer)) return doc.activeLayer;
    } catch (ignore) {}
    for (var i = 0; i < doc.layers.length; i++) {
        if (SCA_layerUsable(doc.layers[i])) return doc.layers[i];
    }
    var layer = doc.layers.add();
    layer.name = "Codys Colours";
    layer.visible = true;
    layer.locked = false;
    return layer;
}

function SCA_currentIllustratorViewCenter(doc, artboard) {
    try {
        if (doc.views && doc.views.length && doc.views[0].centerPoint) {
            return { x: doc.views[0].centerPoint[0], y: doc.views[0].centerPoint[1] };
        }
    } catch (ignore) {}
    return { x: (artboard[0] + artboard[2]) / 2, y: (artboard[1] + artboard[3]) / 2 };
}

function SCA_applyIllustratorColour(record) {
    var color = SCA_illustratorSpotFill(record);
    var doc = app.activeDocument;
    if (doc.selection && doc.selection.length) {
        for (var i = 0; i < doc.selection.length; i++) SCA_applyFillToItem(doc.selection[i], color);
        return "Applied " + record.name + " to selected artwork.";
    }
    return "Added " + record.name + ". Select artwork to apply it.";
}

function SCA_addIllustratorColourSquare(record) {
    if (app.documents.length === 0) app.documents.add();
    var doc = app.activeDocument;
    var artboardIndex = doc.artboards.getActiveArtboardIndex();
    var artboard = doc.artboards[artboardIndex].artboardRect;
    var size = 72;
    var center = SCA_currentIllustratorViewCenter(doc, artboard);
    var left = center.x - (size / 2);
    var top = center.y + (size / 2);
    var layer = SCA_getWritableIllustratorLayer(doc, true);
    doc.activeLayer = layer;
    var square = layer.pathItems.rectangle(top, left, size, size);
    square.name = record.name + " colour square";
    square.filled = true;
    square.fillColor = SCA_illustratorSpotFill(record);
    square.stroked = false;
    doc.selection = null;
    square.selected = true;
    try {
        square.zOrder(ZOrderMethod.BRINGTOFRONT);
    } catch (ignore) {}
    try {
        app.redraw();
    } catch (ignore2) {}
    return "Added 72 pt colour square using " + record.name + ".";
}

function SCA_photoshopSolid(record) {
    var color = new SolidColor();
    color.rgb.red = record.r;
    color.rgb.green = record.g;
    color.rgb.blue = record.b;
    return color;
}

function SCA_addPhotoshopSwatch(record) {
    var color = SCA_photoshopSolid(record);
    app.foregroundColor = color;
    try {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putClass(charIDToTypeID("Clrs"));
        desc.putReference(charIDToTypeID("null"), ref);
        var colorDesc = new ActionDescriptor();
        colorDesc.putString(charIDToTypeID("Nm  "), record.name);
        var rgbDesc = new ActionDescriptor();
        rgbDesc.putDouble(charIDToTypeID("Rd  "), record.r);
        rgbDesc.putDouble(charIDToTypeID("Grn "), record.g);
        rgbDesc.putDouble(charIDToTypeID("Bl  "), record.b);
        colorDesc.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgbDesc);
        desc.putObject(charIDToTypeID("Usng"), charIDToTypeID("Clrs"), colorDesc);
        executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
        return "Added Photoshop swatch: " + record.name;
    } catch (err) {
        return "Set foreground colour. Photoshop blocked scripted swatch add for " + record.name + ".";
    }
}

function SCA_applyPhotoshopColour(record) {
    app.foregroundColor = SCA_photoshopSolid(record);
    return "Set Photoshop foreground colour: " + record.name;
}

function SCA_addSwatch(payload) {
    var record = SCA_parse(payload);
    if (SCA_isPhotoshop()) return SCA_addPhotoshopSwatch(record);
    if (SCA_isIllustrator()) return SCA_addIllustratorSwatch(record);
    return "Unsupported Adobe host.";
}

function SCA_applyColour(payload) {
    var record = SCA_parse(payload);
    if (SCA_isPhotoshop()) return SCA_applyPhotoshopColour(record);
    if (SCA_isIllustrator()) return SCA_applyIllustratorColour(record);
    return "Unsupported Adobe host.";
}

function SCA_addColourSquare(payload) {
    try {
        var record = SCA_parse(payload);
        if (SCA_isIllustrator()) return SCA_addIllustratorColourSquare(record);
        if (SCA_isPhotoshop()) return "Add Colour Square is an Illustrator artwork feature. Photoshop foreground colour can still be set with Apply / Set.";
        return "Unsupported Adobe host.";
    } catch (err) {
        return "Could not add colour square: " + err;
    }
}

function SCA_addManySwatches(payload) {
    var records = SCA_parse(payload);
    var count = 0;
    for (var i = 0; i < records.length; i++) {
        if (SCA_isPhotoshop()) {
            SCA_addPhotoshopSwatch(records[i]);
        } else if (SCA_isIllustrator()) {
            SCA_addIllustratorSwatch(records[i]);
        }
        count++;
    }
    return "Added " + count + " shown colours.";
}

function SCA_rgbFromIllustratorColor(color) {
    if (!color) return null;
    try {
        if (color.typename === "NoColor") return null;
        if (color.typename === "SpotColor") {
            var basePayload = SCA_rgbFromIllustratorColor(color.spot.color);
            if (!basePayload) return null;
            var tint = SCA_num(color.tint, 100);
            var spotPayload = tint < 99.95 ? SCA_applyTintToPayload(basePayload, tint) : SCA_clonePayload(basePayload);
            spotPayload.ok = true;
            spotPayload.spotName = color.spot.name || "";
            spotPayload.tint = SCA_round(tint, 2);
            spotPayload.colorModel = "Spot";
            spotPayload.colorSource = "Illustrator spot colour";
            if (!spotPayload.cmykSource || spotPayload.cmykSource === "Illustrator CMYK") spotPayload.cmykSource = "Illustrator spot base";
            return spotPayload;
        }
        if (color.typename === "RGBColor") return SCA_payloadFromRgbValues(color.red, color.green, color.blue, "Illustrator RGB");
        if (color.typename === "GrayColor") {
            var gray = Math.round(255 * (1 - color.gray / 100));
            var grayPayload = SCA_payloadFromRgbValues(gray, gray, gray, "Illustrator Gray");
            grayPayload.colorModel = "Gray";
            grayPayload.gray = SCA_round(color.gray, 2);
            grayPayload.cmyk = SCA_cmykObject(0, 0, 0, color.gray);
            grayPayload.cmykSource = "Illustrator Gray";
            return grayPayload;
        }
        if (color.typename === "CMYKColor") {
            return SCA_payloadFromCmykValues(color.cyan, color.magenta, color.yellow, color.black, "Illustrator CMYK");
        }
        if (color.typename === "LabColor") {
            return SCA_payloadFromLabValues(color.l, color.a, color.b, "Illustrator Lab");
        }
    } catch (ignore) {}
    return null;
}

function SCA_spotNameFromIllustratorColor(color) {
    try {
        if (color && color.typename === "SpotColor" && color.spot && color.spot.name) return color.spot.name;
    } catch (ignore) {}
    return "";
}

function SCA_colorFromIllustratorItem(item) {
    if (!item) return null;
    try {
        if (item.typename === "GroupItem") {
            for (var i = 0; i < item.pageItems.length; i++) {
                var groupColor = SCA_colorFromIllustratorItem(item.pageItems[i]);
                if (groupColor) return groupColor;
            }
        }
        if (item.typename === "CompoundPathItem") {
            for (var j = 0; j < item.pathItems.length; j++) {
                var compoundColor = SCA_colorFromIllustratorItem(item.pathItems[j]);
                if (compoundColor) return compoundColor;
            }
        }
        if (item.typename === "TextFrame") {
            return item.textRange.characterAttributes.fillColor;
        }
        if (item.filled && item.fillColor) return item.fillColor;
        if (item.stroked && item.strokeColor) return item.strokeColor;
        if (item.fillColor) return item.fillColor;
        if (item.strokeColor) return item.strokeColor;
    } catch (ignore) {}
    return null;
}

function SCA_getIllustratorCurrentColor() {
    if (app.documents.length === 0) return { ok: false, message: "Open an Illustrator document first." };
    var doc = app.activeDocument;
    if (!doc.selection || !doc.selection.length) return { ok: false, message: "Select an Illustrator object or use the eyedropper, then press Find." };
    var item = doc.selection[0];
    var color = SCA_colorFromIllustratorItem(item);
    var rgb = SCA_rgbFromIllustratorColor(color);
    if (!rgb) return { ok: false, message: "Could not read a solid fill or stroke colour from the selected object." };
    var spotName = SCA_spotNameFromIllustratorColor(color);
    if (spotName) rgb.spotName = spotName;
    return rgb;
}

function SCA_getPhotoshopCurrentColor() {
    var color = app.foregroundColor;
    var rgb = color.rgb;
    var payload = { ok: true, r: Math.round(rgb.red), g: Math.round(rgb.green), b: Math.round(rgb.blue), colorModel: "RGB", colorSource: "Photoshop foreground colour" };
    try {
        payload.cmyk = SCA_cmykObject(color.cmyk.cyan, color.cmyk.magenta, color.cmyk.yellow, color.cmyk.black);
        payload.cmykSource = "Photoshop profile conversion";
    } catch (ignore) {
        payload.cmyk = SCA_rgbToCmykFallback(payload.r, payload.g, payload.b);
        payload.cmykSource = "RGB approximation";
    }
    try {
        payload.lab = SCA_labObject(color.lab.l, color.lab.a, color.lab.b);
    } catch (ignore2) {}
    return payload;
}

function SCA_getCurrentColor(payload) {
    if (SCA_isPhotoshop()) return SCA_stringify(SCA_getPhotoshopCurrentColor());
    if (SCA_isIllustrator()) return SCA_stringify(SCA_getIllustratorCurrentColor());
    return SCA_stringify({ ok: false, message: "Unsupported Adobe host." });
}

function SCA_addExtractedIllustratorColor(color, colors, seen) {
    var rgb = SCA_rgbFromIllustratorColor(color);
    if (!rgb) return;
    var spotName = SCA_spotNameFromIllustratorColor(color);
    if (spotName) rgb.spotName = spotName;
    var key = (spotName || "") + "|" + rgb.r + "|" + rgb.g + "|" + rgb.b;
    if (seen[key]) return;
    seen[key] = true;
    colors.push(rgb);
}

function SCA_collectIllustratorItemColors(item, colors, seen) {
    if (!item || colors.length >= 48) return;
    try {
        if (item.typename === "GroupItem") {
            for (var i = 0; i < item.pageItems.length; i++) SCA_collectIllustratorItemColors(item.pageItems[i], colors, seen);
            return;
        }
        if (item.typename === "CompoundPathItem") {
            for (var j = 0; j < item.pathItems.length; j++) SCA_collectIllustratorItemColors(item.pathItems[j], colors, seen);
            return;
        }
        if (item.typename === "TextFrame") {
            SCA_addExtractedIllustratorColor(item.textRange.characterAttributes.fillColor, colors, seen);
            return;
        }
        if (item.filled && item.fillColor) SCA_addExtractedIllustratorColor(item.fillColor, colors, seen);
        if (item.stroked && item.strokeColor) SCA_addExtractedIllustratorColor(item.strokeColor, colors, seen);
    } catch (ignore) {}
}

function SCA_extractIllustratorSelectionColors() {
    if (app.documents.length === 0) return { ok: false, message: "Open an Illustrator document first." };
    var doc = app.activeDocument;
    if (!doc.selection || !doc.selection.length) return { ok: false, message: "Select artwork first." };
    var colors = [];
    var seen = {};
    for (var i = 0; i < doc.selection.length; i++) SCA_collectIllustratorItemColors(doc.selection[i], colors, seen);
    if (!colors.length) return { ok: false, message: "No solid fill or stroke colours found in the selection." };
    return { ok: true, colors: colors };
}

function SCA_extractSelectionColors(payload) {
    try {
        if (SCA_isIllustrator()) return SCA_stringify(SCA_extractIllustratorSelectionColors());
        if (SCA_isPhotoshop()) return SCA_stringify({ ok: true, colors: [SCA_getPhotoshopCurrentColor()] });
        return SCA_stringify({ ok: false, message: "Unsupported Adobe host." });
    } catch (err) {
        return SCA_stringify({ ok: false, message: "Could not extract colours: " + err });
    }
}

var SCA_PICK_TARGET_NAME = "__CodysColoursPickerTarget";

function SCA_findIllustratorPickTarget(doc) {
    if (!doc) return null;
    for (var i = doc.pageItems.length - 1; i >= 0; i--) {
        try {
            if (doc.pageItems[i].name === SCA_PICK_TARGET_NAME) return doc.pageItems[i];
        } catch (ignore) {}
    }
    return null;
}

function SCA_activateIllustratorEyedropperTool() {
    try {
        app.executeMenuCommand("Eyedropper Tool");
        return true;
    } catch (err) {
        try {
            app.selectTool("Adobe Eyedropper Tool");
            return true;
        } catch (err2) {}
    }
    return false;
}

function SCA_removeIllustratorPickTargets() {
    if (app.documents.length === 0) return 0;
    var doc = app.activeDocument;
    var removed = 0;
    for (var i = doc.pageItems.length - 1; i >= 0; i--) {
        try {
            if (doc.pageItems[i].name === SCA_PICK_TARGET_NAME) {
                doc.pageItems[i].remove();
                removed++;
            }
        } catch (ignore) {}
    }
    return removed;
}

function SCA_keepIllustratorPickerAlive(payload) {
    if (app.documents.length === 0) return { ok: false, message: "Open an Illustrator document first." };
    var doc = app.activeDocument;
    var marker = SCA_findIllustratorPickTarget(doc);
    if (!marker) return { ok: false, message: "The colour picker target is gone. Press Pick again." };
    try {
        doc.selection = null;
        marker.selected = true;
        marker.zOrder(ZOrderMethod.BRINGTOFRONT);
    } catch (ignore) {}
    var activated = SCA_activateIllustratorEyedropperTool();
    try {
        app.redraw();
    } catch (ignore2) {}
    return {
        ok: activated,
        message: activated ? "Picker ready." : "Could not keep Illustrator's Eyedropper active."
    };
}

function SCA_getIllustratorPickerColor(payload) {
    if (app.documents.length === 0) return { ok: false, message: "Open an Illustrator document first." };
    var doc = app.activeDocument;
    var marker = SCA_findIllustratorPickTarget(doc);
    if (!marker) return { ok: false, message: "The colour picker target is gone. Press Pick again." };
    var color = SCA_colorFromIllustratorItem(marker);
    var picked = SCA_rgbFromIllustratorColor(color);
    if (!picked) return { ok: false, message: "No picked colour has been applied yet." };
    picked.pickerTarget = true;
    return picked;
}

function SCA_startIllustratorEyedropperPick() {
    if (app.documents.length === 0) return { ok: false, message: "Open an Illustrator document first, then press Pick." };
    var doc = app.activeDocument;
    SCA_removeIllustratorPickTargets();
    var artboardIndex = doc.artboards.getActiveArtboardIndex();
    var artboard = doc.artboards[artboardIndex].artboardRect;
    var size = 26;
    var center = SCA_currentIllustratorViewCenter(doc, artboard);
    var left = center.x - (size / 2);
    var top = center.y + (size / 2);
    var layer = SCA_getWritableIllustratorLayer(doc, true);
    doc.activeLayer = layer;
    var marker = layer.pathItems.rectangle(top, left, size, size);
    marker.name = SCA_PICK_TARGET_NAME;
    marker.filled = true;
    marker.fillColor = SCA_makeIllustratorRGBValues(238, 238, 238);
    marker.stroked = true;
    marker.strokeWidth = 1;
    marker.strokeColor = SCA_makeIllustratorRGBValues(32, 34, 36);
    doc.selection = null;
    marker.selected = true;
    try {
        marker.zOrder(ZOrderMethod.BRINGTOFRONT);
    } catch (ignore) {}
    var activated = SCA_activateIllustratorEyedropperTool();
    try {
        app.redraw();
    } catch (ignore2) {}
    if (!activated) {
        SCA_removeIllustratorPickTargets();
        return { ok: false, message: "Could not activate Illustrator's Eyedropper tool. Select a coloured object and press Find instead." };
    }
    return {
        ok: true,
        message: "Click colours/objects with the Eyedropper. Codys Colours updates live until you press Cancel Pick.",
        initial: SCA_getIllustratorPickerColor({}),
        targetName: SCA_PICK_TARGET_NAME
    };
}

function SCA_startEyedropperPick(payload) {
    try {
        if (SCA_isPhotoshop()) return SCA_stringify({ ok: false, message: "In Photoshop, use the Eyedropper to set the foreground colour, then press Find." });
        if (SCA_isIllustrator()) return SCA_stringify(SCA_startIllustratorEyedropperPick());
        return SCA_stringify({ ok: false, message: "Unsupported Adobe host." });
    } catch (err) {
        return SCA_stringify({ ok: false, message: "Could not start colour picker: " + err });
    }
}

function SCA_cleanupPickTarget(payload) {
    try {
        if (!SCA_isIllustrator()) return SCA_stringify({ ok: true, removed: 0 });
        return SCA_stringify({ ok: true, removed: SCA_removeIllustratorPickTargets() });
    } catch (err) {
        return SCA_stringify({ ok: false, message: "Could not clean up picker: " + err });
    }
}

function SCA_getPickerColor(payload) {
    try {
        if (SCA_isIllustrator()) return SCA_stringify(SCA_getIllustratorPickerColor(SCA_parse(payload)));
        if (SCA_isPhotoshop()) return SCA_stringify({ ok: false, message: "Photoshop picker uses the foreground colour. Use Find Selection after sampling." });
        return SCA_stringify({ ok: false, message: "Unsupported Adobe host." });
    } catch (err) {
        return SCA_stringify({ ok: false, message: "Could not read picker colour: " + err });
    }
}

function SCA_keepPickerAlive(payload) {
    try {
        if (SCA_isIllustrator()) return SCA_stringify(SCA_keepIllustratorPickerAlive(SCA_parse(payload)));
        return SCA_stringify({ ok: true, message: "No picker keep-alive needed." });
    } catch (err) {
        return SCA_stringify({ ok: false, message: "Could not keep picker active: " + err });
    }
}

function SCA_activateEyedropper(payload) {
    var payloadResult = SCA_parse(SCA_startEyedropperPick(payload));
    return payloadResult.message || "Use Illustrator's Eyedropper tool, then press Find.";
}

function SCA_getDocumentPatterns(payload) {
    if (!SCA_isIllustrator()) return SCA_stringify({ ok: false, message: "Document pattern scanning is available in Illustrator." });
    if (app.documents.length === 0) return SCA_stringify({ ok: false, message: "Open an Illustrator document first." });
    var doc = app.activeDocument;
    var patterns = [];
    try {
        for (var i = 0; i < doc.patterns.length; i++) {
            patterns.push({ name: doc.patterns[i].name });
        }
    } catch (err) {
        return SCA_stringify({ ok: false, message: "Could not read Illustrator document patterns." });
    }
    return SCA_stringify({ ok: true, patterns: patterns });
}
