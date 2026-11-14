// Valida archivos de Office con el validador oficial de Microsoft (Open XML SDK).
// Uso: validador [--max N] archivo1.docx archivo2.xlsx ...   Salida: archivo<TAB>errores, y el detalle.
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
int max = 25; var archivos = new List<string>();
for (int i = 0; i < args.Length; i++) { if (args[i] == "--max") max = int.Parse(args[++i]); else archivos.Add(args[i]); }
int total = 0;
foreach (var ruta in archivos) {
    try {
        var ext = Path.GetExtension(ruta).ToLowerInvariant();
        using OpenXmlPackage doc = ext switch {
            ".docx" or ".docm" or ".dotx" => WordprocessingDocument.Open(ruta, false),
            ".xlsx" or ".xlsm" or ".xltx" => SpreadsheetDocument.Open(ruta, false),
            _ => PresentationDocument.Open(ruta, false) };
        var v = new OpenXmlValidator(FileFormatVersions.Microsoft365);
        var errores = v.Validate(doc).ToList(); total += errores.Count;
        Console.WriteLine($"{ruta}\t{errores.Count}");
        foreach (var e in errores.Take(max))
            Console.WriteLine($"   [{e.ErrorType}] {e.Part?.Uri} {e.Path?.XPath} :: {e.Description}");
    } catch (Exception ex) { Console.WriteLine($"{ruta}\tNO ABRE: {ex.GetType().Name}: {ex.Message}"); total++; }
}
return total > 0 ? 1 : 0;
