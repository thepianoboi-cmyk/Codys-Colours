/*
  Codys Colours public fallback helper for Adobe Illustrator.
  The full workflow is in Window > Extensions (Legacy) > Codys Colours.
*/

(function () {
    if (app.documents.length === 0) {
        app.documents.add();
    }
    alert("Codys Colours is installed as a CEP panel.\n\nOpen it from Window > Extensions (Legacy) > Codys Colours, then import your own authorised CSV or JSON colour library from the panel.");
})();
